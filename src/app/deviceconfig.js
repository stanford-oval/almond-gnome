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

const Config = imports.common.config;
const { dbusPromiseify, alert } = imports.common.util;

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
            this.service.CreateSimpleDeviceRemote(this.kind, (result, error) => {
                if (error)
                    alert(this.dialog, _("Sorry, that did not work: %s").format(error.message));
                else
                    this.dialog.destroy();
            });
            break;
        case 'oauth2':
            this.dialog.startOAuth2(this.text, this.kind);
            break;
        case 'form':
            this.dialog.startForm(this.text, this.kind, this._factoryMeta.fields.deep_unpack());
            break;
        case 'discovery':
            this.dialog.transient_for.handleConfigure(this.kind, this.text);
            this.dialog.destroy();
            break;
        default:
            log('Unrecognized factory type ' + this.type);
            break;
        }
    }
});


function getGIcon(icon) {
    if (!icon)
        return new Gio.ThemedIcon({ name: 'edu.stanford.Almond' });
    return new Gio.FileIcon({ file: Gio.File.new_for_uri(Config.THINGPEDIA_URL + '/api/devices/icon/' + icon) });
}

/* exported DeviceConfigDialog */
var DeviceConfigDialog = GObject.registerClass({
    Template: 'resource:///edu/stanford/Almond/device-config.ui',
    Children: ['config-stack', 'choices-listbox', 'oauth2-webview-placeholder', 'form-grid'],
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
                pixel_size: 48,
                margin: 6,
                gicon: getGIcon(item.kind),
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

        this._button = null;
    }

    _clearButton() {
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
    }

    startChooseKind() {
        this.config_stack.visible_child_name = 'page-choose-kind';
        this._clearButton();

        return dbusPromiseify(this._service, 'GetDeviceFactoriesRemote', this._klass).then(([factories]) => {
            for (let factory of factories)
                this.model.append(new DeviceFactory(factory, this, this._service));

            this.show();
        }).catch((e) => {
            logError(e, 'Failed to get the list of device factories');
        });
    }

    startForm(title, kind, controls) {
        this.title = title;
        this.config_stack.visible_child_name = 'page-form';
        this._clearButton();

        let controlMap = {};
        let i = 0;
        for (let control of controls) {
            let label = new Gtk.Label({
                label: control.label,
                halign: Gtk.Align.END,
                xalign: 1,
                visible: true
            });
            this.form_grid.attach(label, 0 /*left*/, i /*top*/, 1 /*width*/, 1 /*height*/);
            let input = new Gtk.Entry({
                visible: true
            });
            if (control.type === 'password') {
                input.visibility = false;
                input.input_purpose = Gtk.InputPurpose.PASSWORD;
            } else if (control.type === 'email') {
                input.input_purpose = Gtk.InputPurpose.EMAIL;
            } else if (control.type === 'number') {
                input.input_purpose = Gtk.InputPurpose.NUMBER;
            }

            controlMap[control.name] = input;
            this.form_grid.attach(input, 1 /*left*/, i++ /*top*/, 1 /*width*/, 1 /*height*/);
        }

        this._button = this.add_button(_("Create"), Gtk.ResponseType.OK);
        let button = this._button;
        this.connect('response', (self, responseId) => {
            if (responseId !== Gtk.ResponseType.OK)
                return;
            if (this._button !== button)
                return;

            let data = {};
            for (let control of controls)
                data[control.name] = controlMap[control.name].text;

            data.kind = kind;
            this._service.CreateDeviceRemote(JSON.stringify(data), (result, error) => {
                if (error)
                    alert(this, _("Sorry, that did not work: %s").format(error.message));
                else
                    this.destroy();
            });
        });

        this.show();
    }

    startOAuth2(title, kind) {
        this.title = title;
        this._clearButton();

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
            this.show();
        }).catch((e) => {
            logError(e);
            alert(this, _("Sorry, that did not work: %s").format(e.message));
        });
    }
});