// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015-2017 The Board of Trustees of the Leland Stanford Junior University
//           2017      Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

console.log('ThingEngine-GNOME starting up...');

const Q = require('q');
const events = require('events');
const Url = require('url');
Q.longStackSupport = true;

const Engine = require('thingengine-core');
const AssistantDispatcher = require('./assistant');

const Config = require('./config');

var _engine, _ad;
var _running;
var _stopped;
var platform;

const DBUS_CONTROL_PATH = '/edu/stanford/Almond/BackgroundService';

const DBUS_CONTROL_INTERFACE = {
    name: 'edu.stanford.Almond.BackgroundService',
    methods: {
        Stop: ['', ''],
        GetHistory: ['', 'a(uuua{ss})'],
        HandleCommand: ['s', ''],
        HandleThingTalk: ['s', ''],
        HandleParsedCommand: ['ss', ''],
        StartOAuth2: ['s', '(bsa{ss})'],
        HandleOAuth2Callback: ['ssa{ss}', ''],
        CreateSimpleDevice: ['s', 'b'],
        DeleteDevice: ['s', 'b'],
        UpgradeDevice: ['s', 'b'],
        GetDeviceInfos: ['', 'aa{sv}'],
        GetDeviceInfo: ['s', 'a{sv}'],
        GetDeviceFactories: ['s', 'aa{sv}'],
        CheckDeviceAvailable: ['s', 'u'],
        GetAppInfos: ['', 'aa{sv}'],
        DeleteApp: ['s', 'b'],
        SetCloudId: ['ss', 'b'],
        SetServerAddress: ['sus', 'b'],

        SetPreference: ['sv', ''],
        GetPreference: ['s', 'v'],
    },
    signals: {
        'NewMessage': ['uuua{ss}'],
        'RemoveMessage': ['u'],
        'Activate': [],
        'VoiceHypothesis': ['s'],
        'DeviceAdded': ['a{sv}'],
        'DeviceRemoved': ['s'],
        'PreferenceChanged': ['s']
    }
};

// marshall one a{ss} into something that dbus-native will like
function marshallASS(obj) {
    return Object.keys(obj).map((key) => [key, obj[key]]);
}

// marshal any JS value into a variant
function marshalAny(obj) {
    if (typeof obj === 'string')
        return ['s', obj];
    else if (typeof obj === 'number')
        return ['d', obj];
    else if (typeof obj === 'boolean')
        return ['b', obj];
    else if (obj === null || obj === undefined)
        throw new Error('null/undefined cannot be sent over dbus');
    else
        return ['a{sv}', Object.keys(obj).map((key) => [key, marshalAny(obj[key])])];
}

function unmarshalASV(values) {
    let obj = {};
    for (let [name, [signature, value]] of values) {
        if (signature === 'a{sv}')
            value = unmarshalASV(value);

        obj[name] = value;
    }
}

class AppControlChannel extends events.EventEmitter {
    // handle control methods here...
    constructor() {
        super();

        _ad.on('NewMessage', (id, type, direction, msg) => this.emit('NewMessage', id, type, direction, marshallASS(msg)));
        _ad.on('RemoveMessage', (id) => this.emit('RemoveMessage', id));
        _ad.on('VoiceHypothesis', (hyp) => this.emit('VoiceHypothesis', hyp));
        _ad.on('Activate', () => this.emit('Activate'));
        _engine.devices.on('device-added', (device) => {
            this.emit('DeviceAdded', this._toDeviceInfo(device));
        });
        _engine.devices.on('device-removed', (device) => {
            this.emit('DeviceRemoved', device.uniqueId);
        });
         _engine.apps.on('app-added', (app) => {
            this.emit('AppAdded', this._toAppInfo(app));
        });
        _engine.devices.on('app-removed', (app) => {
            this.emit('AppRemoved', app.uniqueId);
        });

        let prefs = _engine.platform.getSharedPreferences();
        prefs.on('changed', (key) => {
            this.emit('PreferenceChanged', key || '');
        });
    }

    Stop() {
        if (_running)
            _engine.stop();
        else
            _stopped = true;
    }

    GetHistory() {
        return _ad.getHistory().then((history) => history.map(([id, type, direction, message]) => [id, type, direction, marshallASS(message)]));
    }

    HandleCommand(command) {
        return _ad.handleCommand(command).then(() => null);
    }

    HandleThingTalk(code) {
        return _ad.handleThingTalk(code).then(() => null);
    }

    HandleParsedCommand(title, json) {
        return _ad.handleParsedCommand(title, json).then(() => null);
    }

    StartOAuth2(kind) {
        return _engine.devices.factory.runOAuth2(kind, null).then((result) => {
            if (result === null)
                return [false, '', []];
            else
                return [true, result[0], marshallASS(result[1])];
        });
    }

    HandleOAuth2Callback(kind, redirectUri, session) {
        let sessionObj = {};
        session.forEach(([key, value]) => sessionObj[key] = value);

        // there is no actual http request going on, so the values are fake
        // oauth modules should not rely on these anyway

        let parsed = Url.parse(redirectUri, { parseQueryString: true });
        let req = {
            httpVersion: 1.0,
            headers: [],
            rawHeaders: [],

            method: 'GET',
            url: redirectUri,
            query: parsed.query,
            session: sessionObj
        };
        return _engine.devices.factory.runOAuth2(kind, req).then(() => null);
    }

    CreateSimpleDevice(kind) {
        return _engine.devices.loadOneDevice({ kind }, true).then(() => true);
    }

    DeleteDevice(uniqueId) {
        var device = _engine.devices.getDevice(uniqueId);
        if (device === undefined)
            return false;

        _engine.devices.removeDevice(device);
        return true;
    }

