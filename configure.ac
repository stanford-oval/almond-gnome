AC_PREREQ(2.63)
AC_INIT([edu.stanford.thingengine], [0.1],
        [https://github.com/Stanford-Mobisocial-IoT-Lab/thingengine-platform-gnome/issues],
        [thingengine-platform-gnome],
        [https://thingengine.stanford.edu/])

AC_CONFIG_HEADERS([config.h])
AC_CONFIG_MACRO_DIR([m4])

AM_INIT_AUTOMAKE([1.12 dist-xz no-dist-gzip foreign tar-ustar no-define serial-tests -Wno-portability])
# revert automake using PACKAGE_TARNAME instead of PACKAGE_NAME
AC_SUBST([PACKAGE], [$PACKAGE_NAME])

PACKAGE_DBUS_PATH=/`echo $PACKAGE_NAME | sed 's,\.,/,g'`
AC_SUBST([PACKAGE_DBUS_PATH], [$PACKAGE_DBUS_PATH])

m4_ifdef([AM_SILENT_RULES], [AM_SILENT_RULES([yes])])

GETTEXT_PACKAGE=$PACKAGE_NAME
AC_SUBST(GETTEXT_PACKAGE)
AC_DEFINE_UNQUOTED(GETTEXT_PACKAGE, "$GETTEXT_PACKAGE",
                   [The prefix for our gettext translation domains.])
AM_GNU_GETTEXT_VERSION([0.19.7])
AM_GNU_GETTEXT([external])

APPSTREAM_XML
GLIB_GSETTINGS
GOBJECT_INTROSPECTION_REQUIRE([1.35.9])
GJS_MIN_VERSION=1.39.91
PKG_CHECK_MODULES([DEPS], [gdk-3.0
                           gdk-pixbuf-2.0
                           gio-2.0
                           glib-2.0
                           gobject-2.0
                           gtk+-3.0])

AC_PATH_PROG([GJS],[gjs])

GLIB_COMPILE_RESOURCES=`$PKG_CONFIG --variable glib_compile_resources gio-2.0`
AC_SUBST(GLIB_COMPILE_RESOURCES)

AC_CONFIG_FILES([
  Makefile
  data/Makefile
  data/icons/Makefile
  src/Makefile
  po/Makefile.in
])
AC_OUTPUT
