'use strict';
const dmUtils = require('@iobroker/dm-utils');
const humanizeDuration = require('humanize-duration');

/**
 * Device management class for the ZWave adapter.
 */
class dmZwave extends dmUtils.DeviceManagement {
    /**
     * Creates a new dmZwave instance.
     *
     * @param {object} adapter - The ioBroker adapter instance.
     */
    constructor(adapter) {
        super(adapter);
        this.adapter = adapter;
    }

    /**
     * Loads all ZWave devices and reports them to the device manager context.
     * Called by the dm-utils framework in response to a 'dm:loadDevices' message.
     *
     * @param {object} context - The DeviceLoadContext (addDevice / setTotalDevices / complete).
     */
    async loadDevices(context) {
        const devices = await this.adapter.getDevicesAsync();
        context.setTotalDevices(devices.length);

        for (const i in devices) {
            const status = {};

            const nodeId = this.stripIobPrefix(devices[i]._id);

            const cacheEntry = this.adapter.nodeCache[nodeId];
            if (!cacheEntry) {
                this.adapter.log.warn(`listDevices: nodeCache miss for ${nodeId}, skipping.`);
                continue;
            }
            const device = cacheEntry.nodeData;

            status.connection = device.ready ? 'connected' : 'disconnected';

            //const link_quality = await this.adapter.getStateAsync(`${theDevice._id}.status`);
            //status.rssi = link_quality.val == 'alive' ? '100' : '0';

            const battery = await this.adapter.getStateAsync(`${devices[i]._id}.Battery.level`);
            if (battery) {
                status.battery = battery.val;
            }

            let devStatus;

            switch (device.status) {
                case 1:
                    devStatus = 'data:image/png;base64,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';
                    break;
                case 2:
                    devStatus = 'data:image/png;base64,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';
                    break;
                case 3:
                    devStatus = 'data:image/png;base64,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';
                    break;
                case 4:
                    devStatus = 'data:image/png;base64,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';
                    break;
                default:
                    devStatus = 'unknown';
            }

            // Sensordaten aus Multilevel_Sensor laden 
            const sensorCustomInfo = {
                id: nodeId,
                schema: {
                    type: 'panel',
                    items: {},
                },
            };

            try {
                const sensorObjects = await this.adapter.getObjectViewAsync('system', 'state', {
                    startkey: `${devices[i]._id}.Multilevel_Sensor.`,
                    endkey: `${devices[i]._id}.Multilevel_Sensor.\u9999`,
                });

                if (sensorObjects && sensorObjects.rows && sensorObjects.rows.length > 0) {
                    for (const row of sensorObjects.rows) {
                        const obj = row.value;
                        if (!obj) {
                            continue;
                        }
                        const stateId = obj._id;
                        const sensorKey = stateId.replace(/\./g, '_');
                        const labelParts = stateId.split('.');
                        const sensorLabel = labelParts[labelParts.length - 1];
                        const unit = obj.common?.unit ? ` (${obj.common.unit})` : '';

                        sensorCustomInfo.schema.items[sensorKey] = {
                            type: 'state',
                            oid: stateId,
                            foreign: true,
                            label: `${sensorLabel}${unit}`,
                            newLine: true,
                        };
                    }
                }
            } catch (e) {
                this.adapter.log.warn(`listDevices: Fehler beim Laden der Multilevel_Sensor-Daten für ${nodeId}: ${e.message}`);
            }


            const res = {
                id: nodeId,
                name: device.name || device.label,
                icon: devStatus,
                manufacturer: device.deviceConfig?.manufacturer ?? '',
                model: `${device.deviceConfig?.label ?? ''} ${device.deviceConfig?.description ?? ''}`.trim(),
                status: status,
                hasDetails: true,
                actions: [
                    {
                        id: 'doc',
                        icon: 'lines',
                        description: 'Documentation',
                        handler: async (_id, context) => this.openPDF(context, device),
                    },
                ],
            };

            // Schalter aus Multilevel_Switch laden
            try {
                const switchObjects = await this.adapter.getObjectViewAsync('system', 'state', {
                    startkey: `${devices[i]._id}.Multilevel_Switch.`,
                    endkey: `${devices[i]._id}.Multilevel_Switch.\u9999`,
                });

                if (switchObjects && switchObjects.rows && switchObjects.rows.length > 0) {
                    // Trennlinie einfügen, wenn bereits Sensordaten vorhanden
                    if (Object.keys(sensorCustomInfo.schema.items).length > 0) {
                        sensorCustomInfo.schema.items['_divider_switch'] = {
                            type: 'divider',
                            color: 'primary',
                        };
                    }

                    // Alle Rows in eine Map sammeln (rawName → {obj, stateId})
                    const switchMap = {};
                    for (const row of switchObjects.rows) {
                        const obj = row.value;
                        if (!obj) {
                            continue;
                        }
                        const parts = obj._id.split('.');
                        const rawName = parts[parts.length - 1];
                        switchMap[rawName] = { obj, stateId: obj._id };
                    }

                    // Gewünschte Reihenfolge, unbekannte States werden danach angehängt
                    const order = ['open', 'close', 'currentValue', 'targetValue', 'restorePrevious', 'duration'];
                    const allKeys = [...order, ...Object.keys(switchMap).filter(k => !order.includes(k))];

                    allKeys.forEach((rawName, index) => {
                        if (!switchMap[rawName]) {
                            return;
                        }
                        const { obj, stateId } = switchMap[rawName];
                        // Nummerierten Prefix damit Admin-UI die Elemente in der richtigen Reihenfolge anzeigt
                        const switchKey = `_sw${String(index + 1).padStart(2, '0')}_${rawName}`;
                        const isBoolean = obj.common?.type === 'boolean';

                        // Anzeigenamen umbenennen
                        let switchLabel;
                        if (rawName === 'targetValue') {
                            switchLabel = 'Target';
                        } else if (rawName === 'currentValue') {
                            switchLabel = 'Current';
                        } else {
                            switchLabel = rawName;
                        }

                        // currentValue: nur lesebarer numerischer Wert mit %-Einheit
                        // duration: nur lesebarer numerischer Wert
                        if (rawName === 'currentValue' && !isBoolean) {
                            sensorCustomInfo.schema.items[switchKey] = {
                                type: 'state',
                                oid: stateId,
                                foreign: true,
                                label: switchLabel,
                                readOnly: true,
                                unit: '%',
                                newLine: true,
                            };
                        } else if (rawName === 'duration' && !isBoolean) {
                            sensorCustomInfo.schema.items[switchKey] = {
                                type: 'state',
                                oid: stateId,
                                foreign: true,
                                label: switchLabel,
                                readOnly: true,
                                newLine: true,
                            };
                        } else if (isBoolean) {
                            sensorCustomInfo.schema.items[switchKey] = {
                                type: 'state',
                                oid: stateId,
                                foreign: true,
                                label: switchLabel,
                                control: 'switch',
                                trueTextStyle: { color: 'green' },
                                falseTextStyle: { color: 'red' },
                                trueText: 'ON',
                                falseText: 'OFF',
                                newLine: true,
                            };
                        } else {
                            sensorCustomInfo.schema.items[switchKey] = {
                                type: 'state',
                                oid: stateId,
                                foreign: true,
                                label: switchLabel,
                                control: 'slider',
                                min: obj.common?.min ?? 0,
                                max: obj.common?.max ?? 99,
                                newLine: true,
                            };
                        }
                    });
                }
            } catch (e) {
                this.adapter.log.warn(`listDevices: Fehler beim Laden der Multilevel_Switch-Daten für ${nodeId}: ${e.message}`);
            }


            // Nur customInfo anhängen, wenn Sensor- oder Schalterdaten vorhanden sind
            if (Object.keys(sensorCustomInfo.schema.items).length > 0) {
                res.customInfo = sensorCustomInfo;
            }


            context.addDevice(res);
        }

        // nach id sortieren (z.B. nodeID_2 vor nodeID_10)
        // Note: sorting is informational only; context already sent devices
        context.complete();
    }

