'use strict';

const localIps = require('./localIps');

/**
* This class replace Kubernetes if there is not cluster
* @param {object} options - see the readme
*/
function StandAlone (options) {
  this.resourceVersions = {};
  this.options = Object.assign({}, options && options.kubernetes);
  for (var p in options) {
    if (typeof options[p] === 'function') {
      this.options[p] = options[p];
    }
  }
  this._nodes = localIps.reduce((nodes, ip) => {
    nodes[ip] = {ip};
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
    // insure the Object is instanciate before the event is triggered
    setTimeout(_ => {
      this.options.onReady(this.nodes);
      delete this.options.onReady;
    }, 10);
  }
}

StandAlone.prototype = {
  resourceVersions: null, // for sync update, init in constructor
  // Get list of nodes
  getNodes () {
    return this.nodes;
  } // getNodes
};

module.exports = StandAlone;
