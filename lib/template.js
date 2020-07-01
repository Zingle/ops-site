const {readFile} = require("fs");

function sendFile(path, options, done) {
    options.filename = path;
    readFile(path, done);
}

module.exports = {sendFile};
