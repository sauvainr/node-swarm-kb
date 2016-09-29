'use strict';

const Swarm = require('../lib');

// Register events

Swarm.on('ready', (nodes) =>
  console.log('Current nodes ', Swarm.nodes));
Swarm.on('error', (error) =>
  console.error(error));
Swarm.on('message', (message, node) =>
  console.log(`Node ${node.ip} says ${message}.`));
Swarm.on('nodeAdded', (node) =>
  console.log(`Node ${node.ip} has been added.`));
Swarm.on('nodeRemoved', (node) =>
  console.log(`Node ${node.ip} has been removed.`));

// Start the connection

Swarm.init({
  kubernetes: {
    // here can specify kubernetes connection options, if not defined from environment variables
    // appName: the service name, default got from env: OPENSHIFT_BUILD_NAME or HOSTNAME without -XXX postfix
    // folderPath: the folder to find kubernetes credentials, default env: KUBERNETES_FOLDER_PATH or '/var/run/secrets/kubernetes.io/serviceaccount',
    // host: kubernetes service host, default env: KUBERNETES_SERVICE_HOST or 'kubernetes.default.svc.cluster.local',
    // port: kubernetes service port, default env: KUBERNETES_SERVICE_PORT or 443,
    // selector: selector to find this service in Kubernetes, default env: KUBERNETES_SELECTOR or build from app={appName}
    // token: security token, default get from folderPath/token
    // namespace: namespace, default get from folderPath/namespace
    // ca: ssl sertificate, default get from folderPath/ca.crt
    // refreshInterval: how often topology changes are checked, default 10000 ms
  },
  // here another way to add events handlers
  onMessage: (message, node) => console.log(message)
})
.then((nodes) => {
  // Same as 'ready' event
  console.log('Ready', Swarm.nodes); // == Swarm.nodes

  // Send a message to a specific node
  Swarm.send(Object.keys(Swarm.nodes)[0], 'Hello');

  // Send a message to every nodes
  Swarm.broadcast({key: 'object also works'});
})
.catch((error) =>
  // Same as 'error' event
  console.error('Error', error));
