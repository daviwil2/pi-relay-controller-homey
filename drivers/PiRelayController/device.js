// device.js for pi-relay-controller

'use strict';

const Homey               = require('homey');
const { ManagerSettings } = require('homey'); // get the ManagerSettings object which gives access to the methods to read and write settings
const grpc                = require('@grpc/grpc-js');
const protoLoader         = require('@grpc/proto-loader');

/// declare variables

var settings         = {}; // object to hold the server (App, not device) settings retrieved from the Homey ManagerSettings API; these are not the per-device Advanced Settings
var advancedSettings = {}; // object to hold the per-device Advanced Settings
var client;                // gRPC client instance

// populate the settings object from Homey's ManagerSettings; these are the app settings that define the IP address of the server, connection type etc.
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

module.exports = class PiRelayController extends Homey.Device {

  /// helper functions

  _log(message){
    if (process.env.DEBUG === '1'){ this.log(message) }
  }; // _log

  _connectClient(){

    // if we don't have a client object on which to execute the gRPC calls, create it
    if (!client){
      this._log('trying to open insecure gRPC connection to '+settings.address+':'+settings.port);
      client = new this.stub(settings.address+':'+settings.port, grpc.credentials.createInsecure());
    }; // if

  }; // _connectClient

  _validateData(name, data){

    if (['SetRelay', 'RenameRelay'].indexOf(name) === -1){ return new Error('invalid name passed to _validateData') };

    let array = (name === 'setRelay') ? ['timestamp', 'relay', 'succeeded', 'state'] : ['timestamp', 'relay', 'succeeded'];

    array.forEach((property) => { if (data.hasOwnProperty(property) === false){ return false } });
    if (!data.timestamp.seconds || !data.timestamp.seconds.low || typeof data.timestamp.seconds.low !== 'number'){ return false };

    return true; // if we've got here then all tests passed

  }; // _validateDataFromSetRelay

  _unixEpochToISOString(seconds){

    let milliseconds = seconds * 1000;
    let timestamp = new Date(milliseconds);
    return(timestamp.toISOString());

  }; // _unixEpochToISOString

  /// perform device actions via the gRPC connection

  _setCapabilityOnOff(value, opts){

    return new Promise(function(resolve, reject){

      this._connectClient();

      let stateText = (value === false) ? 'off' : 'on' ;

      // make the gRPC call
      this._log('calling client.SetRelay() to set relay '+opts['relay'].toString()+' to '+stateText);
      client.SetRelay({relay: opts.relay, state: value}, (err, data) => {
        if (err){

          this._log('error calling client.SetRelay(): '+err.message);
          return reject(err);

        } else {

          if (this._validateData('SetRelay', data) === false){
            return reject(new Error('invalid data object returned from setRelay()'))
          }; // if

          // manually extract the unix epoch timestamp from the returned data object; ideally this should be done via the package
          // google.protobuf.Timestamp from google/protobuf/timestamp.proto but this isn't installed by either of the grpc-js or proto-loader modules
          let timestamp = this._unixEpochToISOString(data.timestamp.seconds.low);

          this._log('received a well-formed response from setRelay() over gRPC at ' + timestamp);

          // trap for failure on the server
          if (data.succeeded === false){
            this.setCapabilityValue('onoff', !data.state).then(() => {
              this._log('failed to set state of relay '+data.relay.toString()+' to '+stateText)
              return reject(new Error('server failed to set state of relay '+data.relay.toString()));
            }).catch((err) => {});
          }; // if

          // set the state in Homey
          this.setCapabilityValue('onoff', data.state).then(() => {
            this._log('successfully set state of relay '+data.relay.toString()+' to '+stateText)
          }).catch((err) => {});
          return resolve();

        }; // if
      }); // client.GetRelays

      return resolve(null)

    }.bind(this)); // return new Promise

  }; // _setCapabilityOnOff

  _renameRelay(newName){

    return new Promise(function(resolve, reject){

      this._connectClient(); // ensure we have a gRPC client

      let relay = this.getData().id;

      // make the gRPC call
      this._log('calling client.RenameRelay() for relay '+relay.toString()+' to \''+newName+'\'');

      // call the rename function over gRPC, returns {timestamp, relay, succeeded}
      client.RenameRelay({relay: relay, newName: newName}, (err, data) => {

        if (err){

          this._log('error calling client.RenameRelay(): '+err.message);
          return reject(err);

        } else {

          if (this._validateData('RenameRelay', data) === false){
            return reject(new Error('invalid data object returned from client.RenameRelay()'))
          }; // if

          // manually extract the unix epoch timestamp from the returned data object; ideally this should be done via the package
          // google.protobuf.Timestamp from google/protobuf/timestamp.proto but this isn't installed by either of the grpc-js or proto-loader modules
          let timestamp = this._unixEpochToISOString(data.timestamp.seconds.low);

          this._log('received a well-formed response from client.RenameRelay() over gRPC at ' + timestamp);

          // trap for failure on the server
          if (data.succeeded === false){
            this._log('failed to rename relay '+relay.toString());
            return reject(new Error('server failed to rename relay '+relay+' to \''+newName+'\''));
          } else {
            this._log('successfully renamed relay '+relay.toString()+' to \''+newName+'\'');
            return resolve(null);
          }; // if

        }; // if

      }); // client.RenameRelay

    }.bind(this)); // return new Promise

  }; //_renameRelay

  /// handlers for events generated by Homey

  // called when the Device is loaded and properties such as name, capabilities and state are available
  onInit(){

    this._log('onInit() called in device.js');

    _getSettings(); // populate the settings object with app settings: {address: '192...', port: '50051'}

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
    this.stub = protoDescriptor.com.github.daviwil2.grpc.v1.PiRelayService; // store the gRPC stub in this so we can access it in capability handlers

    this._connectClient(); // ensure we have a gRPC client

    let name         = this.getName();
    let relay        = this.getData().id;

    // register a capability listener to reach to changes in state (on/off) in the Homey UI
    this._log('registering capability listener in onInit() in device.js');
    this.registerCapabilityListener('onoff', async(value, opts) => {
      opts.relay =  relay;
      opts.name  = name;
      this._setCapabilityOnOff.call(this, value, opts).then(() => {}).catch((err) => { this._log(err.message) });
    }); // onoff
    this._log('registered capability listener');

    // make this device available in Homey
    this.setAvailable().then(() => { this._log('relay '+relay.toString()+' set as available') }).catch((err) => {});

    // set the current state of each relay
    this._log('calling client.GetRelays() for relay '+relay.toString()+' over insecure gRPC connection');
    client.GetRelays({relay: relay}, (err, data) => {

      if (err){
        this._log('error calling getRelays() over insecure gRPC connection to '+settings.address+':'+settings.port);
        process.exit(0);
      } else {
        let obj = data.piRelays[0]; // get the first, and only, item in the array of relays returned over gRPC
        let stateText = (obj.state === true) ? 'on' : 'off' ;
        this.setCapabilityValue('onoff', obj.state)
          .then(() => { this._log('relay '+relay.toString()+' initial state set as '+stateText) })
          .catch((err) => { this._log('error returned when setting initial state: '+err.message) });
      }; // if

    }); // client.GetRelays

  }; // onInit

  // called when the user renames the device
  onRenamed(newName){
    this._renameRelay(newName).then(() => {
      this._log('successfully saved the new name via gRPC call')
    }).catch((err) => {
      this._log('error saving new name: '+err.message)
    }); // this._renameRelay
  }; // onRenamed

}; // module.exports
