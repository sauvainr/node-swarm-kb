'use strict';

var os = require('os');
var ifaces = os.networkInterfaces();
module.exports = Object.keys(ifaces).reduce((ips, ifname) =>
  ips.concat(ifaces[ifname]
  .filter(iface => iface.family === 'IPv4' && iface.internal === false)
  .map(iface => iface.address))
, []);
