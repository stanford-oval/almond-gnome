#!/usr/bin/env python3
#
# This file is part of Almond
#
# Copyright 2019 Giovanni Campagna <gcampagn@cs.stanford.edu>
#
# See COPYING for details
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
shutil.copy2(os.path.join(rootsrcdir, 'yarn.lock'), os.path.join(builddir, 'yarn.lock'))
shutil.copy2(os.path.join(rootsrcdir, '.yarnrc'), os.path.join(builddir, '.yarnrc'))
with open(os.path.join(builddir, '.yarnrc'), 'a') as fp:
    depsdir = os.path.abspath(os.path.join(rootsrcdir, 'deps'))
    print(f'yarn-offline-mirror "{depsdir}"', file=fp)

yarn = os.environ.get('YARN', 'yarn')
print(os.path.abspath(builddir))
subprocess.check_call([yarn, "install", "--offline", "--only=production", "--frozen-lockfile", "--noprogress"], cwd=builddir)
