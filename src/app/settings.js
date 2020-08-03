// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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