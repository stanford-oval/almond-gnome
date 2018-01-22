// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2018 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const WebKit = imports.gi.WebKit2;

const Config = imports.config;

const { dbusPromiseify, alert } = imports.util;

const DeviceFactory = GObject.registerClass({
    Properties: {
        type: GObject.ParamSpec.string('type', '','',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        kind: GObject.ParamSpec.string('kind', '','',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        text: GObject.ParamSpec.string('text', '','',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, null),
        dialog: GObject.ParamSpec.object('dialog', '', '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gtk.Dialog),
        service: GObject.ParamSpec.object('service', '', '',
            GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY, Gio.DBusProxy)
    }
}, class DeviceFactory extends GObject.Object {
    _init(factoryMeta, dialog, service) {
        super._init({
            type: factoryMeta.type.deep_unpack(),
            kind: factoryMeta.kind.deep_unpack(),
            text: factoryMeta.text.deep_unpack(),
            dialog: dialog,
            service: service
        });

        this._factoryMeta = factoryMeta;
    }
    activate() {
        log('Creating device ' + this.kind);
        switch (this.type) {
        case 'none':
            dbusPromiseify(this.service, 'CreateSimpleDeviceRemote', this.kind)
                .then(() => this.dialog.destroy())
                .catch((e) => alert(this.dialog, _("Sorry, that did not work: %s").format(e.message)));
            break;
        case 'oauth2':
            this.dialog.startOAuth2(this.text, this.kind);
            break;
        case 'discovery':
        case 'form':
            alert(this.dialog, _("Sorry, configuring this device is not implemented yet"));
            break;
        default:
            log('Unrecognized factory type ' + this.type);
            break;
        }
    }
});

/* exported DeviceConfigDialog */
var DeviceConfigDialog = GObject.registerClass({
    Template: 'resource:///edu/stanford/Almond/device-config.ui',
    Children: ['config-stack', 'choices-listbox', 'oauth2-webview-placeholder'],
}, class DeviceConfigDialog extends Gtk.Dialog {
    _init(parent, klass, service) {
        // make sure we have loaded WebKit before we try and create the object
        WebKit.WebView;

        super._init({
            title: klass === 'physical' ? _("Configure New Device") : _("Configure New Account"),
            transient_for: parent,
            modal: true,
            use_header_bar: 1,
        });

        this._service = service;
        this._klass = klass;
        this._oauth2Session = null;
        this.model = new Gio.ListStore();
        this.choices_listbox.bind_model(this.model, (item) => {
            let box = new Gtk.Box({
                orientation: Gtk.Orientation.HORIZONTAL,
                visible: true
            });
            let icon = new Gtk.Image({
                pixel_size: 64,
                gicon: new Gio.FileIcon({ file: Gio.File.new_for_uri(Config.S3_CLOUDFRONT_HOST + '/icons/' + item.kind + '.png') }),
                valign: Gtk.Align.CENTER,
                halign: Gtk.Align.CENTER,
                visible: true,
            });
            box.pack_start(icon, false, false, 0);

            let label = new Gtk.Label({
                hexpand: true,
                justify: Gtk.Justification.LEFT,
                visible: true,
            });
            box.pack_start(label, true, true, 0);

            item.bind_property('text', label, 'label', GObject.BindingFlags.SYNC_CREATE);

            return box;
        });

        this.choices_listbox.connect('row-activated', (listbox, row) => {
            let factory = this.model.get_item(row.get_index());
            factory.activate();
        });
    }

    startChooseKind() {
        return dbusPromiseify(this._service, 'GetDeviceFactoriesRemote', this._klass).then(([factories]) => {
            for (let factory of factories)
                this.model.append(new DeviceFactory(factory, this, this._service));

            this.show();
        }).catch((e) => {
            logError(e, 'Failed to get the list of device factories');
        });
    }

    startOAuth2(title, kind) {
        this.title = title;

        let webView = new WebKit.WebView({
            web_context: window.getApp().webContext,
            hexpand: true,
            vexpand: true,
            visible: true
        });
        this.oauth2_webview_placeholder.add(webView);

        let titlebar = this.get_titlebar();
        if (titlebar instanceof Gtk.HeaderBar) {
            webView.bind_property('title', titlebar, 'subtitle',
                GObject.BindingFlags.SYNC_CREATE);
        } else {
            log('titlebar is not a headerbar, is a ' + titlebar);
        }

        webView.connect('load-changed', (webView, event) => {
            if (event === WebKit.LoadEvent.COMMITTED)
                this.config_stack.visible_child_name = 'page-oauth2';
        });
        webView.connect('decide-policy', (webView, decision, decisionType) => {
            if (decisionType !== WebKit.PolicyDecisionType.NAVIGATION_ACTION)
                return false;

            let uri = decision.request.uri;
            if (uri.startsWith('https://thingengine.stanford.edu/devices/oauth2/callback')) {
                decision.ignore();

                log('Got redirect to ' + uri);
                dbusPromiseify(this._service, 'HandleOAuth2CallbackRemote', kind, uri, this._oauth2Session)
                    .then(() => this.destroy())
                    .catch((e) => alert(this, _("Sorry, that did not work: %s").format(e.message)));
                return true;
            }

            return false;
        });

        dbusPromiseify(this._service, 'StartOAuth2Remote', kind).then(([[ok, uri, session]]) => {
            this._oauth2Session = session;
            webView.load_uri(uri);
        }).catch((e) => {
            logError(e);
            alert(this, _("Sorry, that did not work: %s").format(e.message));
        });
    }
});