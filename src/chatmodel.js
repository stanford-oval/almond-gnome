// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2013-2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Lang = imports.lang;
const Params = imports.params;

const Util = imports.util;
const Config = imports.config;

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

const Message = new Lang.Class({
    Name: 'AssistantMessage',
    Extends: GObject.Object,
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
});

function makeAlmondWrapper(msg) {
    var box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                            spacing: 12 });
    box.get_style_context().add_class('message-container');
    var icon = new Gtk.Image({ icon_size: 5 });
    icon.valign = Gtk.Align.START;
    box.show();
    icon.show();
    box.pack_start(icon, false, true, 0);
    box.halign = Gtk.Align.START;

    let deviceIcon = msg.icon || 'org.thingpedia.builtin.thingengine.builtin';
    icon.gicon = new Gio.FileIcon({ file: Gio.File.new_for_uri(Config.S3_CLOUDFRONT_HOST + '/icons/' + deviceIcon + '.png') });
    return box;
}

function makeGenericWrapper(msg) {
    var box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                            spacing: 12 });
    box.get_style_context().add_class('message-container');
    return box;
}

function ginvoke(obj, fn, fnfinish, ...args) {
    return new Promise((resolve, reject) => {
        obj[fn](...args, (_ignored, result) => {
            try {
                resolve(obj[fnfinish](result));
            } catch(e) {
                reject(e);
            }
        });
    });
}

function gpromise(fn, fnfinish, ...args) {
    return new Promise((resolve, reject) => {
        fn(...args, (_ignored, result) => {
            try {
                resolve(fnfinish(result));
            } catch(e) {
                reject(e);
            }
        });
    });
}

const MessageConstructors = {
    [MessageType.TEXT](msg) {
        let label;
        let box;
        if (msg.direction === Direction.FROM_ALMOND) {
            box = makeAlmondWrapper(msg);
            label = new Gtk.Label({
                wrap: true,
                hexpand: true,
                halign: Gtk.Align.START,
                xalign: 0 });
            label.get_style_context().add_class('from-almond');
        } else {
            box = makeGenericWrapper(msg);
            label = new Gtk.Label({
                wrap: true,
                hexpand: true,
                halign: Gtk.Align.END,
                xalign: 1 });
            label.get_style_context().add_class('from-user');
        }
        label.get_style_context().add_class('message');
        msg.bind_property('text', label, 'label', GObject.BindingFlags.SYNC_CREATE);
        label.show();
        box.pack_start(label, true, true, 0);
        return box;
    },

    [MessageType.PICTURE](msg) {
        var box = makeAlmondWrapper(msg);
        var image = new Gtk.Image({ hexpand: true });
        image.get_style_context().add_class('message');
        image.get_style_context().add_class('from-almond');

        let file = Gio.File.new_for_uri(msg.picture_url);
        ginvoke(file, 'read_async', 'read_finish', GLib.PRIORITY_DEFAULT, null).then((stream) => {
            return gpromise(GdkPixbuf.Pixbuf.new_from_stream_async, GdkPixbuf.Pixbuf.new_from_stream_finish, stream, null);
        }).then((pixbuf) => {
            image.set_from_pixbuf(pixbuf);
        }).catch((e) => {
            log('Failed to load image at ' + msg.picture_url + ': ' + e);

        });
        image.show();
        box.pack_start(image, true, true, 0);
        return box;
    },

    [MessageType.CHOICE](msg, service) {
        var box = makeGenericWrapper(msg);
        var button = new Gtk.Button({
            halign: Gtk.Align.CENTER,
            hexpand: true });
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.show();
        button.connect('clicked', () => {
            dbusPromiseify(service, 'HandleParsedCommandRemote', msg.text, JSON.stringify({answer:{type:'Choice', value: msg.choice_idx}})).catch((e) => {
                log('Failed to click on button: ' + e);
            });
        });
        box.pack_start(button, true, true, 0);
        return box;
    },

    [MessageType.LINK]() {
        return null;
    },

    [MessageType.BUTTON](msg, service) {
        var box = makeGenericWrapper(msg);
        var button = new Gtk.Button({
            halign: Gtk.Align.CENTER,
            hexpand: true });
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.show();
        button.connect('clicked', () => {
            dbusPromiseify(service, 'HandleParsedCommandRemote', msg.text, msg.json).catch((e) => {
                log('Failed to click on button: ' + e);
            });
        });
        box.pack_start(button, true, true, 0);
        return box;
    },

    [MessageType.ASK_SPECIAL](msg, service) {
        if (msg.ask_special_what === 'yesno') {
            var box = makeGenericWrapper(msg);
            var button_box = new Gtk.ButtonBox({
                layout_style: Gtk.ButtonBoxStyle.CENTER,
                hexpand: true });

            var yes = new Gtk.Button({
                label: _("Yes"),
                halign: Gtk.Align.CENTER,
                hexpand: true });
            yes.show();
            yes.connect('clicked', () => {
                dbusPromiseify(service, 'HandleParsedCommandRemote', _("Yes"), JSON.stringify({"special":"yes"})).catch((e) => {
                    log('Failed to click on button: ' + e);
                });
            });
            button_box.add(yes);

            var no = new Gtk.Button({
                label: _("No"),
                halign: Gtk.Align.CENTER,
                hexpand: true });
            no.show();
            no.connect('clicked', () => {
                dbusPromiseify(service, 'HandleParsedCommandRemote', _("No"), JSON.stringify({"special":"no"})).catch((e) => {
                    log('Failed to click on button: ' + e);
                });
            });
            button_box.add(no);

            button_box.show();
            box.pack_start(button_box, true, true, 0);
            return box;
        } else {
            // do something else...
        }
    },

    [MessageType.RDL](msg) {
        var box = makeAlmondWrapper(msg);
        let text = `<a href="${GLib.markup_escape_text(msg.rdl_callback, -1)}">${GLib.markup_escape_text(msg.text, -1)}</a>`;
        if (msg.rdl_description)
            text += '\n' + GLib.markup_escape_text(msg.rdl_description, -1);
        var label = new Gtk.Label({
            wrap: true,
            hexpand: true,
            halign: Gtk.Align.START,
            xalign: 0,
            label: text,
            use_markup: true });
        label.get_style_context().add_class('message');
        label.get_style_context().add_class('from-almond');
        label.show();
        box.pack_start(label, true, true, 0);
        return box;
    }
}

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

var AssistantModel = class AssistantModel {
    constructor(window, service, listbox) {
        this._service = service;
        this._listbox = listbox;

        this._store = new Gio.ListStore();
        listbox.bind_model(this._store, (msg) => {
            return MessageConstructors[msg.message_type](msg, service);
        });
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
        if (type === MessageType.ASK_SPECIAL && msg.ask_special_what !== 'yesno') {
            // do something about it...
            return;
        }
        if (type === MessageType.CHOICE)
            msg.choice_idx = parseInt(msg.choice_idx);

        msg.message_id = id;
        msg.message_type = type;
        msg.direction = direction;
        this._store.append(new Message(msg));
    }

    _onRemoveMessage(id) {
        let n = this._store.get_n_items();

        // start from the end, for the common case of buttons collapsing
        for (let i = n-1; i >= 0; i--) {
            let msg = this._store.get_item(i);
            if (msg.message_id === id) {
                this._store.remove(i);
                break;
            }
        }
    }
};
