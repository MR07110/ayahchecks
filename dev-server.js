// Lokal server: statik fayllar + /api/* (akkaunt va Vercel shart emas).
// Kalitlar .env.local dan o'qiladi:  GROQ_API_KEY=...  OLLAMA_KEY=...
// Ishga tushirish:  node dev-server.js   ->  http://localhost:3000
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = __dirname, PORT = process.env.PORT || 3000;
try {
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n').forEach(l => {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch { console.log(".env.local topilmadi — kalitlar yo'q"); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x'), p = decodeURIComponent(url.pathname);
  if (p.startsWith('/api/')) {
    const name = p.slice(5).replace(/[^a-z0-9_-]/gi, ''), file = path.join(ROOT, 'api', name + '.js');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end("yo'q"); }
    let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
      try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
      res.status = c => { res.statusCode = c; return res; };
      res.json = o => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      res.send = t => res.end(t);
      Promise.resolve(require(file)(req, res)).catch(e => { res.statusCode = 500; res.end(JSON.stringify({ error: { message: e.message } })); });
    });
    return;
  }
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log('http://localhost:' + PORT));
