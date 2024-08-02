"use strict";

/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// battery icon from
// https://freepsdfiles.net/graphics/battery-icon-psd

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core"); // Get common adapter utils
const crc = require("crc");
//const ioBLib = require('strathcole/iob-lib').ioBLib;
const net = require("net");
const IPClient = new net.Socket();


// Load your modules here, e.g.:
// const fs = require("fs");

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;
// globale Variablen
/** @type {number | any } */
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
let FirstRun;


/** @type {string} */
let hvsSerial;
let hvsBMU;
let hvsBMUA;
let hvsBMUB;
let hvsBMS;
let hvsGrid;
let hvsErrorString;
let hvsParamT;

/** @type {boolean} */
let ConfBatDetails;

/*const myStates = [
    "no state",
    "waiting for initial connect",
    "waiting for 1st answer",
    "waiting for 2nd answer"

];*/



/** @type {NodeJS.Timeout} */
let idInterval1;
let idTimeout1;


const myRequests = [
    Buffer.from("010300000066c5e0", "hex"), //0
    Buffer.from("01030500001984cc", "hex"), //1
    Buffer.from("010300100003040e", "hex"), //2
    Buffer.from("0110055000020400018100f853", "hex"), //3 start measuring
    Buffer.from("010305510001d517", "hex"), //4
    Buffer.from("01030558004104e5", "hex"), //5
    Buffer.from("01030558004104e5", "hex"), //6
    Buffer.from("01030558004104e5", "hex"), //7
    Buffer.from("01030558004104e5", "hex"), //8
    // to read the 5th module, the box must first be reconfigured
    Buffer.from("01100100000306444542554700176f", "hex"), //9 switch to second turn for the last few cells
    Buffer.from("0110055000020400018100f853", "hex"), //10 start measuring remaining cells (like 3)
    Buffer.from("010305510001d517", "hex"), //11 (like 4)
    Buffer.from("01030558004104e5", "hex"), //12 (like 5)
    Buffer.from("01030558004104e5", "hex"), //13 (like 6)
    // The BYD tool also issues two more requests, probably to gather even more cells in some larger setups
    Buffer.from("01030558004104e5", "hex"), //14 (like 7)
    Buffer.from("01030558004104e5", "hex"), //15 (like 8)
    //
    // ONLY if two towers in parallel
    Buffer.from("01100550000204000281000853", "hex"), // 16 - Switch to Box 2 -> 281
];


/* Während des Updates des BMS funktioniert das Auslesen offensichtlich nicht, hier die Antworten des Speichers (Seriennummer verfälscht und CRC des ersten Paketes nicht neu berechnet)
 1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 7 8 9 0 1 2 3 4 5 6 7 8 9 0
01 03 cc 50 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 78 78 78 78 78 03 0d 03 0f 03 14 01 00 03 12 02 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 02 00 00 00 15 04 0c 12 38 2b 82 b2
01 03 32 00 43 01 4a 01 4a 00 63 ff f8 52 a8 00 15 00 14 00 14 00 00 03 0f 00 00 00 00 00 00 09 02 00 02 52 76 17 03 00 00 13 84 00 00 00 02 09 02 00 00 04 2c 92 5b
01 03 06 03 12 02 01 01 00 c8 ad
01 90 04 4d c3 <- Das scheint eine Fehlercondition zu sein.
5 min. später klappte es wieder und dann war auch die neue F/W-Version in der Antwort enthalten
*/
const myErrors = [
    "High Temperature Charging (Cells)",
    "Low Temperature Charging (Cells)",
    "Over Current Discharging",
    "Over Current Charging",
    "Main circuit Failure",
    "Short Current Alarm",
    "Cells Imbalance",
    "Current Sensor Failure",
    "Battery Over Voltage",
    "Battery Under Voltage",
    "Cell Over Voltage",
    "Cell Under Voltage",
    "Voltage Sensor Failure",
    "Temperature Sensor Failure",
    "High Temperature Discharging (Cells)",
    "Low Temperature Discharging (Cells)"
];

const byd_stat_tower = [
    "Battery Over Voltage",                         // Bit 0
    "Battery Under Voltage",                        // Bit 1
    "Cells OverVoltage",                            // Bit 2
    "Cells UnderVoltage",                           // Bit 3
    "Cells Imbalance",                              // Bit 4
    "Charging High Temperature(Cells)",             // Bit 5
    "Charging Low Temperature(Cells)",              // Bit 6
    "DisCharging High Temperature(Cells)",          // Bit 7
    "DisCharging Low Temperature(Cells)",           // Bit 8
    "Charging OverCurrent(Cells)",                  // Bit 9
    "DisCharging OverCurrent(Cells)",               // Bit 10
    "Charging OverCurrent(Hardware)",               // Bit 11
    "Short Circuit",                                // Bit 12
    "Inversly Connection",                          // Bit 13
    "Interlock switch Abnormal",                    // Bit 14
    "AirSwitch Abnormal"                            // Bit 15
]

const myINVs = [
    "Fronius HV", //0
    "Goodwe HV", //1
    "Fronius HV", //2
    "Kostal HV", //3
    "Goodwe HV",  //4
    "SMA SBS3.7/5.0", //5
    "Kostal HV", //6
    "SMA SBS3.7/5.0",  //7
    "Sungrow HV", //8
    "Sungrow HV", //9
    "Kaco HV", //10
    "Kaco HV", //11
    "Ingeteam HV", //12
    "Ingeteam HV", //13
    "SMA SBS 2.5 HV", //14
    "undefined", //15
    "SMA SBS 2.5 HV", //16
    "Fronius HV", //17
    "undefined", //18
    "SMA STP"  //19
];

const myINVsLVS = [
    "Fronius HV",
    "Goodwe HV",
    "Goodwe HV",
    "Kostal HV",
    "Selectronic LV",
    "SMA SBS3.7/5.0",
    "SMA LV",
    "Victron LV",
    "Suntech LV",
    "Sungrow HV",
    "Kaco HV",
    "Studer LV",
    "Solar Edge LV",
    "Ingeteam HV",
    "Sungrow LV",
    "Schneider LV",
    "SMA SBS2.5 HV",
    "Solar Edge LV",
    "Solar Edge LV",
    "Solar Edge LV",
    "unknown"
];


