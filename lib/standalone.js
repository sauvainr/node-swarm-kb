const localIps = require('./localIps');
const Promise = require('bluebird');

/**
* This class replace Kubernetes if there is not cluster
* @param {object} options - see the readme
*/
function StandAlone (options) {
  this._handlers = {};
  this.resourceVersions = {};
  this.options = Object.assign({}, options && options.kubernetes);
  for (const p in options) {
    if (typeof options[p] === 'function') {
      this.options[p] = options[p];
    }
  }
  this._nodes = localIps.reduce((nodes, ip) => {
    nodes[ip] = { ip };
    return nodes;
  }, {});
  /* Set Accessors to avoid another component to erase it */
  Object.defineProperty(this, 'nodes', {
    get: function () {
      return this._nodes;
    },
    enumerable: true
  });

  if (typeof this.options.onReady === 'function') {
    // ensure the Object is instanciate before the event is triggered
    setTimeout(_ => {
      this.options.onReady(this.nodes);
      delete this.options.onReady;
    }, 10);
  }
}

function on (topic, handler) {
  if (topic instanceof Array) {
    return topic.forEach(topic => this.on(topic, handler));
  }
  if (!this._handlers[topic]) {
    this._handlers[topic] = [];
  }
  this._handlers[topic].push(handler);
}

function send (host, topic, message) {
  if (typeof host !== 'string') {
    return Promise.reject(new Error(`Send Error, parameter host needs to be a string, ${typeof host} found.`));
  }
  if (typeof topic !== 'string' && !(topic instanceof Array)) {
    return Promise.reject(new Error(`Send Error, parameter topic needs to be a string or an Array, ${typeof host} found.`));
  }

  return Promise.map(this._handlers[topic] || [], handler =>
    Promise.try(_ => handler(message, topic, host)))
  .timeout(300000); // 5 minute timeout just to make sure we dont accumulate garbage
}

StandAlone.prototype = {
  _handlers: null,
  resourceVersions: null, // for sync update, init in constructor
  // Get list of nodes
  getNodes () {
    return this.nodes;
  }, // getNodes
  on,
  send
};

module.exports = StandAlone;
