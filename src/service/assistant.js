// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const posix = require('posix');

const Config = require('./config');

const Sabrina = require('sabrina');

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

    setAssistantOutput(service, object) {
        return this._bus.getInterface(service, object, 'edu.stanford.thingengine.AssistantOutput')
            .then((iface) => {
            this._output = iface;
            this._ensureConversation();
        });
    }

    start() {
    }

    stop() {
    }

    _ensureConversation() {
        if (this._conversation)
            return;
        this._conversation = new Sabrina(this._engine, new LocalUser(), this, true, Config.SEMPRE_URL);
        this._conversation.start();
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
        return Q.ninvoke(this._output, 'Send', text, icon || '');
    }

    sendPicture(url, icon) {
        return Q.ninvoke(this._output, 'SendPicture', url, icon || '');
    }

    sendChoice(idx, what, title, text) {
        return Q.ninvoke(this._output, 'SendChoice', idx, what, title, text);
    }

    sendLink(title, url) {
        return Q.ninvoke(this._output, 'SendLink', title, url);
    }

    sendButton(title, json) {
        return Q.ninvoke(this._output, 'SendButton', title, json);
    }

    sendAskSpecial(what) {
        return Q.ninvoke(this._output, 'SendAskSpecial', what);
    }

    sendRDL(rdl, icon) {
        return Q.ninvoke(this._output, 'SendRDL', JSON.stringify(rdl), icon);
    }
};

module.exports = AssistantDispatcher;
