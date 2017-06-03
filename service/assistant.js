// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const posix = require('posix');

const Config = require('./config');

const Almond = require('almond');

class LocalUser {
    constructor() {
        var pwnam = posix.getpwnam(process.getuid());

        this.id = process.getuid();
        this.account = pwnam.name;
        this.name = pwnam.gecos;
    }
}

class AssistantDispatcher {
    constructor(engine) {
        this._engine = engine;
        this._conversation = null;

        this._bus = platform.getCapability('dbus-session');
        this._output = null;
    }

    start() {}
    stop() {}

    setAssistantOutput(service, object) {
        if (object === '/') {
            this._output = null;
            return;
        }

        return Q.ninvoke(this._bus, 'getInterface', service, object, 'edu.stanford.Almond.AssistantOutput')
            .then((iface) => {
            this._output = iface;
            this._ensureConversation();
        }).catch((e) => {
            console.error('Failed to retrieve interface AssistantOutput', e);
        });
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

    notifyAll(data) {
        this._ensureConversation();
        return this._conversation.notify(data);
    }

    notifyErrorAll(data) {
        this._ensureConversation();
        return this._conversation.notifyError(data);
    }

    getConversation() {
        this._ensureConversation();
        return this._conversation;
    }

    handleParsedCommand(json) {
        this._ensureConversation();
        return this._conversation.handleParsedCommand(json);
    }

    handleCommand(text) {
        this._ensureConversation();
        return this._conversation.handleCommand(text);
    }

    send(text, icon) {
        if (!this._output) // FIXME
            return console.log('Lost message ' + text);
        return Q.ninvoke(this._output, 'Send', text, icon || '');
    }

    sendPicture(url, icon) {
        if (!this._output) // FIXME
            return console.log('Lost picture ' + url);
        return Q.ninvoke(this._output, 'SendPicture', url, icon || '');
    }

    sendChoice(idx, what, title, text) {
        if (!this._output) // FIXME
            return console.log('Lost choice ', idx, what);
        return Q.ninvoke(this._output, 'SendChoice', idx, what, title, text);
    }

    sendLink(title, url) {
        if (!this._output) // FIXME
            return console.log('Lost link ' + url);
        return Q.ninvoke(this._output, 'SendLink', title, url);
    }

    sendButton(title, json) {
        if (!this._output) // FIXME
            return console.log('Lost button ' + json);
        return Q.ninvoke(this._output, 'SendButton', title, json);
    }

    sendAskSpecial(what) {
        if (!this._output) // FIXME
            return console.log('Lost ask special ' + what);
        return Q.ninvoke(this._output, 'SendAskSpecial', what || '');
    }

    sendRDL(rdl, icon) {
        if (!this._output) // FIXME
            return console.log('Lost RDL ', rdl);
        return Q.ninvoke(this._output, 'SendRDL', JSON.stringify(rdl), icon || '');
    }
};

module.exports = AssistantDispatcher;
