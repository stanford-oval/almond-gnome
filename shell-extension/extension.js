// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// Part of this code was copied from GNOME Shell.
// Copyright The GNOME Shell Developers.
//
// The following license applies to such code, and to this file,
// as a whole.
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License as
// published by the Free Software Foundation; either version 2 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program; if not, see <http://www.gnu.org/licenses/>.
"use strict";

const Main = imports.ui.main;
const History = imports.misc.history;
//const MessageList = imports.ui.messageList;
const MessageTray = imports.ui.messageTray;
//const Params = imports.misc.params;
//const Util = imports.misc.util;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const St = imports.gi.St;
const Shell = imports.gi.Shell;
const Pango = imports.gi.Pango;
const Soup = imports.gi.Soup;
//const Clutter = imports.gi.Clutter;

const Gettext = imports.gettext.domain('edu.stanford.Almond');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const { AssistantModel, Direction, MessageType, Message } = Me.imports.common.chatmodel;
const Config = Me.imports.common.config;
const { Service } = Me.imports.common.serviceproxy;

const CHAT_EXPAND_LINES = 12;

/* exported init */
function init(meta) {
    Convenience.initTranslations();
}

let _source;

const AssistantLineBox = GObject.registerClass(class AlmondAssistantLineBox extends St.BoxLayout {
    vfunc_get_preferred_height(forWidth) {
        let [, natHeight] = super.vfunc_get_preferred_height(forWidth);
        return [natHeight, natHeight];
    }
});

function handleSpecial(service, title, special) {
    let json = JSON.stringify({
        code: ['bookkeeping', 'special', 'special:' + special],
        entities: {}
    });
    service.HandleParsedCommandRemote(title, json, (error) => {
        if (error)
            log('Failed to click on button: ' + error);
    });
}

function activateGtkAction(actionName, actionParameter) {
    const app = Shell.AppSystem.get_default().lookup_app('edu.stanford.Almond.desktop');
    
    let attempts = 0;
    function _continue() {
        attempts ++;
        if (attempts >= 10)
            return GLib.SOURCE_REMOVE;
        const actionGroup = app.action_group;
        if (actionGroup === null)
            return GLib.SOURCE_CONTINUE;
        actionGroup.activate_action(actionName, actionParameter);
        return GLib.SOURCE_REMOVE;
    }
    
    if (app.action_group) {
        _continue();
    } else {
        app.activate();
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, _continue, 500);
    }
}

