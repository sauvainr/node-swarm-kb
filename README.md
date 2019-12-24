# node-swarm-kb

[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat-square)](https://github.com/Flet/semistandard)

  This library enable communication between each nodes of a [Kubernetes](http://kubernetes.io) based cluster such as [openshift](http://www.openshift.com).

(Designed for node.js 8+ and Linux)

## Purpose

  It allows to:
  - Keep track real-time of the **cluster topology**
  - **Notify other nodes** of the cluster including Broadcasting messages
  - Cluster **Task processing** management based on a consistent hashing ring on the cluster servers

  Use-case examples:
  - A processing task needs to be executed only once in the cluster (eg. cronjob like).
  - A task needs to be executed on the same server for a given customer (stickiness).
  - Requests queuing & re-ordering to ensure request received by different servers of the cluster get processed sequencially.
  - An event needs to be propagated to every nodes of the cluster (eg. Websocket message or closure).
  - Maintain a client connection map (eg. websocket)

  This project will also trigger the 'SIGTERM' event once the local node has been removed from the cluster. So the application has a heads up before its instance get terminated.

## Installation

```javascript
npm i --save node-swarm-kb
```

## Usage

**Important:** The cluster needs to open the port **45892** for internal communication (You can specify your own port in the options). This port should not be accessible from the outside world!

```javascript
const Swarm = require('node-swarm-kb');

Swarm.init({
  appName: 'myapp',
  // event listener here
});
```

Full example: [/test/index.js](/test/index.js)

### Cluster Topology

**nodes** - The list of nodes in the cluster

```javascript
  swarm.nodes[ip] // object indexed by the node ip addresses
```

**nodeAdded** - A new node has been added to the cluster

```javascript
  swarm.on('nodeAdded', (node) => {
    console.log(`Node ${node.ip} has been added.`);
  });
```

**nodeRemoved** - A node has been removed from the cluster

```javascript
  swarm.on('nodeRemoved', (node) => {
    console.log(`Node ${node.ip} has been removed.`);
  });
```

**amIMaster** - Is the current node the Cluster master

The master node do not have any specific role or behavior.
It is just an arbitrary selected single node of cluster known by all.
This is useful for a behavior that has to be done only in one pod of cluster.
The Master is automatically elected after a topology change.

```javascript
  swarm.amIMaster();
```

**isMe** - Test if the given node or ip is the current node.

```javascript
  swarm.isMe(node || ip);
```

### Messaging

**Sending a message to a node**

```javascript
  const promise = swarm.send(ip || node, 'topic', {/* data to send */});
```

**Broadcasting**

```javascript
  const promise = swarm.broadcast('topic', 'Hello everyone');
```

**Listening for messages**

```javascript
  const promise = swarm.messages.on('topic', (message, topics, from) => {
    /* handle message */
    return 'response'; // A Promise can be returned to
  });
```

### Cluster Tasks

This module also includes a way to execute tasks centrally in a cluster.
The task will use consistent hashing to execute a given task in a consistent node of the cluster.

**Example**

```javascript

Swarm.tasks.register('taskName',
(arg1, arg2) => { /** should return a Bluebird compatible promise **/ },
{ /** Options overloading the default */
  singleTrigger: true
});

// The first argument is used as hashing key.
// If no argument is provided, the task name is used.
const promise = Swarm.tasks.exec('taskName', arg1, arg2);

```


## All Options

- **kubernetes** Options for the kubernetes module, used to maintain the list of nodes of the cluster
- **kubernetes.appName** the service name, default got from env: OPENSHIFT_BUILD_NAME or HOSTNAME without -XXX postfix
- **kubernetes.folderPath** the folder to find kubernetes credentials, default env: KUBERNETES_FOLDER_PATH or _/var/run/secrets/kubernetes.io/serviceaccount_
- **kubernetes.host** kubernetes service host, default env: KUBERNETES_SERVICE_HOST or _kubernetes.default.svc.cluster.local_,
- **kubernetes.port** kubernetes service port, default env: KUBERNETES_SERVICE_PORT or _443_,
- **kubernetes.selector** selector to find this service in Kubernetes, default env: KUBERNETES_SELECTOR or build from app={appName}
- **kubernetes.token** security token, default get from _folderPath/token_
- **kubernetes.namespace** namespace, default get from _folderPath/namespace_
- **kubernetes.ca** ssl sertificate, default get from _folderPath/ca.crt_
- **kubernetes.refreshInterval** how often topology changes are checked, default _10000_ ms
- **messages** Options for the messaging module
- **messages.port** If no http server provide: communication ports, default env: SWARM_MESSAGING_PORT or _45892_
- **tasks** Options for the task processing module use as default for each tasks
- **tasks.timeout** time in ms after which to timeout the task execution, default _30000_ ms
- **tasks.serialized** Indicate the tasks needs to be executed sequentially, default _true_
- **tasks.singleTrigger** (if serialized == true) Indicate the tasks dont need to accumulate and only one will be executed. default _false_. Values: 'N' Indicate that the trigger needs to be executed anytime AFTER the trigger and cannot be part of on-going task, therefore queuing a single execution.
- **tasks.maxQueueLength** (if serialized = true && singleTrigger = false) The maximum size of the execution queue before an error is returned, default _20_