    UpgradeDevice(kind) {
        return _engine.devices.factory.updateFactory(kind).then(() => true);
    }

    _toDeviceInfo(d) {
        let deviceKlass = 'physical';
        if (d.hasKind('data-source'))
            deviceKlass = 'data';
        else if (d.hasKind('online-account'))
            deviceKlass = 'online';
        else if (d.hasKind('thingengine-system'))
            deviceKlass = 'system';

        return [['uniqueId', ['s', d.uniqueId]],
                ['name', ['s', d.name || "Unknown device"]],
                ['description', ['s', d.description || "Description not available"]],
                ['kind', ['s', d.kind]],
                ['version', ['u', d.constructor.version || 0]],
                ['class', ['s', deviceKlass]],
                ['ownerTier', ['s', d.ownerTier]],
                ['isTransient', ['b', d.isTransient]]];
    }

    GetDeviceInfos() {
        const devices = _engine.devices.getAllDevices();
        return devices.map(this._toDeviceInfo, this);
    }

    GetDeviceFactories(deviceClass) {
        return _engine.thingpedia.getDeviceFactories(deviceClass).then((factories) => factories.map((f) => {
            let factory = [];
            let value;
            for (let name in f.factory) {
                if (name === 'fields') {
                    // this extra wrapping of the value seem unnecessary but
                    // it works around a bug in dbus-native
                    value = ['aa{ss}', [f.factory.fields.map(marshallASS)]];
                } else {
                    value = [typeof f.factory[name] === 'number' ? 'u' : 's', f.factory[name]];
                }
                factory.push([name, value]);
            }
            return factory;
        }));
    }

    GetDeviceInfo(uniqueId) {
        var d = _engine.devices.getDevice(uniqueId);
        if (d === undefined)
            throw new Error('Invalid device ' + uniqueId);

        return this._toDeviceInfo(d);
    }

    CheckDeviceAvailable(uniqueId) {
        var d = _engine.devices.getDevice(uniqueId);
        if (d === undefined)
            return -1;

        return d.checkAvailable();
    }

    _toAppInfo(a) {
        var app =  [['uniqueId', ['s', a.uniqueId]],
                    ['name', ['s', a.name || "Some app"]],
                    ['description', ['s', a.description || a.name || "Some app"]],
                    ['icon', ['s', a.icon || '']],
                    ['isRunning', ['b', a.isRunning]],
                    ['isEnabled', ['b', a.isEnabled]],
                    ['error', ['s', a.error ? a.error.message : '']]];
        return app;
    }

    GetAppInfos() {
        const apps = _engine.apps.getAllApps();
        return apps.map(this._toAppInfo, this);
    }

    DeleteApp(uniqueId) {
        const app = _engine.apps.getApp(uniqueId);
        if (app === undefined)
            return false;

        return _engine.apps.removeApp(app).then(() => true);
    }

    SetCloudId(cloudId, authToken) {
        if (_engine.devices.hasDevice('thingengine-own-cloud'))
            return false;
        if (!platform.setAuthToken(authToken))
            return false;

        // we used to call loadOneDevice() with thingengine kind, tier: cloud here
        // but is incompatible with syncing the developer key (and causes
        // spurious device database writes)
        // instead we set the platform state and reopen the connection
        platform.getSharedPreferences().set('cloud-id', cloudId);
        _engine.tiers.reopenOne('cloud').done();
        return true;
    }

    SetServerAddress(serverHost, serverPort, authToken) {
        if (_engine.devices.hasDevice('thingengine-own-server'))
            return false;
        if (authToken !== null) {
            if (!platform.setAuthToken(authToken))
                return false;
        }

        _engine.devices.loadOneDevice({ kind: 'org.thingpedia.builtin.thingengine',
                                        tier: 'server',
                                        host: serverHost,
                                        port: serverPort,
                                        own: true }, true).done();
        return true;
    }

    GetPreference(key) {
        let prefs = _engine.platform.getSharedPreferences();
        let value = prefs.get(key);
        return marshalAny(value === undefined ? '' : value);
    }
    SetPreference(key, [signature, [value]]) {
        let prefs = _engine.platform.getSharedPreferences();
        prefs.set(key, value);
        return null;
    }
}

function main() {
    platform = require('./platform').newInstance();
    global.platform = platform;

    console.log('GNOME platform initialized');

    console.log('Creating engine...');
    _engine = new Engine(platform, { thingpediaUrl: process.env.THINGPEDIA_URL || Config.THINGPEDIA_URL });

    _ad = new AssistantDispatcher(_engine, controlChannel);
    platform.setAssistant(_ad);

    var controlChannel = new AppControlChannel();

    var bus = platform.getCapability('dbus-session');
    bus.exportInterface(controlChannel, DBUS_CONTROL_PATH, DBUS_CONTROL_INTERFACE);

    Q.all([_engine.open(), _ad.start()]).then(() =>
        Q.ninvoke(bus, 'requestName', 'edu.stanford.Almond.BackgroundService', 0)
    ).then(() => {
        console.log('Ready');
    }).then(() => {
        _ad.startConversation();
        _running = true;
        if (_stopped)
            return Promise.resolve();
        return _engine.run();
    }).catch((error) => {
        console.log('Uncaught exception: ' + error.message);
        console.log(error.stack);
    }).finally(() =>
        _engine.close()
    ).catch((error) => {
        console.log('Exception during stop: ' + error.message);
        console.log(error.stack);
    }).finally(() => {
        console.log('Cleaning up');
        platform.exit();
    }).done();
}

main();