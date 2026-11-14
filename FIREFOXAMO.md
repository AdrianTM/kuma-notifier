# Mozilla Add-ons submission

Version: **0.1.0**. Extension ID: **kuma-notifier@adriantm**. Keep this ID for future updates.

## Release files

```sh
npm ci
npm test
npm run package
npm run lint:extension
npm run source:firefox
```

| File | Purpose |
| --- | --- |
| `artifacts/kuma_notifier-0.1.0.zip` | Installable Firefox extension upload |
| `artifacts/kuma-notifier-0.1.0-source.zip` | Separate source archive for Mozilla reviewers |
| `public/icons/icon-128.png` | Listing icon |
| `artifacts/mozilla/01-monitor-list.png` | Main monitor list screenshot (synthetic data) |
| `artifacts/mozilla/02-problems-filter.png` | Problems filter screenshot (synthetic data) |
| `artifacts/mozilla/03-settings.png` | Settings screenshot |

The source ZIP uses an explicit allowlist and excludes dependencies, build output, browser profiles, Git metadata, and credentials. It includes BUILD-FIREFOX.md with the actual build environment and reproduction commands. A clean source extraction must produce files identical to the extension ZIP.

To recreate the screenshots, start geckodriver with `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 geckodriver --port 4450`, then run `python3 scripts/capture-store.py` after packaging. Only synthetic monitor data is used; no live Kuma server is contacted.

## Listing

- **Name:** Kuma Notifier
- **Suggested slug:** kuma-notifier
- **Summary:** Monitor Uptime Kuma from your toolbar with down counts, a searchable monitor list, and optional outage and recovery alerts.
- **Description:** [docs/mozilla/description.txt](docs/mozilla/description.txt)
- **License:** MIT
- **Categories:** Alerts & Updates; Web Development
- **Platforms:** Desktop Firefox on Linux, macOS, Windows. Do not select Android for this release.
- **Homepage:** https://github.com/AdrianTM/kuma-notifier
- **Support:** https://github.com/AdrianTM/kuma-notifier/issues
- **Privacy policy:** [PRIVACY.md](PRIVACY.md), also uploaded as AMO privacy-policy text.
- **Reviewer notes:** [docs/mozilla/reviewer-notes.txt](docs/mozilla/reviewer-notes.txt)
- **Release notes:** Initial release with Kuma account and public status-page connections, toolbar down counts, searchable monitor lists, optional outage/recovery alerts, snoozing, and stale-connection indicators.

No paid service is required. Users need access to a Kuma instance or published status page. This is an independent project, not an official Kuma extension.

## Data disclosure and validation

Firefox's manifest declares no required data transmission and optional `authenticationInfo`. Account connections request that consent before sending credentials, and revocation blocks subsequent account checks and clears the token. Status-page mode does not request it. Do not describe the entire extension as transmitting no data: account credentials go directly to the user-selected Kuma server. The policy also discloses ordinary network metadata and OS desktop notifications.

Remote hosts require HTTPS; HTTP is limited to loopback. Browser permissions remain optional per host. The release contains unmodified npm dependency sources and their licenses.

The validator reports one known `DANGEROUS_EVAL` warning in engine.io-client's unreachable legacy global-object fallback. Both supported browser environments provide `self`, so the fallback is never executed. CSP does not allow unsafe-eval. This is explained to reviewers rather than hidden by suppressing warnings or modifying the library. Any new warning or error needs investigation before release.

## Submit

The official `web-ext sign` command supports new AMO listings as well as updates. With `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` exported in the publishing shell:

```sh
web-ext sign --source-dir dist/firefox --channel listed \
  --amo-metadata docs/mozilla/metadata.json \
  --upload-source-code artifacts/kuma-notifier-0.1.0-source.zip \
  --artifacts-dir artifacts/mozilla --approval-timeout 0
```

The metadata initially disables the listing while the privacy policy, icon, and screenshots are attached through AMO's API. Enable it only after those fields are present. `--approval-timeout 0` skips waiting for Mozilla's review; it does not bypass review or imply approval. Do not repeat an upload after a timeout without checking whether AMO already accepted the version.

Alternatively, sign in at https://addons.mozilla.org/developers/, select **Submit a New Add-on → On this site**, and upload the Firefox ZIP plus source ZIP. Use the listing fields and reviewer notes above. Keep credentials outside the repository; never include them in command arguments, logs, or archives.

## Official references

- https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- https://extensionworkshop.com/documentation/publish/source-code-submission/
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- https://extensionworkshop.com/documentation/publish/add-on-policies/
- https://addons-server.readthedocs.io/en/latest/topics/api/addons.html
