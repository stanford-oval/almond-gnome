icondir = $(datadir)/icons/

# ##example## Uncomment when an icon actually exists

#nobase_icon_DATA = \
#	hicolor/16x16/apps/$(PACKAGE_NAME).png \
#	hicolor/22x22/apps/$(PACKAGE_NAME).png \
#	hicolor/32x32/apps/$(PACKAGE_NAME).png \
#	hicolor/48x48/apps/$(PACKAGE_NAME).png \
#	hicolor/256x256/apps/$(PACKAGE_NAME).png
#EXTRA_DIST = $(nobase_icon_DATA) hicolor/$(PACKAGE_NAME).svg

gtk_update_icon_cache = gtk-update-icon-cache -f -t $(datadir)/icons/hicolor; gtk-update-icon-cache -f -t $(datadir)/icons/HighContrast

install-data-hook: update-icon-cache
uninstall-hook: update-icon-cache
update-icon-cache:
	@-if test -z "$(DESTDIR)"; then \
		echo "Updating Gtk icon cache."; \
		$(gtk_update_icon_cache); \
	else \
		echo "*** Icon cache not updated.  After (un)install, run this:"; \
		echo "***   $(gtk_update_icon_cache)"; \
	fi

-include $(top_srcdir)/git.mk
