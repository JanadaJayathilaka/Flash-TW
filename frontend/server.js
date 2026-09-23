/**
 * Flash-TW Frontend Production Server (Node.js Native - ESM)
 * Serves the compiled Vite SPA bundle on port 6001.
 * Automatically proxies /api and /graphql to Backend on port 6002.
 * ZERO external dependencies required!
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 6001;
const BACKEND_PORT = process.env.BACKEND_PORT || 6002;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  // 1. Forward /api and /graphql requests to Backend on Port 6002
  if (req.url.startsWith('/api/') || req.url === '/api' || req.url.startsWith('/graphql')) {
    const proxyReq = http.request({
      hostname: '127.0.0.1',
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${BACKEND_PORT}`
      }
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Backend unavailable on port ${BACKEND_PORT}`, details: err.message }));
    });

    req.pipe(proxyReq, { end: true });
    return;
  }

  // 2. Normalize Static File URL to prevent directory traversal
  let safePath = path.normalize(decodeURI(req.url.split('?')[0])).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    // If path is a directory or does not exist, fall back to index.html (SPA routing)
    if (err || stats.isDirectory()) {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error loading application. Please run "npm run build" in frontend directory.');
        return;
      }

      // Cache hashed assets, no-cache for index.html
      const headers = { 'Content-Type': contentType };
      if (filePath.endsWith('index.html')) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      } else {
        headers['Cache-Control'] = 'public, max-age=31536000, immutable';
      }

      res.writeHead(200, headers);
      res.end(content);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Frontend] Flash-TW React SPA running at http://0.0.0.0:${PORT}`);
  console.log(`[Frontend] Proxying API & GraphQL requests to http://127.0.0.1:${BACKEND_PORT}`);
  console.log(`[Frontend] Serving static files from: ${DIST_DIR}`);
});
