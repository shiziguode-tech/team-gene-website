// Nginx streams uploads directly to this loopback-only application server.
// Keep finite timeouts, while allowing a 500 MiB file on a slow connection.
const http = require('node:http');
const originalCreateServer = http.createServer;
http.createServer = function (...args) {
  const server = Reflect.apply(originalCreateServer, this, args);
  server.requestTimeout = 30 * 60 * 1000;
  server.headersTimeout = 60 * 1000;
  server.setTimeout(5 * 60 * 1000);
  return server;
};
