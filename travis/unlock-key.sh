#!/bin/bash

set -e
srcdir=`dirname $0`

if test "$TRAVIS_REPO_SLUG" != "stanford-oval/almond-gnome" ; then
	exit 0
fi
if test "$TRAVIS_PULL_REQUEST" != "false" ; then
	exit 0
fi

echo "Unlocking Travis autodeploy key..."
openssl aes-256-cbc \
	-K $encrypted_9ed9bade8d25_key -iv $encrypted_9ed9bade8d25_iv \
	-in $srcdir/id_rsa.autodeploy.enc \
	-out $srcdir/id_rsa.autodeploy \
	-d
chmod 0600 $srcdir/id_rsa.autodeploy
