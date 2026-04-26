'use strict';

/*
 * Created with @iobroker/create-adapter v1.31.0
 */

const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const crc = require('crc');
const net = require('net');

const _methods = require('./lib/methods');
const constants = require('./lib/constants');
//const byd_stat_tower = require('./lib/constants').byd_stat_tower;
const setObj = require('./lib/crud');
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
/*
const myBattTypes = ['HVL', 'HVM', 'HVS'];
 HVM: 16 cells per module
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
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.setState('info.connection', false, true);
        this.setState('info.socketConnection', false, true);

        this.buf2int16SI = _methods.buf2int16SI.bind(this);
        this.buf2int16US = _methods.buf2int16US.bind(this);
        this.buf2int32US = _methods.buf2int32US.bind(this);
        this.decodePacketNOP = _methods.decodePacketNOP.bind(this);
        this.countSetBits = _methods.countSetBits.bind(this);

        // Fix: myErrors an this binden (sonst TypeError in decodePacket1)
        this.myErrors = constants.myErrors;

        await this.initData();

        // Wenn OverridePoll aktiv, das State abonnieren statt jede Runde zu pollen
        if (ConfOverridePollInterval !== 0) {
            await this.subscribeStatesAsync('System.OverridePoll');
        }

        this.log.info('starte polling');
        this.startQuery();
    }

    /**
     * stateChange: reagiere auf User-Änderung von System.OverridePoll
     *
     * @param id  Volle State-ID
     * @param state  State-Objekt mit val/ack
     */
    onStateChange(id, state) {
        if (!id || !state || state.ack) {
            return;
        }
        if (id.endsWith('.System.OverridePoll')) {
            const newPollTime = parseInt(state.val, 10);
            if (!Number.isFinite(newPollTime) || newPollTime < 30) {
                this.log.warn(`OverridePoll ignoriert – ungültiger Wert ${state.val} (min. 30s)`);
                return;
            }
            if (newPollTime !== confBatPollTime) {
                confBatPollTime = newPollTime;
                if (idInterval1) {
                    clearInterval(idInterval1);
                }
                idInterval1 = setInterval(() => this.pollQuery(), confBatPollTime * 1000);
                this.log.info(`Poll-Intervall via stateChange aktualisiert: ${confBatPollTime}s`);
            }
            this.setState('System.OverridePoll', { val: newPollTime, ack: true });
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback
     */
    onUnload(callback) {
        try {
            clearInterval(idInterval1);
            idInterval1 = null;
            if (this._startTimeout) {
                clearTimeout(this._startTimeout);
                this._startTimeout = null;
            }
            if (this._socket) {
                this._socket.destroy();
                this._socket = null;
            }
            this.log.info('Adapter bydhvs cleaned up everything...');
            callback();
        } catch (error) {
            this.log.debug(`Error onUnload ${error}`);
            callback();
        }
    }

    async initData() {
        setObj.setObjects(this);

        myState = 0;

        ConfOverridePollInterval = this.config.ConfOverridePollInterval ? this.config.ConfOverridePollInterval : 0;

        if (ConfOverridePollInterval === 0) {
            confBatPollTime = parseInt(this.config.ConfPollInterval, 10);
        } else {
            const OverridePollState = await this.getStateAsync('System.OverridePoll');
            confBatPollTime = OverridePollState?.val ?? 60;
        }

        if (confBatPollTime < 30) {
            //confBatPollTime = 60;
            this.log.warn('poll to often - recommendation is not more than every 30 seconds');
        }

        ConfBydTowerCount = this.config.ConfBydTowerCount || 1;
        ConfBatDetails = !!this.config.ConfBatDetails;
        ConfBatDetailshowoften = parseInt(this.config.ConfDetailshowoften, 10);
        ConfTestMode = !!this.config.ConfTestMode;
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

    checkPacket(data) {
        const byteArray = new Uint8Array(data);
        if (byteArray[0] !== 1) {
            this.log.debug(`checkPacket FAIL: byte[0]=${byteArray[0]} erwartet 1, Länge=${data.length}`);
            return false;
        }
        // Modbus Exception: byte[1] = fc | 0x80 (z.B. 0x83=Read-Exception, 0x90=Write-Exception)
        if (byteArray[1] & 0x80) {
            const fc = byteArray[1] & 0x7F;
            const exCode = byteArray[2];
            this.log.warn(`checkPacket: Modbus Exception – fc=0x${fc.toString(16)} exCode=0x${exCode.toString(16)} in State ${myState} (BMS evtl. beschäftigt/aktualisiert)`);
            return false;
        }
        if (byteArray[1] === 3) {
            // Read-Response: Länge muss stimmen
            const packetLength = data[2] + 5;
            if (packetLength !== byteArray.length) {
                this.log.debug(`checkPacket FAIL: cmd=3, Paketlänge erwartet=${packetLength} erhalten=${byteArray.length}`);
                return false;
            }
        } else if (byteArray[1] === 16) {
            // Write-Multiple-Registers-Response: immer exakt 8 Bytes
            if (byteArray.length !== 8) {
                this.log.debug(`checkPacket FAIL: cmd=16 (write), Länge=${byteArray.length} erwartet 8`);
                return false;
            }
        } else {
            this.log.debug(`checkPacket FAIL: byte[1]=${byteArray[1]} weder 3 noch 16`);
            return false;
        }
        const crcResult = crc.crc16modbus(byteArray);
        if (crcResult !== 0) {
            this.log.debug(`checkPacket FAIL: CRC=${crcResult} erwartet 0`);
            return false;
        }
        return true;
    }

    pad(n, width, z) {
        z = z || '0';
        n = `${n}`;
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
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

        // R3: zentrale State-Map – einfacher zu pflegen, weniger doppelter Code
        const stateMap = [
            ['System.Serial',         hvsSerial],
            ['System.BMU',            hvsBMU],
            ['System.BMUBankA',       hvsBMUA],
            ['System.BMUBankB',       hvsBMUB],
            ['System.BMS',            hvsBMS],
            ['System.Modules',        hvsModules],                  // Module pro Tower (Low-Nibble)
            ['System.ModulesTotal',   hvsModules * hvsTowers],      // Gesamt-Module im System
            ['System.Towers',         hvsTowers],
            ['System.Grid',           hvsGrid],
            ['State.SOC',             hvsSOC],
            ['State.VoltMax',         hvsMaxVolt],
            ['State.VoltMin',         hvsMinVolt],
            ['State.SOH',             hvsSOH],
            ['State.Current',         hvsA],
            ['State.VoltBatt',        hvsBattVolt],
            ['State.TempMax',         hvsMaxTemp],
            ['State.TempMin',         hvsMinTemp],
            ['State.VoltDiff',        hvsDiffVolt],
            ['State.Power',           hvsPower],
            ['System.ParamT',         hvsParamT],
            ['State.TempBatt',        hvsBatTemp],
            ['State.VoltOut',         hvsOutVolt],
            ['System.ErrorNum',       hvsError],
            ['System.ErrorStr',       hvsErrorString],
            ['State.Power_Consumption', hvsPower >= 0 ? hvsPower : 0],
            ['State.Power_Delivery',    hvsPower >= 0 ? 0 : -hvsPower],
            ['System.BattType',       hvsBattType_fromSerial],
            ['System.InvType',        hvsInvType_String],
            ['System.ChargeTotal',    hvsChargeTotal],
            ['System.DischargeTotal', hvsDischargeTotal],
            ['System.ETA',            hvsETA],
        ];
        for (const [id, val] of stateMap) {
            this.setState(id, val, true);
        }

        if (myNumberforDetails === 0) {
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
                        this.setState(`Diagnosis${ObjTowerString}.Current`, towerAttributes[t].current, true);
                        this.setState(
                            `Diagnosis${ObjTowerString}.BalancingCellsCount`,
                            towerAttributes[t].balancingcount,
                            true,
                        );

                        this.log.debug(`Tower_${t + 1} balancing     >${towerAttributes[t].balancing}<`);
                        this.log.debug(`Tower_${t + 1} balcount      >${towerAttributes[t].balancingcount}<`);

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
        if (idInterval1) {
            clearInterval(idInterval1);
            idInterval1 = null;
        }
        _firstRun = true;

        const runPoll = () => this.pollQuery();

        // Start direkt nach 500ms (gespeichert für sauberes onUnload)
        this._startTimeout = setTimeout(runPoll, 500);

        // Danach zyklisch gemäß Konfiguration
        idInterval1 = setInterval(runPoll, confBatPollTime * 1000);
        this.log.info(`gestartet pollTime :${confBatPollTime}s intervalId :${idInterval1}`);
    }

    async setupIPClientHandlers() {
        const waitTime = 8000;
        const timeout = 2000;

        this.log.debug('Starte Datenabfrage via TCP-Client...');

        const socket = new net.Socket();
        this._socket = socket;

        return new Promise(resolve => {
            let _settled = false;
            const safeResolve = (v) => {
                if (_settled) {
                    return;
                }
                _settled = true;
                resolve(v);
            };

            const cleanup = () => {
                this.log.debug('Schließe Socket-Verbindung und setze State zurück');
                try {
                    socket.destroy();
                } catch (_e) { /* ignore */ }
                this._socket = null;
                myState = 0;
            };

            let _lastRequestIndex = 0;
            let _lastNextState = 2;
            let _retryCount = 0;
            const MAX_RETRIES = this.config.ConfMaxRetries ? parseInt(this.config.ConfMaxRetries, 10) : 3;
            const RETRY_DELAY_MS = 5000;

            const sendRequest = (requestIndex, nextState, delay = 200) => {
                _lastRequestIndex = requestIndex;
                _lastNextState = nextState;
                return new Promise(res => {
                    setTimeout(() => {
                        this.log.debug(`→ Sende Request [${requestIndex}] und wechsle in State ${nextState}`);
                        myState = nextState;
                        socket.write(constants.myRequests[requestIndex]);
                        res();
                    }, delay);
                });
            };

            const waitForData = () => {
                return new Promise((res, rej) => {
                    let buffer = Buffer.alloc(0);

                    const onData = (chunk) => {
                        buffer = Buffer.concat([buffer, chunk]);
                        this.log.debug(`← Chunk empfangen (${chunk.length} Bytes, Buffer gesamt: ${buffer.length}) in State ${myState}`);

                        // Mindestens 2 Header-Bytes nötig um Funktionscode zu lesen
                        if (buffer.length < 2) {
return;
}

                        let expectedLength;
                        if (buffer[1] & 0x80) {
                            // Modbus Exception Response: [addr][fc|0x80][exCode][CRC_lo][CRC_hi] = 5 Bytes
                            // Beispiel aus BYD-Protokoll: 01 90 04 4d c3 (Exception auf Write während BMS-Update)
                            expectedLength = 5;
                        } else if (buffer[1] === 16) {
                            // Modbus Write-Multiple-Registers Response: immer exakt 8 Bytes
                            // Struktur: [addr][0x10][regHi][regLo][qtyHi][qtyLo][CRC_lo][CRC_hi]
                            // byte[2] ist NICHT die Datenlänge, sondern der obere Teil der Registeradresse!
                            expectedLength = 8;
                        } else {
                            // Modbus Read-Response (cmd=3): [addr][0x03][dataLen][...data...][CRC_lo][CRC_hi]
                            if (buffer.length < 3) {
return;
}
                            expectedLength = buffer[2] + 5;
                        }

                        if (buffer.length >= expectedLength) {
                            socket.removeListener('data', onData);
                            socket.removeListener('timeout', onTimeout);
                            socket.removeListener('error', onError);
                            const packet = buffer.slice(0, expectedLength);
                            this.log.debug(`← Vollständiges Paket (${packet.length} Bytes, cmd=0x${buffer[1].toString(16)}) in State ${myState}`);
                            res(packet);
                        }
                    };

                    const onTimeout = () => {
                        socket.removeListener('data', onData);
                        socket.removeListener('error', onError);
                        socket.removeListener('close', onClose);
                        rej(new Error(`Socket Timeout – Buffer hatte ${buffer.length} Bytes, State: ${myState}`));
                    };

                    const onError = (err) => {
                        socket.removeListener('data', onData);
                        socket.removeListener('timeout', onTimeout);
                        socket.removeListener('close', onClose);
                        rej(err);
                    };

                    const onClose = (hadError) => {
                        socket.removeListener('data', onData);
                        socket.removeListener('timeout', onTimeout);
                        socket.removeListener('error', onError);
                        rej(new Error(`Socket vom Peer geschlossen (hadError=${hadError}) in State ${myState}`));
                    };

                    socket.on('data', onData);
                    socket.once('timeout', onTimeout);
                    socket.once('error', onError);
                    socket.once('close', onClose);
                });
            };

            socket.setTimeout(timeout);

            // Fix: error-Handler VOR connect registrieren, damit ECONNREFUSED/ETIMEDOUT
            // nicht als unhandled error den Prozess crashen
            socket.once('error', err => {
                this.log.error(`❌ Socket-Fehler: ${err.message}`);
                this.setStateChangedAsync('info.connection', { val: false, ack: true }).catch(() => {});
                cleanup();
                safeResolve(false);
            });

            try {
                socket.connect(8080, this.config.ConfIPAdress, async () => {
                    this.log.debug(`Socket verbunden mit ${this.config.ConfIPAdress}:8080`);
                    try {
                        myState = 2;
                        await sendRequest(0, 2);

                        while (true) {
                            const data = await waitForData();

                            if (!this.checkPacket(data)) {
                                // Modbus Exception? → Retry, BMS evtl. gerade beschäftigt
                                const ba = new Uint8Array(data);
                                if (ba.length >= 3 && (ba[1] & 0x80)) {
                                    if (_retryCount < MAX_RETRIES) {
                                        _retryCount++;
                                        this.log.warn(
                                            `⚠️ Modbus Exception in State ${myState} – Retry ${_retryCount}/${MAX_RETRIES} in ${RETRY_DELAY_MS / 1000}s …`,
                                        );
                                        socket.setTimeout(RETRY_DELAY_MS + waitTime);
                                        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                                        socket.setTimeout(timeout);
                                        await sendRequest(_lastRequestIndex, _lastNextState);
                                        continue;
                                    }
                                    this.log.error(
                                        `❌ Modbus Exception in State ${myState} – maximale Retries (${MAX_RETRIES}) erreicht`,
                                    );
                                }
                                this.log.warn(`⚠️ Ungültiges Paket empfangen in State ${myState}`);
                                this.setStateChangedAsync('info.connection', { val: false, ack: true }).catch(() => {});
                                cleanup();
                                return safeResolve(false);
                            }
                            _retryCount = 0; // Erfolg → Zähler zurücksetzen

                            this.setStateChangedAsync('info.connection', { val: true, ack: true }).catch(() => {});

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
                                        return safeResolve(true);
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
                                        return safeResolve(true);
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
                                        return safeResolve(true);
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
                                    return safeResolve(true);

                                default:
                                    this.log.warn(`❓ Unerwarteter Zustand: ${myState}`);
                                    cleanup();
                                    return safeResolve(false);
                            }
                        }
                    } catch (err) {
                        this.log.error(`❌ Fehler im Ablauf: ${err.message}`);
                        this.log.debug(err.stack);
                        this.setStateChangedAsync('info.connection', { val: false, ack: true }).catch(() => {});
                        cleanup();
                        return safeResolve(false);
                    }
                });
            } catch (err) {
                this.log.error(`❌ Socket konnte nicht verbunden werden: ${err.message}`);
                this.log.debug(err.stack);
                this.setStateChangedAsync('info.connection', { val: false, ack: true }).catch(() => {});
                cleanup();
                return safeResolve(false);
            }
        });
    }

    async pollQuery() {
        if (myState > 0) {
            // Stuck-Watchdog: wenn ein vorheriger Zyklus seit > 3*pollTime hängt → forciert resetten
            const stuckSince = Date.now() - (this._pollStartedAt || 0);
            const maxStuck = Math.max(60_000, confBatPollTime * 3 * 1000);
            if (stuckSince > maxStuck) {
                this.log.warn(
                    `pollQuery: erkannter Stuck-State (myState=${myState}, seit ${Math.round(stuckSince / 1000)}s) – forciere Reset`,
                );
                if (this._socket) {
                    try {
                        this._socket.destroy();
                    } catch (_e) { /* ignore */ }
                    this._socket = null;
                }
                myState = 0;
            } else {
                this.log.debug(`pollQuery übersprungen – vorheriger Zyklus läuft noch (State=${myState})`);
                return;
            }
        }
        this._pollStartedAt = Date.now();

        // Prüfe und ggf. setze neues Poll-Intervall
        if (ConfOverridePollInterval !== 0) {
            const state = await this.getStateAsync('System.OverridePoll');
            const newPollTime = state?.val ?? 60;

            if (confBatPollTime !== newPollTime) {
                confBatPollTime = newPollTime;
                clearInterval(idInterval1);
                idInterval1 = setInterval(() => this.pollQuery(), confBatPollTime * 1000);
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
        this.setState('info.socketConnection', socketConnection, true);
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
        // Fix: Doppelte LVS-Prüfung in einen Block zusammengeführt
        if (hvsBattType_fromSerial === 'LVS') {
            hvsBattType = 'LVS';
            hvsNumCells = hvsModules * 7;
            hvsNumTemps = 0;
            hvsInvType_String = constants.myINVsLVS[hvsInvType];
        } else {
            hvsInvType_String = constants.myINVs[hvsInvType];
        }
        if (hvsInvType_String === undefined) {
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
            setObj.setObjectsCells(this, ConfBydTowerCount, hvsNumCells, hvsNumTemps);
        }
        this.log.debug(`NumCells: ${hvsNumCells} Numtemps: ${hvsNumTemps} Modules: ${hvsModules}`);
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
        // Fix: Division durch Null abfangen
        towerAttributes[towerNumber].eta =
            towerAttributes[towerNumber].chargeTotal > 0
                ? towerAttributes[towerNumber].dischargeTotal / towerAttributes[towerNumber].chargeTotal
                : 0;
        towerAttributes[towerNumber].batteryVolt = this.buf2int16SI(byteArray, 45);
        towerAttributes[towerNumber].outVolt = this.buf2int16SI(byteArray, 51);
        towerAttributes[towerNumber].hvsSOCDiagnosis = parseFloat(
            ((this.buf2int16SI(byteArray, 53) * 1.0) / 10.0).toFixed(1),
        );
        towerAttributes[towerNumber].current = parseFloat(((this.buf2int16SI(byteArray, 57) * 1.0) / 10.0).toFixed(1));
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

        // Hardwaretype – Bytes sind ASCII-Zeichen: 51='3'=HVS, 50='2'=LVS, 49='1'=LVS
        // Fix: Initialisierung, damit kein alter Wert vom letzten Polling-Zyklus hängen bleibt
        hvsBattType_fromSerial = 'HVM'; // default
        if (byteArray[5] === 51) {       // ASCII '3'
            hvsBattType_fromSerial = 'HVS';
        } else if (byteArray[5] === 50 || byteArray[5] === 49) { // ASCII '2' oder '1'
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

        // Byte[36] kodiert in EINEM Byte: High-Nibble = Tower-Anzahl, Low-Nibble = Module pro Tower
        // Kommentar-Fehler: es sind NICHT zwei separate Bytes!
        hvsModules = byteArray[36] % 16;                    // Low-Nibble  → Module pro Tower
        hvsTowers  = Math.floor(byteArray[36] / 16);        // High-Nibble → Anzahl Tower

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
        // Fix: Division durch Null abfangen
        hvsETA = hvsChargeTotal > 0 ? hvsDischargeTotal / hvsChargeTotal : 0;
    }
}

if (require.main !== module) {
    /**
     * @param [options]
     */
    module.exports = options => new bydhvsControll(options);
} else {
    // otherwise start the instance directly
    new bydhvsControll();
}
