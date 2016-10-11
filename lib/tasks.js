'use strict';

const HashRing = require('hashring');
const Promise = require('bluebird');

const DEFAULTOPTIONS = {
  timeout: 30000, // {number} time in ms after which to timeout the task execution
  serialized: true, // {boolean} indicate the tasks needs to be executed sequentially
  singleTrigger: false, // {boolean} - indicate the tasks dont need to accumulate and only one will be executed. requires options.serialized = true
  maxQueueLength: 20 // {number} options.maxQueueLength - the max size of the execution queue
};

/**
* Register a Cluster function
* @param {object} swarm - Swarm module instance used to get the list of nodes
* @param {object} options
* @return {object}
**/
function Tasks (swarm, options) {
  this.options = Object.assign(Object.assign({}, DEFAULTOPTIONS), options);

  this._swarm = swarm;
  this._swarm.on('ready', nodes => {
    if (!this.ring) {
      this.ring = new HashRing(Object.keys(nodes));
    }
  });

  this._swarm.on('nodeAdded', node =>
    this.ring && this.ring.add(node.ip));
  this._swarm.on('nodeRemoved', node =>
    this.ring && this.ring.remove(node.ip));
  this._swarm.messages.on('_task', (message, topics, from) =>
    message && message.task
    ? this._exec(message.task, message.args || [])
    : Promise.reject(new Error('Missing task property')));
}

Tasks.prototype = {
  _swarm: null, // the warm instance
  ring: null, // consistent hashing retrying
  tasks: {
    // here the hey corresponds to the task name and value to the function
  },

  /**
  * Register a Cluster task
  * @param {string|object} name - the name of the task or a map containsing key=name, value=handler
  * @param {function} handler - which will be executed
  * @param {object} options
  * @param {number} options.timeout - time in ms after which to timeout the task execution
  * @param {boolean} options.serialized - indicate the tasks needs to be executed sequentially
  * @param {boolean} options.singleTrigger - indicate the tasks dont need to accumulate and only one will be executed. requires options.serialized = true
  * @param {number} options.maxQueueLength - the max size of the execution queue
  **/
  register (name, handler, options) {
    if (typeof name === 'string' && typeof handler === 'function') {
      if (name in this.tasks) {
        console.error(`[node-swarm-kb] Tasks.register: Unable to register task ${name}, already registered`);
      } else {
        this.tasks[name] = Object.assign(Object.assign({name, handler, queue: []}, this.options), options);
      }
    } else if (typeof name === 'object') {
      options = handler;
      Object.keys(name).forEach(taskName => {
        if (name in this.tasks) {
          console.error(`[node-swarm-kb] Tasks.register: Unable to register task ${name}, already registered`);
        } else {
          this.tasks[taskName] = Object.assign(Object.assign({name: taskName, handler: name[taskName], queue: []}, this.options), options);
        }
      });
    } else {
      console.error(`[node-swarm-kb] Tasks.register: Unable to register task ${name}, wrong arguments`);
    }
  },

  /**
  * Execute a Cluster task
  * @param {string} name - the name of the task to execute
  * @param {string|number|array|boolean} arg1 - arguments to pass to the task. the first argument is used as distribution key otherwise the task name is used
  * @param {string|number|array|boolean} arg2 - etc
  * @return {promise}
  **/
  exec (name) {
    if (!(name in this.tasks)) {
      return Promise.reject(new Error('No such task'));
    }
    if (!this.ring) {
      return Promise.reject(new Error('Ring not ready'));
    }
    var key = arguments[1] || arguments[0];
    var args = [];
    for (var i = 1, l = arguments.length; i < l; i++) {
      args[i - 1] = arguments[i];
    }

    var nodeIp = this.ring.get(key);
    if (this._swarm.isMe(nodeIp)) {
      return this._exec(name, args);
    } else {
      return this._swarm.messages.send(nodeIp, {task: name, args: args}, '_task');
    }
  },
  // internal function tasks a task or adding task to the execution queue
  _exec (name, args) {
    var task = this.tasks[name];
    if (!task) {
      return Promise.reject(new Error(`No such task ${name}`));
    }

    if (!task.serialized) {
      var start = Date.now();
      console.log(`[node-swarm-kb] Tasks.exec: Executing concurrent task ${task.name}`);
      return Promise.try(_ => task.handler.apply(undefined, args || []))
      .then(response =>
        console.log(`[node-swarm-kb] Tasks.exec: Executing concurrent task ${task.name} succeed in ${Date.now() - start} ms`) ||
        response);
    }

    return (new Promise((resolve, reject) => {
      if (task.current && task.singleTrigger && task.singleTrigger !== 'N') {
        // stacking to current on-going task
        task.current.resolvers.push(resolve);
        task.current.rejecters.push(reject);
      } else if (task.singleTrigger && task.queue.length) {
        // stacking to existing task trigger
        task.queue[0].resolvers.push(resolve);
        task.queue[0].rejecters.push(reject);
      } else {
        if (task.queue.length >= task.maxQueueLength) {
          return reject(new Error(`Max execution queue size reached for task ${name}`));
        }
        // queuing new task trigger
        task.queue.push({
          resolvers: [resolve],
          rejecters: [reject],
          args
        });
      }
      if (!task.current) {
        this._run(task);
      }
    })).timeout(task.timeout);
  },
  _run (task) {
    if (!task.queue.length || task.current) {
      // not more pending tasks or already executing process
      return;
    }
    console.log(`[node-swarm-kb] Tasks._run: Executing task ${task.name} (queue=${task.queue.length})`);
    var start = Date.now();

    task.current = task.queue.shift();
    Promise.try(_ =>
      task.handler.apply(undefined, task.current.args || []))
    .then(result =>
      console.log(`[node-swarm-kb] Tasks._run: Executing task ${task.name} succeed in ${Date.now() - start} ms`) ||
      task.current.resolvers.forEach(resolver => resolver(result)))
    .catch(error =>
      console.log(`[node-swarm-kb] Tasks._run: Executing task ${task.name} failed with ${error.message}`) ||
      task.current.rejecters.forEach(rejecter => rejecter(error)))
    .finally(_ => {
      task.current = null;
      this._run(task);
    });
  }
};

module.exports = Tasks;
