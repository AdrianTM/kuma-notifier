// Local review fixture only. Never included in the browser extension bundle.
import { createServer } from 'node:http';
import { Server } from 'socket.io';

let status = 1;
const monitors = { 1: { id: 1, name: 'API server', active: true }, 2: { id: 2, name: 'Website', active: true } };
const beats = () => Object.fromEntries(Object.keys(monitors).map(id => [id, [{ monitorID: Number(id), status: id === '1' ? status : 1, time: new Date().toISOString(), ping: id === '1' ? 24 : 8, msg: id === '1' && status === 0 ? 'Simulated connection refused' : 'OK' }]]));
const http = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (request.method === 'POST' && ['/outage', '/recovery'].includes(path)) {
    status = path === '/outage' ? 0 : 1;
    response.writeHead(303, { Location: '/' }); response.end(); return;
  }
  if (path.startsWith('/api/status-page/')) {
    const payload = path.includes('/heartbeat/') ? { heartbeatList: beats(), uptimeList: { '1_24': 0.998, '2_24': 1 } } : { publicGroupList: [{ name: 'Demo services', monitorList: Object.values(monitors) }] };
    response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(payload)); return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kuma Notifier review fixture</title><link rel="manifest" href="/api/status-page/main/manifest.json"></head><body><h1>Kuma Notifier local test server</h1><p>Synthetic data for extension review. API server is ${status ? 'UP' : 'DOWN'}.</p><form method="post" action="/outage"><button>Simulate outage</button></form><form method="post" action="/recovery"><button>Simulate recovery</button></form><p>Public URL: /status/main. Account: demo / fixture-password.</p></body></html>`);
});
const io = new Server(http);
function send(socket, callback) {
  socket.emit('monitorList', monitors);
  for (const [id, list] of Object.entries(beats())) socket.emit('heartbeatList', id, list);
  callback({ ok: true, token: 'review-fixture-token' });
}
io.on('connection', socket => {
  socket.emit('loginRequired');
  socket.on('login', (credentials, callback) => {
    if (credentials.username === 'demo' && credentials.password === 'fixture-password') send(socket, callback);
    else callback({ ok: false });
  });
  socket.on('loginByToken', (token, callback) => token === 'review-fixture-token' ? send(socket, callback) : callback({ ok: false }));
});
http.listen(Number(process.env.KUMA_REVIEW_PORT || 3001), '127.0.0.1', () => console.log(`Review fixture: http://127.0.0.1:${http.address().port}\nPublic page: /status/main\nLocal test account: demo / fixture-password\nStop with Ctrl+C.`));
