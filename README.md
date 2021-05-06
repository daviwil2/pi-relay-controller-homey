# Pi Relay Controller for Homey
This is an app for [Homey](https://homey.app/en-us/) that works with the [Pi Relay Controller Server](https://github.com/daviwil2/pi-relay-controller-server) over gRPC calls.

## How to install
Install from the command line using ```homey app install```.

## Discovery and Pairing
The server is discovered using MDNS. For networks or subnets where MDNS isn't supported the app can be installed on the Homey in the normal way and the IP address and port number of the server manually entered in the app's settings; where this is present it will be used in preference to the MDNS lookup.

## Functionality
Each relay can be renamed in the device's settings as normally and those changes will be written to the server and stored in the database, which allows renames and state changes to persist over reinstallations of the Homey client app.

## License
Copyright (C) 2019-2021 by David Williamson.

The source code is completely free and released under the [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) license.
