// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Tp = require('thingpedia');
const fs = require('fs');
const { ninvoke } = require('./utils');

module.exports = class ThingEngineGNOMEDevice extends Tp.BaseDevice {
    constructor(engine, state) {
        super(engine, state);

        this.uniqueId = 'org.thingpedia.builtin.thingengine.gnome';

        const gettext = engine.platform.getCapability('gettext');
        this._ = gettext.dgettext.bind(gettext, 'edu.stanford.Almond');
        this.name = this._("Almond 4 GNOME");
        this.description = this._("Control your PC with your voice.");
    }

    checkAvailable() {
        return Tp.Availability.AVAILABLE;
    }

    get_get_screenshot() {
        return this.engine.platform.getCapability('screenshot').take().then((url) => {
            return [{ picture_url: url }];
        });
    }

    do_open_app({ app_id, url }) {
        if (url)
            return this.engine.platform.getCapability('app-launcher').launchApp(String(app_id), String(url));
        else
            return this.engine.platform.getCapability('app-launcher').launchApp(String(app_id));
    }
    do_lock() {
        return this.engine.platform.getCapability('system-lock').lock();
    }
    do_set_background({ picture_url }) {
        return this.engine.platform.getCapability('system-settings').setBackground(String(picture_url));
    }
    async do_set_power({ power }) {
        if (power === 'on')
            return; // nothing to do, if the app is running the PC is on

        const iface = await ninvoke(this._bus, 'getInterface',
             'org.gnome.SessionManager',
             '/org/gnome/SessionManager',
             'org.gnome.SessionManager');

        // invoke asynchronously, do not block
        ninvoke(iface, 'Shutdown').catch((e) => {
            console.error('Error during shutdown: ' + e);
        });
    }

    do_create_file({ file_name, contents }) {
        return new Promise((resolve, reject) => {
            fs.writeFile(String(file_name), contents, (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    do_delete_file({ file_name }) {
        return new Promise((resolve, reject) => {
            fs.unlink(String(file_name), (err) => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
};
