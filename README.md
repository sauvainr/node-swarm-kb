# node-swarm-kb

  This library enable communication between each nodes of a **Kubernetes** based service.

  For node.js 4+ and Linux

  It allows to keep track of the servers topology and transmitting messages to other nodes.

## Installation

Add to your project package.json.

```JSON
"dependencies": {
  ...
  "node-swarm-kb": "git://github.com/sauvainr/node-swarm-kb.git#master"
}
```

Then hit ``` npm i ```

## Usage

Full example: [/test/index.js](/test/index.js)

```javascript
const Swarm = require('node-swarm-kb');
Swarm.init({
  appName: 'myapp',
  // event listener here
});
```

### Methods & attributes

**Getting the list of service nodes**

```javascript
  swarm.nodes[ip] // object indexed by the node ip addresses
```

**Sending a message to a node**

```javascript
  swarm.send(ip || node, 'Hello');
  // also can send object
  swarm.send(ip || node, {});
```

**Broadcasting**

```javascript
  swarm.broadcast('Hello everyone');
```

### events

Subscribe to event to get message and topology updates.

**message** message from other nodes

```javascript
  swarm.on('message', (node, message) => {
    console.log(`Node ${node.ip} says ${message}.`);
  });
```

**nodeAdded** new node has been added to the topology

```javascript
  swarm.on('nodeAdded', (node) => {
    console.log(`Node ${node.ip} has been added.`);
  });
```

**nodeRemoved** new node has been removed to the topology

```javascript
  swarm.on('nodeRemoved', (node) => {
    console.log(`Node ${node.ip} has been removed.`);
  });
```

### options

- **port** communication ports, default _45892_
- **kubernetes.appName** the service name, default got from env: OPENSHIFT_BUILD_NAME or HOSTNAME without -XXX postfix
- **kubernetes.folderPath** the folder to find kubernetes credentials, default env: KUBERNETES_FOLDER_PATH or '/var/run/secrets/kubernetes.io/serviceaccount',
- **kubernetes.host** kubernetes service host, default env: KUBERNETES_SERVICE_HOST or 'kubernetes.default.svc.cluster.local',
- **kubernetes.port** kubernetes service port, default env: KUBERNETES_SERVICE_PORT or 443,
- **kubernetes.selector** selector to find this service in Kubernetes, default env: KUBERNETES_SELECTOR or build from app={appName}
- **kubernetes.token** security token, default get from folderPath/token
- **kubernetes.namespace** namespace, default get from folderPath/namespace
- **kubernetes.ca** ssl sertificate, default get from folderPath/ca.crt
- **kubernetes.refreshInterval** how often topology changes are checked, default 5000 ms
