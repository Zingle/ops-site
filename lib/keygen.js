const {randomBytes} = require("crypto");

/**
 * @param {number} length
 * @returns {string}
 */
function keygen(length) {
    return randomBytes(length).toString("hex");
}

module.exports = keygen;
