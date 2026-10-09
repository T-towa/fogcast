# The live page's new parts, against a real hub and two simulated terminals: a message shown the moment it is
# sent, Claude's question answered with a button, the next-prompt suggestion, a command's argument hint,
# a skill's own description on its card, and an ended terminal's channel put away.
import asyncio, os, json, subprocess, time, tempfile, pathlib, sys
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); ROOT='/home/claude/fogcast'
PORT=4329; HOME=tempfile.mkdtemp(prefix='fog-new-'); LOG=os.path.join(HOME,'sim.log'); CTL=os.path.join(HOME,'ctl')
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
async def until(pg,expr,ms=15000):
    t=time.time()
    while time.time()-t<ms/1000:
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(100)
    raise Exception('timed out: '+expr)
async def main():
    W,H=(int(x) for x in (sys.argv[1] if len(sys.argv)>1 else '1440x900').split('x'))
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H})
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        errs=[]; pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)+' | '+str(e.stack)[:600])); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
        await pg.goto(f'http://127.0.0.1:{PORT}/#k={TOKEN}',wait_until='load'); await pg.wait_for_timeout(2000)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        for _ in range(80):
            if any(x.get('sim')=='turn-1 done' for x in simlog()): break
            await pg.wait_for_timeout(200)
        await pg.wait_for_timeout(1500)
        print('suggestion button shown:', await pg.evaluate("!document.getElementById('bSugg').hidden"), '| placeholder:', await pg.evaluate("document.getElementById('ask').placeholder"))
        await pg.focus('#ask'); await pg.keyboard.press('Tab')
        print('Tab took it:', await pg.evaluate("document.getElementById('ask').value"))
        await pg.fill('#ask','/model '); await pg.dispatch_event('#ask','input'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        print('argument hint:', await pg.evaluate("document.getElementById('ctlHint').innerText.replace(/\\n/g,' ')"))
        await pg.fill('#ask','')
        # a message shows the moment it is sent, then gives way to its turn
        await pg.fill('#ask','README の誤字を直して'); t0=time.time(); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(60)
        print(f'bubble after {int((time.time()-t0)*1000)} ms:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .pend')].map(x=>x.className+' | '+x.querySelector('.pst').textContent)"))
        await pg.wait_for_timeout(500)
        print('then:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .pend')].map(x=>x.className+' | '+x.querySelector('.pst').textContent)"))
        print('suggestion button after sending:', await pg.evaluate("!document.getElementById('bSugg').hidden"), '| placeholder:', await pg.evaluate("document.getElementById('ask').placeholder"))
        await pg.screenshot(path=os.path.join(SP,f'L-pend-{W}.png'))
        await until(pg,"!document.querySelector('.log:not([hidden]) .pend')")
        print('turn started from it:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .turn .you')].pop().innerText.replace(/\\n/g,' | ')"))
        # Claude asks; the button answers; the terminal gets the pick
        pathlib.Path(CTL).write_text('question')
        await pg.wait_for_selector('.log:not([hidden]) .qcard:not(.done)',timeout=15000); await pg.wait_for_timeout(500)
        print('chip:', await pg.evaluate("document.querySelector('#osd .chip').textContent"))
        q=await pg.query_selector('.log:not([hidden]) .qcard:not(.done)'); await q.scroll_into_view_if_needed()
        await q.screenshot(path=os.path.join(SP,f'L-q-{W}.png'))
        await pg.click('.log:not([hidden]) .qcard:not(.done) .qo[data-k="1"]')
        await pg.wait_for_selector('.log:not([hidden]) .qcard.done',timeout=10000); await pg.wait_for_timeout(400)
        print('terminal got:', [x for x in simlog() if 'question' in x], '| card:', await pg.evaluate("document.querySelector('.log:not([hidden]) .qcard.done .qst').textContent"))
        await (await pg.query_selector('.log:not([hidden]) .qcard.done')).screenshot(path=os.path.join(SP,f'L-qdone-{W}.png'))
        # a skill's own description
        await pg.click('#tL'); await pg.wait_for_timeout(500); await pg.click('#deck .card[data-id="skill:api-conventions"]'); await pg.wait_for_timeout(1400)
        print('card:', await pg.evaluate("(document.querySelector('#coInfo .coDesc p')||{}).innerText"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        # ch.2's terminal ends; its channel is put away from the wall
        pathlib.Path(CTL).write_text('end')
        await pg.keyboard.press('0'); await pg.wait_for_timeout(2500)
        await pg.wait_for_selector('#bTidy',timeout=8000)
        await pg.click('#bTidy'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SP,f'L-tidy-{W}.png'))
        await pg.click('#bFgOk'); await pg.wait_for_timeout(1500)
        print('tiles now:', await pg.evaluate("[...document.querySelectorAll('.tile')].map(t=>t.getAttribute('aria-label'))"), '| tidy:', await pg.evaluate("!!document.getElementById('bTidy')"))
        # a second screen sees the same: no ch.2, and nothing pending
        p2=await b.new_page(viewport={'width':900,'height':700}); await p2.goto(f'http://127.0.0.1:{PORT}/#k={TOKEN}',wait_until='load'); await p2.wait_for_timeout(1500)
        print('second screen tiles:', await p2.evaluate("[...document.querySelectorAll('.tile')].map(t=>t.getAttribute('aria-label'))"))
        print('\n'.join(errs) or 'no errors'); await b.close()
try:
    asyncio.run(main())
finally:
    sim.kill(); hub.kill()
    print('--- hub output'); print(hub.stdout.read().decode()[-700:])
