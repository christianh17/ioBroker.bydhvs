const utils = require("./utils");
const constant = require("./constants");

/*
options:
write //set common write variable to true
forceIndex //instead of trying to find names for array entries, use the index as the name
channelName //set name of the root channel
preferedArrayName //set key to use this as an array entry name
autoCast (true false) // make JSON.parse to parse numbers correctly
descriptions: Object of names for state keys
*/
/**
 * Helper class for creating and managing ioBroker objects and states from ZWave data.
 */
class Helper {
  /**
   * Creates a new Helper instance.
   *
   * @param {object} adapter - The ioBroker adapter instance.
   * @param {object} [alreadyCreatedObjects] - Cache of already created object paths.
   */
  constructor(adapter, alreadyCreatedObjects = {}) {
    this.adapter = adapter;
    this.alreadyCreatedObjects = alreadyCreatedObjects;

  }

  /**
   * Normalises any value to a valid ioBroker common.type string.
   * Valid types: "number" | "string" | "boolean" | "array" | "object" | "mixed" | "file"
   *
   * @param {*} value - The raw value whose type should be determined.
   * @param {string} [hint] - An optional type hint (e.g. from metadata.type).
   * @returns {string} A valid ioBroker type string.
   */
  normalizeType(value, hint) {
    const VALID = new Set(["number", "string", "boolean", "array", "object", "mixed", "file"]);
    if (hint && VALID.has(hint)) {
return hint;
}
    if (Array.isArray(value))          {
return "array";
}
    const t = typeof value;
    if (t === "number")                {
return "number";
}
    if (t === "boolean")               {
return "boolean";
}
    // strings are stored as "mixed" to allow numeric/bool changes later
    return "mixed";
  }

  /**
   * Creates a ZWave node device and all its value states in ioBroker.
   *
   * @param {string|number} nodeIdOriginal - The original node ID as received from the ZWave driver.
   * @param {object} element - The node data object containing values, name and device config.
   */
  async createNode(nodeIdOriginal, element) {
    try {
      let nodeId = utils.formatNodeId(nodeIdOriginal);

      if (element == null) {
        this.adapter.log.debug(`Cannot extract NodeId: ${nodeId}`);
        return;
      }

      await this.adapter.setObjectNotExistsAsync(nodeId, {
        type: 'device',
        common: {
          name: element.name ?? element.label,
          statusStates: {
            onlineId: `${this.adapter.name}.${this.adapter.instance}.${nodeId}.ready`,
          },
        },
        native: {},
      });

      await this.createReadyStatus(nodeId);

      const valuesOnly = element.values ?? null;
      const { values: _values, ...elementWithoutValues } = element;

      await this.parse(`${nodeId}.info`, elementWithoutValues);

      if (valuesOnly != null && typeof valuesOnly === "object" && valuesOnly.length > 0) {
        for (const v of valuesOnly) {
          let parsePath = utils.deleteLastDot(utils.formatObject(`${nodeId}.${v.commandClassName}`));
          let metadata = v.metadata || {};

          if (constant.noInfoDP.includes(v.commandClassName) || constant.noInfoDP.includes(v.propertyName)) {
            continue;
          }

          if (!this.alreadyCreatedObjects[parsePath]) {
            this.alreadyCreatedObjects[parsePath] = {};

            await this.adapter.setObjectNotExistsAsync(parsePath, {
              type: 'channel',
              common: {
                name: v.commandClassName || "",
              },
              native: {},
            });
          }

          parsePath = `${nodeId}.${v.commandClassName}.${v.propertyName
              .replace(/[^\p{L}\p{N}\s]/gu, "")
              .replace(/\s+/g, " ")
              .trim()}`;

          if (v?.propertyKeyName) {
            parsePath = `${parsePath}.${v.propertyKeyName
                .replace(/[^\p{L}\p{N}\s]/gu, "")
                .replace(/\s+/g, " ")
                .trim()}`;
          }

          if (constant.RGB.includes(v.propertyKeyName)) {
              parsePath = utils.replaceLastDot(parsePath);
          }

          if (this.isObject(v.value))  {   // da gibts ein object mit value
            parsePath = `${parsePath}_value`;
          }

          // mehr als 1 endpoint behandeln
          if (v.endpoint != null && v.endpoint > 0) {
            parsePath = `${parsePath}_${v.endpoint}`;
          }

          parsePath = utils.deleteLastDot(utils.formatObject(parsePath));     // entferne sonderzeichen und blank aus dem namen und letzten dot

          const nam_id = v.label ?? v.propertyName;

          metadata.value = v.value; // add value for resolution
          const valDp = this.resolveCommandClassValue(metadata) ?? 0;

          const rawType = metadata.type === "timeout" ? "number" : metadata.type;
          let typeDp = this.normalizeType(valDp, rawType);

          if (constant.mixedType.includes(nam_id)) {
            typeDp = "mixed";
          }
          
          const common = {
            id:    nam_id,
            name:  nam_id,
            write: metadata.writeable,
            read:  metadata.readable,
            desc:  metadata.label,
            type:  typeDp,
            min:   metadata?.min,
            max:   metadata?.max,
            def:   v.default ?? (typeDp === "boolean" ? false : metadata?.min),
            unit: metadata?.unit ?? "",
            role: this.getRole(valDp, metadata.writeable, parsePath),
          };

          if (metadata?.states) {
              common.states = metadata?.states;
          }
          const native = {
             valueId : { commandClass: v.commandClass,
                                 endpoint: v.endpoint,
                                 property: v.property
             }
          };

          if (v?.propertyKey) {
            native.valueId.propertyKey = v.propertyKey;
          }

          await this.adapter.setObjectNotExistsAsync(parsePath, {
            type: 'state',
            common,
            native,
          });
          
          if (common.write === true) {
            this.adapter.subscribeStates(parsePath);
          }

          await this.changeState(parsePath, valDp);

          this.alreadyCreatedObjects[parsePath] = {};
        }
      }
    } catch (error) {
      this.adapter.log.error(`Cannot create node ${nodeIdOriginal} : ${error}`);
    }
  }

