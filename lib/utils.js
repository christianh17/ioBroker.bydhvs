/**
 * Converts a byte array to a word array.
 *
 * @param {number[]} ba - The byte array to convert.
 */
function bytesArrayToWordArray(ba) {
  const wa = [];
  for (let i = 0; i < ba.length; i++) {
    wa[(i / 2) | 0] |= ba[i] << (8 * (i % 2));
  }
  return wa;
}

// If the value is greater than 1000, kelvin is assumed.
// If smaller, it is assumed to be mired.
/**
 * Converts a temperature value to mired.
 *
 * @param {number} t - Temperature value in Kelvin or mired.
 */
function toMired(t) {
  let miredValue = t;
  if (t > 1000) {
    miredValue = miredKelvinConversion(t);
  }
  return miredValue;
}

/**
 * Converts between mired and Kelvin.
 *
 * @param {number} t - Temperature value to convert.
 */
function miredKelvinConversion(t) {
  return Math.round(1000000 / t);
}

/**
 * Converts a decimal number to a hex string with zero-padding
 *
 * @param {number} decimal - The decimal number to convert.
 * @param {number} padding - The minimum length of the resulting hex string.
 */
function decimalToHex(decimal, padding = 2) {
  let hex = Number(decimal).toString(16);

  while (hex.length < padding) {
    hex = `0${hex}`;
  }

  return hex;
}

/**
 * Removes all elements from an array in place.
 *
 * @param {any[]} array - The array to clear.
 */
function clearArray(array) {
  while (array.length > 0) {
    array.pop();
  }
}

/**
 * Moves all elements from source array into target array.
 *
 * @param {any[]} source - The source array to move elements from.
 * @param {any[]} target - The target array to move elements into.
 */
function moveArray(source, target) {
  while (source.length > 0) {
    target.push(source.shift());
  }
}

/**
 * Checks whether a value is a plain object.
 *
 * @param {any} item - The value to check.
 */
function isObject(item) {
  return typeof item === "object" && !Array.isArray(item) && item !== null;
}

/**
 * Checks whether a value is valid JSON.
 *
 * @param {any} item - The value to check.
 */
function isJson(item) {
  let value = typeof item !== "string" ? JSON.stringify(item) : item;
  try {
    value = JSON.parse(value);
  } catch (e) {
    return false;
  }

  return typeof value === "object" && value !== null;
}

/**
 * Returns the last segment of a dot- or slash-separated string.
 *
 * @param {string} input - The input string to parse.
 */
function getLastSegment(input) {
  if (typeof input !== "string") {
    return "";
  }
  const parts = input.split(/[./]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/**
 * Checks whether a value is numeric (finite number or numeric string).
 *
 * @param {any} value - The value to check.
 * @returns {boolean}
 */
function isNumeric(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") {
      return false;
    }
    return /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(s);
  }
  return false;
}

/**
 * Replaces the last dot in a string with an underscore.
 *
 * @param {string} str - The string to process.
 */
function replaceLastDot(str) {
  if (typeof str !== "string") {
return "";
}
  const idx = str.lastIndexOf(".");
  return idx >= 0 ? `${str.slice(0, idx)}_${str.slice(idx + 1)}` : str;
}

/**
 * Removes a trailing dot from a string if present.
 *
 * @param {string|undefined} str - The string to process.
 */
function deleteLastDot(str) {
  if (typeof str !== "string") {
return "";
}
  return str.endsWith(".") ? str.slice(0, -1) : str;
}

/**
 * Trims and normalises an object name string.
 *
 * @param {string} str - The string to format.
 */
function formatObject(str) {
  if (typeof str !== "string") {
    return "";
  }
  return str.trim().replace(/₂/g, "2").replace(/\s+/g, "_");
}

/**
 * Replaces all dots in an MQTT topic with slashes.
 *
 * @param {string} input - The MQTT topic string to format.
 */
function formatMQTT(input) {
  if (typeof input !== "string") {
    return "";
  }
  return input.replace(/\./g, "/");
}

/**
 * Zero-pads the numeric suffix of a node ID string.
 *
 * @param {string} nodeId - The node ID string to pad.
 * @param {number} [width] - The desired minimum width of the numeric part.
 */
function padNodeId(nodeId, width = 3) {
  return nodeId.replace(/(\d+)$/, (m) => m.padStart(width, "0"));
}

/**
 * Returns a human-readable status text for a given node status code.
 *
 * @param {number} status - The numeric status code.
 */
function getStatusText(status) {
  const nodeStatus = {
    0: "Unknown",
    1: "asleep",
    2: "awake",
    3: "dead",
    4: "alive",
  };

  return nodeStatus[status] || "Unknown";
}

/**
 * Formats a node ID, padding numeric IDs with a prefix.
 *
 * @param {string|number} nodeIdOriginal - The original node ID to format.
 */
function formatNodeId(nodeIdOriginal) {
  let nodeId = nodeIdOriginal;

  if (isNumeric(nodeIdOriginal)) {
    nodeId = padNodeId(`nodeID_${nodeIdOriginal}`);
  }
  return nodeId;
}

module.exports = {
  bytesArrayToWordArray,
  toMired,
  miredKelvinConversion,
  decimalToHex,
  formatNodeId,
  clearArray,
  moveArray,
  isObject,
  isJson,
  getLastSegment,
  isNumeric,
  replaceLastDot,
  formatMQTT,
  padNodeId,
  getStatusText,
  formatObject,
  deleteLastDot,
};
