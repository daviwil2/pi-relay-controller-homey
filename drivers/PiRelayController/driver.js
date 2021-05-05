// ./drivers/PiRelayController/driver.js for pi-relay-controller

// drivers are the parent of devices; that is you have one driver that can have multiple child device instances
// in this case we have one driver, for a pi-relay-controller, which will support multiple devices where one device
// is one relay, each sb-electronics pi relay board having four (4) relays

'use strict';

const Homey               = require('homey');
const { ManagerSettings } = require('homey'); // get the ManagerSettings object which gives access to the methods to read and write app settings
const grpc                = require('@grpc/grpc-js');
const protoLoader         = require('@grpc/proto-loader');

const CLOSETIMEOUT        = 30000; // ms == seconds * 1000, 30 seconds
const EMITTIMEOUT         = 1000;  // 1 second

var client;

module.exports = class PiRelayController extends Homey.Driver {

  /// helper functions

	_log(message){
		if (process.env.DEBUG === '1'){ this.log(message) }
	}; // _log

  /// handlers for homey events fired in the relevant driver.js file

  // socket is passed from the Homey library, type is specified DoubleRelay, SingleRelay or RGBLED
  onPair(session){

    /// helper functions used exclusively within this function

    function _emitDevices(session){

      // if we have 2 or more devices to return, sort them alphabetically
      if (devices.length > 1){
        devices.sort(function(a, b){
          if (a.name > b.name){ return 1 };
          if (a.name < b.name){ return -1 };
          return 0; // same
        }); // devices.sort
      }; // if

      session.emit('list_devices', devices);

    }; // _emitDevices

    // data is the payload returned from the gRPC call, devices is the local array passed by reference
    function _processResponseFromGetRelays(data, devices){
      if (data && data.piRelays){
        this._log('data for '+data.piRelays.length+' relays returned');
        data.piRelays.forEach(obj => {
          if (!devices.find((device) => { return device.name === obj.name && device.data.id === obj.relay})){
            this._log('adding relay name \'' + obj.name + '\' id ' + obj.relay + ' to the devices array');
            devices.push( {name: obj.name, data: {id: obj.relay}} ); // see https://apps-sdk-v3.developer.athom.com/tutorial-Drivers-Pairing.html
          }; // if
        }); // .forEach
      }; // if
    }; // _processResponseFromGetRelays

    /// onPair functionality starts here

    this._log('onPair() in /lib/driver.js, pairing started');

    let devices         = []; // define empty array of devices that we'll populate with objects in the prescribed format
    // let pairedDevices   = []; // to populate with existing paried devices so we don't get duplicates

    const discoveryStrategy = this.getDiscoveryStrategy();
    let discoveryResults;

    // called when the Homey client wants to pair with a new device; socket is passed by Homey and it triggers
    // the event 'list_devices' which then handles looking for the relevant devices etc. and returning a list of them
    session.on('list_devices', function(data, callback){

      // every EMITTIMEOUT amount of time sort the devices array then emit it back to the client, storing the interval so we can clear it later
      this._log('setting interval to emit list_devices every '+EMITTIMEOUT+'ms');
      this.interval = setInterval(_emitDevices.bind(this, session), EMITTIMEOUT);

      // after CLOSETIMEOUT amount of time run the function to close everything down and emit a final list of devices
      this._log('setting timeout to close connection after '+CLOSETIMEOUT+'ms');
      setTimeout(() => {
        if (this.interval){
          this._log('setTimeout fired as connection period limit reached and this.interval is truthy');
          clearTimeout(this.interval);
          _emitDevices.call(this, session);
          return;
        }; // if
      }, CLOSETIMEOUT); // setTimeout

      // check to see if we already have a valid IPv4 address and port number for this driver
      let address = (ManagerSettings.get('address')) ? ManagerSettings.get('address') : null ;
      let port    = (ManagerSettings.get('port'))    ? ManagerSettings.get('port')    : null ;
      let haveSettings = (address !== null && port !== null) ? true : false ;

      discoveryResults = discoveryStrategy.getDiscoveryResults();

      if (haveSettings){ this._log('server address and port retrieved from app settings') };
      if (!haveSettings && discoveryResults.hasOwnProperty('pi-relay')){ this._log('found MDNS advertisement, extract server address and port') };

      if (discoveryResults.hasOwnProperty('pi-relay') || haveSettings){

        // if we don't already have the settings for the server then...
        if (!haveSettings){

          //  ...extract them from the MDNS advertising fields...
          address = discoveryResults['pi-relay']['txt']['ip'];
          port    = discoveryResults['pi-relay']['txt']['port'];

          // ...and store them in the Homey application settings accessible via the ManagerSettings API so we can use them next time
          ManagerSettings.set('address', address);
          ManagerSettings.set('port', port);

          this._log('saved server address '+address+' and port '+port+' to Homey app settings');

        }; // if

        // build the gRPC API
        const PROTO_PATH = '../../com/github/daviwil2/grpc/v1/service.proto'; // this is the master protobuf file that loads all the dependent files
        let packageDefinition = protoLoader.loadSync(
          PROTO_PATH,
          { keepCase: true, // preserve field names, don't convert to camelCase
            longs: 'String',
            enums: 'String',
            defaults: true,
            oneofs: true
          }
        ); // var packageDefinition
        let protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
        let stub = protoDescriptor.com.github.daviwil2.grpc.v1.PiRelayService;

        this._log('trying to open insecure gRPC connection to '+address+':'+port);
        client = new stub(address+':'+port, grpc.credentials.createInsecure());

        this._log('calling client.getRelays() over insecure gRPC connection');
        client.getRelays({}, (err, data) => {
          if (err){
            this._log('error calling getRelays() over insecure gRPC connection to '+address+':'+port);
            process.exit(0);
          } else {
            _processResponseFromGetRelays.call(this, data, devices);
          }; // if
        }); // client.getRelays

      }; // if

    }.bind(this)); // list_devices

  }; // onPair

}; // module.exports
