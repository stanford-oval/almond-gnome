#!/usr/bin/python3

import json
import os
import urllib.request
import urllib.parse
import ssl
import shutil

os.makedirs('./service/deps', exist_ok=True)

with open('./service/flatpak.json') as fp:
    data = json.load(fp)

ssl_context = ssl.create_default_context()
for src in data:
    url = urllib.parse.urlparse(src['url'])
    dest = os.path.join('./service/deps', src['dest-filename'])
    print(src['dest-filename'])
    with urllib.request.urlopen(src['url'], context=ssl_context) as fsrc, \
        open(dest, 'wb') as fdest:
        shutil.copyfileobj(fsrc, fdest)

