'use strict';

/**
* This module is in charge of transmitting message to other pods
* It uses basic POST Http request wherere
* The request path is the message topic in the format main/sub/sub
* The request body is the message content
**/

const localIps = require('../lib/localIps');
const Http = require('http');

function messageHandler (request, response) {
  response.writeHead(200, {'Content-Type': 'application/json'});
  if (request.url.match(/watch/)) {
    console.log(`[node-swarm-kb] kbShim: watching..`);
    return setTimeout(_ => {
      console.log(`[node-swarm-kb] kbShim: Closing watch!`);
      response.end('{}');
    }, 30000);
  }
  console.log(`[node-swarm-kb] kbShim: Replying to request..`);
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
  console.log(`[node-swarm-kb] kbShim: Listening on ${bind}`);
});
