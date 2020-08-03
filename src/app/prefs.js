// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
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

/* exported PreferenceBinding */
var PreferenceBinding = GObject.registerClass({
    Properties: {
        'state': GObject.param_spec_variant('state', '', '', new GLib.VariantType('*'),
                                            null, GObject.ParamFlags.READWRITE)
    }
}, class PreferenceBinding extends GObject.Object {
    _init(service, name, type, fromjson = (x) => x, tojson = (x) => x) {
        super._init();

        this._name = name;
        this._service = service;
        this._type = type;
        this._state = new GLib.Variant(type, defaultForType(type));
        this._fromjson = fromjson;
        this._tojson = tojson;

        this._signal = service.connectSignal('PreferenceChanged', (sender, [key]) => {
            if (!key || key === this._name)
                this._refresh();
        });
        this._refresh();
    }

    get state() {
        return this._state;
    }

    set state(value) {
        log(value);
        dbusPromiseify(this._service, 'SetPreferenceRemote', this._name, this._tojson(value)).then(() => {
            this._state = value;
            this.notify('state');
        }).catch((e) => {
            logError(e, 'Failed to set preference ' + this._name);
        });
    }

    destroy() {
        if (!this._signal)
            return;
        this._service.disconnectSignal(this._signal);
        this._signal = 0;
    }

    _refresh() {
        dbusPromiseify(this._service, 'GetPreferenceRemote', this._name).then(([value]) => {
            this._state = this._fromjson(value);
            log(this._name + ' = ' + this._state);
            this.notify('state');
        }).catch((e) => {
            logError(e, 'Failed to refresh preference ' + this._name);
        });
    }
});

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
    _init(service, name, type, fromjson = (x) => x, tojson = (x) => x) {
        super._init();

        this._name = name;
        this._type = type;
        this._binder = new PreferenceBinding(service, name, type, fromjson, tojson);
    }

    get name() {
        return this._name;
    }
    get state_type() {
        return new GLib.VariantType(this._type);
    }
    get state() {
        return this._binder.state;
    }
    get enabled() {
        return true;
    }
    get parameter_type() {
        return this._type === 'b' ? null :
            new GLib.VariantType(this._type);
    }

    destroy() {
        this._binder.destroy();
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
        this._binder.state = value;
    }
    vfunc_activate(value) {
        if (this._type === 'b')
            value = new GLib.Variant('b', !this._binder.state.deep_unpack());
        this._binder.state = value;
    }
});
