/**
 This clustering strategy works by loading all pods in the current Kubernetes
 namespace with the configured tag. It will fetch the addresses of all pods with
 that tag and attempt to connect. It will continually monitor and update it's
 connections every 10s.
*/

const Rp = require('request-promise');
const Fs = require('fs');
const appPackage = require('../package.json');
const Standalone = require('./standalone');
const debug = require('debug')(`${appPackage.name}:kubernetes`);

// Contains the nodes informations
const DEFAULTOPTIONS = {
  appName: process.env.HOSTNAME && process.env.HOSTNAME.match(/^(.*)-[0-9]+-[a-z0-9]+$/)[1] || process.env.OPENSHIFT_BUILD_NAME && process.env.OPENSHIFT_BUILD_NAME.match(/^(.*)-[0-9]+$/)[1],
  folderPath: process.env.KUBERNETES_FOLDER_PATH || '/var/run/secrets/kubernetes.io/serviceaccount',
  host: process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc.cluster.local',
  port: process.env.KUBERNETES_SERVICE_PORT || 443,
  selector: process.env.KUBERNETES_SELECTOR,
  token: process.env.KUBERNETES_TOKEN, // from folderPath.token
  namespace: process.env.KUBERNETES_NS, // from folderPath.namespace
  ca: process.env.KUBERNETES_CA, // from folderPath.ca
  strictSSL: !(process.env.KUBERNETES_STRICTSSL && process.env.KUBERNETES_STRICTSSL.toLowerCase() === 'false'), // strictssl by default
  refreshInterval: 10000
};

/**
* Main Class Init the connection and start listening to pod changes
* @param {object} options - see the readme
*/
class Kubernetes {
  constructor (options) {
    this.resourceVersions = {};
    this.options = Object.assign(Object.assign({}, DEFAULTOPTIONS), options && options.kubernetes);
    for (const p in options) {
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
      this.options.token = this._getFileContent('token');
      if (!this.options.token) {
        console.log(`${appPackage.name} [kubernetes] No 'token' set, disable clustering`);
        return new Standalone(options);
      }
    }
    if (!this.options.namespace) {
      this.options.namespace = this._getFileContent('namespace');
      if (!this.options.namespace) {
        console.log(`${appPackage.name} [kubernetes] No 'namespace' set, disable clustering`);
        return new Standalone(options);
      }
    }
    if (!this.options.ca) {
      this.options.ca = this._getFileContent('ca.crt'); // can try without certificate
    }

    this.getNodes().then((nodes) => {
      if (typeof this.options.onReady === 'function') {
        this.options.onReady(nodes);
        delete this.options.onReady;
      }
    });

    setInterval(_ => this.getNodes(), this.options.refreshInterval);
  } // constructor

  // Load a file from OC configuration
  _getFileContent (file) {
    try {
      return Fs.readFileSync(`${this.options.folderPath}/${file}`, 'utf8').trim();
    } catch (_) {}
  }

  _error (error, data) {
    debug(`[Error] ${error.message || error}!`);
    if (typeof this.options.onError === 'function') {
      this.options.onError(error, data);
    }
  }

  /**
  * Make a request to Kubernetes API
  * @param {string} path - after the namespace
  * @param {object} query - query parameters
  * @param {object} body - data
  * @param {string} method - ['GET','PUT','POST','DELETE','PATCH'] default GET or POST if body
  * @returns {promise}
  */
  async request (path, query, body = true, method = 'GET') {
    if (method === 'GET' && this.resourceVersions[path]) {
      Object.assign({ [`/api/v1/${path}`]: this.resourceVersions[path] }, query);
    }

    debug(`Request: ${path}`, query || body);
    const result = await Rp({
      url: `http${this.options.noSSL ? '' : 's'}://${this.options.host}:${this.options.port}/api/v1/${path}`,
      headers: {
        authorization: `Bearer ${this.options.token}`
      },
      method: method || body ? 'POST' : 'GET',
      qs: query,
      json: body || true,
      timeout: this.options.refreshInterval,
      strictSSL: this.options.strictSSL,
      agentOptions: {
        host: this.options.host,
        port: this.options.port,
        ca: this.options.ca,
        rejectUnauthorized: false
      }
    });

    if (method === 'GET' && result.metadata && result.metadata.resourceVersion) {
      const selfLink = `/api/v1/${path}`;
      this.resourceVersions[selfLink] = result.metadata.resourceVersion;
      debug(`Request ${selfLink} version updated to ${result.metadata.resourceVersion}`);
    }
    return result;
  }

  _addNode (node) {
    if (this.nodes[node.ip]) {
      return;
    }
    this.nodes[node.ip] = node;
    debug(`Node added: ${node.ip} total: `, Object.keys(this.nodes));
    if (typeof this.options.onNodeAdded === 'function') {
      this.options.onNodeAdded(node);
    }
  }

  _removeNode (ip) {
    ip = ip.ip || ip;
    const node = this._nodes[ip];
    if (!node) {
      return;
    }

    delete this._nodes[ip];
    debug(`Node removed: ${ip}, left: `, Object.keys(this.nodes));
    if (typeof this.options.onNodeRemoved === 'function') {
      this.options.onNodeRemoved(node);
    }
  }

  _endpointsToNodes (endpoints) {
    if (!endpoints.subsets) {
      return [];
    }
    return endpoints.subsets.reduce((nodes, subset) =>
      nodes.concat((subset.addresses || []).map(address => Object.assign({ ip: address.ip }, endpoints))), []);
  }

  // Get list of nodes
  async getNodes () {
    if (!this.options.token || !this.options.namespace) {
      return this.nodes;
    }
    const result = await this.request(`namespaces/${this.options.namespace}/endpoints`, {
      labelSelector: this.options.selector
    });

    result.items
    .reduce((nodes, endpoints) =>
      nodes.concat(this._endpointsToNodes(endpoints)), [])
    .reduce((toRemove, node) => {
      if (this.nodes[node.ip]) {
        toRemove.splice(toRemove.indexOf(node.ip), 1);
      } else {
        this._addNode(node);
      }
      return toRemove;
    }, Object.keys(this.nodes))
    .forEach(ip => this._removeNode(ip));

    return this.nodes;
  } // getNodes
}

module.exports = Kubernetes;
