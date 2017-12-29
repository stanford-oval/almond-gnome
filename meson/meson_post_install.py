#!/usr/bin/env python3

import os
import shutil
import pathlib
import subprocess

prefix = pathlib.Path(os.environ['MESON_INSTALL_PREFIX'])
datadir = prefix / 'share'
destdir = os.environ.get('DESTDIR', '')

if not destdir:
    print('Compiling gsettings schemas...')
    subprocess.call(['glib-compile-schemas', str(datadir / 'glib-2.0' / 'schemas')])

    print('Updating icon cache...')
    subprocess.call(['gtk-update-icon-cache', '-qtf', str(datadir / 'icons' / 'hicolor')])

    print('Updating desktop database...')
    subprocess.call(['update-desktop-database', '-q', str(datadir / 'applications')])

sourcedir = os.path.join(os.environ['MESON_SOURCE_ROOT'], 'service')
servicedir = os.path.join(os.environ.get('MESON_DESTDIR_INSTALL_PREFIX', os.environ['MESON_INSTALL_PREFIX']), 'lib', 'edu.stanford.Almond', 'service')

print('Installing node.js service...')
try:
    shutil.rmtree(servicedir)
except FileNotFoundError:
    pass
shutil.copytree(sourcedir, servicedir, symlinks=True)

yarn = os.environ.get('YARN', 'yarn')
subprocess.check_call([yarn, "install", "--offline", "--only=production", "--frozen-lockfile"], cwd=servicedir)

shutil.rmtree(os.path.join(servicedir, "deps"))
