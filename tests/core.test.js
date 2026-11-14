import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, baseUrl, validateConfig, requireSecureConnection, hostPermission, publicConnection, connectionFromManifest, normalize, transitions, carryAlertState, badge, monitorUrl, sourceKey } from '../src/core.js';
test('remote connections require encryption while loopback fixtures remain available', () => {
  for (const url of ['https://kuma.example.com', 'http://localhost:3001', 'http://127.0.0.1:3001', 'http://[::1]:3001']) assert.doesNotThrow(() => requireSecureConnection(url));
  for (const url of ['http://kuma.example.com', 'http://100.80.2.1:3001', 'http://localhost.example.com', 'ftp://localhost']) {
    assert.throws(() => validateConfig({ mode: 'public', url, slug: 'main' }));
  }
});
test('pasted public URLs extract slugs while preserving ports and reverse-proxy paths', () => {
  assert.deepEqual(publicConnection(' http://100.80.2.1:3001/kuma/status/main/?view=all#services '), {
    url: 'http://100.80.2.1:3001/kuma', slug: 'main', publicUrl: 'http://100.80.2.1:3001/kuma/status/main',
  });
  assert.equal(publicConnection('https://kuma.example/status/%6Dain', 'old').slug, 'main');
  for (const path of ['/status', '/status/', '/status-page']) {
    assert.equal(publicConnection(`https://kuma.example/base${path}`).url, 'https://kuma.example/base');
    assert.equal(publicConnection(`https://kuma.example/base${path}`).slug, 'default');
  }
  assert.throws(() => publicConnection('https://kuma.example/status/a%2Fb'));
  assert.throws(() => publicConnection('https://user:secret@kuma.example/status/main'));
});
test('custom-domain discovery uses only Kuma manifest paths on the permitted origin', () => {
  assert.equal(publicConnection('https://status.example').slug, '');
  const connection = connectionFromManifest('https://status.example', '/api/status-page/production/manifest.json');
  assert.equal(connection.slug, 'production');
  assert.equal(monitorUrl({ ...connection, mode: 'public' }), 'https://status.example');
  assert.equal(connectionFromManifest('https://kuma.example/base/', 'api/status-page/main/manifest.json').url, 'https://kuma.example/base');
  assert.equal(publicConnection('https://status.example', ' manual ').slug, 'manual');
  for (const href of ['https://other.example/api/status-page/main/manifest.json', '/manifest.json', 'javascript:alert(1)']) {
    assert.throws(() => connectionFromManifest('https://status.example', href));
  }
  assert.throws(() => validateConfig({ mode: 'public', ...connection, publicUrl: 'https://other.example' }));
});
test('accepts private hosts and subpaths but rejects credentials and non-HTTP URLs', () => {
  assert.equal(baseUrl('http://100.80.2.1:3001/'), 'http://100.80.2.1:3001');
  assert.equal(hostPermission('http://100.80.2.1:3001/'), 'http://100.80.2.1/*');
  assert.equal(baseUrl('https://kuma.example/kuma/'), 'https://kuma.example/kuma');
  for (const url of ['javascript:alert(1)', 'https://user:secret@kuma.example', 'https://kuma.example/?token=x']) assert.throws(() => baseUrl(url));
  assert.throws(() => validateConfig({ url: 'https://kuma.example', mode: 'public', slug: '../admin' }));
});
test('normalizes out-of-order histories, excludes groups, and separates paused and maintenance states', () => {
  const monitors = [{ id: 1, name: 'API', active: true }, { id: 2, active: false }, { id: 3, maintenance: true }, { id: 4 }, { id: 5, type: 'group' }];
  const result = normalize(monitors, { 1: [{ time: '2026-01-02', status: 0 }, { time: '2026-01-01', status: 1 }], 2: [{ status: 0 }], 3: [{ status: 0 }] });
  assert.deepEqual(result.map(m => m.status), ['down', 'paused', 'maintenance', 'unknown']);
  assert.equal(badge({ monitors: result }).text, '1');
});
test('alerts only on observed transitions, suppressing first load, maintenance, repeats and snoozed alerts', () => {
  const before = [{ id: '1', status: 'up' }, { id: '2', status: 'down' }, { id: '3', status: 'maintenance' }];
  const after = [{ id: '1', status: 'down' }, { id: '2', status: 'up' }, { id: '3', status: 'up' }, { id: '4', status: 'down' }];
  assert.equal(transitions(null, after, DEFAULTS).length, 0);
  assert.deepEqual(transitions(before, after, DEFAULTS).map(m => m.id), ['1', '2']);
  assert.equal(transitions(after, after, DEFAULTS).length, 0);
  assert.equal(transitions(before, after, { ...DEFAULTS, snoozeUntil: 200 }, 100).length, 0);
  assert.deepEqual(transitions(before, after, { ...DEFAULTS, recoveries: false }).map(m => m.id), ['1']);
});
test('badge never presents failed connections as all healthy', () => {
  assert.equal(badge({ monitors: [], error: 'Offline' }).text, '?');
  assert.equal(badge({ monitors: [{ status: 'pending' }] }).text, '!');
  assert.equal(badge({ monitors: Array.from({ length: 100 }, () => ({ status: 'down' })) }).text, '99+');
});
test('pending heartbeats do not duplicate outages or hide a later recovery', () => {
  const pending = carryAlertState([{ id: '1', status: 'down' }], [{ id: '1', status: 'pending' }]);
  assert.equal(transitions(pending, [{ id: '1', status: 'down' }], DEFAULTS).length, 0);
  assert.equal(transitions(pending, [{ id: '1', status: 'up' }], DEFAULTS).length, 1);
});
test('links preserve base path and public pages cannot link into private monitor details', () => {
  const config = { url: 'https://kuma.example/base', mode: 'public', slug: 'main' };
  assert.equal(monitorUrl(config, '1'), 'https://kuma.example/base/status/main');
  assert.equal(monitorUrl({ ...config, mode: 'private' }, '1'), 'https://kuma.example/base/dashboard/1');
  assert.notEqual(sourceKey(config), sourceKey({ ...config, slug: 'second' }));
});
