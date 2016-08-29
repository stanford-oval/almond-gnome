// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Config = require('./config');

const Sabrina = require('sabrina');

/*
const JavaAPI = require('./java_api');

const COMMANDS = ['send', 'sendPicture', 'sendChoice', 'sendLink', 'sendButton', 'sendAskSpecial'];
const AssistantJavaApi = JavaAPI.makeJavaAPI('Assistant', [],
    COMMANDS.concat(['sendRDL']),
    ['onready', 'onhandlecommand', 'onhandleparsedcommand']);
*/

class LocalUser {
    constructor() {
        this.id = 0;
        this.account = 'INVALID';
        this.name = platform.getSharedPreferences().get('user-name');
    }
}

class AssistantDispatcher {
    constructor(engine) {
        this._engine = engine;
        this._conversation = null;
    }

    start() {
/*
        AssistantJavaApi.onhandlecommand = this._onHandleCommand.bind(this);
        AssistantJavaApi.onhandleparsedcommand = this._onHandleParsedCommand.bind(this);
        AssistantJavaApi.onready = this._onReady.bind(this);
*/
    }

    stop() {
/*
        AssistantJavaApi.onhandlecommand = null;
        AssistantJavaApi.onhandleparsedcommand = null;
        AssistantJavaApi.onready = null;
*/
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

    _onReady() {
        this._ensureConversation();
    }

    _onHandleParsedCommand(error, json) {
        this._ensureConversation();
        return this._conversation.handleParsedCommand(json);
    }

    _onHandleCommand(error, text) {
        this._ensureConversation();
        return this._conversation.handleCommand(text);
    }

/*
    // sendRDL is special because we need to stringify the rdl before we
    // call the Java API, or jxcore will marshal it weirdly
    sendRDL(rdl, icon) {
        return AssistantJavaApi.sendRDL(JSON.stringify(rdl), icon);
    }
*/
};
/*
COMMANDS.forEach(function(c) {
    AssistantDispatcher.prototype[c] = AssistantJavaApi[c];
});
*/

module.exports = AssistantDispatcher;
