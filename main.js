'use strict';

/*
 * Created with @iobroker/create-adapter v1.31.0
 */

const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const crc = require('crc');
const net = require('net');

const _methods = require('./lib/methods');

const myRequests = require('./lib/constants').myRequests;
/* eslint-disable @typescript-eslint/no-unused-vars */
const byd_stat_tower = require('./lib/constants').byd_stat_tower;
const myINVs = require('./lib/constants').myINVs;
const myINVsLVS = require('./lib/constants').myINVsLVS;

const socket = new net.Socket();
/**
 * The adapter instance
 *
 */
let myState; // Aktueller Status
let hvsSOC;
let hvsMaxVolt;
let hvsMinVolt;
let hvsSOH;
/**
 * Removed attributes because they can now occour mor than once.
 * let hvsMaxmVolt;
 * let hvsMinmVolt;
 * let hvsMaxmVoltCell;
 * let hvsMinmVoltCell;
 * let hvsMaxTempCell;
 * let hvsMinTempCell;
 * let hvsSOCDiagnosis;
 * const hvsBatteryVoltsperCell = [];
 * const hvsBatteryTempperCell = [];
 */
let towerAttributes = [];

let hvsA;
let hvsBattVolt;
let hvsMaxTemp;
let hvsMinTemp;
let hvsBatTemp;
let hvsOutVolt;
let hvsChargeTotal;
let hvsDischargeTotal;
let hvsETA;
let hvsError;
let hvsModules;
let hvsTowers;
let hvsDiffVolt;
let hvsPower;
let hvsBattType;
let hvsBattType_fromSerial;
let hvsInvType;
let hvsInvType_String;
let hvsNumCells; //number of cells in system
let hvsNumTemps; // number of temperatures to count with
let ConfBatDetailshowoften;
let ConfBydTowerCount;
let confBatPollTime;
let myNumberforDetails;
let ConfTestMode;
let _firstRun = false;

let hvsSerial;
let hvsBMU;
let hvsBMUA;
let hvsBMUB;
let hvsBMS;
let hvsGrid;
let hvsErrorString;
let hvsParamT;

let ConfBatDetails;
let ConfOverridePollInterval = 0;

/*const myStates = [
    "no state",
    "waiting for initial connect",
    "waiting for 1st answer",
    "waiting for 2nd answer"

];*/

let idInterval1 = 0;

const myBattTypes = ['HVL', 'HVM', 'HVS'];
/* HVM: 16 cells per module
   HVS: 32 cells per module
   HVL: unknown so I count 0 cells per module
*/

