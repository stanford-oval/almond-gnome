#!/bin/sh

srcdir=`dirname $0`
srcdir=`(cd $srcdir && pwd)`

builddir=`mktemp -p $srcdir -d _build.XXXXXX` || exit 1
installdir=`mktemp -p $srcdir -d _install.XXXXXX` || exit 1

meson setup --prefix=$installdir $srcdir $builddir
ninja -C$builddir install

extensiondir=$installdir/share/gnome-shell/extensions
schemadir=$installdir/share/glib-2.0/schemas
localedir=$installdir/share/locale

name="almond"
uuid=$name@almond.stanford.edu
schema=$schemadir/edu.stanford.Almond.gschema.xml

f="$extensiondir/$uuid"
cp $srcdir/NEWS $srcdir/COPYING $srcdir/LICENSE $f
cp -r $localedir $f/

if [ -f $schema ]; then
  mkdir $f/schemas
  cp $schema $f/schemas;
  glib-compile-schemas $f/schemas
fi

(cd $f && zip -rmq $srcdir/$uuid.shell-extension.zip . )

rm -rf $builddir
rm -rf $installdir
