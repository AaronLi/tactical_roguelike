// Zero-dependency static file server: `node serve.js`, then open http://localhost:8080 here, or the network
// address it prints from another machine on your network. PORT and HOST can be set in the environment.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = __dirname, port = +process.env.PORT || 8080, host = process.env.HOST || '::'; // '::': every interface, IPv4 too
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.md': 'text/markdown',
  '.map': 'application/json', '.ts': 'text/plain', // (the source maps, and the TypeScript they point back to: the browser's devtools show js/*.ts)
};
// A level's recording (js/recorder.ts, docs/recording.md): POST /rec?name=..., written to recordings/<name>.json. Only from this
// machine (it listens on every interface, and anyone on the network could fill the disk otherwise).
const REC_DIR = path.join(root, 'recordings'), REC_MAX = 256 * 1024 * 1024;
function saveRec(req, res) {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  if (!local) { res.writeHead(403); return res.end('recordings are taken only from this machine'); }
  const name = (new URL(req.url, 'http://x').searchParams.get('name') || '').replace(/[^\w.-]/g, '_').replace(/^\.+/, '').slice(0, 120);
  if (!name) { res.writeHead(400); return res.end('no name'); }
  const parts = []; let n = 0, over = false;
  req.on('data', (c) => { if (over) return; n += c.length; if (n > REC_MAX) { over = true; res.writeHead(413); res.end('too big'); req.destroy(); return; } parts.push(c); });
  req.on('end', () => {
    if (over) return;
    fs.mkdir(REC_DIR, { recursive: true }, (err) => {
      if (err) { res.writeHead(500); return res.end(String(err)); }
      const file = path.join(REC_DIR, name + '.json');
      fs.writeFile(file, Buffer.concat(parts), (err2) => {
        if (err2) { res.writeHead(500); return res.end(String(err2)); }
        console.log(`recording saved: recordings/${name}.json (${(n / 1048576).toFixed(1)} MB)`);
        res.writeHead(200); res.end('ok');
      });
    });
  });
}
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/rec') { if (req.method === 'POST') return saveRec(req, res); res.writeHead(405); return res.end(); }
  let file = path.normalize(path.join(root, url === '/' ? 'index.html' : url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  // a folder: its index.html if it has one (a tool's page, e.g. tools/contact-synth/), else a listing of its files
  // (how the game finds what's in assets/stickers/, js/stickers.ts)
  if (url !== '/' && url.endsWith('/') && fs.existsSync(path.join(file, 'index.html'))) file = path.join(file, 'index.html');
  else if (url !== '/' && url.endsWith('/')) {
    return fs.readdir(file, { withFileTypes: true }, (err, list) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(`<!doctype html><ul>${list.filter((d) => d.isFile()).map((d) => `<li><a href="${esc(encodeURIComponent(d.name))}">${esc(d.name)}</a></li>`).join('')}</ul>`);
    });
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${port} is already in use: is the game already running? (or set PORT=8081)`);
  else console.error(e);
  process.exit(1);
});
server.listen(port, host, () => {
  console.log(`Breach Protocol running at http://localhost:${port}`);
  // the addresses other machines on your network can use
  const lan = Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
  for (const a of lan) console.log(`  on your network:  http://${a}:${port}`);
  if (lan.length) console.log('  (if others can\'t connect, allow Node.js through your firewall for private networks)');
});
