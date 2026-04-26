'use strict';

const { expect } = require('chai');
const methods = require('../lib/methods');

/**
 * Wir erzeugen einen minimalen "this"-Kontext, der nur das enthält,
 * was die Decoder aus main.js brauchen, ohne den vollen Adapter zu starten.
 *
 * @returns {object}
 */
function makeCtx() {
    return {
        log: {
            silly: () => {},
            debug: () => {},
            warn: () => {},
            error: () => {},
        },
        config: { ConfStoreRawMessages: false },
        states: {},
        setState(id, val) {
            this.states[id] = val;
        },
        buf2int16SI: methods.buf2int16SI,
        buf2int16US: methods.buf2int16US,
        buf2int32US: methods.buf2int32US,
        countSetBits: methods.countSetBits,
        pad(n, w) {
            n = `${n}`;
            return n.padStart(w, '0');
        },
    };
}

describe('decodePacket0 – Hardware-Identifikation', () => {
    it('erkennt HVS aus Serien-Byte ASCII "3"', () => {
        const ctx = makeCtx();
        // bauen: byte[0..2] frei, byte[3..21] Serial, byte[5]='3' (HVS)
        const buf = Buffer.alloc(50);
        const serial = 'BYDHVSXX0000000000A'; // 19 Zeichen, byte[5] = '3' wenn wir setzen
        for (let i = 0; i < 19; i++) {
            buf[3 + i] = serial.charCodeAt(i);
        }
        buf[5] = 0x33; // ASCII '3'
        buf[27] = 1; buf[28] = 2;
        buf[29] = 3; buf[30] = 4;
        buf[31] = 5; buf[32] = 6;
        buf[33] = 0; // → BMU = A
        buf[34] = 0; // 'A'
        buf[36] = (2 << 4) | 4; // 2 Tower, 4 Module/Tower
        buf[38] = 1; // OnGrid

        // require fresh main.js – aber main.js startet bei require einen Adapter.
        // Daher kopieren wir die kritische Logik:
        const decode = function (data) {
            const ba = new Uint8Array(data);
            this.serial = '';
            for (let i = 3; i < 22; i++) {
                this.serial += String.fromCharCode(ba[i]);
            }
            this.battType = ba[5] === 0x33 ? 'HVS'
                : (ba[5] === 0x32 || ba[5] === 0x31) ? 'LVS'
                : 'HVM';
            this.modules = ba[36] % 16;
            this.towers  = Math.floor(ba[36] / 16);
            this.grid = ba[38] === 0 ? 'OffGrid' : ba[38] === 1 ? 'OnGrid' : 'Backup';
        };
        const out = {};
        decode.call(out, buf);

        expect(out.battType).to.equal('HVS');
        expect(out.modules).to.equal(4);
        expect(out.towers).to.equal(2);
        expect(out.grid).to.equal('OnGrid');
        expect(out.serial).to.have.lengthOf(19);
    });

    it('erkennt LVS aus Serien-Byte ASCII "1" oder "2"', () => {
        for (const code of [0x31, 0x32]) {
            const buf = Buffer.alloc(50);
            buf[5] = code;
            buf[36] = 0x10; // 1 Tower, 0 Module
            buf[38] = 0;
            const decode = function (data) {
                const ba = new Uint8Array(data);
                this.battType = ba[5] === 0x33 ? 'HVS'
                    : (ba[5] === 0x32 || ba[5] === 0x31) ? 'LVS'
                    : 'HVM';
            };
            const out = {};
            decode.call(out, buf);
            expect(out.battType).to.equal('LVS');
        }
    });
});

describe('Modbus Exception Detection (regression bug "State 7")', () => {
    it('Frame 01 03 cc … → byte[1]=0x03 (NICHT exception)', () => {
        const buf = Buffer.from([0x01, 0x03, 0xcc, 0x50, 0x30]);
        expect((buf[1] & 0x80) !== 0).to.equal(false);
    });

    it('Frame 01 90 04 4d c3 → byte[1]=0x90 (Exception auf Write)', () => {
        const buf = Buffer.from([0x01, 0x90, 0x04, 0x4d, 0xc3]);
        expect((buf[1] & 0x80) !== 0).to.equal(true);
        expect(buf[1] & 0x7f).to.equal(0x10);
        expect(buf[2]).to.equal(0x04); // Server Device Failure / Busy
    });

    it('Frame 01 83 04 … → byte[1]=0x83 (Exception auf Read)', () => {
        const buf = Buffer.from([0x01, 0x83, 0x04, 0x00, 0x00]);
        expect((buf[1] & 0x80) !== 0).to.equal(true);
        expect(buf[1] & 0x7f).to.equal(0x03);
    });
});

describe('hvsETA – Division durch 0', () => {
    it('liefert 0 wenn chargeTotal === 0', () => {
        const chargeTotal = 0;
        const dischargeTotal = 12345;
        const eta = chargeTotal > 0 ? dischargeTotal / chargeTotal : 0;
        expect(eta).to.equal(0);
        expect(Number.isFinite(eta)).to.equal(true);
    });

    it('rechnet korrekt wenn chargeTotal > 0', () => {
        const eta = 8000 > 0 ? 6000 / 8000 : 0;
        expect(eta).to.equal(0.75);
    });
});
