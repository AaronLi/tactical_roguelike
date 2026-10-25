// Zero-dependency static file server: `node serve.js`, then open http://localhost:8080 here, or the network
// address it prints from another machine on your network. PORT and HOST can be set in the environment.
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = __dirname, port = +process.env.PORT || 8080, host = process.env.HOST || '::'; // '::': every interface, IPv4 too
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.md': 'text/markdown',
};
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.normalize(path.join(root, url === '/' ? 'index.html' : url));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  // a folder: a listing of its files (how the game finds what's in assets/stickers/, js/stickers.js)
  if (url !== '/' && url.endsWith('/')) {
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
