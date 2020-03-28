// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// Copyright 2013-2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const GLib = imports.gi.GLib;
const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Soup = imports.gi.Soup;

const { AssistantModel, Direction, MessageType } = imports.common.chatmodel;
const { ginvoke, gpromise } = imports.common.util;

function makeAlmondWrapper(msg) {
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        halign: Gtk.Align.START
    });
    box.get_style_context().add_class('message-container');
    const icon = new Gtk.Image({
        pixel_size: 48,
        valign: Gtk.Align.START
    });
    window.getApp().cache.cacheIcon(msg.icon).then((gicon) => icon.gicon = gicon).catch(logError);
    box.show();
    icon.show();
    box.pack_start(icon, false, true, 0);

    return box;
}

function makeGenericWrapper(msg) {
    var box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL,
                            spacing: 12 });
    box.get_style_context().add_class('message-container');
    return box;
}

const ResizableImage = GObject.registerClass({
    Properties: {
        full_size_pixbuf: GObject.ParamSpec.object('full-size-pixbuf', '', '', GObject.ParamFlags.READWRITE,
            GdkPixbuf.Pixbuf)
    }
}, class AlmondResizableImage extends Gtk.Widget {
    _init(params) {
        this._percent = 1;
        this._full_size_pixbuf = null;
        super._init(params);

        this._cached_pixbuf = null;
        this.set_has_window(false);
    }

    get full_size_pixbuf() {
        return this._full_size_pixbuf;
    }
    set full_size_pixbuf(v) {
        this._full_size_pixbuf = v;
        this.queue_resize();
        this.get_toplevel().queue_resize();
    }

    vfunc_draw(cr) {
        if (!this._full_size_pixbuf)
            return;
        let allocation = this.get_allocation();
        let availwidth = allocation.width;
        let availheight = allocation.height;

        let drawwidth, drawheight;
        let drawx, drawy;
        if (availwidth < this._full_size_pixbuf.width * availheight / this._full_size_pixbuf.height) {
            drawwidth = availwidth;
            drawheight = availwidth / this._full_size_pixbuf.width * this._full_size_pixbuf.height;
            drawx = 0;
            drawy = (availheight - drawheight)/2;
        } else {
            drawheight = availheight;
            drawwidth = availheight / this._full_size_pixbuf.height * this._full_size_pixbuf.width;
            drawy = 0;
            drawx = (availwidth - drawwidth)/2;
        }
        drawwidth = Math.round(drawwidth);
        drawheight = Math.round(drawheight);

        if (!this._cached_pixbuf || this._cached_pixbuf.width !== drawwidth ||
            this._cached_pixbuf.height !== drawheight)
            this._cached_pixbuf = this._full_size_pixbuf.scale_simple(drawwidth, drawheight, GdkPixbuf.InterpType.BILINEAR);

        Gdk.cairo_set_source_pixbuf(cr, this._cached_pixbuf, drawx, drawy);
        cr.rectangle(drawx, drawy, drawwidth, drawheight);
        cr.fill();
    }

    vfunc_get_request_mode() {
        return Gtk.SizeRequestMode.HEIGHT_FOR_WIDTH;
    }
    vfunc_get_preferred_width() {
        if (!this._full_size_pixbuf)
            return [1,1];
        const natsize = this._full_size_pixbuf.width;
        const minsize = Math.min(natsize, 640);

        return [minsize, natsize];
    }
    vfunc_get_preferred_height_for_width(forWidth) {
        if (!this._full_size_pixbuf)
            return [1,1];
        const natwidth = this._full_size_pixbuf.width;
        const rescaleratio = forWidth / natwidth;
        const natheight = this._full_size_pixbuf.height * rescaleratio;

        const [minwidth, ] = this.vfunc_get_preferred_width();
        const minheight = this._full_size_pixbuf.height * (minwidth / natwidth);

        return [minheight, natheight];
    }
    vfunc_get_preferred_height() {
        if (!this._full_size_pixbuf)
            return [1,1];
        const [minwidth, natwidth] = this.vfunc_get_preferred_width();
        const natheight = this._full_size_pixbuf.height;
        const minheight = this._full_size_pixbuf.height * (minwidth / natwidth);

        return [minheight, natheight];
    }
    vfunc_get_preferred_width_for_height(forHeight) {
        if (!this._full_size_pixbuf)
            return [1,1];
        const natheight = this._full_size_pixbuf.height;
        const rescaleratio = forHeight / natheight;

        const [minwidth, ] = this.vfunc_get_preferred_width();
        const natwidth = Math.max(minwidth, this._full_size_pixbuf.width * rescaleratio);
        return [minwidth, natwidth];
    }

    vfunc_size_allocate(alloc) {
        super.vfunc_size_allocate(alloc);
    }
});

