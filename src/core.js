export const DEFAULTS = { mode: 'private', url: '', slug: '', interval: 1, outages: true, recoveries: true, snoozeUntil: 0 };
export function baseUrl(input) {
  const url = new URL(input.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS URL without embedded credentials.');
  if (url.search || url.hash) throw new Error('Use the instance base URL without a query or fragment.');
  return url.href.replace(/\/+$/, '');
}
export function requireSecureConnection(input) {
  const url = new URL(input);
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127\./.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('Use HTTPS for remote Kuma servers. HTTP is supported only on localhost for local testing.');
  }
}
export function publicConnection(input, fallbackSlug = '') {
  const page = new URL(input.trim());
  // Copied page URLs can include tracking parameters or an anchor.
  page.search = ''; page.hash = '';
  const publicUrl = baseUrl(page.href);
  const path = page.pathname.replace(/\/+$/, '');
  const match = path.match(/^(.*)\/status(?:\/([^/]+))?$/);
  if (match) {
    const slug = match[2] ? decodeURIComponent(match[2]) : 'default';
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error('This URL does not contain a valid status-page slug.');
    return { url: `${page.origin}${match[1]}`, slug, publicUrl };
  }
  if (path.endsWith('/status-page')) return { url: `${page.origin}${path.slice(0, -12)}`, slug: 'default', publicUrl };
  return { url: publicUrl, slug: fallbackSlug.trim(), publicUrl };
}
export function connectionFromManifest(pageUrl, href) {
  const page = new URL(pageUrl);
  const manifest = new URL(href, pageUrl);
  const match = manifest.pathname.match(/^(.*)\/api\/status-page\/([a-zA-Z0-9_-]+)\/manifest\.json$/);
  if (manifest.origin !== page.origin || manifest.username || manifest.password || !match) throw new Error('No Kuma status-page information found.');
  return { url: `${manifest.origin}${match[1]}`, slug: match[2], publicUrl: baseUrl(pageUrl) };
}
export function validateConfig(input) {
  const config = { ...DEFAULTS, ...input, url: baseUrl(input.url) };
  requireSecureConnection(config.url);
  if (!['private', 'public'].includes(config.mode)) throw new Error('Choose a connection method.');
  if (![1, 2, 5, 10].includes(Number(config.interval))) throw new Error('Choose a valid refresh interval.');
  config.interval = Number(config.interval);
  config.slug = String(config.slug || '').trim();
  if (config.mode === 'public' && !/^[a-zA-Z0-9_-]+$/.test(config.slug)) throw new Error('Enter the status-page slug, for example main.');
  if (config.mode === 'public' && config.publicUrl) {
    config.publicUrl = baseUrl(config.publicUrl);
    if (new URL(config.publicUrl).origin !== new URL(config.url).origin) throw new Error('The status page and instance must use the same host.');
  } else delete config.publicUrl;
  return config;
}
export function sourceKey(config) { return JSON.stringify([config.mode, config.url, config.mode === 'public' ? config.slug : '']); }
export function hostPermission(input) {
  const url = new URL(input);
  // WebExtension match patterns grant a host across ports; explicit ports are
  // not portable between browsers. Keep the connection URL's port separately.
  return `${url.protocol}//${url.hostname}/*`;
}
export function statusOf(monitor, beat) {
  if (monitor.active === false || monitor.active === 0) return 'paused';
  if (monitor.maintenance) return 'maintenance';
  return ({ 0: 'down', 1: 'up', 2: 'pending', 3: 'maintenance' })[beat?.status] || 'unknown';
}
export function newest(beats = []) {
  return beats.reduce((latest, beat) => !latest || String(beat.time) >= String(latest.time) ? beat : latest, null);
}
export function normalize(monitors, heartbeats, uptime = {}) {
  return Object.values(monitors).filter(m => m.type !== 'group').map(m => {
    const beat = newest(heartbeats[m.id]);
    return { id: String(m.id), name: String(m.name || `Monitor ${m.id}`), group: m.group || '',
      status: statusOf(m, beat), ping: typeof beat?.ping === 'number' ? beat.ping : null,
      message: String(beat?.msg || ''), time: beat?.time || null,
      uptime: typeof uptime[`${m.id}_24`] === 'number' ? uptime[`${m.id}_24`] : null };
  });
}
export function transitions(previous, current, config, now = Date.now()) {
  if (!previous || config.snoozeUntil > now) return [];
  const old = new Map(previous.map(m => [m.id, m]));
  return current.filter(m => {
    const before = old.get(m.id)?.alertStatus || old.get(m.id)?.status;
    if (!before || before === m.status) return false;
    if (m.status === 'down') return config.outages && ['up', 'pending', 'unknown', 'maintenance'].includes(before);
    return config.recoveries && m.status === 'up' && before === 'down';
  });
}
export function carryAlertState(previous, current) {
  const old = new Map((previous || []).map(m => [m.id, m]));
  return current.map(m => ({ ...m, alertStatus: ['pending', 'unknown'].includes(m.status)
    ? old.get(m.id)?.alertStatus || old.get(m.id)?.status || m.status : m.status }));
}
export function downCount(snapshot) { return (snapshot?.monitors || []).filter(m => m.status === 'down').length; }
export function badgeCleared(snapshot) {
  return !snapshot?.error && snapshot?.clearedDownCount > 0 && snapshot.clearedDownCount === downCount(snapshot);
}
export function carryBadgeState(previous, current) {
  const next = { ...current };
  delete next.clearedDownCount;
  // Failed checks do not establish a new count; keep the acknowledgement but
  // always let the connection-error badge show until checks succeed again.
  if (previous?.clearedDownCount > 0 && (next.error || previous.clearedDownCount === downCount(next))) {
    next.clearedDownCount = previous.clearedDownCount;
  }
  return next;
}
export function badge(snapshot) {
  if (!snapshot) return { text: '', color: '#64748b', title: 'Kuma Notifier — connect an instance' };
  if (snapshot.error) return { text: '?', color: '#b45309', title: 'Kuma Notifier — connection unavailable; cached results may be stale' };
  const down = downCount(snapshot);
  const cleared = badgeCleared(snapshot);
  const uncertain = snapshot.monitors.some(m => ['unknown', 'pending'].includes(m.status));
  return { text: down ? (cleared ? '' : down > 99 ? '99+' : String(down)) : uncertain ? '!' : '',
    color: down ? '#dc2626' : uncertain ? '#b45309' : '#16a34a',
    title: `Kuma Notifier — ${down} down · ${snapshot.monitors.length} monitors${cleared ? ' · badge hidden until count changes' : ''}` };
}
export function monitorUrl(config, id) {
  return config.mode === 'public' ? config.publicUrl || `${config.url}/status/${encodeURIComponent(config.slug)}` : `${config.url}/dashboard${id ? `/${encodeURIComponent(id)}` : ''}`;
}
