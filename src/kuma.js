import { io } from 'socket.io-client';
import { Fetch, WebSocket } from 'engine.io-client';
import { normalize } from './core.js';

export async function publicSnapshot(config, fetcher = fetch) {
  const get = async path => {
    const response = await fetcher(`${config.url}${path}`, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Status page returned HTTP ${response.status}.`);
    return response.json();
  };
  const slug = encodeURIComponent(config.slug);
  const [page, data] = await Promise.all([get(`/api/status-page/${slug}`), get(`/api/status-page/heartbeat/${slug}`)]);
  if (!Array.isArray(page.publicGroupList) || !data.heartbeatList) throw new Error('Unexpected status-page response. Check the base URL and slug.');
  const monitors = page.publicGroupList.flatMap(g => (g.monitorList || []).map(m => ({ ...m, group: g.name })));
  return { monitors: normalize(monitors, data.heartbeatList, data.uptimeList) };
}

// Short, bounded sessions work in both Firefox event pages and Chrome service workers.
export function privateSnapshot(config, credentials = {}, socketFactory = io) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.url);
    const socket = socketFactory(url.origin, {
      path: `${url.pathname.replace(/\/$/, '')}/socket.io`, autoConnect: false,
      transports: [Fetch, WebSocket], reconnection: false, timeout: 15000,
    });
    let monitors = null;
    let token = credentials.token;
    let settled = false;
    let authenticated = false;
    let settleTimer;
    const heartbeats = {};
    const uptime = {};
    const timeout = setTimeout(() => finish(new Error('Kuma did not finish sending monitor data within 25 seconds. Check connectivity and sign-in.')), 25000);
    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(settleTimer);
      socket.disconnect();
      if (error) reject(error);
      else resolve({ monitors: normalize(monitors, heartbeats, uptime), token });
    }
    function maybeFinish() {
      if (!monitors || !authenticated) return;
      const expected = Object.values(monitors).filter(m => m.active && m.type !== 'group');
      if (expected.every(m => Object.hasOwn(heartbeats, m.id))) {
        clearTimeout(settleTimer);
        settleTimer = setTimeout(() => finish(), 250);
      }
    }
    socket.on('connect_error', () => finish(new Error('Cannot reach Kuma. Check the URL, Tailscale connection, and certificate.')));
    socket.on('disconnect', () => finish(new Error('Kuma disconnected before the refresh completed.')));
    socket.on('loginRequired', () => {
      const callback = result => {
        if (!result?.ok) return finish(new Error(result?.tokenRequired ? 'A two-factor code is required. Enter a current code and try again.' : 'Sign-in failed or the saved token expired. Reconnect in Settings.'));
        if (result.token) token = result.token;
        authenticated = true;
        maybeFinish();
      };
      if (credentials.token) socket.emit('loginByToken', credentials.token, callback);
      else if (credentials.username && credentials.password) socket.emit('login', { username: credentials.username, password: credentials.password, token: credentials.code || '' }, callback);
      else finish(new Error('Sign in with your Kuma username and password in Settings.'));
    });
    socket.on('autoLogin', () => { authenticated = true; maybeFinish(); });
    socket.on('monitorList', data => { monitors = data; maybeFinish(); });
    socket.on('heartbeatList', (id, beats) => { heartbeats[id] = beats; maybeFinish(); });
    socket.on('heartbeat', beat => { (heartbeats[beat.monitorID] ||= []).push(beat); maybeFinish(); });
    socket.on('uptime', (id, period, value) => { uptime[`${id}_${period}`] = value; });
    socket.connect();
  });
}