const MessageConstructors = {
    [MessageType.TEXT](msg) {
        let label;
        let box;
        if (msg.direction === Direction.FROM_ALMOND) {
            box = makeAlmondWrapper(msg);
            label = new Gtk.Label({
                wrap: true,
                selectable: true,
                hexpand: true,
                halign: Gtk.Align.START,
                xalign: 0 });
            label.get_style_context().add_class('from-almond');
        } else {
            box = makeGenericWrapper(msg);
            label = new Gtk.Label({
                wrap: true,
                selectable: true,
                hexpand: true,
                halign: Gtk.Align.END,
                xalign: 1 });
            label.get_style_context().add_class('from-user');
        }
        label.get_style_context().add_class('message');
        msg.bind_property('text', label, 'label', GObject.BindingFlags.SYNC_CREATE);
        label.show();
        box.pack_start(label, true, true, 0);
        return box;
    },

    [MessageType.PICTURE](msg) {
        const box = makeAlmondWrapper(msg);
        const frame = new Gtk.Frame({
            shadow_type: Gtk.ShadowType.NONE,
            halign: Gtk.Align.START
        });
        frame.get_style_context().add_class('message');
        frame.get_style_context().add_class('from-almond');
        const spinner = new Gtk.Spinner({
            visible: true,
        });
        spinner.start();

        let file = Gio.File.new_for_uri(msg.picture_url);
        ginvoke(file, 'read_async', 'read_finish', GLib.PRIORITY_DEFAULT, null).then((stream) => {
            return gpromise(GdkPixbuf.Pixbuf.new_from_stream_async, GdkPixbuf.Pixbuf.new_from_stream_finish, stream, null);
        }).then((pixbuf) => {
            const image = new ResizableImage({
                full_size_pixbuf: pixbuf,
            });
            spinner.destroy();
            frame.add(image);
            image.show();
        }).catch((e) => {
            log('Failed to load image at ' + msg.picture_url + ': ' + e);
            spinner.stop();
        });
        frame.show();
        frame.add(spinner);
        box.pack_start(frame, true, true, 0);
        return box;
    },

    [MessageType.CHOICE](msg, service, window) {
        const box = makeGenericWrapper(msg);
        const button = new Gtk.Button({
            halign: Gtk.Align.CENTER,
            hexpand: true });
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.show();
        button.connect('clicked', () => {
            window.handleChoice(msg.choice_idx, msg.text);
        });
        box.pack_start(button, true, true, 0);
        return box;
    },

    [MessageType.LINK](msg, service, window) {
        // A LINK message is an internal navigation button that is represented
        // as URL (for ease of implementation in web based UIs)
        // we remap it to window actions

        const box = makeGenericWrapper(msg);
        const button = new Gtk.Button({
            halign: Gtk.Align.CENTER,
            hexpand: true });
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.show();

        if (msg.link === '/user/register') {
            // ??? we are not anonymous, this should never happen
            throw new Error('Invalid link asking the user to register');
        } else if (msg.link === '/thingpedia/cheatsheet') {
            button.on('clicked', () => {
                Gtk.show_uri_on_window(window, 'https://almond.stanford.edu' + msg.link,
                                       Gtk.get_current_event_time());
            });
        } else if (msg.link === '/apps') {
            button.set_detailed_action_name('win.switch-to::page-my-stuff');
        } else if (msg.link === '/devices/create') {
            button.action_name = 'win.new-device';
        } else if (msg.link.startsWith('/devices/oauth2/')) {
            // "parse" the link in the context of a dummy base URI
            let uri = Soup.URI.new_with_base(Soup.URI.new('https://invalid'), msg.link);
            let kind = uri.get_path().substring('/devices/oauth2/'.length);
            let query = Soup.form_decode(uri.get_query());
            button.action_name = 'win.configure-device-oauth2';
            button.action_target = new GLib.Variant('(ss)', [kind, query.name||'']);
        } else {
            log('WARNING: unexpected link to ' + msg.link);
        }

        box.pack_start(button, true, true, 0);
        return box;
    },

    [MessageType.BUTTON](msg, service, window) {
        const box = makeGenericWrapper(msg);
        const button = new Gtk.Button({
            halign: Gtk.Align.CENTER,
            hexpand: true });
        msg.bind_property('text', button, 'label', GObject.BindingFlags.SYNC_CREATE);
        button.show();
        button.connect('clicked', () => {
            window.handleParsedCommand(msg.json, msg.text);
        });
        box.pack_start(button, true, true, 0);
        return box;
    },

    [MessageType.ASK_SPECIAL](msg, service, window) {
        if (msg.ask_special_what === 'yesno') {
            const box = makeGenericWrapper(msg);
            const button_box = new Gtk.ButtonBox({
                layout_style: Gtk.ButtonBoxStyle.CENTER,
                hexpand: true });

            const yes = new Gtk.Button({
                label: _("Yes"),
                halign: Gtk.Align.CENTER,
                hexpand: true
            });
            yes.show();
            yes.connect('clicked', () => {
                window.handleSpecial('yes');
            });
            button_box.add(yes);

            const no = new Gtk.Button({
                label: _("No"),
                halign: Gtk.Align.CENTER,
                hexpand: true
            });
            no.show();
            no.connect('clicked', () => {
                window.handleSpecial('no');
            });
            button_box.add(no);

            button_box.show();
            box.pack_start(button_box, true, true, 0);
            return box;
        } else if (msg.ask_special_what === 'picture') {
            const box = makeGenericWrapper(msg);

            const filter = new Gtk.FileFilter();
            filter.add_mime_type('image/*');

            const preview = new Gtk.Image();
            const button = new Gtk.FileChooserButton({
                filter: filter,
                local_only: true,
                title: _("Select a Picture"),
                preview_widget: preview,
                halign: Gtk.Align.CENTER,
                hexpand: true,
            });
            button.connect('update-preview', (button) => {
                let filename = button.get_preview_filename();
                if (filename) {
                    preview.file = filename;
                    button.preview_widget_active = true;
                } else {
                    button.preview_widget_active = false;
                }
            });
            button.show();
            button.connect('file-set', () => {
                window.handleParsedCommand(JSON.stringify({
                    code: ['bookkeeping', 'answer', 'PICTURE_0'],
                    entities: {
                        PICTURE_0: button.get_uri()
                    }
                }), button.get_file().get_basename());
            });
            box.pack_start(button, true, true, 0);
            return box;
        } else {
            // do something else
            throw new Error('unhandled ask-special type ' + msg.ask_special_what);
        }
    },

    [MessageType.RDL](msg) {
        const box = makeAlmondWrapper(msg);
        const vbox = new Gtk.Box({
            halign: Gtk.Align.START,
            orientation: Gtk.Orientation.VERTICAL,
        });
        vbox.get_style_context().add_class('message');
        vbox.get_style_context().add_class('from-almond');

        let text = `<a href="${GLib.markup_escape_text(msg.rdl_callback, -1)}">${GLib.markup_escape_text(msg.text, -1)}</a>`;
        if (msg.rdl_description)
            text += '\n' + GLib.markup_escape_text(msg.rdl_description, -1);
        const label = new Gtk.Label({
            wrap: true,
            selectable: true,
            hexpand: true,
            halign: Gtk.Align.START,
            xalign: 0,
            label: text,
            use_markup: true });
        label.show();
        vbox.add(label);

        if (msg.picture_url) {
            const spinner = new Gtk.Spinner({
                visible: true,
            });
            spinner.start();

            let file = Gio.File.new_for_uri(msg.picture_url);
            ginvoke(file, 'read_async', 'read_finish', GLib.PRIORITY_DEFAULT, null).then((stream) => {
                return gpromise(GdkPixbuf.Pixbuf.new_from_stream_async, GdkPixbuf.Pixbuf.new_from_stream_finish, stream, null);
            }).then((pixbuf) => {
                const image = new ResizableImage({
                    full_size_pixbuf: pixbuf,
                });
                spinner.destroy();
                vbox.add(image);
                image.show();
            }).catch((e) => {
                log('Failed to load image at ' + msg.picture_url + ': ' + e);
                spinner.stop();
            });
            vbox.add(spinner);
        }
        vbox.show();
        box.pack_start(vbox, true, true, 0);
        return box;
    }
};