  /**
   * Recursively parses an element and creates the corresponding ioBroker objects and states.
   *
   * @param {string} path - The ioBroker object path to write to.
   * @param {*} element - The value or object to parse and persist.
   * @param {object} [options] - Parsing options (e.g. write, channelName, descriptions).
   * @param {boolean} [change] - If true, forces setState instead of setStateChanged.
   */
  async parse(path, element, options = { write: false },change = false) {
    let parsePath = utils.deleteLastDot(utils.formatObject(path));

    if (element === undefined || element === null) {
      this.adapter.log.error(`Skip undefined value for ${parsePath}`);
      return;
    }

    if (typeof element === "string" || typeof element === "number" || typeof element === "boolean") {
      let valDp = element ?? 0;

      let typeDp = typeof element;

      if (!this.alreadyCreatedObjects[parsePath]) {
        try {
          let common;
          if (typeof element === "boolean") {
            common = {
              id: parsePath,
              name: parsePath,
              role: "switch",
              type: "boolean",
              write: options.write,
              read: true,
              def: false,
            };
          } else {
            // string or number
            common = {
              id: parsePath,
              name: parsePath,
              role: this.getRole(element, options.write),
              type: typeDp,
              write: options.write,
              read: true,
            };
          }
          await this.adapter.setObjectNotExistsAsync(parsePath, {
            type: 'state',
            common,
            native: { },
          });

          if (common.write === true) {
            this.adapter.subscribeStates(parsePath);
          }

          this.alreadyCreatedObjects[parsePath] = {};
        } catch (error) {
          this.adapter.log.error(`parse error ${  parsePath}`);
          this.adapter.log.error(error);
        }
      }

      await this.changeState(parsePath, valDp, change);

      return;
    }

    const channelName = utils.getLastSegment(parsePath);

    if (!this.alreadyCreatedObjects[parsePath]) {
      try {
          await this.adapter.setObjectNotExistsAsync(parsePath, {
            type: "channel",
            common: {
              name: channelName || ""
            },
            native: {},
          });

        this.alreadyCreatedObjects[parsePath] = { };
      } catch (error) {
        this.adapter.log.error(`parse error ${  parsePath}`);
        this.adapter.log.error(error);
      }
    }

    if (Array.isArray(element)) {
      await this.extractArray(element, "", parsePath, options);
      return;
    }

    // ------------------------           info schleife

    const hasName2 = "name" in (element ?? {});
    if (!hasName2 && this.isObject(element)) {
      element.name = "";
    }

    for (const key of Object.keys(element)) {
      let fullPath = utils.formatObject(`${parsePath}.${key}`);
      let valDP = element[key];

      if (Array.isArray(valDP)) {
        try {
          if (!constant.noInfoDP.includes(key)) {
            await this.extractArray(element, key, parsePath, options);
          }
        } catch (error) {
          this.adapter.log.error(`extractArray ${error}`);
        }
        continue;
      }

      // überspringe bestimmte DP Namen
      if (constant.noInfoDP.includes(key)) {
        continue;
      }

      const isObj = this.isObject(valDP);

      if (isObj) {
        if (Object.keys(valDP).length > 0) {
          options.write = false;
          await this.parse(fullPath, valDP, options);
        }
        continue;
      }

      switch (key) {
        case "ready":
          fullPath = fullPath.replace(".info.", ".");
          break;
        case "status":
          fullPath = fullPath.replace(".info.", ".");
          if (utils.isNumeric(valDP)) {
            valDP = utils.getStatusText(valDP);
          }
          break;
        default:
            break;
      }

      if (!this.alreadyCreatedObjects[fullPath]) {
        const objectName = options.descriptions?.[key] || key;
        let typeDp = this.normalizeType(valDP);

        if (constant.mixedType.includes(key)) {
          typeDp = "mixed";
        }

        fullPath = utils.deleteLastDot(fullPath);
        
        const common = {
          id: objectName,
          name: objectName,
          role: this.getRole(valDP, options, key),
          type: typeDp,
          write: options.write,
          read: true,
        };

        await this.adapter.setObjectNotExistsAsync(fullPath, {
          type: 'state',
          common,
          native: { },
        });

        if (options.write === true) {
          this.adapter.subscribeStates(fullPath);
        }

        this.alreadyCreatedObjects[fullPath] = { };
      }

      try {

        await this.changeState(fullPath, valDP, change);

        if (valDP !== undefined) {
          if (fullPath.endsWith('ready')) {
            const statusVal = element['status'];
            if (utils.isNumeric(statusVal) && statusVal === 3) {
              await this.changeState(fullPath, false);
            }
          }
        }

      } catch (err) {
        this.adapter.log.warn(`ERROR ${valDP} ${JSON.stringify(err)}`);
      }
    }
  }


