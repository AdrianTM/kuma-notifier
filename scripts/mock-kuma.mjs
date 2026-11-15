// Loopback-only browser test fixture. Never uses real Kuma credentials.
import { createServer } from 'node:http';
import { Server } from 'socket.io';
const stats = { passwordLogins: 0, tokenLogins: 0 };
const http = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(stats));
});
const io = new Server(http);
function snapshot(socket, callback) {
  socket.emit('monitorList', { 1: { id: 1, name: 'Private service', active: true, parent: 90, path: ['Production', 'Private service'], pathName: 'Production / Private service', secret: 'must-not-be-stored' } });
  socket.emit('heartbeatList', 1, [{ status: 1, ping: 7, time: '2026-11-14 17:00:00' }]);
  callback({ ok: true, token: 'fixture-token' });
}
io.on('connection', socket => {
  socket.emit('loginRequired');
  socket.on('login', (credentials, callback) => {
    if (credentials.username !== 'demo' || credentials.password !== 'fixture-password') return callback({ ok: false });
    stats.passwordLogins++;
    snapshot(socket, callback);
  });
  socket.on('loginByToken', (token, callback) => {
    if (token !== 'fixture-token') return callback({ ok: false });
    stats.tokenLogins++;
    snapshot(socket, callback);
  });
});
http.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${http.address().port}`));
