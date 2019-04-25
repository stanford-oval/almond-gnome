// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016-2017 The Board of Trustees of the Leland Stanford Junior University
//           2017      Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const posix = require('posix');
const events = require('events');
const canberra = require('canberra');

const Config = require('./config');
const SpeechHandler = require('./speech_handler');
const SpeechSynthesizer = require('./speech_synthesizer');

const Almond = require('almond-dialog-agent');

class LocalUser {
    constructor() {
        var pwnam = posix.getpwnam(process.getuid());

        this.id = process.getuid();
        this.account = pwnam.name;
        this.name = pwnam.gecos;
    }
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

const HOTWORD_DETECTED_ID = 1;

class AssistantDispatcher extends events.EventEmitter {
    constructor(engine) {
        super();
        this._engine = engine;
        this._conversation = null;

        this._bus = engine.platform.getCapability('dbus-session');

        this._nextMsgId = 0;
        this._history = [];

        this._enableVoiceInput = false;
        this._enableSpeech = false;
        this._speechHandler = new SpeechHandler(engine.platform);
        this._speechSynth = new SpeechSynthesizer(engine.platform);
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

        this._speechHandler.on('hypothesis', (hypothesis) => {
            this.emit('VoiceHypothesis', hypothesis);
        });
        this._speechHandler.on('hotword', async (hotword) => {
            this.emit('Activate');

            if (!this._eventSoundCtx)
                return;
            try {
                await this._eventSoundCtx.play(HOTWORD_DETECTED_ID, {
                    [canberra.Property.EVENT_ID]: 'message-new-instant'
                });
            } catch(e) {
                console.error(`Failed to play hotword detection sound: ${e.message}`);
            }
        });
        this._speechHandler.on('utterance', (utterance) => {
            this.emit('VoiceHypothesis', '');
            this.handleCommand(utterance).catch((e) => {
                console.error(e.stack);
            });
        });
        this._speechHandler.on('error', (error) => {
            console.log('Error in speech recognition: ' + error.message);
            this.send("Sorry, I had an error understanding your speech: " + error.message);
        });
    }

    setVoiceInput(voiceInput) {
        if (this._enableVoiceInput === voiceInput)
            return;
        this._enableVoiceInput = voiceInput;
        if (voiceInput)
            this._speechHandler.start();
        else
            this._speechHandler.stop();
    }

    start() {
        const prefs = this._engine.platform.getSharedPreferences();

        let voiceInput = prefs.get('enable-voice-input');
        if (voiceInput === undefined) {
            // voice input is on by default
            voiceInput = true;
            prefs.set('enable-voice-input', true);
        }

        let speech = prefs.get('enable-voice-output');
        if (speech === undefined) {
            // voice output is on by default
            speech = true;
            prefs.set('enable-voice-output', true);
        }
        this._enableSpeech = speech;

        prefs.on('changed', (key) => {
            this.setVoiceInput(prefs.get('enable-voice-input'));
            this._enableSpeech = prefs.get('enable-voice-output');

            if (!this._enableSpeech)
                this._speechSynth.clearQueue();
        });

        return this._speechSynth.start();
    }
    stop() {
        if (this._enableVoiceInput)
            this._speechHandler.stop();
    }

    startConversation() {
        this._ensureConversation();

        const prefs = this._engine.platform.getSharedPreferences();
        this.setVoiceInput(prefs.get('enable-voice-input'));
    }

    _ensureConversation() {
        if (this._conversation)
            return;
        this._conversation = new Almond(this._engine, 'native-gnome', new LocalUser(), this, {
            debug: true,
            sempreUrl: Config.SEMPRE_URL,
            showWelcome: true
        });
        this._conversation.start();
    }

    notifyAll(...data) {
        this._ensureConversation();
        return this._conversation.notify(...data);
    }

    notifyErrorAll(...data) {
        this._ensureConversation();
        return this._conversation.notifyError(...data);
    }