const myBattTypes = [
    "HVL",
    "HVM",
    "HVS"
];
/* HVM: 16 cells per module
   HVS: 32 cells per module
   HVL: unknown so I count 0 cells per module
*/

/**
 * Starts the adapter instance
 * @param {Partial<utils.AdapterOptions>} [options]
 */
function startAdapter(options) {
    // Create the adapter and define its methods
    return adapter = utils.adapter(Object.assign({}, options, {
        name: "bydhvs",

        // The ready callback is called when databases are connected and adapter received configuration.
        // start here!
        ready: main, // Main method defined below for readability

        // is called when adapter shuts down - callback has to be called under any circumstances!
        unload: (callback) => {
            adapter.log.silly("got unload event");
            try {
                clearInterval(idInterval1);
                clearTimeout(idTimeout1);
                stopPoll();
                IPClient.destroy();

                callback();
            } catch (e) {
                callback();
            }
        },
    }));
}


function setObjectsCells() {
    //Diagnose-data only if necessary.
    let myObjects = [];
    let ObjTowerString = "";

    for(let towerNumber = 0; towerNumber < ConfBydTowerCount; towerNumber++) {
        if (ConfBydTowerCount > 1) {
            ObjTowerString = ".Tower_" +(towerNumber + 1);
        }
        myObjects = [
            ["Diagnosis"+ ObjTowerString + ".mVoltMax", "state", "Max Cell Voltage (mv)", "number", "value.voltage", true, false, "mV"],
            ["Diagnosis"+ ObjTowerString + ".mVoltMin", "state", "Min Cell Voltage (mv)", "number", "value.voltage", true, false, "mV"],
            ["Diagnosis"+ ObjTowerString + ".mVoltMaxCell", "state", "Max Cell Volt (Cellnr)", "number", "value.voltage", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".mVoltMinCell", "state", "Min Cell Volt (Cellnr)", "number", "value.voltage", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".TempMaxCell", "state", "Max Cell Temp (Cellnr)", "number", "value.temperature", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".TempMinCell", "state", "Min Cell Temp(Cellnr)", "number", "value.temperature", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".mVoltDefDeviation", "state", "default voltage deviation of the cells", "number", "value.voltage", true, false, "mV"],
            ["Diagnosis"+ ObjTowerString + ".TempDefDeviation", "state", "default temperature deviation of the cells", "number", "value.temperature", true, false, "°C"],
            ["Diagnosis"+ ObjTowerString + ".mVoltMean", "state", "mean voltage of the cells", "number", "value.voltage", true, false, "mV"],
            ["Diagnosis"+ ObjTowerString + ".TempMean", "state", "mean temperature of the cells", "number", "value.temperature", true, false, "°C"],
            ["Diagnosis"+ ObjTowerString + ".mVoltGt150DefVar", "state", "mean of the cells", "number", "value.voltage", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".mVoltLt150DefVar", "state", "mean of the cells", "number", "value.voltage", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".TempGt150DefVar", "state", "mean of the cells", "number", "value.temperature", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".TempLt150DefVar", "state", "mean of the cells", "number", "value.temperature", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".ChargeTotal", "state", "Total Charge in that tower", "number", "value.energy", true, false, "Wh"],
            ["Diagnosis"+ ObjTowerString + ".DischargeTotal", "state", "Total Discharge in that tower", "number", "value.energy", true, false, "Wh"],
            ["Diagnosis"+ ObjTowerString + ".ETA", "state", "Efficiency of that tower", "number", "value", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".BatteryVolt", "state", "Voltage of battery tower", "number", "value", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".OutVolt", "state", "Output voltage", "number", "value", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".SOC", "state", "SOC (Diagnosis)", "number", "value.battery", true, false, "%"],
            ["Diagnosis"+ ObjTowerString + ".SOH", "state", "State of Health", "number", "value", true, false, "%"],
            ["Diagnosis"+ ObjTowerString + ".State", "state", "tower state", "string", "value", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".BalancingCells", "state", "bitmask of balanced cells", "string", "value", true, false, ""],
            ["Diagnosis"+ ObjTowerString + ".BalancingCellsCount", "state", "number of currently balanced cells", "number", "value", true, false, ""],            
        ];

        for (let i = 0; i < myObjects.length; i++) {
            adapter.setObjectNotExists(myObjects[i][0], {
                type: myObjects[i][1],
                common: {
                    name: myObjects[i][2],
                    type: myObjects[i][3],
                    role: myObjects[i][4],
                    read: myObjects[i][5],
                    write: myObjects[i][6],
                    unit: myObjects[i][7],
                },
                native: {}
            });
        }
        for (let i = 0; i < myObjects.length; i++) {
            //console.log("****extend " + i + " " + myObjects[i][0] + " " + myObjects[i][7]);
            checkandrepairUnit(myObjects[i][0], myObjects[i][7], myObjects[i][5]);
        }


        for (let i = 1; i <= hvsNumCells; i++) {
            adapter.setObjectNotExists(`CellDetails`+ObjTowerString +`.CellVolt` + pad(i, 3), {
                type: "state",
                common: {
                    name: "Voltage Cell: " + pad(i, 3),
                    type: "number",
                    role: "value.voltage",
                    read: true,
                    write: false,
                    unit: "mV"
                },
                native: {}
            });
            checkandrepairUnit(`CellDetails`+ObjTowerString +`.CellVolt` + pad(i, 3), "mV", "value.voltage"); //repair forgotten units in first version

            for (let i = 1; i <= hvsNumTemps; i++) {
                adapter.setObjectNotExists(`CellDetails`+ObjTowerString +`.CellTemp` + pad(i, 3), {
                    type: "state",
                    common: {
                        name: "Temp Cell: " + pad(i, 3),
                        type: "number",
                        role: "value.temperature",
                        read: true,
                        write: false,
                        unit: "°C"
                    },
                    native: {}
                });
                checkandrepairUnit(`CellDetails`+ObjTowerString +`.CellTemp` + pad(i, 3), "°C", "value.temperature"); //repair forgotten units in first version
            }
        }
    }

}

