'use strict';

/**
* This module is in charge of transmitting message to other pods
* It uses basic POST Http request wherere
* The request path is the message topic in the format main/sub/sub
* The request body is the message content
**/

const localIps = require('../lib/localIps');
const Http = require('http');
const appPackage = require('../package.json');
const debug = require('debug')(`${appPackage.name} [KbShim]`);

function messageHandler (request, response) {
  response.writeHead(200, {'Content-Type': 'application/json'});
  if (request.url.match(/watch/)) {
    debug(`Watching.. ${request.url}`);
    return setTimeout(_ => {
      debug(`Closing ${request.url} watch!`);
      response.end('{}');
    }, 30000);
  }
  debug(`Replying to request ${request.url}..`);
  response.end(JSON.stringify({
    items: [{
      subsets: [{
        addresses: localIps.map(ip => ({ ip: ip }))
      }]
    }]
  }));
}

const server = Http.createServer(messageHandler);
server.listen(12345);
server.on('listening', _ => {
  const addr = server.address();
  const bind = typeof addr === 'string'
    ? `pipe ${addr}`
    : `port ${addr.port}`;
  debug(`Listening on ${bind}..`);
});