    /**
     * Opens the device documentation PDF or link in a form dialog.
     *
     * @param {object} context - The device management context used to show the form.
     * @param {object} device - The ZWave device object containing device config and metadata.
     */
    async openPDF(context, device) {
        const manual = device?.deviceConfig?.metadata?.manual;
        const urls = Array.isArray(manual)
            ? manual
            : (typeof manual === 'string' && manual.trim())
                ? [manual]
                : [];

        const items = {};

        if (!urls.length) {
            items._no_manual = {
                type: 'staticText',
                text: this.adapter.i18nTranslation?.['No documentation link found'] || 'No documentation link found',
                newLine: true,
            };
        } else {
            urls
                .filter(u => typeof u === 'string' && u.trim())
                .forEach((u, idx) => {
                    const href = /^https?:\/\//i.test(u) ? u : `https://${u}`;
                    items[`_manual_${idx}`] = {
                        type: 'staticLink',
                        label: urls.length === 1 ? 'Dokumentation' : `Dokumentation ${idx + 1}`,
                        href,
                        button: true,
                        newLine: true,
                    };
                });
        }

        await context.showForm(
            {
                type: 'panel',
                items,
            },
            {
                title: this.adapter.i18nTranslation?.['DeviceDocumentation'] || 'Device documentation',
            },
        );

        return { refresh: true };
    }

