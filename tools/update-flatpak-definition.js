// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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

const YarnLock = require('@yarnpkg/lockfile');
const fs = require('fs');
const Url = require('url');
const path = require('path');
const crypto = require('crypto');
const Tp = require('thingpedia');

async function main() {
    // load the yarn.lock files
    const yarnlockfile = fs.readFileSync('./yarn.lock').toString();
    const yarnlock = YarnLock.parse(yarnlockfile);

    const urls = new Map;
    for (let name in yarnlock.object) {
        const url = yarnlock.object[name].resolved;

        const parsed = Url.parse(url);
        let basename = path.basename(parsed.pathname);
        if (name.startsWith('@')) {
            const namespace = name.substring(0, name.indexOf('/'));
            basename = namespace + '-' + basename;
        }

        urls.set(url, basename);
    }

    const sources = [];
    for (let [url, basename] of urls) {

        const sha256 = crypto.createHash('sha256');
        const [buffer,] = await Tp.Helpers.Http.get(url, { raw: true });
        sha256.update(buffer);

        const source = {
            type: 'file',
            url: url,
            sha256: sha256.digest('hex'),
            dest: 'deps',
            'dest-filename': basename
        };
        sources.push(source);
    }

    fs.writeFileSync('./build-data/yarn.json', JSON.stringify(sources, undefined, 4));
}
main();
