"use strict";

const YarnLock = require('@yarnpkg/lockfile');
const fs = require('fs');
const Url = require('url');
const path = require('path');
const crypto = require('crypto');

// load the yarn.lock files
const yarnlockfile = fs.readFileSync('./yarn.lock').toString();
const yarnlock = YarnLock.parse(yarnlockfile);

const urls = new Set;
for (let name in yarnlock.object) {
    const url = yarnlock.object[name].resolved;

    const parsed = Url.parse(url);
    let basename = path.basename(parsed.pathname);
    if (name.startsWith('@')) {
        const namespace = name.substring(0, name.indexOf('/'));
        basename = namespace + '-' + basename;
    }

    urls.add([url, basename]);
}

const sources = [];
for (let [url, basename] of urls) {

    const sha256 = crypto.createHash('sha256');
    sha256.update(fs.readFileSync(path.resolve('deps', basename)));

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
