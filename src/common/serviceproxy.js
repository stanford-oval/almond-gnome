// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2013-2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Gio = imports.gi.Gio;

const SERVICE_INTERFACE = `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
    "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="edu.stanford.Almond.BackgroundService">
    <method name="Stop">
    </method>
    <method name="GetHistory">
      <arg type="a(uuua{ss})" name="history" direction="out" />
    </method>
    <method name="HandleCommand">
      <arg type="s" name="command" direction="in" />
    </method>
    <method name="HandleThingTalk">
      <arg type="s" name="code" direction="in" />
    </method>
    <method name="HandleParsedCommand">
      <arg type="s" name="title" direction="in" />
      <arg type="s" name="json" direction="in" />
    </method>
    <method name="StartOAuth2">
      <arg type="s" name="kind" direction="in" />
      <arg type="(bsa{ss})" name="result" direction="out" />
    </method>
    <method name="HandleOAuth2Callback">
      <arg type="s" name="kind" direction="in" />
      <arg type="s" name="redirect_uri" direction="in" />
      <arg type="a{ss}" name="session" direction="in" />
    </method>
    <method name="CreateSimpleDevice">
      <arg type="s" name="kind" direction="in" />
      <arg type="b" name="ok" direction="out" />
    </method>
    <method name="CreateDevice">
      <arg type="s" name="data" direction="in" />
      <arg type="b" name="ok" direction="out" />
    </method>
    <method name="DeleteDevice">
      <arg type="s" name="uniqueId" direction="in" />
      <arg type="b" name="ok" direction="out" />
    </method>
    <method name="UpgradeDevice">
      <arg type="s" name="kind" direction="in" />
      <arg type="b" name="ok" direction="out" />
    </method>
    <method name="GetDeviceInfos">
      <arg type="aa{sv}" name="devices" direction="out" />
    </method>
    <method name="GetDeviceFactories">
      <arg type="s" name="device_class" direction="in" />
      <arg type="aas{sv}" name="factories" direction="out" />
    </method>
    <method name="GetDeviceInfo">
      <arg type="s" name="uniqueId" direction="in" />
      <arg type="a{sv}" name="device" direction="out" />
    </method>
    <method name="CheckDeviceAvailable">
      <arg type="s" name="uniqueId" direction="in" />
      <arg type="u" name="available" direction="out" />
    </method>
    <method name="GetAppInfos">
      <arg type="aa{sv}" name="apps" direction="out" />
    </method>
    <method name="DeleteApp">
      <arg type="s" name="uniqueId" direction="in" />
    </method>
    <method name="SetCloudId">
      <arg type="s" name="cloudId" direction="in" />
      <arg type="s" name="authToken" direction="in" />
      <arg type="b" name="ok" direction="out" />
    </method>
    <method name="SetServerAddress">
      <arg type="s" name="serverHost" direction="in" />
      <arg type="u" name="serverPort" direction="in" />
      <arg type="s" name="authToken" direction="in" />
      <arg type="b" name="ok" direction="out" />
    </method>
    <method name="GetPreference">
      <arg type="s" name="key" direction="in" />
      <arg type="v" name="value" direction="out" />
    </method>
    <method name="SetPreference">
      <arg type="s" name="key" direction="in" />
      <arg type="v" name="value" direction="in" />
    </method>
    <signal name="NewMessage">
      <arg type="u" name="message_id" />
      <arg type="u" name="message_type" />
      <arg type="u" name="direction" />
      <arg type="a{ss}" name="message" />
    </signal>
    <signal name="RemoveMessage">
      <arg type="u" name="message_id" />
    </signal>
    <signal name="DeviceAdded">
      <arg type="a{sv}" name="device" />
    </signal>
    <signal name="DeviceRemoved">
      <arg type="s" name="unique_id" />
    </signal>
    <signal name="PreferenceChanged">
      <arg type="s" name="key" />
    </signal>
    <signal name="Activate">
    </signal>
    <signal name="VoiceHypothesis">
      <arg type="s" name="hypothesis" />
    </signal>
  </interface>
</node>`;

/* exported Service */
var Service = Gio.DBusProxy.makeProxyWrapper(SERVICE_INTERFACE);
