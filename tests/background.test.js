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
