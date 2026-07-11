// Localhost-only health endpoint. Exposes only SAFE fields — no tokens/secrets.
import http from 'node:http';

export function startHealth(port: number, info: () => Record<string, unknown>): http.Server {
  const server = http.createServer((r, res) => {
    if (r.url === '/health' || r.url === '/') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(info()));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port, '127.0.0.1'); // bound to loopback only
  return server;
}
