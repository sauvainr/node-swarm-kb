'use strict';

/**
 This clustering strategy works by loading all pods in the current Kubernetes
 namespace with the configured tag. It will fetch the addresses of all pods with
 that tag and attempt to connect. It will continually monitor and update it's
 connections every 10s.
*/

const Rp = require('request-promise');
const Fs = require('fs');

// Contains the nodes informations
const DEFAULTOPTIONS = {
  appName: process.env.OPENSHIFT_BUILD_NAME && process.env.OPENSHIFT_BUILD_NAME.match(/(.*)-[0-9]+$/)[1] || process.env.HOSTNAME && process.env.HOSTNAME.split('-')[0],
  folderPath: process.env.KUBERNETES_FOLDER_PATH || '/var/run/secrets/kubernetes.io/serviceaccount',
  host: process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc.cluster.local',
  port: process.env.KUBERNETES_SERVICE_PORT || 443,
  selector: process.env.KUBERNETES_SELECTOR,
  token: null, // from folderPath.token
  namespace: null, // from folderPath.namespace
  ca: null, // from folderPath.ca
  refreshInterval: 10000 // how often topology changes are checked
};

function Kubernetes (options) {
  this.options = Object.assign(Object.assign({}, DEFAULTOPTIONS), options && options.kubernetes);
  for (var p in options) {
    if (typeof options[p] === 'function') {
      this.options[p] = options[p];
    }
  }
  if (this.options.appName && !this.options.selector) {
    this.options.selector = `app=${this.options.appName}`;
  }

  this._nodes = {};
  /* Set Accessors to avoid another component to erase it */
  Object.defineProperty(this, 'nodes', {
    get: function () {
      return this._nodes;
    },
    enumerable: true
  });

  if (!this.options.token) {
    this.options.token = this._getFileContent('token') || this._error('Missing option: token');
  }
  if (!this.options.namespace) {
    this.options.namespace = this._getFileContent('namespace') || this._error('Missing option: namespace');
  }
  if (!this.options.ca) {
    this.options.ca = this._getFileContent('ca.crt'); // can try without certificate
  }

  this.getNodes()
  .then((nodes) => this.options.onReady && this.options.onReady(nodes))
  .catch((error) => this._error(error));
  setInterval(() => this.getNodes().catch((error) => this._error(error)), this.options.refreshInterval);
}

Kubernetes.prototype = {
  // Load a file from OC configuration
  _getFileContent: function _getFileContent (file) {
    try {
      return Fs.readFileSync(`${this.options.folderPath}/${file}`, 'utf8').trim();
    } catch (_) {}
  },
  _error: function _error (error, data) {
    typeof this.options.onError === 'function' ? this.options.onError(error, data) : console.error(`[node-swarm-kb] kubernetes ${error}`, data);
  },
  // Get list of nodes
  getNodes: function getNodes () {
    console.log(`[node-swarm-kb] kubernetes loading nodes: https://${this.options.host}:${this.options.port}/api/v1/namespaces/${this.options.namespace}/endpoints`, this.options.selector);
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
      const removed = Object.keys(this.nodes);
      result.items.forEach((node) =>
        node.subsets.forEach((subset) =>
          subset.addresses.forEach((address) => {
            if (!this.nodes[address.ip]) {
              this.nodes[address.ip] = Object.assign({ip: address.ip}, node);
              if (typeof this.options.onNodeAdded === 'function') {
                this.options.onNodeAdded(node);
              } else {
                console.log(`[node-swarm-kb] kubernetes: node added: ${address.ip} total: `, Object.keys(this.nodes));
              }
            } else {
              removed.splice(removed.indexOf(address.ip), 1);
            }
          })
      ));
      removed.forEach((ip) => {
        delete this._nodes[ip];
        console.log(`[node-swarm-kb] kubernetes: node removed: ${ip}, left: `, Object.keys(this.nodes));
        if (typeof this.options.onNodeRemoved === 'function') {
          this.options.onNodeRemoved(this.nodes[ip]);
        }
      });
      return this.nodes;
    });
  } // getNodes
};

module.exports = Kubernetes;
