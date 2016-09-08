'use strict';

const Swarm = require('../lib');

// Register events
Swarm.on('ready', (nodes) =>
  console.log('Current nodes ', Swarm.nodes));
Swarm.on('error', (error) =>
  console.error(error));
Swarm.on('message', (node, message) =>
  console.log(`Node ${node.ip} says ${message}.`));
Swarm.on('nodeAdded', (node) =>
  console.log(`Node ${node.ip} has been added.`));
Swarm.on('nodeRemoved', (node) =>
  console.log(`Node ${node.ip} has been removed.`));

// Start the connection
Swarm.init({
  appName: 'myapp',
  // here another way to add events handlers
  onMessage: (message) => console.log(message)
})
.catch((error) =>
  // Same as 'error' event
  console.error(error))
.then((nodes) => {
  // Same as 'ready' event
  console.log(nodes); // == Swarm.nodes

  // Send a message to a specific node
  Swarm.send(Object.keys(Swarm.nodes)[0], 'Hello');

  // Send a message to every nodes
  Swarm.broadcast({key: 'object also works'});
});
