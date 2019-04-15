// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2017-2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const stream = require('stream');
const path = require('path');
const snowboy = require('snowboy');

module.exports = class DetectorStream extends stream.Transform {
    constructor() {
        super();

        let models = new snowboy.Models();
        //for (let p of ['silei', 'gcampagn']) {
             models.add({
                 file: path.resolve(module.filename, '../data/gcampagn.pmdl'),
                 sensitivity: '0.4',
                 hotwords : 'almond'
             });
        //}

        this._detector = new snowboy.Detector({
            resource: path.resolve(module.filename, '../data/snowboy.res'),
            models: models,
            audio_gain: 2
        });

        this._detector.on('silence', () => {
        });
        this._detector.on('sound', () => {
            this.emit('sound');
        });
        this._detector.on('hotword', (index, hotword, buffer) => {
            this.emit('hotword', hotword);
        });
    }

    _transform(chunk, encoding, callback) {
        this._detector.runDetection(chunk);
        callback(null, chunk);
    }
};
