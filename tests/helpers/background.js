import { build } from 'esbuild';
import vm from 'node:vm';

const bundle = await build({
  entryPoints: ['src/background.js'], bundle: true, write: false, format: 'iife',
  plugins: [{ name: 'fixture-adapters', setup(build) {
    build.onResolve({ filter: /^\.\/kuma\.js$/ }, () => ({ path: 'adapters', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const publicSnapshot = (...args) => globalThis.collect(...args); export const privateSnapshot = (...args) => globalThis.collect(...args);' }));
  } }],
});

function event() {
  const listeners = [];
  return { addListener: listener => listeners.push(listener), hasListener: listener => listeners.includes(listener), listeners };
}
export async function background(initial = {}, { alarm, consent = true, firefox = true } = {}) {
  const data = structuredClone(initial);
  const created = [], removed = [], notifications = [];
  const api = {
    runtime: { id: 'test-extension', getURL: path => path, onMessage: event(), onInstalled: event(), onStartup: event(), ...(firefox ? { getBrowserInfo() {} } : {}) },
    storage: { local: {
      async get(keys) { return Object.fromEntries((typeof keys === 'string' ? [keys] : keys).filter(key => key in data).map(key => [key, structuredClone(data[key])])); },
      async set(values) { Object.assign(data, structuredClone(values)); },
      async remove(keys) { for (const key of typeof keys === 'string' ? [keys] : keys) delete data[key]; },
    } },
    alarms: { onAlarm: event(), async get() { return alarm; }, async create(name, options) { created.push({ name, ...options }); alarm = { name, ...options }; }, async clear() { alarm = undefined; } },
    permissions: { onAdded: event(), onRemoved: event(), async contains() { return true; }, async getAll() { return { data_collection: consent ? ['authenticationInfo'] : [] }; }, async remove(value) { removed.push(structuredClone(value)); return true; } },
    notifications: { onClicked: event(), async create(id, options) { notifications.push({ id, ...options }); } },
    action: { async setBadgeText() {}, async setBadgeBackgroundColor() {}, async setTitle() {} },
    tabs: { async create() {} },
  };
  let collect = async () => ({ monitors: [] });
  vm.runInNewContext(bundle.outputFiles[0].text, { browser: api, console, URL, setTimeout, clearTimeout, collect: (...args) => collect(...args) });
  const send = message => new Promise(resolve => api.runtime.onMessage.listeners[0](message, { id: api.runtime.id }, resolve));
  await send({ type: 'test-drain' });
  return { api, data, created, removed, notifications, send, setCollect: fn => { collect = fn; } };
}
