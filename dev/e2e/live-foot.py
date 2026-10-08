import asyncio, os, json, subprocess, time, tempfile
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); ROOT='/home/claude/fogcast'
PORT=4324; HOME=tempfile.mkdtemp(prefix='fog-foot-')
env={**os.environ,'FOGCAST_PORT':str(PORT),'FOGCAST_HOME':HOME,'SIM_LOG':os.path.join(HOME,'sim.log')}
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
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for W,H,out in [(1440,900,'live-foot.png'),(390,844,'live-foot-phone.png')]:
            pg=await b.new_page(viewport={'width':W,'height':H})
            await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
            await pg.goto(f'http://127.0.0.1:{PORT}/#k={TOKEN}',wait_until='load'); await pg.wait_for_timeout(2500)
            await pg.wait_for_timeout(9000); await pg.evaluate('scrollTo(0,document.documentElement.scrollHeight)'); await pg.wait_for_timeout(400)
            await pg.screenshot(path=os.path.join(SP,out))
            print(out,'scrollWidth',await pg.evaluate('document.documentElement.scrollWidth'))
            await pg.close()
        await b.close()
try: asyncio.run(main())
finally: sim.kill(); hub.kill()
