'use strict';

/**
* This module is in charge of transmitting message to other pods
* It uses basic POST Http request wherere
* The request path is the message topic in the format main/sub/sub
* The request body is the message content
**/

const Http = require('http');
const Rp = require('request-promise');
const Promise = require('bluebird');

const DEFAULTOPTIONS = {
  port: 45892,
  maxProcessingTime: 5 * 60000, // maximum time to a given message process
  onError (error) {
    console.error(`[node-swarm-kb] Messages Error: ${error.message}`);
  }
};

function messageHandler (request, response) {
  // Ultra slim request management
  var from = request.connection.remoteAddress;
  var topics = request.url.replace(/^\/|\/$/g, '').split('/');
  var chunks = [];
  if (request.method === 'POST' || request.method === 'PUT') {
    request.on('data', chunk =>
      chunks.push(chunk.toString()));
  }
  console.log(`[node-swarm-kb] Messages received: ${topics} from ${from}`);
  request.on('end', _ => {
    var body = chunks.join('');
    if (request.headers['content-type'] === 'application/json') {
      try {
        body = JSON.parse(body);
      } catch (err) {
        response.writeHead(400);
        response.end(`Unable to decode request body: ${err.message}`);
        return;
      }
    }

    // Handle message
    var tasks = Promise.all(
      topics.reduce((acc, topic) =>
        topic in this._handlers
        ? acc.concat(this._handlers[topic].map(handler =>
          Promise.try(_ => handler(body, topics, from))))
        : acc
        , []))
    .timeout(this.options.maxProcessingTime); // 5 minute timeout just to make sure we dont accumulate garbage

    // Response management
    tasks.then(result => {
      if (result.length <= 1) {
        result = result.pop();
      }
      if (result === undefined) {
        response.writeHead(204);
      } else if (typeof result !== 'string') {
        response.writeHead(200, {'Content-Type': 'application/json'});
        try {
          result = JSON.stringify(result);
        } catch (err) {
          return Promise.reject(new Error(`messageHandler: Unable to stringify response ${err.message}`));
        }
      }
      response.end(result);
    })
    .catch(error =>
      this.onError(error));

    // Error management
    tasks.catch(error => {
      console.log(`[node-swarm-kb] Messages.messageHandler: sending error : ${error.message}`);

      try {
        response.writeHead(error.statusCode || 500);
        response.end(error.message);
      } catch (err) {
        this.onError(new Error(`messageHandler: sending error failed with ${err.message}`));
      }
    });
  });
}

function Messages (options) {
  this._handlers = {};
  this.options = Object.assign(Object.assign({}, DEFAULTOPTIONS), options);
  this.on = function (topic, handler) {
    if (topic instanceof Array) {
      return topic.forEach(topic => this.on(topic, handler));
    }
    if (!this._handlers[topic]) {
      this._handlers[topic] = [];
    }
    this._handlers[topic].push(handler);
  };
  this.onError = this.options.onError;
  this.server = Http.createServer(messageHandler.bind(this));
  this.server.listen(this.options.port);
  this.server.on('listening', _ => {
    const addr = this.server.address();
    const bind = typeof addr === 'string'
      ? `pipe ${addr}`
      : `port ${addr.port}`;
    console.log(`[node-swarm-kb] Messages: Listening on ${bind}`);
  });

  this.send = function send (host, topic, message) {
    if (typeof host !== 'string') {
      return Promise.reject(new Error(`Send Error, parameter host needs to be a string, ${typeof host} found.`));
    }
    if (typeof topic !== 'string' && !(topic instanceof Array)) {
      return Promise.reject(new Error(`Send Error, parameter topic needs to be a string or an Array, ${typeof host} found.`));
    }
    return Rp({
      uri: `http://${host}:${this.options.port}/${topic instanceof Array ? topic.join('/') : topic || ''}`,
      method: 'POST',
      body: typeof message === 'string' && message,
      json: typeof message !== 'string' && message
    });
  };
}

module.exports = Messages;
