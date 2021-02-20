"use strict";

/*
 * Created with @iobroker/create-adapter v1.31.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core'); // Get common adapter utils
const crc = require('crc');
//const ioBLib = require('strathcole/iob-lib').ioBLib;
var net = require('net');
var IPClient = new net.Socket();


// Load your modules here, e.g.:
// const fs = require("fs");

/**
 * The adapter instance
 * @type {ioBroker.Adapter}
 */
let adapter;
// globale Variablen
/** @type {number | undefined} */
let myState; // Aktueller Status
let hvsSOC;
let hvsMaxVolt;
let hvsMinVolt;
let hvsA;
let hvsBattVolt;
let hvsMaxTemp;
let hvsMinTemp;
let hvsBatTemp;
let hvsOutVolt;
let hvsError;
let hvsModules;
let hvsDiffVolt;
let hvsPower;


/** @type {string} */
let hvsSerial;
let hvsBMU;
let hvsBMS;
let hvsGrid;
let hvsErrorString;
let hvsParamT;



var myStates = [
    "no state",
    "waiting for initial connect",
    "waiting for 1st answer",
    "waiting for 2nd answer"

]



/** @type {NodeJS.Timeout} */
let idInterval1;


var myRequests = [
    Buffer.from("010300000066c5e0", "hex"),
    Buffer.from("01030500001984cc", "hex"),
    Buffer.from("010300100003040e", "hex"),
    Buffer.from("0110055000020400018100f853", "hex"),
    Buffer.from("010305510001d517", "hex"),
    Buffer.from("01030558004104e5", "hex"),
    Buffer.from("01030558004104e5", "hex"),
    Buffer.from("01030558004104e5", "hex"),
    Buffer.from("01030558004104e5", "hex"),
]

var myErrors = [
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
]
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
            adapter.log.silly('got unload event');
            try {
                // Here you must clear all timeouts or intervals that may still be active
                // clearTimeout(timeout1);
                // clearTimeout(timeout2);
                // ...
                // clearInterval(interval1);

                clearInterval(idInterval1)
                stopPoll(adapter);
                IPClient.destroy();

                callback();
            } catch (e) {
                callback();
            }
        },

        // If you need to react to object changes, uncomment the following method.
        // You also need to subscribe to the objects with `adapter.subscribeObjects`, similar to `adapter.subscribeStates`.
        // objectChange: (id, obj) => {
        //     if (obj) {
        //         // The object was changed
        //         adapter.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        //     } else {
        //         // The object was deleted
        //         adapter.log.info(`object ${id} deleted`);
        //     }
        // },

        // is called if a subscribed state changes
        stateChange: (id, state) => {
            if (state) {
                // The state was changed
                adapter.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            } else {
                // The state was deleted
                adapter.log.info(`state ${id} deleted`);
            }
        },

        // If you need to accept messages in your adapter, uncomment the following block.
        // /**
        //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
        //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
        //  */
        // message: (obj) => {
        //     if (typeof obj === "object" && obj.message) {
        //         if (obj.command === "send") {
        //             // e.g. send email or pushover or whatever
        //             adapter.log.info("send command");

        //             // Send response in callback if required
        //             if (obj.callback) adapter.sendTo(obj.from, obj.command, "Message received", obj.callback);
        //         }
        //     }
        // },
    }));
}


