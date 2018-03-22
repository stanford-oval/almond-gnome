// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2018 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const GObject = imports.gi.GObject;
const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const { dbusPromiseify } = imports.common.util;

function defaultForType(type) {
    switch (type) {
    case 's':
        return '';
    case 'b':
        return false;
    case 'd':
        return 0.0;
    case 'a{sv}':
        return {};
    }
    return '';
}

/* exported PreferenceAction */
var PreferenceAction = GObject.registerClass({
    Implements: [Gio.Action],
    Properties: {
        'name': GObject.ParamSpec.override('name', Gio.Action),
        'parameter-type': GObject.ParamSpec.override('parameter-type', Gio.Action),
        'enabled': GObject.ParamSpec.override('enabled', Gio.Action),
        'state-type': GObject.ParamSpec.override('state-type', Gio.Action),
        'state': GObject.ParamSpec.override('state', Gio.Action),
    }
}, class PreferenceAction extends GObject.Object {
    _init(service, name, type) {
        super._init();

        this._name = name;
        this._service = service;
        this._type = type;
        this._state = new GLib.Variant(type, defaultForType(type));

        this._signal = service.connectSignal('PreferenceChanged', (sender, [key]) => {
            if (!key || key === this._name)
                this._refresh();
        });
        this._refresh();
    }

    get name() {
        return this._name;
    }
    get state_type() {
        return new GLib.VariantType(this._type);
    }
    get state() {
        return this._state;
    }
    get enabled() {
        return true;
    }
    get parameter_type() {
        return this._type === 'b' ? null :
            new GLib.VariantType(this._type);
    }

    destroy() {
        if (!this._signal)
            return;
        this._service.disconnectSignal(this._signal);
        this._signal = 0;
    }

    _refresh() {
        dbusPromiseify(this._service, 'GetPreferenceRemote', this._name).then(([value]) => {
            this._state = value;
            this.notify('state');
        }).catch((e) => {
            logError(e, 'Failed to refresh preference ' + this._name);
        });
    }

    vfunc_get_name() {
        return this.name;
    }
    vfunc_get_parameter_type() {
        return this.parameter_type;
    }
    vfunc_get_enabled() {
        return this.enabled;
    }
    vfunc_get_state_type() {
        return this.state_type;
    }
    vfunc_get_state() {
        return this.state;
    }
    vfunc_get_state_hint() {
        return null;
    }
    vfunc_change_state(value) {
        dbusPromiseify(this._service, 'SetPreferenceRemote', this._name, value).then(() => {
            this._state = value;
            this.notify('state');
        }).catch((e) => {
            logError(e, 'Failed to set preference ' + this._name);
        });
    }
    vfunc_activate(value) {
        if (this._type === 'b')
            value = new GLib.Variant('b', !this._state.deep_unpack());

        dbusPromiseify(this._service, 'SetPreferenceRemote', this._name, value).then(() => {
            this._state = value;
            this.notify('state');
        }).catch((e) => {
            logError(e, 'Failed to set preference ' + this._name);
        });
    }
});