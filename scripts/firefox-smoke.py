"""End-to-end test against an isolated Firefox session and loopback fixtures.

Start geckodriver with MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 on port 4450 first.
Only the temporary automation profile has permission prompts auto-accepted.
"""
import urllib.request,json,zipfile,time,base64,threading,subprocess,os,tempfile
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
state={'status':1,'second_status':1,'offline':False,'discover':True}
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args): print('HTTP',args,flush=True)
 def do_GET(self):
  if state['offline']:
   self.send_response(503);self.end_headers();return
  if self.path=='/':
   self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers()
   self.wfile.write(b'<html><head><link rel="manifest" href="/api/status-page/main/manifest.json"></head></html>' if state['discover'] else b'<html></html>');return
  if '/heartbeat/' in self.path:
   result={'heartbeatList':{'1':[{'status':state['status'],'time':'2026-11-14 17:00:00','ping':24,'msg':'Connection refused' if state['status']==0 else 'OK'}],'2':[{'status':state['second_status'],'ping':8}]},'uptimeList':{'1_24':.998,'2_24':1}}
  else: result={'publicGroupList':[{'name':'Production','monitorList':[{'id':1,'name':'API server'},{'id':2,'name':'Website'}]}]}
  self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps(result).encode())
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
base=os.environ.get('KUMA_WEBDRIVER_URL','http://127.0.0.1:4450')
def request(method,path,data=None):
 req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,method=method,headers={'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=50) as r: result=json.load(r)
 except urllib.error.HTTPError as e: raise RuntimeError(e.read().decode())
 value=result.get('value')
 return value
session=request('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'firefox','moz:firefoxOptions':{'prefs':{'extensions.webextOptionalPermissionPrompts':False},'args':['-headless']}}}})['sessionId']
prefix='/session/'+session

def js(code,args=[]):return request('POST',prefix+'/execute/sync',{'script':code,'args':args})
def asyncjs(code,args=[]):return request('POST',prefix+'/execute/async',{'script':code,'args':args})
def goto(path):request('POST',prefix+'/url',{'url':path})
try:
 archive=str(Path(tempfile.gettempdir())/'kuma-firefox-test.zip')
 with zipfile.ZipFile(archive,'w') as z:
  for p in Path('dist/firefox').rglob('*'):
   if p.is_file():z.write(p,p.relative_to('dist/firefox'))
 print('Installed:',request('POST',prefix+'/moz/addon/install',{'path':archive,'temporary':True}))
 request('POST',prefix+'/moz/context',{'context':'chrome'})
 uuid=js("return JSON.parse(Services.prefs.getStringPref('extensions.webextensions.uuids'))['kuma-notifier@adriantm'];")
 request('POST',prefix+'/moz/context',{'context':'content'})
 extension='moz-extension://'+uuid+'/'
 goto(extension+'popup.html')
 assert js("return !document.getElementById('welcome').hidden;")
 goto(extension+'options.html')
 print('Permissions:',asyncjs("const done=arguments[arguments.length-1];browser.permissions.getAll().then(done);"),flush=True)
 js("document.getElementById('mode').value='public';document.getElementById('mode').dispatchEvent(new Event('change'));document.getElementById('url').value=arguments[0];document.getElementById('url').dispatchEvent(new Event('input'));",[f'http://127.0.0.1:{server.server_port}/status/main/'])
 assert js("return document.getElementById('public-fields').hidden;")
 button=request('POST',prefix+'/element',{'using':'css selector','value':'#save'})['element-6066-11e4-a52e-4f735466cecf']
 request('POST',prefix+'/element/'+button+'/click',{})
 for _ in range(300):
  result=js("return document.getElementById('result').textContent;")
  if result!='Connecting…':break
  time.sleep(.1)
 print('Connect:',result,flush=True)
 print('After permissions:',asyncjs("const done=arguments[arguments.length-1];browser.permissions.getAll().then(done);"),flush=True)
 assert result=='Connected. 2 monitors loaded.',result
 data=asyncjs("const done=arguments[arguments.length-1];browser.storage.local.get().then(done);")
 assert data.get('token') is None
 assert 'password' not in json.dumps(data)
 assert data['config']['slug']=='main' and data['config']['url']==f'http://127.0.0.1:{server.server_port}'
 assert js("return document.getElementById('url').value;").endswith('/status/main')
 # A custom-domain-style root URL should discover the slug without exposing a field.
 def submit_public_url(url):
  js("document.getElementById('url').value=arguments[0];document.getElementById('url').dispatchEvent(new Event('input'));",[url])
  button=request('POST',prefix+'/element',{'using':'css selector','value':'#save'})['element-6066-11e4-a52e-4f735466cecf']
  request('POST',prefix+'/element/'+button+'/click',{})
  for _ in range(300):
   result=js("return document.getElementById('result').textContent;")
   if result!='Connecting…':return result
   time.sleep(.1)
 root_url=f'http://127.0.0.1:{server.server_port}'
 assert submit_public_url(root_url)=='Connected. 2 monitors loaded.'
 assert js("return document.getElementById('public-fields').hidden;")
 assert js("return document.getElementById('url').value;")==root_url
 # Saving again reuses the discovered slug. Editing the URL clears it.
 state['discover']=False
 assert 'Couldn’t detect' in submit_public_url(root_url)
 assert js("return !document.getElementById('public-fields').hidden && document.getElementById('slug').required;")
 js("document.getElementById('slug').value='main';")
 button=request('POST',prefix+'/element',{'using':'css selector','value':'#save'})['element-6066-11e4-a52e-4f735466cecf']
 request('POST',prefix+'/element/'+button+'/click',{})
 for _ in range(300):
  result=js("return document.getElementById('result').textContent;")
  if result!='Connecting…':break
  time.sleep(.1)
 assert result=='Connected. 2 monitors loaded.',result
 # Older saved configurations still reopen as a full page URL.
 asyncjs("const done=arguments[arguments.length-1];browser.storage.local.get('config').then(({config})=>{delete config.publicUrl;return browser.storage.local.set({config});}).then(done);")
 goto(extension+'options.html')
 assert js("return document.getElementById('url').value;")==root_url+'/status/main'
 assert js("return document.getElementById('public-fields').hidden;")
 print('PASS: full URL, custom-domain discovery, manual fallback, and legacy saved settings')
 goto(extension+'popup.html')
 assert js("return document.querySelectorAll('.monitor').length;")==2
 state['status']=0
 result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'refresh'}).then(done);")
 assert result['ok'] and result['value']['monitors'][0]['status']=='down',result
 assert asyncjs("const done=arguments[arguments.length-1];browser.action.getBadgeText({}).then(done);")=='1'
 print('Outage: badge 1 and down monitor received')
 # Clear through the real popup button, then verify refresh and popup reload persistence.
 def badge_text():return asyncjs("const done=arguments[arguments.length-1];browser.action.getBadgeText({}).then(done);")
 def refresh():return asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'refresh'}).then(done);")
 def click_badge_button(expected):
  button=request('POST',prefix+'/element',{'using':'css selector','value':'#clear-badge'})['element-6066-11e4-a52e-4f735466cecf']
  request('POST',prefix+'/element/'+button+'/click',{})
  for _ in range(100):
   if badge_text()==expected:break
   time.sleep(.1)
  assert badge_text()==expected
 click_badge_button('')
 refresh()
 goto(extension+'popup.html')
 assert badge_text()==''
 assert js("return document.getElementById('clear-badge').textContent;")=='Show badge'
 assert js("return document.querySelector('.stat.down b').textContent;")=='1'
 click_badge_button('1')
 goto(extension+'popup.html')
 click_badge_button('')
 # A new outage brings the count back; returning to the old count must not hide it.
 state['second_status']=0
 refresh()
 assert badge_text()=='2'
 result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'clear-badge',count:1,source:arguments[0]}).then(done);",[json.dumps(['public',root_url,'main'],separators=(',',':'))])
 assert result['ok'] is False
 assert badge_text()=='2'
 state['second_status']=1
 refresh()
 assert badge_text()=='1'
 goto(extension+'popup.html')
 click_badge_button('')
 # Re-saving the same connection preserves the acknowledgement.
 saved=asyncjs("const done=arguments[arguments.length-1];browser.storage.local.get('config').then(done);")
 result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'save',config:arguments[0]}).then(done);",[saved['config']])
 assert result['ok'] and badge_text()==''
 # Switching to a different status page resets it, even at the same count.
 other_config={**saved['config'],'slug':'other'}
 result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'save',config:arguments[0]}).then(done);",[other_config])
 assert result['ok'] and badge_text()=='1'
 goto(extension+'popup.html')
 click_badge_button('')
 print('PASS: clear/show badge, unchanged refresh, popup reopen, count changes, stale clicks, and connection reset')
 time.sleep(.2)
 Path(tempfile.gettempdir(),'kuma-popup.png').write_bytes(base64.b64decode(request('GET',prefix+'/screenshot')))
 js("document.getElementById('search').value='Website';document.getElementById('search').dispatchEvent(new Event('input'));")
 assert js("return document.querySelectorAll('.monitor').length;")==1
 state['offline']=True
 result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'refresh'}).then(done);")
 assert result['value']['error'] and len(result['value']['monitors'])==2
 assert asyncjs("const done=arguments[arguments.length-1];browser.action.getBadgeText({}).then(done);")=='?'
 print('Offline: badge ? and cached data preserved')
 state['offline']=False
 refresh()
 assert badge_text()==''
 state['status']=1
 result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'refresh'}).then(done);")
 assert result['value']['error'] is None
 assert asyncjs("const done=arguments[arguments.length-1];browser.action.getBadgeText({}).then(done);")==''
 result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'snooze',enabled:true}).then(done);")
 assert result['ok']
 result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'disconnect'}).then(done);")
 assert result['ok']
 assert asyncjs("const done=arguments[arguments.length-1];browser.storage.local.get().then(done);")=={}
 print('PASS: Firefox onboarding, settings, public fetch, popup rendering/search, badge, outage, offline cache, recovery, snooze, disconnect')
 fixture=subprocess.Popen(['node','scripts/mock-kuma.mjs'],stdout=subprocess.PIPE,text=True)
 try:
  private_url=fixture.stdout.readline().strip()
  goto(extension+'options.html')
  js("document.getElementById('url').value=arguments[0];document.getElementById('username').value='demo';document.getElementById('password').value='fixture-password';",[private_url])
  button=request('POST',prefix+'/element',{'using':'css selector','value':'#save'})['element-6066-11e4-a52e-4f735466cecf']
  request('POST',prefix+'/element/'+button+'/click',{})
  for _ in range(300):
   result=js("return document.getElementById('result').textContent;")
   if result!='Connecting…':break
   time.sleep(.1)
  assert result=='Connected. 1 monitors loaded.',result
  data=asyncjs("const done=arguments[arguments.length-1];browser.storage.local.get().then(done);")
  assert data['token']=='fixture-token'
  permissions=asyncjs("const done=arguments[arguments.length-1];browser.permissions.getAll().then(done);")
  assert 'authenticationInfo' in permissions['data_collection']
  assert 'fixture-password' not in json.dumps(data) and 'must-not-be-stored' not in json.dumps(data)
  result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'refresh'}).then(done);")
  assert result['ok'] and result['value']['error'] is None,result
  with urllib.request.urlopen(private_url) as response:stats=json.load(response)
  assert stats=={'passwordLogins':1,'tokenLogins':1},stats
  # A failed replacement connection must leave the working connection intact.
  result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'save',config:arguments[0],credentials:{username:'demo',password:'wrong'}}).then(done);",[data['config']])
  assert result['ok'] is False
  assert asyncjs("const done=arguments[arguments.length-1];browser.storage.local.get().then(done);")['token']=='fixture-token'
  print('PASS: Firefox private login, token reconnect, sensitive-field filtering, and failed-login rollback')
  assert asyncjs("const done=arguments[arguments.length-1];browser.permissions.remove({data_collection:['authenticationInfo']}).then(done);")
  result=asyncjs("const done=arguments[arguments.length-1];browser.runtime.sendMessage({type:'refresh'}).then(done);")
  assert 'Allow authentication information' in result['value']['error'],result
  data=asyncjs("const done=arguments[arguments.length-1];browser.storage.local.get().then(done);")
  assert 'token' not in data
  with urllib.request.urlopen(private_url) as response:stats=json.load(response)
  assert stats=={'passwordLogins':1,'tokenLogins':1},stats
  print('PASS: authentication consent is requested and revoking it blocks subsequent account connections')
 finally:
  fixture.terminate()
  fixture.wait(timeout=10)
finally:
 request('DELETE',prefix)
 server.shutdown()
