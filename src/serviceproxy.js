// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2013-2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Params = imports.params;

const Util = imports.util;

const SERVICE_INTERFACE = `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
    "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="edu.stanford.Almond.BackgroundService">
    <method name="Stop">
    </method>
    <method name="GetHistory">
      <arg type="a(uua{ss})" name="history" direction="out" />
    </method>
    <method name="HandleCommand">
      <arg type="s" name="command" direction="in" />
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
      <arg type="a{sv}" name="request" direction="in" />
      <arg type="b" name="ok" direction="out" />
    </method>
    <method name="CreateDevice">
      <arg type="a{sv}" name="state" direction="in" />
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
    <signal name="NewMessage">
      <arg type="u" name="message_type" />
      <arg type="u" name="direction" />
      <arg type="a{ss}" name="message" />
    </signal>
  </interface>
</node>`;

const Service = Gio.DBusProxy.makeProxyWrapper(SERVICE_INTERFACE);
