#!/bin/bash

set -e
set -x

extension="almond@almond.stanford.edu"
zipfile=`realpath "${extension}.shell-extension.zip"`

mkdir -p ~/.local/share/gnome-shell/extensions/$extension
cd ~/.local/share/gnome-shell/extensions/$extension
unzip -u -o $zipfile

gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Extensions.ReloadExtension 'almond@almond.stanford.edu'