    /**
     * Returns the detail schema and data for a specific device.
     *
     * @param {string} id - The node ID of the device.
     * @param {object} _action - The action object passed by the device management framework.
     * @param {object} _context - The device management context.
     */
    async getDeviceDetails(id, _action, _context) {
        this.adapter.log.debug('getDeviceDetails');

        const device = this.adapter.nodeCache[id]?.nodeData;

        if (!device) {
            return null;
        }

        const items = {
            nodeId: {
                type: 'staticText',
                text: `Node ID: ${device.nodeId ?? '—'}`,
                newLine: true,
            },
            manufacturerId: {
                type: 'staticText',
                text: `Manufacturer ID: ${device.manufacturerId ?? device.deviceConfig?.manufacturerId ?? '—'}`,
                newLine: true,
            },
            productId: {
                type: 'staticText',
                text: `Product ID: ${device.productId ?? '—'}`,
                newLine: true,
            },
            productType: {
                type: 'staticText',
                text: `Product Type: ${device.productType ?? '—'}`,
                newLine: true,
            },
            protocolVersion: {
                type: 'staticText',
                text: `Protocol Version: ${device.protocolVersion ?? '—'}`,
                newLine: true,
            },
            sdkVersion: {
                type: 'staticText',
                text: `SDK Version: ${device.sdkVersion ?? '—'}`,
                newLine: true,
            },
            interviewStage: {
                type: 'staticText',
                text: `Interview Stage: ${device.interviewStage ?? '—'}`,
                newLine: true,
            },
            lastActive: {
                type: 'staticText',
                text: `Last Active: ${device.lastActive ?? '—'}`,
                newLine: true,
            },
            endpointsCount: {
                type: 'staticText',
                text: `Endpoints Count: ${device.endpointsCount ?? '—'}`,
                newLine: true,
            },
            deviceClassBasic: {
                type: 'staticText',
                text: `Device Class Basic: ${device.deviceClass?.basic ?? '—'}`,
                newLine: true,
            },
            deviceClassGeneric: {
                type: 'staticText',
                text: `Device Class Generic: ${device.deviceClass?.generic ?? '—'}`,
                newLine: true,
            },
            deviceClassSpecific: {
                type: 'staticText',
                text: `Device Class Specific: ${device.deviceClass?.specific ?? '—'}`,
                newLine: true,
            },
            supportsSecurity: {
                type: 'checkbox',
                label: 'Supports Security',
                readOnly: true,
                checked: !!device.supportsSecurity,
                newLine: true,
            },
            supportsBeaming: {
                type: 'checkbox',
                label: 'Supports Beaming',
                readOnly: true,
                checked: !!device.supportsBeaming,
            },
            isFrequentListening: {
                type: 'checkbox',
                label: 'Frequent Listening',
                readOnly: true,
                checked: !!device.isFrequentListening,
            },
            isControllerNode: {
                type: 'checkbox',
                label: 'Controller Node',
                readOnly: true,
                checked: !!device.isControllerNode,
            },
            keepAwake: {
                type: 'checkbox',
                label: 'Keep Awake',
                readOnly: true,
                checked: !!device.keepAwake,
            },
        };

        let devStatus;
        switch (device.status) {
            case 1:
                devStatus = 'asleep';
                break;
            case 2:
                devStatus = 'awake';
                break;
            case 3:
                devStatus = 'dead';
                break;
            case 4:
                devStatus = 'alive';
                break;
            default:
                devStatus = 'unknown';
        }

        // Kalibrierungsknopf prüfen
        const calibStateId = `${this.adapter.namespace}.${id}.Configuration.Forced_Roller_Shutter_Calibration`;
        const calibObj = await this.adapter.getObjectAsync(calibStateId).catch(() => null);

        return {
            id: String(device.nodeId),
            schema: {
                type: 'tabs',
                items: {
                    _tab_Start: {
                        type: 'panel',
                        label: 'Main',
                        items: {
                            header_Start: {
                                type: 'header',
                                text: `${id} - ${device.label} ${device?.deviceClass?.basic || ''}`.trim(),
                                size: 3,
                            },
                            nameDevice: {
                                type: 'text',
                                label: 'Device Name',
                                readOnly: true,
                            },
                            manufacturer: {
                                type: 'text',
                                label: 'Manufacturer',
                                readOnly: true,
                            },
                            firmwareVersion: {
                                type: 'text',
                                label: 'Firmware Version',
                                readOnly: true,
                            },
                            statusText: {
                                type: 'text',
                                label: 'Status',
                                readOnly: true,
                            },
                            zwavePlusVersion: {
                                type: 'text',
                                label: 'Zwave Plus Version',
                                readOnly: true,
                            },
                            _divider2: {
                                type: 'divider',
                                color: 'primary',
                            },
                            ready: {
                                type: 'checkbox',
                                label: 'is Ready',
                                readOnly: true,
                            },
                            isListening: {
                                type: 'checkbox',
                                label: 'is Listening',
                                readOnly: true,
                            },
                            isRouting: {
                                type: 'checkbox',
                                label: 'is Routing',
                                readOnly: true,
                            },
                            isSecure: {
                                type: 'checkbox',
                                label: 'is Secure',
                                readOnly: true,
                                newLine: true,
                            },
                            maxBaudRate: {
                                type: 'text',
                                label: 'Max Baud Rate',
                                readOnly: true,
                            },
                            ...(calibObj ? {
                                _divider_calib: {
                                    type: 'divider',
                                    color: 'primary',
                                },
                                _calib_spacer: {
                                    type: 'staticText',
                                    text: '',
                                    newLine: true,
                                    xs: 8,
                                    sm: 9,
                                    md: 10,
                                    lg: 10,
                                    xl: 10,
                                },
                                _calib_button: {
                                    type: 'state',
                                    oid: calibStateId,
                                    foreign: true,
                                    label: 'Kalibrierung starten',
                                    control: 'button',
                                    xs: 4,
                                    sm: 3,
                                    md: 2,
                                    lg: 2,
                                    xl: 2,
                                },
                            } : {}),
                        },
                    },
                    _tab_Details: {
                        type: 'panel',
                        label: 'Details',
                        items,
                    },
                },
            },
            data: {
                nameDevice: device.name || '',
                manufacturer: device.deviceConfig?.manufacturer || '',
                firmwareVersion: device.firmwareVersion || '',
                statusText: devStatus,
                zwavePlusVersion: device.zwavePlusVersion || '',
                ready: !!device.ready,
                isListening: !!device.isListening,
                isRouting: !!device.isRouting,
                isSecure: !!device.isSecure,
                maxBaudRate: device.maxBaudRate ? `${device.maxBaudRate} kBaud/s` : '',
            },
        };
    }



