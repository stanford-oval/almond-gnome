// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2013-2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Params = imports.params;

const Util = imports.util;

const ASSISTANT_INTERFACE = `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
"http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node name='/edu/stanford/Almond'>
    <interface name='edu.stanford.Almond.AssistantOutput'>
        <method name='Send'>
            <arg name='text' type='s' direction='in'/>
            <arg name='icon' type='s' direction='in'/>
        </method>
        <method name='SendPicture'>
            <arg name='url' type='s' direction='in'/>
            <arg name='icon' type='s' direction='in'/>
        </method>
        <method name='SendChoice'>
            <arg name='idx' type='i' direction='in'/>
            <arg name='what' type='s' direction='in'/>
            <arg name='title' type='s' direction='in'/>
            <arg name='text' type='s' direction='in'/>
        </method>
        <method name='SendLink'>
            <arg name='text' type='s' direction='in'/>
            <arg name='link' type='s' direction='in'/>
        </method>
        <method name='SendButton'>
            <arg name='text' type='s' direction='in'/>
            <arg name='json' type='s' direction='in'/>
        </method>
        <method name='SendAskSpecial'>
            <arg name='what' type='s' direction='in'/>
        </method>
        <method name='SendRDL'>
            <arg name='rdl' type='s' direction='in'/>
            <arg name='icon' type='s' direction='in'/>
        </method>
    </interface>
</node>`;

const Direction = {
    FROM_ALMOND: 0,
    FROM_USER: 1,
}

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
        message_type: GObject.ParamSpec.int('message-type', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, 0, MessageType.MAX, 0),
        ask_special_what: GObject.ParamSpec.string('ask-special-what', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),

        direction: GObject.ParamSpec.int('direction', '','', GObject.ParamFlags.READWRITE, 0, 1, 0),
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
    var icon = new Gtk.Image();
    box.get_style_context().add_class('message');
    box.get_style_context().add_class('from-almond');
    box.show();
    icon.show();
    box.pack_start(icon, false, true, 0);
    box.halign = Gtk.Align.START;

    if (msg.icon) {
        icon.gicon = new Gio.FileIcon({ file: Gio.File.new_for_uri('https://d1ge76rambtuys.cloudfront.net/icons/' + msg.icon + '.png') });
    } else {
        icon.gicon = new Gio.FileIcon({ file: Gio.File.new_for_uri('https://d1ge76rambtuys.cloudfront.net/icons/org.thingpedia.builtin.thingengine.builtin.png') });
    }
    return box;
}

const MessageConstructors = {
    [MessageType.TEXT](msg) {
        if (msg.direction === Direction.FROM_ALMOND) {
            var box = makeAlmondWrapper(msg);
            var label = new Gtk.Label({ wrap: true,
                halign: Gtk.Align.START,
                xalign: 0 });
            msg.bind_property('text', label, 'label', GObject.BindingFlags.SYNC_CREATE);
            label.show();
            box.pack_start(label, true, true, 0);
            return box;
        } else {
            var label = new Gtk.Label({ wrap: true,
                halign: Gtk.Align.END,
                xalign: 1 });
            label.get_style_context().add_class('message');
            label.get_style_context().add_class('from-user');
            label.show();
            msg.bind_property('text', label, 'label', GObject.BindingFlags.SYNC_CREATE);
            return label;
        }
    },

    [MessageType.PICTURE](msg) {
        var box = makeAlmondWrapper(msg);
        var image = new Gtk.Image();
        image.gicon = new Gio.FileIcon({ file: Gio.File.new_for_uri(msg.picture_url) });
        image.show();
        box.pack_start(image, true, true, 0);
        return box;
    },

    [MessageType.CHOICE]() {
    },

    [MessageType.LINK]() {
    },

    [MessageType.BUTTON]() {
    },

    [MessageType.ASK_SPECIAL]() {
    },

    [MessageType.RDL]() {
    }
}

const AssistantModel = new Lang.Class({
    Name: 'AssistantModel',

    _init(window, service, listbox) {
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(ASSISTANT_INTERFACE, this);
        this._service = service;
        this._dbusPath = '/edu/stanford/Almond/window_' + window.get_id();

        this._store = new Gio.ListStore();
        listbox.bind_model(this._store, (msg) => {
            return MessageConstructors[msg.message_type](msg);
        });
    },

    start() {
        this._dbusImpl.export(Gio.DBus.session, this._dbusPath);
        this._service.SetAssistantOutputRemote(this._dbusPath);
    },

    stop() {
        this._dbusImpl.unexport_from_connection(Gio.DBus.session);
        this._service.SetAssistantOutputRemote('/');
    },

    addUser(text) {
        this._store.append(new Message({
            direction: Direction.FROM_USER,
            message_type: MessageType.TEXT,
            text: text
        }));
    },

    Send(text) {
        log('Send ' + text);
        this._store.append(new Message({
            direction: Direction.FROM_ALMOND,
            message_type: MessageType.TEXT,
            text: text
        }));
    },

    SendPicture(url) {
        log('SendPicture ' + url);
        this._store.append(new Message({
            direction: Direction.FROM_ALMOND,
            message_type: MessageType.PICTURE,
            picture_url: url
        }));
    },

    SendLink() {
        // TODO
    },

    SendButton() {
        // TODO
    },

    SendChoice() {
        // TODO
    },

    SendAskSpecial() {
        // TODO
    },

    SendRDL() {
        // TODO
    }
});
