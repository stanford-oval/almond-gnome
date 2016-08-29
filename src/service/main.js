// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

console.log('ThingEngine-GNOME starting up...');

// we need these very early on
const Q = require('q');

var _engine, _ad;
var _waitReady;
var _running;
var _stopped;

/*
class AppControlChannel extends ControlChannel {
    // handle control methods here...

    invokeCallback(callbackId, error, value) {
        return JavaAPI.invokeCallback(callbackId, error, value);
    }

    stop() {
        if (_running)
            _engine.stop();
        else
            _stopped = true;
        this.close();
    }

    startOAuth2(kind) {
        return _engine.devices.factory.runOAuth2(kind, null);
    }

    handleOAuth2Callback(kind, req) {
        return _engine.devices.factory.runOAuth2(kind, req).then(() => {
            return true;
        });
    }

    createDevice(state) {
        return _engine.devices.loadOneDevice(state, true).then(() => {
            return true;
        });
    }

    deleteDevice(uniqueId) {
        var device = _engine.devices.getDevice(uniqueId);
        if (device === undefined)
            return false;

        _engine.devices.removeDevice(device);
        return true;
    }

    upgradeDevice(kind) {
        return _engine.devices.factory.updateFactory(kind).then(() => {
            return true;
        });
    }

    getDeviceInfos() {
        return _waitReady.then(function() {
            var devices = _engine.devices.getAllDevices();

            return devices.map(function(d) {
                return { uniqueId: d.uniqueId,
                         name: d.name || "Unknown device",
                         description: d.description || "Description not available",
                         kind: d.kind,
                         ownerTier: d.ownerTier,
                         version: d.constructor.version || 0,
                         isTransient: d.isTransient,
                         isOnlineAccount: d.hasKind('online-account'),
                         isDataSource: d.hasKind('data-source'),
                         isThingEngine: d.hasKind('thingengine-system') };
            });
        }, function(e) {
            return [];
        });
    }

    getDeviceInfo(uniqueId) {
        return _waitReady.then(function() {
            var d = _engine.devices.getDevice(uniqueId);
            if (d === undefined)
                throw new Error('Invalid device ' + uniqueId);

            return { uniqueId: d.uniqueId,
                     name: d.name || "Unknown device",
                     description: d.description || "Description not available",
                     kind: d.kind,
                     ownerTier: d.ownerTier,
                     version: d.constructor.version || 0,
                     isTransient: d.isTransient,
                     isOnlineAccount: d.hasKind('online-account'),
                     isDataSource: d.hasKind('data-source'),
                     isThingEngine: d.hasKind('thingengine-system') }
        });
    }

    checkDeviceAvailable(uniqueId) {
        return _waitReady.then(function() {
            var d = _engine.devices.getDevice(uniqueId);
            if (d === undefined)
                return -1;

            return d.checkAvailable();
        });
    }

    getAppInfos() {
        const feeds = require('./util/feeds');

        return _waitReady.then(function() {
            var apps = _engine.apps.getAllApps();

            return Q.all(apps.map(function(a) {
                return Q.try(function() {
                    if (a.state.$F) {
                        return engine.messaging.getFeedMeta(a.state.$F).then(function(f) {
                            return feeds.getFeedName(engine, f, true);
                        });
                    } else {
                        return null;
                    }
                }).then(function(feed) {
                    var app = { uniqueId: a.uniqueId, name: a.name || "Some app",
                                description: a.description || a.name || "Some app",
                                icon: a.icon || null,
                                isRunning: a.isRunning, isEnabled: a.isEnabled,
                                error: a.error, feedId: a.state.$F || null, feedName: feed };
                    return app;
                });
            }));
        });
    }

    deleteApp(uniqueId) {
        return _waitReady.then(function() {
            var app = _engine.apps.getApp(uniqueId);
            if (app === undefined)
                return false;

            return _engine.apps.removeApp(app).then(() => true);
        });
    }

    setCloudId(cloudId, authToken) {
        if (_engine.devices.hasDevice('thingengine-own-cloud'))
            return false;
        if (!platform.setAuthToken(authToken))
            return false;

        // we used to call loadOneDevice() with thingengine kind, tier: cloud here
        // but is incompatible with syncing the developer key (and causes
        // spurious device database writes)
        // instead we set the platform state and reopen the connection
        platform.getSharedPreferences().set('cloud-id', cloudId);
        _engine.tiers.reopenOne('cloud').done();
        return true;
    }

    setServerAddress(serverHost, serverPort, authToken) {
        if (_engine.devices.hasDevice('thingengine-own-server'))
            return false;
        if (authToken !== null) {
            if (!platform.setAuthToken(authToken))
                return false;
        }

        _engine.devices.loadOneDevice({ kind: 'org.thingpedia.builtin.thingengine',
                                        tier: 'server',
                                        host: serverHost,
                                        port: serverPort,
                                        own: true }, true).done();
        return true;
    }
}
*/

function runEngine() {
    Q.longStackSupport = true;

    // we would like to create the control channel without
    // initializing the platform but we can't because the
    // control channels needs paths and encodings from the platform
    global.platform = require('./platform');
    platform.init().then(function() {
        console.log('GNOME platform initialized');

        /*
        // create the control channel immediately so we free
        // the UI process to go on merrily on it's own
        var controlChannel = new AppControlChannel();

        return controlChannel.open();
        */
    }).then(function() {
        console.log('Control channel ready');

        // finally load the bulk of the code and create the engine
        const Engine = require('thingengine-core');
        const AssistantDispatcher = require('./assistant');

        console.log('Creating engine...');
        _engine = new Engine(global.platform);

        _ad = new AssistantDispatcher(_engine);
        platform.setAssistant(_ad);

        _waitReady = _engine.open();
        _ad.start();
        return _waitReady;
    }).then(function() {
        _running = true;
        if (_stopped)
            return;
        return _engine.run();
    }).catch(function(error) {
        console.log('Uncaught exception: ' + error.message);
        console.log(error.stack);
    }).finally(function() {
        _ad.stop();
        return _engine.close();
    }).catch(function(error) {
        console.log('Exception during stop: ' + error.message);
        console.log(error.stack);
    }).finally(function() {
        console.log('Cleaning up');
        platform.exit();
    }).done();
}

JXMobile('runEngine').registerToNative(runEngine);

