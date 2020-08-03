// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Signals = imports.signals;

/* exported Direction */
var Direction = {
    FROM_ALMOND: 0,
    FROM_USER: 1,
};

/* exported MessageType */
var MessageType = {
    TEXT: 0,
    PICTURE: 1,
    CHOICE: 2,
    LINK: 3,
    BUTTON: 4,
    ASK_SPECIAL: 5,
    RDL: 6,
    MAX: 6
};

var Message = GObject.registerClass({
    Properties: {
        message_id: GObject.ParamSpec.int('message-id', '', '', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, 0, GLib.MAXINT32, 0),
        message_type: GObject.ParamSpec.int('message-type', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, 0, MessageType.MAX, 0),
        direction: GObject.ParamSpec.int('direction', '','', GObject.ParamFlags.READWRITE, 0, 1, 0),

        ask_special_what: GObject.ParamSpec.string('ask-special-what', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        icon: GObject.ParamSpec.string('icon', '','', GObject.ParamFlags.READWRITE, null),
        text: GObject.ParamSpec.string('text', '','', GObject.ParamFlags.READWRITE, null),
        picture_url: GObject.ParamSpec.string('picture_url', '','', GObject.ParamFlags.READWRITE, null),
        choice_idx: GObject.ParamSpec.int('choice-idx', '','', GObject.ParamFlags.READWRITE,-1, 1000, 0),
        link: GObject.ParamSpec.string('link', '','', GObject.ParamFlags.READWRITE, null),
        json: GObject.ParamSpec.string('json', '','', GObject.ParamFlags.READWRITE, null),
        rdl_description: GObject.ParamSpec.string('rdl-description', '','', GObject.ParamFlags.READWRITE, null),
        rdl_callback: GObject.ParamSpec.string('rdl-callback', '','', GObject.ParamFlags.READWRITE, null)
    }
}, class AlmondAssistantMessage extends GObject.Object {
    toNotification() {
        switch (this.message_type) {
        case MessageType.TEXT:
            return _("Almond says: %s").format(this.text);
        case MessageType.PICTURE:
            return _("Almond sends a picture");
        case MessageType.CHOICE:
        case MessageType.BUTTON:
            return _("Almond sends a button");
        case MessageType.RDL:
        case MessageType.LINK:
            return _("Almond sends a link: %s").format(this.text);
        default:
            return '';
        }
    }

});

function dbusPromiseify(obj, fn, ...args) {
    return new Promise((resolve, reject) => {
        return obj[fn](...args, (result, error) => {
            if (error)
                reject(error);
            else
                resolve(result);
        });
    });
}

/* exported AssistantModel */
var AssistantModel = class AssistantModel {
    constructor(service) {
        this._service = service;

        this.store = new Gio.ListStore();
    }

    start() {
        this._newMessageId = this._service.connectSignal('NewMessage', (signal, sender, params) => {
            this._onNewMessage(params);
        });
        this._removeMessageId = this._service.connectSignal('RemoveMessage', (signal, sender, [id]) => {
            this._onRemoveMessage(id);
        });

        return dbusPromiseify(this._service, 'GetHistoryRemote').then(([history]) => {
            for (let msg of history)
                this._onNewMessage(msg);
        }).catch((e) => {
            log('Failed to retrieve the assistant history: ' + e);
        });
    }

    stop() {
        this._service.disconnectSignal(this._newMessageId);
        this._service.disconnectSignal(this._removeMessageId);
    }

    _onNewMessage([id, type, direction, msg]) {
        if (type === MessageType.CHOICE)
            msg.choice_idx = parseInt(msg.choice_idx);

        msg.message_id = id;
        msg.message_type = type;
        msg.direction = direction;

        const obj = new Message(msg);
        this.emit('new-message', obj);

        if (type === MessageType.ASK_SPECIAL) {
            if (['yesno', 'picture'].indexOf(msg.ask_special_what) < 0) {
                // do something about it...
                return;
            }
        }
        this.store.append(obj);
    }

    _onRemoveMessage(id) {
        let n = this.store.get_n_items();

        // start from the end, for the common case of buttons collapsing
        for (let i = n-1; i >= 0; i--) {
            let msg = this.store.get_item(i);
            if (msg.message_id === id) {
                this.store.remove(i);
                break;
            }
        }
    }
};
Signals.addSignalMethods(AssistantModel.prototype);
