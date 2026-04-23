/**
 *
 * @param config
 * @param log
 */
async function adapterInfo(config, log) {
  log.info(
    "================================= Adapter Config =================================",
  );
  log.info(`|| zwaveWS Frontend Scheme: ${config.webUIScheme}`);
  log.info(`|| zwaveWS Frontend Server: ${config.webUIServer}`);
  log.info(`|| zwaveWS Frontend Port: ${config.webUIPort}`);
  log.info(`|| zwaveWS Connection Type: ${config.connectionType}`);
  if (config.connectionType === "ws") {
    log.info(`|| zwaveWS Websocket Scheme: ${config.wsScheme}`);
    log.info(`|| zwaveWS Websocket Server: ${config.wsServerIP}`);
    log.info(`|| zwaveWS Websocket Port: ${config.wsServerPort}`);
    log.info(
      `|| zwaveWS Websocket Auth-Token: ${config.wsTokenEnabled ? "use" : "unused"}`,
    );
    log.info(
      `|| zwaveWS Websocket Dummy MQTT-Server: ${config.dummyMqtt ? "activated" : "deactivated"}`,
    );
    if (config.dummyMqtt === true) {
      log.info(`|| zwaveWS Dummy MQTT IP-Bind: ${config.mqttServerIPBind}`);
      log.info(`|| zwaveWS Dummy MQTT Port: ${config.mqttServerPort}`);
    }
  } else if (config.connectionType === "exmqtt") {
    log.info(
      `|| zwaveWS Externanl MQTT Server: ${config.externalMqttServerIP}`,
    );
    log.info(
      `|| zwaveWS Externanl MQTT Port: ${config.externalMqttServerPort}`,
    );
    log.info(
      `|| zwaveWS Externanl MQTT Credentials: ${config.externalMqttServerCredentials ? "use" : "unused"}`,
    );
  } else if (config.connectionType === "intmqtt") {
    log.info(`|| zwaveWS Internal MQTT IP-Bind: ${config.mqttServerIPBind}`);
    log.info(`|| zwaveWS Internal MQTT Port: ${config.mqttServerPort}`);
  }
  log.info(
    "==================================================================================",
  );
}

module.exports = {
  adapterInfo,
};
