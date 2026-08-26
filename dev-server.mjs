import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import sessionHandler from './api/session.js';
import pairHandler from './api/pair.js';
import channelsHandler from './api/channels.js';
import resolveHandler from './api/resolve.js';
import healthHandler from './api/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

function adaptReqRes(req, res) {
  // Parse query parameters
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  req.query = Object.fromEntries(urlObj.searchParams.entries());

  let bodyData = '';
  req.on('data', chunk => { bodyData += chunk; });

  req.on('end', async () => {
    if (bodyData) {
      try {
        req.body = JSON.parse(bodyData);
      } catch (e) {
        req.body = {};
      }
    } else {
      req.body = {};
    }

    // Attach Vercel-like response helpers
    res.status = function(code) {
      res.statusCode = code;
      return res;
    };

    res.json = function(data) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(data));
      return res;
    };

    // Route request
    const pathname = urlObj.pathname;

    try {
      if (pathname === '/' || pathname === '/index.html') {
        const htmlPath = path.join(__dirname, 'index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        res.setHeader('Content-Type', 'text/html');
        return res.end(html);
      } else if (pathname === '/console' || pathname === '/ticker-console.html') {
        const htmlPath = path.join(__dirname, 'public/ticker-console.html');
        const html = fs.readFileSync(htmlPath, 'utf8');
        res.setHeader('Content-Type', 'text/html');
        return res.end(html);
      } else if (pathname === '/api/session') {
        return await sessionHandler(req, res);
      } else if (pathname === '/api/pair') {
        return await pairHandler(req, res);
      } else if (pathname === '/api/channels') {
        return await channelsHandler(req, res);
      } else if (pathname === '/api/resolve') {
        return await resolveHandler(req, res);
      } else if (pathname === '/api/health') {
        return await healthHandler(req, res);
      } else {
        res.status(404).json({ success: false, message: 'Not found' });
      }
    } catch (err) {
      console.error("[dev-server] Handler error:", err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: err.message });
      }
    }
  });
}

const server = http.createServer((req, res) => {
  adaptReqRes(req, res);
});

function startServer(portToUse) {
  server.listen(portToUse, () => {
    console.log(`\n==================================================`);
    console.log(` 🚀 OBS Relay & Dashboard running locally!`);
    console.log(` 🌐 Dashboard URL: http://localhost:${portToUse}`);
    console.log(` 📡 Relay API:     http://localhost:${portToUse}/api/session`);
    console.log(` 📺 Channel API:   http://localhost:${portToUse}/api/channels`);
    console.log(`==================================================\n`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = Number(PORT) + 1;
    console.log(`[dev-server] Port ${PORT} busy, retrying on port ${nextPort}...`);
    startServer(nextPort);
  } else {
    console.error('[dev-server] Server error:', err);
  }
});

startServer(PORT);
