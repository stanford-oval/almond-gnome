#!/usr/bin/env python3

import os
import subprocess
import shutil

schemadir = os.path.join(os.environ['MESON_INSTALL_PREFIX'], 'share', 'glib-2.0', 'schemas')

if not os.environ.get('DESTDIR'):
	print('Compiling gsettings schemas...')
	subprocess.call(['glib-compile-schemas', schemadir])

sourcedir = os.path.join(os.environ['MESON_SOURCE_ROOT'], 'service')
servicedir = os.path.join(os.environ.get('MESON_DESTDIR_INSTALL_PREFIX', os.environ['MESON_INSTALL_PREFIX']), 'lib', 'edu.stanford.Almond', 'service')

print('Installing node.js service...')
try:
    shutil.rmtree(servicedir)
except FileNotFoundError:
    pass
shutil.copytree(sourcedir, servicedir, symlinks=True)

yarn = os.environ.get('YARN', 'yarn')
subprocess.call([yarn, "install", "--frozen-lockfile"], cwd=servicedir)
