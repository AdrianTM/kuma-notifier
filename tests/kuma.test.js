import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { privateSnapshot, publicSnapshot } from '../src/kuma.js';

async function fixture(t, onConnection) {
  const http = createServer();
  const server = new Server(http, { path: '/kuma/socket.io' });
  server.on('connection', onConnection);
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { url: `http://127.0.0.1:${http.address().port}/kuma` };
}
function sendSnapshot(socket) {
  socket.emit('monitorList', { 1: { id: 1, name: 'Private API', active: true }, 2: { id: 2, name: 'Paused', active: false } });
  socket.emit('heartbeatList', 1, [{ status: 0, time: '2026-11-14 12:00:00', ping: 15 }]);
  socket.emit('uptime', 1, 24, .995);
}
test('login waits for the token even when monitor data arrives before the authentication callback', async t => {
  const config = await fixture(t, socket => {
    socket.emit('loginRequired');
    socket.on('login', (credentials, callback) => {
      assert.equal(credentials.username, 'adrian');
      assert.equal(credentials.password, 'test-password');
      sendSnapshot(socket);
      setTimeout(() => callback({ ok: true, token: 'local-token' }), 400);
    });
  });
  const result = await privateSnapshot(config, { username: 'adrian', password: 'test-password' });
  assert.equal(result.token, 'local-token');
  assert.equal(result.monitors[0].status, 'down');
  assert.equal(result.monitors[0].uptime, .995);
  assert.equal(result.monitors[1].status, 'paused');
});
test('reconnects with token and handles zero monitors', async t => {
  const config = await fixture(t, socket => {
    socket.emit('loginRequired');
    socket.on('loginByToken', (token, callback) => { assert.equal(token, 'saved'); socket.emit('monitorList', {}); callback({ ok: true }); });
  });
  assert.deepEqual((await privateSnapshot(config, { token: 'saved' })).monitors, []);
});
test('expired tokens and 2FA requirements produce actionable errors', async t => {
  const config = await fixture(t, socket => {
    socket.emit('loginRequired');
    socket.on('loginByToken', (_, callback) => callback({ ok: false }));
    socket.on('login', (_, callback) => callback({ tokenRequired: true }));
  });
  await assert.rejects(privateSnapshot(config, { token: 'expired' }), /expired/);
  await assert.rejects(privateSnapshot(config, { username: 'u', password: 'p' }), /two-factor/);
});
test('public adapter reads both endpoints and limits monitors to the published groups', async () => {
  const paths = [];
  const fetcher = async (url, options) => {
    paths.push(url); assert.equal(options.credentials, 'omit');
    return { ok: true, json: async () => url.includes('/heartbeat/') ? { heartbeatList: { 7: [{ status: 1, ping: 12 }] }, uptimeList: { '7_24': 1 } } : { publicGroupList: [{ name: 'Production', monitorList: [{ id: 7, name: 'Website' }] }] } };
  };
  const result = await publicSnapshot({ url: 'https://example.com/kuma', slug: 'main' }, fetcher);
  assert.equal(result.monitors[0].group, 'Production');
  assert.equal(result.monitors[0].status, 'up');
  assert.deepEqual(paths.sort(), ['https://example.com/kuma/api/status-page/heartbeat/main', 'https://example.com/kuma/api/status-page/main']);
});
test('public adapter rejects invalid responses rather than showing zero outages', async () => {
  await assert.rejects(publicSnapshot({ url: 'http://example.com', slug: 'main' }, async () => ({ ok: true, json: async () => ({}) })), /Unexpected/);
});
