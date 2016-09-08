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
- **appName** Kubernetes app name, default env variable OPENSHIFT_BUILD_NAME is used
- **selector** Kubernetes selector, default _app=${appName}_
- **serviceAccountPath** Location of Kubernetes files, default _/var/run/secrets/kubernetes.io/serviceaccount_
- **kubernetesMaster** Kubernetes server domain, default _kubernetes.default.svc.cluster.local_
- **refreshInterval** Nodes update internal, default _10000_ ms
