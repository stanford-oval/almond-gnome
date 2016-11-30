// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See LICENSE for details

pkg.initGettext();
pkg.initFormat();
pkg.require({ 'Gdk': '3.0',
              'Gio': '2.0',
              'GLib': '2.0',
              'GObject': '2.0',
              'Gtk': '3.0' });

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

const Util = imports.util;
const Window = imports.window;

function initEnvironment() {
    window.getApp = function() {
        return Gio.Application.get_default();
    };
}

const SabrinaApplication = new Lang.Class({
    Name: 'SabrinaApplication',
    Extends: Gtk.Application,

    _init: function() {
        this.parent({ application_id: pkg.name });

        GLib.set_application_name(_("Sabrina"));
    },

    _onQuit: function() {
        this.quit();
    },

    vfunc_startup: function() {
        this.parent();

        Util.loadStyleSheet('/edu/stanford/thingengine/application.css');

        Util.initActions(this,
                         [{ name: 'quit',
                            activate: this._onQuit }]);
    },

    vfunc_activate: function() {
        var window = this.get_active_window();
        if (window == null)
            window = new Window.MainWindow({ application: this });

        window.present();
    }
});

function main(argv) {
    initEnvironment();

    return (new SabrinaApplication()).run(argv);
}