  /**
   * Checks whether a value is a non-null object.
   *
   * @param {*} value - The value to check.
   * @returns {boolean}
   */
  isObject(value) {
    return value !== null && typeof value === "object";
  }

  /**
   * Extracts and processes an array from an element, creating ioBroker objects for each entry.
   *
   * @param {object|Array} element - The element containing the array, or the array itself.
   * @param {string} key - The key of the array within the element, or empty string if element is the array.
   * @param {string} path - The ioBroker base path to write to.
   * @param {object} options - Parsing options forwarded to the parse method.
   */
  async extractArray(element, key, path, options) {
    try {
      const array = key ? element[key] : element;

      for (let i = 0; i < array.length; i++) {
        const arrayElement = array[i];

        if (typeof arrayElement === "string") {
          const segKey = (key === undefined || key === "") ? arrayElement : key;
          await this.parse(
            `${path}.${segKey}`,
            arrayElement,
            options,
          );
          continue;
        }

        await this.parse(`${path}.${key}`, arrayElement, options);
      }
    } catch (error) {
      this.adapter.log.error(`Cannot extract array ${path}`);
    }
  }

  /**
   * Determines the ioBroker role string for a datapoint based on its value and metadata.
   *
   * @param {*} element - The value or metadata object to derive the role from.
   * @param {object|boolean} options - Parsing options or write flag.
   * @param {string} [dpName] - The datapoint name used to detect time-based roles.
   * @returns {string} The ioBroker role string (e.g. "state", "switch", "text").
   */
  getRole(element, options, dpName) {
    // const write = options.write;
    const hasStates = element && typeof element === "object" && element.states !== undefined;


    if (constant.timeKey.includes(dpName)) {
      // check ob es sich um ein timestamp handelt
      return "value.time";
    }

    if (hasStates) {
      if (element.type === "boolean") {
        delete element.states;
        return "button";
      }
      return "switch";
    }

    if (typeof element === "string") {
      return "text";
    }

    if (typeof element === "boolean") {
      return "switch";
    }


    return "state";
  }
  /**
   * Resolves and normalises the value from a ZWave command class metadata object.
   *
   * @param {object} element - The metadata object containing type, value, min, writeable and readable fields.
   * @returns {*} The resolved and normalised value ready for use as an ioBroker state value.
   */
  resolveCommandClassValue(element) {
    const type = element.type;

    if (!type) {
      return element.value ?? 0;
    }

    if (type === "any" || type === "color") {
      element.type = "mixed";
      return typeof element.value === "object"
        ? JSON.stringify(element.value)
        : element.value;
    }

    if (type.includes("string")) {
      element.type = "mixed";
      if (element.writeable === false) {
        let v = element.value ?? element.min ?? 0;
        if (Array.isArray(v) && v.length) {
          v = JSON.stringify(v);
        }
        return v;
      }
      return element.value ?? element.min ?? 0;
    }

    if (type.includes("buffer")) {
      element.type = "mixed";
      if (element.writeable === false) {
        let v = element.value ?? element.min ?? 0;
        if (Array.isArray(v) && v.length) {
          v = v[0];
        }
        return v;
      }
      return element.value ?? element.min ?? 0;
    }

    if (type === "duration") {
      element.type = "mixed";
      let v = element.value ?? element.min ?? 0;
      if (typeof v === "object") {
        if (v?.unit) {
          element.unit = v.unit;
        }
        v = 0;
      }
      return v;
    }

    if (type === "number") {
      if (element.value != null) {
        return utils.isNumeric(element.value) ? element.value : 0;
      }
      return element.min ?? 0;
    }

    return element.readable === false
      ? false
      : (element.value ?? (type === "boolean" ? false : (element.min ?? 0)));
  }


