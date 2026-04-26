'use strict';

const path = require('path');
const { tests } = require('@iobroker/testing');

// Adapter-Lifecycle: ready → poll-cycle → unload
// Erfordert tatsächliche Netzwerkverbindung NICHT, da unitTests den
// Socket-Connect mocked / über Settings ein nicht erreichbares Ziel verwendet.
tests.unit(path.join(__dirname, '..'), {
    overwriteAdapterConfig(config) {
        return {
            ...config,
            ConfIPAdress: '127.0.0.1',
            ConfPollInterval: 60,
            ConfBydTowerCount: 1,
            ConfBatDetails: false,
            ConfDetailshowoften: 10,
            ConfTestMode: false,
            ConfMaxRetries: 1,
            ConfOverridePollInterval: 0,
            ConfStoreRawMessages: false,
        };
    },
});
