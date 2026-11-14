"""Capture the real extension UI with synthetic listing data in isolated Firefox."""
import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
output = root / 'artifacts' / 'mozilla'
output.mkdir(parents=True, exist_ok=True)
driver = os.environ.get('KUMA_WEBDRIVER_URL', 'http://127.0.0.1:4450')

def request(method, path, data=None):
    req = urllib.request.Request(driver + path, data=json.dumps(data).encode() if data is not None else None, method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=40) as response:
            return json.load(response)['value']
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error

session = request('POST', '/session', {'capabilities': {'alwaysMatch': {'browserName': 'firefox', 'moz:firefoxOptions': {'args': ['-headless']}}}})['sessionId']
prefix = '/session/' + session

def js(script, args=None, asynchronous=False):
    return request('POST', prefix + '/execute/' + ('async' if asynchronous else 'sync'), {'script': script, 'args': args or []})

def screenshot(selector, filename):
    element = request('POST', prefix + '/element', {'using': 'css selector', 'value': selector})['element-6066-11e4-a52e-4f735466cecf']
    data = request('GET', prefix + '/element/' + element + '/screenshot')
    (output / filename).write_bytes(base64.b64decode(data))

try:
    version = json.loads((root / 'package.json').read_text())['version']
    request('POST', prefix + '/moz/addon/install', {'path': str(root / f'artifacts/kuma_notifier-{version}.zip'), 'temporary': True})
    request('POST', prefix + '/moz/context', {'context': 'chrome'})
    uuid = js("return JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'))['kuma-notifier@adriantm'];")
    request('POST', prefix + '/moz/context', {'context': 'content'})
    extension = 'moz-extension://' + uuid + '/'
    request('POST', prefix + '/url', {'url': extension + 'popup.html'})
    config = {'mode': 'public', 'url': 'https://status.example.com', 'publicUrl': 'https://status.example.com', 'slug': 'main', 'interval': 1, 'outages': True, 'recoveries': True, 'snoozeUntil': 0}
    samples = [('API server', 'down', None, .994), ('Website', 'up', 24, 1), ('Database', 'up', 8, .9999), ('Mail service', 'maintenance', None, .998), ('Backup service', 'paused', None, None)]
    snapshot = {'updatedAt': int(time.time() * 1000), 'error': None, 'monitors': [{'id': str(i), 'name': name, 'group': 'Demo services', 'status': status, 'ping': ping, 'uptime': uptime, 'message': 'Connection refused' if status == 'down' else ''} for i, (name, status, ping, uptime) in enumerate(samples, 1)]}
    js("const done=arguments[arguments.length-1]; browser.storage.local.set(arguments[0]).then(done);", [{'config': config, 'snapshot': snapshot}], True)
    time.sleep(.2)
    screenshot('body', '01-monitor-list.png')
    js("document.getElementById('filter').value='problems';document.getElementById('filter').dispatchEvent(new Event('change'));")
    screenshot('body', '02-problems-filter.png')
    request('POST', prefix + '/window/rect', {'width': 1280, 'height': 1400})
    request('POST', prefix + '/url', {'url': extension + 'options.html'})
    time.sleep(.2)
    screenshot('body', '03-settings.png')
    print('Saved three real-UI screenshots using synthetic data to artifacts/mozilla/.')
finally:
    request('DELETE', prefix)
