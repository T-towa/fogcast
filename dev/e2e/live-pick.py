# The live page's pickers against a real hub and the simulated terminals (test/simulate.mjs): /resume lists ch.1's
# earlier conversations from their files and brings one back with its last exchanges; the model and effort pickers
# in the channel header; a command's result in the conversation. Usage: python3 live-pick.py [WxH]
import asyncio, os, json, subprocess, time, tempfile, sys
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); OUT=os.environ.get('OUT') or tempfile.gettempdir(); ROOT=os.environ.get('ROOT') or os.path.abspath(os.path.join(SP,'..','..'))
PORT=4331; HOME=tempfile.mkdtemp(prefix='fog-pick-'); LOG=os.path.join(HOME,'sim.log')
env={**os.environ,'FOGCAST_PORT':str(PORT),'FOGCAST_HOME':HOME,'SIM_LOG':LOG}
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
FONTS=os.environ.get('FONTS') or os.path.join(SP,'fonts')     # the page's web fonts, kept locally (the sandbox reaches no font server)
async def fonts(route):
    if not os.path.isdir(FONTS): await route.abort(); return      # without them the page falls back to system fonts
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(FONTS,'gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(FONTS,p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def until(pg,expr,ms=15000):
    t=time.time()
    while time.time()-t<ms/1000:
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(120)
    raise Exception('timed out: '+expr)
LOG_EL="document.querySelector('.log:not([hidden])')"
async def main():
    W,H=(int(x) for x in (sys.argv[1] if len(sys.argv)>1 else '1440x900').split('x'))
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(f'http://127.0.0.1:{PORT}/#k={TOKEN}',wait_until='load'); await pg.wait_for_timeout(1500)
        for _ in range(80):
            if any(x.get('sim')=='turn-1 done' for x in simlog()): break
            await pg.wait_for_timeout(200)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(1200)
        print('header picks:', await pg.evaluate("[...document.querySelectorAll('#osd .osdPick')].map(b=>b.innerText)"))
        # /resume: the list, then a conversation brought back
        await pg.click('#ask'); await pg.keyboard.type('/resume'); await pg.wait_for_timeout(200)
        print('kind:', await pg.evaluate("[...document.querySelectorAll('#palList .po')].slice(0,1).map(li=>li.querySelector('code').textContent+'='+li.querySelector('.kd').textContent)"))
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(120); await pg.keyboard.press('Enter')
        await pg.wait_for_selector('#rsList li .btn',timeout=5000); await pg.wait_for_timeout(200)
        print('resume list:', await pg.evaluate("[...document.querySelectorAll('#rsList li')].map(li=>li.innerText.replace(/\\n/g,' | '))"))
        await pg.screenshot(path=os.path.join(OUT,f'LP-resume-{W}.png'))
        await pg.fill('#rsQ','受け皿'); await pg.wait_for_timeout(150)
        print('filtered:', await pg.evaluate("[...document.querySelectorAll('#rsList li .pt b')].map(b=>b.textContent)"))
        await pg.click('#rsList li .btn')
        await until(pg,f"!!{LOG_EL}.querySelector('.swap') && !!{LOG_EL}.querySelector('li.hist')")
        await pg.wait_for_timeout(400)
        print('after resume:', await pg.evaluate(f"(()=>{{ const l={LOG_EL}; return [l.querySelector('.swap').innerText.replace(/\\n/g,' '), l.querySelector('li.hist summary').innerText.replace(/\\n/g,' ')] }})()"))
        print('header meta:', await pg.evaluate("document.querySelector('#osd .meta').innerText"))
        await pg.evaluate("document.getElementById('chan').scrollTop=1e9"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(OUT,f'LP-resumed-{W}.png'))
        # the list again: the conversation left is there now, the one open is not
        await pg.click('#ask'); await pg.fill('#ask','/resume'); await pg.keyboard.press('Escape'); await pg.keyboard.press('Enter')
        await pg.wait_for_selector('#rsList li',timeout=5000); await pg.wait_for_timeout(300)
        print('list after:', await pg.evaluate("[...document.querySelectorAll('#rsList li .pt b')].map(b=>b.textContent)"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # model and effort from the header
        await pg.click('#osd .osdPick[data-pick="model"]'); await pg.wait_for_selector('#mdList',timeout=3000)
        await pg.click("#mdList li:has(code:text-is('sonnet')) .btn")
        await until(pg,"document.querySelector('#osd .osdPick').innerText.startsWith('Sonnet')")
        await pg.click('#osd .osdPick[data-pick="model"]'); await pg.wait_for_selector('#mdList',timeout=3000); await pg.wait_for_timeout(150)
        print('model marked:', await pg.evaluate("[...document.querySelectorAll('#mdList li.on .pt b')].map(b=>b.textContent)"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        await pg.click('#osd .osdPick[data-pick="effort"]'); await pg.wait_for_selector('#efList',timeout=3000)
        await pg.click("#efList button:has(code:text-is('high'))")
        await until(pg,"[...document.querySelectorAll('#osd .osdPick')][1].innerText==='effort 高い'")
        await pg.wait_for_timeout(300)
        print('header after:', await pg.evaluate("[...document.querySelectorAll('#osd .osdPick')].map(b=>b.innerText)"))
        print('rows:', await pg.evaluate(f"[...{LOG_EL}.querySelectorAll('.cmdo, .sys')].slice(-3).map(d=>d.innerText.replace(/\\n/g,' ').slice(0,90))"))
        # a command's markdown result
        await pg.fill('#ask','/context'); await pg.keyboard.press('Escape'); await pg.keyboard.press('Enter')
        await until(pg,f"!!{LOG_EL}.querySelector('.cmdo .cmdmd table')")
        print('context table rows:', await pg.evaluate(f"[...{LOG_EL}.querySelectorAll('.cmdo .cmdmd tr')].length"))
        print('sent to the terminal:', [x['command']['type'] for x in simlog() if 'command' in x])
        print('errors:', errs or 'none')
        await b.close()
try:
    asyncio.run(main())
finally:
    sim.kill(); hub.kill()
