'use strict';

const core = require("@iobroker/adapter-core");
const mqtt = require("mqtt");
const utils = require("./lib/utils");
const constant = require("./lib/constants");
const dmZwave  = require('./lib/devicemgmt.js');

const adapterInfo = require("./lib/messages").adapterInfo;
const StatesController = require("./lib/statesController").StatesController;
const WebsocketController = require('./lib/websocketController').WebsocketController;
const Helper = require("./lib/helper").Helper;

const MqttServerController = require("./lib/mqttServerController").MqttServerController;

let mqttClient;
let deviceCache = {};
let websocketController;
let mqttServerController;
let statesController;
let helper;
let messageParseMutex = Promise.resolve();
let options = {};
let startListening = false;
let allNodesCreated = false;

let driver;
let controller;
let allNodes;
let eventTyp;


class zwavews extends core.Adapter {
  constructor(options) {
    super({
      ...options,
      name: "zwavews",
    });
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }

  async onReady() {
    statesController = new StatesController(this);

    // Initialize your adapter here
    adapterInfo(this.config, this.log);

    this.setStateChanged("info.connection", false, true);
    await statesController.setAllAvailableToFalse();

    helper = new Helper(this, deviceCache);

    this.deviceManagement = new dmZwave(this);

    if (this.config.wsOnStart) {
        this.setStateChanged("info.sendMessageAllowed", true, true);
    }

    this.nodeCache = {};
    this.setStateChanged("info.debugmessages", "", true);


    // MQTT
    if (["exmqtt", "intmqtt"].includes(this.config.connectionType)) {
      // External MQTT-Server
      if (this.config.connectionType === "exmqtt") {
        if (this.config.externalMqttServerIP === "") {
          this.log.warn(
            "Please configure the External MQTT-Server connection!",
          );
          return;
        }

        // MQTT connection settings
        const mqttClientOptions = {
          clientId: `ioBroker.zwavews_${Math.random().toString(16).slice(2, 8)}`,
          clean: false,
          protocolVersion: 4,
          reconnectPeriod: 5000,
          connectTimeout: 30000,  // 30s
          keepalive: 30,
          resubscribe: true,
        };

        // Set external mqtt credentials
        if (this.config.externalMqttServerCredentials === true) {
          mqttClientOptions.username = this.config.externalMqttServerUsername;
          mqttClientOptions.password = this.config.externalMqttServerPassword;
        }

        // Init connection
        mqttClient = mqtt.connect(
          `mqtt://${this.config.externalMqttServerIP}:${this.config.externalMqttServerPort}`,
          mqttClientOptions,
        );
      } else {
        // Internal MQTT-Server
        mqttServerController = new MqttServerController(this);
        await mqttServerController.createMQTTServer();
        await this.delay(1500);
        mqttClient = mqtt.connect(
          `mqtt://${this.config.mqttServerIPBind}:${this.config.mqttServerPort}`,
          {
            clientId: `ioBroker.zwavews_${Math.random().toString(16).slice(2, 8)}`,
            clean: true,
            reconnectPeriod: 500,
          },
        );
      }

      // MQTT Client
      mqttClient.on("connect", () => {
        this.log.info(`Connect to zwavews over ${this.config.connectionType === "exmqtt" ? "external mqtt" : "internal mqtt"} connection.`);
        this.setStateChanged("info.connection", true, true);
      });

      mqttClient.subscribe(`${this.config.baseTopic}/#`, (err) => {
        if (err) {
this.log.error(`<zwavews> MQTT subscribe error: ${err.message}`);
}
      });

      mqttClient.on("message", (topic, payload) => {
        const rawPayload = payload.toString();
        let parsedPayload;
        try {
          parsedPayload = rawPayload === "" ? null : JSON.parse(rawPayload);
        } catch {
          parsedPayload = rawPayload;
        }
        const newMessage = JSON.stringify({
          payload: parsedPayload,
          topic: topic.slice(topic.indexOf("/") + 1),
        });
        this.messageParse(newMessage);
      });
    } else if (this.config.connectionType === 'ws') {
    // Websocket
            if (this.config.wsServerIP === '') {
                this.log.warn('Please configure the Websoket connection!');
                return;
            }

            // Dummy MQTT-Server
            if (this.config.dummyMqtt === true) {
                mqttServerController = new MqttServerController(this);
                await mqttServerController.createDummyMQTTServer();
                this.setStateChanged("info.connection", true, true);
                await this.delay(1500);
            }

            this.startWebsocket();
        }
  }
  
