// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2020 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

// GNOME platform

const crypto = require('crypto');
const fs = require('fs');
const util = require('util');
const os = require('os');
const path = require('path');
const events = require('events');
const child_process = require('child_process');
const Tp = require('thingpedia');
const Gettext = require('node-gettext');
const DBus = require('dbus-native');
const PulseAudio = require('pulseaudio2');
const keytar = require('keytar');
const sqlite3 = require('sqlite3');

const { ninvoke } = require('./utils');

const WakeWordDetector = require('../wake-word/snowboy');

// FIXME
const Builtins = require('genie-toolkit/dist/lib/engine/devices/builtins');

var _unzipApi = {
    unzip(zipPath, dir) {
        var args = ['-uo', zipPath, '-d', dir];
        return util.promisify(child_process.execFile)('/usr/bin/unzip', args, {
            maxBuffer: 10 * 1024 * 1024 }).then(({ stdout, stderr }) => {
            console.log('stdout', stdout);
            console.log('stderr', stderr);
        });
    }
};

function safeMkdirSync(dir) {
    try {
        fs.mkdirSync(dir);
    } catch(e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
}

function getUserConfigDir() {
    if (process.env.XDG_CONFIG_HOME)
        return process.env.XDG_CONFIG_HOME;
    return os.homedir() + '/.config';
}
function getUserCacheDir() {
    if (process.env.XDG_CACHE_HOME)
        return process.env.XDG_CACHE_HOME;
    return os.homedir() + '/.cache';
}
function getFilesDir() {
    if (process.env.THINGENGINE_HOME)
        return path.resolve(process.env.THINGENGINE_HOME);
    else
        return path.resolve(getUserConfigDir(), 'almond');
}
function makeRandom() {
    return crypto.randomBytes(32).toString('hex');
}

async function runningInFlatpak() {
    return util.promisify(fs.exists)('/.flatpak-info');
}

class AppLauncher {
    constructor(sessionBus) {
        this._bus = sessionBus;
    }

    async init() {
        await this._tryGettingInterface();
    }

    async _tryGettingInterface() {
        try {
            this._interface = await ninvoke(this._bus, 'getInterface',
                 'org.gnome.Shell',
                 '/edu/stanford/Almond/ShellExtension',
                 'edu.stanford.Almond.ShellExtension');
        } catch(e) {
            this._interface = null;
        }
    }

    async _internalListApps() {
        // if we were initialized without the shell extension, try getting it again
        // in case the user installed after seeing the notification (or there was a race
        // during initialization)
        if (!this._interface)
            await this._tryGettingInterface();
        if (!this._interface)
            return [];
        return ninvoke(this._interface, 'ListApps');
    }

    async listApps() {
        const apps = await this._internalListApps();
        return apps.map(([appId, appName]) => {
            if (appId.endsWith('.desktop'))
                appId = appId.substring(0, appId.length - '.desktop'.length);

            // return in the same format used by /entities/lookup in the Thingpedia API
            return {
                value: appId,
                name: appName,
                canonical: appName.toLowerCase()
            };
        });
    }

    async hasApp(appId) {
        return (await this._internalListApps()).some(([candidateAppId,]) => candidateAppId === appId);
    }

    async launchApp(appId, ...files) {
        const helperpath = path.resolve(module.filename, '../../../helpers/spawn-app');
        if (await runningInFlatpak()) {
            // HACK: we need to run our script on the host, so we pass the whole content on the commandline
            // (this is what gnome-builder does, and it also triggers interesting edge cases in glib...)
            const buffer = await util.promisify(fs.readFile)(helperpath, { encoding: 'utf8' });
            child_process.spawn('flatpak-spawn', ['--host', 'gjs', '-c', buffer, appId, ...files], {
                detached: true,
                stdio: 'inherit'
            });
        } else {
            child_process.spawn(helperpath, [appId, ...files], {
                detached: true,
                stdio: 'inherit'
            });
        }
    }

    async launchURL(url) {
        if (await runningInFlatpak()) {
            child_process.spawn('flatpak-spawn', ['--host', 'xdg-open', url], {
                detached: true,
                stdio: 'inherit'
            });
        } else {
            child_process.spawn('xdg-open', [url], {
                detached: true,
                stdio: 'inherit'
            });
        }
    }
}

class SystemLock extends events.EventEmitter {
    constructor(sessionBus) {
        super();
        this._bus = sessionBus;
        this._isActive = false;
        this._interface = null;
    }

    get isActive() {
        return this._isActive;
    }

    async init() {
        try {
            this._interface = await ninvoke(this._bus, 'getInterface',
                 'org.gnome.ScreenSaver',
                 '/org/gnome/ScreenSaver',
                 'org.gnome.ScreenSaver');
        } catch(e) {
            console.error('Failed to initialize screen locking', e);
            return;
        }

        this._isActive = await ninvoke(this._interface, 'GetActive');
        this._interface.on('ActiveChanged', (isActive) => {
            this._isActive = isActive;
            this.emit('active-changed');
        });
    }

    async lock() {
        if (!this._interface)
            throw new Error("Screen locking is not available");
        await ninvoke(this._interface, 'Lock');
    }
}

class Screenshot {
    constructor(sessionBus, gettext) {
        this._bus = sessionBus;
        this._ = gettext.dgettext.bind(gettext, 'edu.stanford.Almond');
    }

    async take() {
        const iface = await ninvoke(this._bus, 'getInterface',
             'org.gnome.Shell.Screenshot',
             '/org/gnome/Shell/Screenshot',
             'org.gnome.Shell.Screenshot');
        let now = new Date;
        let filename = this._("Screenshot from %d-%02d-%02d %02d-%02d-%02d").format(
            now.getFullYear(),
            now.getMonth()+1,
            now.getDate(),
            now.getHours(),
            now.getMinutes(),
            now.getSeconds()
        );
        const [, path] = await ninvoke(iface, 'Screenshot', false, true, filename);
        return 'file://' + path;
    }
}

class SystemSettings {
    constructor(cacheDir) {
        this._cacheDir = cacheDir;
    }

    _downloadURI(url) {
        safeMkdirSync(this._cacheDir + '/backgrounds');

        let file_name = this._cacheDir + '/backgrounds/' + path.basename(url);
        let stream = fs.createWriteStream(file_name);
        return Tp.Helpers.Http.getStream(url).then((download) => {
            return new Promise((resolve, reject) => {
                download.pipe(stream);
                stream.on('error', reject);
                stream.on('finish', () => resolve('file://' + file_name));
            });
        });
    }

    setBackground(url) {
        if (!url.startsWith('file:///'))
            return this._downloadURI(url).then((downloaded) => this.setBackground(downloaded));

        return util.promisify(child_process.execFile)('gsettings',
            ['set', 'org.gnome.desktop.background', 'picture-uri', url]);
    }
}

let webrtcvad;
try {
    webrtcvad = require('webrtcvad').default;
} catch(e) {
    console.log("VAD not available");
    webrtcvad = null;
}

class VAD {
    constructor() {
        this._instance = null;
        this.frameSize = 0;
    }

    setup(bitrate, level) {
        if (this._instance)
            this._instance = null;

        if (webrtcvad) {
            this._instance = new webrtcvad(bitrate, level);
            // 16khz audio single-channel 16 bit: 10ms: 160b, 20ms: 320b, 30ms: 480b
            this.frameSize = 320;
            // console.log("setup VAD bitrate", bitrate, "level", level);
            return true;
        }

        return false;
    }

    process(chunk) {
        if (!this._instance)
            return false;
        let n = chunk.length % this.frameSize, r = 0;
        for (let i = 0; i < n; i++)
            r += this._instance.process(chunk.slice(i * this.frameSize, this.frameSize));
        return r;
    }
}

class Platform extends Tp.BasePlatform {
    // Initialize the platform code
    // Will be called before instantiating the engine
    constructor(homedir) {
        super();
        homedir = homedir || getFilesDir();

        this._gettext = new Gettext();

        this._filesDir = homedir;
        safeMkdirSync(this._filesDir);
        //this._locale = process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || 'en-US';
        // normalize this._locale to something that Intl can grok
        //this._locale = this._locale.split(/[-_.@]/).slice(0,2).join('-');
        // FIXME only English is available for now
        this._locale = 'en-US';

        this._gettext.setLocale(this._locale);
        this._timezone = process.env.TZ;
        this._prefs = new Tp.Helpers.FilePreferences(this._filesDir + '/prefs.db');
        this._cacheDir = getUserCacheDir() + '/almond';
        safeMkdirSync(this._cacheDir);

        this._dbusSession = DBus.sessionBus();
        this._dbusSystem = DBus.systemBus();
        this._systemLock = new SystemLock(this._dbusSession);
        this._appLauncher = new AppLauncher(this._dbusSession);
        this._systemSettings = new SystemSettings(this._cacheDir);
        this._screenshot = new Screenshot(this._dbusSession, this._gettext);
        this._btApi = null;
        this._pulse = new PulseAudio({
            client: "Almond",
            properties: {
                'application.id': 'edu.stanford.Almond',
                'application.language': this._locale,
            }
        });
        this._pulse.on('error', (err) => { console.error('error on PulseAudio', err); });
        this._pulse.on('connection', () => {
            this._ensurePulseConfig();
        });
        this._wakeWordDetector = new WakeWordDetector();
        this._voiceDetector = null;
        if (webrtcvad && VAD)
            this._voiceDetector = new VAD();

        this._sqliteKey = null;
    }

    async _ensurePulseConfig() {
        try {
            let hasFilterHeuristics = false, hasFilterApply = false;
            const pulseModList = await this._pulse.modules();
            for (let i = 0; i < pulseModList.length; i++) {
                const mod = pulseModList[i];
                if (mod.name === 'module-filter-heuristics')
                    hasFilterHeuristics = true;
                if (mod.name === 'module-filter-apply')
                    hasFilterApply = true;
                if (mod.name === 'module-role-ducking')
                    await this._pulse.unloadModule(mod.index);
            }
            if (!hasFilterHeuristics)
                await this._pulse.loadModule("module-filter-heuristics");
            if (!hasFilterApply)
                await this._pulse.loadModule("module-filter-apply");
            await this._pulse.loadModule("module-role-ducking", "trigger_roles=voice-assistant ducking_roles=music volume=40% global=true");
        } catch(e) {
            console.error("failed to configure PulseAudio");
        }
    }

    async init() {
        const password = await keytar.getPassword('edu.stanford.Almond', 'database-key');
        if (password) {
            this._sqliteKey = password;

            const sqlcipherCompat = this._prefs.get('sqlcipher-compatibility') || 3;
            if (sqlcipherCompat !== 4) {
                // if the database was created with an older version of sqlcipher, we need
                // to tell sqlcipher what parameters to use to hash the key and encrypt/decrypt
                //
                // we do so with a temporary database to issue a pragma
                const tmpdb = new sqlite3.Database(':memory:');
                tmpdb.run('PRAGMA cipher_default_compatibility = ' + sqlcipherCompat);

                await new Promise((resolve, reject) => {
                    tmpdb.close((err) => {
                        if (err)
                            reject(err);
                        else
                            resolve();
                    });
                });
            }
        } else {
            console.log('Initializing database key');
            this._sqliteKey = makeRandom();
            this._prefs.set('sqlcipher-compatibility', 4);
            await keytar.setPassword('edu.stanford.Almond', 'database-key', this._sqliteKey);
        }

        await this._systemLock.init();
        await this._appLauncher.init();

        this._gnomeDev = {
            kind: 'org.thingpedia.builtin.thingengine.gnome',
            class: (await util.promisify(fs.readFile)(path.resolve(__dirname, '../data/thingengine.gnome.tt'))).toString(),
            module: require('./thingengine.gnome')
        };

        // HACK: thingengine-core will try to load thingengine-own-desktop from the db
        // before PairedEngineManager calls getPlatformDevice(), which can result in loading
        // the device as unsupported (and that would be bad)
        // to avoid that, we inject it eagerly here
        Builtins.default[this._gnomeDev.kind] = this._gnomeDev;
    }

    get type() {
        return 'gnome';
    }

    get encoding() {
        return 'utf8';
    }

    get locale() {
        return this._locale;
    }

    get timezone() {
        return this._timezone;
    }

    // Check if we need to load and run the given thingengine-module on
    // this platform
    // (eg we don't need discovery on the cloud, and we don't need graphdb,
    // messaging or the apps on the phone client)
    hasFeature(feature) {
        return true;
    }

    getPlatformDevice() {
        return this._gnomeDev;
    }

    // Check if this platform has the required capability
    // (eg. long running, big storage, reliable connectivity, server
    // connectivity, stable IP, local device discovery, bluetooth, etc.)
    //
    // Which capabilities are available affects which apps are allowed to run
    hasCapability(cap) {
        switch(cap) {
        case 'code-download':
            // If downloading code from the thingpedia server is allowed on
            // this platform
            return true;

        // We can use the capabilities of a desktop assistant
        case 'dbus-session':
        case 'dbus-system':
        case 'app-launcher':
        case 'system-lock':
        case 'system-settings':
        case 'screenshot':
            return true;

        // we have voice/speech
        case 'wakeword-detector':
        case 'sound':
        case 'pulseaudio':
            return true;

        case 'voice-detector':
            return this._voiceDetector !== null;

        case 'bluetooth':
            // temporarily disabled
            return false;

        case 'gettext':
            return true;

        default:
            return false;
        }
    }

    // Retrieve an interface to an optional functionality provided by the
    // platform
    //
    // This will return null if hasCapability(cap) is false
    getCapability(cap) {
        switch(cap) {
        case 'code-download':
            // We have the support to download code
            return _unzipApi;

        case 'dbus-session':
            return this._dbusSession;
        case 'dbus-system':
            return this._dbusSystem;
        case 'bluetooth':
            // temporarily disabled
            /*if (!this._btApi)
                this._btApi = new BluezBluetooth(this);
            return this._btApi;
            */
            return null;

        case 'pulseaudio':
        case 'sound':
            return this._pulse;

        case 'wakeword-detector':
            return this._wakeWordDetector;
        case 'voice-detector':
            return this._voiceDetector;
        case 'app-launcher':
            return this._appLauncher;
        case 'system-lock':
            return this._systemLock;
        case 'system-settings':
            return this._systemSettings;
        case 'screenshot':
            return this._screenshot;

        case 'gettext':
            return this._gettext;

        default:
            return null;
        }
    }

    // Obtain a shared preference store
    // Preferences are simple key/value store which is shared across all apps
    // but private to this instance (tier) of the platform
    // Preferences should be normally used only by the engine code, and a persistent
    // shared store such as DataVault should be used by regular apps
    getSharedPreferences() {
        return this._prefs;
    }

    // Get a directory that is guaranteed to be writable
    // (in the private data space for Android)
    getWritableDir() {
        return this._filesDir;
    }

    // Get a temporary directory
    // Also guaranteed to be writable, but not guaranteed
    // to persist across reboots or for long times
    // (ie, it could be periodically cleaned by the system)
    getTmpDir() {
        return os.tmpdir();
    }

    // Get a directory good for long term caching of code
    // and metadata
    getCacheDir() {
        return this._cacheDir;
    }

    // Get the filename of the sqlite database
    getSqliteDB() {
        return this._filesDir + '/sqlite.db';
    }

    getSqliteKey() {
        return this._sqliteKey;
    }

    getGraphDB() {
        return this._filesDir + '/rdf.db';
    }

    // Stop the main loop and exit
    // (In Android, this only stops the node.js thread)
    // This function should be called by the platform integration
    // code, after stopping the engine
    exit() {
        process.exit();
    }

    // Get the ThingPedia developer key, if one is configured
    getDeveloperKey() {
        return this._prefs.get('developer-key');
    }

    // Change the ThingPedia developer key, if possible
    // Returns true if the change actually happened
    setDeveloperKey(key) {
        return this._prefs.set('developer-key', key);
    }

    getOrigin() {
        // pretend to be the main webalmond server
        // the client will intercept the redirect before it happens
        return 'https://thingengine.stanford.edu';
        //return 'http://127.0.0.1:8080';
    }

    getCloudId() {
        return this._prefs.get('cloud-id');
    }

    getAuthToken() {
        return this._prefs.get('auth-token');
    }

    // Change the auth token
    // Returns true if a change actually occurred, false if the change
    // was rejected
    setAuthToken(authToken) {
        var oldAuthToken = this._prefs.get('auth-token');
        if (oldAuthToken !== undefined && authToken !== oldAuthToken)
            return false;
        this._prefs.set('auth-token', authToken);
        return true;
    }
}

module.exports = {
    newInstance(homedir) {
        return new Platform(homedir);
    }
};
