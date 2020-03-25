// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const stream = require('stream');
const path = require('path');
const fs = require('fs');
const util = require('util');

const Porcupine = require('./porcupine/index.js');

module.exports = class DetectorStream extends stream.Writable {
    constructor() {
        // keep chunks small, to reduce latency
        super({ highWaterMark: 128 });

        this._modelPath = path.resolve(path.dirname(module.filename), '../data/wake-word/computer_linux.ppn');
        this._hotword = 'computer';

        this._detector = null;
        this._chunkBuffers = [];
        this._chunkLength = 0;
    }

    async init() {
        const model = await (util.promisify(fs.readFile)(this._modelPath));
        assert(model instanceof Uint8Array);

        this._detector = (await Porcupine([model], new Float32Array([0.5]))).create();
        console.log('detector', this._detector);

        // convert to bytes from uint16 units
        this._frameLength = this._detector.frameLength;
    }

    get sampleRate() {
        return this._detector.sampleRate;
    }

    _write(buffer, encoding, callback) {
        this._chunkBuffers.push(buffer);
        this._chunkLength += buffer.length;

        if (this._chunkLength >= this._frameLength) {
            let concat = Buffer.concat(this._chunkBuffers, this._chunkLength);
            let length = this._chunkLength;

            while (length > this._frameLength) {
                const chunk = concat.slice(0, this._frameLength);
                const asInt16 = new Int16Array(chunk.buffer, chunk.byteOffset, chunk.length);
                const detected = this._detector.process(asInt16);
                if (detected !== -1)
                    this.emit('hotword', this._hotword);

                length -= this._frameLength;
                if (length > 0)
                    concat = concat.slice(this._frameLength, concat.length);
            }

            this._chunkBuffers = [];
            this._chunkLength = 0;
            if (length > 0) {
                this._chunkBuffers.push(concat);
                this._chunkLength = length;
            }
        }

        callback();
    }

    destroy() {
        this._detector.release();
    }
};
