import asyncio, os, subprocess, time, tempfile
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); ROOT='/home/claude/fogcast'
PORT=4322; HOME=tempfile.mkdtemp(prefix='fog-x-')
env={**os.environ,'FOGCAST_PORT':str(PORT),'FOGCAST_HOME':HOME,'SIM_LOG':os.path.join(HOME,'sim.log')}
hub=subprocess.Popen(['node',f'{ROOT}/hub/hub.mjs'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for _ in range(100):
    if os.path.exists(os.path.join(HOME,'token')): break
    time.sleep(.05)
time.sleep(.3); TOKEN=open(os.path.join(HOME,'token')).read().strip()
async def fonts(route):
    url=route.request.url
    if 'fonts.googleapis.com' in url: await route.fulfill(path=os.path.join(SP,'fonts/gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]; await route.fulfill(path=os.path.join(SP,'fonts',p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={'width':1280,'height':800}); pg=await ctx.new_page()
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)+' '+str(e.stack)[:300]))
        await pg.goto(f'http://127.0.0.1:{PORT}/',wait_until='load'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=os.path.join(SP,'live-nokey.png'))
        await pg.goto(f'http://127.0.0.1:{PORT}/#k={TOKEN}',wait_until='load'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=os.path.join(SP,'live-empty.png'))
        sim=subprocess.Popen(['node',f'{ROOT}/test/simulate.mjs'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        await pg.wait_for_timeout(6000)
        await pg.click('#bAdd'); await pg.wait_for_timeout(500); await pg.screenshot(path=os.path.join(SP,'live-add.png'))
        await pg.keyboard.press('Escape')
        ph=await b.new_page(viewport={'width':390,'height':844},device_scale_factor=2)
        await ph.route('**/fonts.googleapis.com/**',fonts); await ph.route('**/fonts.gstatic.com/**',fonts)
        await ph.goto(f'http://127.0.0.1:{PORT}/',wait_until='load'); await ph.wait_for_timeout(1500)
        await ph.evaluate(f"localStorage.setItem('fogcast.k','{TOKEN}')"); await ph.reload(); await ph.wait_for_timeout(2000)
        await ph.click('.tile'); await ph.wait_for_timeout(1200); await ph.screenshot(path=os.path.join(SP,'live-phone.png'))
        print('\n'.join(errs) or 'no errors'); sim.kill(); await b.close()
try: asyncio.run(main())
finally: hub.kill()
