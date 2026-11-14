# Kuma Notifier privacy policy

Effective date: November 14, 2026

Kuma Notifier is an independent, open-source browser extension maintained by AdrianTM. It displays monitor health from the Uptime Kuma server or published status page you choose. The extension publisher does not operate a data-collection backend and does not receive your Kuma credentials or monitor data.

## Connections and transmitted information

The extension sends requests directly to your chosen Kuma host. Public status-page requests include the page slug needed to retrieve its monitor data. To discover a custom domain's slug, it may first retrieve that page's HTML. The server also receives ordinary connection information, such as your IP address and HTTP request headers, as with other network requests.

If you choose an account connection, the extension sends your username, password, and optional two-factor code directly to that Kuma server to sign in. It then sends the returned login token when checking monitor status. Firefox requires your explicit permission to transmit authentication information. Public status-page connections do not require authentication-information consent.

Remote connections must use HTTPS. Unencrypted HTTP is allowed only for loopback addresses such as localhost, for testing a server on the same computer. The extension does not bypass certificate validation.

## Local storage

The browser profile stores the connection URL, status-page slug, notification and refresh settings, snooze expiration, login token (for account connections), and latest monitor snapshot. The snapshot can include monitor names, groups, statuses, messages, timestamps, response times, and uptime values.

Passwords and two-factor codes are used for sign-in and are never saved by the extension. Full private monitor configurations are not retained. Browser local storage is not an encrypted password vault, and a stored token has the privileges of its Kuma account.

## Notifications and links

If enabled, desktop notifications send monitor names and outage or recovery status to your operating system's notification service. Those details may appear on the lock screen depending on your OS settings. Clicking a monitor, the Open Kuma button, or a notification opens the configured Kuma website in a browser tab, where that website's own privacy practices apply.

## Your choices and deletion

Host and desktop-notification permissions are requested when you connect. You can disable desktop alerts in Settings or snooze them from the popup. Firefox's extension permissions let you revoke authentication-information consent; doing so stops subsequent account connections and removes the saved token. You can still use a public status page.

Disconnect & clear local data removes saved settings, the token, and the monitor snapshot, and releases permission for the current host. Removing the extension also removes its local storage. Deleting local data does not revoke a token on the Kuma server or delete that server's logs. Contact the server's operator about its retention policy.

## No tracking or sale

The extension contains no analytics, advertising, tracking identifiers, or remotely executed scripts. It does not read browsing history or page content from unrelated tabs, and does not use browser synchronization. The publisher does not sell or share your monitor information.

## Contact

For privacy questions, contact the maintainer through [the GitHub issue tracker](https://github.com/AdrianTM/kuma-notifier/issues). Issues are public: do not include passwords, login tokens, or private server data.