function setObjects() {
    adapter.setObjectNotExists('System.Serial', {
        type: 'state',
        common: {
            name: 'Serial number',
            type: 'string',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('System.BMU', {
        type: 'state',
        common: {
            name: 'F/W BMU',
            type: 'string',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('System.BMS', {
        type: 'state',
        common: {
            name: 'F/W BMS',
            type: 'string',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('System.Modules', {
        type: 'state',
        common: {
            name: 'modules (count)',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('System.Grid', {
        type: 'state',
        common: {
            name: 'Grid-State',
            type: 'string',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('System.ParamT', {
        type: 'state',
        common: {
            name: 'Parameter Table',
            type: 'string',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });

    adapter.setObjectNotExists('State.SOC', {
        type: 'state',
        common: {
            name: 'SOC',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.VoltMax', {
        type: 'state',
        common: {
            name: 'Max Cell Voltage',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.VoltMin', {
        type: 'state',
        common: {
            name: 'Min Cell Voltage',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.Current', {
        type: 'state',
        common: {
            name: 'Charge / Discharge Current',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.VoltBatt', {
        type: 'state',
        common: {
            name: 'Battery Voltage',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.TempMax', {
        type: 'state',
        common: {
            name: 'Max Cell Temp',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.TempMin', {
        type: 'state',
        common: {
            name: 'Min Cell Temp',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.VoltDiff', {
        type: 'state',
        common: {
            name: 'Max - Min Cell Voltage',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.Power', {
        type: 'state',
        common: {
            name: 'Power',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.TempBatt', {
        type: 'state',
        common: {
            name: 'Battery Temperature',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.VoltOut', {
        type: 'state',
        common: {
            name: 'Output Voltage',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.ErrorNum', {
        type: 'state',
        common: {
            name: 'Error (numeric)',
            type: 'number',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });
    adapter.setObjectNotExists('State.ErrorStr', {
        type: 'state',
        common: {
            name: 'Error (string)',
            type: 'string',
            role: '',
            read: true,
            write: false,
            unit: ''
        },
        native: {}
    });

}

function checkPacket(data) {
    var byteArray = new Uint8Array(data);
    var packetLength = data[2] + 5;// 3 header, 2 crc
    if (byteArray[0] != 1) { return false }
    if (byteArray[1] != 3) { return false }
    if (packetLength != byteArray.length) {
        return (false);
    }
    return (crc.crc16modbus(byteArray) === 0);
}

function buf2int16(byteArray, pos) {
    var result = 0;
    result = byteArray[pos] * 256 + byteArray[pos + 1];
    if (result > 32768) {
        result -= 65536
    }
    ;
    return result;
}

function decode1stPacket(data) {
    var byteArray = new Uint8Array(data);
    hvsSerial = "";
    for (var i = 3; i < 22; i++) {
        hvsSerial += String.fromCharCode(byteArray[i]);
    }
    hvsBMU = "V" + byteArray[29].toString() + "." + byteArray[30].toString() + "-" + String.fromCharCode(byteArray[33] + 65);
    hvsBMS = "V" + byteArray[31].toString() + "." + byteArray[32].toString() + "-" + String.fromCharCode(byteArray[34] + 65);
    hvsModules = (byteArray[36] - 16).toString();
    if (byteArray[38] === 1) {
        hvsGrid = 'OnGrid';
    } else {
        hvsGrid = 'OffGrid';
    }
}

function decode2ndPacket(data) {
    var byteArray = new Uint8Array(data);
    hvsSOC = buf2int16(byteArray, 3);
    hvsMaxVolt = (buf2int16(byteArray, 5) * 1.0 / 100.0).toFixed(2);
    hvsMinVolt = (buf2int16(byteArray, 7) * 1.0 / 100.0).toFixed(2);
    hvsA = (buf2int16(byteArray, 11) * 1.0 / 10.0).toFixed(1);
    hvsBattVolt = (buf2int16(byteArray, 13) * 1.0 / 100.0).toFixed(1);
    hvsMaxTemp = buf2int16(byteArray, 15);
    hvsMinTemp = buf2int16(byteArray, 17);
    hvsBatTemp = buf2int16(byteArray, 19);
    hvsError = buf2int16(byteArray, 29);
    hvsParamT = byteArray[31].toString() + "." + byteArray[32].toString();
    hvsOutVolt = (buf2int16(byteArray, 35) * 1.0 / 100.0).toFixed(1);
    hvsPower = (parseFloat(hvsA) * parseFloat(hvsOutVolt)).toFixed(2);
    hvsDiffVolt = (parseFloat(hvsMaxVolt) - parseFloat(hvsMinVolt)).toFixed(2);
    hvsErrorString = "";
    //        hvsError = 65535;
    for (var j = 0; j < 16; j++) {
        if (((1 << j) & hvsError) !== 0) {
            if (hvsErrorString.length > 0) {
                hvsErrorString += "; ";
            }
            hvsErrorString += myErrors[j];
        }
    }
    if (hvsErrorString.length === 0) { hvsErrorString = "no Error" }
}

function setConnected(adapter, isConnected) {
    if (adapter._connected !== isConnected) {
        adapter._connected = isConnected;
        adapter.setState('info.connection', adapter._connected, true, err =>
            // analyse if the state could be set (because of permissions)
            err ? adapter.log.error('Can not update adapter._connected state: ' + err) :
                adapter.log.debug('connected set to ' + adapter._connected));
    }
}

function setStates() {
    adapter.log.silly('hvsSerial  >' + hvsSerial + '<');

    adapter.log.silly('hvsBMU     >' + hvsBMU + '<')
    adapter.log.silly('hvsBMS     >' + hvsBMS + '<')
    adapter.log.silly('hvsModules >' + hvsModules + '<')
    adapter.log.silly('hvsGrid    >' + hvsGrid + '<')

    adapter.log.silly('hvsSOC     >' + hvsSOC + '<')
    adapter.log.silly('hvsMaxVolt >' + hvsMaxVolt + '<')
    adapter.log.silly('hvsMinVolt >' + hvsMinVolt + '<')
    adapter.log.silly('hvsA       >' + hvsA + '<')
    adapter.log.silly('hvsBattVolt>' + hvsBattVolt + '<')
    adapter.log.silly('hvsMaxTemp >' + hvsMaxTemp + '<')
    adapter.log.silly('hvsMinTemp >' + hvsMinTemp + '<')
    adapter.log.silly('hvsDiffVolt>' + hvsDiffVolt + '<')
    adapter.log.silly('hvsPower   >' + hvsPower + '<')
    adapter.log.silly('hvsParamT  >' + hvsParamT + '<')
    adapter.log.silly('hvsBatTemp >' + hvsBatTemp + '<')
    adapter.log.silly('hvsOutVolt >' + hvsOutVolt + '<')
    adapter.log.silly('hvsError   >' + hvsError + '<')
    adapter.log.silly('hvsErrorSt >' + hvsErrorString + '<')

    adapter.setState('System.Serial', hvsSerial);
    adapter.setState('System.BMU', hvsBMU);
    adapter.setState('System.BMS', hvsBMS);
    adapter.setState('System.Modules', hvsModules);
    adapter.setState('System.Grid', hvsGrid);
    adapter.setState('State.SOC', hvsSOC);
    adapter.setState('State.VoltMax', hvsMaxVolt);
    adapter.setState('State.VoltMin', hvsMinVolt);
    adapter.setState('State.Current', hvsA);
    adapter.setState('State.VoltBatt', hvsBattVolt);
    adapter.setState('State.TempMax', hvsMaxTemp);
    adapter.setState('State.TempMin', hvsMinTemp);
    adapter.setState('State.VoltDiff', hvsDiffVolt);
    adapter.setState('State.Power', hvsPower);
    adapter.setState('System.ParamT', hvsParamT);
    adapter.setState('State.TempBatt', hvsBatTemp);
    adapter.setState('State.VoltOut', hvsOutVolt);
    adapter.setState('State.ErrorNum', hvsError);
    adapter.setState('State.ErrorStr', hvsErrorString);
}

function startPoll(adapter) {
    //erster Start sofort (500ms), dann entsprechend der Config - dann muss man nicht beim Entwickeln warten bis der erste Timer durch ist.
    setTimeout(() => { Poll(adapter) }, 500)
    idInterval1 = setInterval(() => Poll(adapter), adapter.config.ConfPollInterval * 1000);
    adapter.log.info("gestartet: " + adapter.config.ConfPollInterval + " " + idInterval1);
}

function stopPoll(adapter) {
    idInterval1 && clearInterval(idInterval1);
}

IPClient.on('data', function (data) {
    adapter.log.silly('Received, State: ' + myState + ' Data: ' + data.toString('hex'));
    if (checkPacket(data) == false) {
        adapter.log.error('error: no valid data');
        IPClient.destroy();
        setConnected(adapter, false);
        myState = 0;
    }
    setConnected(adapter, true);
    switch (myState) {
        case 2:
            decode1stPacket(data);
            IPClient.setTimeout(1000);
            setTimeout(() => {
                myState = 3;
                IPClient.write(myRequests[1]);
            }, 200)
            break;
        case 3:
            decode2ndPacket(data);
            setStates();
            IPClient.destroy();
            myState = 0;
            break;
        default:
            IPClient.destroy();
    }
});


IPClient.on('timeout', function () {
    IPClient.destroy();
    setConnected(adapter, false);
    myState = 0;
    adapter.log.error('no connection to IP: ' + adapter.config.ConfIPAdress);
});

function Poll(adapter) {
    myState = 1;
    IPClient.setTimeout(1000);
    adapter.log.silly('Poll start, IP:' + adapter.config.ConfIPAdress)
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
    adapter.log.info("BYD IP Adress: " + adapter.config.ConfIPAdress);
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

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export startAdapter in compact mode
    module.exports = startAdapter;
} else {
    // otherwise start the instance directly
    startAdapter();
}