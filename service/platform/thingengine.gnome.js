// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
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

        this._bus = engine.platform.getCapability('dbus-session');
    }

    checkAvailable() {
        return Tp.Availability.AVAILABLE;
    }

    get_power() {
        // we're running on this PC, so we're definetely on
        return { state: 'on' };
    }

    get_get_screenshot() {
        return this.engine.platform.getCapability('screenshot').take().then((url) => {
            return [{ picture_url: url }];
        });
    }

    async _callDBus(name, objpath, iface, method, ...args) {
        const proxy = await ninvoke(this._bus, 'getInterface', name, objpath, iface);
        return ninvoke(proxy, method, ...args);
    }
    async _callExtension(method, ...args) {
        return this._callDBus('org.gnome.Shell', '/edu/stanford/Almond/ShellExtension', 'edu.stanford.Almond.ShellExtension', method, ...args);
    }

    async do_open_app({ app_id, url }) {
        const appName = app_id.display;
        // append the file extension
        const appId = String(app_id) + '.desktop';

        if (!await this.engine.platform.getCapability('app-launcher').hasApp(appId)) {
            // the app we're looking for is not installed
            // (the proper way to do is to hook this at entity linking level, and resolve the right app by name...)
            throw new Error(`${appName} is not installed. You might install it from GNOME Software`);
        }

        if (url)
            return this.engine.platform.getCapability('app-launcher').launchApp(appId, String(url));
        else
            return this.engine.platform.getCapability('app-launcher').launchApp(appId);
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

        // invoke asynchronously, do not block
        this._callDBus('org.gnome.SessionManager', '/org/gnome/SessionManager', 'org.gnome.SessionManager', 'Shutdown').catch((e) => {
            console.error('Error during shutdown: ' + e);
        });
    }

    async do_raise_volume() {
        await this._callExtension('VolumeUp');
    }
    async do_lower_volume() {
        await this._callExtension('VolumeDown');
    }
    async do_set_volume({ volume }) {
        // volume is 0-100, but the shell extensions wants 0-1
        await this._callExtension('SetVolume', volume / 100);
    }
    async mute() {
        await this._callExtension('SetMuted', true);
    }
    async unmute() {
        await this._callExtension('SetMuted', false);
    }
    async set_sink() {
        // nothing to do, PulseAudio manages the default sink already
    }
    async play_music() {
        throw new Error(`This function is not available on this platform. If you wish to open a specific music app, say "Open" and the app name.`);
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