const MessageConstructors = {
    [MessageType.TEXT](msg) {
        let label = new St.Label();
        label.clutter_text.line_wrap = true;
        label.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        msg.bind_property('text', label, 'text', GObject.BindingFlags.SYNC_CREATE);
        return label;
    },

    [MessageType.PICTURE](msg) {
        let textureCache = St.TextureCache.get_default();
        let file = Gio.File.new_for_uri(msg.picture_url);
        let scaleFactor = St.ThemeContext.get_for_stage(window.global.stage).scale_factor;
        let texture = textureCache.load_file_async(file, -1, 300, scaleFactor, 1.0);
        return new St.Bin({ child: texture });
    },

    [MessageType.CHOICE](msg, service) {
        let button = new St.Button();
        button.add_style_class_name('button');
        button.add_style_class_name('almond-button');
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.connect('clicked', () => {
            let choiceJSON = JSON.stringify({ code: ['bookkeeping', 'choice', String(msg.choice_idx)], entities: {} });
            service.HandleParsedCommandRemote(msg.text, choiceJSON, (error) => {
                if (error)
                    log('Failed to click on button: ' + error);
            });
        });
        return button;
    },

    [MessageType.LINK](msg, service) {
        // recognize what kind of link this is, and spawn the app in the right way
        let button = new St.Button();
        button.add_style_class_name('button');
        button.add_style_class_name('almond-button');
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        
        if (msg.link === '/user/register') {
            // ??? we are not anonymous, this should never happen
            throw new Error('Invalid link asking the user to register');
        } else if (msg.link === '/thingpedia/cheatsheet') {
            button.connect('clicked', () => {
                const url = 'https://thingpedia.stanford.edu' + msg.link;
                Gio.app_info_launch_default_for_uri(url, global.create_app_launch_context(0, -1));
            });
        } else if (msg.link === '/apps') {
            button.connect('clicked', () => {
                activateGtkAction('win.switch-to', new GLib.Variant('s', 'page-my-stuff'));
            });
            button.set_detailed_action_name('win.switch-to::page-my-stuff');
        } else if (msg.link.startsWith('/devices/oauth2/')) {
            // "parse" the link in the context of a dummy base URI
            let uri = Soup.URI.new_with_base(Soup.URI.new('https://invalid'), msg.link);
            let kind = uri.get_path().substring('/devices/oauth2/'.length);
            let query = Soup.form_decode(uri.get_query());
            button.connect('clicked', () => {
                activateGtkAction('win.configure-device-oauth2', new GLib.Variant('(ss)', [kind, query.name||'']));
            });
        } else {
            throw new Error('Unexpected link to ' + msg.link);
        }
        
        return button;
    },

    [MessageType.BUTTON](msg, service) {
        let button = new St.Button();
        button.add_style_class_name('button');
        button.add_style_class_name('almond-button');
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.connect('clicked', () => {
            service.HandleParsedCommandRemote(msg.text, msg.json, (error) => {
                if (error)
                    log('Failed to click on button: ' + error);
            });
        });
        return button;
    },

    [MessageType.ASK_SPECIAL](msg, service) {
        if (msg.ask_special_what === 'yesno') {
            let box = new St.BoxLayout();
            let yes = new St.Button({
                label: _("Yes")
            });
            yes.add_style_class_name('button');
            yes.connect('clicked', () => {
                handleSpecial(service, _("Yes"), 'yes');
            });
            box.add(yes);

            let no = new St.Button({
                label: _("No")
            });
            no.add_style_class_name('button');
            no.connect('clicked', () => {
                handleSpecial(service, _("No"), 'no');
            });
            box.add(no);

            return box;
        } else {
            // do something else...
            return null;
        }
    },

    [MessageType.RDL](msg) {
        let box = new St.BoxLayout({ vertical: true });
        let button = new St.Button();
        button.connect('clicked', () => {
            const url = msg.rdl_callback;
            Gio.app_info_launch_default_for_uri(url, window.global.create_app_launch_context(0, -1));
        });
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.add_style_class_name('almond-rdl-title');
        button.add_style_class_name('shell-link');
        box.add_actor(button);

        let description = new St.Label();
        description.clutter_text.line_wrap = true;
        description.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        msg.bind_property('rdl_description', description, 'text', GObject.BindingFlags.SYNC_CREATE);
        description.add_style_class_name('almond-rdl-description');
        box.add_actor(description);
        return box;
    }
};

