// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2013-2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Params = imports.params;

const Util = imports.util;
const AssistantModel = imports.chatmodel.AssistantModel;

const MainWindow = new Lang.Class({
    Name: 'MainWindow',
    Extends: Gtk.ApplicationWindow,
    Template: 'resource:///edu/stanford/Almond/main.ui',
    Properties: {},
    InternalChildren: ['main-stack', 'assistant-chat-listbox', 'assistant-input'],

    _init: function(app, service) {
        this.parent({ application: app,
                      title: GLib.get_application_name(),
                      default_width: 640,
                      default_height: 480 });

        Util.initActions(this,
                         [{ name: 'about',
                            activate: this._about },
                          { name: 'switch-to',
                            activate: this._switchTo,
                            parameter_type: new GLib.VariantType('s') }]);

        this._service = service;
        this._assistantModel = new AssistantModel(this, service, this._assistant_chat_listbox);
        this._assistantModel.start();

        this.connect('destroy', () => this._assistantModel.stop());

        this._assistant_input.connect('activate', () => {
            var text = this._assistant_input.text || '';
            text = text.trim();
            if (!text)
                return;
            if (text.startsWith('\\r ')) {
                this._service.HandleParsedCommandRemote('', text.substr('\\r '.length));
            } else {
                this._service.HandleCommandRemote(text);
            }
            this._assistant_input.text = '';
        });
    },

    _switchTo: function(action, page) {
        let [pageName, len] = page.get_string();
        this._main_stack.visible_child_name = pageName;
    },

    _about: function() {
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
    },
});
