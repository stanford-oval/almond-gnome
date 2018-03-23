// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright (c) 2013, 2018 Giovanni Campagna <scampa.giovanni@gmail.com>
//
// Redistribution and use in source and binary forms, with or without
//  modification, are permitted provided that the following conditions are met:
//   * Redistributions of source code must retain the above copyright
//     notice, this list of conditions and the following disclaimer.
//   * Redistributions in binary form must reproduce the above copyright
//     notice, this list of conditions and the following disclaimer in the
//     documentation and/or other materials provided with the distribution.
//   * Neither the name of the GNOME Foundation nor the
//     names of its contributors may be used to endorse or promote products
//     derived from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE FOR ANY
// DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
"use strict";

const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const System = imports.system;

/* exported loadUI */
function loadUI(resourcePath, objects) {
    let ui = new Gtk.Builder();

    if (objects) {
        for (let o in objects)
            ui.expose_object(o, objects[o]);
    }

    ui.add_from_resource(resourcePath);
    return ui;
}

/* exported loadStyleSheet */
function loadStyleSheet(resource) {
    let provider = new Gtk.CssProvider();
    provider.load_from_file(Gio.File.new_for_uri('resource://' + resource));
    Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(),
                                             provider,
                                             Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
}

/* exported initActions */
function initActions(actionMap, simpleActionEntries, context) {
    simpleActionEntries.forEach((entry) => {
        let filtered = {};
        let toFilter = { activate: null,
                         change_state: null,
                         context: null };
        for (let name in entry) {
            if (name in toFilter) {
                filtered[name] = entry[name];
                delete entry[name];
            }
        }
        let action = new Gio.SimpleAction(entry);

        let context = filtered.context || actionMap;
        if (filtered.activate)
            action.connect('activate', filtered.activate.bind(context));
        if (filtered.change_state)
            action.connect('change-state', filtered.change_state.bind(context));

        actionMap.add_action(action);
    });
}

/* exported arrayEqual */
function arrayEqual(one, two) {
    if (one.length !== two.length)
        return false;

    for (let i = 0; i < one.length; i++) {
        if (one[i] !== two[i])
            return false;
    }

    return true;
}

/* exported getSettings */
function getSettings(schemaId, path) {
    const GioSSS = Gio.SettingsSchemaSource;
    let schemaSource;

    if (!pkg.moduledir.startsWith('resource://')) {
        // Running from the source tree
        schemaSource = GioSSS.new_from_directory(pkg.pkgdatadir,
                                                 GioSSS.get_default(),
                                                 false);
    } else {
        schemaSource = GioSSS.get_default();
    }

    let schemaObj = schemaSource.lookup(schemaId, true);
    if (!schemaObj) {
        log('Missing GSettings schema ' + schemaId);
        System.exit(1);
    }

    if (path === undefined)
        return new Gio.Settings({ settings_schema: schemaObj });
    else
        return new Gio.Settings({ settings_schema: schemaObj, path: path });
}

/* exported loadIcon */
function loadIcon(iconName, size) {
    let theme = Gtk.IconTheme.get_default();

    return theme.load_icon(iconName,
                           size,
                           Gtk.IconLookupFlags.GENERIC_FALLBACK);
}

/* exported dbusPromiseify */
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

/* exported alert */
function alert(parent, message) {
    let dialog = new Gtk.MessageDialog({
        transient_for: parent,
        modal: true,
        buttons: Gtk.ButtonsType.OK,
        message_type: Gtk.MessageType.ERROR,
        text: message
    });
    dialog.connect('response', () => dialog.destroy());
    dialog.show();
}

/* exported ginvoke */
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

/* exported gpromise */
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