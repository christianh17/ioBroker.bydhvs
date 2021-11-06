const path = require("path");
const { tests } = require("@iobroker/testing");

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
//tests.integration(path.join(__dirname, ".."));

// Run tests
tests.packageFiles(path.join(__dirname, ".."));
//                 ~~~~~~~~~~~~~~~~~~~~~~~~~
// This should be the adapter's root directory