//
// This file is part of ThingEngine
//
// Copyright 2015-2017 The Board of Trustees of the Leland Stanford Junior University
//           2017      Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

console.log('ThingEngine-GNOME starting up...');

const events = require('events');
process.on('unhandledRejection', (up) => { throw up; });

const ThingTalk = require('thingtalk');
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
        CreateDevice: ['s', 'b'],
        DeleteDevice: ['s', 'b'],
        UpgradeDevice: ['s', 'b'],
        GetDeviceInfos: ['', 'aa{sv}'],
        GetDeviceInfo: ['s', 'a{sv}'],
        GetDeviceExamples: ['s', 'a(ssuassa{ss}as)'],
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
        'AppAdded': ['a{sv}'],
        'AppRemoved': ['s'],
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
    else if (Array.isArray(obj))
        return ['av', obj.map(marshalAny)];
    else
        return ['a{sv}', Object.keys(obj).map((key) => [key, marshalAny(obj[key])])];
}

/*
function unmarshalASV(values) {
    let obj = {};
    for (let [name, [signature, value]] of values) {
        if (signature === 'a{sv}')
            value = unmarshalASV(value);

        obj[name] = value;
    }
}
*/

/* FIXME this whole code should be moved somewhere else */
const SLOT_REGEX = /\$(?:\$|([a-zA-Z0-9_]+(?![a-zA-Z0-9_]))|{([a-zA-Z0-9_]+)(?::([a-zA-Z0-9_]+))?})/;
function normalizeSlot(t) {
    let res = SLOT_REGEX.exec(t);
    if (!res)
        return t;
    let [match, param1, param2,] = res;
    if (match === '$$')
        return '$';
    return '$' + (param1 || param2);
}

function loadOneExample(ex) {
    // refuse to slot fill pictures
    for (let name in ex.args) {
        let type = ex.args[name];
        if (type.isEntity && type.type === 'tt:picture')
            return null;
    }

    // turn the declaration into a program
    let newprogram = ex.toProgram();
    let slots = [];
    let slotTypes = {};
    for (let name in ex.args) {
        slotTypes[name] = String(ex.args[name]);
        slots.push(name);
    }

    let utterance = ex.utterances[0];
    if (utterance.startsWith(','))
        utterance = utterance.substring(1).trim();
    utterance = utterance.split(' ').map((t) => t.startsWith('$') ? normalizeSlot(t) : t).join(' ');

    let code = ThingTalk.NNSyntax.toNN(newprogram, {});
    return {
        utterance: utterance,
        type: ex.type,
        target: {
            example_id: ex.id,
            code: code,
            entities: {},
            slotTypes: slotTypes,
            slots: slots
        }
    };
}

async function loadAllExamples(kind) {
    const datasetCode = await _engine.thingpedia.getExamplesByKinds([kind], true);
    const parsed = await ThingTalk.Grammar.parseAndTypecheck(datasetCode, _engine.schemas);
    const dataset = parsed.datasets[0];
    let output = [];
    for (let ex of dataset.examples) {
        const loaded = loadOneExample(ex);
        if (loaded !== null)
            output.push(loaded);
    }
    return output;
}

