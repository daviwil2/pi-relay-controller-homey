# Espurna over MQTT
This is an app for [Homey](https://homey.app/en-us/) that adds support for selected devices running the excellent [Espurna](https://github.com/xoseperez/espurna) firmware, controlled over MQTT via an MQTT server.
## Supported devices
For my use cases, which are the three (3) options supported by this app, I'm running Espurna on:

- Huacanxing H801 RGB LED controllers
- Itead Sonoff Basic
- Itead Sonoff Dual

The H801 can be run to control either RGB LEDs on channels 1-3 or white LEDs on either channel 4 or 5, selectable from the app's Advanced Settings.

The Sonoff Basic is a single relay in-line power switch and the Sonoff Dual is a dual relay.
## Server
For the server I run [Eclipse Mosquitto™](https://mosquitto.org/) on a Mac mini server (running macOS 11 Big Sur) installed using [Homebrew](https://brew.sh/). Simply install Homebrew then `brew install mosquitto` to install the server. Mosquitto runs well on Linux or even a Raspberry Pi, and other MQTT server options are available: the MQTT client component used in the app is mature, stable and widely used so should connect to almost any server.

When Mosquitto is installed on macOS the configuration is located under Homebrew's Cellar directory. For Mosquitto 2.0.8 on macOS running on Apple Silicon (M1) this will be in `/usr/local/Cellar/mosquitto/2.0.8/etc/mosquitto/mosquitto.conf`. If you're having problems connecting to the server edit this file and add the lines:

```
bind_address <address>
port 1883
listener port 1883
socket_domain ipv4
allow_anonymous true
```

Where `<address>` is the IPv4 address of your server, e.g. `192.168.1.8`.

This allows anonymous connections on the default port of `:1883` over IPv4, listening on the external IPv4 address for the server.

The same basic configuration also works well on Linux systems including Armbian on Raspberry Pis.
## Server configuration
Minimal server configuration is necessary: just the IP address and port number of the MQTT server. The app will pull defaults from the `env.json` file. If you want to use username and password authentication this is supported but SSL connections aren't.
## Still to do in a future release
- The API needs to be added in `api.js`  so that other applications can interact with the devices
- More flow cards
- Additional languages other than English
- Add separate option (driver and assets etc.) for H801s controlling white LEDs: there is no way in a Homey app to dynamically disable a capability so even though you use the Advanced Settings to tell the app that it's controlling white LEDs the colour picker remains in the app
- Support more Espurna devices as my willingness to suffer the interminable wait for items to arrive from Ali Express returns from its current level of zero
## License
Copyright (C) 2019-2021 by David Williamson.

The source code is completely free and released under the [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
# pi-relay-controller-homey
