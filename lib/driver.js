// driver.js used by the driver.js files

'use strict';

const Homey               = require('homey');
const mqtt                = require('mqtt');
const { ManagerSettings } = require('homey'); // get the ManagerSettings object which gives access to the methods to read and write settings

// create a settings object to store the connection information to the MQTT server
var settings = {};

// populate the settings object from Homey's ManagerSettings; these are the app settings that define the MQTT server, credentials, etc.
function _getSettings(){
  var keys = ManagerSettings.getKeys();
  keys.forEach(function(key){
    settings[key] = ManagerSettings.get(key)
  }); // keys.forEach
}; // _getSettings

// add event handler that is fired when server settings change, to repopulate the local object
ManagerSettings.on('set', function(key){
  _getSettings();
}); // ManagerSettings.on

module.exports = class EspurnaOverMQTTDriver extends Homey.Driver {

  /// handlers for homey events fired in the relevant driver.js file

  // socket is passed from the Homey library, type is specified DoubleRelay, SingleRelay or RGBLED
  onPair(socket){

    /// helper functions used exclusively within this function

    // define a function to emit devices during the search; Homey will search for 30 seconds
    function _returnDevices(){

      // itterate over the objects to see if they're app == ESPURNA and if so, if we know enough about them to add them to the array as device objects
      Object.keys(objects).forEach(function(key, index){

        // if it has app == ESPURNA, a host, relay and vcc fields then continue
        if (objects[key]['app'] && objects[key]['app'] == 'ESPURNA' && objects[key]['host'] && objects[key]['relay'] && objects[key]['vcc']){

          // assume it's a valid device
          isValidDevice = true;

          // decide how to proceed based on the type of device specified in type as passed to the parent function _onPair
          // devices are identified based on their properties - ability to change brightness or color, presence of one or two relays, etc.
          switch (type){

            case 'RGBLED':

              // check to see whether it really is an RGBLED controller
              if (!objects[key]['brightness'] || !objects[key]['color'] || !objects[key]['rgb'] || !objects[key]['hsv'] || !objects[key]['channel']){
                isValidDevice = false; // it's lacking the keys for an RGB LED controller so it's probably a switch
              }; // if

              // check to see how many relays it has
              if (objects[key]['relay'] && objects[key]['relay']['1']){
                isValidDevice = false; // it has two or more relays so it's not an RGBLED controller becasue they have only one relay
              }; // if

              break;

            case 'SingleRelay':

              // check to see whether it's an RGBLED controller
              if (objects[key]['brightness'] || objects[key]['color'] || objects[key]['rgb'] || objects[key]['hsv'] || objects[key]['channel']){
                isValidDevice = false; // it's lacking the keys for an RGB LED controller so it's probably a switch
              }; // if

              // check to see if it has a second relay; objects[key]['relay'] will be {'0':'0'} for relay 0 and {'0':'1'} for relay 1
              if (objects[key]['relay']['1']){
                isValidDevice = false; // {'0':'1'} is present so it has at least two relays
              }; // if

              break;

            case 'DoubleRelay':

              // check to see whether it's an RGB LED controller
              if (objects[key]['brightness'] || objects[key]['color'] || objects[key]['rgb'] || objects[key]['hsv'] || objects[key]['channel']){
                isValidDevice = false; // it's lacking the keys for an RGB LED controller so it's probably a switch
              }; // if

              // now check to see if it has a second relay; objects[key]['relay'] will be {'0':'0'} for relay 0 and {'0':'1'} for relay 1
              if (!objects[key]['relay']['1']){
                isValidDevice = false; // it has only one relay, so it's probably a SingleRelay
              }; // if

              break;

          }; // switch

          // if it's actually the device that it is supposed to be...
          if (isValidDevice === true){

            // check to see if this device is already in the array
            index = false; // assume it's not
            for (i = 0; i < devices.length; i++){
              if (devices[i]['name'] == objects[key]['host']){ index = i }
            }; // for

            // if it's not in the array, and it's not already paired, then build an object and push it onto the array
            if (index === false && pairedDevices.indexOf(objects[key]['host']) == -1){
              device = {'data': {'id': objects[key]['vcc']}, 'name': objects[key]['host']};
              devices.push(device);
            }; // if

          }; // if (isValidDevice...

        }; // if (objects[key]...

      }); // Object.keys()

      // now sort the array
      devices.sort(function(a,b){
        if (a.name > b.name){ return 1 };
        if (a.name < b.name){ return -1 };
        return 0; // same
      }); // devices.sort

      // if we're sure the search is complete then we can fire callback(null, devices); but it's hard to know whether
      // we've received all the devices from the MQTT server so best to just .emit with the latest list, even if
      // incomplete, and rely on Homey's 30 second timeout to end the process. The user can select and start the pairing
      // process with a discovered device at any time, so this approach doesn't degrade the user experience

      // return the array of devices to the client by emitting on the WebSocket socket
      // format of the array is [{ data: { id: '1234' }, name: 'foo' }, ...]
      socket.emit('list_devices', devices);

    }; // _returnDevices

    // define a function to close the connection and return the devices to the client
    function _closeConnection(){
      clearInterval(interval); // stop sending the list of devices back to the client every 500ms
      client.end();            // tidy up, close the connection to the MQTT server
    }; // _closeConnection

    // create an object in the array at the correct level of depth, then populate it with the passed value
    function _assign(array, value){

      // ensure the object is populated with the relevant number of objects to a depth of 3, which is the maximum used by Espurna
      if (objects.hasOwnProperty([array[0]]) == false){ objects[array[0]] = {} };
      if ((array.length > 1) && (objects[array[0]].hasOwnProperty([array[1]]) == false)){ objects[array[0]][array[1]] = {} };
      if ((array.length > 2) && (objects[array[0]][array[1]].hasOwnProperty([array[2]]) == false)){ objects[array[0]][array[1]][array[2]] = null };

      // add the data to the object
      if (array.length === 1){ objects[array[0]] = value };
      if (array.length === 2){ objects[array[0]][array[1]] = value };
      if (array.length === 3){ objects[array[0]][array[1]][array[2]] = value };

    }; // _assign

    /// onPair functionality starts here

    // get the type from the function passed in from the device-specific driver file
    this.type = this.getType();

    // validate that type is specified and valid
    if (!this.type || ['RGBLED', 'SingleRelay', 'DoubleRelay'].indexOf(this.type) == -1){
      throw new Error('invalid or missing type passed to onPair in ./lib/driver.js')
    } else {
      this.log('onPair() in /lib/driver.js, pairing started for type '+this.type)
    }; //if

    _getSettings(); // perform initial population of the local object from the ManagerSettings containing the MQTT server connection settings

    const CLOSETIMEOUT = 10000; // ms == seconds * 1000, 10000ms = 10 seconds
    const EMITTIMEOUT  = 1000;  // 1 second

    var devices = []; // define empty array of devices that we'll populate with objects in the prescribed format
    var objects = {}; // create an empty object to store the raw data returned from the MQTT server
    var pairedDevices = []; // to populate with the MQTTtopics of the existing paired devices
    var client, interval, index, i, device, isValidDevice, type, options, existingDevices; // working variables

    type            = this.type;
    options         = {};
    existingDevices = this.getDevices(); // get an array of device objects of all the devices of this type already paired

    // populate the pairedDevices array with MQTTtopics from the existingDevices array of objects
    if (existingDevices.length > 0){
      existingDevices.forEach((item, i) => {
        pairedDevices.push(item.getSettings().MQTTtopic) // item is a Device object so has a getSettings() function, MQTTtopic is defined in the settings for each Device
      }); // .forEach
    }; // if

    // called when the Homey client wants to pair with a new device; socket is passed by Homey and it triggers
    // the event 'list_devices' which then handles connecting to the MQTT server, etc. and returning a list of relevant devices
    socket.on('list_devices', function(data, callback){

      // we should have a server defined, either from the settings or if not default from the env.json file, so start to get devices from MQTT
      if (settings.server){

        // after CLOSETIMEOUT amount of time run the _closeConnection function
        setTimeout(_closeConnection, CLOSETIMEOUT);

        // every EMITTIMEOUT amount of time run the _returnDevices function and store in interval
        interval = setInterval(_returnDevices, EMITTIMEOUT);

        // construct a connection object with credentials, if specified
        if (settings.username){ options.username = username };
        if (settings.password){ options.password = password };

        // try to connect to the MQTT server; if successful then client will emit events that we'll trap and handle below
        client = mqtt.connect('tcp://'+settings.server+':'+settings.port, options);

        // define event handler for MQTT 'connect' events
        client.on('connect', function(){

          // we've successfully connected so subscribe to the root topic
          client.subscribe('#', {}, function(err, granted){
            if (err){
              callback(err, null);  // invoke the callback function passed in socket.on
            }; // if
          }); // client.subscribe

          // define event handler for MQTT 'message' events which are emitted when the client receives a publish packet
          client.on('message', function(topic, message, packet){
            let array = topic.split('/');   // split the string into an array using '/' as the delimiter, first element is the topic
            let value = message.toString(); // message is a Buffer, so convert to string
            _assign(array, value);          // add this value (message) to the object 'objects' that is working storage for discovered MQTT devices
          }); // client.on message

        }); // client.on connect

        // define event handler for MQTT 'error' events
        client.on('error', function(err){
          if (typeof client.end === 'function'){ client.end() }; // as an error was returned so try and tidy up after ourselves and close the connection
          callback(err, null); // invoke the callback function passed in socket.on
        }); // client.on error

      } else {

        throw new Error('MQTT server not specified')

      }; // if (server){

    }); // socket.on('list_devices'...

  }; // onPair

}; // module.exports
