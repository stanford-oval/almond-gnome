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

import os
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
