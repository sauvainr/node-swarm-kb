'use strict';

const DEFAULTOPTIONS = { };
var Kubernetes = require('./kubernetes'); // var because it may be overloaded if 'standalone' is set ti true.
const Messages = require('./messages');
const Tasks = require('./tasks');
const localIps = require('./localIps');
const Promise = require('bluebird');
const appPackage = require('../package.json');
const debug = require('debug')(appPackage.name);

debug(`Loading.. localIps: ${localIps}`);

/**
* Module class
*
* @param {object} options
**/
function init (options) {
  if (options && typeof options === 'object') {
    Object.keys(this._handlers).forEach(eventName =>
      (onEventName =>
        options[onEventName] && this._handlers[eventName].indexOf() === -1 && this._handlers[eventName].push(options[onEventName])
      )(`on${eventName.charAt(0).toUpperCase()}${eventName.slice(1)}`));
  }
  if (this._inited) {
    return Promise.resolve(this.nodes);
  }
  this._inited = true;
  Object.assign(this.options, options);

  return new Promise((resolve, reject) => {
    if (this.options.standalone) {
      Kubernetes = require('./standalone');
    }

    /* Start node management */
    this._kubernetes = new Kubernetes(Object.assign(this.options, {
      onNodeAdded: (node) =>
        localIps.indexOf(node.ip) === -1 && (
          debug(`New Ip ${node.ip} added to cluster!`) ||
          module.exports._handlers.nodeAdded.forEach((handler) => handler(node))
        ),
      onNodeRemoved: (node) =>
        localIps.indexOf(node.ip) === -1
        ? (
          debug(`Ip ${node.ip} removed from cluster!`) ||
          module.exports._handlers.nodeRemoved.forEach((handler) => handler(node))
        ) : (
          debug(`Local Ip ${node.ip} removed from cluster, triggering SIGTERM!`) ||
          process.emit('SIGTERM')
        ),
      onError: (error) => {
        debug(`[Error] kubernetes Error: ${error.message}!`);
        reject(error);
        return module.exports._handlers.error.map((handler) => handler(error));
      },
      onReady: (nodes) => {
        debug(`kubernetes Ready with ${Object.keys(nodes).length} nodes.`);

        // elect the cluster master
        this._election();
        // When the master is removed, elect a new master
        this.on('nodeRemoved', (node) =>
          node.ip === this.master && this._election());

        module.exports.isReady = true;
        resolve(nodes);
        return module.exports._handlers.ready.map((handler) => handler(nodes));
      }
    }));

    /* Start and link the inter-node communication */
    this.messages = new Messages(Object.assign(this.options.messages || {}, {
      onError: (error) =>
        debug(`[Error] messages Error: ${error.message}!`) ||
        module.exports._handlers.error.map((handler) => handler(error))
    }));

    // Add the tasks processing module
    this.tasks = new Tasks(this, this.options.tasks);
  });
}

module.exports = {
  isReady: false,
  _inited: false,
  init,
  /* Set Accessors to Kubernetes nodes : key = ip, value = info object */
  get nodes () {
    return this._kubernetes && this._kubernetes.nodes || {};
  },
  options: Object.assign({}, DEFAULTOPTIONS),
  _handlers: {
    ready: [],
    error: [],
    nodeAdded: [],
    nodeRemoved: []
  },

  /**
  * Add a listener to one event
  * @param {string} event - event name to listen on
  * @param {function} handler - function to execute
  **/
  on (event, handler) {
    if (this._handlers[event].indexOf(handler) === -1) {
      this._handlers[event].push(handler);
    }
  },
  /**
  * Send a message to a node of the cluster
  * @param {string|object} node - destination node
  * @param {string|string[]} topic - message topic
  * @param {string|object} message - data to send
  * @return {promise}
  **/
  send (node, topic, message) {
    var error;
    if (!topic || !topic.length) {
      error = new Error('Unable to send message: Missing topic');
    }
    if (!node) {
      error = new Error('Unable to send message: Missing node');
    }
    if (error) {
      debug(`[Error] ${error.message}!`);
      this._handlers.error.map((handler) => handler(error));
      return Promise.reject(error);
    }

    if (message === undefined) {
      return this.broadcast(node, topic);
    }

    // dont send message to yourself
    if (localIps.indexOf(node.ip || node) !== -1) {
      return Promise.resolve();
    }

    return this.messages.send(node.ip || node, topic, message);
  },
  /**
  * Send a message to all nodes of the cluster
  * @param {string|string[]} topic - message topic
  * @param {string|object} message - to send
  * @return {promise}
  **/
  broadcast (topic, message) {
    return Promise.all(
      Object.keys(module.exports._kubernetes.nodes).map((ip) => this.send(ip, topic, message))
    );
  },
  // function regarding cluster master
  master: null,
  _election () {
    // for now a simple election, the smallest ip wins
    this.master = Object.keys(this.nodes).sort()[0];
    debug(`New Master elected: ${this.master}`);
    return this.master;
  },
  /**
  * Indicate if this server is the master of the cluster
  * @return {boolean}
  **/
  get amIMaster () {
    return localIps.indexOf(this.master) !== -1;
  },
  /**
  * Indicate if this server is the given node
  * @param {object<node>|string} node - the node or ip to test
  * @return {boolean}
  **/
  isMe (node) {
    return localIps.indexOf(node.ip || node) !== -1;
  }
};
