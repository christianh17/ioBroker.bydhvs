const WebSocket = require('ws');
let wsClient;
const wsHeartbeatIntervall = 5000;
const restartTimeout = 1000;
let ping;
let pingTimeout;
let autoRestartTimeout;

/**
 * Manages the WebSocket connection to the zwave-js-ui server.
 */
class WebsocketController {
    /**
     * Creates a new WebsocketController instance.
     *
     * @param {object} adapter - The ioBroker adapter instance.
     */
    constructor(adapter) {
        this.adapter = adapter;
    }

    /**
     * Initialises and connects the WebSocket client to the zwave-js-ui server.
     *
     * @returns {WebSocket} The created WebSocket client instance.
     */
    initWsClient() {
        try {
            let wsURL = `${this.adapter.config.wsScheme}://${this.adapter.config.wsServerIP}:${this.adapter.config.wsServerPort}/api`;

            if (this.adapter.config.wsTokenEnabled === true) {
                wsURL += `?token=${this.adapter.config.wsToken}`;
            }

            wsClient = new WebSocket(wsURL, { rejectUnauthorized: false });

            wsClient.on('open', () => {
                // Send ping to server
                this.sendPingToServer();
                // Start Heartbeat
                this.wsHeartbeat();
            });

            wsClient.on('pong', () => {
                this.wsHeartbeat();
            });

            wsClient.on('close', async () => {
                clearTimeout(pingTimeout);
                clearTimeout(ping);

                if (wsClient.readyState === WebSocket.CLOSED) {
                    this.autoRestart();
                }
            });

            wsClient.on('message', () => {});

            wsClient.on('error', (err) => {
                this.adapter.log.debug(err);
            });

            return wsClient;
        } catch (err) {
            this.adapter.log.error(err);
        }
    }

    /**
     * Sends a message to the zwave-js-ui server via the WebSocket connection.
     *
     * @param {string} message - The message payload to send.
     */
    send(message) {
        if (wsClient.readyState !== WebSocket.OPEN) {
            this.adapter.log.warn('Cannot set State, no websocket connection to zwave-js-ui');
            return;
        }
        wsClient.send(message);
    }

    /**
     * Sends a WebSocket ping to the server and schedules the next ping.
     */
    sendPingToServer() {
        //this.logDebug('Send ping to server');
        wsClient.ping();
        ping = setTimeout(() => {
            this.sendPingToServer();
        }, wsHeartbeatIntervall);
    }

    /**
     * Resets the heartbeat timeout; terminates the connection if no pong is received in time.
     */
    wsHeartbeat() {
        clearTimeout(pingTimeout);
        pingTimeout = setTimeout(() => {
            this.adapter.log.warn('Websocked connection timed out');
            wsClient.terminate();
        }, wsHeartbeatIntervall + 3000);
    }

    /**
     * Schedules an automatic reconnect attempt after the configured restart timeout.
     */
    autoRestart() {
        this.adapter.log.warn(`Start try again in ${restartTimeout / 1000} seconds...`);
        autoRestartTimeout = setTimeout(() => {
            this.adapter.startWebsocket();
        }, restartTimeout);
    }

    /**
     * Closes the WebSocket connection if it is currently open.
     */
    closeConnection() {
        if (wsClient && wsClient.readyState !== WebSocket.CLOSED) {
            wsClient.close();
        }
    }

    /**
     * Clears all active timers (ping, pingTimeout, autoRestartTimeout).
     */
    allTimerClear() {
        clearTimeout(pingTimeout);
        clearTimeout(ping);
        clearTimeout(autoRestartTimeout);
    }
}

module.exports = {
    WebsocketController,
};
