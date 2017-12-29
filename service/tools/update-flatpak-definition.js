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
    if (name.startsWith('@yarnpkg/lockfile'))
        continue;

    const url = yarnlock.object[name].resolved;
    urls.add(url);
}
for (let url of urls) {
    const parsed = Url.parse(url);
    const basename = path.basename(parsed.pathname);

    const sha256 = crypto.createHash('sha256');
    sha256.update(fs.readFileSync(path.resolve('deps', basename)));

    lastModule.sources.push({
        type: 'file',
        url: url,
        sha256: sha256.digest('hex'),
        dest: 'service/deps'
    });
}

fs.writeFileSync('../edu.stanford.Almond.json', JSON.stringify(existing, undefined, 2));
