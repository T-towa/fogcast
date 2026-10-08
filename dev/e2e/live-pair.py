# The pairing flow on the live page: where the code is said to be, issuing again, taking it back, pairing.
import asyncio, os, json, subprocess, time, tempfile
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); ROOT='/home/claude/fogcast'
PORT=4323; HOME=tempfile.mkdtemp(prefix='fog-pair-'); LOG=os.path.join(HOME,'sim.log'); CTL=os.path.join(HOME,'ctl')
env={**os.environ,'FOGCAST_PORT':str(PORT),'FOGCAST_HOME':HOME,'SIM_LOG':LOG,'SIM_CTL':CTL}
hub=subprocess.Popen(['node',f'{ROOT}/hub/hub.mjs'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
for _ in range(100):
    if os.path.exists(os.path.join(HOME,'token')): break
    time.sleep(.05)
time.sleep(.3)
TOKEN=open(os.path.join(HOME,'token')).read().strip()
sim=subprocess.Popen(['node',f'{ROOT}/test/simulate.mjs'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
def simlog():
    try: return [json.loads(l) for l in open(LOG) if l.strip()]
    except FileNotFoundError: return []
def pairs(): return [x for x in simlog() if 'pair' in x]
import urllib.request
def modpost(path,body):
    r=urllib.request.Request(f'http://127.0.0.1:{PORT}{path}',data=json.dumps(body).encode(),headers={'content-type':'application/json','x-fogcast-token':TOKEN},method='POST')
    return json.loads(urllib.request.urlopen(r).read())
async def fonts(route):
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(SP,'fonts/gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(SP,'fonts',p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def waitfor(pg,fn,ms=6000):
    t=time.time()
    while time.time()-t<ms/1000:
        v=fn()
        if v: return v
        await pg.wait_for_timeout(150)
    return None
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':1440,'height':900})
        pg=await ctx.new_page()
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        errs=[]; pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
        await pg.goto(f'http://127.0.0.1:{PORT}/#k={TOKEN}',wait_until='load')
        await pg.wait_for_timeout(2500)
        print('guide link shown:', await pg.evaluate("!document.getElementById('bGuide').hidden"))
        print('header 設定 (off):', await pg.evaluate("document.getElementById('bSet').innerText.replace(/\\n/g,' ')"))
        await pg.click('#bSet'); await pg.wait_for_timeout(400)
        print('before: panel hidden', await pg.evaluate("document.getElementById('pair').hidden"), '|', await pg.evaluate("document.getElementById('apState').textContent"))
        await pg.click('#swAp')
        first=await waitfor(pg,lambda: [x for x in pairs() if x['pair']])
        code=first[-1]['pair']['code']
        await pg.wait_for_timeout(1200)
        print('code reached terminals:', sorted({x['chan'] for x in pairs() if x['pair'] and x['pair']['code']==code}))
        print('code on the page:', await pg.evaluate(f"document.body.innerText.includes('{code}')"))
        print('where:', await pg.evaluate("document.getElementById('pairMsg').innerText"))
        print('left:', await pg.evaluate("document.getElementById('pairLeft').textContent"), '| switch:', await pg.evaluate("document.getElementById('swAp').getAttribute('aria-checked')"), '|', await pg.evaluate("document.getElementById('apState').textContent"))
        await pg.screenshot(path=os.path.join(SP,'pair-sheet.png'))
        print('header 設定 (pairing):', await pg.evaluate("document.getElementById('bSet').innerText.replace(/\\n/g,' ')+' '+document.getElementById('bSet').className"))
        await pg.fill('#pairIn','0000-0000'); await pg.click('#bPair'); await pg.wait_for_timeout(600)
        print('wrong:', await pg.evaluate("document.getElementById('pairErr').textContent"))
        # issue again: a new code replaces it
        await pg.click('#bRe')
        again=await waitfor(pg,lambda: [x for x in pairs() if x['pair'] and x['pair']['code']!=code])
        code2=again[-1]['pair']['code']; await pg.wait_for_timeout(600)
        print('new code differs:', code2!=code)
        # taken back from the terminal's band
        modpost('/api/mod/pair/cancel',{'chan':'sim-shop-api','code':code2}); await pg.wait_for_timeout(1500)
        print('after terminal cancel:', await pg.evaluate("document.getElementById('pairErr').textContent"), '| terminals dropped it:', pairs()[-1]['pair'] is None)
        await pg.screenshot(path=os.path.join(SP,'pair-cancelled.png'))
        # やめる
        await pg.click('#bRe'); await waitfor(pg,lambda: pairs()[-1]['pair']); await pg.wait_for_timeout(500)
        await pg.click('#bQuit'); await pg.wait_for_timeout(1500)
        print('after やめる: panel hidden', await pg.evaluate("document.getElementById('pair').hidden"), '| terminals dropped it:', pairs()[-1]['pair'] is None)
        # pair for real
        await pg.click('#swAp'); got=await waitfor(pg,lambda: pairs()[-1]['pair']); code3=got['code']; await pg.wait_for_timeout(400)
        await pg.fill('#pairIn',code3); await pg.click('#bPair'); await pg.wait_for_timeout(1800)
        print('paired:', await pg.evaluate("document.getElementById('apState').textContent"), '| panel hidden', await pg.evaluate("document.getElementById('pair').hidden"))
        await pg.wait_for_timeout(400)
        print('header 設定 (paired):', await pg.evaluate("document.getElementById('bSet').innerText.replace(/\\n/g,' ')+' '+document.getElementById('bSet').className"))
        toasts=[x['command']['text'] for x in simlog() if 'command' in x and x['command'].get('type')=='toast']
        print('terminal told:', toasts[-1] if toasts else None, '| legacy code toasts:', sum(1 for t in toasts if '合言葉' in t))
        await pg.screenshot(path=os.path.join(SP,'pair-done.png'))
        # the guide, beside the screen
        g=await ctx.new_page(); await g.route('**/fonts.googleapis.com/**',fonts); await g.route('**/fonts.gstatic.com/**',fonts)
        await g.goto(f'http://127.0.0.1:{PORT}/guide',wait_until='load'); await g.wait_for_timeout(800)
        print('guide title:', await g.title(), '| sections:', await g.evaluate("document.querySelectorAll('main section').length"))
        print('\n'.join(errs) or 'no errors')
        await b.close()
try:
    asyncio.run(main())
finally:
    sim.kill(); hub.kill()
    out=hub.stdout.read().decode(); print('--- hub log tail'); print('\n'.join(l for l in out.splitlines() if 'pair' in l))
