'use strict';

/**
 This clustering strategy works by loading all pods in the current Kubernetes
 namespace with the configured tag. It will fetch the addresses of all pods with
 that tag and attempt to connect. It will continually monitor and update it's
 connections every 10s.
*/

const Promise = require('bluebird');
const Fs = Promise.promisifyAll(require('fs'));
const Rp = require('request-promise');

// Contains the nodes informations
const DEFAULTOPTIONS = {
  serviceAccountPath: '/var/run/secrets/kubernetes.io/serviceaccount',
  kubernetesMaster: 'kubernetes.default.svc.cluster.local',
  selector: process.env.kubernetes_selector,
  refreshInterval: 10000
};

const OPENSHIFT_APP_NAME = process.env.OPENSHIFT_BUILD_NAME && process.env.OPENSHIFT_BUILD_NAME.match(/(.*)-[0-9]+$/);
if (OPENSHIFT_APP_NAME && OPENSHIFT_APP_NAME.length) {
  DEFAULTOPTIONS.appName = OPENSHIFT_APP_NAME[1];
}

function Kubernetes (options) {
  this.options = Object.assign(Object.assign({}, DEFAULTOPTIONS), options || {});
  if (this.options.appName && !this.options.selector) {
    this.options.selector = `app=${this.options.appName}`;
  }
  const _nodes = {};
  /* Set Accessors */
  Object.defineProperty(this, 'nodes', {
    get: function () {
      return _nodes;
    },
    enumerable: true
  });

  this.getNodes()
  .catch((error) => this.options.onError && this.options.onError(error) || console.error(error))
  .then((nodes) => this.options.onReady && this.options.onReady(nodes));
  setInterval(() => this.getNodes, this.options.refreshInterval);
}

Kubernetes.prototype = {

  // Load a file from OC configuration
  _getFileContent: function _getFileContent (file) {
    return Fs
    .readFileAsync(`${this.options.serviceAccountPath}/${file}`, 'utf8')
    .then((data) => data.trim());
  },

  // Get list of nodes
  getNodes: function getNodes () {
    if (!this.options.kubernetesMaster || !this.options.serviceAccountPath) {
      return Promise.reject(new Error('Missing parameter'));
    }

    const qs = {};
    if (this.options.selector) {
      qs['labelSelector'] = encodeURIComponent(this.options.selector);
    }

    return Promise.join(
      this._getFileContent('token'),
      this._getFileContent('namespace')
    ).spread((token, namespace) =>
      Rp({
        url: `https://${this.options.kubernetesMaster}/api/v1/namespaces/${namespace}/endpoints`,
        headers: {
          'authorization': `Bearer ${token}`
        },
        qs: qs,
        json: true,
        strictSSL: false,
        agentOptions: {
          host: this.options.kubernetesMaster,
          port: 443,
          rejectUnauthorized: false
        }
      })
    )
    .then((result) => {
      var removed = Object.keys(this.nodes);
      result.forEach((currentNodes, node) => {
        var i = currentNodes.indexOf(node.ip);
        if (i === -1) {
          this.nodes[node.ip] = node;
          if (typeof this.options.onNodeAdded === 'function') {
            this.options.onNodeAdded(node);
          }
        } else {
          removed.splice(i, 1);
        }
      });
      removed.forEach((ip) => {
        if (typeof this.options.onNodeRemoved === 'function') {
          this.options.onNodeRemoved(this.nodes[ip]);
        }
        delete this.nodes[ip];
      });
      return this.nodes;
    })
    .catch((error) => {
      console.error('[node-swarm-kb] kubernetes.getNodes Error', error);
    });
  } // getNodes
};

module.exports = Kubernetes;
