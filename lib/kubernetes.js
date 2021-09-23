/**
 This clustering strategy works by loading all pods in the current Kubernetes
 namespace with the configured tag. It will fetch the addresses of all pods with
 that tag and attempt to connect. It will continually monitor and update it's
 connections every 10s.
*/

const Rp = require('request-promise');
const Fs = require('fs');
const K8s = require('k8s');
const appPackage = require('../package.json');
const Standalone = require('./standalone');
const debug = require('debug')(`${appPackage.name}:kubernetes`);
// const K8s = require('./node_modules/node-swarm-kb/node_modules/k8s/index.js');

// Contains the nodes informations
const DEFAULTOPTIONS = {
  appName: process.env.HOSTNAME && process.env.HOSTNAME.match(/^(.*)-[0-9]+-[a-z0-9]+$/)[1] || process.env.OPENSHIFT_BUILD_NAME && process.env.OPENSHIFT_BUILD_NAME.match(/^(.*)-[0-9]+$/)[1],
  folderPath: process.env.KUBERNETES_FOLDER_PATH || '/var/run/secrets/kubernetes.io/serviceaccount',
  host: process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc.cluster.local',
  port: process.env.KUBERNETES_SERVICE_PORT || 443,
  selector: process.env.KUBERNETES_SELECTOR,
  token: process.env.KUBERNETES_TOKEN, // from folderPath.token
  namespace: process.env.KUBERNETES_NS, // from folderPath.namespace
  ca: process.env.KUBERNETES_CA // from folderPath.ca
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

    this.kubeApi = K8s.api({
      endpoint: `http${this.options.noSSL ? '' : 's'}://${this.options.host}:${this.options.port}`,
      version: '/api/v1',
      strictSSL: false,
      auth: {
        token: this.options.token,
        caCert: this.options.ca
      }
    });

    const processWatchedMessage = (data) => {
      const endpoints = data.object;
      debug(`${data.type} message received from ${endpoints && endpoints.metadata && endpoints.metadata.selfLink}`);
      if (data.type && data.type !== 'ERROR' && typeof endpoints !== 'object') {
        return this._error(`Watch message ${data.type} not an object!`, endpoints);
      }

      switch (data && data.type && data.type.toUpperCase()) {
        case 'ADDED':
          this._endpointsToNodes(endpoints).forEach(node => this._addNode(node));
          break;
        case 'MODIFIED':
          this._endpointsToNodes(endpoints)
          .reduce((toRemove, node) => {
            if (this.nodes[node.ip]) {
              toRemove.splice(toRemove.indexOf(node.ip), 1);
            } else {
              this._addNode(node);
            }
            return toRemove;
          }, Object.keys(this.nodes))
          .forEach((ip) => this._removeNode(ip));
          break;
        case 'DELETED':
          this._endpointsToNodes(endpoints).forEach(node => this._removeNode(node));
          break;
        case 'ERROR':
          this._error('Watch return message Error', endpoints);
          break;
        default:
          this._error(`Unknown watch message type ${data && data.type}`, data);
      }
    }; // processWatchedMessage

    let watching = false;

    // get the nodes and watch the collection
    const startWatching = async () => {
      if (watching) return; // don't double whatch
      watching = true;
      try {
        const nodes = await this.getNodes();
        if (typeof this.options.onReady === 'function') {
          this.options.onReady(nodes);
          delete this.options.onReady;
        }
        this.watch('endpoints', {
          labelSelector: this.options.selector
        }, processWatchedMessage,
        error => {
          watching = false;
          debug(`[Error] Watching nodes lost: ${error && error.message}, retrying..`);
        });
      } catch (error) {
        watching = false;
        console.error(`${appPackage.name} [kubernetes][Error] Unable to get nodes: ${error.message}, retrying..`);
        this._error(error);
      }
    };

    setInterval(startWatching, 5000);
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
  request (path, query, body, method) {
    if ((!method || method === 'GET') && this.resourceVersions[path]) {
      Object.assign({ [`/api/v1/${path}`]: this.resourceVersions[path] }, query);
    }

    debug(`Request: ${path}`, query || body);
    return Rp({
      url: `http${this.options.noSSL ? '' : 's'}://${this.options.host}:${this.options.port}/api/v1/${path}`,
      headers: {
        authorization: `Bearer ${this.options.token}`
      },
      method: method || body ? 'POST' : 'GET',
      qs: query,
      json: body || true,
      timeout: 10000,
      strictSSL: false,
      agentOptions: {
        host: this.options.host,
        port: this.options.port,
        ca: this.options.ca,
        rejectUnauthorized: false
      }
    }).then((result) => {
      if ((!method || method === 'GET') && result.metadata && result.metadata.resourceVersion) {
        const selfLink = result.metadata.selfLink || `/api/v1/${path}`;
        this.resourceVersions[selfLink] = result.metadata.resourceVersion;
        debug(`Request ${selfLink} version updated to ${result.metadata.resourceVersion}`);
      }
      return result;
    });
  }

  nsRequest (path, query, body, method) {
    return this.request(`namespaces/${this.options.namespace}/${path}`, query, body, method);
    // with kubeApi which doesnt work for our authentication scheme
    // const queryString = query
    // ? Object.keys(query).map((param) => `${param}=${encodeURIComponent(query[param])}`).join('&')
    // : '';
    // return this.kubeApi[(method || body ? 'get' : 'post').toLowerCase()](`namespaces/${this.options.namespace}/${path}?${queryString}`, body);
  }

  watch (path, query, onMessage, onError) {
    let isDead = false;
    // Here due to watch uncertain behavior dont react to any callback from kubeAPI if watch is already replaced.
    try {
      path = `namespaces/${this.options.namespace}/${path}`;
      debug(`Watching: ${path}`, query);

      query = Object.assign({
        watch: true,
        timeoutSeconds: 30,
        resourceVersion: this.resourceVersions[`/api/v1/${path}`]
      }, query);

      const queryString = Object.keys(query).map(param => `${param}=${encodeURIComponent(query[param])}`).join('&');
      this.kubeApi.watch(`watch/${path}?${queryString}`, result => {
        if (isDead) return;
        if (result.object && result.object.metadata && result.object.metadata.resourceVersion) {
          const selfLink = result.object.metadata.selfLink || `/api/v1/${path}`;
          this.resourceVersions[selfLink] = result.object.metadata.resourceVersion;
          debug(`Watch ${selfLink} version updated to ${result.object.metadata.resourceVersion}`);
        }
        onMessage(result);
      }, (error) => {
        if (isDead) return;
        isDead = true;
        onError(error);
      }, 30000);
    } catch (error) {
      if (isDead) return;
      isDead = true;
      onError(error);
    }
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
      nodes.concat(subset.addresses.map(address => Object.assign({ ip: address.ip }, endpoints))), []);
  }

  // Get list of nodes
  getNodes () {
    if (!this.options.token || !this.options.namespace) {
      return Promise.resolve(this.nodes);
    }
    return this.nsRequest('endpoints', {
      labelSelector: this.options.selector
    })
    .then(result => {
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
    });
  } // getNodes
}

module.exports = Kubernetes;
