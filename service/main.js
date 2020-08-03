// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2016-2020 The Board of Trustees of the Leland Stanford Junior University
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

console.log('Almond-GNOME starting up...');
process.on('unhandledRejection', (up) => { throw up; });

const events = require('events');
const posix = require('posix');
const ThingTalk = require('thingtalk');
const Genie = require('genie-toolkit');
const canberra = require('canberra');

const { ninvoke } = require('./platform/utils');

const Config = require('./config');

var _engine;
var _running;
var _stopped;

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
        GetDeviceFactories: ['', 'aa{sv}'],
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
// marshall one a{sv} into something that dbus-native will like
function marshallASV(obj) {
    return Object.keys(obj).map((key) => [key, marshalAny(obj[key])]);
}

// marshal any JS value into a variant
function marshalAny(obj) {
    if (typeof obj === 'string')
        return ['s', obj];
    else if (typeof obj === 'number' && Math.floor(obj) === obj)
        return ['i', obj];
    else if (typeof obj === 'number')
        return ['d', obj];
    else if (typeof obj === 'boolean')
        return ['b', obj];
    else if (obj === null || obj === undefined)
        throw new Error('null/undefined cannot be sent over dbus');
    else if (Array.isArray(obj))
        return ['av', obj.map(marshalAny)];
    else
        return ['a{sv}', marshallASV(obj)];
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

const HOTWORD_DETECTED_ID = 1;
const SOUND_EFFECT_ID = 2;

class LocalUser {
    constructor() {
        var pwnam = posix.getpwnam(process.getuid());

        this.id = process.getuid();
        this.account = pwnam.name;
        this.name = pwnam.gecos;
    }
}

function handleStop() {
    if (_running)
        _engine.stop();
    else
        _stopped = true;
}

const Direction = {
    FROM_ALMOND: 0,
    FROM_USER: 1,
};

const MessageType = {
    TEXT: 0,
    PICTURE: 1,
    CHOICE: 2,
    LINK: 3,
    BUTTON: 4,
    ASK_SPECIAL: 5,
    RDL: 6,
    MAX: 6
};

function marshalAlmondMessage(msg) {
    let id = msg.id;
    let type;
    let direction = msg.type === 'command' ? Direction.FROM_USER : Direction.FROM_ALMOND;
    let out = {};

    switch (msg.type) {
    case 'command':
        type = MessageType.TEXT;
        out.text = msg.command;
        break;

    case 'text':
    case 'result':
        type = MessageType.TEXT;
        out.text = msg.text;
        out.icon = msg.icon || '';
        break;

    case 'picture':
        type = MessageType.PICTURE;
        out.picture_url = msg.url;
        out.icon = msg.icon || '';
        break;

    case 'rdl':
        type = MessageType.RDL;
        out.text = msg.rdl.displayTitle;
        out.rdl_description = msg.rdl.displayText || '';
        out.rdl_callback = msg.rdl.callback || msg.rdl.webCallback;
        out.picture_url = msg.rdl.pictureUrl || '';
        out.icon = msg.icon || '';
        break;

    case 'button':
        type = MessageType.BUTTON;
        out.text = msg.title;
        out.json = JSON.stringify(msg.json);
        break;

    case 'choice':
        type = MessageType.CHOICE;
        out.text = msg.title;
        out.choice_idx = String(msg.idx);
        break;

    case 'link':
        type = MessageType.LINK;
        out.text = msg.title;
        out.link = msg.url;
        break;
    }

    return [id, type, direction, marshallASS(out)];
}

const MAX_MSG_ID = 2**31-1;

class AppControlChannel extends events.EventEmitter {
    // handle control methods here...
    constructor() {
        super();
        this._conversation = _engine.assistant.openConversation('main', new LocalUser(), {
            showWelcome: true,
            debug: true,
            deleteWhenInactive: false,
            inactivityTimeout: 30000, // pick a low inactivity timeout to turn off the microphone
            contextResetTimeout: 600000, // but only reset the timeout after 10 minutes (the default)
        });
        this._conversation.addOutput(this, false);

        this._bus = _engine.platform.getCapability('dbus-session');

        this._nextMsgId = 0;
        this._history = [];

        this._enableVoiceInput = false;
        this._enableSpeech = false;
        this._speechHandler = new Genie.SpeechHandler(this._conversation, _engine.platform, {
            subscriptionKey: Config.MS_SPEECH_RECOGNITION_PRIMARY_KEY
        });
        try {
            this._eventSoundCtx = new canberra.Context({
                [canberra.Property.APPLICATION_ID]: 'edu.stanford.Almond',
            });
            this._eventSoundCtx.cache({
                [canberra.Property.EVENT_ID]: 'message-new-instant'
            });
        } catch(e) {
            this._eventSoundCtx = null;
            console.error(`Failed to initialize libcanberra: ${e.message}`);
        }
        this._speechHandler.on('hotword', async (hotword) => {
            this.emit('Activate');

            if (!this._eventSoundCtx)
                return;
            try {
                await this._eventSoundCtx.play(HOTWORD_DETECTED_ID, {
                    'media.role': 'voice-assistant',
                    [canberra.Property.EVENT_ID]: 'message-new-instant'
                });
            } catch(e) {
                console.error(`Failed to play hotword detection sound: ${e.message}`);
            }
        });
    }

    setHypothesis(hypothesis) {
        this.emit('VoiceHypothesis', hypothesis);
    }

    async start() {
        const prefs = _engine.platform.getSharedPreferences();

        let voiceInput = prefs.get('enable-voice-input');
        if (voiceInput === undefined) {
            // voice input is on by default
            prefs.set('enable-voice-input', true);
        }

        let speech = prefs.get('enable-voice-output');
        if (speech === undefined) {
            // voice output is on by default
            prefs.set('enable-voice-output', true);
        }

        this._speechHandler.setVoiceInput(prefs.get('enable-voice-input'));
        this._speechHandler.setVoiceOutput(prefs.get('enable-voice-output'));
        prefs.on('changed', (key) => {
            this._speechHandler.setVoiceInput(prefs.get('enable-voice-input'));
            this._speechHandler.setVoiceOutput(prefs.get('enable-voice-output'));

            this.emit('PreferenceChanged', key || '');
        });

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

        await this._speechHandler.start();
        await this._conversation.start();
    }

    stop() {
        return this._speechHandler.stop();
    }

    async _playSoundEffect(name) {
        // no sound effect if the user told us to be quiet
        const prefs = this._engine.platform.getSharedPreferences();
        if (!prefs.get('enable-voice-output'))
            return;
        // also no sound effect if libcanberra failed to load
        if (!this._eventSoundCtx)
            return;
        try {
            await this._eventSoundCtx.play(SOUND_EFFECT_ID, {
                'media.role': 'voice-assistant',
                [canberra.Property.EVENT_ID]: name
            });
        } catch(e) {
            console.error(`Failed to play sound effect: ${e.message}`);
        }
    }

    addMessage(msg) {
        if (msg.type === 'result' && msg.result.type === 'sound')
            this._playSoundEffect(msg.result.name);

        this.emit('NewMessage', ...marshalAlmondMessage(msg));
    }

    setExpected(what) {
        this.emit('NewMessage', MAX_MSG_ID, MessageType.ASK_SPECIAL, Direction.FROM_ALMOND, marshallASS({
            ask_special_what: what || 'null'
        }));
    }

    Stop() {
        handleStop();
    }

    async GetHistory() {
        return this._conversation.history.map(marshalAlmondMessage);
    }

    _collapseButtons() {
        const history = this._conversation.history;
        this.emit('RemoveMessage', MAX_MSG_ID);
        for (let i = history.length-1; i >= 0; i--) {
            let msg = history[i];
            if (msg.type === 'choice' || msg.type === 'button')
                this.emit('RemoveMessage', msg.id);
            else
                break;
        }
    }

    async HandleCommand(command) {
        this._collapseButtons();
        await this._conversation.handleCommand(command);
        return null;
    }

    async HandleThingTalk(code) {
        this._collapseButtons();
        await this._conversation.handleThingTalk(code);
        return null;
    }

    async HandleParsedCommand(title, json) {
        this._collapseButtons();
        await this._conversation.handleParsedCommand(JSON.parse(json), title);
        return null;
    }

    async StartOAuth2(kind) {
        const result = await _engine.startOAuth(kind);
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

    GetDeviceInfos() {
        const devices = _engine.getDeviceInfos();
        return devices.map(marshallASV);
    }

    GetDeviceFactories(deviceClass) {
        return _engine.thingpedia.getDeviceFactories().then((factories) => factories.map((f) => {
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
        return marshallASV(_engine.getDeviceInfo(uniqueId));
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

    GetAppInfos() {
        const apps = _engine.getAppInfos();
        return apps.map(marshallASV);
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

async function sendOldSchoolNotification(bus, title, body, actions = []) {
    try {
        const iface = await ninvoke(bus, 'getInterface',
            'org.freedesktop.Notifications',
            '/org/freedesktop/Notifications',
            'org.freedesktop.Notifications');

        const actionsdbus = [];
        actions.forEach(([label,], i) => {
            actionsdbus.push(String(i), label);
        });

        const id = await ninvoke(iface, 'Notify', "Almond", 0, 'edu.stanford.Almond', title, body, actionsdbus, marshallASV({
            'desktop-entry': 'edu.stanford.Almond.desktop'
        }), -1);
        iface.on('ActionInvoked', (notificationId, actionId) => {
            if (notificationId !== id)
                return;
            actions[actionId][1]();
        });
    } catch(e) {
        console.error(`Failed to send notification`, e);
    }
}

async function acquireBusName(bus) {
    await new Promise((resolve, reject) => {
        const flags = DBUS_NAME_FLAG_ALLOW_REPLACEMENT | DBUS_NAME_FLAG_REPLACE_EXISTING;
        bus.requestName('edu.stanford.Almond.BackgroundService', flags, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}

async function maybeNotifyShellExtension(platform, bus) {
    if (process.env.XDG_CURRENT_DESKTOP === 'GNOME') {
        try {
            const obj = await ninvoke(bus, 'getObject', 'org.gnome.Shell',
                '/edu/stanford/Almond/ShellExtension');
            const [,[version,]] = await ninvoke(obj.as('org.freedesktop.DBus.Properties'), 'Get',
                'edu.stanford.Almond.ShellExtension', 'Version');
            if (version === '1.8.0') {
                console.log('Shell extension installed and up-to-date');
            } else {
                await sendOldSchoolNotification(bus, "Almond is out of date",
                    "You should install the latest version of the Almond Shell extension to leverage all functionality.",
                    [["Update", () => {
                    platform.getCapability('app-launcher').launchURL('https://extensions.gnome.org/extension/1795/almond/');
                }]]);
            }
        } catch(e) {
            await sendOldSchoolNotification(bus, "Almond Shell Extension Missing",
                "You should install the latest version of the Almond Shell extension to leverage all functionality.",
                [["Install", () => {
                platform.getCapability('app-launcher').launchURL('https://extensions.gnome.org/extension/1795/almond/');
            }]]);
        }
    } else {
        // on other desktops, we send the notification, but only once
        const sharedPrefs = platform.getSharedPreferences();
        if (!sharedPrefs.get('almond-notified-wrong-desktop')) {
            sharedPrefs.set('almond-notified-wrong-desktop', true);
            await sendOldSchoolNotification(bus, "Limited Almond functionality",
                "Full functionality of Almond is only available on the GNOME desktop.");
        }
    }
}

async function main() {
    process.on('SIGINT', handleStop);
    process.on('SIGTERM', handleStop);

    const platform = require('./platform').newInstance();
    await platform.init();
    try {
        console.log('GNOME platform initialized');

        console.log('Creating engine...');
        _engine = new Genie.AssistantEngine(platform, {
            thingpediaUrl: process.env.THINGPEDIA_URL || Config.THINGPEDIA_URL,
            nluModelUrl: Config.SEMPRE_URL
        });

        const controlChannel = new AppControlChannel();
        const bus = platform.getCapability('dbus-session');
        bus.exportInterface(controlChannel, DBUS_CONTROL_PATH, DBUS_CONTROL_INTERFACE);

        await _engine.open();
        try {
            await acquireBusName(bus);
            console.log('Ready');

            // check if the shell extension is installed and
            // if not, send a notification
            // this is all done in parallel to starting, and we delay it 10 seconds to
            // ensure that the shell extension has started
            // (this is important in particular if the shell extension is the one starting us)
            setTimeout(() => maybeNotifyShellExtension(platform, bus), 10000);

            _running = true;
            await controlChannel.start();
            if (!_stopped)
                await _engine.run();
        } finally {
            try {
                await controlChannel.stop();
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
