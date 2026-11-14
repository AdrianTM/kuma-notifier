import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
const icons = Object.fromEntries([16, 32, 48, 96, 128].map(n => [n, `icons/icon-${n}.png`]));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
for (const browser of ['firefox', 'chrome']) {
  const outdir = `dist/${browser}`;
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await cp('public', outdir, { recursive: true });
  const result = await build({ entryPoints: ['src/background.js', 'src/popup.js', 'src/options.js'], outdir,
    bundle: true, format: 'iife', target: ['firefox140', 'chrome120'], legalComments: 'eof', metafile: true,
  });
  // Preserve third-party release sources unchanged and ship their license notices.
  const dependencies = new Set(Object.keys(result.metafile.inputs).map(path => path.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//)?.[1]).filter(Boolean));
  const notices = [];
  for (const name of [...dependencies].sort()) {
    const info = JSON.parse(await readFile(`node_modules/${name}/package.json`, 'utf8'));
    let license;
    for (const file of ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'License']) {
      try { license = await readFile(`node_modules/${name}/${file}`, 'utf8'); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!license) throw new Error(`Missing license for bundled dependency ${name}`);
    notices.push(`${name}@${info.version}\n${license}`);
  }
  await cp('LICENSE', `${outdir}/LICENSE`);
  await writeFile(`${outdir}/THIRD_PARTY_NOTICES.txt`, notices.join('\n\n-----\n\n'));
  const manifest = {
    manifest_version: 3, name: 'Kuma Notifier', version: pkg.version,
    homepage_url: 'https://github.com/AdrianTM/kuma-notifier', author: 'AdrianTM',
    description: 'Uptime Kuma monitor health, outage counts, and recovery alerts in your toolbar.',
    icons, permissions: ['storage', 'alarms'], optional_permissions: ['notifications'],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    action: { default_popup: 'popup.html', default_title: 'Kuma Notifier', default_icon: icons },
    options_ui: { page: 'options.html', open_in_tab: true },
    background: browser === 'firefox' ? { scripts: ['background.js'] } : { service_worker: 'background.js' },
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'none'" },
    ...(browser === 'firefox' ? { browser_specific_settings: { gecko: { id: 'kuma-notifier@adriantm', strict_min_version: '140.0', data_collection_permissions: { required: ['none'], optional: ['authenticationInfo'] } }, gecko_android: { strict_min_version: '142.0' } } } : { minimum_chrome_version: '120' }),
  };
  await writeFile(`${outdir}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
}
console.log('Built dist/firefox and dist/chrome.');
