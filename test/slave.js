'use strict';

/* This file is used for cluster testing when tests are executed from another pods */

const Swarm = require('../lib');
const Promise = require('bluebird');

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

const tasks = {
  'taskName':
    (arg1, arg2) => arg1 + arg2,

  'taskWithPromise':
    (arg1, arg2) => new Promise((resolve, reject) =>
      arg2
      ? resolve(arg1 + arg2)
      : reject('error')),

  'stackingTask': {
    handler: (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    maxQueueLength: 2
  },

  'SingleTask': {
    handler: (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    singleTrigger: true
  },

  'NoStackingTask': {
    handler: (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    singleTrigger: 'N'
  },

  'ParallelTask': {
    handler: (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    serialized: false
  },

  'TimeoutTask': {
    handler: (arg1) => new Promise((resolve, reject) => setTimeout(_ => resolve(Date.now()), 100)),
    timeout: 50
  }
};

// Start the connection
Swarm.init()
.then((nodes) => {
  Swarm.messages.on('topic', (message, topics, from) => {
    /* handle message */
    console.log(`Message from ${from}`, message);
    return 'pong';
  });

  Swarm.tasks.register(tasks);
});