    /**
     * Formats a timestamp according to the given format type.
     *
     * @param {number} time - The timestamp in milliseconds (epoch).
     * @param {'ISO_8601'|'ISO_8601_local'|'epoch'|'relative'} type - The desired output format.
     */
    formatDate(time, type) {   //'ISO_8601' | 'ISO_8601_local' | 'epoch' | 'relative'
        if (type === 'ISO_8601') {
            return new Date(time).toISOString();
        } else if (type === 'ISO_8601_local') {
            return this.toLocalISOString(new Date(time));
        } else if (type === 'epoch') {
            return time;
        }
        // relative
        return `${humanizeDuration(Date.now() - time, { language: 'en', largest: 2, round: true })} ago`;
    }

    /**
     * Converts a Date object to a local ISO 8601 string.
     *
     * @param {Date} d - The Date object to convert.
     */
    toLocalISOString(d) {
        const off = d.getTimezoneOffset();
        return new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes() - off, d.getSeconds(), d.getMilliseconds()).toISOString();
    }
    // Entfernt den ioBroker-Prefix am Anfang, z.B.
    // "zwavews.0.nodeID_1.info.name" -> "nodeID_1.info.name"
     /**
      * Strips the ioBroker adapter prefix from an object ID.
      *
      * @param {string} id - The full ioBroker object ID (e.g. "zwavews.0.nodeID_1.info.name").
      * @returns {string} The ID without the adapter prefix (e.g. "nodeID_1.info.name").
      */
     stripIobPrefix(id) {
        const s = String(id ?? '');
        return s.replace(/^[^.]+\.[^.]+\./, '');
    }

}

module.exports = dmZwave;
