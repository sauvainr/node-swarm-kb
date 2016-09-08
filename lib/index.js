'use strict';

const DEFAULTOPTIONS = {
  port: 45892
};
const Kubernetes = require('./kubernetes');
const Propagation = require('./propagation');

/**
* Module class
*
* @param {object} options
**/
function init (options) {
  Object.assign(this.options, options || {});

  return new Promise((resolve, reject) => {
    Object.keys(this._handlers).forEach((eventName) =>
      (onEventName) =>
        this.options[onEventName] && this._handlers[eventName].push(this.options[onEventName])(`on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`));

    /* Start node management */
    this._kubernetes = new Kubernetes(Object.assign(this.options, {
      onPodAdded: (node) =>
        module.exports._handlers.nodeAdded.forEach((handler) => handler(node)),
      onPodRemoved: (node) =>
        module.exports._handlers.nodeRemoved.forEach((handler) => handler(node)),
      onError: (error) =>
        reject(error) &&
        module.exports._handlers.error.length
        ? module.exports._handlers.error.map((handler) => handler(error))
        : console.error('[node-swarm-kb] kubernetes Error', error),
      onReady: (nodes) =>
        resolve(nodes) &&
        module.exports._handlers.ready.map((handler) => handler(nodes))
    }));

    /* Start and link the inter-node communication */
    this._propagation = new Propagation(Object.assign(this.options, {
      onMessage: (ip, message) =>
        module.exports._handlers.message.forEach((handler) => handler(module.exports._kubernetes.nodes[ip], message)),
      onError: (error) =>
        module.exports._handlers.error.length
        ? module.exports._handlers.error.map((handler) => handler(error))
        : console.error('[node-swarm-kb] propagation Error', error)
    }));
  });
}

module.exports = {
  init,
  options: Object.assign({}, DEFAULTOPTIONS),
  nodes: {},
  _handlers: {
    ready: [],
    error: [],
    message: [],
    nodeAdded: [],
    nodeRemoved: []
  },
  on: function (event, handler) {
    if (typeof event === 'function') {
      handler = event;
      event = 'message';
    }
    if (this._handlers[event].indexOf(handler) === -1) {
      this._handlers[event].push(handler);
    }
  },
  send: function (host, message) {
    if (!host) {
      const error = new Error('[node-swarm-kb] send Error: Missing Host');
      if (this._handlers.error.length) {
        this._handlers.error.map((handler) => handler(error));
      } else {
        console.error(error);
      }
      return Promise.reject(error);
    }
    if (message === undefined) {
      return this.broadcast(host);
    }
    module.exports._propagation.send(host.ip || host, message);
  },
  broadcast: function (message) {
    return Promise.all(
      Object.keys(module.exports._kubernetes.nodes).map((ip) => this.send(message, ip))
    );
  }
};
