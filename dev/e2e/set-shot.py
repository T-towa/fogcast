# 設定 (under the logo) at a few sizes, and the sheet it opens; the header's height too.
import asyncio, os, sys
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__))
async def fonts(route):
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(SP,'fonts/gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(SP,'fonts',p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def main():
    sizes=[(int(x.split('x')[0]),int(x.split('x')[1])) for x in sys.argv[1].split(',')]
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for W,H in sizes:
            pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
            pg.on('pageerror',lambda e: errs.append(str(e)))
            await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
            await pg.goto('file:///home/claude/fogcast/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(1500)
            head=await pg.evaluate("Math.round(document.querySelector('.top').getBoundingClientRect().height)")
            tv=await pg.evaluate("(()=>{const r=document.querySelector('.tv').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()")
            y0=max(0,tv['y']+tv['h']-110) if W>900 else 0
            await pg.screenshot(path=os.path.join(SP,f'T-wall-{W}.png'),clip={'x':tv['x'],'y':y0,'width':tv['w'],'height':min(110,H-y0)} if W>900 else None,full_page=(W<=900))
            await pg.keyboard.press('1'); await pg.wait_for_timeout(2000)
            tv=await pg.evaluate("(()=>{const r=document.querySelector('.tv').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()")
            y0=max(0,tv['y']+tv['h']-140)
            if W>900: await pg.screenshot(path=os.path.join(SP,f'T-chan-{W}.png'),clip={'x':tv['x'],'y':y0,'width':tv['w'],'height':min(140,H-y0)})
            else:
                await pg.evaluate("document.getElementById('ctl').scrollIntoView({block:'end'})"); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(SP,f'T-chan-{W}.png'))
            vis=await pg.evaluate("[...document.querySelectorAll('.setBtn')].map(b=>b.id+':'+(b.offsetParent!==null))")
            await pg.click('#bSet'); await pg.wait_for_timeout(500)
            sheet=await pg.evaluate("!document.getElementById('scrim').hidden&&document.getElementById('sheetT').textContent")
            print(W,H,'header',head,'| shown',vis,'| sheet:',sheet,'|',errs or 'no errors'); await pg.close()
        await b.close()
asyncio.run(main())
