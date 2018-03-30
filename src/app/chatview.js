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
const Soup = imports.gi.Soup;

const Config = imports.common.config;
const { AssistantModel, Direction, MessageType } = imports.common.chatmodel;
const { ginvoke, gpromise } = imports.common.util;

function getGIcon(icon) {
    if (!icon)
        return new Gio.ThemedIcon({ name: 'edu.stanford.Almond' });
    return new Gio.FileIcon({ file: Gio.File.new_for_uri(Config.THINGPEDIA_URL + '/api/devices/icon/' + icon) });
}

function makeAlmondWrapper(msg) {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        halign: Gtk.Align.START
    });
    box.get_style_context().add_class('message-container');
    const icon = new Gtk.Image({
        icon_size: 5,
        gicon: getGIcon(msg.icon),
        valign: Gtk.Align.START
    });
    box.show();
    icon.show();
    box.pack_start(icon, false, true, 0);

    return box;
}

function makeGenericWrapper(msg) {
    var box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                            spacing: 12 });
    box.get_style_context().add_class('message-container');
    return box;
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
        const box = makeAlmondWrapper(msg);
        const image = new Gtk.Image({ hexpand: true });
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

    [MessageType.CHOICE](msg, service, window) {
        const box = makeGenericWrapper(msg);
        const button = new Gtk.Button({
            halign: Gtk.Align.CENTER,
            hexpand: true });
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.show();
        button.connect('clicked', () => {
            window.handleChoice(msg.choice_idx, msg.text);
        });
        box.pack_start(button, true, true, 0);
        return box;
    },

    [MessageType.LINK](msg, service, window) {
        // A LINK message is an internal navigation button that is represented
        // as URL (for ease of implementation in web based UIs)
        // we remap it to window actions

        const box = makeGenericWrapper(msg);
        const button = new Gtk.Button({
            halign: Gtk.Align.CENTER,
            hexpand: true });
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.show();

        if (msg.link === '/user/register') {
            // ??? we are not anonymous, this should never happen
            throw new Error('Invalid link asking the user to register');
        } else if (msg.link === '/thingpedia/cheatsheet') {
            button.on('clicked', () => {
                Gtk.show_uri_on_window(window, 'https://almond.stanford.edu' + msg.link,
                                       Gtk.get_current_event_time());
            });
        } else if (msg.link === '/apps') {
            button.set_detailed_action_name('win.switch-to::page-my-goods');
        } else if (msg.link.startsWith('/devices/oauth2/')) {
            // "parse" the link in the context of a dummy base URI
            let uri = Soup.URI.new('https://invalid').new_with_base(msg.link);
            let kind = uri.get_path().substring('/devices/oauth2/'.length);
            let query = Soup.form_decode(uri.get_query());
            button.action_name = 'win.configure-device-oauth2';
            button.action_target = new GLib.Variant('(ss)', [kind, query.name||'']);
        } else if (msg.link.startsWith('/devices/configure/')) {
            // "parse" the link in the context of a dummy base URI
            let uri = Soup.URI.new('https://invalid').new_with_base(msg.link);
            let kind = uri.get_path().substring('/devices/configure/'.length);
            let query = Soup.form_decode(uri.get_query());
            button.action_name = 'win.configure-device-form';
            button.action_target = new GLib.Variant('(ssaa{ss})', [kind, query.name||'',
                JSON.parse(query.controls || '[]')]);
        } else {
            throw new Error('Unexpected link to ' + msg.link);
        }

        box.pack_start(button, true, true, 0);
        return box;
    },

    [MessageType.BUTTON](msg, service, window) {
        const box = makeGenericWrapper(msg);
        const button = new Gtk.Button({
            halign: Gtk.Align.CENTER,
            hexpand: true });
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.show();
        button.connect('clicked', () => {
            window.handleParsedCommand(msg.json, msg.text);
        });
        box.pack_start(button, true, true, 0);
        return box;
    },

    [MessageType.ASK_SPECIAL](msg, service, window) {
        if (msg.ask_special_what === 'yesno') {
            const box = makeGenericWrapper(msg);
            const button_box = new Gtk.ButtonBox({
                layout_style: Gtk.ButtonBoxStyle.CENTER,
                hexpand: true });

            const yes = new Gtk.Button({
                label: _("Yes"),
                halign: Gtk.Align.CENTER,
                hexpand: true
            });
            yes.show();
            yes.connect('clicked', () => {
                window.handleSpecial('yes', _("Yes"));
            });
            button_box.add(yes);

            const no = new Gtk.Button({
                label: _("No"),
                halign: Gtk.Align.CENTER,
                hexpand: true
            });
            no.show();
            no.connect('clicked', () => {
                window.handleSpecial('no', _("No"));
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
};

/* exported bindChatModel */
function bindChatModel(window, service, listbox) {
    let model = new AssistantModel(service);
    listbox.bind_model(model.store, (msg) => {
        return MessageConstructors[msg.message_type](msg, service, window);
    });
    return model;
}