function handleStop() {
    if (_running)
        _engine.stop();
    else
        _stopped = true;
}
process.on('SIGINT', handleStop);
process.on('SIGTERM', handleStop);

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
        _engine.apps.on('app-removed', (app) => {
            this.emit('AppRemoved', app.uniqueId);
        });

        let prefs = _engine.platform.getSharedPreferences();
        prefs.on('changed', (key) => {
            this.emit('PreferenceChanged', key || '');
        });
    }

    Stop() {
        handleStop();
    }

    async GetHistory() {
        const history = await _ad.getHistory();
        return history.map(([id, type, direction, message]) => [id, type, direction, marshallASS(message)]);
    }

    async HandleCommand(command) {
        await _ad.handleCommand(command);
        return null;
    }

    async HandleThingTalk(code) {
        await _ad.handleThingTalk(code);
        return null;
    }

    async HandleParsedCommand(title, json) {
        await _ad.handleParsedCommand(title, json);
        return null;
    }

    async StartOAuth2(kind) {
        const result = await _engine.devices.addFromOAuth(kind);
        if (result === null)
            return [false, '', []];
        else
            return [true, result[0], marshallASS(result[1])];
    }

    async HandleOAuth2Callback(kind, redirectUri, sessionArray) {
        let sessionObj = {};
        sessionArray.forEach(([key, value]) => sessionObj[key] = value);
        await _engine.completeOAuth(kind, redirectUri, sessionObj);
        return null;
    }

    async CreateSimpleDevice(kind) {
        await _engine.createSimpleDevice(kind);
        return true;
    }
    async CreateDevice(data) {
        await _engine.createDevice(JSON.parse(data));
        return true;
    }

    async DeleteDevice(uniqueId) {
        return _engine.deleteDevice(uniqueId);
    }

    async UpgradeDevice(kind) {
        await _engine.upgradeDevice(kind);
        return true;
    }

    _toDeviceInfo(d) {
        let deviceKlass = 'physical';
        if (d.hasKind('data-source'))
            deviceKlass = 'data';
        else if (d.hasKind('online-account'))
            deviceKlass = 'online';
        else if (d.hasKind('thingengine-system'))
            deviceKlass = 'system';

        return [['uniqueId', ['s', d.uniqueId || '']],
                ['name', ['s', d.name || "Unknown device"]],
                ['description', ['s', d.description || "Description not available"]],
                ['kind', ['s', d.kind || '']],
                ['version', ['u', d.constructor.metadata.version || 0]],
                ['class', ['s', deviceKlass]],
                ['ownerTier', ['s', d.ownerTier || _engine.ownTier]],
                ['isTransient', ['b', d.isTransient || false]]];
    }

    GetDeviceInfos() {
        const devices = _engine.devices.getAllDevices();
        return devices.map(this._toDeviceInfo, this);
    }

    GetDeviceFactories(deviceClass) {
        return _engine.thingpedia.getDeviceFactories(deviceClass).then((factories) => factories.map((f) => {
            let factory = [];
            let value;
            for (let name in f) {
                if (name === 'fields')
                    value = ['aa{ss}', f.fields.map(marshallASS)];
                else
                    value = [typeof f[name] === 'number' ? 'u' : 's', f[name]];
                factory.push([name, value]);
            }
            return factory;
        }));
    }

    GetDeviceInfo(uniqueId) {
        const d = _engine.devices.getDevice(uniqueId);
        if (d === undefined)
            throw new Error('Invalid device ' + uniqueId);

        return this._toDeviceInfo(d);
    }

    GetDeviceExamples(uniqueId) {
        const d = _engine.devices.getDevice(uniqueId);
        if (d === undefined)
            return Promise.resolve([]);

        return loadAllExamples(d.kind).then((examples) => examples.map((ex) => {
                let entities = JSON.stringify(ex.target.entities);
                let slotTypes = Object.keys(ex.target.slotTypes).map((key) => [key, ex.target.slotTypes[key]]);
                return [ex.utterance, ex.type, ex.target.example_id,
                        ex.target.code, entities, slotTypes, ex.target.slots];
        }));
    }

    CheckDeviceAvailable(uniqueId) {
        return _engine.checkDeviceAvailable(uniqueId);
    }

    _toAppInfo(a) {
        var app =  [['uniqueId', ['s', a.uniqueId || '']],
                    ['name', ['s', a.name || "Some app"]],
                    ['description', ['s', a.description || a.name || "Some app"]],
                    ['icon', ['s', a.icon || '']],
                    ['isRunning', ['b', a.isRunning || false]],
                    ['isEnabled', ['b', a.isEnabled || false]],
                    ['error', ['s', a.error ? a.error.message : '']]];
        return app;
    }

    GetAppInfos() {
        const apps = _engine.apps.getAllApps();
        return apps.map(this._toAppInfo, this);
    }

    DeleteApp(uniqueId) {
        return _engine.deleteApp(uniqueId);
    }

    async SetCloudId(cloudId, authToken) {
        return _engine.setCloudId(cloudId, authToken);
    }

    async SetServerAddress(serverHost, serverPort, authToken) {
        return _engine.addServerAddress(serverHost, serverPort, authToken);
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

const DBUS_NAME_FLAG_ALLOW_REPLACEMENT = 0x1;
const DBUS_NAME_FLAG_REPLACE_EXISTING = 0x2;

async function main() {
    platform = require('./platform').newInstance();
    global.platform = platform;

    let bus;
    await platform.init();
    try {
        console.log('GNOME platform initialized');

        console.log('Creating engine...');
        _engine = new Engine(platform, { thingpediaUrl: process.env.THINGPEDIA_URL || Config.THINGPEDIA_URL });

        _ad = new AssistantDispatcher(_engine);
        platform.setAssistant(_ad);
        const controlChannel = new AppControlChannel();
        bus = platform.getCapability('dbus-session');
        bus.exportInterface(controlChannel, DBUS_CONTROL_PATH, DBUS_CONTROL_INTERFACE);

        await Promise.all([_engine.open(), _ad.start()]);
        try {
            await new Promise((resolve, reject) => {
                const flags = DBUS_NAME_FLAG_ALLOW_REPLACEMENT | DBUS_NAME_FLAG_REPLACE_EXISTING;
                bus.requestName('edu.stanford.Almond.BackgroundService', flags, (err) => {
                    if (err)
                        reject(err);
                    else
                        resolve();
                });
            });
            console.log('Ready');

            _ad.startConversation();
            _running = true;
            if (!_stopped)
                await _engine.run();
        } finally {
            try {
                await _engine.close();
            } catch(error) {
                console.log('Exception during stop: ' + error.message);
                console.log(error.stack);
            }
        }
    } catch(error) {
        console.error('Uncaught exception: ' + error.message);
        console.error(error.stack);
    } finally {
        console.log('Cleaning up');
        platform.exit();
    }
}

main();
