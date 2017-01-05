'use strict';

/**
* This module is in charge of transmitting message to other pods
**/

const http = require('http');
const rp = require('request-promise');
const appPackage = require('../package.json');
const debug = require('debug')(`${appPackage.name} [propagation]`);

module.exports = function (options, listener) {
  this.server = http.createServer(function (request, response) {
    options.onMessage(request.connection.remoteAddress, request.host);
    response.end();
  });
  this.server.listen(options.port);
  this.server.on('listening', () => {
    const addr = this.server.address();
    const bind = typeof addr === 'string'
      ? `pipe ${addr}`
      : `port ${addr.port}`;
    debug(`Listening on ${bind}`);
  });

  this.send = function send (host, message) {
    return rp({
      url: host,
      method: 'POST',
      port: options.port,
      body: typeof message === 'string' && message,
      json: typeof message !== 'string' && message
    });
  };
};
