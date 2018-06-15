// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2013-2018 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;

const Util = imports.common.util;
const Config = imports.common.config;
const { MessageType, Direction } = imports.common.chatmodel;
const { bindChatModel } = imports.app.chatview;
const { DeviceModel } = imports.app.devicemodel;
const { AppModel } = imports.app.appmodel;
const { DeviceConfigDialog } = imports.app.deviceconfig;
const { SettingsDialog } = imports.app.settings;

const { dbusPromiseify, alert, clean } = imports.common.util;

function getGIcon(icon) {
    if (!icon)
        return new Gio.ThemedIcon({ name: 'edu.stanford.Almond' });
    return new Gio.FileIcon({ file: Gio.File.new_for_uri(Config.THINGPEDIA_URL + '/api/devices/icon/' + icon) });
}

const INPUT_PURPOSES = {
    password: Gtk.InputPurpose.PASSWORD,
    number: Gtk.InputPurpose.NUMBER,
    email_address: Gtk.InputPurpose.EMAIL,
    phone_number: Gtk.InputPurpose.PHONE,
};

/* exported MainWindow */
var MainWindow = GObject.registerClass({
    Template: 'resource:///edu/stanford/Almond/main.ui',
    Properties: {},
    Children: [
        'main-stack',
        'assistant-chat-listbox',
        'assistant-chat-scrolled-window',
        'assistant-input',
        'assistant-cancel',
        'my-stuff-grid-view',
        'my-rules-list-view',
        'device-details-icon',
        'device-details-name',
        'device-details-description',
        'device-details-version',
        'device-details-update',
        'device-details-examples',
    ],
}, class MainWindow extends Gtk.ApplicationWindow {
    _init(app, service) {
        super._init({ application: app,
                      title: GLib.get_application_name(),
                      default_width: 900,
                      default_height: 500 });

        Util.initActions(this,
                         [{ name: 'about',
                            activate: this._about },
                          { name: 'settings',
                            activate: this._showSettings },
                          { name: 'switch-to',
                            activate: this._switchTo,
                            parameter_type: new GLib.VariantType('s') },
                          { name: 'new-device',
                            activate: this._configureNewDevice },
                          { name: 'configure-device-oauth2',
                            activate: this._configureDeviceOAuth2,
                            parameter_type: new GLib.VariantType('(ss)') },
                          { name: 'show-device-details',
                            activate: this._showDeviceDetails,
                            parameter_type: new GLib.VariantType('s') },
                          { name: 'new-account',
                            activate: this._configureNewAccount },
                          { name: 'assistant-special-message',
                            activate: (action, param) => this.handleSpecial(param.deep_unpack()),
                            parameter_type: new GLib.VariantType('s') }
                            ]);

        this._service = service;

        this._assistantModel = bindChatModel(this, service, this.assistant_chat_listbox);

        this._newMessageId = this._assistantModel.connect('new-message', (model, msg) => {
            if (msg.message_type !== MessageType.ASK_SPECIAL || msg.direction !== Direction.FROM_ALMOND)
                return;
            this._syncCancel(msg);
            this._syncKeyboard(msg);
        });
        this._assistantModel.start();
        this._voiceHypothesisId = this._service.connectSignal('VoiceHypothesis', (signal, sender, [hyp]) => {
            this.assistant_input.set_text(hyp);
        });

        this._scrollAtEnd = true;
        this.assistant_chat_scrolled_window.vadjustment.connect('value-changed', (adj) => {
            this._scrollAtEnd = adj.value === adj.upper - adj.page_size;
        });
        this.assistant_chat_scrolled_window.vadjustment.connect('changed', (adj) => {
            if (this._scrollAtEnd)
                adj.value = adj.upper - adj.page_size;
        });

        this._deviceModel = new DeviceModel(this, service, this.my_stuff_grid_view);
        this.my_stuff_grid_view.connect('child-activated', (grid, row) => {
            this._showDeviceDetailsInternal(row._device.unique_id);
        });
        this._deviceModel.start();
        this._appModel = new AppModel(this, service, this.my_rules_list_view);
        this._appModel.start();

        this.device_details_examples.connect('row-activated', (list, row) => {
            if (!row._delegate)
                return;
            let { utterance, target, entryMap } = row._delegate;

            log(`clicked on example ${target.example_id}`);
            let { slots, slotTypes } = target;
            let utteranceCopy = utterance;
            for (let i = 0; i < slots.length; i++) {
                let slot = slots[i];
                let value;
                if (entryMap[slot] instanceof Gtk.FileChooserButton)
                    value = entryMap[slot].get_uri();
                else
                    value = entryMap[slot].text;
                if (slotTypes[slot] === 'Number' || slotTypes[slot] === 'Currency')
                    value = parseFloat(value);
                if (value) {
                    target.entities[`SLOT_${i}`] = value;
                    utteranceCopy = utteranceCopy.replace('$' + slot, value);
                }
            }

            log(JSON.stringify(target));
            this.handleParsedCommand(JSON.stringify(target), utteranceCopy);
        });

        this.connect('destroy', () => {
            this._assistantModel.stop();
            this._deviceModel.stop();
            if (this._newMessageId) {
                this._service.disconnectSignal(this._newMessageId);
                this._newMessageId = 0;
            }
            if (this._voiceHypothesisId) {
                this._service.disconnectSignal(this._voiceHypothesisId);
                this._voiceHypothesisId = 0;
            }
        });

        this.assistant_input.connect('activate', this._onInputActivate.bind(this));
    }

    _onInputActivate() {
        var text = this.assistant_input.text || '';
        text = text.trim();
        if (!text)
            return;

        this.assistant_input.text = '';

        const onerror = (result, error) => {
            if (error)
                log('Failed to handle command: ' + error);
        };

        if (!this.assistant_input.visibility) {
            // password
            const passwordJSON = {
                code: ['bookkeeping', 'answer', 'QUOTED_STRING_0'],
                entities: {
                    QUOTED_STRING_0: text
                }
            };

            this._service.HandleParsedCommandRemote('••••••••', JSON.stringify(passwordJSON), onerror);
            return;
        }

        function handleSlashR(line) {
            line = line.trim();
            if (line.startsWith('{')) {
                this._service.HandleParsedCommandRemote('', line, onerror);
            } else {
                this._service.HandleParsedCommandRemote('',
                    JSON.stringify({ code: line.split(' '), entities: {} }), onerror);
            }
        }
        if (text.startsWith('\\r')) {
            handleSlashR(text.substring(3));
            return;
        }
        if (text.startsWith('\\t')) {
            this._service.HandleThingTalkRemote(text.substring(3), onerror);
            return;
        }

        this._service.HandleCommandRemote(text, onerror);
    }

    _syncCancel(msg) {
        this.assistant_cancel.visible = msg.ask_special_what !== 'null';
    }

    _syncKeyboard(msg) {
        const entry = this.assistant_input;

        entry.set_visibility(msg.ask_special_what !== 'password');

        if (INPUT_PURPOSES[msg.ask_special_what] !== undefined)
            entry.input_purpose = INPUT_PURPOSES[msg.ask_special_what];
        else
            entry.input_purpose = Gtk.InputPurpose.FREE_FORM;
    }

    _switchTo(action, page) {
        let [pageName,] = page.get_string();
        this.main_stack.visible_child_name = pageName;
    }

    handleSpecial(special) {
        let title;
        switch (special) {
        case 'yes':
            title = _("Yes");
            break;
        case 'no':
            title = _("No");
            break;
        case 'makerule':
            title = _("Make a rule");
            break;
        case 'help':
            title = _("Help");
            break;
        case 'train':
            title = _("Retrain the last command");
            break;
        case 'nevermind':
            title = _("Cancel");
            break;
        default:
            log('Unrecognized special ' + special);
            title = special;
        }
        let json = JSON.stringify({
            code: ['bookkeeping', 'special', 'special:' + special],
            entities: {}
        });
        this.handleParsedCommand(json, title);
    }
    handleParsedCommand(json, title) {
        this.main_stack.visible_child_name = 'page-chat';
        this._service.HandleParsedCommandRemote(title, json, (result, error) => {
            if (error)
                log('Failed to click on button: ' + error);
        });
    }
    handleChoice(choiceIdx, title) {
        let json = JSON.stringify({
            code: ['bookkeeping', 'choice', String(choiceIdx)],
            entities: {}
        });
        this.handleParsedCommand(json, title);
    }
    handleConfigure(kind, title) {
        let json = JSON.stringify({
            code: ["now", "=>", "@org.thingpedia.builtin.thingengine.builtin.configure",
                   "param:device:Entity(tt:device)", "=", "device:" + kind],
            entities: {}
        });
        this.handleParsedCommand(json, _("Configure %s").format(title));
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
    _configureDeviceOAuth2(action, param) {
        let [kind, title] = param.deep_unpack();
        let dialog = new DeviceConfigDialog(this, '', this._service);
        dialog.startOAuth2(title, kind);
    }
    _showDeviceDetails(action, param) {
        let uniqueId = param.deep_unpack();
        this._showDeviceDetailsInternal(uniqueId);
    }

    _getDeviceDetails(uniqueId) {
        return dbusPromiseify(this._service, 'GetDeviceInfoRemote', uniqueId).then(([deviceInfo]) => {
            let kind = deviceInfo.kind.deep_unpack();
            this.device_details_icon.gicon = getGIcon(kind);
            this.device_details_name.label = deviceInfo.name.deep_unpack();
            this.device_details_description.label = deviceInfo.description.deep_unpack();
            this.device_details_version.label = _("Version: %d").format(deviceInfo.version.deep_unpack());
            this.device_details_update.action_target = new GLib.Variant('s', kind);
        });
    }

    _makeSlotFilling(ex) {
        const [utterance,,,,,slotTypes,] = ex;

        const flowbox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            visible: true,
            can_focus: false,
            halign: Gtk.Align.START
        });
        let chunk = '';
        const entryMap = {};
        for (let word of utterance.split(/\s+/g)) {
            if (word.startsWith('$') && word !== '$$') {
                if (chunk) {
                    let label = new Gtk.Label({
                        visible: true,
                        label: chunk.trim(),
                        xalign: 0,
                        halign: Gtk.Align.START
                    });
                    flowbox.add(label);
                    chunk = '';
                }

                let slot = word.substring(1);
                let slotType = slotTypes[slot];
                if (slotType === 'Entity(tt:picture)') {
                    let picker = new Gtk.FileChooserButton({
                        title: _("Select picture…"),
                        visible: true,
                        local_only: true,
                        action: Gtk.FileChooserAction.OPEN,
                    });

                    entryMap[slot] = picker;
                    flowbox.add(picker);
                } else {
                    let entry = new Gtk.Entry({
                        visible: true,
                        can_focus: true,
                        placeholder_text: clean(slot)
                    });

                    switch (slotType) {
                    case 'Number':
                    case 'Currency':
                        entry.input_purpose = Gtk.InputPurpose.NUMBER;
                        break;
                    case 'Entity(tt:phone_number)':
                        entry.input_purpose = Gtk.InputPurpose.PHONE;
                        break;
                    case 'Entity(tt:email_address)':
                        entry.input_purpose = Gtk.InputPurpose.EMAIL;
                        break;
                    case 'Entity(tt:url)':
                        entry.input_purpose = Gtk.InputPurpose.URL;
                        break;
                    case 'Location':
                    case 'Measure':
                    case 'Date':
                    case 'Time':
                        entry.can_focus = false;
                        break;
                    }

                    entryMap[slot] = entry;
                    flowbox.add(entry);
                }
            } else {
                if (word === '$$')
                    chunk += ' $';
                else
                    chunk += ' ' + word;
            }
        }
        if (chunk) {
            let label = new Gtk.Label({
                visible: true,
                label: chunk.trim(),
                xalign: 0,
                halign: Gtk.Align.START
            });
            flowbox.add(label);
            chunk = '';
        }

        return [flowbox, entryMap];
    }

    _getDeviceExamples(uniqueId) {
        return dbusPromiseify(this._service, 'GetDeviceExamplesRemote', uniqueId).then(([examples]) => {
            const listbox = this.device_details_examples;
            for (let existing of listbox.get_children())
                existing.destroy();
            for (let ex of examples) {
                const [utterance,,exampleId,code,entities,slotTypes,slots] = ex;
                const target = {
                    example_id: exampleId,
                    code: code,
                    entities: JSON.parse(entities),
                    slotTypes: slotTypes,
                    slots: slots
                };

                let child, entryMap = {};
                if (slots.length > 0) {
                    [child, entryMap] = this._makeSlotFilling(ex);
                } else {
                    child = new Gtk.Label({
                        visible: true,
                        label: utterance,
                        xalign: 0,
                        halign: Gtk.Align.START
                    });
                }

                let row = new Gtk.ListBoxRow({
                    visible: true,
                    activatable: true,
                    selectable: false
                });
                row.add(child);
                row._delegate = {
                    utterance, target, entryMap
                };

                listbox.add(row);
            }
        });
    }

    _showDeviceDetailsInternal(uniqueId) {
        Promise.all([this._getDeviceDetails(uniqueId), this._getDeviceExamples(uniqueId)]).then(() => {
            this.main_stack.visible_child_name = 'page-device-details';
        }).catch((e) => {
            logError(e, 'Failed to show device details');
            alert(this, _("Sorry, that did not work: %s").format(e.message));
        });
    }

    _about() {
        let aboutDialog = new Gtk.AboutDialog(
            { authors: [ 'Giovanni Campagna <gcampagn@cs.stanford.edu>' ],
              translator_credits: _("translator-credits"),
              program_name: _("Almond"),
              comments: _("The Open Virtual Assistant"),
              copyright: 'Copyright 2016-2018 Stanford University, Mobisocial Computing Lab',
              license_type: Gtk.License.GPL_3_0,
              logo_icon_name: 'edu.stanford.Almond',
              version: pkg.version,
              website: 'https://almond.stanford.edu',
              wrap_license: true,
              modal: true,
              transient_for: this
            });

        aboutDialog.show();
        aboutDialog.connect('response', () => {
            aboutDialog.destroy();
        });
    }

    _showSettings() {
        const dialog = new SettingsDialog(this, this._service);
        dialog.show();
        dialog.connect('response', () => {
            dialog.destroy();
        });
    }
});
