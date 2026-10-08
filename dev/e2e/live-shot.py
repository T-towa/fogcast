# The live page against a hub and the two simulated terminals, at a given size; steps from argv.
import asyncio, os, json, subprocess, time, tempfile, sys
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); ROOT='/home/claude/fogcast'
PORT=int(os.environ.get('PORT','4325')); HOME=tempfile.mkdtemp(prefix='fog-shot-')
env={**os.environ,'FOGCAST_PORT':str(PORT),'FOGCAST_HOME':HOME,'SIM_LOG':os.path.join(HOME,'sim.log'),'SIM_CTL':os.path.join(HOME,'ctl')}
hub=subprocess.Popen(['node',f'{ROOT}/hub/hub.mjs'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for _ in range(100):
    if os.path.exists(os.path.join(HOME,'token')): break
    time.sleep(.05)
time.sleep(.3); TOKEN=open(os.path.join(HOME,'token')).read().strip()
sim=subprocess.Popen(['node',f'{ROOT}/test/simulate.mjs'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
async def fonts(route):
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(SP,'fonts/gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(SP,'fonts',p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def main():
    W=int(os.environ.get('W','1920')); H=int(os.environ.get('H','910'))
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H})
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        errs=[]; pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
        await pg.goto(f'http://127.0.0.1:{PORT}/#k={TOKEN}',wait_until='load'); await pg.wait_for_timeout(int(os.environ.get('WAIT','9000')))
        for a in sys.argv[1:]:
            kind,_,arg=a.partition(':')
            if kind=='key': await pg.keyboard.press(arg)
            elif kind=='click': await pg.click(arg)
            elif kind=='wait': await pg.wait_for_timeout(int(arg))
            elif kind=='type': await pg.keyboard.type(arg)
            elif kind=='fill': sel,_,txt=arg.partition('='); await pg.fill(sel,txt)
            elif kind=='shot': await pg.screenshot(path=os.path.join(SP,arg))
            elif kind=='eval': print('eval:',await pg.evaluate(arg))
            elif kind=='ctl': open(os.path.join(HOME,'ctl'),'w').write(arg)
        m=await pg.evaluate("""()=>{const r=e=>{const x=document.querySelector(e);return x?Math.round(x.getBoundingClientRect().height):null};
          return {scrollH:document.documentElement.scrollHeight,innerH:innerHeight,scrollW:document.documentElement.scrollWidth,tv:r('.tv'),rail:r('.rail'),screen:r('.screen')}}""")
        print('metrics',json.dumps(m)); print('\n'.join(errs) or 'no errors')
        await b.close()
try: asyncio.run(main())
finally: sim.kill(); hub.kill()
