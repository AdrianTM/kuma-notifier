import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
const icons = Object.fromEntries([16, 32, 48, 96, 128].map(n => [n, `icons/icon-${n}.png`]));
for (const browser of ['firefox', 'chrome']) {
  const outdir = `dist/${browser}`;
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await cp('public', outdir, { recursive: true });
  await build({ entryPoints: ['src/background.js', 'src/popup.js', 'src/options.js'], outdir,
    bundle: true, format: 'iife', target: ['firefox140', 'chrome120'], legalComments: 'eof',
    plugins: [{ name: 'extension-safe-global', setup(builder) {
      builder.onLoad({ filter: /engine.io-client\/build\/esm\/globals.js$/ }, async ({ path }) => {
        const source = await readFile(path, 'utf8');
        // Supported browsers have globalThis. Remove upstream's obsolete eval fallback
        // entirely so the shipped bundle complies with extension CSP and store review.
        return { contents: source.replace('Function("return this")()', 'globalThis'), loader: 'js' };
      });
    } }],
  });
  const manifest = {
    manifest_version: 3, name: 'Kuma Notifier', version: '0.1.0',
    description: 'Uptime Kuma monitor health, outage counts, and recovery alerts in your toolbar.',
    icons, permissions: ['storage', 'alarms'], optional_permissions: ['notifications'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_popup: 'popup.html', default_title: 'Kuma Notifier', default_icon: icons },
    options_ui: { page: 'options.html', open_in_tab: true },
    background: browser === 'firefox' ? { scripts: ['background.js'] } : { service_worker: 'background.js' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'" },
    ...(browser === 'firefox' ? { browser_specific_settings: { gecko: { id: 'kuma-notifier@local.extension', strict_min_version: '140.0', data_collection_permissions: { required: ['none'] } }, gecko_android: { strict_min_version: '142.0' } } } : { minimum_chrome_version: '120' }),
  };
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
}
console.log('Built dist/firefox and dist/chrome.');
