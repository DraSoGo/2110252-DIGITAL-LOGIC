import { createReadStream } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const [distArg = 'dist'] = process.argv.slice(2);
const dist = path.resolve(distArg);
const port = Number(process.env.PORT || 4174);
const projectPrefix = '/2110252-DIGITAL-LOGIC';
const mime = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.svg', 'image/svg+xml'],
  ['.dig', 'application/octet-stream'],
  ['.ods', 'application/vnd.oasis.opendocument.spreadsheet'],
]);

function relativeRequestPath(urlPath) {
  const withoutPrefix = urlPath === projectPrefix || urlPath.startsWith(`${projectPrefix}/`)
    ? urlPath.slice(projectPrefix.length)
    : urlPath;
  const decoded = decodeURIComponent(withoutPrefix || '/');
  const relative = decoded.replace(/^\/+/, '');
  if (relative.split('/').includes('..')) return null;
  return relative;
}

async function readableFile(file) {
  try {
    await access(file);
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const relative = relativeRequestPath(requestUrl.pathname);
  if (relative === null) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const candidate = path.resolve(dist, relative || 'index.html');
  if (!candidate.startsWith(`${dist}${path.sep}`) && candidate !== dist) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const file = (await readableFile(candidate)) ? candidate : path.join(dist, 'index.html');
  if (!(await readableFile(file))) {
    response.writeHead(404).end('dist is not built');
    return;
  }
  const fileSize = (await stat(file)).size;
  const contentType = mime.get(path.extname(file)) || 'application/octet-stream';
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (request.headers.range && !range) {
    response.writeHead(416, { 'content-range': `bytes */${fileSize}` }).end();
    return;
  }
  if (range) {
    const suffixLength = range[1] === '' ? Number(range[2]) : null;
    const start = suffixLength === null ? Number(range[1]) : Math.max(0, fileSize - suffixLength);
    const requestedEnd = range[2] === '' || suffixLength !== null ? fileSize - 1 : Number(range[2]);
    const end = Math.min(requestedEnd, fileSize - 1);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= fileSize) {
      response.writeHead(416, { 'content-range': `bytes */${fileSize}` }).end();
      return;
    }
    response.writeHead(206, {
      'accept-ranges': 'bytes',
      'content-range': `bytes ${start}-${end}/${fileSize}`,
      'content-length': end - start + 1,
      'content-type': contentType,
    });
    createReadStream(file, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    'accept-ranges': 'bytes',
    'content-length': fileSize,
    'content-type': contentType,
  });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`Browser test server listening on ${port}`));
