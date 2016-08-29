# I chose to use recursive automake so I can use nobase_ and avoid
# 5 different directory declarations
SUBDIRS = icons

app_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir) --generate-dependencies $(srcdir)/edu.stanford.thingengine.data.gresource.xml)
edu.stanford.thingengine.data.gresource: edu.stanford.thingengine.data.gresource.xml $(app_resource_files)
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir) $<

resourcedir = $(pkgdatadir)
resource_DATA = edu.stanford.thingengine.data.gresource

appsdir = $(datadir)/applications
apps_DATA = edu.stanford.thingengine.desktop

edu.stanford.thingengine.desktop: edu.stanford.thingengine.desktop.in
	$(AM_V_GEN)$(MSGFMT) --desktop --template $< -d $(top_srcdir)/po -o $@

gsettings_SCHEMAS = edu.stanford.thingengine.gschema.xml

@GSETTINGS_RULES@

appstream_XML = edu.stanford.thingengine.appdata.xml

@APPSTREAM_XML_RULES@

edu.stanford.thingengine.appdata.xml: edu.stanford.thingengine.appdata.xml.in
	$(AM_V_GEN)$(MSGFMT) --xml --template $< -d $(top_srcdir)/po -o $@

%.service: %.service.in
	$(AM_V_GEN) sed \
		-e "s|[@]pkgdatadir@|$(pkgdatadir)|g" \
		-e "s|[@]pkglibdir@|$(pkglibdir)|g" \
		$< > $@

servicedir = $(datadir)/dbus-1/services
service_DATA = edu.stanford.thingengine.service edu.stanford.thingengine.BackgroundService.service

EXTRA_DIST = \
	edu.stanford.thingengine.desktop.in \
	edu.stanford.thingengine.service.in \
	edu.stanford.thingengine.BackgroundService.service.in \
	edu.stanford.thingengine.data.gresource.xml \
	$(gsettings_SCHEMAS) \
	edu.stanford.thingengine.appdata.xml.in \
	$(app_resource_files) \
	$(NULL)

CLEANFILES = \
	edu.stanford.thingengine.service \
	edu.stanford.thingengine.BackgroundService.service \
	edu.stanford.thingengine.data.gresource \
	edu.stanford.thingengine.appdata.xml \
	edu.stanford.thingengine.appdata.valid \
	$(apps_DATA) \
	*.valid \
	gschemas.compiled \
	$(NULL)

# For uninstalled use
all-local:
	$(GLIB_COMPILE_SCHEMAS) $(builddir)

-include $(top_srcdir)/git.mk
