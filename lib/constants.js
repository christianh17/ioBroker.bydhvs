'use strict';

const myRequests = [
    Buffer.from('010300000066c5e0', 'hex'), //0
    Buffer.from('01030500001984cc', 'hex'), //1
    Buffer.from('010300100003040e', 'hex'), //2
    Buffer.from('0110055000020400018100f853', 'hex'), //3 start measuring
    Buffer.from('010305510001d517', 'hex'), //4
    Buffer.from('01030558004104e5', 'hex'), //5
    Buffer.from('01030558004104e5', 'hex'), //6
    Buffer.from('01030558004104e5', 'hex'), //7
    Buffer.from('01030558004104e5', 'hex'), //8
    // to read the 5th module, the box must first be reconfigured
    Buffer.from('01100100000306444542554700176f', 'hex'), //9 switch to second turn for the last few cells
    Buffer.from('0110055000020400018100f853', 'hex'), //10 start measuring remaining cells (like 3)
    Buffer.from('010305510001d517', 'hex'), //11 (like 4)
    Buffer.from('01030558004104e5', 'hex'), //12 (like 5)
    Buffer.from('01030558004104e5', 'hex'), //13 (like 6)
    // The BYD tool also issues two more requests, probably to gather even more cells in some larger setups
    Buffer.from('01030558004104e5', 'hex'), //14 (like 7)
    Buffer.from('01030558004104e5', 'hex'), //15 (like 8)
    //
    // ONLY if two towers in parallel
    Buffer.from('01100550000204000281000853', 'hex'), // 16 - Switch to Box 2 -> 281
];

/* Während des Updates des BMS funktioniert das Auslesen offensichtlich nicht, hier die Antworten des Speichers (Seriennummer verfälscht und CRC des ersten Paketes nicht neu berechnet)
 1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 7 8 9 0 1 2 3 4 5 6 7 8 9 0
01 03 cc 50 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 30 78 78 78 78 78 03 0d 03 0f 03 14 01 00 03 12 02 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 02 00 00 00 15 04 0c 12 38 2b 82 b2
01 03 32 00 43 01 4a 01 4a 00 63 ff f8 52 a8 00 15 00 14 00 14 00 00 03 0f 00 00 00 00 00 00 09 02 00 02 52 76 17 03 00 00 13 84 00 00 00 02 09 02 00 00 04 2c 92 5b
01 03 06 03 12 02 01 01 00 c8 ad
01 90 04 4d c3 <- Das scheint eine Fehlercondition zu sein.
5 min. später klappte es wieder und dann war auch die neue F/W-Version in der Antwort enthalten
*/

const byd_stat_tower = [
    'Battery Over Voltage', // Bit 0
    'Battery Under Voltage', // Bit 1
    'Cells OverVoltage', // Bit 2
    'Cells UnderVoltage', // Bit 3
    'Cells Imbalance', // Bit 4
    'Charging High Temperature(Cells)', // Bit 5
    'Charging Low Temperature(Cells)', // Bit 6
    'DisCharging High Temperature(Cells)', // Bit 7
    'DisCharging Low Temperature(Cells)', // Bit 8
    'Charging OverCurrent(Cells)', // Bit 9
    'DisCharging OverCurrent(Cells)', // Bit 10
    'Charging OverCurrent(Hardware)', // Bit 11
    'Short Circuit', // Bit 12
    'Inversly Connection', // Bit 13
    'Interlock switch Abnormal', // Bit 14
    'AirSwitch Abnormal', // Bit 15
];

const myINVs = [
    'Fronius HV', //0
    'Goodwe HV', //1
    'Fronius HV', //2
    'Kostal HV', //3
    'Goodwe HV', //4
    'SMA SBS3.7/5.0', //5
    'Kostal HV', //6
    'SMA SBS3.7/5.0', //7
    'Sungrow HV', //8
    'Sungrow HV', //9
    'Kaco HV', //10
    'Kaco HV', //11
    'Ingeteam HV', //12
    'Ingeteam HV', //13
    'SMA SBS 2.5 HV', //14
    'undefined', //15
    'SMA SBS 2.5 HV', //16
    'Fronius HV', //17
    'undefined', //18
    'SMA STP', //19
];

const myINVsLVS = [
    'Fronius HV',
    'Goodwe HV',
    'Goodwe HV',
    'Kostal HV',
    'Selectronic LV',
    'SMA SBS3.7/5.0',
    'SMA LV',
    'Victron LV',
    'Suntech LV',
    'Sungrow HV',
    'Kaco HV',
    'Studer LV',
    'Solar Edge LV',
    'Ingeteam HV',
    'Sungrow LV',
    'Schneider LV',
    'SMA SBS2.5 HV',
    'Solar Edge LV',
    'Solar Edge LV',
    'Solar Edge LV',
    'unknown',
];

const myErrors = [
    'High Temperature Charging (Cells)',
    'Low Temperature Charging (Cells)',
    'Over Current Discharging',
    'Over Current Charging',
    'Main circuit Failure',
    'Short Current Alarm',
    'Cells Imbalance',
    'Current Sensor Failure',
    'Battery Over Voltage',
    'Battery Under Voltage',
    'Cell Over Voltage',
    'Cell Under Voltage',
    'Voltage Sensor Failure',
    'Temperature Sensor Failure',
    'High Temperature Discharging (Cells)',
    'Low Temperature Discharging (Cells)',
];

module.exports = {
    myRequests,
    byd_stat_tower,
    myINVs,
    myINVsLVS,
    myErrors,
};
