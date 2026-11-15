'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 5188);
const HOST = process.env.HOST || '127.0.0.1';
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function serveFile(req, res, filePath) {
  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const total = stat.size;
    const range = req.headers.range;

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
        if (start <= end && start < total) {
          res.writeHead(206, {
            'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': mime,
          });
          fs.createReadStream(filePath, { start: start, end: end }).pipe(res);
          return;
        }
      }
      res.writeHead(416, { 'Content-Range': 'bytes */' + total });
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': total,
      'Accept-Ranges': 'bytes',
      'Cache-Control': ext === '.json' ? 'no-cache' : 'public, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function safeResolve(baseDir, relPath) {
  const cleaned = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const resolved = path.join(baseDir, cleaned);
  if (!resolved.startsWith(baseDir)) {
    return null;
  }
  return resolved;
}

const server = http.createServer(function (req, res) {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath === '/api/health') {
    const catalogExists = fs.existsSync(path.join(ASSETS_DIR, 'extracted', 'catalog.json'));
    sendJson(res, 200, { ok: true, port: PORT, extracted: catalogExists });
    return;
  }

  if (urlPath.startsWith('/assets/')) {
    const rel = urlPath.slice('/assets/'.length);
    const target = safeResolve(ASSETS_DIR, rel);
    if (!target) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    serveFile(req, res, target);
    return;
  }

  const publicRel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const target = safeResolve(PUBLIC_DIR, publicRel);
  if (!target) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  serveFile(req, res, target);
});

server.listen(PORT, HOST, function () {
  console.log('SwordsMan Remaster Explorer running at http://' + HOST + ':' + PORT);
});