const AssistantNotificationBanner = GObject.registerClass(class AlmondAssistantNotificationBanner extends MessageTray.NotificationBanner {
    _init(notification) {
        super._init(notification);

        this.responseEntry = new St.Entry({ style_class: 'chat-response',
                                            x_expand: true,
                                            can_focus: true });
        this.responseEntry.clutter_text.connect('activate', this._onEntryActivated.bind(this));
        this.setActionArea(this.responseEntry);

        this.responseEntry.clutter_text.connect('key-focus-in', () => {
            this.focused = true;
        });
        this.responseEntry.clutter_text.connect('key-focus-out', () => {
            this.focused = false;
            this.emit('unfocused');
        });

        this._scrollArea = new St.ScrollView({ style_class: 'chat-scrollview vfade',
                                               vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
                                               hscrollbar_policy: Gtk.PolicyType.NEVER,
                                               visible: this.expanded });
        this._contentArea = new St.BoxLayout({ style_class: 'chat-body almond-chatview',
                                               vertical: true });
        this._scrollArea.add_actor(this._contentArea);

        this.setExpandedBody(this._scrollArea);
        this.setExpandedLines(CHAT_EXPAND_LINES);

        this._lastGroup = null;

        // Keep track of the bottom position for the current adjustment and
        // force a scroll to the bottom if things change while we were at the
        // bottom
        this._oldMaxScrollValue = this._scrollArea.vscroll.adjustment.value;
        this._scrollArea.vscroll.adjustment.connect('changed', (adjustment) => {
            if (adjustment.value === this._oldMaxScrollValue)
                this.scrollTo(St.Side.BOTTOM);
            this._oldMaxScrollValue = Math.max(adjustment.lower, adjustment.upper - adjustment.page_size);
        });

        this._inputHistory = new History.HistoryManager({ entry: this.responseEntry.clutter_text });

        this._messages = [];
        this._store = this.notification.model.store;
        this._itemsChangedId = this._store.connect('items-changed', (store, position, removed, added) => {
            if (removed > 0) {
                for (let msg of this._messages.splice(position, removed)) {
                    if (msg.actor)
                        msg.actor.destroy();
                }
            }
            if (added > 0)
                this._addMessages(position, position+added);
        });

        this._addMessages(0, this.notification.model.store.get_n_items());
    }

    _addMessages(from, to) {
        for (let i = from; i < to; i++)
            this._addMessage(this._store.get_item(i), i);
    }

    _onDestroy() {
        super._onDestroy();
        this._store.disconnect(this._itemsChangedId);
    }

    scrollTo(side) {
        let adjustment = this._scrollArea.vscroll.adjustment;
        if (side === St.Side.TOP)
            adjustment.value = adjustment.lower;
        else if (side === St.Side.BOTTOM)
            adjustment.value = adjustment.upper;
    }

    hide() {
        this.emit('done-displaying');
    }

    _addMessage(message, position) {
        let styles = [];
        if (message.direction === Direction.FROM_ALMOND)
            styles.push('chat-received');
        else
            styles.push('chat-sent');

        let group = (message.direction === Direction.FROM_ALMOND ?
                     'received' : 'sent');
        let msgObject = {};
        this._messages.splice(position, 0, msgObject);

        let msgConstructor = MessageConstructors[message.message_type];
        if (!msgConstructor)
            throw new Error('Invalid message type ' + message.message_type);
        let body = msgConstructor(message, this.notification.source.service);
        if (!body)
            return;
        for (let style of styles)
            body.add_style_class_name(style);

        if (group !== this._lastGroup) {
            this._lastGroup = group;
            body.add_style_class_name('chat-new-group');
        }

        let lineBox = new AssistantLineBox();
        lineBox.add(body, { expand: true, x_fill: true, y_fill: true });
        msgObject.actor = lineBox;
        this._contentArea.insert_child_at_index(lineBox, position);
    }

    _onEntryActivated() {
        let text = this.responseEntry.get_text();
        if (text === '')
            return;

        this._inputHistory.addItem(text);

        this.responseEntry.set_text('');
        this.notification.source.respond(text);
    }
});

