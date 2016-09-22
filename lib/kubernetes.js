'use strict';

/**
 This clustering strategy works by loading all pods in the current Kubernetes
 namespace with the configured tag. It will fetch the addresses of all pods with
 that tag and attempt to connect. It will continually monitor and update it's
 connections every 10s.
*/

const Promise = require('bluebird');
const Rp = require('request-promise');
const Fs = require('fs');

// Load a file from OC configuration
function _getFileContent (file) {
  try {
    return Fs.readFileSync(`${this.options.folderPath}/${file}`, 'utf8').trim();
  } catch (_) {}
}

// Contains the nodes informations
const DEFAULTOPTIONS = {
  appName: process.env.OPENSHIFT_BUILD_NAME && process.env.OPENSHIFT_BUILD_NAME.match(/(.*)-[0-9]+$/)[1] || process.env.HOSTNAME && process.env.HOSTNAME.split('-')[0],
  folderPath: process.env.KUBERNETES_FOLDER_PATH || '/var/run/secrets/kubernetes.io/serviceaccount',
  host: process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc.cluster.local',
  port: process.env.KUBERNETES_SERVICE_PORT || 443,
  selector: process.env.KUBERNETES_SELECTOR,
  token: _getFileContent('token'), // from folderPath.token
  namespace: _getFileContent('namespace'), // from folderPath.namespace
  ca: _getFileContent('ca'), // from folderPath.ca
  refreshInterval: 5000 // how often topology changes are checked
};

function Kubernetes (options) {
  this.options = Object.assign(Object.assign({}, DEFAULTOPTIONS), options && options.kubernetes || {});
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

  if (!this.options.selector) {
    this._error('Missing option: selector or appName');
  }
  if (!this.options.token) {
    this._error('Missing option: token');
  }
  if (!this.options.namespace) {
    this._error('Missing option: namespace');
  }

  this.getNodes()
  .catch((error) => this._error(error))
  .then((nodes) => this.options.onReady && this.options.onReady(nodes));
  setInterval(() => this.getNodes, this.options.refreshInterval);
}

Kubernetes.prototype = {
  _error: function _error (error, data) {
    this.options.onError && this.options.onError(error, data) || console.error(`[node-swarm-kb] kubernetes ${error}`, data);
  },
  // Get list of nodes
  getNodes: function getNodes () {
    if (!this.options.host || !this.options.folderPath) {
      return Promise.reject(new Error('Missing parameter'));
    }

    return Rp({
      url: `https://${this.options.host}:${this.options.port}/api/v1/namespaces/${this.options.namespace}/endpoints`,
      headers: {
        'authorization': `Bearer ${this.options.token}`
      },
      qs: {
        labelSelector: this.options.selector
      },
      json: true,
      strictSSL: false,
      agentOptions: {
        host: this.options.host,
        port: this.options.port,
        ca: this.options.ca,
        rejectUnauthorized: false
      }
    })
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
    .catch((error) => this._error('getNodes Error', error));
  } // getNodes
};

module.exports = Kubernetes;
