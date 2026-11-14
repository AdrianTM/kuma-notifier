import { api } from './browser.js';
import { validateConfig, sourceKey, hostPermission, transitions, carryAlertState, badge, monitorUrl } from './core.js';
import { privateSnapshot, publicSnapshot } from './kuma.js';

let queue = Promise.resolve();
function serialize(task) {
  const result = queue.then(task);
  queue = result.catch(() => {});
  return result;
}
async function paint(snapshot) {
  const info = badge(snapshot);
  await Promise.all([api.action.setBadgeText({ text: info.text }), api.action.setBadgeBackgroundColor({ color: info.color }), api.action.setTitle({ title: info.title })]);
}
async function schedule(config) {
  await api.alarms.create('refresh', { periodInMinutes: config.interval, delayInMinutes: config.interval });
}
async function collect(config, token, credentials) {
  return config.mode === 'public' ? publicSnapshot(config) : privateSnapshot(config, credentials || { token });
}
async function notify(changes) {
  if (!changes.length || !await api.permissions.contains({ permissions: ['notifications'] })) return;
  const down = changes.filter(m => m.status === 'down').length;
  const up = changes.length - down;
  await api.notifications.create('kuma-status', {
    type: 'basic', iconUrl: api.runtime.getURL('icons/icon-128.png'),
    title: [down && `${down} monitor${down === 1 ? '' : 's'} down`, up && `${up} recovered`].filter(Boolean).join(' · '),
    message: changes.slice(0, 5).map(m => `${m.name}: ${m.status === 'up' ? 'recovered' : 'down'}`).join('\n') + (changes.length > 5 ? `\n…and ${changes.length - 5} more` : ''),
  });
}
async function refresh() {
  const { config, token, snapshot } = await api.storage.local.get(['config', 'token', 'snapshot']);
  if (!config?.url) return;
  try {
    const result = await collect(config, token);
    const next = { monitors: carryAlertState(snapshot?.monitors, result.monitors), updatedAt: Date.now(), error: null };
    const changes = transitions(snapshot?.monitors, next.monitors, config);
    await api.storage.local.set({ snapshot: next });
    await paint(next);
    // Notification permission or OS errors must not turn a successful refresh into a connection failure.
    await notify(changes).catch(() => {});
    return next;
  } catch (error) {
    const next = { monitors: snapshot?.monitors || [], updatedAt: snapshot?.updatedAt || null, error: error.message };
    await api.storage.local.set({ snapshot: next });
    await paint(next);
    return next;
  }
}
async function handle(message) {
  if (message.type === 'refresh') return refresh();
  if (message.type === 'save') {
    const config = validateConfig(message.config);
    const origin = hostPermission(config.url);
    if (!await api.permissions.contains({ origins: [origin] })) throw new Error('Grant access to this Kuma host before connecting.');
    const previous = await api.storage.local.get(['config', 'token']);
    const same = previous.config && sourceKey(previous.config) === sourceKey(config);
    const credentials = message.credentials?.username && message.credentials?.password ? message.credentials : undefined;
    const result = await collect(config, same ? previous.token : undefined, credentials);
    const snapshot = { monitors: result.monitors, updatedAt: Date.now(), error: null };
    await api.storage.local.set({ config, snapshot, token: config.mode === 'private' ? result.token || null : null });
    await schedule(config);
    await paint(snapshot);
    return snapshot;
  }
  if (message.type === 'snooze') {
    const { config } = await api.storage.local.get('config');
    if (!config) return;
    config.snoozeUntil = message.enabled ? Date.now() + 60 * 60 * 1000 : 0;
    await api.storage.local.set({ config });
  }
  if (message.type === 'disconnect') {
    const { config } = await api.storage.local.get('config');
    await api.alarms.clear('refresh');
    await api.storage.local.remove(['config', 'snapshot', 'token']);
    await paint(null);
    if (config?.url) await api.permissions.remove({ origins: [hostPermission(config.url)] });
  }
}
api.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== api.runtime.id) return false;
  serialize(() => handle(message)).then(value => respond({ ok: true, value }), error => respond({ ok: false, error: error.message }));
  return true;
});
api.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'refresh') serialize(refresh); });
async function start() {
  const { config } = await api.storage.local.get('config');
  if (config?.url) { await schedule(config); await refresh(); }
  else await paint(null);
}
api.runtime.onInstalled.addListener(() => serialize(start));
api.runtime.onStartup.addListener(() => serialize(start));
async function notificationClicked(id) {
  if (id !== 'kuma-status') return;
  const { config } = await api.storage.local.get('config');
  if (config) await api.tabs.create({ url: monitorUrl(config) });
}
function registerNotificationClick() {
  const event = api.notifications?.onClicked;
  if (event && !event.hasListener(notificationClicked)) event.addListener(notificationClicked);
}
registerNotificationClick();
api.permissions.onAdded.addListener(registerNotificationClick);
