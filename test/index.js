'use strict';

const Swarm = require('../lib');
const Promise = require('bluebird');
const assert = require('assert');
require('./kbShim'); // uses port 12345

// Register events

Swarm.on('ready', (nodes) =>
  console.log('Current nodes ', Swarm.nodes));
Swarm.on('error', (error) =>
  console.error('Error', error.stack));
Swarm.on('nodeAdded', (node) =>
  console.log(`Node ${node.ip} has been added.`));
Swarm.on('nodeRemoved', (node) =>
  console.log(`Node ${node.ip} has been removed.`));

process.on('uncaughtException', (error) =>
  console.error('Test failed:', error.stack) ||
  process.exit(1));

// Start the connection
Swarm.init({
  /* see README for options */
  kubernetes: {
    host: 'localhost',
    port: 12345,
    token: 'notneeded',
    namespace: 'notneeded',
    noSSL: true
  }
})
.then((nodes) =>
  assert.ok(nodes, `Init: ${nodes}`))
.then(_ => { // Messages
  Swarm.messages.on('topic', (message, topics, from) => {
    /* handle message */
    console.log(`Message from ${from}`, message);
    return 'pong';
  });

  // This will return 'undefined' if the cluster only has one node
  return Promise.join(
    Swarm.send(Object.keys(Swarm.nodes)[0], 'topic', 'ping')
    .then(response =>
      assert.equal(response, undefined, `Messages: Local call ignored: ${response} === undefined`)),

    // Send a message to a specific node: you can send to yourself
    Swarm.messages.send(Object.keys(Swarm.nodes)[0], 'topic', 'ping')
    .then(response =>
      assert.equal(response, 'pong', `Messages: Forced local call: ${response} === pong`)),

    // Send a message to every nodes
    // This will return 'undefined' if the cluster only has one node
    Swarm.broadcast('ping', {key: 'object also works'})
    .then(response =>
      assert.equal(response.length, Object.keys(Swarm.nodes).length, `Messages: Broadcast call ignored: ${response.length} === ${Object.keys(Swarm.nodes).length}`))
  );
}).then(_ => { // Tasks: Simple Task
  Swarm.tasks.register('taskName',
    (arg1, arg2) => arg1 + arg2);

  // The argument is used as hashing key. If argument is an array then the first element is used.
  // If no argument is provided, the task name is used.
  return Swarm.tasks.exec('taskName', 1, 2)
  .then(response =>
    assert.equal(response, 3, `Tasks: simple task: ${response} === 3`));
}).then(_ => { // Tasks: Promise Task
  // Test tasks with promise
  Swarm.tasks.register('taskWithPromise',
    (arg1, arg2) => new Promise((resolve, reject) =>
      arg2
      ? resolve(arg1 + arg2)
      : reject('error')));

  return Promise.join(
    Swarm.tasks.exec('taskWithPromise', 1, 2)
    .then(response =>
      assert.equal(response, 3, `Tasks: promise task: ${response} === 3`)),

    Swarm.tasks.exec('taskWithPromise', 1)
    .catch(error =>
      assert.equal(error, 'error', `Tasks: promise task Error: ${error}`))
  );
}).then(_ => { // Tasks: stacking max 2
  Swarm.tasks.register('stackingTask',
    (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    { maxQueueLength: 2 });

  return Promise.join(
    Swarm.tasks.exec('stackingTask', 'arg1'), // current
    Swarm.tasks.exec('stackingTask', 'arg1'), // queue 1
    Swarm.tasks.exec('stackingTask', 'arg1'), // queue 2
    Promise.delay(50)
    .then(_ => Swarm.tasks.exec('stackingTask', 'arg1'))
    .catch(error =>
      assert.equal(error.message, 'Max execution queue size reached for task stackingTask', `Tasks: stackingTask Max Queue reached: ${error.message}`))
  ).spread((t1, t2, t3) =>
    assert.ok(t1 !== t2 && t2 !== t3, `Tasks: stackingTask consecutive stacking: ${t1} !== ${t2} !== ${t3}`));
}).then(_ => { // Tasks: single Execution
  Swarm.tasks.register('SingleTask',
    (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    { singleTrigger: true });

  return Promise.join(
    Swarm.tasks.exec('SingleTask', 'arg1'),
    Swarm.tasks.exec('SingleTask', 'arg1'),
    Swarm.tasks.exec('SingleTask', 'arg1')
  ).spread((t1, t2, t3) =>
    assert.ok(t1 === t2 && t2 === t3, `Tasks: SingleTask concurrent stacking: ${t1} === ${t2} === ${t3}`));
}).then(_ => { // Tasks: NoStackingTask
  Swarm.tasks.register('NoStackingTask',
    (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    { singleTrigger: 'N' });

  return Promise.join(
    Swarm.tasks.exec('NoStackingTask', 'arg1'),
    Promise.delay(50).then(_ => Swarm.tasks.exec('NoStackingTask', 'arg1')),
    Promise.delay(50).then(_ => Swarm.tasks.exec('NoStackingTask', 'arg1')),
    Promise.delay(50).then(_ => Swarm.tasks.exec('NoStackingTask', 'arg1'))
  ).spread((t0, t1, t2, t3) => {
    assert.ok(t0, `Tasks: NoStackingTask first call: ${t0}`);
    assert.ok((t1 - t0) > 100, `Tasks: NoStackingTask first call different: ${t1} - ${t0} > 100 ms`);
    assert.ok(t1 === t2 && t2 === t3, `Tasks: NoStackingTask concurrent stacking: ${t1} === ${t2} === ${t3}`);
  });
}).then(_ => { // Tasks: ParallelTask
  Swarm.tasks.register('ParallelTask',
    (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    { serialized: false });

  return Promise.join(
    Swarm.tasks.exec('ParallelTask', 'arg1'),
    Swarm.tasks.exec('ParallelTask', 'arg1'),
    Swarm.tasks.exec('ParallelTask', 'arg1')
  ).spread((t0, t1, t2) => {
    assert.ok(Math.abs(t0 - t1) < 100 && Math.abs(t1 - t2) < 100, `Tasks: ParallelTask: ${t1} <> ${t1} <> ${t2}  < 100ms`);
  });
}).then(_ => { // Tasks: TimeoutTask
  Swarm.tasks.register('TimeoutTask',
    (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    { timeout: 50 });

  return Swarm.tasks.exec('TimeoutTask', 'arg1')
  .catch(error =>
    assert.equal(error.message, 'operation timed out', `Tasks: TimeoutTask: ${error.message}`));
}).then(_ =>
  console.log('Success') || process.exit())
.catch((error) =>
  // Same as 'error' event
  console.error('Error', error.stack) || process.exit(1));
