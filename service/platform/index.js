// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2017 The Board of Trustees of the Leland Stanford Junior University
//           2017      Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
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
const CVC4Solver = require('smtlib').LocalCVC4Solver;
const PulseAudio = require('pulseaudio2');
const keytar = require('keytar');
const sqlite3 = require('sqlite3');
const { ninvoke } = require('./utils');

const prefs = require('thingengine-core/lib/util/prefs');
const Builtins = require('thingengine-core/lib/devices/builtins');

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

/*
const JavaAPI = require('./java_api');
const StreamAPI = require('./streams');

const _unzipApi = JavaAPI.makeJavaAPI('Unzip', ['unzip'], [], []);
const _gpsApi = JavaAPI.makeJavaAPI('Gps', ['start', 'stop'], [], ['onlocationchanged']);
const _notifyApi = JavaAPI.makeJavaAPI('Notify', [], ['showMessage'], []);
const _audioManagerApi = JavaAPI.makeJavaAPI('AudioManager', [],
    ['setRingerMode', 'adjustMediaVolume', 'setMediaVolume'], []);
const _smsApi = JavaAPI.makeJavaAPI('Sms', ['start', 'stop', 'sendMessage'], [], ['onsmsreceived']);
const _btApi = JavaAPI.makeJavaAPI('Bluetooth',
    ['start', 'startDiscovery', 'pairDevice', 'readUUIDs'],
    ['stop', 'stopDiscovery'],
    ['ondeviceadded', 'ondevicechanged', 'onstatechanged', 'ondiscoveryfinished']);
const _audioRouterApi = JavaAPI.makeJavaAPI('AudioRouter',
    ['setAudioRouteBluetooth'], ['start', 'stop', 'isAudioRouteBluetooth'], []);
const _systemAppsApi = JavaAPI.makeJavaAPI('SystemApps', [], ['startMusic'], []);
const _graphicsApi = require('./graphics');

const _contentJavaApi = JavaAPI.makeJavaAPI('Content', [], ['getStream'], []);
const _contentApi = {
    getStream(url) {
        return _contentJavaApi.getStream(url).then(function(token) {
            return StreamAPI.get().createStream(token);
        });
    }
}
const _contactApi = JavaAPI.makeJavaAPI('Contacts', ['lookup'], [], []);
const _telephoneApi = JavaAPI.makeJavaAPI('Telephone', ['call', 'callEmergency'], [], []);
*/
const BluezBluetooth = require('./bluez');

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

const _appLauncher = {
    async launchApp(appId, ...files) {
        const helperpath = path.resolve(module.filename, '../../../helpers/spawn-app')
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
    },

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
};
class SystemLock extends events.EventEmitter {
    constructor(sessionBus) {
        super();
        this._bus = sessionBus;
        this._isActive = false;
    }

    get isActive() {
        return this._isActive;
    }

    async init() {
        this._interface = await ninvoke(this._bus, 'getInterface',
             'org.gnome.Shell',
             '/org/gnome/ScreenSaver',
             'org.gnome.ScreenSaver');

        this._isActive = await ninvoke(this._interface, 'GetActive');
        this._interface.on('ActiveChanged', (isActive) => {
            this._isActive = isActive;
            this.emit('active-changed');
        });
    }

    async lock() {
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

class Platform {
    // Initialize the platform code
    // Will be called before instantiating the engine
    constructor(homedir) {
        homedir = homedir || getFilesDir();
        this._assistant = null;

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
        this._prefs = new prefs.FilePreferences(this._filesDir + '/prefs.db');
        this._cacheDir = getUserCacheDir() + '/almond';
        safeMkdirSync(this._cacheDir);

        this._dbusSession = DBus.sessionBus();
        this._dbusSystem = DBus.systemBus();
        this._systemLock = new SystemLock(this._dbusSession);
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
        this._sqliteKey = null;
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

        this._gnomeDev = {
            kind: 'org.thingpedia.builtin.thingengine.gnome',
            class: (await util.promisify(fs.readFile)(path.resolve(__dirname, '../data/thingengine.gnome.tt'))).toString(),
            module: require('./thingengine.gnome')
        };

        // HACK: thingengine-core will try to load thingengine-own-desktop from the db
        // before PairedEngineManager calls getPlatformDevice(), which can result in loading
        // the device as unsupported (and that would be bad)
        // to avoid that, we inject it eagerly here
        Builtins[this._gnomeDev.kind] = this._gnomeDev;
    }

    setAssistant(ad) {
        this._assistant = ad;
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

        case 'bluetooth':
            // temporarily disabled
            return false;

/*
        // We can use the phone capabilities
        case 'notify':
        case 'gps':
        case 'audio-manager':
        case 'sms':
        case 'bluetooth':
        case 'audio-router':
        case 'system-apps':
        case 'graphics-api':
        case 'content-api':
        case 'contacts':
        case 'telephone':
        // for compat
        case 'notify-api':
            return true;
*/
        case 'assistant':
            return true;

        case 'gettext':
            return true;

        case 'smt-solver':
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
            return this._pulse;

        case 'smt-solver':
            return CVC4Solver;

        case 'app-launcher':
            return _appLauncher;
        case 'system-lock':
            return this._systemLock;
        case 'system-settings':
            return this._systemSettings;
        case 'screenshot':
            return this._screenshot;

/*
        case 'notify-api':
        case 'notify':
            return _notifyApi;

        case 'gps':
            return _gpsApi;

        case 'audio-manager':
            return _audioManagerApi;

        case 'sms':
            return _smsApi;

        case 'audio-router':
            return _audioRouterApi;

        case 'system-apps':
            return _systemAppsApi;

        case 'graphics-api':
            return _graphicsApi;

        case 'content-api':
            return _contentApi;

        case 'contacts':
            return _contactApi;

        case 'telephone':
            return _telephoneApi;
*/

        case 'assistant':
            return this._assistant;

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