const AssistantSource = GObject.registerClass(class AssistantSource extends MessageTray.Source {
    _init() {
        super._init(_("Almond"), 'edu.stanford.Almond');

        this.isChat = true;

        new Service(Gio.DBus.session, 'edu.stanford.Almond.BackgroundService', '/edu/stanford/Almond/BackgroundService', (result, error) => {//'
            if (error) {
                logError(error, 'Failed to initialize Almond BackgroundService');
                return;
            }

            this.service = result;
            this._continueInit();
        });
    }

    destroy(reason) {
        // Keep source alive while the extension is enabled
        if (reason !== MessageTray.NotificationDestroyedReason.SOURCE_CLOSED)
            return;

        if (this._destroyed)
            return;

        this._destroyed = true;

        if (this._model)
            this._model.stop();
        if (this.service)
            this.service.run_dispose();
        super.destroy(reason);
    }

    respond(text) {
        const onerror = (result, error) => {
            if (error)
                log('Failed to handle command: ' + error);
        };

        function handleSlashR(line) {
            line = line.trim();
            if (line.startsWith('{')) {
                this.service.HandleParsedCommandRemote('', line, onerror);
            } else {
                this.service.HandleParsedCommandRemote('',
                    JSON.stringify({ code: line.split(' '), entities: {} }), onerror);
            }
        }
        if (text.startsWith('\\r')) {
            handleSlashR(text.substring(3));
            return;
        }
        if (text.startsWith('\\t')) {
            this.service.HandleThingTalkRemote(text.substring(3), onerror);
            return;
        }

        this.service.HandleCommandRemote(text, onerror);
    }

    _activateIfAlmondUnfocused() {
        const focus_app = Shell.WindowTracker.get_default().focus_app;
        if (focus_app && focus_app.get_id() === 'edu.stanford.Almond.desktop')
            return;

        this.notify(this._notification);
    }

    _continueInit() {
        // Add ourselves as a source.
        Main.messageTray.add(this);

        this.service.connectSignal('NewMessage', (signal, sender, [id, type, direction, msg]) => {
            if (direction !== Direction.FROM_ALMOND)
                return;

            msg.message_id = id;
            msg.message_type = type;
            msg.direction = direction;
            const message = new Message(msg);

            this.setMessageIcon(message.icon);
            let msgBody = message.toNotification();
            log('msgBody: ' + msgBody);
            
            if (msgBody && this._notification) {
                this._notification.update(this.title, msgBody, {
                    secondaryGIcon: this.getSecondaryIcon()
                });
            }
        
            this._activateIfAlmondUnfocused();
        });
        this.service.connectSignal('Activate', () => {
            this._activateIfAlmondUnfocused();
        });
        this.service.connectSignal('VoiceHypothesis', (signal, sender, [hyp]) => {
            if (!this._banner)
                return;
            this._banner.responseEntry.set_text(hyp);
        });
        this._model = new AssistantModel(this.service);
        this._model.start();

        this._icon = null;

        this._notification = new MessageTray.Notification(this, this.title, null,
              { secondaryGIcon: this.getSecondaryIcon() });
        this._notification.setUrgency(MessageTray.Urgency.HIGH);
        this._notification.setResident(true);

        this._notification.model = model;
        this._notification.connect('activated', this.open.bind(this));
        this._notification.connect('updated', () => {
            //if (this._banner && this._banner.expanded)
            //    this._ackMessages();
        });
        this._notification.connect('destroy', () => {
            this._notification = null;
        });
        this.pushNotification(this._notification);
    }

    _createPolicy() {
        return new MessageTray.NotificationPolicy({
            enable: true,
            enableSound: false, // Almond runs its own sound
            showBanners: true,
            forceExpanded: true, // compressed Almond notifications are useless, we want to interact with it
            showInLockScreen: false,
            detailsInLockScreen: false
        });
    }

    createBanner() {
        this._banner = new AssistantNotificationBanner(this._notification);
        return this._banner;
    }

    setMessageIcon(icon) {
        this._icon = icon;
    }

    getSecondaryIcon() {
        if (!this._icon)
            return new Gio.ThemedIcon({ name: 'edu.stanford.Almond' });

        return new Gio.FileIcon({ file: Gio.File.new_for_uri(Config.THINGPEDIA_URL + '/api/devices/icon/' + this._icon) });
    }

    open() {
        Main.overview.hide();
        Main.panel.closeCalendar();

        let app = Shell.AppSystem.get_default().lookup_app('edu.stanford.Almond.desktop');
        app.activate();
    }
});

/* exported enable */
function enable() {
    if (_source)
        return;
    _source = new AssistantSource();
}

/* exported disable */
function disable() {
    _source.destroy(MessageTray.NotificationDestroyedReason.SOURCE_CLOSED);
    _source = null;
}
