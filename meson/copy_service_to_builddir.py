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

srcdir = os.path.dirname(sys.argv[1])
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
yarn = os.environ.get('YARN', 'yarn')
subprocess.check_call([yarn, "install", "--offline", "--only=production", "--frozen-lockfile"], cwd=builddir)