    getConversation() {
        this._ensureConversation();
        return this._conversation;
    }

    handleParsedCommand(title, json) {
        this._speechSynth.clearQueue();
        this._collapseButtons();
        if (title) {
            this._addMessage(MessageType.TEXT, Direction.FROM_USER, {
                text: title
            });
        }
        this._ensureConversation();
        return this._conversation.handleParsedCommand(JSON.parse(json));
    }

    handleCommand(text) {
        this._speechSynth.clearQueue();
        this._collapseButtons();
        this._addMessage(MessageType.TEXT, Direction.FROM_USER, {
            text: text
        });
        this._ensureConversation();
        return this._conversation.handleCommand(text);
    }

    handleThingTalk(code) {
        this._speechSynth.clearQueue();
        this._collapseButtons();
        this._addMessage(MessageType.TEXT, Direction.FROM_USER, {
            text: this._engine._("Code: %s").format(code)
        });
        this._ensureConversation();
        return this._conversation.handleThingTalk(code);
    }

    getHistory() {
        let history = this._history.slice();
        this._ensureConversation();
        return Q(history);
    }

    _collapseButtons() {
        for (let i = this._history.length-1; i >= 0; i--) {
            let last = this._history[i];
            let id = last[0];
            let type = last[1];
            if (type === MessageType.ASK_SPECIAL || type === MessageType.CHOICE || type === MessageType.BUTTON) {
                this._history.pop();
                this.emit('RemoveMessage', id);
            } else {
                break;
            }
        }
    }

    _addMessage(type, direction, msg) {
        let id = this._nextMsgId++;
        this._history.push([id, type, direction, msg]);
        if (this._history.length > 30)
            this._history.shift();
        this.emit('NewMessage', id, type, direction, msg);
    }

    send(text, icon) {
        if (this._enableSpeech)
            this._speechSynth.say(text);
        this._addMessage(MessageType.TEXT, Direction.FROM_ALMOND, {
            text: text,
            icon: icon || ''
        });
    }

    sendPicture(url, icon) {
        this._addMessage(MessageType.PICTURE, Direction.FROM_ALMOND, {
            picture_url: url,
            icon: icon || ''
        });
    }

    sendChoice(idx, what, title, text) {
        if (this._enableSpeech)
            this._speechSynth.say(title);
        this._addMessage(MessageType.CHOICE, Direction.FROM_ALMOND, {
            choice_idx: String(idx),
            text: title
        });
    }

    sendLink(title, url) {
        this._addMessage(MessageType.LINK, Direction.FROM_ALMOND, {
            text: title,
            link: url
        });
    }

    sendButton(title, json) {
        if (this._enableSpeech)
            this._speechSynth.say(title);
        this._addMessage(MessageType.BUTTON, Direction.FROM_ALMOND, {
            text: title,
            json: JSON.stringify(json)
        });
    }

    sendAskSpecial(what) {

        this._addMessage(MessageType.ASK_SPECIAL, Direction.FROM_ALMOND, {
            ask_special_what: what || 'null'
        });

        if (what === null && this._enableVoiceInput) {
            this._speechHandler.setAutoTrigger(false);
            return;
        }

        this._speechSynth.endFrame().then(() => {
            if (what !== null && this._enableVoiceInput)
                this._speechHandler.setAutoTrigger(true);
        }).catch((err) => {
            if (err.code === 'ECANCELLED')
                return;
            console.error('Failed to set auto trigger at the end of the queue', err);
        });
    }

    sendRDL(rdl, icon) {
        if (this._enableSpeech)
            this._speechSynth.say(rdl.displayTitle);
        this._addMessage(MessageType.RDL, Direction.FROM_ALMOND, {
            text: rdl.displayTitle,
            rdl_description: rdl.displayText || '',
            rdl_callback: rdl.callback || rdl.webCallback,
            icon: icon || ''
        });
    }
}

module.exports = AssistantDispatcher;
