"use strict";

const YarnLock = require('@yarnpkg/lockfile');
const fs = require('fs');
const Url = require('url');
const path = require('path');
const crypto = require('crypto');

const existing = JSON.parse(fs.readFileSync('../edu.stanford.Almond.json'));

const lastModule = existing.modules[existing.modules.length-1];

// drop all sources but the first
lastModule.sources = [lastModule.sources[0]];

// load the yarn.lock files
const yarnlockfile = fs.readFileSync('./yarn.lock').toString();
const yarnlock = YarnLock.parse(yarnlockfile);

const urls = new Set;
for (let name in yarnlock.object) {
    const url = yarnlock.object[name].resolved;
    urls.add(url);
}
for (let url of urls) {
    const parsed = Url.parse(url);
    let basename = path.basename(parsed.pathname);

    if (basename.startsWith('lockfile'))
        basename = '@yarnpkg-' + basename;

    const sha256 = crypto.createHash('sha256');
    sha256.update(fs.readFileSync(path.resolve('deps', basename)));

    const source = {
        type: 'file',
        url: url,
        sha256: sha256.digest('hex'),
        dest: 'service/deps',
        'dest-filename': basename
    };
    lastModule.sources.push(source);
}

fs.writeFileSync('../edu.stanford.Almond.json', JSON.stringify(existing, undefined, 4));
