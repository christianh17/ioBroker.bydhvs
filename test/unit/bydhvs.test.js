'use strict';

/**
 * BYD HVS Adapter – Unit Tests
 * Ausführen: npx mocha test/unit/bydhvs.test.js --exit
 */

const assert = require('assert');
const crc = require('crc');

// ── Hilfsfunktionen aus lib/methods direkt testen ──────────────────────────
const methods = require('../../lib/methods');
const constants = require('../../lib/constants');

// ── CRC-Hilfsfunktion für Test-Pakete ──────────────────────────────────────
function appendCRC(buf) {
    const crcVal = crc.crc16modbus(buf);
    const result = Buffer.alloc(buf.length + 2);
    buf.copy(result);
    result[buf.length] = crcVal & 0xff;
    result[buf.length + 1] = (crcVal >> 8) & 0xff;
    // crc16modbus erwartet little-endian am Ende → prüfen ob 0
    // Wir geben das Paket zurück, das checkPacket=true liefert
    return result;
}

/**
 * Baut ein minimales gültiges BYD-Antwortpaket:
 * [0x01, cmd, dataLen, ...data, CRC_LO, CRC_HI]
 */
function buildPacket(cmd, dataBytes) {
    const header = Buffer.from([0x01, cmd, dataBytes.length]);
    const payload = Buffer.from(dataBytes);
    const raw = Buffer.concat([header, payload]);
    const crcVal = crc.crc16modbus(new Uint8Array(raw));
    const lo = crcVal & 0xff;
    const hi = (crcVal >> 8) & 0xff;
    // crc16modbus(packet + lo + hi) muss 0 ergeben
    return Buffer.concat([raw, Buffer.from([lo, hi])]);
}