/* exported bindChatModel */
function bindChatModel(window, service, listbox) {
    let model = new AssistantModel(service);

    listbox.bind_model(model.store, (msg) => {
        let widget = MessageConstructors[msg.message_type](msg, service, window);
        widget.show();
        let row;
        if (!(widget instanceof Gtk.ListBoxRow)) {
            row = new Gtk.ListBoxRow({
                activatable: false,
                visible: true
            });
            row.add(widget);
        } else {
            row = widget;
        }
        return row;
    });
    return model;
}
/*
function bindChatModel(window, service, listbox) {
    let model = new AssistantModel(service);

    function addMessage(msg, position) {
        let widget = MessageConstructors[msg.message_type](msg, service, window);
        listbox.pack_start(widget, false, false, 0);
        listbox.reorder_child(widget, position);
    }
    function addMessages(from, to) {
        for (let i = from; i < to; i++)
            addMessage(model.store.get_item(i), i);
    }
    let messages = [];

    model.store.connect('items-changed', (store, position, removed, added) => {
        if (removed > 0) {
            for (let msg of messages.splice(position, removed)) {
                if (msg.actor)
                    msg.actor.destroy();
            }
        }
        if (added > 0)
            addMessages(position, position+added);
    });

    addMessages(0, model.store.get_n_items());
    return model;
}
*/