function setObjects() {
    let myObjects = [
        ["System.Serial", "state", "Serial number", "string", "text", true, false, ""],
        ["System.BMU", "state", "F/W BMU", "string", "text", true, false, ""],
        ["System.BMS", "state", "F/W BMS", "string", "text", true, false, ""],
        ["System.BMUBankA", "state", "F/W BMU-BankA", "string", "text", true, false, ""],
        ["System.BMUBankB", "state", "F/W BMU-BankB", "string", "text", true, false, ""],
        ["System.Modules", "state", "modules (count)", "number", "value", true, false, ""],
        ["System.Towers", "state", "towers (count)", "number", "value", true, false, ""],
        ["System.Grid", "state", "Parameter Table", "string", "text", true, false, ""],
        ["System.ParamT", "state", "F/W BMU", "string", "text", true, false, ""],
        ["System.BattType", "state", "Battery Type", "string", "text", true, false, ""],
        ["System.InvType", "state", "Inverter Type", "string", "text", true, false, ""],
        ["State.SOC", "state", "SOC", "number", "value.battery", true, false, "%"],
        ["State.VoltMax", "state", "Max Cell Voltage", "number", "value.voltage", true, false, "V"],
        ["State.VoltMin", "state", "Min Cell Voltage", "number", "value.voltage", true, false, "V"],
        ["State.SOH", "state", "SOH", "number", "value.battery", true, false, "%"],
        ["State.Current", "state", "Charge / Discharge Current", "number", "value.current", true, false, "A"],
        ["State.Power_Consumption", "state", "Charge Power", "number", "value.power", true, false, "W"],
        ["State.Power_Delivery", "state", "Discharge Power", "number", "value.power", true, false, "W"],
        ["State.VoltBatt", "state", "Battery Voltage", "number", "value.voltage", true, false, "V"],
        ["State.TempMax", "state", "Max Cell Temp", "number", "value.temperature", true, false, "°C"],
        ["State.TempMin", "state", "Min Cell Temp", "number", "value.temperature", true, false, "°C"],
        ["State.VoltDiff", "state", "Max - Min Cell Voltage", "number", "value.temperature", true, false, "V"],
        ["State.Power", "state", "Power", "number", "value.power", true, false, "W"],
        ["State.TempBatt", "state", "Battery Temperature", "number", "value.temperature", true, false, "°C"],
        ["State.VoltOut", "state", "Output Voltage", "number", "value.voltage", true, false, "V"],
        ["System.ErrorNum", "state", "Error (numeric)", "number", "value", true, false, ""],
        //["State.ErrorNum", "state", "Error (numeric)", "number", "", true, false, ""], // ERROR ERROR ERROR
        ["System.ErrorStr", "state", "Error (string)", "string", "text", true, false, ""],
        ["System.ChargeTotal", "state", "Total Charge of the system", "number", "value.energy", true, false, "kWh"],
        ["System.DischargeTotal", "state", "Total Discharge of the system", "number", "value.energy", true, false, "kWh"],
        ["System.ETA", "state", "Efficiency of in percent", "number", "value", true, false, ""],
    ];

    const rawObjects = [
        ["System.Raw_00", "state", "Raw Message of sequence 00", "string", "text", true, false, ""],
        ["System.Raw_01", "state", "Raw Message of sequence 01", "string", "text", true, false, ""],
        ["System.Raw_02", "state", "Raw Message of sequence 02", "string", "text", true, false, ""],
    ]
    if(adapter.config.ConfStoreRawMessages)
        myObjects = myObjects.concat(rawObjects);

    for (let i = 0; i < myObjects.length; i++) {
        adapter.setObjectNotExists(myObjects[i][0], {
            type: myObjects[i][1],
            common: {
                name: myObjects[i][2],
                type: myObjects[i][3],
                role: myObjects[i][4],
                read: myObjects[i][5],
                write: myObjects[i][6],
                unit: myObjects[i][7], //works only for new objects, so check later for existing objects
            },
            native: {}
        });
    }
    //repair forgotten units in first version and required roles
    for (let i = 0; i < myObjects.length; i++) {
        //console.log("****extend " + i + " " + myObjects[i][0] + " " + myObjects[i][7]);
        checkandrepairUnit(myObjects[i][0], myObjects[i][7], myObjects[i][4]);
    }
}

/*    setTimeout(() => {
        adapter.log.error("deleting State State.ErrorNum");
        adapter.deleteState("State.ErrorNum", "", function (err, obj) {
            adapter.log.error("callback deletestate called: " + err + " " + obj);
        });
    }, 4000);*/
//changeErrorNum(); //not a really good idea but I do not know how to delete -- did not work :-(



/*async function changeErrorNum() {
  //did not work, this part created a state with "getObjectAsync"
    try {
        const obj = await adapter.getObjectAsync("State.ErrorNum");
        adapter.extendObject("State.ErrorNum", { common: { type: "string", name: "deprecated" } });
        setTimeout(() => {
            adapter.setState("State.ErrorNum", "moved to System.ErrorNum");
        }, 4000);
    }
    catch (err) {
        //dann eben nicht.
    }
}*/


async function checkandrepairUnit(id, NewUnit, NewRole) {
    //want to test and understand async and await, so it's introduced here.
    //check for forgotten unit in first version and if it's missing add unit.
    try {
        const obj = await adapter.getObjectAsync(id);
        if (NewUnit != "") {
            if (obj.common.unit != NewUnit) {
                adapter.extendObject(id, { common: { unit: NewUnit } });
            }
        }
        if (obj.common.role == "") {
            adapter.extendObject(id, { common: { role: NewRole } });
        }
    }
    catch (err) {
        //dann eben nicht.
    }
}

function checkPacket(data) {
    const byteArray = new Uint8Array(data);
    const packetLength = data[2] + 5;// 3 header, 2 crc
    if (byteArray[0] != 1) { return false; }
    if (byteArray[1] === 3) { //habe die Kodierung der Antwort mit 1 an zweiter Stelle nicht verstanden, daher hier keine Längenprüfung
        if (packetLength != byteArray.length) {
            return (false);
        }
    } else {
        if (byteArray[1] != 16) { return false; }
    }
    return (crc.crc16modbus(byteArray) === 0);
}

function pad(n, width, z) {
    z = z || "0";
    n = n + "";
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}

