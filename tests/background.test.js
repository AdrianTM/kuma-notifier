import test from 'node:test';
import assert from 'node:assert/strict';
import { background } from './helpers/background.js';

const config = { mode: 'public', url: 'https://kuma.example', slug: 'main', interval: 2, outages: true, recoveries: true, snoozeUntil: 0 };

test('background wake restores a missing polling alarm without needing lifecycle events', async () => {
  for (const firefox of [true, false]) {
    const app = await background({ config }, { firefox });
    assert.deepEqual(app.created, [{ name: 'refresh', periodInMinutes: 2, delayInMinutes: 2 }]);
  }
});
test('background wake preserves existing alarm deadlines and skips unconfigured instances', async () => {
  const existing = await background({ config }, { alarm: { name: 'refresh', scheduledTime: 123 } });
  assert.equal(existing.created.length, 0);
  assert.equal((await background()).created.length, 0);
});
test('background wake does not restore private polling after authentication consent was revoked', async () => {
  const privateConfig = { ...config, mode: 'private' };
  assert.equal((await background({ config: privateConfig }, { consent: false })).created.length, 0);
  assert.equal((await background({ config: privateConfig }, { consent: true })).created.length, 1);
});

test('saving the same source preserves alert history through pending and reports recovery once', async () => {
  const app = await background({ config, snapshot: { monitors: [{ id: '1', name: 'API', status: 'down' }] } });
  app.setCollect(async () => ({ monitors: [{ id: '1', name: 'API', status: 'pending' }] }));
  await app.send({ type: 'refresh' });
  const save = await app.send({ type: 'save', config });
  assert.equal(save.ok, true);
  assert.equal(app.data.snapshot.monitors[0].alertStatus, 'down');
  app.setCollect(async () => ({ monitors: [{ id: '1', name: 'API', status: 'up' }] }));
  await app.send({ type: 'refresh' });
  assert.equal(app.notifications.length, 1);
  assert.equal(app.notifications[0].title, '1 recovered');
  await app.send({ type: 'refresh' });
  assert.equal(app.notifications.length, 1);
});
test('saving settings reports observed changes using the saved alert preferences', async () => {
  for (const [before, after, title] of [['up', 'down', '1 monitor down'], ['down', 'up', '1 recovered']]) {
    const app = await background({ config, snapshot: { monitors: [{ id: '1', status: before }] } });
    app.setCollect(async () => ({ monitors: [{ id: '1', status: after }] }));
    assert.equal((await app.send({ type: 'save', config })).ok, true);
    assert.equal(app.notifications[0].title, title);
    await app.send({ type: 'save', config });
    assert.equal(app.notifications.length, 1);
  }
  const muted = await background({ config, snapshot: { monitors: [{ id: '1', status: 'up' }] } });
  muted.setCollect(async () => ({ monitors: [{ id: '1', status: 'down' }] }));
  await muted.send({ type: 'save', config: { ...config, outages: false } });
  assert.equal(muted.notifications.length, 0);
});
test('new sources establish alert baselines, and notification failures do not fail settings saves', async () => {
  for (const initial of [{}, { config, snapshot: { monitors: [{ id: '1', status: 'down', alertStatus: 'down' }] } }]) {
    const app = await background(initial);
    app.setCollect(async () => ({ monitors: [{ id: '1', status: 'up' }] }));
    await app.send({ type: 'save', config: { ...config, slug: 'another' } });
    assert.equal(app.notifications.length, 0);
    assert.equal(app.data.snapshot.monitors[0].alertStatus, 'up');
  }
  const app = await background({ config, snapshot: { monitors: [{ id: '1', status: 'up' }] } });
  app.setCollect(async () => ({ monitors: [{ id: '1', status: 'down' }] }));
  app.api.notifications.create = async () => { throw new Error('OS unavailable'); };
  assert.equal((await app.send({ type: 'save', config })).ok, true);
  assert.equal(app.data.snapshot.monitors[0].status, 'down');
});