  /**
   * Creates the ready and status state objects directly on the node device.
   *
   * @param {string} nodeId - The formatted node ID used as the ioBroker object path prefix.
   */
  async createReadyStatus(nodeId) {
     // leg die status direkt auch an
      let common = {
        id: 'ready',
        name: 'ready',
        role: 'indicator.reachable',
        type: 'boolean',
        write: false,
        read: true,
        def: false,
      };
      await this.adapter.setObjectNotExistsAsync(`${nodeId}.ready`, {
        type: 'state',
        common,
        native: {},
      });

      common = {
        id: 'status',
        name: 'status',
        role: 'state',
        type: 'string',
        write: false,
        read: true,
      };

      await this.adapter.setObjectNotExistsAsync(`${nodeId}.status`, {
        type: 'state',
        common,
        native: {},
      });
  }
  /**
   * Updates the name or description of an existing ioBroker device object.
   *
   * @param {string} nodeId - The ioBroker object ID of the device to update.
   * @param {object} element - The element containing the new name, productLabel, manufacturer or desc.
   * @param {boolean} [nameChange] - If true, updates the common name; otherwise updates the description.
   */
  async updateDevice(nodeId, element, nameChange = true) {
    const obj = await this.adapter.getObjectAsync(nodeId);
    if (!obj) {
return;
}

    obj.common = obj.common ?? {};

    if (nameChange) {
      const newName = element.name || element.productLabel || element.manufacturer || element.newValue;
      if (newName !== undefined && obj.common.name !== newName) {
        obj.common.name = newName;
        await this.adapter.setObjectAsync(nodeId, obj);
      }
    } else {
      const newDesc = element.desc;
      if (newDesc !== undefined) {
        obj.common.desc = newDesc;
        await this.adapter.setObjectAsync(nodeId, obj);
      }
    }
  }

  /**
   * Sets or conditionally updates an ioBroker state value.
   *
   * @param {string} path - The ioBroker state ID to set.
   * @param {*} value - The value to write to the state.
   * @param {boolean} [change] - If true, uses setState (unconditional); otherwise uses setStateChanged.
   */
  async changeState(path, value, change = false) {
    if (change) {
      await this.adapter.setStateAsync(path, value, true);
    } else {
      await this.adapter.setStateChangedAsync(path, value, true);
    }
  }

}

module.exports = {
  Helper: Helper,
};
