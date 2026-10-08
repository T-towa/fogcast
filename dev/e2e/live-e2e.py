# The live page against a real hub and two simulated terminals.
import asyncio, os, json, subprocess, time, tempfile, pathlib
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); ROOT='/home/claude/fogcast'
PORT=4319; HOME=tempfile.mkdtemp(prefix='fog-e2e-'); LOG=os.path.join(HOME,'sim.log'); CTL=os.path.join(HOME,'ctl')
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
async def fonts(route):
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(SP,'fonts/gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(SP,'fonts',p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':1440,'height':900})
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        errs=[]; pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)+' | '+str(e.stack)[:900])); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
        await pg.goto(f'http://127.0.0.1:{PORT}/#k={TOKEN}',wait_until='load')
        await pg.wait_for_timeout(2600)
        print('hash cleared:', await pg.evaluate('location.hash===""'), '| key kept:', await pg.evaluate("localStorage.getItem('fogcast.k')!==null"))
        await pg.screenshot(path=os.path.join(SP,'live-wall.png'))
        print('tiles:', await pg.evaluate("[...document.querySelectorAll('.tile')].map(t=>t.getAttribute('aria-label'))"))
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        await pg.screenshot(path=os.path.join(SP,'live-wait.png'))
        print('perm shown while waiting:', await pg.evaluate("!!document.querySelector('#logs .log:not([hidden]) .perm')"))
        for _ in range(60):
            if any(x.get('sim')=='turn-1 done' for x in simlog()): break
            await pg.wait_for_timeout(200)
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path=os.path.join(SP,'live-ch1.png'))
        print('osd:', await pg.evaluate("document.getElementById('osd').textContent.replace(/\\s+/g,' ').slice(0,140)"))
        # send a prompt from the screen
        await pg.fill('#ask','README の誤字を直して'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(2500)
        print('terminal got:', [x['command'] for x in simlog() if 'command' in x and x['command'].get('type')=='prompt'])
        await pg.wait_for_timeout(1500)
        # a slash command
        await pg.fill('#ask','/context'); await pg.keyboard.press('Escape'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1500)
        print('terminal got command:', [x['command'].get('name') for x in simlog() if 'command' in x and x['command'].get('type')=='command'])
        # approvals: off by default, then paired with the code the terminal shows
        await pg.click('.setBtn >> visible=true'); await pg.wait_for_timeout(400); await pg.click('#swAp'); await pg.wait_for_timeout(1500)
        codes=[x['pair']['code'] for x in simlog() if x.get('pair')]
        code=codes[-1] if codes else ''
        print('code reached the terminal only:', bool(code), '| shown on the page:', await pg.evaluate(f"document.body.innerText.includes('{code}')"))
        await pg.fill('#pairIn',code); await pg.click('#bPair'); await pg.wait_for_timeout(800)
        print('paired:', await pg.evaluate("document.getElementById('apState')?.textContent"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        pathlib.Path(CTL).write_text('ask')
        for _ in range(50):
            if await pg.evaluate("!!document.querySelector('#logs .log:not([hidden]) .perm [data-ok]')"): break
            await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(SP,'live-ask.png'))
        await pg.click('#logs .log:not([hidden]) .perm [data-ok]'); await pg.wait_for_timeout(1800)
        print('decision:', [x for x in simlog() if 'ask' in x])
        await pg.screenshot(path=os.path.join(SP,'live-after.png'))
        # 詳細 and コミュ
        await pg.click('#tD'); await pg.wait_for_timeout(500); await pg.screenshot(path=os.path.join(SP,'live-detail.png'))
        await pg.click('#tL'); await pg.wait_for_timeout(500)
        print('deck cards:', await pg.evaluate("document.querySelectorAll('#deck .card').length"), await pg.evaluate("document.getElementById('deckCount').textContent"))
        await pg.screenshot(path=os.path.join(SP,'live-deck.png'))
        await pg.click('#deck .card'); await pg.wait_for_timeout(1500); await pg.screenshot(path=os.path.join(SP,'live-co.png'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.click('#tF'); await pg.wait_for_timeout(400); await pg.screenshot(path=os.path.join(SP,'live-forecast.png'))
        print('\n'.join(errs) or 'no errors')
        await b.close()
try:
    asyncio.run(main())
finally:
    sim.kill(); hub.kill()
    print('--- hub output'); print(hub.stdout.read().decode()[-1500:])