class bydhvsControll extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'bydhvs',
        });

        this.on('ready', this.onReady.bind(this));
        //      this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        //first check account settings
        this.setState('info.connection', false, true);
        this.setState('info.socketConnection', false, true);

        this.buf2int16SI = _methods.buf2int16SI.bind(this);
        this.buf2int16US = _methods.buf2int16US.bind(this);
        this.buf2int32US = _methods.buf2int32US.bind(this);
        this.decodePacketNOP = _methods.decodePacketNOP.bind(this);
        this.countSetBits = _methods.countSetBits.bind(this);

        this.setStateAsync(`info.socketConnection`, false, true);

        this.initData();

        this.log.info('starte polling');
        this.startQuery();
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback
     */
    onUnload(callback) {
        try {
            clearTimeout(idInterval1);
            socket.destroy();
            this.log.info('Adapter bluelink cleaned up everything...');
            callback();
        } catch (error) {
            callback();
        }
    }

    initData() {
        this.setObjects();

        myState = 0;

        ConfOverridePollInterval = this.config.ConfOverridePollInterval ? this.config.ConfOverridePollInterval : 0;

        if (ConfOverridePollInterval == 0) {
            confBatPollTime = parseInt(this.config.ConfPollInterval);
        } else {
            const OverridePollState = this.getState('System.OverridePoll');
            confBatPollTime = OverridePollState ? OverridePollState.val : 60;
        }

        if (confBatPollTime < 3) {
            //confBatPollTime = 60;
            this.log.warn('poll to often - recommendation is not more than every 3 seconds');
        }

        ConfBydTowerCount = this.config.ConfBydTowerCount ? this.config.ConfBydTowerCount : 1;
        ConfBatDetails = this.config.ConfBatDetails ? true : false;
        ConfBatDetailshowoften = parseInt(this.config.ConfDetailshowoften);
        ConfTestMode = this.config.ConfTestMode ? true : false;
        myNumberforDetails = ConfBatDetailshowoften;

        this.log.info(`BYD IP Adress: ${this.config.ConfIPAdress}`);
        this.log.info(`Bat Details  : ${this.config.ConfBatDetails}`);
        this.log.info(`Tower count: ${this.config.ConfBydTowerCount}`);
        this.log.info(
            `Override Poll, so use from state and not from settings: ${this.config.ConfOverridePollInterval}`,
        );
        this.log.info(`Battery Poll Time: ${confBatPollTime}`);
        this.log.info(`BatDetailshowoften: ${ConfBatDetailshowoften}`);
        this.log.silly(`TestMode= ${ConfTestMode}`);
    }

    async checkandrepairUnit(id, NewUnit, NewRole, newName) {
        //want to test and understand async and await, so it's introduced here.
        //check for forgotten unit in first version and if it's missing add unit.
        try {
            const obj = await this.getObjectAsync(id);
            if (NewUnit != '') {
                if (obj.common.unit != NewUnit) {
                    this.extendObject(id, { common: { unit: NewUnit } });
                }
            }
            if (obj.common.role == '') {
                this.extendObject(id, { common: { role: NewRole } });
            }
            if (newName != '') {
                if (obj.common.name != newName) {
                    this.extendObject(id, { common: { name: newName } });
                }
            }
        } catch {
            //dann eben nicht.
        }
    }

    checkPacket(data) {
        const byteArray = new Uint8Array(data);
        const packetLength = data[2] + 5; // 3 header, 2 crc
        if (byteArray[0] != 1) {
            return false;
        }
        if (byteArray[1] === 3) {
            //habe die Kodierung der Antwort mit 1 an zweiter Stelle nicht verstanden, daher hier keine Längenprüfung
            if (packetLength != byteArray.length) {
                return false;
            }
        } else {
            if (byteArray[1] != 16) {
                return false;
            }
        }
        return crc.crc16modbus(byteArray) === 0;
    }

    pad(n, width, z) {
        z = z || '0';
        n = `${n}`;
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }

    setObjects() {
        let myObjects = [
            ['System.Serial', 'state', 'Serial number', 'string', 'text', true, false, ''],
            ['System.BMU', 'state', 'F/W BMU', 'string', 'text', true, false, ''],
            ['System.BMS', 'state', 'F/W BMS', 'string', 'text', true, false, ''],
            ['System.BMUBankA', 'state', 'F/W BMU-BankA', 'string', 'text', true, false, ''],
            ['System.BMUBankB', 'state', 'F/W BMU-BankB', 'string', 'text', true, false, ''],
            ['System.Modules', 'state', 'modules (count)', 'number', 'value', true, false, ''],
            ['System.Towers', 'state', 'towers (count)', 'number', 'value', true, false, ''],
            ['System.Grid', 'state', 'Parameter Table', 'string', 'text', true, false, ''],
            ['System.ParamT', 'state', 'F/W BMU', 'string', 'text', true, false, ''],
            ['System.BattType', 'state', 'Battery Type', 'string', 'text', true, false, ''],
            ['System.InvType', 'state', 'Inverter Type', 'string', 'text', true, false, ''],
            ['State.SOC', 'state', 'SOC', 'number', 'value.battery', true, false, '%'],
            ['State.VoltMax', 'state', 'Max Cell Voltage', 'number', 'value.voltage', true, false, 'V'],
            ['State.VoltMin', 'state', 'Min Cell Voltage', 'number', 'value.voltage', true, false, 'V'],
            ['State.SOH', 'state', 'SOH', 'number', 'value.battery', true, false, '%'],
            ['State.Current', 'state', 'Charge / Discharge Current', 'number', 'value.current', true, false, 'A'],
            ['State.Power_Consumption', 'state', 'Charge Power', 'number', 'value.power', true, false, 'W'],
            ['State.Power_Delivery', 'state', 'Discharge Power', 'number', 'value.power', true, false, 'W'],
            ['State.VoltBatt', 'state', 'Battery Voltage', 'number', 'value.voltage', true, false, 'V'],
            ['State.TempMax', 'state', 'Max Cell Temp', 'number', 'value.temperature', true, false, '°C'],
            ['State.TempMin', 'state', 'Min Cell Temp', 'number', 'value.temperature', true, false, '°C'],
            ['State.VoltDiff', 'state', 'Max - Min Cell Voltage', 'number', 'value.temperature', true, false, 'V'],
            ['State.Power', 'state', 'Power', 'number', 'value.power', true, false, 'W'],
            ['State.TempBatt', 'state', 'Battery Temperature', 'number', 'value.temperature', true, false, '°C'],
            ['State.VoltOut', 'state', 'Output Voltage', 'number', 'value.voltage', true, false, 'V'],
            ['System.ErrorNum', 'state', 'Error (numeric)', 'number', 'value', true, false, ''],
            ['System.ErrorStr', 'state', 'Error (string)', 'string', 'text', true, false, ''],
            ['System.ChargeTotal', 'state', 'Total Charge of the system', 'number', 'value.energy', true, false, 'Wh'],
            [
                'System.DischargeTotal',
                'state',
                'Total Discharge of the system',
                'number',
                'value.energy',
                true,
                false,
                'Wh',
            ],
            ['System.ETA', 'state', 'Efficiency of in percent', 'number', 'value', true, false, ''],
            ['System.OverridePoll', 'state', 'Poll interval if set per state', 'number', 'value', true, true, ''],
        ];

        const rawObjects = [
            ['System.Raw_00', 'state', 'Raw Message of sequence 00', 'string', 'text', true, false, ''],
            ['System.Raw_01', 'state', 'Raw Message of sequence 01', 'string', 'text', true, false, ''],
            ['System.Raw_02', 'state', 'Raw Message of sequence 02', 'string', 'text', true, false, ''],
        ];
        if (this.config.ConfStoreRawMessages) {
            myObjects = myObjects.concat(rawObjects);
        }

        for (let i = 0; i < myObjects.length; i++) {
            this.setObjectNotExists(myObjects[i][0], {
                type: myObjects[i][1],
                common: {
                    name: myObjects[i][2],
                    type: myObjects[i][3],
                    role: myObjects[i][4],
                    read: myObjects[i][5],
                    write: myObjects[i][6],
                    unit: myObjects[i][7], //works only for new objects, so check later for existing objects
                },
                native: {},
            });
        }
        //repair forgotten units in first version and required roles
        for (const myObject of myObjects) {
            //console.log("****extend " + i + " " + myObjects[i][0] + " " + myObjects[i][7]);
            this.checkandrepairUnit(myObject[0], myObject[7], myObject[4], myObject[2]);
        }
    }

    setStates() {
        let ObjTowerString = '';

        this.log.silly(`hvsSerial       >${hvsSerial}<
                        hvsBMU          >${hvsBMU}<;
                        hvsBMUA         >${hvsBMUA}<;
                        hvsBMUB         >${hvsBMUB}<;
                        hvsBMS          >${hvsBMS}<;
                        hvsModules      >${hvsModules}<;
                        hvsGrid         >${hvsGrid}<;
                        hvsSOC          >${hvsSOC}<;
                        hvsMaxVolt      >${hvsMaxVolt}<;
                        hvsMinVolt      >${hvsMinVolt}<;
                        hvsSOH          >${hvsSOH}<;
                        hvsA            >${hvsA}<;
                        hvsBattVolt     >${hvsBattVolt}<;
                        hvsMaxTemp      >${hvsMaxTemp}<;
                        hvsMinTemp      >${hvsMinTemp}<;
                        hvsDiffVolt     >${hvsDiffVolt}<;
                        hvsPower        >${hvsPower}<;
                        hvsParamT       >${hvsParamT}<;
                        hvsBatTemp      >${hvsBatTemp}<;
                        hvsOutVolt      >${hvsOutVolt}<,
                        hvsError        >${hvsError}<,
                        hvsErrorStr     >${hvsErrorString}<,
                        BattType        >${hvsBattType_fromSerial}<,
                        Invert. Type    >${hvsInvType_String}, Nr: ${hvsInvType}<`);

        this.setState('System.Serial', hvsSerial, true);
        this.setState('System.BMU', hvsBMU, true);
        this.setState('System.BMUBankA', hvsBMUA, true);
        this.setState('System.BMUBankB', hvsBMUB, true);
        this.setState('System.BMS', hvsBMS, true);
        this.setState('System.Modules', hvsModules, true);
        this.setState('System.Towers', hvsTowers, true);
        this.setState('System.Grid', hvsGrid, true);
        this.setState('State.SOC', hvsSOC, true);
        this.setState('State.VoltMax', hvsMaxVolt, true);
        this.setState('State.VoltMin', hvsMinVolt, true);
        this.setState('State.SOH', hvsSOH, true);
        this.setState('State.Current', hvsA, true);
        this.setState('State.VoltBatt', hvsBattVolt, true);
        this.setState('State.TempMax', hvsMaxTemp, true);
        this.setState('State.TempMin', hvsMinTemp, true);
        this.setState('State.VoltDiff', hvsDiffVolt, true);
        this.setState('State.Power', hvsPower, true /*ack*/);
        this.setState('System.ParamT', hvsParamT, true);
        this.setState('State.TempBatt', hvsBatTemp, true);
        this.setState('State.VoltOut', hvsOutVolt, true);
        this.setState('System.ErrorNum', hvsError, true);
        this.setState('System.ErrorStr', hvsErrorString, true);

        if (hvsPower >= 0) {
            this.setState('State.Power_Consumption', hvsPower, true);
            this.setState('State.Power_Delivery', 0, true);
        } else {
            this.setState('State.Power_Consumption', 0, true);
            this.setState('State.Power_Delivery', -hvsPower, true);
        }

        this.setState('System.BattType', hvsBattType_fromSerial, true);
        this.setState('System.InvType', hvsInvType_String, true);
        this.setState('System.ChargeTotal', hvsChargeTotal, true);
        this.setState('System.DischargeTotal', hvsDischargeTotal, true);
        this.setState('System.ETA', hvsETA, true);

        if (myNumberforDetails == 0) {
            // For every tower
            this.log.silly(`Tower attributes: ${JSON.stringify(towerAttributes)}`);
            for (let t = 0; t < towerAttributes.length; t++) {
                try {
                    if (ConfBydTowerCount > 1) {
                        ObjTowerString = `.Tower_${t + 1}`;
                    }

                    // Test if all required msg received.
                    if (towerAttributes[t].hvsMaxmVolt) {
                        this.setState(`Diagnosis${ObjTowerString}.mVoltMax`, towerAttributes[t].hvsMaxmVolt, true);
                        this.setState(`Diagnosis${ObjTowerString}.mVoltMin`, towerAttributes[t].hvsMinmVolt, true);
                        this.setState(
                            `Diagnosis${ObjTowerString}.mVoltMaxCell`,
                            towerAttributes[t].hvsMaxmVoltCell,
                            true,
                        );
                        this.setState(
                            `Diagnosis${ObjTowerString}.mVoltMinCell`,
                            towerAttributes[t].hvsMinmVoltCell,
                            true,
                        );
                        this.setState(`Diagnosis${ObjTowerString}.TempMax`, towerAttributes[t].hvsMaxmTemp, true);
                        this.setState(`Diagnosis${ObjTowerString}.TempMin`, towerAttributes[t].hvsMinmTemp, true);
                        this.setState(
                            `Diagnosis${ObjTowerString}.TempMaxCell`,
                            towerAttributes[t].hvsMaxTempCell,
                            true,
                        );
                        this.setState(
                            `Diagnosis${ObjTowerString}.TempMinCell`,
                            towerAttributes[t].hvsMinTempCell,
                            true,
                        );
                        this.setState(`Diagnosis${ObjTowerString}.ChargeTotal`, towerAttributes[t].chargeTotal, true);
                        this.setState(
                            `Diagnosis${ObjTowerString}.DischargeTotal`,
                            towerAttributes[t].dischargeTotal,
                            true,
                        );
                        this.setState(`Diagnosis${ObjTowerString}.ETA`, towerAttributes[t].eta, true);
                        this.setState(`Diagnosis${ObjTowerString}.BatteryVolt`, towerAttributes[t].batteryVolt, true);
                        this.setState(`Diagnosis${ObjTowerString}.OutVolt`, towerAttributes[t].outVolt, true);
                        this.setState(`Diagnosis${ObjTowerString}.SOC`, towerAttributes[t].hvsSOCDiagnosis, true);
                        this.setState(`Diagnosis${ObjTowerString}.SOH`, towerAttributes[t].soh, true);
                        this.setState(`Diagnosis${ObjTowerString}.State`, towerAttributes[t].state, true);
                        this.setState(`Diagnosis${ObjTowerString}.BalancingCells`, towerAttributes[t].balancing, true);
                        this.setState(
                            `Diagnosis${ObjTowerString}.BalancingCellsCount`,
                            towerAttributes[t].balancingcount,
                            true,
                        );

                        this.log.debug(`Tower_${t + 1} balancing     >${towerAttributes[t].balancing}<`);
                        this.log.debug(`Tower_${t + 1} balcount      >${towerAttributes[t].balancingcount}<`);

                        if (t == 0) {
                            this.setState(
                                `Diagnosis${ObjTowerString}.BalancingOne`,
                                towerAttributes[t].balancing ? towerAttributes[t].balancing : '',
                                true,
                            );
                            this.setState(
                                `Diagnosis${ObjTowerString}.BalancingCountOne`,
                                towerAttributes[t].balancingcount,
                                true,
                            );
                        } else {
                            this.setState(
                                `Diagnosis${ObjTowerString}.BalancingTwo`,
                                towerAttributes[t].balancing ? towerAttributes[t].balancing : '',
                                true,
                            );
                            this.setState(
                                `Diagnosis${ObjTowerString}.BalancingCountTwo`,
                                towerAttributes[t].balancingcount,
                                true,
                            );
                        }
                        /*
                        if (towerAttributes[t].balancing)          this.setState(`Diagnosis` + ObjTowerString + `.BalancingOne`,     towerAttributes[t].balancing_one, true);
                        if (towerAttributes[t].balancingcount_one)  this.setState(`Diagnosis` + ObjTowerString + `.BalancingOne`,     towerAttributes[t].balancing_one, true);
                        this.setState(`Diagnosis` + ObjTowerString + `.BalancingTwo`,     towerAttributes[t].balancing_two ?      towerAttributes[t].balancing_two : "", true);
                        this.setState(`Diagnosis` + ObjTowerString + `.BalancingCountTwo`, towerAttributes[t].balancingcount_two ? towerAttributes[t].balancingcount_two : 0, true );
    */
                        for (let i = 1; i <= hvsNumCells; i++) {
                            this.setState(
                                `CellDetails${ObjTowerString}.CellVolt${this.pad(i, 3)}`,
                                towerAttributes[t].hvsBatteryVoltsperCell[i]
                                    ? towerAttributes[t].hvsBatteryVoltsperCell[i]
                                    : 0,
                                true,
                            );
                        }
                        const mVoltDefDeviation = this.calcDeviation(
                            towerAttributes[t].hvsBatteryVoltsperCell.filter(v => v > 0),
                        );
                        const mVoltMean = this.calcAverage(
                            towerAttributes[t].hvsBatteryVoltsperCell.filter(v => v > 0),
                        );
                        this.setState(`Diagnosis${ObjTowerString}.mVoltDefDeviation`, mVoltDefDeviation, true);
                        this.setState(`Diagnosis${ObjTowerString}.mVoltMean`, mVoltMean, true);
                        this.setState(
                            `Diagnosis${ObjTowerString}.mVoltGt150DefVar`,
                            towerAttributes[t].hvsBatteryVoltsperCell.filter(
                                v => v > mVoltMean + mVoltDefDeviation * 1.5,
                            ).length,
                            true,
                        );
                        this.setState(
                            `Diagnosis${ObjTowerString}.mVoltLt150DefVar`,
                            towerAttributes[t].hvsBatteryVoltsperCell
                                .filter(v => v > 0)
                                .filter(v => v < mVoltMean - mVoltDefDeviation * 1.5).length,
                            true,
                        );

                        for (let i = 1; i <= hvsNumTemps; i++) {
                            this.setState(
                                `CellDetails${ObjTowerString}.CellTemp${this.pad(i, 3)}`,
                                towerAttributes[t].hvsBatteryTempperCell[i]
                                    ? towerAttributes[t].hvsBatteryTempperCell[i]
                                    : 0,
                                true,
                            );
                        }
                        const tempDefDeviation = this.calcDeviation(
                            towerAttributes[t].hvsBatteryTempperCell.filter(v => v > 0),
                        );
                        const tempMean = this.calcAverage(towerAttributes[t].hvsBatteryTempperCell.filter(v => v > 0));
                        this.setState(`Diagnosis${ObjTowerString}.TempDefDeviation`, tempDefDeviation, true);
                        this.setState(`Diagnosis${ObjTowerString}.TempMean`, tempMean, true);
                        this.setState(
                            `Diagnosis${ObjTowerString}.TempGt150DefVar`,
                            towerAttributes[t].hvsBatteryTempperCell.filter(v => v > tempMean + tempDefDeviation * 1.5)
                                .length,
                            true,
                        );
                        this.setState(
                            `Diagnosis${ObjTowerString}.TempLt150DefVar`,
                            towerAttributes[t].hvsBatteryTempperCell
                                .filter(v => v > 0)
                                .filter(v => v < tempMean - tempDefDeviation * 1.5).length,
                            true,
                        );

                        this.log.silly(`Tower_${t + 1} hvsMaxmVolt     >${towerAttributes[t].hvsMaxmVolt}<`);
                        this.log.silly(`Tower_${t + 1} hvsMinmVolt     >${towerAttributes[t].hvsMinmVolt}<`);
                        this.log.silly(`Tower_${t + 1} hvsMaxmVoltCell >${towerAttributes[t].hvsMaxmVoltCell}<`);
                        this.log.silly(`Tower_${t + 1} hvsMinmVoltCell >${towerAttributes[t].hvsMinmVoltCell}<`);
                        this.log.silly(`Tower_${t + 1} hvsMaxTempCell  >${towerAttributes[t].hvsMaxTempCell}<`);
                        this.log.silly(`Tower_${t + 1} hvsMinTempCell  >${towerAttributes[t].hvsMinTempCell}<`);
                        this.log.silly(`Tower_${t + 1} hvsSOC (Diag)   >${towerAttributes[t].hvsSOCDiagnosis}<`);
                    }
                } catch (err) {
                    if (err instanceof Error) {
                        this.log.error(`Cant read in Tower ${t} with ${err.message}`);
                    } else {
                        this.log.error(`Cant read in Tower ${t} with unknown error`);
                    }
                }
            }
        }
    }

    startQuery() {
        //erster Start sofort (500ms), dann entsprechend der Config - dann muss man nicht beim Entwickeln warten bis der erste Timer durch ist.
        _firstRun = true;

        const runPoll = () => this.pollQuery();

        // Start direkt nach 500ms
        setTimeout(runPoll, 500);

        // Danach zyklisch gemäß Konfiguration
        idInterval1 = setInterval(runPoll, confBatPollTime * 1000);
        this.log.info(`gestartet pollTime :${confBatPollTime} intervalId :${idInterval1}`);
    }

    async setupIPClientHandlers() {
        const waitTime = 8000;
        const timeout = 2000;
    
        this.log.debug('Starte Datenabfrage via TCP-Client...');
    
        return new Promise(resolve => {
            const cleanup = () => {
                this.log.debug('Schließe Socket-Verbindung und setze State zurück');
                socket.destroy();
                myState = 0;
            };
    
            const sendRequest = (requestIndex, nextState, delay = 200) => {
                return new Promise(res => {
                    setTimeout(() => {
                        this.log.debug(`→ Sende Request [${requestIndex}] und wechsle in State ${nextState}`);
                        myState = nextState;
                        socket.write(myRequests[requestIndex]);
                        res();
                    }, delay);
                });
            };
    
            const waitForData = () => {
                return new Promise((res, rej) => {
                    socket.once('data', data => {
                        this.log.debug(`← Daten empfangen (Länge: ${data.length}) in State ${myState}`);
                        res(data);
                    });
                    socket.once('timeout', () => rej(new Error('Socket Timeout')));
                    socket.once('error', err => rej(err));
                });
            };
    
            socket.setTimeout(timeout);
    
            try {
                socket.connect(8080, this.config.ConfIPAdress, async () => {
                    this.log.debug(`Socket verbunden mit ${this.config.ConfIPAdress}:8080`);
                    try {
                        myState = 2;
                        await sendRequest(0, 2);
    
                        while (true) {
                            const data = await waitForData();
    
                            if (!this.checkPacket(data)) {
                                this.log.warn(`⚠️ Ungültiges Paket empfangen in State ${myState}`);
                                this.setStateChanged('info.connection', { val: false, ack: true });
                                cleanup();
                                return resolve(false);
                            }
    
                            this.setStateChanged('info.connection', { val: true, ack: true });
    
                            switch (myState) {
                                case 2:
                                    this.log.debug('➡️ State 2: Verarbeite Paket 0');
                                    this.decodePacket0(data);
                                    socket.setTimeout(timeout);
                                    await sendRequest(1, 3);
                                    break;
    
                                case 3:
                                    this.log.debug('➡️ State 3: Verarbeite Paket 1');
                                    this.decodePacket1(data);
                                    socket.setTimeout(timeout);
                                    await sendRequest(2, 4);
                                    break;
    
                                case 4:
                                    this.log.debug('➡️ State 4: Verarbeite Paket 2');
                                    this.decodePacket2(data);
                                    if (myNumberforDetails < ConfBatDetailshowoften || !ConfBatDetails) {
                                        this.log.debug('⚡ Details nicht notwendig – beende Zyklus');
                                        this.setStates();
                                        cleanup();
                                        return resolve(true);
                                    }
                                    myNumberforDetails = 0;
                                    socket.setTimeout(timeout);
                                    await sendRequest(3, 5);
                                    break;
    
                                case 5:
                                    this.log.debug('➡️ State 5: NOP + Wartezeit');
                                    this.decodePacketNOP(data);
                                    socket.setTimeout(waitTime + timeout);
                                    await new Promise(res => setTimeout(res, waitTime));
                                    await sendRequest(4, 6, 0);
                                    break;
    
                                case 6:
                                    this.log.debug('➡️ State 6: NOP');
                                    this.decodePacketNOP(data);
                                    await sendRequest(5, 7);
                                    break;
    
                                case 7:
                                    this.log.debug('➡️ State 7: Paket 5');
                                    this.decodePacket5(data);
                                    await sendRequest(6, 8);
                                    break;
    
                                case 8:
                                    this.log.debug('➡️ State 8: Paket 6');
                                    this.decodePacket6(data);
                                    await sendRequest(7, 9);
                                    break;
    
                                case 9:
                                    this.log.debug('➡️ State 9: Paket 7');
                                    this.decodePacket7(data);
                                    await sendRequest(8, 10);
                                    break;
    
                                case 10:
                                    this.log.debug('➡️ State 10: Paket 8');
                                    this.decodePacket8(data);
                                    if (hvsNumCells > 128) {
                                        this.log.debug('Mehr als 128 Zellen erkannt → sende weiteres Paket');
                                        await sendRequest(9, 11);
                                    } else if (ConfBydTowerCount > 1) {
                                        this.log.debug('Mehrere Tower erkannt → Wechsel zu State 16');
                                        await sendRequest(16, 16);
                                    } else {
                                        this.log.debug('Alle Daten empfangen, beende...');
                                        this.setStates();
                                        cleanup();
                                        return resolve(true);
                                    }
                                    break;
    
                                case 11:
                                    this.log.debug('➡️ State 11: NOP');
                                    this.decodePacketNOP(data);
                                    await sendRequest(10, 12);
                                    break;
    
                                case 12:
                                    this.log.debug('➡️ State 12: NOP + Wartezeit');
                                    this.decodePacketNOP(data);
                                    socket.setTimeout(8000);
                                    await new Promise(res => setTimeout(res, 3000));
                                    await sendRequest(11, 13, 0);
                                    break;
    
                                case 13:
                                    this.log.debug('➡️ State 13: NOP');
                                    this.decodePacketNOP(data);
                                    await sendRequest(12, 14);
                                    break;
    
                                case 14:
                                    this.log.debug('➡️ State 14: Response12');
                                    this.decodeResponse12(data);
                                    await sendRequest(13, 15);
                                    break;
    
                                case 15:
                                    this.log.debug('➡️ State 15: Response13');
                                    this.decodeResponse13(data);
                                    if (ConfBydTowerCount > 1) {
                                        await sendRequest(16, 16);
                                    } else {
                                        this.log.debug('Beende nach Response13');
                                        this.setStates();
                                        cleanup();
                                        return resolve(true);
                                    }
                                    break;
    
                                case 16:
                                    this.log.debug('➡️ State 16: Zweiter Tower – NOP + Wartezeit');
                                    this.decodePacketNOP(data);
                                    socket.setTimeout(waitTime + timeout);
                                    await new Promise(res => setTimeout(res, waitTime));
                                    await sendRequest(4, 17, 0);
                                    break;
    
                                case 17:
                                    this.log.debug('➡️ State 17: NOP');
                                    this.decodePacketNOP(data);
                                    await sendRequest(5, 18);
                                    break;
    
                                case 18:
                                    this.log.debug('➡️ State 18: Paket 5 (Tower 2)');
                                    this.decodePacket5(data, 1);
                                    await sendRequest(6, 19);
                                    break;
    
                                case 19:
                                    this.log.debug('➡️ State 19: Paket 6 (Tower 2)');
                                    this.decodePacket6(data, 1);
                                    await sendRequest(7, 20);
                                    break;
    
                                case 20:
                                    this.log.debug('➡️ State 20: Paket 7 (Tower 2)');
                                    this.decodePacket7(data, 1);
                                    await sendRequest(8, 22);
                                    break;
    
                                case 22:
                                    this.log.debug('➡️ State 22: Paket 8 (Tower 2)');
                                    this.decodePacket8(data, 1);
                                    this.log.debug('✅ Alle Daten erfolgreich verarbeitet');
                                    this.setStates();
                                    cleanup();
                                    return resolve(true);
    
                                default:
                                    this.log.warn(`❓ Unerwarteter Zustand: ${myState}`);
                                    cleanup();
                                    return resolve(false);
                            }
                        }
                    } catch (err) {
                        this.log.error(`❌ Fehler im Ablauf: ${err.message}`);
                        this.log.debug(err.stack);
                        this.setStateChanged('info.connection', { val: false, ack: true });
                        cleanup();
                        return resolve(false);
                    }
                });
            } catch (err) {
                this.log.error(`❌ Socket konnte nicht verbunden werden: ${err.message}`);
                this.log.debug(err.stack);
                this.setStateChanged('info.connection', { val: false, ack: true });
                cleanup();
                return resolve(false);
            }
        });
    }

    async pollQuery() {
        if (myState > 0) {
            return;
        }

        // Prüfe und ggf. setze neues Poll-Intervall
        if (ConfOverridePollInterval !== 0) {
            const state = await this.getState('System.OverridePoll');
            const newPollTime = state?.val ?? 60;

            if (confBatPollTime !== newPollTime) {
                confBatPollTime = newPollTime;
                clearInterval(idInterval1);
                idInterval1 = setInterval(() => this.startPoll(), confBatPollTime * 1000);
                this.log.info(`Poll-Intervall aktualisiert: ${confBatPollTime}s, Interval-ID: ${idInterval1}`);
            }
        }

        myState = 1;
        myNumberforDetails++;

        this.log.debug(`myNumberforDetails: ${myNumberforDetails}`);
        this.log.debug(`Starte Polling an IP: ${this.config.ConfIPAdress}`);

        // Tower-Attribute initialisieren
        towerAttributes = Array.from({ length: ConfBydTowerCount }, (_, i) => {
            this.log.debug(`Initialisiere Tower ${i}`);
            return {
                hvsBatteryVoltsperCell: [],
                hvsBatteryTempperCell: [],
            };
        });

        const socketConnection = await this.setupIPClientHandlers();
        await this.setStateAsync('info.socketConnection', socketConnection, true);
    }

    /*
     * Calculate default deviation / Standardabweichung
     */
    calcDeviation(array) {
        if (!Array.isArray(array) || array.length === 0) {
            return 0;
        }

        const n = array.length;
        const mean = array.reduce((sum, val) => sum + val, 0) / n;
        const variance = array.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (n > 1 ? n - 1 : 1);

        return Math.sqrt(variance);
    }

    /*
     * Calculate the average / mean
     */
    calcAverage(array) {
        if (!Array.isArray(array) || array.length === 0) {
            return 0;
        }
        return array.reduce((a, b) => a + b, 0) / array.length;
    }

    decodePacket2(data) {
        if (this.config.ConfStoreRawMessages) {
            this.setState('System.Raw_02', data.toString('hex'), true);
        }
        const byteArray = new Uint8Array(data);
        hvsBattType = byteArray[5];
        hvsInvType = byteArray[3];
        hvsNumCells = 0;
        hvsNumTemps = 0;
        switch (hvsBattType) {
            case 0: //HVL -> unknown specification, so 0 cells and 0 temps
                //hvsNumCells = 0;
                //hvsNumTemps = 0;
                //see above, is default
                break;
            case 1: //HVM 16 Cells per module
                hvsNumCells = hvsModules * 16;
                hvsNumTemps = hvsModules * 8;
                break;
            //crosscheck
            // 5 modules, 80 voltages, 40 temps
            case 2: //HVS 32 cells per module
                hvsNumCells = hvsModules * 32;
                hvsNumTemps = hvsModules * 12;
                break;
            //crosscheck:
            //Counts from real data:
            //mine: 2 modules, 64 voltages, 24 temps
            //4 modules, 128 voltages, 48 temps
        }
        //leider hässlich dazugestrickt, wollte in die andere Logik nicht eingreifen
        if (hvsBattType_fromSerial == 'LVS') {
            hvsBattType = 'LVS';
            hvsNumCells = hvsModules * 7;
            hvsNumTemps = 0;
        }
        if (hvsBattType_fromSerial == 'LVS') {
            //unterschiedliche WR-Tabelle je nach Batt-Typ
            hvsInvType_String = myINVsLVS[hvsInvType];
        } else {
            hvsInvType_String = myINVs[hvsInvType];
        }
        if (hvsInvType_String == undefined) {
            hvsInvType_String = 'undefined';
        }

        if (hvsNumCells > 160) {
            hvsNumCells = 160;
        }
        if (hvsNumTemps > 64) {
            hvsNumTemps = 64;
        }
        if (ConfBatDetails && _firstRun) {
            _firstRun = false;
            this.setObjectsCells();
        }
        this.log.debug(`NumCells: ${hvsNumCells} Numtemps: ${hvsNumTemps} Modules: ${hvsModules}`);
    }

    setObjectsCells() {
        //Diagnose-data only if necessary.
        let myObjects = [];
        let ObjTowerString = '';

        for (let towerNumber = 0; towerNumber < ConfBydTowerCount; towerNumber++) {
            if (ConfBydTowerCount > 1) {
                ObjTowerString = `.Tower_${towerNumber + 1}`;
            }
            myObjects = [
                [
                    `Diagnosis${ObjTowerString}.mVoltMax`,
                    'state',
                    'Max Cell Voltage (mv)',
                    'number',
                    'value.voltage',
                    true,
                    false,
                    'mV',
                ],
                [
                    `Diagnosis${ObjTowerString}.mVoltMin`,
                    'state',
                    'Min Cell Voltage (mv)',
                    'number',
                    'value.voltage',
                    true,
                    false,
                    'mV',
                ],
                [
                    `Diagnosis${ObjTowerString}.mVoltMaxCell`,
                    'state',
                    'Max Cell Volt (Cellnr)',
                    'number',
                    'value.voltage',
                    true,
                    false,
                    '',
                ],
                [
                    `Diagnosis${ObjTowerString}.mVoltMinCell`,
                    'state',
                    'Min Cell Volt (Cellnr)',
                    'number',
                    'value.voltage',
                    true,
                    false,
                    '',
                ],
                [
                    `Diagnosis${ObjTowerString}.TempMax`,
                    'state',
                    'Max Cell Temperature',
                    'number',
                    'value.temperature',
                    true,
                    false,
                    '°C',
                ],
                [
                    `Diagnosis${ObjTowerString}.TempMin`,
                    'state',
                    'Min Cell Temperature',
                    'number',
                    'value.temperature',
                    true,
                    false,
                    '°C',
                ],
                [
                    `Diagnosis${ObjTowerString}.TempMaxCell`,
                    'state',
                    'Max Cell Temp (Cellnr)',
                    'number',
                    'value.temperature',
                    true,
                    false,
                    '',
                ],
                [
                    `Diagnosis${ObjTowerString}.TempMinCell`,
                    'state',
                    'Min Cell Temp(Cellnr)',
                    'number',
                    'value.temperature',
                    true,
                    false,
                    '',
                ],

                [
                    `Diagnosis${ObjTowerString}.mVoltDefDeviation`,
                    'state',
                    'voltage std-dev of the cells',
                    'number',
                    'value.voltage',
                    true,
                    false,
                    'mV',
                ],
                [
                    `Diagnosis${ObjTowerString}.TempDefDeviation`,
                    'state',
                    'temperature std-dev of the cells',
                    'number',
                    'value.temperature',
                    true,
                    false,
                    '°C',
                ],
                [
                    `Diagnosis${ObjTowerString}.mVoltMean`,
                    'state',
                    'mean voltage of the cells',
                    'number',
                    'value.voltage',
                    true,
                    false,
                    'mV',
                ],
                [
                    `Diagnosis${ObjTowerString}.TempMean`,
                    'state',
                    'mean temperature of the cells',
                    'number',
                    'value.temperature',
                    true,
                    false,
                    '°C',
                ],
                [
                    `Diagnosis${ObjTowerString}.mVoltGt150DefVar`,
                    'state',
                    '#cells voltage above 150% std-dev',
                    'number',
                    'value.voltage',
                    true,
                    false,
                    '',
                ],
                [
                    `Diagnosis${ObjTowerString}.mVoltLt150DefVar`,
                    'state',
                    '#cells voltage below 150% std-dev',
                    'number',
                    'value.voltage',
                    true,
                    false,
                    '',
                ],
                [
                    `Diagnosis${ObjTowerString}.TempGt150DefVar`,
                    'state',
                    '#cells temperature above 150% std-dev',
                    'number',
                    'value.temperature',
                    true,
                    false,
                    '',
                ],
                [
                    `Diagnosis${ObjTowerString}.TempLt150DefVar`,
                    'state',
                    '#cells temperature below 150% std-dev',
                    'number',
                    'value.temperature',
                    true,
                    false,
                    '',
                ],

                [
                    `Diagnosis${ObjTowerString}.ChargeTotal`,
                    'state',
                    'Total Charge in that tower',
                    'number',
                    'value.watt',
                    true,
                    false,
                    '',
                ],
                [
                    `Diagnosis${ObjTowerString}.DischargeTotal`,
                    'state',
                    'Total Discharge in that tower',
                    'number',
                    'value.watt',
                    true,
                    false,
                    '',
                ],
                [`Diagnosis${ObjTowerString}.ETA`, 'state', 'ETA of that tower', 'number', 'value', true, false, ''],
                [
                    `Diagnosis${ObjTowerString}.BatteryVolt`,
                    'state',
                    'Voltage of that tower',
                    'number',
                    'value',
                    true,
                    false,
                    '',
                ],
                [`Diagnosis${ObjTowerString}.OutVolt`, 'state', 'Output voltage', 'number', 'value', true, false, ''],
                [
                    `Diagnosis${ObjTowerString}.SOC`,
                    'state',
                    'SOC (Diagnosis)',
                    'number',
                    'value.battery',
                    true,
                    false,
                    '%',
                ],

                [`Diagnosis${ObjTowerString}.SOH`, 'state', 'State of Health', 'number', 'value', true, false, ''],
                [`Diagnosis${ObjTowerString}.State`, 'state', 'tower state', 'string', 'value', true, false, ''],
                [
                    `Diagnosis${ObjTowerString}.BalancingCells`,
                    'state',
                    'bitmask of balanced cells',
                    'string',
                    'value',
                    true,
                    false,
                    '',
                ],
                [
                    `Diagnosis${ObjTowerString}.BalancingCellsCount`,
                    'state',
                    'number of currently balanced cells',
                    'number',
                    'value',
                    true,
                    false,
                    '',
                ],
                [`Diagnosis${ObjTowerString}.BalancingOne`, 'state', 'tower state', 'string', 'value', true, false, ''],
                [`Diagnosis${ObjTowerString}.BalancingTwo`, 'state', 'tower state', 'string', 'value', true, false, ''],
                [
                    `Diagnosis${ObjTowerString}.BalancingCountOne`,
                    'state',
                    'tower state',
                    'number',
                    'value',
                    true,
                    false,
                    '',
                ],
                [
                    `Diagnosis${ObjTowerString}.BalancingCountTwo`,
                    'state',
                    'tower state',
                    'number',
                    'value',
                    true,
                    false,
                    '',
                ],
            ];

            for (let i = 0; i < myObjects.length; i++) {
                this.setObjectNotExists(myObjects[i][0], {
                    type: myObjects[i][1],
                    common: {
                        name: myObjects[i][2],
                        type: myObjects[i][3],
                        role: myObjects[i][4],
                        read: myObjects[i][5],
                        write: myObjects[i][6],
                        unit: myObjects[i][7],
                    },
                    native: {},
                });
            }
            for (let i = 0; i < myObjects.length; i++) {
                //console.log("****extend " + i + " " + myObjects[i][0] + " " + myObjects[i][7]);
                this.checkandrepairUnit(myObjects[i][0], myObjects[i][7], myObjects[i][5], myObjects[i][2]);
            }

            for (let i = 1; i <= hvsNumCells; i++) {
                this.setObjectNotExists(`CellDetails${ObjTowerString}.CellVolt${this.pad(i, 3)}`, {
                    type: 'state',
                    common: {
                        name: `Voltage Cell: ${this.pad(i, 3)}`,
                        type: 'number',
                        role: 'value.voltage',
                        read: true,
                        write: false,
                        unit: 'mV',
                    },
                    native: {},
                });
                this.checkandrepairUnit(
                    `CellDetails${ObjTowerString}.CellVolt${this.pad(i, 3)}`,
                    'mV',
                    'value.voltage',
                ); //repair forgotten units in first version

                for (let i = 1; i <= hvsNumTemps; i++) {
                    this.setObjectNotExists(`CellDetails${ObjTowerString}.CellTemp${this.pad(i, 3)}`, {
                        type: 'state',
                        common: {
                            name: `Temp Cell: ${this.pad(i, 3)}`,
                            type: 'number',
                            role: 'value.temperature',
                            read: true,
                            write: false,
                            unit: '°C',
                        },
                        native: {},
                    });
                    this.checkandrepairUnit(
                        `CellDetails${ObjTowerString}.CellTemp${this.pad(i, 3)}`,
                        '°C',
                        'value.temperature',
                    ); //repair forgotten units in first version
                }
            }
        }
    }

    decodePacket5(data, towerNumber = 0) {
        const byteArray = new Uint8Array(data);
        towerAttributes[towerNumber].hvsMaxmVolt = this.buf2int16SI(byteArray, 5);
        towerAttributes[towerNumber].hvsMinmVolt = this.buf2int16SI(byteArray, 7);
        towerAttributes[towerNumber].hvsMaxmVoltCell = byteArray[9];
        towerAttributes[towerNumber].hvsMinmVoltCell = byteArray[10];
        towerAttributes[towerNumber].hvsMaxmTemp = this.buf2int16SI(byteArray, 11);
        towerAttributes[towerNumber].hvsMinmTemp = this.buf2int16SI(byteArray, 13);
        towerAttributes[towerNumber].hvsMaxTempCell = byteArray[15];
        towerAttributes[towerNumber].hvsMinTempCell = byteArray[16];

        //starting with byte 101, ending with 131, Cell voltage 1-16
        const MaxCells = 16;
        for (let i = 0; i < MaxCells; i++) {
            this.log.silly(`Battery Voltage-${this.pad(i + 1, 3)} :${this.buf2int16SI(byteArray, i * 2 + 101)}`);
            towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 1] = this.buf2int16SI(byteArray, i * 2 + 101);
        }

        // Balancing Flags
        // 17 bis 32
        towerAttributes[towerNumber].balancing = data.slice(17, 33).toString('hex');
        towerAttributes[towerNumber].balancingcount = this.countSetBits(data.slice(17, 33).toString('hex'));

        towerAttributes[towerNumber].chargeTotal = this.buf2int32US(byteArray, 33);
        towerAttributes[towerNumber].dischargeTotal = this.buf2int32US(byteArray, 37);
        towerAttributes[towerNumber].eta =
            towerAttributes[towerNumber].dischargeTotal / towerAttributes[towerNumber].chargeTotal;
        towerAttributes[towerNumber].batteryVolt = this.buf2int16SI(byteArray, 45);
        towerAttributes[towerNumber].outVolt = this.buf2int16SI(byteArray, 51);
        towerAttributes[towerNumber].hvsSOCDiagnosis = parseFloat(
            ((this.buf2int16SI(byteArray, 53) * 1.0) / 10.0).toFixed(1),
        );
        towerAttributes[towerNumber].soh = parseFloat((this.buf2int16SI(byteArray, 55) * 1.0).toFixed(1));
        towerAttributes[towerNumber].state = byteArray[59].toString(16) + byteArray[60].toString(16);
    }

    decodePacket6(data, towerNumber = 0) {
        const byteArray = new Uint8Array(data);
        // e.g. hvsNumCells = 80
        // first Voltage in byte 5+6
        // Count = 80-17 --> 63
        let MaxCells = hvsNumCells - 16; //0 to n-1 is the same like 1 to n
        if (MaxCells > 64) {
            MaxCells = 64;
        }
        for (let i = 0; i < MaxCells; i++) {
            this.log.silly(`Battery Voltage-${this.pad(i + 17, 3)} :${this.buf2int16SI(byteArray, i * 2 + 5)}`);
            towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 17] = this.buf2int16SI(byteArray, i * 2 + 5);
        }
    }

    decodePacket7(data, towerNumber = 0) {
        const byteArray = new Uint8Array(data);
        //starting with byte 5, ending 101, voltage for cell 81 to 128
        //starting with byte 103, ending 132, temp for cell 1 to 30

        // e.g. hvsNumCells = 128
        // first Voltage in byte 5+6
        // Count = 128-80 --> 48
        let MaxCells = hvsNumCells - 80; //0 to n-1 is the same like 1 to n
        if (MaxCells > 48) {
            MaxCells = 48;
        }
        this.log.silly(`hvsModules =${hvsModules} maxCells= ${MaxCells}`);
        for (let i = 0; i < MaxCells; i++) {
            this.log.silly(`Battery Voltage-${this.pad(i + 81, 3)} :${this.buf2int16SI(byteArray, i * 2 + 5)}`);
            towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 81] = this.buf2int16SI(byteArray, i * 2 + 5);
        }

        let MaxTemps = hvsNumTemps - 0; //0 to n-1 is the same like 1 to n
        if (MaxTemps > 30) {
            MaxTemps = 30;
        }
        this.log.silly(`hvsModules =${hvsModules} MaxTemps= ${MaxTemps}`);
        for (let i = 0; i < MaxTemps; i++) {
            this.log.silly(`Battery Temp ${this.pad(i + 1, 3)} :${byteArray[i + 103]}`);
            towerAttributes[towerNumber].hvsBatteryTempperCell[i + 1] = byteArray[i + 103];
        }
    }

    decodePacket8(data, towerNumber = 0) {
        const byteArray = new Uint8Array(data);
        let MaxTemps = hvsNumTemps - 30; //0 to n-1 is the same like 1 to n
        if (MaxTemps > 34) {
            MaxTemps = 34;
        }
        this.log.silly(`hvsModules =${hvsModules} MaxTemps= ${MaxTemps}`);
        for (let i = 0; i < MaxTemps; i++) {
            this.log.silly(`Battery Temp ${this.pad(i + 31, 3)} :${byteArray[i + 5]}`);
            towerAttributes[towerNumber].hvsBatteryTempperCell[i + 31] = byteArray[i + 5];
        }
    }

    /*
     * decode response to request[12]
     * @see #decodePacket5()
     */
    decodeResponse12(data, towerNumber = 0) {
        const byteArray = new Uint8Array(data);
        //starting with byte 101, ending with 131, Cell voltage 129-144

        // Balancing Flags
        towerAttributes[towerNumber].balancing = data.slice(17, 33).toString('hex');
        towerAttributes[towerNumber].balancingcount = this.countSetBits(data.slice(17, 33).toString('hex'));

        const MaxCells = 16;
        for (let i = 0; i < MaxCells; i++) {
            this.log.silly(`Battery Voltage-${this.pad(i + 1 + 128, 3)} :${this.buf2int16SI(byteArray, i * 2 + 101)}`);
            towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 1 + 128] = this.buf2int16SI(byteArray, i * 2 + 101);
        }
    }

    /*
     * decode response to request[13]
     * @see #decodePacket6()
     */
    decodeResponse13(data, towerNumber = 0) {
        const byteArray = new Uint8Array(data);
        let MaxCells = hvsNumCells - 128 - 16; // The first round measured up to 128 cells, request[12] then get another 16
        if (MaxCells > 16) {
            MaxCells = 16;
        } // With 5 HVS Modules, only 16 cells are remaining
        for (let i = 0; i < MaxCells; i++) {
            this.log.silly(
                `Battery Voltage-${this.pad(i + 1 + 16 + 128, 3)} :${this.buf2int16SI(byteArray, i * 2 + 5)}`,
            );
            towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 1 + 16 + 128] = this.buf2int16SI(
                byteArray,
                i * 2 + 5,
            );
        }
    }

    decodePacket0(data) {
        if (this.config.ConfStoreRawMessages) {
            this.setState('System.Raw_00', data.toString('hex'), true);
        }
        const byteArray = new Uint8Array(data);

        // Serialnumber
        hvsSerial = '';
        for (let i = 3; i < 22; i++) {
            hvsSerial += String.fromCharCode(byteArray[i]);
        }

        // Hardwaretype
        //leider dazugestrickt, wollte in die andere Logik nicht eingreifen
        if (byteArray[5] == 51) {
            hvsBattType_fromSerial = 'HVS';
        }
        if (byteArray[5] == 50) {
            hvsBattType_fromSerial = 'LVS';
        }
        if (byteArray[5] == 49) {
            hvsBattType_fromSerial = 'LVS';
        }

        // Firmwareversion
        hvsBMUA = `V${byteArray[27].toString()}.${byteArray[28].toString()}`;
        hvsBMUB = `V${byteArray[29].toString()}.${byteArray[30].toString()}`;
        if (byteArray[33] === 0) {
            hvsBMU = `${hvsBMUA}-A`;
        } else {
            hvsBMU = `${hvsBMUB}-B`;
        }
        hvsBMS = `V${byteArray[31].toString()}.${byteArray[32].toString()}-${String.fromCharCode(byteArray[34] + 65)}`;

        // Amount of towers
        // 1st Byte - Count of towers
        // 2nd Byte - Amount of Modules (per Tower)
        hvsModules = parseInt((byteArray[36] % 16).toString());
        hvsTowers = parseInt(Math.floor(byteArray[36] / 16).toString());

        // Architecture type
        if (byteArray[38] === 0) {
            hvsGrid = 'OffGrid';
        }
        if (byteArray[38] === 1) {
            hvsGrid = 'OnGrid';
        }
        if (byteArray[38] === 2) {
            hvsGrid = 'Backup';
        }
    }

    decodePacket1(data) {
        if (this.config.ConfStoreRawMessages) {
            this.setState('System.Raw_01', data.toString('hex'), true);
        }
        const byteArray = new Uint8Array(data);
        hvsSOC = this.buf2int16SI(byteArray, 3);
        hvsMaxVolt = parseFloat(((this.buf2int16SI(byteArray, 5) * 1.0) / 100.0).toFixed(2));
        hvsMinVolt = parseFloat(((this.buf2int16SI(byteArray, 7) * 1.0) / 100.0).toFixed(2));
        hvsSOH = this.buf2int16SI(byteArray, 9);
        hvsA = parseFloat(((this.buf2int16SI(byteArray, 11) * 1.0) / 10.0).toFixed(1));
        hvsBattVolt = parseFloat(((this.buf2int16US(byteArray, 13) * 1.0) / 100.0).toFixed(1));
        hvsMaxTemp = this.buf2int16SI(byteArray, 15);
        hvsMinTemp = this.buf2int16SI(byteArray, 17);
        hvsBatTemp = this.buf2int16SI(byteArray, 19);
        hvsError = this.buf2int16SI(byteArray, 29);
        hvsParamT = `${byteArray[31].toString()}.${byteArray[32].toString()}`;
        hvsOutVolt = parseFloat(((this.buf2int16US(byteArray, 35) * 1.0) / 100.0).toFixed(1));
        hvsPower = Math.round(hvsA * hvsOutVolt * 100) / 100;
        hvsDiffVolt = Math.round((hvsMaxVolt - hvsMinVolt) * 100) / 100;
        hvsErrorString = '';
        //        hvsError = 65535;
        for (let j = 0; j < 16; j++) {
            if (((1 << j) & hvsError) !== 0) {
                if (hvsErrorString.length > 0) {
                    hvsErrorString += '; ';
                }
                hvsErrorString += this.myErrors[j];
            }
        }
        if (hvsErrorString.length === 0) {
            hvsErrorString = 'no Error';
        }

        hvsChargeTotal = this.buf2int32US(byteArray, 37) / 10;
        hvsDischargeTotal = this.buf2int32US(byteArray, 41) / 10;
        hvsETA = hvsDischargeTotal / hvsChargeTotal;
    }
}

if (module.parent) {
    /**
     * @param [options]
     */
    module.exports = options => new bydhvsControll(options);
} else {
    // otherwise start the instance directly
    new bydhvsControll();
}
