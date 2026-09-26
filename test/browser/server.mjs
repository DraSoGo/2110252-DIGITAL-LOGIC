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
  response.writeHead(200, { 'content-type': mime.get(path.extname(file)) || 'application/octet-stream' });
  createReadStream(file).pipe(response);
});

server.listen(port, '127.0.0.1', () => console.log(`Browser test server listening on ${port}`));