function buf2int16SI(byteArray, pos) { //signed
    let result = 0;
    result = byteArray[pos] * 256 + byteArray[pos + 1];
    if (result > 32768) {
        result -= 65536;
    }
    return result;
}

function buf2int16US(byteArray, pos) { //unsigned
    let result = 0;
    result = byteArray[pos] * 256 + byteArray[pos + 1];
    return result;
}

function buf2int32US(byteArray, pos) { //unsigned
    let result = 0;
    result = byteArray[pos +2] * 16777216 + byteArray[pos +3] * 65536 + byteArray[pos] * 256 + byteArray[pos + 1];
    return result;
}

function decodePacket0(data) {
    if(adapter.config.ConfStoreRawMessages)
        adapter.setState("System.Raw_00", data.toString("hex"), true);
    const byteArray = new Uint8Array(data);

    // Serialnumber
    hvsSerial = "";
    for (let i = 3; i < 22; i++) {
        hvsSerial += String.fromCharCode(byteArray[i]);
    }

    // Hardwaretype
    //leider dazugestrickt, wollte in die andere Logik nicht eingreifen
    if (byteArray[5] == 51 ) {hvsBattType_fromSerial = "HVS";}
    if (byteArray[5] == 50 ) {hvsBattType_fromSerial = "LVS";}
    if (byteArray[5] == 49 ) {hvsBattType_fromSerial = "LVS";}

    // Firmwareversion
    hvsBMUA = "V" + byteArray[27].toString() + "." + byteArray[28].toString();
    hvsBMUB = "V" + byteArray[29].toString() + "." + byteArray[30].toString();
    if (byteArray[33] === 0) {
        hvsBMU = hvsBMUA + "-A";
    } else {
        hvsBMU = hvsBMUB + "-B";
    }
    hvsBMS = "V" + byteArray[31].toString() + "." + byteArray[32].toString() + "-" + String.fromCharCode(byteArray[34] + 65);
  
    // Amount of towers
    // 1st Byte - Count of towers
    // 2nd Byte - Amount of Modules (per Tower)
    hvsModules = parseInt((byteArray[36] % 16).toString());
    hvsTowers  = parseInt((Math.floor(byteArray[36] / 16)).toString());
  
    // Architecture type
    if (byteArray[38] === 0) {hvsGrid = "OffGrid";}
    if (byteArray[38] === 1) {hvsGrid = "OnGrid";}
    if (byteArray[38] === 2) {hvsGrid = "Backup";}
    /*    if ((ConfBatDetails) && (hvsModules > 2)) {
            adapter.log.error("Sorry, Details at the moment only for two modules. I need a wireshark dump from bigger systems to adjust the adapter.");
            ConfBatDetails = false;
        }*/
}

function decodePacket1(data) {
    if(adapter.config.ConfStoreRawMessages)
        adapter.setState("System.Raw_01", data.toString("hex"), true);
    const byteArray = new Uint8Array(data);
    hvsSOC = buf2int16SI(byteArray, 3);
    hvsMaxVolt = parseFloat((buf2int16SI(byteArray, 5) * 1.0 / 100.0).toFixed(2));
    hvsMinVolt = parseFloat((buf2int16SI(byteArray, 7) * 1.0 / 100.0).toFixed(2));
    hvsSOH = buf2int16SI(byteArray, 9);
    hvsA = parseFloat((buf2int16SI(byteArray, 11) * 1.0 / 10.0).toFixed(1));
    hvsBattVolt = parseFloat((buf2int16US(byteArray, 13) * 1.0 / 100.0).toFixed(1));
    hvsMaxTemp = buf2int16SI(byteArray, 15);
    hvsMinTemp = buf2int16SI(byteArray, 17);
    hvsBatTemp = buf2int16SI(byteArray, 19);
    hvsError = buf2int16SI(byteArray, 29);
    hvsParamT = byteArray[31].toString() + "." + byteArray[32].toString();
    hvsOutVolt = parseFloat((buf2int16US(byteArray, 35) * 1.0 / 100.0).toFixed(1));
    hvsPower = Math.round((hvsA * hvsOutVolt) * 100) / 100;
    hvsDiffVolt = Math.round((hvsMaxVolt - hvsMinVolt) * 100) / 100;
    hvsErrorString = "";
    //        hvsError = 65535;
    for (let j = 0; j < 16; j++) {
        if (((1 << j) & hvsError) !== 0) {
            if (hvsErrorString.length > 0) {
                hvsErrorString += "; ";
            }
            hvsErrorString += myErrors[j];
        }
    }
    if (hvsErrorString.length === 0) { hvsErrorString = "no Error"; }

    hvsChargeTotal = buf2int32US(byteArray, 37) / 10;
    hvsDischargeTotal = buf2int32US(byteArray, 41) / 10;
    hvsETA = hvsDischargeTotal / hvsChargeTotal;
}

function decodePacketNOP(data) {
    adapter.log.silly("Packet NOP");
}

function decodePacket2(data) {
    if(adapter.config.ConfStoreRawMessages)
        adapter.setState("System.Raw_02", data.toString("hex"), true);
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
    if (hvsBattType_fromSerial == "LVS") {
        hvsBattType = "LVS";
        hvsNumCells = hvsModules * 7;
        hvsNumTemps = 0;
    }
    if (hvsBattType_fromSerial == "LVS") { //unterschiedliche WR-Tabelle je nach Batt-Typ
        hvsInvType_String = myINVsLVS[hvsInvType];
    }
    else {
        hvsInvType_String = myINVs[hvsInvType];
    }
    if (hvsInvType_String == undefined) {
        hvsInvType_String = "undefined";
    }

    if (hvsNumCells > 160) { hvsNumCells = 160; }
    if (hvsNumTemps > 64) { hvsNumTemps = 64; }
    if (ConfBatDetails && FirstRun) {
        FirstRun = false;
        setObjectsCells();
    }
    adapter.log.silly ("NumCells: " + hvsNumCells +" Numtemps: " + hvsNumTemps + " Modules: " + hvsModules);
}


