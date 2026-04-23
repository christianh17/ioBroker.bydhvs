/**
 * Controls reading and writing of ioBroker states for the ZWave adapter.
 */
class StatesController {
  /**
   * Creates a new StatesController instance.
   *
   * @param {object} adapter - The ioBroker adapter instance.
   */
  constructor(adapter) {
    this.adapter = adapter;
  }

  /**
   * Sets a state value unconditionally, skipping null/undefined values.
   *
   * @param {string} stateName - The ioBroker state ID to set.
   * @param {*} value - The value to write to the state.
   */
  async setStateSafelyAsync(stateName, value) {
    if (value === undefined || value === null) {
      return;
    }
    await this.adapter.setStateAsync(stateName, value, true);
  }

  /**
   * Sets a state value only if it has changed, skipping null/undefined values.
   *
   * @param {string} stateName - The ioBroker state ID to set.
   * @param {*} value - The value to write to the state.
   */
  async setStateChangedSafelyAsync(stateName, value) {
    if (value === undefined || value === null) {
      return;
    }
    await this.adapter.setStateChangedAsync(stateName, value, true);
  }

  /**
   * Reads all writable ZWave states from ioBroker and returns them as a map keyed by object ID.
   *
   * @returns {Promise<object>} A map of writable state IDs to their MQTT path and write flag.
   */
  async subscribeAllWritableExistsStates() {
    const writableStates = {};

    const ns = `${this.adapter.namespace}.`;
    const res = await this.adapter.getObjectViewAsync("system", "state", {
      startkey: ns,
      endkey: `${ns}\u9999`,
    });

    for (const row of res.rows) {
      const obj = row.value;
      if (obj?.common?.write === true) {
        writableStates[obj._id] = {
          mqttId: obj.native.mqttPath,
          write: true,
          subst: null,
        };
      }
    }

    return writableStates;
  }

  /**
   * Sets all node ready-states to false, all status-states to "unknown"
   * and the gateway status to "offline".
   */
  async setAllAvailableToFalse() {
    const readyStates = await this.adapter.getStatesAsync("*.ready");
    for (const readyState in readyStates) {
      await this.adapter.setStateChangedAsync(readyState, false, true);
    }
    const availableStates = await this.adapter.getStatesAsync("*.status");
    for (const availableState in availableStates) {
      await this.adapter.setStateChangedAsync(availableState, "unknown", true);
    }
    await this.adapter.setStateChangedAsync('info.zwave_gateway_status', 'offline', true);

  }

}

module.exports = {
  StatesController,
};
