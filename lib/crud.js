/**
 *
 * @param adaptr
 * @param ConfBydTowerCount
 * @param hvsNumCells
 * @param hvsNumTemps
 */
function setObjectsCells(adaptr, ConfBydTowerCount, hvsNumCells, hvsNumTemps) {
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
                'value.energy',  // Fix: war 'value.watt' – kein valider ioBroker-Role
                true,
                false,
                'Wh',            // Fix: Unit fehlte
            ],
            [
                `Diagnosis${ObjTowerString}.DischargeTotal`,
                'state',
                'Total Discharge in that tower',
                'number',
                'value.energy',  // Fix: war 'value.watt'
                true,
                false,
                'Wh',            // Fix: Unit fehlte
            ],
            [`Diagnosis${ObjTowerString}.ETA`, 'state', 'ETA of that tower', 'number', 'value', true, false, ''],
            [
                `Diagnosis${ObjTowerString}.BatteryVolt`,
                'state',
                'Voltage of that tower',
                'number',
                'value.voltage',  // Fix: war 'value' → 'value.voltage'
                true,
                false,
                'V',              // Fix: Unit fehlte
            ],
            [
                `Diagnosis${ObjTowerString}.OutVolt`,
                'state',
                'Output voltage',
                'number',
                'value.voltage',  // Fix: war 'value' → 'value.voltage'
                true,
                false,
                'V',              // Fix: Unit fehlte
            ],
            [`Diagnosis${ObjTowerString}.SOC`, 'state', 'SOC (Diagnosis)', 'number', 'value.battery', true, false, '%'],
            [`Diagnosis${ObjTowerString}.SOH`, 'state', 'State of Health', 'number', 'value.battery', true, false, '%'], // Fix: Role war 'value', Unit fehlte
            [
                `Diagnosis${ObjTowerString}.State`,
                'state',
                `Tower state ${towerNumber + 1}`,  // Fix: war ${towerNumber}${1} → erzeugte "01","11" etc.
                'string',
                'value',
                true,
                false,
                '',
            ],
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
            [
                `Diagnosis${ObjTowerString}.Current`,
                'state',
                'current +from/-to battery',
                'number',
                'value.current',  // Fix: war 'value' → 'value.current'
                true,
                false,
                'A',
            ],
        ];


        for (let i = 0; i < myObjects.length; i++) {
            adaptr.setObjectNotExists(myObjects[i][0], {
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
            checkandrepairUnit(adaptr, myObjects[i][0], myObjects[i][7], myObjects[i][5], myObjects[i][2]);
        }

        for (let i = 1; i <= hvsNumCells; i++) {
            adaptr.setObjectNotExists(`CellDetails${ObjTowerString}.CellVolt${adaptr.pad(i, 3)}`, {
                type: 'state',
                common: {
                    name: `Voltage Cell: ${adaptr.pad(i, 3)}`,
                    type: 'number',
                    role: 'value.voltage',
                    read: true,
                    write: false,
                    unit: 'mV',
                },
                native: {},
            });
            checkandrepairUnit(adaptr, `CellDetails${ObjTowerString}.CellVolt${adaptr.pad(i, 3)}`, 'mV', 'value.voltage', `Voltage Cell: ${adaptr.pad(i, 3)}`);
        }

        // Fix: CellTemp-Schleife war INNERHALB der CellVolt-Schleife (i-shadowing Bug!)
        // Dadurch wurden CellTemp-Objekte nur einmal (für die letzte Zelle) erstellt.
        for (let j = 1; j <= hvsNumTemps; j++) {
            adaptr.setObjectNotExists(`CellDetails${ObjTowerString}.CellTemp${adaptr.pad(j, 3)}`, {
                type: 'state',
                common: {
                    name: `Temp Cell: ${adaptr.pad(j, 3)}`,
                    type: 'number',
                    role: 'value.temperature',
                    read: true,
                    write: false,
                    unit: '°C',
                },
                native: {},
            });
            checkandrepairUnit(adaptr, `CellDetails${ObjTowerString}.CellTemp${adaptr.pad(j, 3)}`, '°C', 'value.temperature', `Temp Cell: ${adaptr.pad(j, 3)}`);
        }
    }
}

/**
 *
 * @param adaptr
 */
function setObjects(adaptr) {
    let myObjects = [
        ['System.Serial', 'state', 'Serial number', 'string', 'text', true, false, ''],
        ['System.BMU', 'state', 'F/W BMU', 'string', 'text', true, false, ''],
        ['System.BMS', 'state', 'F/W BMS', 'string', 'text', true, false, ''],
        ['System.BMUBankA', 'state', 'F/W BMU-BankA', 'string', 'text', true, false, ''],
        ['System.BMUBankB', 'state', 'F/W BMU-BankB', 'string', 'text', true, false, ''],
        ['System.Modules', 'state', 'Modules per Tower', 'number', 'value', true, false, ''],  // Fix: war 'modules (count)' – zeigt NUR Module pro Tower (Low-Nibble aus Byte[36])
        ['System.ModulesTotal', 'state', 'Total Modules (all Towers)', 'number', 'value', true, false, ''],
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
    if (adaptr.config.ConfStoreRawMessages) {
        myObjects = myObjects.concat(rawObjects);
    }

    for (let i = 0; i < myObjects.length; i++) {
        adaptr.setObjectNotExists(myObjects[i][0], {
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
        checkandrepairUnit(adaptr, myObject[0], myObject[7], myObject[4], myObject[2]);
    }
}

async function checkandrepairUnit(adaptr, id, NewUnit, NewRole, newName) {
    //want to test and understand async and await, so it's introduced here.
    //check for forgotten unit in first version and if it's missing add unit.
    try {
        const obj = await adaptr.getObjectAsync(id);
        if (NewUnit !== '') {
            if (obj.common.unit !== NewUnit) {
                adaptr.extendObject(id, { common: { unit: NewUnit } });
            }
        }
        if (obj.common.role === '') {
            adaptr.extendObject(id, { common: { role: NewRole } });
        }
        if (newName !== '') {
            if (obj.common.name !== newName) {
                adaptr.extendObject(id, { common: { name: newName } });
            }
        }
    } catch {
        //dann eben nicht.
    }
}

module.exports = {
    setObjectsCells,
    setObjects,
};
