// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2013-2018 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;

const { PreferenceBinding } = imports.app.prefs;

/* exported SettingsDialog */
var SettingsDialog = GObject.registerClass({
    Template: 'resource:///edu/stanford/Almond/settings.ui',
    Properties: {},
    Children: [
        'developer-key'
    ],
}, class SettingsDialog extends Gtk.Dialog {
    _init(parent, service) {
        super._init({
            transient_for: parent,
            application: parent.get_application(),
            modal: true,
            use_header_bar: 1
        });

        const devKeyBinding = new PreferenceBinding(service, 'developer-key', 's');
        devKeyBinding.connect('notify::state', () => {
            let newValue = devKeyBinding.state.deep_unpack();
            if (newValue === this.developer_key.text)
                return;
            this.developer_key.text = newValue;
        });
        this.developer_key.connect('notify::text', () => {
            let oldValue = devKeyBinding.state.deep_unpack();
            if (oldValue === this.developer_key.text)
                return;
            devKeyBinding.state = new GLib.Variant('s', this.developer_key.text);
        });
        this.connect('destroy', () => {
            devKeyBinding.destroy();
        });
    }
});