  startWebsocket() {
      websocketController = new WebsocketController(this);
      const wsClient = websocketController.initWsClient();

      if (!wsClient) {
          this.log.error('<zwavews> initWsClient returned null — websocket not started.');
          return;
      }

      wsClient.on('open', () => {
          this.log.info('Connect to zwave-js-ui over websocket connection.');
          startListening = true;
          websocketController.send(JSON.stringify({command: "start_listening"}));
      });

      wsClient.on('message', (message) => {
          this.messageParse(message);
      });

      wsClient.on('close', async () => {
          this.setStateChanged('info.connection', false, true);
          await statesController.setAllAvailableToFalse();
          startListening = false;
          allNodesCreated = false;
          deviceCache = {};
          this.nodeCache = {};
          this.log.info('Websocket connection closed. Attempting to reconnect...');
      });
  }
  
  async messageParse(message) {
    // Mutex lock: queue up calls to messageParse
    let release;
    const lock = new Promise((resolve) => (release = resolve));
    const prev = messageParseMutex;
    messageParseMutex = lock;
    await prev;

    try {
      const messageObj = JSON.parse(message);

      const debugDevicesState = await this.getStateAsync("info.debugId");

      this.log.debug(`--->>> fromZ2W_RAW1 -> ${JSON.stringify(messageObj)}`);

      const type       = messageObj?.type;

      if (this.config.connectionType === 'ws') {
        switch (type) {
            case 'version': {      // say hello
                this.setStateChanged('info.connection', true, true);
                this.setStateChanged('info.zwave_gateway_version', messageObj.driverVersion, true);
                this.setStateChanged('info.zwave_gateway_status', 'online', true);
                break;
            }
            case 'result': {
                if (messageObj.result?.success === true) {
                    this.setStateChanged('info.debugmessages', JSON.stringify(messageObj), true);
                    break;
                }

                if (allNodesCreated) {  // wird manchmal doppelt geschickt
                    break;
                }

                if (!messageObj.result?.state || !Array.isArray(messageObj.result.state.nodes)) {
                    this.log.warn('<zwavews> Invalid result.state structure received, skipping.');
                    break;
                }

                driver     = messageObj.result.state.driver;
                controller = messageObj.result.state.controller;
                allNodes   = messageObj.result.state.nodes;

                for (const nodeData of allNodes) {
                    const nodeId = utils.formatNodeId(nodeData.nodeId);

                    if (debugDevicesState && debugDevicesState.val && String(debugDevicesState.val).includes(nodeId)) {
                        this.log.warn(`--->>> fromZ2W_RAW2-> ${JSON.stringify(nodeData)}` );
                    }

                    if (!this.nodeCache[nodeId]) {
                        if (this.config.showNodeInfoMessage) {
                            this.log.info(`Node Info Update for ${nodeId}`);
                        }
                        this.nodeCache[nodeId] = {nodeData};
                    }
                    await helper.createNode(nodeId, nodeData, options);
                }
                
                allNodesCreated = true;

                if (this.config.showNodeInfoMessage) {
                    this.log.info(`all Nodes are ready`);
                }
                if (startListening) {
                    websocketController.send(JSON.stringify({command: "start_listening"}));
                    startListening = false;
                }
                break;
            }
            case 'event':
                eventTyp = messageObj.event;

                switch (eventTyp.event) {
                  case 'value updated':
                  case 'value added': 
                  case 'value notification': { 
                      const nodeArg = eventTyp.args;
                      const nodeId = utils.formatNodeId(eventTyp.nodeId);

                      if (debugDevicesState && debugDevicesState.val && String(debugDevicesState.val).includes(nodeId)) {
                        this.log.warn(`--->>> fromZ2W_RAW2-> ${JSON.stringify(eventTyp)}` );
                      }

                      let parsePath = `${nodeId}.${nodeArg.commandClassName}.${nodeArg.propertyName
                          .replace(/[^\p{L}\p{N}\s]/gu, "")
                          .replace(/\s+/g, " ")
                          .trim()}`;

                      if (nodeArg?.propertyKeyName) {
                          parsePath = `${parsePath}.${nodeArg.propertyKeyName
                              .replace(/[^\p{L}\p{N}\s]/gu, "")
                              .replace(/\s+/g, " ")
                              .trim()}`;

                          if (constant.RGB.includes(nodeArg.propertyKeyName)) {
                              parsePath = utils.replaceLastDot(parsePath);
                          }
                      }

                      parsePath = utils.deleteLastDot(utils.formatObject(parsePath));

                      if (nodeArg.commandClass === 119) {    // sonderlocke für node naming
                          switch (nodeArg.property) {
                              case 'name':
                                  await helper.updateDevice(nodeId, nodeArg);
                                  parsePath = `${nodeId}.info.${nodeArg.property}`;
                                  break;
                              case 'location':
                                  // intentionally ignored
                                  break;
                              default:
                                  parsePath = `${nodeId}.info.${nodeArg.property}`;
                                  break;
                          }
                      }

                      this.log.debug(`${parsePath} ->> ${nodeArg.newValue}`);

                      if (parsePath.includes('firmwareVersions')) { // damit array werte gespeichert werden
                          parsePath = `${parsePath}_value`;
                      }

                       // mehr als 1 endpoint behandeln
                      if (nodeArg.endpoint != null && nodeArg.endpoint > 0) {
                        parsePath = `${parsePath}_${nodeArg.endpoint}`;
                      }

                      parsePath = utils.deleteLastDot(parsePath); // check again

                      if (eventTyp.event === 'value notification') {
                        await helper.parse(`${parsePath}`, nodeArg.newValue, options, true);
                      } else {
                        await helper.parse(`${parsePath}`, nodeArg.newValue, options, false);
                      }
                      break;
                  }

                  case 'firmware update progress': {
                    const total = Number(eventTyp.totalFragments) || 0;
                    const sent = Number(eventTyp.sentFragments) || 0;

                    const progress = total > 0 ? Math.min(100, Math.max(0, (sent / total) * 100)) : 0;

                    this.log.info(
                      `Firmware update progress for ${utils.formatNodeId(eventTyp.nodeId)} ->> ` + `send Fragments ${sent} -- total ${total} 
                        (${progress.toFixed(1)}%)`);
                    break;
                  }
                  case 'firmware update finished': {
                      this.log.info(`${utils.formatNodeId(eventTyp.nodeId)} --> ${eventTyp.event}`);
                    break;
                  }
                  case 'ready':
                  case 'sleep':
                  case 'wake up':
                  case 'alive':
                  case 'dead': {
                      const nodeId = utils.formatNodeId(eventTyp.nodeId);
                      await helper.parse(`${nodeId}.status`, eventTyp.event.toLowerCase(), options);
                      
                      if (eventTyp.event === 'dead') {
                        await helper.parse(`${nodeId}.ready`, false, options);
                      } else {
                        await helper.parse(`${nodeId}.ready`, true, options);
                      }
                      
                      if (this.config.wakeUpInfo) {
                          this.log.info(`${utils.formatNodeId(eventTyp.nodeId)} --> ${eventTyp.event}`);
                      }
                      break;
                  }

                  case 'node removed': {
                        const nodeId = utils.formatNodeId(eventTyp.nodeId);

                        if (this.config.useEventInDesc) {
                           const nodeArg = {desc: "Node is Deleted"};
                           await helper.updateDevice(nodeId, nodeArg, false);
                        } else {
                          const nodeArg = {name : 'Node is Deleted'};
                          await helper.updateDevice(nodeId, nodeArg, true);
                        }
                        this.log.error(`Delete ${utils.formatNodeId(eventTyp.nodeId)}`);
                        break;
                  }
                  case 'interview started':
                  case 'interview stage completed':
                  case 'interview failed':
                  case 'interview completed':
                    this.log.info(`${utils.formatNodeId(eventTyp.nodeId)} --> ${eventTyp.event}`);
                    break;
                  
                  case 'statistics updated':
                  case 'metadata updated':
                  case 'node info received':
                    break;
                default:
                    if (this.config.newTypeEvent) {
                        this.log.warn(`New type event ->> ${eventTyp.event}`);
                        this.log.warn(JSON.stringify(messageObj));
                    }
                    break;
            }

            break;
          default:
            break;
        }
      }
    } catch (err) {
      this.log.error(err);
      this.log.error(`<zwavews> error message -->> ${message}`);
    } finally {
      release();
    }
  }

