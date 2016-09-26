'use strict';

const DEFAULTOPTIONS = {
  port: 45892
};
const Kubernetes = require('./kubernetes');
const Propagation = require('./propagation');
const localIps = require('./localIps');
console.log(`[node-swarm-kb] localIps: ${localIps}`);

/**
* Module class
*
* @param {object} options
**/
function init (options) {
  Object.assign(this.options, options);

  return new Promise((resolve, reject) => {
    Object.keys(this._handlers).forEach((eventName) =>
      (onEventName) =>
        this.options[onEventName] && this._handlers[eventName].push(this.options[onEventName])(`on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`));

    /* Start node management */
    this._kubernetes = new Kubernetes(Object.assign(this.options, {
      onNodeAdded: (node) =>
        localIps.indexOf(node.ip) === -1
        ? module.exports._handlers.nodeAdded.forEach((handler) => handler(node))
        : console.log(`[node-swarm-kb] Local ip added to cluster!`),
      onNodeRemoved: (node) =>
        localIps.indexOf(node.ip) === -1
        ? module.exports._handlers.nodeRemoved.forEach((handler) => handler(node))
        : console.warn(`[node-swarm-kb] Local ip removed, emitting SIGTERM!`) ||
          process.emit('SIGTERM'),
      onError: (error) => {
        reject(error);
        module.exports._handlers.error.length
        ? module.exports._handlers.error.map((handler) => handler(error))
        : console.error('[node-swarm-kb] kubernetes Error', error);
      },
      onReady: (nodes) => {
        console.log(`[node-swarm-kb] kubernetes Ready with ${Object.keys(nodes).length} nodes`);
        resolve(nodes);
        module.exports._handlers.ready.map((handler) => handler(nodes));
      }
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
//  nodes: {}, set bellow
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
  send: function (node, message) {
    if (!node) {
      const error = new Error('[node-swarm-kb] send Error: Missing node');
      if (this._handlers.error.length) {
        this._handlers.error.map((handler) => handler(error));
      } else {
        console.error(error);
      }
      return Promise.reject(error);
    }

    // dont send message to yourself
    if (localIps.indexOf(node.ip || node) !== -1) {
      return Promise.resolve();
    }
    if (message === undefined) {
      return this.broadcast(node);
    }
    module.exports._propagation.send(node.ip || node, message);
  },
  broadcast: function (message) {
    return Promise.all(
      Object.keys(module.exports._kubernetes.nodes).map((ip) => this.send(message, ip))
    );
  }
};

/* Set Accessors to Kubernetes nodes */
Object.defineProperty(module.exports, 'nodes', {
  get: function () {
    return this._kubernetes && this._kubernetes.nodes || {};
  },
  enumerable: true
});
