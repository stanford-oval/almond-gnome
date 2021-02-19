#!/usr/bin/python3

import json
import os
import urllib.request
import urllib.parse
import ssl
import shutil

os.makedirs('./deps', exist_ok=True)

with open('./build-data/npm.json') as fp:
    data = json.load(fp)

ssl_context = ssl.create_default_context()
for src in data:
    if src['type'] == 'file':
        os.makedirs(src['dest'], exist_ok=True)
        dest = os.path.join(src['dest'], src['dest-filename'])
        print(dest)

        if src['url'].startswith('data:'):
            with open(dest, 'wb') as fp:
                fp.write(urllib.parse.unquote_to_bytes(src['url'][len('data:'):]))
        else:
            with urllib.request.urlopen(src['url'], context=ssl_context) as fsrc, \
                open(dest, 'wb') as fdest:
                    shutil.copyfileobj(fsrc, fdest)
    elif src['type'] == 'script':
        os.makedirs(src['dest'], exist_ok=True)
        dest = os.path.join(src['dest'], src['dest-filename'])
        print(dest)
        with open(dest, 'w') as fp:
            for command in src['commands']:
                print(command, file=fp)
        os.chmod(dest, mode=0o755)
    elif src['type'] == 'shell':
        for command in src['commands']:
            os.system(command)
    else:
        raise ValueError(f'Invalid module type {src["type"]}')

