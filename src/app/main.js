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

const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const WebKit = imports.gi.WebKit2;

const Util = imports.common.util;
const Window = imports.app.window;
const Service = imports.common.serviceproxy.Service;
const PreferenceAction = imports.app.prefs.PreferenceAction;
const { ImageCacher } = imports.app.imagecacher;
const { spawnService } = imports.app.servicelaunch;

function initEnvironment() {
    window.getApp = function() {
        return Gio.Application.get_default();
    };
}

const AlmondApplication = GObject.registerClass(
class AlmondApplication extends Gtk.Application {
    _init() {
        super._init({ application_id: pkg.name });

        GLib.set_application_name(_("Almond"));
        this._service = null;

        this.cache = new ImageCacher();

        this._activating = false;
    }

    _onQuit() {
        this.quit();
    }

    vfunc_startup() {
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
    }

    vfunc_activate() {
        var window = this.get_active_window();
        if (window === null) {
            if (this._service === null) {
                if (this._activating)
                    return;

                this._activating = true;
                this.hold();
                new Service(Gio.DBus.session, 'edu.stanford.Almond.BackgroundService', '/edu/stanford/Almond/BackgroundService', (result, error) => {
                    this.release();
                    this._activating = false;
                    if (error)
                        throw error; // die
                    this._service = result;

                    for (let pref of ['enable-voice-input', 'enable-voice-output'])
                        this.add_action(new PreferenceAction(this._service, pref, 'b'));
                    this.add_action(new PreferenceAction(this._service, 'sabrina-store-log', 'b', (fromjson) => {
                        return new GLib.Variant('b', fromjson.deep_unpack() === 'yes');
                    }, (tojson) => {
                        return new GLib.Variant('s', tojson.deep_unpack() ? 'yes' : 'no');
                    }));

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
    const service = spawnService();
    initEnvironment();

    const exitCode = (new AlmondApplication()).run(argv);

    if (service)
        service.send_signal(15 /* sigterm */);

    return exitCode;
}
