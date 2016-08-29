NULL =

appdir = $(pkgdatadir)
nodist_app_SCRIPTS = edu.stanford.thingengine

app_resource_files = $(shell $(GLIB_COMPILE_RESOURCES) --sourcedir=$(srcdir) --generate-dependencies $(srcdir)/edu.stanford.thingengine.src.gresource.xml)
edu.stanford.thingengine.src.gresource: edu.stanford.thingengine.src.gresource.xml $(app_resource_files)
	$(AM_V_GEN) $(GLIB_COMPILE_RESOURCES) --target=$@ --sourcedir=$(srcdir) $<

resourcedir = $(pkgdatadir)
resource_DATA = edu.stanford.thingengine.src.gresource

edu.stanford.thingengine: edu.stanford.thingengine.in
	$(AM_V_GEN) sed \
		-e "s|[@]GJS@|$(GJS)|g" \
		-e "s|[@]PACKAGE_VERSION@|$(PACKAGE_VERSION)|g" \
		-e "s|[@]prefix@|$(prefix)|g" \
		-e "s|[@]libdir@|$(libdir)|g" \
		-e "s|[@]pkgdatadir@|$(pkgdatadir)|g" \
		$< > $@
	@chmod +x $@

EXTRA_DIST = \
	edu.stanford.thingengine.in \
	edu.stanford.thingengine.src.gresource.xml \
	$(app_resource_files) \
	$(service_resource_files) \
	$(NULL)

CLEANFILES = \
	edu.stanford.thingengine \
	edu.stanford.thingengine.src.gresource \
	$(NULL)

SUBMODULE_DEPS = thingengine-core sabrina thingpedia thingpedia-discovery thingtalk

all-local: $(SUBMODULE_DEPS) service/platform_config.js
	npm install --only=prod
	npm dedupe
	cd node_modules/sabrina ; npm run compile-mo
	cd node_modules/thingengine-core ; npm run compile-mo
	npm run compile-mo

.PHONY: $(SUBMODULE_DEPS)

$(SUBMODULE_DEPS):
	cd service/node_modules/$(notdir $@) ; npm install --only=prod

service/platform_config.js:
	echo "exports.PREFIX = '$(prefix)';" > platform_config.js

install-local:
	cp -r service/ $(DESTDIR)$(pkgdatadir)/service

-include $(top_srcdir)/git.mk
