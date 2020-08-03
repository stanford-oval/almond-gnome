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

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

const Config = imports.common.config;
const { ginvoke } = imports.common.util;

/* exported ImageCacher */
var ImageCacher = class ImageCacher {
    constructor() {
        this._icons = new Map;

        this._icondir = GLib.build_filenamev([
            GLib.get_user_cache_dir(),
            'almond',
            'icons'
        ]);
        if (GLib.mkdir_with_parents(this._icondir, 0o777) < 0)
            throw new Error('Failed to create icon cache dir');
    }

    cacheIcon(icon, cancellable = null) {
        if (!icon)
            return Promise.resolve(new Gio.ThemedIcon({ name: 'edu.stanford.Almond' }));

        if (this._icons.has(icon))
            return this._icons.get(icon);

        const promise = this._doCacheIcon(icon, cancellable);
        this._icons.set(icon, promise);
        return promise;
    }

    async _doCacheIcon(icon, cancellable) {
        const source = Gio.File.new_for_uri(Config.THINGPEDIA_URL + '/api/devices/icon/' + icon);
        const dest = Gio.File.new_for_path(GLib.build_filenamev([this._icondir, icon + '.png']));

        try {
            await ginvoke(dest, 'query_info_async', 'query_info_finish', 'standard::*',
                Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, cancellable);

            return new Gio.FileIcon({ file: dest });
        } catch(e) {
            if (!(e instanceof Gio.IOErrorEnum) || e.code !== Gio.IOErrorEnum.NOT_FOUND)
                throw e;
        }

        try {
            await ginvoke(source, 'copy_async', 'copy_finish', dest,
                Gio.FileCopyFlags.OVERWRITE | Gio.FileCopyFlags.TARGET_DEFAULT_PERMS,
                GLib.PRIORITY_DEFAULT, cancellable, null);

            return new Gio.FileIcon({ file: dest });
        } catch(e) {
            if (!(e instanceof Gio.IOErrorEnum))
                throw e;

            logError(e, 'Failed to load icon ' + icon);
            return new Gio.ThemedIcon({ name: 'image-missing' });
        }
    }
};
