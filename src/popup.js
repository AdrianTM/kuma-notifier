import { api } from './browser.js';
import { monitorUrl, downCount, badgeCleared, sourceKey } from './core.js';
const $ = id => document.getElementById(id);
let config, snapshot;
const priority = { down: 0, pending: 1, unknown: 2, maintenance: 3, up: 4, paused: 5 };
function element(tag, className, text) { const node = document.createElement(tag); node.className = className; if (text != null) node.textContent = text; return node; }
function render() {
  $('welcome').hidden = Boolean(config);
  $('connected').hidden = !config;
  $('snooze').hidden = !config;
  if (!config) return;
  $('instance').textContent = new URL(config.url).host;
  const monitors = snapshot?.monitors || [];
  const cleared = badgeCleared(snapshot);
  $('badge-controls').hidden = Boolean(snapshot?.error) || !downCount(snapshot);
  $('clear-badge').textContent = cleared ? 'Show badge' : 'Clear badge';
  $('badge-hint').textContent = cleared ? 'Hidden until down count changes' : 'Until down count changes';
  $('summary').replaceChildren(...['down', 'up', 'other'].map(status => {
    const count = monitors.filter(m => status === 'other' ? !['up', 'down'].includes(m.status) : m.status === status).length;
    const tile = element('div', `stat ${status}`); tile.append(element('b', '', count), document.createTextNode(status === 'other' ? 'Other states' : status === 'up' ? 'Up' : 'Down')); return tile;
  }));
  const stale = snapshot?.updatedAt && Date.now() - snapshot.updatedAt > (config.interval * 2 + 1) * 60000;
  $('connection').textContent = snapshot?.error ? `${snapshot.error} Showing last known results.` : stale ? 'Updates are overdue. These results may be stale.' : '';
  $('connection').hidden = !snapshot?.error && !stale;
  const query = $('search').value.toLowerCase();
  const filter = $('filter').value;
  const visible = monitors.filter(m => `${m.name} ${m.group}`.toLowerCase().includes(query) && (filter === 'all' || (filter === 'problems' ? ['down', 'pending', 'unknown'].includes(m.status) : m.status === filter))).sort((a, b) => priority[a.status] - priority[b.status] || a.name.localeCompare(b.name));
  $('monitors').replaceChildren(...visible.map(m => {
    const link = element('a', 'monitor'); link.href = monitorUrl(config, m.id); link.target = '_blank'; link.rel = 'noopener noreferrer';
    const info = element('span', 'monitor-info');
    const details = [m.group, m.ping != null ? `${m.ping} ms` : '', m.uptime != null ? `${(m.uptime * 100).toFixed(2)}% · 24h` : ''].filter(Boolean).join(' · ');
    info.append(element('span', 'monitor-name', m.name), element('span', 'monitor-detail', m.status === 'down' && m.message ? m.message : details || 'No recent metrics'));
    link.title = [m.name, m.message, m.time ? `Last heartbeat: ${m.time} UTC` : ''].filter(Boolean).join('\n');
    link.append(element('span', `dot ${m.status}`), info, element('span', 'status', m.status)); return element('li', '').appendChild(link).parentNode;
  }));
  $('empty').hidden = visible.length > 0;
  $('empty').textContent = monitors.length ? 'No monitors match.' : 'No monitors returned by this connection.';
  $('updated').textContent = snapshot?.updatedAt ? `Updated ${new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Waiting for first update';
  $('snooze').textContent = config.snoozeUntil > Date.now() ? 'Resume alerts' : 'Snooze alerts · 1h';
}
async function load() { ({ config, snapshot } = await api.storage.local.get(['config', 'snapshot'])); render(); }
async function send(message) {
  $('error').hidden = true;
  try { const response = await api.runtime.sendMessage(message); if (!response.ok) throw new Error(response.error); await load(); }
  catch (error) { $('error').textContent = error.message; $('error').hidden = false; }
}
for (const id of ['settings', 'connect']) $(id).addEventListener('click', () => api.runtime.openOptionsPage());
$('search').addEventListener('input', render); $('filter').addEventListener('change', render);
$('dashboard').addEventListener('click', () => api.tabs.create({ url: monitorUrl(config) }));
$('snooze').addEventListener('click', () => send({ type: 'snooze', enabled: !(config.snoozeUntil > Date.now()) }));
$('clear-badge').addEventListener('click', async () => {
  $('clear-badge').disabled = true;
  await send({ type: badgeCleared(snapshot) ? 'restore-badge' : 'clear-badge', count: downCount(snapshot), source: sourceKey(config) });
  $('clear-badge').disabled = false;
});
$('refresh').addEventListener('click', async () => { $('refresh').disabled = true; $('refresh').textContent = 'Refreshing…'; await send({ type: 'refresh' }); $('refresh').disabled = false; $('refresh').textContent = 'Refresh'; });
api.storage.onChanged.addListener((_, area) => { if (area === 'local') load(); });
load();
