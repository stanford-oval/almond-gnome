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
const Lang = imports.lang;

const { dbusPromiseify } = imports.common.util;
const Config = imports.common.config;

const App = GObject.registerClass({
    Properties: {
        unique_id: GObject.ParamSpec.string('unique-id', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        icon: GObject.ParamSpec.string('icon', '','', GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        name: GObject.ParamSpec.string('name', '','', GObject.ParamFlags.READWRITE, null),
        description: GObject.ParamSpec.string('description', '','', GObject.ParamFlags.READWRITE, null),
        error: GObject.ParamSpec.string('error', '','', GObject.ParamFlags.READWRITE, null),
    }
}, class AlmondApp extends GObject.Object {});

function getGIcon(icon) {
    if (!icon)
        return new Gio.ThemedIcon({ name: 'edu.stanford.Almond' });
    return new Gio.FileIcon({ file: Gio.File.new_for_uri(Config.THINGPEDIA_URL + '/api/devices/icon/' + icon) });
}

/* exported AppModel */
var AppModel = class AppModel {
    constructor(window, service, listbox) {
        this._service = service;
        this._listbox = listbox;

        this._apps = new Map;
        this._store = new Gio.ListStore();
        listbox.bind_model(this._store, (device) => {
            return this._makeAppWidget(device);
        });
    }

    start() {
        this._appAddedId = this._service.connectSignal('AppAdded', (signal, sender, [app]) => {
            this._onAppAdded(app);
        });
        this._appRemovedId = this._service.connectSignal('AppRemoved', (signal, sender, [id]) => {
            this._onAppRemoved(id);
        });

        return dbusPromiseify(this._service, 'GetAppInfosRemote').then(([apps]) => {
            for (let app of apps)
                this._onAppAdded(app);
        }).catch((e) => {
            log('Failed to retrieve the list of running apps: ' + e);
        });
    }

    stop() {
        this._service.disconnectSignal(this._appAddedId);
        this._service.disconnectSignal(this._appRemovedId);
    }

    _onAppAdded(appInfo) {
        let app = new App({
            unique_id: appInfo.uniqueId.deep_unpack(),
            icon: appInfo.icon.deep_unpack(),
            name: appInfo.name.deep_unpack(),
            description: appInfo.description.deep_unpack(),
        });

        this._apps.set(app.unique_id, app);
        this._store.append(app);
    }

    _onAppRemoved(uniqueId) {
        this._apps.delete(uniqueId);

        let n = this._store.get_n_items();
        for (let i = 0; i < n; i++) {
            let app = this._store.get_item(i);
            if (app.unique_id === uniqueId) {
                this._store.remove(i);
                break;
            }
        }
    }

    _makeAppWidget(app) {
        let box = new Gtk.Grid({
            column_spacing: 4,
            row_spacing: 4,
            margin: 12
        });
        box.get_style_context().add_class('device');

        let icon = new Gtk.Image({
            pixel_size: 64,
            gicon: getGIcon(app.icon),
            valign: Gtk.Align.CENTER,
            halign: Gtk.Align.CENTER
        });
        box.attach(icon, 0 /*left*/, 0 /*top*/, 1 /*width*/, 2 /*height*/);

        let name = new Gtk.Label({
            hexpand: true,
            halign: Gtk.Align.START,
            xalign: 0
        });
        name.get_style_context().add_class('app-name');
        app.bind_property('name', name, 'label', GObject.BindingFlags.SYNC_CREATE);
        box.attach(name, 1 /*left*/, 0 /*top*/, 1 /*width*/, 1 /*height*/);

        let description = new Gtk.Label({
            hexpand: true,
            wrap: true,
            halign: Gtk.Align.START,
            xalign: 0,
            justify: Gtk.Justification.FILL
        });
        app.bind_property('description', description, 'label', GObject.BindingFlags.SYNC_CREATE);
        box.attach(description, 1 /*left*/, 1 /*top*/, 1 /*width*/, 1 /*height*/);

        let del = Gtk.Button.new_from_icon_name('user-trash-symbolic', Gtk.IconSize.BUTTON);
        del.valign = Gtk.Align.CENTER;
        del.halign = Gtk.Align.CENTER;
        del.connect('clicked', () => {
            this._service.DeleteAppRemote(app.unique_id, (result, error) => {
                if (error)
                    log('Failed to delete ' + app.unique_id + ': ' + error);
            });
        });
        box.attach(del, 2 /*left*/, 0 /*top*/, 1 /*width*/, 2 /*height*/);

        icon.show();
        name.show();
        description.show();
        del.show();
        box.show();

        return box;
    }
};
