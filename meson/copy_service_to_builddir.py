#!/usr/bin/env python3
#
# This file is part of Almond
#
# Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""Poor man's "rsync -rtv -x node_modules"
"""

import os
import sys
import shutil
import subprocess

rootsrcdir = os.path.dirname(sys.argv[1])
srcdir = os.path.join(rootsrcdir, 'service')
builddir = sys.argv[2]

os.makedirs(builddir, exist_ok=True)

def recurse(path):
    for entry in os.scandir(os.path.join(srcdir, path)):
        if entry.name == 'node_modules':
            continue

        dest = os.path.join(builddir, path, entry.name)

        if entry.is_dir():
            os.makedirs(dest, exist_ok=True)
            shutil.copystat(entry.path, dest)
            recurse(os.path.join(path, entry.name))
            continue
        if entry.is_symlink():
            link_name = os.readlink(entry.path)
            os.symlink(dest, link_name)
            continue

        stat = entry.stat()

        try:
            dest_stat = os.stat(dest)
            if dest_stat.st_mtime >= stat.st_mtime:
                continue
        except FileNotFoundError:
            pass
        shutil.copy2(entry.path, dest)

recurse('.')
shutil.copy2(os.path.join(rootsrcdir, 'package.json'), os.path.join(builddir, 'package.json'))
shutil.copy2(os.path.join(rootsrcdir, 'package-lock.json'), os.path.join(builddir, 'package-lock.json'))
shutil.copy2(os.path.join(rootsrcdir, '.npmrc'), os.path.join(builddir, '.npmrc'))
npm = os.environ.get('NPM', 'npm')
print(os.path.abspath(builddir))

# make sure npm is present in the path
#if npm.startswith('/'):
#    npmdir = os.path.dirname(npm)
#    os.environ['PATH'] = os.environ['PATH'] + ':' + npmdir
subprocess.check_call([npm, "install", "--offline", "--cache", os.path.abspath(os.path.join(rootsrcdir, 'flatpak-node/npm-cache')), "--only=production"], cwd=builddir)
