// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See LICENSE for details
"use strict";

pkg.initGettext();
pkg.initFormat();
pkg.require({ 'Gdk': '3.0',
              'Gio': '2.0',
              'GLib': '2.0',
              'GObject': '2.0',
              'Gtk': '3.0',
              'WebKit2': '4.0' });

const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const WebKit = imports.gi.WebKit2;

const Util = imports.common.util;
const Window = imports.app.window;
const Service = imports.common.serviceproxy.Service;
const PreferenceAction = imports.app.prefs.PreferenceAction;

function initEnvironment() {
    window.getApp = function() {
        return Gio.Application.get_default();
    };
}

const AlmondApplication = new Lang.Class({
    Name: 'AlmondApplication',
    Extends: Gtk.Application,

    _init: function() {
        this.parent({ application_id: pkg.name });

        GLib.set_application_name(_("Almond"));
        this._service = null;
    },

    _onQuit: function() {
        this.quit();
    },

    vfunc_startup: function() {
        this.parent();

        Util.loadStyleSheet('/edu/stanford/Almond/application.css');

        Util.initActions(this,
                         [{ name: 'quit',
                            activate: this._onQuit }]);

        let webDataManager = new WebKit.WebsiteDataManager({
            base_cache_directory: GLib.get_user_cache_dir() + '/almond/webview',
            base_data_directory: GLib.get_user_config_dir() + '/almond/webview'
        });
        let webCookieManager = webDataManager.get_cookie_manager();
        webCookieManager.set_accept_policy(WebKit.CookieAcceptPolicy.NO_THIRD_PARTY);
        webCookieManager.set_persistent_storage(GLib.get_user_config_dir() + '/almond/webview/cookies.db',
                                                WebKit.CookiePersistentStorage.SQLITE);
        this.webContext = new WebKit.WebContext({
            website_data_manager: webDataManager
        });
    },

    vfunc_activate: function() {
        var window = this.get_active_window();
        if (window === null) {
            if (this._service === null) {
                this.hold();
                new Service(Gio.DBus.session, 'edu.stanford.Almond.BackgroundService', '/edu/stanford/Almond/BackgroundService', (result, error) => {
                    this.release();
                    if (error)
                        throw error; // die
                    this._service = result;

                    for (let pref of ['enable-voice-input', 'enable-voice-output', 'enable-hotword'])
                        this.add_action(new PreferenceAction(this._service, pref, 'b'));

                    var window = new Window.MainWindow(this, this._service);
                    window.present();
                });
            } else {
                window = new Window.MainWindow(this, this._service);
                window.present();
            }
        } else {
            window.present();
        }
    }
});

/* exported main */
function main(argv) {
    initEnvironment();

    return (new AlmondApplication()).run(argv);
}
