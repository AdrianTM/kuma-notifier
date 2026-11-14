import { api, hasFirefoxDataConsent } from './browser.js';
import { DEFAULTS, validateConfig, hostPermission, publicConnection, connectionFromManifest, monitorUrl, requireSecureConnection } from './core.js';
const $ = id => document.getElementById(id);
let current = { ...DEFAULTS };
let needsSlug = false;
function mode() {
  const isPublic = $('mode').value === 'public';
  $('public-fields').hidden = !isPublic || !needsSlug;
  $('slug').required = isPublic && needsSlug;
  $('private-fields').hidden = isPublic;
  $('url-label').textContent = isPublic ? 'Status-page URL' : 'Instance base URL';
  $('url').placeholder = isPublic ? 'https://kuma.example/status/main' : 'https://kuma.your-tailnet.ts.net';
  $('url-hint').textContent = isPublic ? 'Paste the full address from your browser. Custom status-page domains are detected automatically when possible. Only published monitors are available.' : 'Use the base URL, without /dashboard. Tailscale must be connected if your instance needs it.';
}
$('url').addEventListener('input', () => { needsSlug = false; $('slug').value = ''; mode(); });
$('mode').addEventListener('change', mode);
async function load() {
  const { config } = await api.storage.local.get('config');
  current = { ...DEFAULTS, ...config };
  for (const key of ['mode', 'url', 'slug', 'interval']) $(key).value = current[key];
  if (config?.mode === 'public') $('url').value = monitorUrl(config);
  needsSlug = false;
  for (const key of ['outages', 'recoveries']) $(key).checked = current[key];
  $('disconnect').hidden = !config;
  if (config?.mode === 'private') $('credentials-hint').textContent = 'Connected with a locally stored login token. Leave username and password blank to reuse it, or enter both to sign in again. Your password is never saved.';
  mode();
}
function result(text, error = false) { $('result').textContent = text; $('result').className = error ? 'error' : 'success'; }
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('save').disabled = true;
  result('Connecting…');
  try {
    let draft = { ...current, ...Object.fromEntries(['mode', 'url', 'slug', 'interval'].map(k => [k, $(k).value])), outages: $('outages').checked, recoveries: $('recoveries').checked };
    if (draft.mode === 'public') draft = { ...draft, ...publicConnection(draft.url, draft.slug) };
    requireSecureConnection(draft.url);
    // Request inside the user gesture before other asynchronous work.
    const request = { origins: [hostPermission(draft.url)] };
    if (draft.outages || draft.recoveries) request.permissions = ['notifications'];
    if (draft.mode === 'private' && hasFirefoxDataConsent) request.data_collection = ['authenticationInfo'];
    if (!await api.permissions.request(request)) throw new Error('Access was not granted. Please grant host access to connect.');
    if (draft.mode === 'public' && !draft.slug) {
      try {
        const response = await fetch(draft.publicUrl, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Page unavailable.');
        // Parse inert HTML only; never execute the page's scripts or load its manifest.
        const document = new DOMParser().parseFromString(await response.text(), 'text/html');
        const href = document.querySelector('link[rel~="manifest"]')?.getAttribute('href');
        if (!href) throw new Error('No manifest link found.');
        draft = { ...draft, ...connectionFromManifest(draft.publicUrl, href) };
      } catch {
        needsSlug = true; mode(); $('slug').focus();
        result('Couldn’t detect the status-page slug. Enter it below the URL and try again. Also check that the page is reachable.', true);
        return;
      }
    }
    const config = validateConfig(draft);
    const credentials = { username: $('username').value.trim(), password: $('password').value, code: $('code').value.trim() };
    if (config.mode === 'private' && Boolean(credentials.username) !== Boolean(credentials.password)) throw new Error('Enter both username and password, or leave both blank to reuse the saved token.');
    const response = await api.runtime.sendMessage({ type: 'save', config, credentials });
    if (!response.ok) throw new Error(response.error);
    $('password').value = ''; $('code').value = ''; $('username').value = '';
    await load();
    result(`Connected. ${response.value.monitors.length} monitors loaded.`);
  } catch (error) { result(error.message, true); }
  finally { $('save').disabled = false; }
});
$('disconnect').addEventListener('click', async () => {
  const response = await api.runtime.sendMessage({ type: 'disconnect' });
  if (!response.ok) return result(response.error, true);
  await load(); result('Disconnected. Saved token and monitor data removed.');
});
load();
