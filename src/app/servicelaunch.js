// -*- Mode: js; indent-tabs-mode: nil; c-basic-offset: 4; tab-width: 4 -*-
//
// Copyright 2019 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See LICENSE for details
"use strict";

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;

function waitNameSync(name) {
    // CAREFUL! This function is called during early initialization
    // of the process, before the mainloop is setup
    // Hence, promises and async functions will not work at this stage
    // (in any form)
    // Instead, we need to run our own tiny mainloop and basically
    // emulate the whole promise code

    const loop = new GLib.MainLoop(null, false);
    let success = false;
    function nameAppeared() {
        success = true;
        loop.quit();
    }
    function nameVanished() {
    }
    const timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30000, () => {
        loop.quit();
    });

    const watchId = Gio.DBus.session.watch_name(name, Gio.BusNameWatcherFlags.NONE, nameAppeared, nameVanished);
    loop.run();

    Gio.DBus.unwatch_name(watchId);
    GLib.source_remove(timeoutId);
    if (!success)
        throw new Error('Failed waiting for ' + name);
}

function spawnServiceDBusActivation() {
    const bus = Gio.DBus.session;

    if (GLib.getenv('ALMOND_SPAWN_SERVICE_MANUALLY'))
        return false;

    try {
        bus.call_sync("org.freedesktop.DBus",
                      "/org/freedesktop/DBus",
                      "org.freedesktop.DBus",
                      "StartServiceByName",
                      new GLib.Variant("(su)", ["edu.stanford.Almond.BackgroundService", 0]),
                      null,
                      Gio.DBusCallFlags.NONE,
                      -1, null);
        return true;
    } catch(e) {
        if (e instanceof GLib.Error &&
            Gio.DBusError.is_remote_error(e) &&
            Gio.DBusError.get_remote_error(e) === 'org.freedesktop.DBus.Error.ServiceUnknown')
            return false;
        else
            throw e;
    }
}

/* exported spawnService */
function spawnService() {
    // spawn the service before we do anything else
    // normally, dbus activation would take care of it,
    // but if we're running in gnome-builder (uninstalled
    // flatpak environment) dbus is not set correctly

    if (spawnServiceDBusActivation())
        return undefined;

    let servicedir;
    if (GLib.getenv('MESON_SOURCE_ROOT'))
        servicedir = GLib.build_filenamev([GLib.getenv('MESON_SOURCE_ROOT'), 'service']);
    else
        servicedir = GLib.build_filenamev([pkg.pkglibdir, 'service']);
    const serviceentrypoint = GLib.build_filenamev([servicedir, 'main.js']);

    if (GLib.file_test(serviceentrypoint, GLib.FileTest.EXISTS)) {
        const process = Gio.Subprocess.new(['node', serviceentrypoint],
                                           Gio.SubprocessFlags.NONE);

        // wait until the server is initialized (= it acquires the name on the bus,
        // signaling that it is ready for IPC)
        //
        // NOTE: in the normal, installed case, dbus-daemon will wait for the process
        // to activate before returning from StartServiceByName, or dispatching the activating call
        waitNameSync('edu.stanford.Almond.BackgroundService');
        return process;
    }
    return undefined;
}
