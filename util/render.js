const path = require('path');
const debug = require("debug")("user:render");
const nunjucks = require('nunjucks');
const util = require('util');
const numeral = require("numeral");
const { localized } = require("../lib/membership");
const { alertMsg } = require("../lib/alert");
const { cstFormatter } = require("../lib/date-time")

const env = nunjucks.configure(
  [
    path.resolve(__dirname, '../view'),
    path.resolve(__dirname, '../client')
  ], 
  {
    noCache: process.env.NODE_ENV === 'development',
    watch: process.env.NODE_ENV === 'development'
  }
);

/**
 * Conert a number to currency string.
 */
env.addFilter("toCurrency", function(num) {
  return numeral(num).format("0,0.00");
});

env.addFilter("localize", function(key) {
  if (localized.hasOwnProperty(key)) {
    return localized[key];
  }

  return key;
});

env.addFilter("showAlert", function(key) {
  if (alertMsg.hasOwnProperty(key)) {
    return alertMsg[key];
  }

  return key;
});

env.addFilter("toCST", function(str) {
  try {
    return cstFormatter.fromISO8601(str);
  } catch (e) {
    debug(e);
    return str
  }
  
});

module.exports = util.promisify(nunjucks.render);