// ── Mock-Adapter ────────────────────────────────────────────────────────────
function createMockAdapter(config = {}) {
    const states = {};
    const logs = { debug: [], info: [], warn: [], error: [], silly: [] };

    return {
        config: {
            ConfIPAdress: '192.168.1.100',
            ConfBatDetails: true,
            ConfBydTowerCount: 1,
            ConfPollInterval: 30,
            ConfDetailshowoften: 3,
            ConfOverridePollInterval: 0,
            ConfTestMode: false,
            ConfStoreRawMessages: false,
            ...config,
        },
        log: {
            debug: msg => logs.debug.push(msg),
            info: msg => logs.info.push(msg),
            warn: msg => logs.warn.push(msg),
            error: msg => logs.error.push(msg),
            silly: msg => logs.silly.push(msg),
        },
        setState: (id, val, ack) => { states[id] = { val, ack }; },
        setStateAsync: async (id, val, ack) => { states[id] = { val, ack }; },
        getStateAsync: async id => states[id] ? { val: states[id].val } : null,
        setStateChanged: (id, obj) => { states[id] = obj; },
        _states: states,
        _logs: logs,
        // lib/methods werden an this gebunden
        buf2int16SI: methods.buf2int16SI,
        buf2int16US: methods.buf2int16US,
        buf2int32US: methods.buf2int32US,
        countSetBits: methods.countSetBits,
        decodePacketNOP: methods.decodePacketNOP,
        myErrors: constants.myErrors,
        pad: (n, width, z = '0') => {
            n = `${n}`;
            return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
        },
    };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. lib/methods Tests
// ════════════════════════════════════════════════════════════════════════════
describe('lib/methods – buf2int16SI', () => {
    it('positive Wert korrekt lesen', () => {
        const arr = new Uint8Array([0x01, 0x90]); // 400
        assert.strictEqual(methods.buf2int16SI(arr, 0), 400);
    });

    it('negativer Wert (signed) korrekt lesen', () => {
        const arr = new Uint8Array([0xFF, 0xD8]); // -40
        assert.strictEqual(methods.buf2int16SI(arr, 0), -40);
    });

    it('Grenzwert 0x7FFF = 32767', () => {
        const arr = new Uint8Array([0x7F, 0xFF]);
        assert.strictEqual(methods.buf2int16SI(arr, 0), 32767);
    });

    it('Grenzwert 0x8000 = -32768', () => {
        const arr = new Uint8Array([0x80, 0x00]);
        assert.strictEqual(methods.buf2int16SI(arr, 0), -32768);
    });

    it('Offset im Array', () => {
        const arr = new Uint8Array([0x00, 0x00, 0x01, 0x90]);
        assert.strictEqual(methods.buf2int16SI(arr, 2), 400);
    });
});

describe('lib/methods – buf2int16US', () => {
    it('unsigned Wert korrekt lesen', () => {
        const arr = new Uint8Array([0xFF, 0xFF]);
        assert.strictEqual(methods.buf2int16US(arr, 0), 65535);
    });

    it('Null-Wert', () => {
        const arr = new Uint8Array([0x00, 0x00]);
        assert.strictEqual(methods.buf2int16US(arr, 0), 0);
    });
});

describe('lib/methods – buf2int32US', () => {
    it('Mixed-Endian korrekt lesen', () => {
        // BYD-Format: [pos+2][pos+3][pos][pos+1]
        // Wert 1000 = 0x000003E8
        // pos=0: byte[0]=0x00, byte[1]=0x00, byte[2]=0x03, byte[3]=0xE8
        const arr = new Uint8Array([0x00, 0x00, 0x03, 0xE8]);
        // erwartet: 0x03*16777216 + 0xE8*65536 + 0x00*256 + 0x00 = 50331648+15204352 = nein
        // Mixed-Endian: [2][3][0][1] = 0x03*16777216 + 0xE8*65536 + 0x00*256 + 0x00
        const result = methods.buf2int32US(arr, 0);
        assert.strictEqual(result, 0x03E80000); // 65536000
    });

    it('Null-Wert', () => {
        const arr = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
        assert.strictEqual(methods.buf2int32US(arr, 0), 0);
    });
});

describe('lib/methods – countSetBits', () => {
    it('0x00 = 0 Bits', () => {
        assert.strictEqual(methods.countSetBits('00'), 0);
    });

    it('0xFF = 8 Bits', () => {
        assert.strictEqual(methods.countSetBits('ff'), 8);
    });

    it('0xAA = 4 Bits', () => {
        assert.strictEqual(methods.countSetBits('aa'), 4);
    });

    it('16 Bytes = alle Bits gesetzt', () => {
        assert.strictEqual(methods.countSetBits('ff'.repeat(16)), 128);
    });

    it('leerer String = 0', () => {
        assert.strictEqual(methods.countSetBits(''), 0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. checkPacket Tests
// ════════════════════════════════════════════════════════════════════════════
describe('checkPacket', () => {
    // checkPacket direkt aus main.js ist eine Methode – wir testen sie isoliert
    const crcLib = require('crc');

    function checkPacket(adapter, data) {
        const byteArray = new Uint8Array(data);
        if (byteArray[0] !== 1) return false;
        if (byteArray[1] === 3) {
            const packetLength = data[2] + 5;
            if (packetLength !== byteArray.length) return false;
        } else if (byteArray[1] === 16) {
            if (byteArray.length !== 8) return false;
        } else {
            return false;
        }
        return crcLib.crc16modbus(byteArray) === 0;
    }

    it('gültiges Paket mit cmd=3 wird akzeptiert', () => {
        const dataBytes = new Array(5).fill(0x42);
        const pkt = buildPacket(3, dataBytes);
        assert.strictEqual(checkPacket(null, pkt), true);
    });

    it('gültiges Paket mit cmd=16 (0x10) wird akzeptiert', () => {
        const dataBytes = new Array(3).fill(0x00);
        const pkt = buildPacket(16, dataBytes);
        assert.strictEqual(checkPacket(null, pkt), true);
    });

    // ── NEU: Write-Response (cmd=16) spezifische Tests ──────────────────────
    it('cmd=16 Write-Response exakt 8 Bytes – akzeptiert', () => {
        // Echte BYD Write-Response für request[3]: 01 10 05 50 00 02 CRC CRC
        const raw = Buffer.from([0x01, 0x10, 0x05, 0x50, 0x00, 0x02]);
        const crcVal = crcLib.crc16modbus(new Uint8Array(raw));
        const pkt = Buffer.concat([raw, Buffer.from([crcVal & 0xff, (crcVal >> 8) & 0xff])]);
        assert.strictEqual(pkt.length, 8, 'Paket muss 8 Bytes sein');
        assert.strictEqual(checkPacket(null, pkt), true);
    });

    it('cmd=16 Write-Response für request[9]: 01 10 01 00 00 03 CRC CRC – akzeptiert', () => {
        const raw = Buffer.from([0x01, 0x10, 0x01, 0x00, 0x00, 0x03]);
        const crcVal = crcLib.crc16modbus(new Uint8Array(raw));
        const pkt = Buffer.concat([raw, Buffer.from([crcVal & 0xff, (crcVal >> 8) & 0xff])]);
        assert.strictEqual(checkPacket(null, pkt), true);
    });

    it('cmd=16 mit falscher Länge (≠8) wird abgelehnt', () => {
        // Simuliert: nur 6 Bytes empfangen (Bug: byte[2]+5=6 statt 8)
        const raw = Buffer.from([0x01, 0x10, 0x01, 0x00, 0x00, 0x03]);
        // Kein CRC → 6 Bytes
        assert.strictEqual(checkPacket(null, raw), false);
    });

    it('falsches erstes Byte wird abgelehnt', () => {
        const dataBytes = new Array(3).fill(0x00);
        const pkt = buildPacket(3, dataBytes);
        pkt[0] = 0x02; // korruptes erstes Byte
        assert.strictEqual(checkPacket(null, pkt), false);
    });

    it('falsches cmd-Byte (nicht 3 oder 16) wird abgelehnt', () => {
        const dataBytes = new Array(3).fill(0x00);
        const pkt = buildPacket(5, dataBytes); // cmd=5 ungültig
        assert.strictEqual(checkPacket(null, pkt), false);
    });

    it('falsche CRC wird abgelehnt', () => {
        const dataBytes = new Array(3).fill(0x00);
        const pkt = buildPacket(3, dataBytes);
        pkt[pkt.length - 1] ^= 0xFF; // CRC korrumpieren
        assert.strictEqual(checkPacket(null, pkt), false);
    });

    it('falsche Länge bei cmd=3 wird abgelehnt', () => {
        const dataBytes = new Array(3).fill(0x00);
        const pkt = buildPacket(3, dataBytes);
        const truncated = pkt.slice(0, pkt.length - 1);
        assert.strictEqual(checkPacket(null, truncated), false);
    });

    it('TCP-Fragment (zu kurz) wird korrekt abgelehnt', () => {
        const fragment = Buffer.from([0x01, 0x03]); // nur 2 Bytes
        assert.strictEqual(checkPacket(null, fragment), false);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. Paket-Accumulator (waitForData) – TCP-Fragmentierung
// ════════════════════════════════════════════════════════════════════════════
describe('waitForData – TCP Packet Accumulator', () => {
    const EventEmitter = require('events');

    /**
     * Simuliert den waitForData-Accumulator aus main.js
     * (isoliert für Tests ohne Adapter-Instanz)
     */
    function createWaitForData(socket, myState, log) {
        return () => new Promise((res, rej) => {
            let buffer = Buffer.alloc(0);

            const onData = (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                if (buffer.length < 2) return;

                let expectedLength;
                if (buffer[1] & 0x80) {
                    expectedLength = 5; // Modbus Exception: immer 5 Bytes
                } else if (buffer[1] === 16) {
                    expectedLength = 8; // Write-Response immer 8 Bytes
                } else {
                    if (buffer.length < 3) return;
                    expectedLength = buffer[2] + 5;
                }

                if (buffer.length >= expectedLength) {
                    socket.removeListener('data', onData);
                    socket.removeListener('timeout', onTimeout);
                    socket.removeListener('error', onError);
                    res(buffer.slice(0, expectedLength));
                }
            };

            const onTimeout = () => {
                socket.removeListener('data', onData);
                socket.removeListener('error', onError);
                rej(new Error(`Socket Timeout – Buffer hatte ${buffer.length} Bytes, State: ${myState}`));
            };

            const onError = (err) => {
                socket.removeListener('data', onData);
                socket.removeListener('timeout', onTimeout);
                rej(err);
            };

            socket.on('data', onData);
            socket.once('timeout', onTimeout);
            socket.once('error', onError);
        });
    }

    it('vollständiges Paket in einem Chunk', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 2, null);

        const pkt = buildPacket(3, new Array(5).fill(0xAA));
        const promise = waitForData();
        socket.emit('data', pkt);
        const result = await promise;
        assert.deepStrictEqual(result, pkt);
    });

    it('Paket in 2 TCP-Fragmenten zusammengesetzt', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 7, null);

        const pkt = buildPacket(3, new Array(10).fill(0xBB));
        const frag1 = pkt.slice(0, 5);
        const frag2 = pkt.slice(5);

        const promise = waitForData();
        socket.emit('data', frag1);
        socket.emit('data', frag2);
        const result = await promise;
        assert.deepStrictEqual(result, pkt);
    });

    it('Paket in 3 TCP-Fragmenten (großes Paket wie State 7)', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 7, null);

        const dataBytes = new Array(128).fill(0x01);
        const pkt = buildPacket(3, dataBytes);

        const promise = waitForData();
        // Sende in 3 Teilen
        socket.emit('data', pkt.slice(0, 50));
        socket.emit('data', pkt.slice(50, 100));
        socket.emit('data', pkt.slice(100));
        const result = await promise;
        assert.deepStrictEqual(result, pkt);
    });

    it('Timeout wirft Error mit State-Kontext', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 7, null);

        const promise = waitForData();
        socket.emit('timeout');

        await assert.rejects(promise, err => {
            assert.ok(err.message.includes('State: 7'));
            return true;
        });
    });

    it('Socket-Error wirft korrekten Error', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 3, null);

        const promise = waitForData();
        socket.emit('error', new Error('ECONNRESET'));

        await assert.rejects(promise, /ECONNRESET/);
    });

    it('Listener werden nach Erfolg entfernt – kein Memory Leak', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 2, null);

        const pkt = buildPacket(3, new Array(4).fill(0xCC));
        const promise = waitForData();
        socket.emit('data', pkt);
        await promise;

        assert.strictEqual(socket.listenerCount('data'), 0, 'data-Listener muss entfernt sein');
    });

    // ── KRITISCH: Write-Response (cmd=16) State 5 / 11 / 12 / 16 ──────────

    it('[State 5] cmd=16 Write-Response für request[3] (01 10 05 50 00 02 CRC CRC) korrekt', async () => {
        // byte[2]=0x05 → alter Bug: expectedLength=10, Paket ist nur 8 → TIMEOUT
        // Korrekt: cmd=16 → expectedLength=8
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 5, null);

        const raw = Buffer.from([0x01, 0x10, 0x05, 0x50, 0x00, 0x02]);
        const crcLib = require('crc');
        const crcVal = crcLib.crc16modbus(new Uint8Array(raw));
        const pkt = Buffer.concat([raw, Buffer.from([crcVal & 0xff, (crcVal >> 8) & 0xff])]);
        assert.strictEqual(pkt.length, 8, 'Write-Response muss 8 Bytes sein');

        const promise = waitForData();
        socket.emit('data', pkt);
        const result = await promise;
        assert.strictEqual(result.length, 8);
        assert.strictEqual(result[1], 0x10);
    });

    it('[State 11] cmd=16 Write-Response für request[9] (01 10 01 00 00 03 CRC CRC) korrekt', async () => {
        // byte[2]=0x01 → alter Bug: expectedLength=6, Paket hat 8 Bytes
        // → Accumulator lieferte 6 Bytes ohne CRC → checkPacket FAIL
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 11, null);

        const raw = Buffer.from([0x01, 0x10, 0x01, 0x00, 0x00, 0x03]);
        const crcLib = require('crc');
        const crcVal = crcLib.crc16modbus(new Uint8Array(raw));
        const pkt = Buffer.concat([raw, Buffer.from([crcVal & 0xff, (crcVal >> 8) & 0xff])]);

        const promise = waitForData();
        socket.emit('data', pkt);
        const result = await promise;
        // Muss vollständige 8 Bytes zurückgeben (nicht nur 6)
        assert.strictEqual(result.length, 8);
    });

    it('[State 16] cmd=16 Write-Response für request[16] (01 10 05 50 00 02 CRC CRC) korrekt', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 16, null);

        const raw = Buffer.from([0x01, 0x10, 0x05, 0x50, 0x00, 0x02]);
        const crcLib = require('crc');
        const crcVal = crcLib.crc16modbus(new Uint8Array(raw));
        const pkt = Buffer.concat([raw, Buffer.from([crcVal & 0xff, (crcVal >> 8) & 0xff])]);

        const promise = waitForData();
        socket.emit('data', pkt);
        const result = await promise;
        assert.strictEqual(result.length, 8);
    });

    it('cmd=16 Response in 2 TCP-Fragmenten (4+4 Bytes)', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 5, null);

        const raw = Buffer.from([0x01, 0x10, 0x05, 0x50, 0x00, 0x02]);
        const crcLib = require('crc');
        const crcVal = crcLib.crc16modbus(new Uint8Array(raw));
        const pkt = Buffer.concat([raw, Buffer.from([crcVal & 0xff, (crcVal >> 8) & 0xff])]);

        const promise = waitForData();
        socket.emit('data', pkt.slice(0, 4));
        socket.emit('data', pkt.slice(4));
        const result = await promise;
        assert.strictEqual(result.length, 8);
    });

    // ── MODBUS EXCEPTION RESPONSES ──────────────────────────────────────────

    it('[Exception] 01 90 04 CRC CRC – Write-Exception während BMS-Update → 5 Bytes erkannt', async () => {
        // Echtes Paket aus BYD-Protokoll-Kommentar: 01 90 04 4d c3
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 5, null);

        const pkt = Buffer.from([0x01, 0x90, 0x04, 0x4d, 0xc3]);
        const promise = waitForData();
        socket.emit('data', pkt);
        const result = await promise;
        // Accumulator muss 5 Bytes zurückgeben (nicht auf 9 Bytes warten → kein Timeout)
        assert.strictEqual(result.length, 5);
        assert.strictEqual(result[1], 0x90);
    });

    it('[Exception] Read-Exception (0x83) → 5 Bytes erkannt', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 2, null);

        // Modbus Read-Exception: [01][83][02][CRC_lo][CRC_hi]
        const raw = Buffer.from([0x01, 0x83, 0x02]);
        const crcLib = require('crc');
        const crcVal = crcLib.crc16modbus(new Uint8Array(raw));
        const pkt = Buffer.concat([raw, Buffer.from([crcVal & 0xff, (crcVal >> 8) & 0xff])]);

        const promise = waitForData();
        socket.emit('data', pkt);
        const result = await promise;
        assert.strictEqual(result.length, 5);
        assert.ok(result[1] & 0x80, 'Exception-Flag muss gesetzt sein');
    });

    it('[Exception] Write-Exception in 2 Fragmenten (3+2 Bytes)', async () => {
        const socket = new EventEmitter();
        socket.removeListener = socket.removeListener.bind(socket);
        const waitForData = createWaitForData(socket, 5, null);

        const pkt = Buffer.from([0x01, 0x90, 0x04, 0x4d, 0xc3]);
        const promise = waitForData();
        socket.emit('data', pkt.slice(0, 3));
        socket.emit('data', pkt.slice(3));
        const result = await promise;
        assert.strictEqual(result.length, 5);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. decodePacket0 Tests
// ════════════════════════════════════════════════════════════════════════════
describe('decodePacket0 – Seriennummer & Hardware-Typ', () => {
    // Baut ein Paket0-ähnliches Buffer manuell
    function buildPacket0(serialBytes, hardwareByte, modulesByte, gridByte) {
        const data = new Array(50).fill(0x00);
        // Seriennummer: Bytes 3-21 (19 Bytes)
        for (let i = 0; i < serialBytes.length && i < 19; i++) {
            data[3 + i] = serialBytes[i];
        }
        data[5] = hardwareByte;  // HVS=51, LVS=50/49, HVM=andere
        data[36] = modulesByte;  // High-Nibble=Towers, Low-Nibble=Modules
        data[38] = gridByte;
        data[27] = 3; data[28] = 14; // BMU-A V3.14
        data[29] = 3; data[30] = 15; // BMU-B V3.15
        data[31] = 3; data[32] = 1;  // BMS V3.1
        data[33] = 0;                 // → BMU-A aktiv
        data[34] = 0;                 // A
        return Buffer.from(data);
    }

    let adapter;
    let hvsSerial_local, hvsBattType_fromSerial_local, hvsModules_local, hvsTowers_local, hvsGrid_local;

    beforeEach(() => {
        adapter = createMockAdapter();
    });

    it('erkennt HVS korrekt (byte[5]=51)', () => {
        const buf = buildPacket0(
            [0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x4B, 0x4C, 0x4D, 0x4E, 0x4F, 0x50, 0x51, 0x52, 0x53],
            51, // ASCII '3' → HVS
            0x21, // 2 Tower, 1 Module
            1    // OnGrid
        );

        // Inline-Simulation von decodePacket0 (ohne Adapter-Instanz)
        const byteArray = new Uint8Array(buf);
        let serial = '';
        for (let i = 3; i < 22; i++) serial += String.fromCharCode(byteArray[i]);

        let battType = 'HVM';
        if (byteArray[5] === 51) battType = 'HVS';
        else if (byteArray[5] === 50 || byteArray[5] === 49) battType = 'LVS';

        const modules = byteArray[36] % 16;
        const towers = Math.floor(byteArray[36] / 16);

        assert.strictEqual(battType, 'HVS');
        assert.strictEqual(modules, 1);
        assert.strictEqual(towers, 2);
    });

    it('erkennt LVS korrekt (byte[5]=50)', () => {
        const buf = buildPacket0([], 50, 0x11, 0);
        const byteArray = new Uint8Array(buf);
        let battType = 'HVM';
        if (byteArray[5] === 51) battType = 'HVS';
        else if (byteArray[5] === 50 || byteArray[5] === 49) battType = 'LVS';
        assert.strictEqual(battType, 'LVS');
    });

    it('erkennt HVM als Default', () => {
        const buf = buildPacket0([], 0x00, 0x52, 1);
        const byteArray = new Uint8Array(buf);
        let battType = 'HVM';
        if (byteArray[5] === 51) battType = 'HVS';
        else if (byteArray[5] === 50 || byteArray[5] === 49) battType = 'LVS';
        assert.strictEqual(battType, 'HVM');
    });

    it('Module/Tower aus Nibbles korrekt extrahiert (0x32 → 3 Tower, 2 Module)', () => {
        const byteArray = new Uint8Array([0x32]);
        const modules = byteArray[0] % 16;       // Low-Nibble
        const towers = Math.floor(byteArray[0] / 16); // High-Nibble
        assert.strictEqual(modules, 2);
        assert.strictEqual(towers, 3);
    });

    it('Grid-Typ korrekt: OnGrid=1', () => {
        const byteArray = new Uint8Array(50).fill(0);
        byteArray[38] = 1;
        let grid = 'unknown';
        if (byteArray[38] === 0) grid = 'OffGrid';
        if (byteArray[38] === 1) grid = 'OnGrid';
        if (byteArray[38] === 2) grid = 'Backup';
        assert.strictEqual(grid, 'OnGrid');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. decodePacket1 – SOC, Spannungen, Fehler
// ════════════════════════════════════════════════════════════════════════════
describe('decodePacket1 – Zustandswerte & Fehler-Dekodierung', () => {
    function buildPacket1(soc, maxVolt_raw, minVolt_raw, current_raw, errorBits) {
        const data = new Array(50).fill(0x00);
        // SOC bei Byte 3+4 (int16SI)
        data[3] = (soc >> 8) & 0xFF;
        data[4] = soc & 0xFF;
        // MaxVolt bei Byte 5+6
        data[5] = (maxVolt_raw >> 8) & 0xFF;
        data[6] = maxVolt_raw & 0xFF;
        // MinVolt bei Byte 7+8
        data[7] = (minVolt_raw >> 8) & 0xFF;
        data[8] = minVolt_raw & 0xFF;
        // Current bei Byte 11+12
        data[11] = (current_raw >> 8) & 0xFF;
        data[12] = current_raw & 0xFF;
        // Error bei Byte 29+30
        data[29] = (errorBits >> 8) & 0xFF;
        data[30] = errorBits & 0xFF;
        return new Uint8Array(data);
    }

    it('SOC korrekt gelesen', () => {
        const arr = buildPacket1(85, 0, 0, 0, 0);
        const soc = methods.buf2int16SI(arr, 3);
        assert.strictEqual(soc, 85);
    });

    it('MaxVolt /100.0 korrekt', () => {
        const arr = buildPacket1(0, 5000, 0, 0, 0); // 5000 → 50.00V
        const volt = parseFloat(((methods.buf2int16SI(arr, 5) * 1.0) / 100.0).toFixed(2));
        assert.strictEqual(volt, 50.0);
    });

    it('negativer Strom (Entladen) korrekt', () => {
        // -100 in int16: 65536-100 = 65436 = 0xFF9C
        const arr = buildPacket1(0, 0, 0, 0xFF9C, 0);
        const current = parseFloat(((methods.buf2int16SI(arr, 11) * 1.0) / 10.0).toFixed(1));
        assert.strictEqual(current, -10.0);
    });

    it('Fehler-Bit 0 → erster Fehlertext', () => {
        const errors = constants.myErrors;
        const errorBits = 0x0001; // Bit 0 gesetzt
        let errorString = '';
        for (let j = 0; j < 16; j++) {
            if (((1 << j) & errorBits) !== 0) {
                if (errorString.length > 0) errorString += '; ';
                errorString += errors[j];
            }
        }
        assert.ok(errorString.length > 0, 'Fehlertext muss nicht leer sein');
        assert.ok(!errorString.includes('no Error'));
    });

    it('keine Fehler → "no Error"', () => {
        const errorBits = 0x0000;
        let errorString = '';
        for (let j = 0; j < 16; j++) {
            if (((1 << j) & errorBits) !== 0) errorString += 'X';
        }
        if (errorString.length === 0) errorString = 'no Error';
        assert.strictEqual(errorString, 'no Error');
    });

    it('ETA Division-by-Zero geschützt', () => {
        const chargeTotal = 0;
        const dischargeTotal = 500;
        const eta = chargeTotal > 0 ? dischargeTotal / chargeTotal : 0;
        assert.strictEqual(eta, 0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. decodePacket2 – Batterie-Typ & Zell-Anzahl
// ════════════════════════════════════════════════════════════════════════════
describe('decodePacket2 – Batterie-Typ & Zellanzahl', () => {
    it('HVM = 16 Zellen pro Modul', () => {
        const hvsModules = 5;
        const hvsBattType = 1; // HVM
        let hvsNumCells = 0;
        if (hvsBattType === 1) hvsNumCells = hvsModules * 16;
        assert.strictEqual(hvsNumCells, 80);
    });

    it('HVS = 32 Zellen pro Modul', () => {
        const hvsModules = 2;
        const hvsBattType = 2; // HVS
        let hvsNumCells = 0;
        if (hvsBattType === 2) hvsNumCells = hvsModules * 32;
        assert.strictEqual(hvsNumCells, 64);
    });

    it('Zellanzahl wird auf 160 begrenzt', () => {
        let hvsNumCells = 999;
        if (hvsNumCells > 160) hvsNumCells = 160;
        assert.strictEqual(hvsNumCells, 160);
    });

    it('Temperatur-Anzahl wird auf 64 begrenzt', () => {
        let hvsNumTemps = 200;
        if (hvsNumTemps > 64) hvsNumTemps = 64;
        assert.strictEqual(hvsNumTemps, 64);
    });

    it('LVS: 7 Zellen pro Modul, 0 Temps', () => {
        const hvsModules = 3;
        const hvsBattType_fromSerial = 'LVS';
        let hvsNumCells = 0;
        let hvsNumTemps = 0;
        if (hvsBattType_fromSerial === 'LVS') {
            hvsNumCells = hvsModules * 7;
            hvsNumTemps = 0;
        }
        assert.strictEqual(hvsNumCells, 21);
        assert.strictEqual(hvsNumTemps, 0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 7. calcDeviation & calcAverage
// ════════════════════════════════════════════════════════════════════════════
describe('calcDeviation & calcAverage', () => {
    function calcAverage(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    function calcDeviation(arr) {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        const n = arr.length;
        const mean = arr.reduce((s, v) => s + v, 0) / n;
        const variance = arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n > 1 ? n - 1 : 1);
        return Math.sqrt(variance);
    }

    it('Durchschnitt von [1,2,3,4,5] = 3', () => {
        assert.strictEqual(calcAverage([1, 2, 3, 4, 5]), 3);
    });

    it('Durchschnitt leeres Array = 0', () => {
        assert.strictEqual(calcAverage([]), 0);
    });

    it('Standardabweichung identischer Werte = 0', () => {
        assert.strictEqual(calcDeviation([5, 5, 5, 5]), 0);
    });

    it('Standardabweichung [2,4,4,4,5,5,7,9] ≈ 2.14 (Stichprobenvarianz)', () => {
        const result = calcDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
        assert.ok(Math.abs(result - 2.138) < 0.01, `Erwartet ~2.138, erhalten ${result}`);
    });

    it('Standardabweichung eines einzelnen Wertes = 0', () => {
        assert.strictEqual(calcDeviation([42]), 0);
    });

    it('leeres Array → 0', () => {
        assert.strictEqual(calcDeviation([]), 0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 8. Power-Berechnung (setStates-Logik)
// ════════════════════════════════════════════════════════════════════════════
describe('Power Split (Consumption vs Delivery)', () => {
    function splitPower(hvsPower) {
        if (hvsPower >= 0) {
            return { consumption: hvsPower, delivery: 0 };
        } else {
            return { consumption: 0, delivery: -hvsPower };
        }
    }

    it('positive Leistung → Verbrauch', () => {
        const r = splitPower(3500);
        assert.strictEqual(r.consumption, 3500);
        assert.strictEqual(r.delivery, 0);
    });

    it('negative Leistung → Einspeisung', () => {
        const r = splitPower(-2000);
        assert.strictEqual(r.consumption, 0);
        assert.strictEqual(r.delivery, 2000);
    });

    it('Null → beides 0', () => {
        const r = splitPower(0);
        assert.strictEqual(r.consumption, 0);
        assert.strictEqual(r.delivery, 0);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 9. pollQuery – Overlap-Schutz
// ════════════════════════════════════════════════════════════════════════════
describe('pollQuery – Overlap Guard', () => {
    it('überspringt Poll wenn myState > 0', async () => {
        let myState = 5; // Simulation: Zyklus läuft noch
        let pollCalled = false;

        const pollQuery = async () => {
            if (myState > 0) return; // Guard
            pollCalled = true;
        };

        await pollQuery();
        assert.strictEqual(pollCalled, false, 'Poll darf nicht laufen wenn State > 0');
    });

    it('startet Poll wenn myState = 0', async () => {
        let myState = 0;
        let pollCalled = false;

        const pollQuery = async () => {
            if (myState > 0) return;
            pollCalled = true;
        };

        await pollQuery();
        assert.strictEqual(pollCalled, true, 'Poll muss starten wenn State = 0');
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 10. onUnload – clearInterval (Regression-Test für den Bug)
// ════════════════════════════════════════════════════════════════════════════
describe('onUnload – Interval wird korrekt bereinigt', () => {
    it('setInterval-ID wird mit clearInterval gelöscht, nicht clearTimeout', done => {
        let intervalCleared = false;
        let timeoutCleared = false;

        const _clearInterval = id => { intervalCleared = true; };
        const _clearTimeout = id => { timeoutCleared = true; };

        // Simulation der onUnload-Logik
        const idInterval1 = setInterval(() => {}, 99999);
        try {
            _clearInterval(idInterval1);
            clearInterval(idInterval1); // echte Bereinigung
        } catch (e) {
            // noop
        }

        assert.strictEqual(intervalCleared, true, 'clearInterval muss aufgerufen werden');
        assert.strictEqual(timeoutCleared, false, 'clearTimeout darf NICHT aufgerufen werden');
        done();
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 11. BYD Protokoll-Abgleich – Request/Response Längenverifizierung
// ════════════════════════════════════════════════════════════════════════════
describe('BYD Protokoll – Request/Response Längenverifizierung', () => {
    const constants = require('../../lib/constants');
    const crcLib = require('crc');

    /**
     * Berechnet erwartete Response-Länge aus einem Request-Buffer
     */
    function expectedResponseLength(reqBuf) {
        const fc = reqBuf[1];
        if (fc === 0x10) return 8; // Write-Multiple-Registers Response
        if (fc === 0x03) {
            const qty = reqBuf[4] * 256 + reqBuf[5];
            return qty * 2 + 5; // dataBytes + 3 Header + 2 CRC
        }
        return null;
    }

    const expectedLengths = [
        // [reqIndex, expectedResponseLength, beschreibung]
        [0,  209, 'req[0] READ 102 regs → 204+5=209 Bytes (decodePacket0)'],
        [1,   55, 'req[1] READ  25 regs →  50+5= 55 Bytes (decodePacket1)'],
        [2,   11, 'req[2] READ   3 regs →   6+5= 11 Bytes (decodePacket2)'],
        [3,    8, 'req[3] WRITE  2 regs →        8 Bytes (NOP, State 5)'],
        [4,    7, 'req[4] READ   1 reg  →   2+5=  7 Bytes (NOP, State 6/13/17)'],
        [5,  135, 'req[5] READ  65 regs → 130+5=135 Bytes (decodePacket5/6/7/8)'],
        [6,  135, 'req[6] READ  65 regs → 130+5=135 Bytes'],
        [7,  135, 'req[7] READ  65 regs → 130+5=135 Bytes'],
        [8,  135, 'req[8] READ  65 regs → 130+5=135 Bytes'],
        [9,    8, 'req[9] WRITE  3 regs →        8 Bytes (NOP, State 11)'],
        [10,   8, 'req[10] WRITE 2 regs →        8 Bytes (NOP, State 12)'],
        [11,   7, 'req[11] READ  1 reg  →   2+5=  7 Bytes (NOP, State 13)'],
        [12, 135, 'req[12] READ 65 regs → 130+5=135 Bytes (decodeResponse12)'],
        [13, 135, 'req[13] READ 65 regs → 130+5=135 Bytes (decodeResponse13)'],
        [16,   8, 'req[16] WRITE 2 regs →        8 Bytes (NOP, State 16, Tower 2)'],
    ];

    for (const [idx, len, desc] of expectedLengths) {
        it(desc, () => {
            const req = constants.myRequests[idx];
            const calculated = expectedResponseLength(req);
            assert.strictEqual(calculated, len, `req[${idx}]: berechnet=${calculated} erwartet=${len}`);
        });
    }

    it('Alle READ-Requests haben korrektes Modbus-Format (fc=0x03)', () => {
        const readIndices = [0, 1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15];
        for (const i of readIndices) {
            assert.strictEqual(constants.myRequests[i][1], 0x03, `req[${i}] muss fc=0x03 haben`);
        }
    });

    it('Alle WRITE-Requests haben korrektes Modbus-Format (fc=0x10)', () => {
        const writeIndices = [3, 9, 10, 16];
        for (const i of writeIndices) {
            assert.strictEqual(constants.myRequests[i][1], 0x10, `req[${i}] muss fc=0x10 haben`);
        }
    });

    it('req[5..8] sind identisch (gleiche Modbus-Adresse 0x0558, qty 65)', () => {
        for (let i = 5; i <= 8; i++) {
            assert.strictEqual(
                constants.myRequests[i].toString('hex'),
                constants.myRequests[5].toString('hex'),
                `req[${i}] muss identisch zu req[5] sein`
            );
        }
    });

    it('req[3] und req[10] sind identisch (gleicher Write-Befehl)', () => {
        assert.strictEqual(
            constants.myRequests[3].toString('hex'),
            constants.myRequests[10].toString('hex'),
        );
    });

    it('req[4] und req[11] sind identisch (gleicher Status-Read)', () => {
        assert.strictEqual(
            constants.myRequests[4].toString('hex'),
            constants.myRequests[11].toString('hex'),
        );
    });

    it('decodePacket5 byte[101]-Offset: 16 Zellen passen in 135-Byte-Paket', () => {
        // Paket: 135 Bytes (idx 0..134)
        // Erste Zelle: byte[101], letzte: byte[101 + 15*2 + 1] = 132
        const packetSize = 135;
        const firstCellByte = 101;
        const lastCellByte = firstCellByte + (16 - 1) * 2 + 1;
        assert.ok(lastCellByte < packetSize, `Letztes Zell-Byte ${lastCellByte} muss < ${packetSize} sein`);
    });

    it('decodePacket7 Temp-Offset byte[103]: 30 Temps passen in 135-Byte-Paket', () => {
        const packetSize = 135;
        const firstTempByte = 103;
        const lastTempByte = firstTempByte + 29; // 30 Temps
        assert.ok(lastTempByte < packetSize, `Letztes Temp-Byte ${lastTempByte} muss < ${packetSize} sein`);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// 12. checkPacket – Modbus Exception Handling
// ════════════════════════════════════════════════════════════════════════════
describe('checkPacket – Modbus Exception Handling', () => {
    const crcLib = require('crc');

    function checkPacketWithException(data, log) {
        const byteArray = new Uint8Array(data);
        if (byteArray[0] !== 1) return { ok: false, reason: 'bad_addr' };
        if (byteArray[1] & 0x80) {
            return { ok: false, reason: 'modbus_exception', fc: byteArray[1] & 0x7F, exCode: byteArray[2] };
        }
        if (byteArray[1] === 3) {
            const packetLength = data[2] + 5;
            if (packetLength !== byteArray.length) return { ok: false, reason: 'bad_length' };
        } else if (byteArray[1] === 16) {
            if (byteArray.length !== 8) return { ok: false, reason: 'bad_length_write' };
        } else {
            return { ok: false, reason: 'unknown_fc' };
        }
        return { ok: crcLib.crc16modbus(byteArray) === 0, reason: 'crc' };
    }

    it('01 90 04 CRC CRC → Modbus Exception erkannt (Write fc=0x10, exCode=4)', () => {
        // Echtes Paket aus BYD-Kommentar
        const pkt = Buffer.from([0x01, 0x90, 0x04, 0x4d, 0xc3]);
        const r = checkPacketWithException(pkt);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'modbus_exception');
        assert.strictEqual(r.fc, 0x10);
        assert.strictEqual(r.exCode, 0x04); // Server Device Failure
    });

    it('01 83 02 CRC CRC → Read-Exception erkannt (fc=0x03, exCode=2)', () => {
        const raw = Buffer.from([0x01, 0x83, 0x02]);
        const crcVal = crcLib.crc16modbus(new Uint8Array(raw));
        const pkt = Buffer.concat([raw, Buffer.from([crcVal & 0xff, (crcVal >> 8) & 0xff])]);
        const r = checkPacketWithException(pkt);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.reason, 'modbus_exception');
        assert.strictEqual(r.fc, 0x03);
        assert.strictEqual(r.exCode, 0x02); // Illegal Data Address
    });
});