function decodePacket5(data, towerNumber = 0) {
    const byteArray = new Uint8Array(data);
    towerAttributes[towerNumber].hvsMaxmVolt = buf2int16SI(byteArray, 5);
    towerAttributes[towerNumber].hvsMinmVolt = buf2int16SI(byteArray, 7);
    towerAttributes[towerNumber].hvsMaxmVoltCell = byteArray[9];
    towerAttributes[towerNumber].hvsMinmVoltCell = byteArray[10];
    towerAttributes[towerNumber].hvsMaxTempCell = byteArray[15];
    towerAttributes[towerNumber].hvsMinTempCell = byteArray[16];

    //starting with byte 101, ending with 131, Cell voltage 1-16
    const MaxCells = 16;
    for (let i = 0; i < MaxCells; i++) {
        adapter.log.silly("Battery Voltage-" + pad((i + 1), 3) + " :" + buf2int16SI(byteArray, i * 2 + 101));
        towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 1] = buf2int16SI(byteArray, i * 2 + 101);
    }

    // Balancing Flags
    // 17 bis 32
    towerAttributes[towerNumber].balancing = data.slice(17,33).toString("hex");
    towerAttributes[towerNumber].balancingcount = countSetBits (data.slice(17,33).toString("hex"));

    towerAttributes[towerNumber].chargeTotal = buf2int32US(byteArray, 33);
    towerAttributes[towerNumber].dischargeTotal = buf2int32US(byteArray, 37);
    towerAttributes[towerNumber].eta = towerAttributes[towerNumber].dischargeTotal / towerAttributes[towerNumber].chargeTotal;
    towerAttributes[towerNumber].batteryVolt = buf2int16SI(byteArray, 45);
    towerAttributes[towerNumber].outVolt = buf2int16SI(byteArray, 51);
    towerAttributes[towerNumber].hvsSOCDiagnosis = parseFloat((buf2int16SI(byteArray, 53) * 1.0 / 10.0).toFixed(1));
    towerAttributes[towerNumber].soh = parseFloat((buf2int16SI(byteArray, 55) * 1.0).toFixed(1));
    towerAttributes[towerNumber].state = byteArray[59].toString(16) + byteArray[60].toString(16);
}

function decodePacket6(data, towerNumber = 0) {
    const byteArray = new Uint8Array(data);
    // e.g. hvsNumCells = 80
    // first Voltage in byte 5+6
    // Count = 80-17 --> 63
    let MaxCells = hvsNumCells - 16; //0 to n-1 is the same like 1 to n
    if (MaxCells > 64) { MaxCells = 64; }
    for (let i = 0; i < MaxCells; i++) {
        adapter.log.silly("Battery Voltage-" + pad((i + 17), 3) + " :" + buf2int16SI(byteArray, i * 2 + 5));
        towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 17] = buf2int16SI(byteArray, i * 2 + 5);
    }
}

function decodePacket7(data, towerNumber = 0) {
    const byteArray = new Uint8Array(data);
    //starting with byte 5, ending 101, voltage for cell 81 to 128
    //starting with byte 103, ending 132, temp for cell 1 to 30

    // e.g. hvsNumCells = 128
    // first Voltage in byte 5+6
    // Count = 128-80 --> 48
    let MaxCells = hvsNumCells - 80; //0 to n-1 is the same like 1 to n
    if (MaxCells > 48) { MaxCells = 48; }
    adapter.log.silly("hvsModules =" + hvsModules + " maxCells= " + MaxCells);
    for (let i = 0; i < MaxCells; i++) {
        adapter.log.silly("Battery Voltage-" + pad((i + 81), 3) + " :" + buf2int16SI(byteArray, i * 2 + 5));
        towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 81] = buf2int16SI(byteArray, i * 2 + 5);
    }

    let MaxTemps = hvsNumTemps - 0; //0 to n-1 is the same like 1 to n
    if (MaxTemps > 30) { MaxTemps = 30; }
    adapter.log.silly("hvsModules =" + hvsModules + " MaxTemps= " + MaxTemps);
    for (let i = 0; i < MaxTemps; i++) {
        adapter.log.silly("Battery Temp " + pad(i + 1, 3) + " :" + byteArray[i + 103]);
        towerAttributes[towerNumber].hvsBatteryTempperCell[i + 1] = byteArray[i + 103];
    }
}

function decodePacket8(data, towerNumber = 0) {
    const byteArray = new Uint8Array(data);
    let MaxTemps = hvsNumTemps - 30; //0 to n-1 is the same like 1 to n
    if (MaxTemps > 34) { MaxTemps = 34; }
    adapter.log.silly("hvsModules =" + hvsModules + " MaxTemps= " + MaxTemps);
    for (let i = 0; i < MaxTemps; i++) {
        adapter.log.silly("Battery Temp " + pad(i + 31, 3) + " :" + byteArray[i + 5]);
        towerAttributes[towerNumber].hvsBatteryTempperCell[i + 31] = byteArray[i + 5];
    }
}

/*
 * decode response to request[12]
 * @see #decodePacket5()
 */
function decodeResponse12(data, towerNumber = 0) {
    const byteArray = new Uint8Array(data);
    //starting with byte 101, ending with 131, Cell voltage 129-144

    // Balancing Flags
    towerAttributes[towerNumber].balancing = data.slice(17,33).toString("hex");
    towerAttributes[towerNumber].balancingcount = countSetBits (data.slice(17,33).toString("hex"));    

    const MaxCells = 16;
    for (let i = 0; i < MaxCells; i++) {
        adapter.log.silly("Battery Voltage-" + pad((i + 1 + 128), 3) + " :" + buf2int16SI(byteArray, i * 2 + 101));
        towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 1 + 128] = buf2int16SI(byteArray, i * 2 + 101);
    }
}

/*
 * decode response to request[13]
 * @see #decodePacket6()
 */
function decodeResponse13(data, towerNumber = 0) {
    const byteArray = new Uint8Array(data);
    let MaxCells = hvsNumCells - 128 - 16; // The first round measured up to 128 cells, request[12] then get another 16
    if (MaxCells > 16) { MaxCells = 16; } // With 5 HVS Modules, only 16 cells are remaining
    for (let i = 0; i < MaxCells; i++) {
        adapter.log.silly("Battery Voltage-" + pad((i + 1 + 16 + 128), 3) + " :" + buf2int16SI(byteArray, i * 2 + 5));
        towerAttributes[towerNumber].hvsBatteryVoltsperCell[i + 1 + 16 + 128] = buf2int16SI(byteArray, i * 2 + 5);
    }
}

