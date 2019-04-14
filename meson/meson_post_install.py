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

servicedir = os.path.join(os.environ.get('MESON_DESTDIR_INSTALL_PREFIX', os.environ['MESON_INSTALL_PREFIX']), 'lib', 'edu.stanford.Almond', 'service')
shutil.rmtree(os.path.join(servicedir, "deps"))
