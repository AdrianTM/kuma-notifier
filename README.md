# Kuma Notifier

A Firefox-first browser extension that puts Uptime Kuma monitor health in your toolbar. A Chrome Manifest V3 build is also included.

## Features

- Connect to a Kuma account or a published status page.
- See the number of down monitors on the toolbar badge.
- Browse a searchable monitor list with problems first, status filters, response times, and 24-hour uptime when available.
- Open a monitor in Kuma directly from the popup.
- Receive optional desktop alerts for outages and recoveries.
- Snooze alerts for one hour or resume them from the popup header, next to Settings.
- Clear the down-count badge until the number changes, with an option to show it again.
- Refresh manually or check automatically every 1, 2, 5, or 10 minutes.
- View clearly marked cached results when the connection is unavailable.
- Follow the system's light or dark appearance.

The extension is read-only and supports one connection at a time. Pending, paused, maintenance, and unknown monitors do not count as down; monitor groups are excluded to avoid double-counting their children.

## Installation

Requires Node.js 22+ and npm to build from source:

```sh
git clone git@github.com:AdrianTM/kuma-notifier.git
cd kuma-notifier
npm ci
npm run build
```

**Firefox 140+:** open `about:debugging#/runtime/this-firefox`, select **Load Temporary Add-on**, and choose `dist/firefox/manifest.json`. Temporary add-ons are removed when Firefox restarts. Persistent installation in standard Firefox requires a Mozilla-signed release; locally built packages are unsigned.

**Chrome 120+:** open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist/chrome`. Pin the extension to the toolbar.

After updating the source, rebuild and reload the extension from the browser's extension management page.

## Connecting

Open the popup and select **Connect to Kuma**, or open **Settings** to change an existing connection.

### Published status page

Choose **Published status page** and paste the **full status-page URL** from your browser. There is normally just one URL field: the extension extracts the instance base URL and page slug automatically.

| Pasted URL | Detected base URL | Detected slug |
| --- | --- | --- |
| `https://kuma.example.com/status/main` | `https://kuma.example.com` | `main` |
| `https://example.com/kuma/status/services` | `https://example.com/kuma` | `services` |
| `http://localhost:3001/status/all` | `http://localhost:3001` | `all` |

Trailing slashes, query parameters, and fragments are handled automatically. URLs ending in `/status` or `/status-page` select Kuma's default status page.

For a custom domain such as `https://status.example.com`, paste that address. The extension attempts to discover the page's slug automatically. If it cannot, a **Status-page slug** field appears. Enter the slug from the page's original address in Kuma: for `/status/main`, enter `main`.

Only monitors published on the selected page are shown. Existing connections saved with separate base URL and slug fields continue to work and appear as full URLs in Settings.

### Kuma account

Choose **Kuma login · all monitors** and enter your instance's **base URL**, for example `https://kuma.example.com`, along with your username and password. Do not include `/dashboard`. Enter a current two-factor code if your account requires one.

After connecting, leave both username and password blank to reuse the saved login token for that instance. If the token expires or your password changes, sign in again.

Your browser must be able to reach the instance. Remote servers require HTTPS; HTTP is available only for localhost testing. For hosts behind a VPN or Tailscale, connect to that network first. Password-protected status pages and additional login gateways, including Cloudflare Access, are not currently supported.

## Badges and alerts

- A **number** shows how many monitors are down, capped at `99+`.
- **`!`** means some monitors are pending or unknown and none are known to be down.
- **`?`** means the connection is unavailable; cached results may be stale.
- No badge means no known down monitors, or that no instance has been configured. Hover over the icon for details.

Use **Clear badge** below the popup summary to hide the current down count until it changes. For example, clearing `3` keeps the badge hidden while three monitors are down; a change to `4` or `2` shows the new count. A change to zero resets this choice, so the next outage shows normally. **Show badge** restores it immediately. The choice survives browser restarts; the popup still lists all monitors and desktop alerts continue. Connection errors still show `?`. The comparison uses the count, so replacing one down monitor with another at the same count keeps the badge hidden.

Desktop alerts start after the initial connection establishes a baseline. Multiple changes in one check are combined into a single notification. Snoozing suppresses alerts while monitoring and the badge continue to update.

Checks require the browser to be running. Sleep, browser suspension, and network loss can delay updates. Outages that begin and end between checks may be missed, and Kuma's status-page cache can add further delay. Keep Kuma's own notifications enabled for critical alerts.

## Privacy

The extension connects directly to the configured Kuma host. There are no analytics, intermediate servers, remote scripts, or cloud synchronization.

Passwords and two-factor codes are never saved. Login tokens, connection settings, and the latest monitor snapshot are stored locally in the browser profile. A token carries the Kuma account's privileges, and browser local storage is not an encrypted secret vault. Full private monitor configurations are not persisted.

Host access and desktop notification permission are requested when connecting. Firefox also requests authentication-information consent for account connections; public pages do not require it. Revoking that consent stops account checks and removes the saved token. **Disconnect & clear local data** removes the saved connection, token, and snapshot, and releases the current host permission. It does not revoke the token on the Kuma server. See the full [privacy policy](PRIVACY.md).

## Compatibility

Account connections target Kuma's token-based login protocol, checked against releases 2.0.2 and 2.5.11. Kuma 1.x compatibility has not been verified against a live instance, and the newer cookie-based authentication protocol is not supported. Firefox has automated browser coverage; the Chrome build still needs browser validation.

Very large or slow instances may exceed the 25-second account refresh timeout. In that case, the previous results are retained and marked unavailable.

## Development

```sh
npm test                 # Unit and local adapter integration tests
npm run build            # Build both browser extensions
npm run lint:extension   # Validate the Firefox build
npm run package          # Create ZIP packages under artifacts/
```

Tests use local fixtures and do not need a Kuma account. Integration tests require permission to listen on loopback ports.

For the Firefox browser smoke test, install `geckodriver`, run `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 geckodriver --port 4450` in one terminal, and run `python3 scripts/firefox-smoke.py` in another after building. The test uses a temporary browser profile and local mock servers.

## Planned improvements

- Monitor favorites and per-monitor alert preferences.
- Multiple Kuma instances.
- Incident history, outage duration, and scheduled quiet hours.
- Optional live updates and certificate-expiry warnings.

## License

[MIT](LICENSE)
