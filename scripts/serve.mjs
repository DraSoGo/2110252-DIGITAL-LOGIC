import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv.includes('--dist') ? path.join(root, 'dist') : root;
const PORT = 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.dig': 'application/octet-stream',
  '.ods': 'application/octet-stream',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let filePath = path.normalize(path.join(base, urlPath));
  if (!filePath.startsWith(base)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let fileStat = await stat(filePath).catch(() => null);
  if (fileStat?.isDirectory()) {
    filePath = path.join(filePath, 'index.html');
    fileStat = await stat(filePath).catch(() => null);
  }
  if (!fileStat) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'content-length': fileStat.size,
  });
  createReadStream(filePath).pipe(res);
}).listen(PORT, () => {
  console.log(`Serving ${base} → http://localhost:${PORT}`);
});