  async onUnload(callback) {
    try {
      // Close MQTT connections
      if (["exmqtt", "intmqtt"].includes(this.config.connectionType)) {
        if (mqttClient && !mqttClient.closed) {
          try {
              mqttClient.end();
          } catch (e) {
              this.log.error(e);
          }
        }
      }
      // Internal or Dummy MQTT-Server
      if (this.config.connectionType === "intmqtt" || this.config.dummyMqtt === true) {
        try {
          if (mqttServerController) {
            mqttServerController.closeServer();
          }
        } catch (e) {
          this.log.error(e);
        }
      }
      // WebSocket cleanup
      if (websocketController) {
        try {
          await websocketController.allTimerClear();
          websocketController.closeConnection();
        } catch (e) {
          this.log.error(e);
        }
      }
      // Set all device available states to false
      try {
        if (statesController) {
          await statesController.setAllAvailableToFalse();
        }
      } catch (e) {
        this.log.error(e);
      }

      this.setStateChanged("info.connection", false, true);
    } finally {
      callback();
    }
  }

  async onStateChange(id, state) {
    if (!allNodesCreated) {  // wenn alle nodes angelegt sind, erst dann horchen auf target
        return;
    }

    if (state && state.ack === false) {
      if (id.endsWith("info.debugId")) {
        this.setStateChanged(id, state.val, true);
        return;
      }

      const obj = await this.getObjectAsync(id);
      if (obj) {
          const nativeObj = obj.native || {};

          const m = id.match(/nodeID_0*(\d+)/i);
          if (!m) {
              this.log.warn(`<zwavews> Could not extract nodeId from state id: ${id}`);
              return;
          }
          const nodeId = Number(m[1]);

          const message = {
              messageId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
              command: "node.set_value",
              nodeId: nodeId,
              valueId: nativeObj.valueId,
              value: state.val
          };

          const sendMessageAllowed = await this.getStateAsync("info.sendMessageAllowed");

          if (sendMessageAllowed && sendMessageAllowed.val === true) {
              if (websocketController) {
                  websocketController.send(JSON.stringify(message));
              } else {
                  this.log.warn('<zwavews> websocketController not initialised, cannot send message.');
              }
          }

          this.setStateChanged('info.debugmessages', JSON.stringify(message), true);
          this.log.debug(`<zwavews> message onStateChange ${JSON.stringify(message)}`);
      }
    }
  }
}

if (require.main !== module) {
  // Export the constructor in compact mode
  /**
   * @param {Partial<core.AdapterOptions>} [options]
   */
  module.exports = (options) => new zwavews(options);
} else {
  // otherwise start the instance directly
  new zwavews();
}
