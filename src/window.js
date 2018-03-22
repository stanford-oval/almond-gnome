// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2013-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;

const Util = imports.util;
const { bindChatModel } = imports.chatview;
const DeviceModel = imports.devicemodel.DeviceModel;
const { DeviceConfigDialog } = imports.deviceconfig;

/* exported MainWindow */
var MainWindow = GObject.registerClass({
    Template: 'resource:///edu/stanford/Almond/main.ui',
    Properties: {},
    InternalChildren: ['main-stack', 'assistant-chat-listbox',
        'assistant-input', 'my-stuff-grid-view'],
}, class MainWindow extends Gtk.ApplicationWindow {
    _init(app, service) {
        super._init({ application: app,
                      title: GLib.get_application_name(),
                      default_width: 640,
                      default_height: 480 });

        Util.initActions(this,
                         [{ name: 'about',
                            activate: this._about },
                          { name: 'switch-to',
                            activate: this._switchTo,
                            parameter_type: new GLib.VariantType('s') },
                          { name: 'new-device',
                            activate: this._configureNewDevice },
                          { name: 'new-account',
                            activate: this._configureNewAccount }]);

        this._service = service;
        this._assistantModel = bindChatModel(service, this._assistant_chat_listbox);
        this._assistantModel.start();
        this._deviceModel = new DeviceModel(this, service, this._my_stuff_grid_view);
        this._deviceModel.start();

        this.connect('destroy', () => {
            this._assistantModel.stop();
            this._deviceModel.stop();
        });

        this._assistant_input.connect('activate', () => {
            var text = this._assistant_input.text || '';
            text = text.trim();
            if (!text)
                return;
            if (text.startsWith('\\r '))
                this._service.HandleParsedCommandRemote('', text.substr('\\r '.length));
            else
                this._service.HandleCommandRemote(text);
            this._assistant_input.text = '';
        });
    }

    _switchTo(action, page) {
        let [pageName,] = page.get_string();
        this._main_stack.visible_child_name = pageName;
    }

    _configureNewDevice() {
        this._configureNew('physical');
    }
    _configureNewAccount() {
        this._configureNew('online');
    }
    _configureNew(klass) {
        let dialog = new DeviceConfigDialog(this, klass, this._service);
        dialog.startChooseKind();
    }

    _about() {
        let aboutDialog = new Gtk.AboutDialog(
            { authors: [ 'Giovanni Campagna <gcampagn@cs.stanford.edu>' ],
              translator_credits: _("translator-credits"),
              program_name: _("Almond"),
              comments: _("The Open Virtual Assistant"),
              copyright: 'Copyright 2016-2017 Stanford University, Mobisocial Computing Lab',
              license_type: Gtk.License.GPL_2_0,
              logo_icon_name: 'edu.stanford.Almond',
              version: pkg.version,
              website: 'https://thingpedia.stanford.edu',
              wrap_license: true,
              modal: true,
              transient_for: this
            });

        aboutDialog.show();
        aboutDialog.connect('response', function() {
            aboutDialog.destroy();
        });
    }
});