function setConnected(adapter, isConnected) {
    if (adapter._connected !== isConnected) {
        adapter._connected = isConnected;
        adapter.setState("info.connection", adapter._connected, true, err =>
            // analyse if the state could be set (because of permissions)
            err ? adapter.log.error("Can not update adapter._connected state: " + err) :
                adapter.log.debug("connected set to " + adapter._connected));
    }
}


function setStates() {

    let ObjTowerString = "";

    adapter.log.silly(`hvsSerial       >${hvsSerial}<
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

    adapter.setState("System.Serial", hvsSerial, true);
    adapter.setState("System.BMU", hvsBMU, true);
    adapter.setState("System.BMUBankA", hvsBMUA, true);
    adapter.setState("System.BMUBankB", hvsBMUB, true);
    adapter.setState("System.BMS", hvsBMS, true);
    adapter.setState("System.Modules", hvsModules, true);
    adapter.setState("System.Towers", hvsTowers, true);
    adapter.setState("System.Grid", hvsGrid, true);
    adapter.setState("State.SOC", hvsSOC, true);
    adapter.setState("State.VoltMax", hvsMaxVolt, true);
    adapter.setState("State.VoltMin", hvsMinVolt, true);
    adapter.setState("State.SOH", hvsSOH, true);
    adapter.setState("State.Current", hvsA, true);
    adapter.setState("State.VoltBatt", hvsBattVolt, true);
    adapter.setState("State.TempMax", hvsMaxTemp, true);
    adapter.setState("State.TempMin", hvsMinTemp, true);
    adapter.setState("State.VoltDiff", hvsDiffVolt, true);
    adapter.setState("State.Power", hvsPower, true /*ack*/);
    adapter.setState("System.ParamT", hvsParamT, true);
    adapter.setState("State.TempBatt", hvsBatTemp, true);
    adapter.setState("State.VoltOut", hvsOutVolt, true);
    adapter.setState("System.ErrorNum", hvsError, true);
    adapter.setState("System.ErrorStr", hvsErrorString, true);
    if (hvsPower >= 0) {
        adapter.setState("State.Power_Consumption", hvsPower, true);
        adapter.setState("State.Power_Delivery", 0, true);
    } else {
        adapter.setState("State.Power_Consumption", 0, true);
        adapter.setState("State.Power_Delivery", -hvsPower, true);
    }

    adapter.setState("System.BattType", hvsBattType_fromSerial, true);
    adapter.setState("System.InvType", hvsInvType_String, true);
    adapter.setState("System.ChargeTotal", hvsChargeTotal, true);
    adapter.setState("System.DischargeTotal", hvsDischargeTotal, true);
    adapter.setState("System.ETA", hvsETA, true);

    if (myNumberforDetails == 0) {
        // For every tower
        adapter.log.silly("Tower attributes: " + JSON.stringify(towerAttributes));
        for(let t = 0; t < towerAttributes.length; t++) {
            try {
                if (ConfBydTowerCount > 1) {
                    ObjTowerString = ".Tower_" +(t + 1);
                }

                // Test if all required msg received.
                if(towerAttributes[t].hvsMaxmVolt) {
                    adapter.setState(`Diagnosis` + ObjTowerString + `.mVoltMax`, towerAttributes[t].hvsMaxmVolt, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.mVoltMin`, towerAttributes[t].hvsMinmVolt, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.mVoltMaxCell`, towerAttributes[t].hvsMaxmVoltCell, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.mVoltMinCell`, towerAttributes[t].hvsMinmVoltCell, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.TempMaxCell`, towerAttributes[t].hvsMaxTempCell, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.TempMinCell`, towerAttributes[t].hvsMinTempCell, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.ChargeTotal`, towerAttributes[t].chargeTotal, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.DischargeTotal`, towerAttributes[t].dischargeTotal, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.ETA`, towerAttributes[t].eta, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.BatteryVolt`, towerAttributes[t].batteryVolt, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.OutVolt`, towerAttributes[t].outVolt, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.SOC`, towerAttributes[t].hvsSOCDiagnosis, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.SOH`, towerAttributes[t].soh, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.State`, towerAttributes[t].state, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.BalancingCells`,      towerAttributes[t].balancing, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.BalancingCellsCount`, towerAttributes[t].balancingcount, true);

                    adapter.log.debug(`Tower_${t+1} balancing     >${towerAttributes[t].balancing}<`);
                    adapter.log.debug(`Tower_${t+1} balcount      >${towerAttributes[t].balancingcount}<`);                    

                    for (let i = 1; i <= hvsNumCells; i++) {
                        adapter.setState(`CellDetails` + ObjTowerString + `.CellVolt` + pad(i, 3), towerAttributes[t].hvsBatteryVoltsperCell[i] ? towerAttributes[t].hvsBatteryVoltsperCell[i] : 0 , true);
                    }
                    const mVoltDefDeviation = stabw(towerAttributes[t].hvsBatteryVoltsperCell.filter((v) => v > 0));
                    const mVoltMean = mean(towerAttributes[t].hvsBatteryVoltsperCell.filter((v) => v > 0));
                    adapter.setState(`Diagnosis` + ObjTowerString + `.mVoltDefDeviation`, mVoltDefDeviation,true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.mVoltMean`, mVoltMean, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.mVoltGt150DefVar`, towerAttributes[t].hvsBatteryVoltsperCell.filter((v) => v > (mVoltMean + (mVoltDefDeviation * 1.5))).length, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.mVoltLt150DefVar`, towerAttributes[t].hvsBatteryVoltsperCell.filter((v) => v > 0).filter((v) => v < (mVoltMean - (mVoltDefDeviation * 1.5))).length, true);

                    for (let i = 1; i <= hvsNumTemps; i++) {
                        adapter.setState(`CellDetails` + ObjTowerString + `.CellTemp` + pad(i, 3), towerAttributes[t].hvsBatteryTempperCell[i] ? towerAttributes[t].hvsBatteryTempperCell[i] : 0, true);
                    }
                    const tempDefDeviation = stabw(towerAttributes[t].hvsBatteryTempperCell.filter((v) => v > 0));
                    const tempMean = mean(towerAttributes[t].hvsBatteryTempperCell.filter((v) => v > 0));
                    adapter.setState(`Diagnosis` + ObjTowerString + `.TempDefDeviation`, tempDefDeviation,true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.TempMean`, tempMean, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.TempGt150DefVar`, towerAttributes[t].hvsBatteryTempperCell.filter((v) => v > (tempMean + (tempDefDeviation * 1.5))).length, true);
                    adapter.setState(`Diagnosis` + ObjTowerString + `.TempLt150DefVar`, towerAttributes[t].hvsBatteryTempperCell.filter((v) => v > 0).filter((v) => v < (tempMean - (tempDefDeviation * 1.5))).length, true);

                    adapter.log.silly(`Tower_${t+1} hvsMaxmVolt     >${towerAttributes[t].hvsMaxmVolt}<`);
                    adapter.log.silly(`Tower_${t+1} hvsMinmVolt     >${towerAttributes[t].hvsMinmVolt}<`);
                    adapter.log.silly(`Tower_${t+1} hvsMaxmVoltCell >${towerAttributes[t].hvsMaxmVoltCell}<`);
                    adapter.log.silly(`Tower_${t+1} hvsMinmVoltCell >${towerAttributes[t].hvsMinmVoltCell}<`);
                    adapter.log.silly(`Tower_${t+1} hvsMaxTempCell  >${towerAttributes[t].hvsMaxTempCell}<`);
                    adapter.log.silly(`Tower_${t+1} hvsMinTempCell  >${towerAttributes[t].hvsMinTempCell}<`);
                    adapter.log.silly(`Tower_${t+1} hvsSOC (Diag)   >${towerAttributes[t].hvsSOCDiagnosis}<`);
                }
            } catch(err) {
                adapter.log.error(`Cant read in Tower ${t} with ${err.message}` );
            }
        }
    }

}

function startPoll(adapter) {
    //erster Start sofort (500ms), dann entsprechend der Config - dann muss man nicht beim Entwickeln warten bis der erste Timer durch ist.
    FirstRun = true;
    idTimeout1 = setTimeout(() => { Poll(adapter); }, 500);
    idInterval1 = setInterval(() => Poll(adapter), confBatPollTime * 1000);
    adapter.log.info("gestartet: " + adapter.config.ConfPollInterval + " " + idInterval1);
}

function stopPoll() {
    idInterval1 && clearInterval(idInterval1);
}

IPClient.on("data", function (data) {
    adapter.log.silly("Received, State: " + myState + ", Data: " + data.toString("hex"));
    /* if (ConfTestMode) {
        const PacketNumber = myState - 1;
        adapter.log.info("Received, Packet: " + PacketNumber + " Data: " + data.toString("hex"));
    } */
    if (checkPacket(data) == false) {
        adapter.log.error("error: no valid data");
        IPClient.destroy();
        setConnected(adapter, false);
        myState = 0;
    }
    setConnected(adapter, true);
    const waitTime = 8000;
    const timeout = 2000;
    switch (myState) {
        case 2:
            decodePacket0(data); // decode request 0
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 3;
                IPClient.write(myRequests[1]);
            }, 200);
            break;
        case 3:
            decodePacket1(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 4;
                IPClient.write(myRequests[2]);
            }, 200);
            break;
        case 4: //test if it is time for reading all data. If not stop here
            decodePacket2(data);
            if ((myNumberforDetails < ConfBatDetailshowoften) || (ConfBatDetails == false)) {
                setStates();
                IPClient.destroy();
                myState = 0;
            } else {
                myNumberforDetails = 0; //restart counting
                IPClient.setTimeout(timeout);
                setTimeout(() => {
                    myState = 5;
                    adapter.log.silly(`Send, State: ${myState}, Data: ${myRequests[3].toString('hex')}`);
                    IPClient.write(myRequests[3]);
                }, 200);
            }
            break;
        case 5:
            decodePacketNOP(data);
            IPClient.setTimeout(waitTime + timeout);
            adapter.log.silly(`waiting ${waitTime / 1000} seconds to measure cells`);
            setTimeout(() => {
                myState = 6;
                adapter.log.silly(`Send, State: ${myState}, Data: ${myRequests[4].toString('hex')}`);
                IPClient.write(myRequests[4]);
            }, waitTime);
            break;
        case 6:
            decodePacketNOP(data);
            IPClient.setTimeout(1000);
            myState = 7;
            setTimeout(() => {
                IPClient.write(myRequests[5]);
            }, 200);
            break;
        case 7:
            decodePacket5(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 8;
                IPClient.write(myRequests[6]);
            }, 200);
            break;
        case 8:
            decodePacket6(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 9;
                IPClient.write(myRequests[7]);
            }, 200);
            break;
        case 9:
            decodePacket7(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 10;
                IPClient.write(myRequests[8]);
            }, 200);
            break;
        case 10:
            decodePacket8(data);
            if (hvsNumCells > 128) {
                setTimeout(() => {
                    myState = 11;
                    IPClient.write(myRequests[9]); // Switch to second turn for the last module
                }, 200);
            } else {
                if(ConfBydTowerCount > 1 ) {
                    myState = 16;
                    IPClient.setTimeout(1000);
                    setTimeout(() => {
                        myState = 16;
                        IPClient.write(myRequests[16]);
                    }, 200);
                } else {
                    setStates(); //write out objects if only one Tower
                    IPClient.destroy();
                    myState = 0;
                }
            }
            break;
        case 11:
            decodePacketNOP(data);
            setTimeout(() => {
                myState = 12;
                IPClient.write(myRequests[10]);
            }, 200);
            break;
        case 12:
            decodePacketNOP(data);
            IPClient.setTimeout(8000);
            adapter.log.silly("waiting 3 seconds to measure cells");
            setTimeout(() => {
                myState = 13;
                IPClient.write(myRequests[11]);
            }, 3000);
            break;
        case 13:
            decodePacketNOP(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 14;
                IPClient.write(myRequests[12]);
            }, 200);
            break;
        case 14:
            decodeResponse12(data);
            setTimeout(() => {
                myState = 15;
                IPClient.write(myRequests[13]);
            }, 200);
            break;
        case 15:
            decodeResponse13(data);
            if(ConfBydTowerCount > 1 ) {
                adapter.log.silly("Start to read Tower 2");
                myState = 16;
                IPClient.setTimeout(1000);
                setTimeout(() => {
                    myState = 16;
                    IPClient.write(myRequests[16]);
                }, 200);
            } else {
                setStates();
                IPClient.destroy();
                myState = 0;
            }
            break;
        case 16:
            decodePacketNOP(data);
            IPClient.setTimeout(waitTime + timeout);
            myState = 17;
            adapter.log.silly(`waiting ${waitTime / 1000} seconds to measure cells`);
            setTimeout(() => {
                IPClient.write(myRequests[4]);
            }, waitTime);
            break;
        case 17:
            // MK Package: 01 03 02 88 01 1f 84
            decodePacketNOP(data);
            IPClient.setTimeout(1000);
            myState = 18;
            setTimeout(() => {
                IPClient.write(myRequests[5]);
            }, 200);
            break;
        case 18:
            decodePacket5(data, 1);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 19;
                IPClient.write(myRequests[6]);
            }, 200);
            break;
        case 19:
            decodePacket6(data, 1);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 20;
                IPClient.write(myRequests[7]);
            }, 200);
            break;
        case 20:
            decodePacket7(data, 1);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 22;
                IPClient.write(myRequests[8]);
            }, 200);
            break;
        case 22:
            decodePacket8(data, 1);
            setStates();
            IPClient.destroy();
            myState = 0;
            break;
        default:
            IPClient.destroy();
    }
});


IPClient.on("timeout", function () {
    IPClient.destroy();
    setConnected(adapter, false);
    adapter.log.error(`no connection in state ${myState} to IP: ${adapter.config.ConfIPAdress}`);
    myState = 0;
});

IPClient.on("error", function () {
    IPClient.destroy();
    setConnected(adapter, false);
    myState = 0;
    adapter.log.error("Error connecting to " + adapter.config.ConfIPAdress);
});


function Poll(adapter) {    
    if (myState > 0) return;
    myState = 1;
    IPClient.setTimeout(1000);
    myNumberforDetails += 1;
    adapter.log.silly("myNumberforDetails:" + myNumberforDetails);
    adapter.log.silly("Poll start, IP:" + adapter.config.ConfIPAdress);
    // Erstelle die Arrays
    for(let towerNumber = 0; towerNumber < ConfBydTowerCount; towerNumber++) {
        adapter.log.silly("Empty tower " + towerNumber);
        towerAttributes[towerNumber] = {};
        towerAttributes[towerNumber].hvsBatteryVoltsperCell = [];
        towerAttributes[towerNumber].hvsBatteryTempperCell = [];
    }
    IPClient.connect(8080, adapter.config.ConfIPAdress, function () {
        myState = 2;
        setConnected(adapter, true);
        IPClient.write(myRequests[0]);
    });
}

async function main() {

    // Reset the connection indicator during startup
    //    await this.setStateAsync("info.connection", false, true);
    setConnected(adapter, false);
    setObjects();
    myState = 0;

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info("Poll Interval: " + adapter.config.ConfPollInterval);
    confBatPollTime = parseInt(adapter.config.ConfPollInterval);
    if (confBatPollTime < 3) {
        //confBatPollTime = 60;
        adapter.log.warn("poll to often - recommendation is not more than every 3 seconds");
    }
    ConfBydTowerCount = adapter.config.ConfBydTowerCount ? adapter.config.ConfBydTowerCount : 1;
    adapter.log.info("BYD IP Adress: " + adapter.config.ConfIPAdress);
    ConfBatDetails = (adapter.config.ConfBatDetails ? true : false);
    adapter.log.info("Bat Details  : " + adapter.config.ConfBatDetails);
    ConfBatDetailshowoften = parseInt(adapter.config.ConfDetailshowoften);
    adapter.log.info("Tower count: " + adapter.config.ConfBydTowerCount);
    /*if (ConfBatDetailshowoften < 10) {
        ConfBatDetails = false;
        adapter.log.error("Details polling to often - disabling ");
    }*/
    ConfTestMode = (adapter.config.ConfTestMode ? true : false);
    adapter.log.info("BatDetailshowoften: " + ConfBatDetailshowoften);
    adapter.log.silly("TestMode= " + ConfTestMode);
    myNumberforDetails = ConfBatDetailshowoften;
    //    adapter.config.ConfPollInterval = parseInt(adapter.config.ConfPollInterval, 10) || 60;

    adapter.log.info("starte poll");
    startPoll(adapter);

    // examples for the checkPassword/checkGroup functions
    /*    adapter.checkPassword("admin", "iobroker", (res) => {
            adapter.log.info("check user admin pw iobroker: " + res);
        });
        adapter.checkGroup("admin", "admin", (res) => {
            adapter.log.info("check group user admin group admin: " + res);
        });*/
}
/*
 * Calculate default deviation / Standardabweichung
 */
const stabw = function (array) {
    let len =0;
    const sum = array.reduce(function (pv, cv) { ++len; return pv+cv;}, 0);
    const mean = sum / len;
    let result = 0;
    for(let i = 0; i <len; i++)
        result += Math.pow(array[i] - mean, 2);
    len = (len == 1) ? len :len - 1;
    return Math.sqrt(result / len);
};

/*
 * Calculate the average / mean
 */
const mean = function (array) {
    const sum = array.reduce((a, b) => a + b, 0);
    return (sum / array.length) || 0;
};

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}


function countSetBits(hexString) {
    // Hexadezimale Zeichen in einen Binärstring umwandeln
    let binaryString = '';
    for (let i = 0; i < hexString.length; i++) {
        // Jeder Hex-Char in einen Binär-String umwandeln und auf 4 Stellen auffüllen
        binaryString += parseInt(hexString[i], 16).toString(2).padStart(4, '0');
    }
    
    // Anzahl der '1' Bits im Binärstring zählen
    let setBitsCount = 0;
    for (let i = 0; i < binaryString.length; i++) {
        if (binaryString[i] === '1') {
            setBitsCount++;
        }
    }
    
    return setBitsCount;
}
