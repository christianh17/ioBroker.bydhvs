'use strict';

function buf2int16SI(byteArray, pos) {
    //signed
    let result = 0;
    result = byteArray[pos] * 256 + byteArray[pos + 1];
    if (result > 32768) {
        result -= 65536;
    }
    return result;
}

function buf2int16US(byteArray, pos) {
    //unsigned
    let result = 0;
    result = byteArray[pos] * 256 + byteArray[pos + 1];
    return result;
}

function buf2int32US(byteArray, pos) {
    //unsigned
    let result = 0;
    result = byteArray[pos + 2] * 16777216 + byteArray[pos + 3] * 65536 + byteArray[pos] * 256 + byteArray[pos + 1];
    return result;
}

function decodePacketNOP(_data) {
    this.log.silly('Packet NOP');
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

module.exports = {
    buf2int16SI,
    buf2int16US,
    buf2int32US,
    decodePacketNOP,
    countSetBits,
};
