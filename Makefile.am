ACLOCAL_AMFLAGS = -I m4 ${ACLOCAL_FLAGS}
DISTCHECK_CONFIGURE_FLAGS = --disable-dogtail

SUBDIRS = data src service po

MAINTAINERCLEANFILES = \
	$(srcdir)/INSTALL \
	$(srcdir)/aclocal.m4 \
	$(srcdir)/autoscan.log \
	$(srcdir)/compile \
	$(srcdir)/config.guess \
	$(srcdir)/config.h.in \
	$(srcdir)/config.sub \
	$(srcdir)/configure.scan \
	$(srcdir)/depcomp \
	$(srcdir)/install-sh \
	$(srcdir)/ltmain.sh \
	$(srcdir)/missing \
	$(srcdir)/mkinstalldirs

GITIGNOREFILES = \
	m4/*.m4 \
	ABOUT-NLS \
	config.rpath \
	rpms/

distdir = $(PACKAGE_TARNAME)-$(VERSION)

rpmdefines = \
	--define "_name $(PACKAGE_NAME)" \
	--define "_version $(PACKAGE_VERSION)" \
	--define "_distdir $(PACKAGE_TARNAME)" \
	--define "_sourcedir $(abs_builddir)" \
	--define "_specdir $(abs_srcdir)" \
	--define "_builddir $(abs_builddir)/rpms" \
	--define "_srcrpmdir $(abs_builddir)/rpms" \
	--define "_rpmdir $(abs_builddir)/rpms"

-include $(top_srcdir)/git.mk
