# Almond for GNOME

[![Build Status](https://travis-ci.org/stanford-oval/almond-gnome.svg?branch=master)](https://travis-ci.org/stanford-oval/almond-gnome) [![Gitter](https://img.shields.io/gitter/room/Stanford-Mobisocial-IoT-Lab/Lobby.svg)](https://gitter.im/Stanford-Mobisocial-IoT-Lab/Lobby) [![Discourse status](https://img.shields.io/discourse/https/community.almond.stanford.edu/status.svg)](https://community.almond.stanford.edu)

## An Open Virtual Assistant

This repository contains the GNOME/Gtk platform integration layer for the Almond
Open Virtual Assistant.

Almond is a Virtual Assistant that lets you connect to multiple services and 
devices, while respecting your privacy.
Almond is also the only assistant that supports compound commands, using a powerful experimental deep-learning semantic parser. ([What are compound commands?](https://almond.stanford.edu/#section-commandpedia))

Almond comes in various form:

- As a phone app, for Android
- As an installable app for a home server
- As a web service hosted at <https://almond.stanford.edu>
- A GTK+/GNOME app for desktops (this repository)

Almond is a research project led bf prof. Monica Lam, in the [Stanford University Open Virtual Assistant Lab](https://oval.cs.stanford.edu).  You can find more
information at <https://almond.stanford.edu>.

## Installation

### Flatpak

Flatpak is the recommended way to install Almond. The latest stable version is available on [Flathub](https://flathub.org/apps/details/edu.stanford.Almond).

To install the latest development version of Almond, use:
```
flatpak remote-add almond-nightly --from https://flatpak.almond.stanford.edu/almond-nightly.flatpakrepo
flatpak install edu.stanford.Almond//master
```

### Building from Source

To build Almond from source, you should use `flatpak-builder`:

```
flatpak-builder --install --install-deps-from=flathub _app edu.stanford.Almond.json
```

This will automatically build and install all the dependencies, and install the Almond app.

Alternatively, you can use [GNOME Builder](https://flathub.org/apps/details/org.gnome.Builder) as the IDE.
GNOME Builder has native support for flatpaks. Opening the cloned repository with GNOME Builder will allow
you to build and run Almond by pressing "play".

## Usage

Almond is a virtual assistant: it takes natural language commands, interprets them, and displays the result.
The set of supported commands is defined in [Thingpedia](https://thingpedia.stanford.edu), and roughly
covers web services, news services, and some Internet-of-Things devices.

Voice support is available as well: once opened the first time, an always listening background service
can recognize voice input and reply. The default hotword is "Almond".
You can disable voice input or voice output from the app settings. 

Additional user documentation is available on the [Almond website](https://almond.stanford.edu).

NOTE: Almond uses [Genie](https://github.com/stanford-oval/genie-toolkit) for its natural language understanding
component. Genie is an experimental deep-learning based semantic parsing toolkit. While it can understand a much larger space
of commands, including notifications and complex queries, it can also behave erratically if you type commands that are not
in Thingpedia. Please avoid "chatting" with Almond, it will only lead to frustration. 

## Contributing

Have you found a bug? A new feature? A better voice model? More skills? Almond welcomes your help!
Please look at [the contribution guide](CONTRIBUTING.md) for details, and don't hesitate to reach out to us
on our [community forum](https://community.almond.stanford.edu).

## License

Almond is free software, and is distributed under the GNU General Public License, version 3 or later.
See [LICENSE](LICENSE) for details.

