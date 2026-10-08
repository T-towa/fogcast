import asyncio, os
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__))
async def fonts(route):
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(SP,'fonts/gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(SP,'fonts',p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for W,H in [(390,844),(1280,720),(1920,910)]:
            pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
            pg.on('pageerror',lambda e: errs.append(str(e)))
            await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
            await pg.goto('file:///home/claude/fogcast/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(2500)
            await pg.keyboard.press('2'); await pg.wait_for_timeout(2200)
            m=await pg.evaluate("({sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight,ih:innerHeight})")
            await pg.screenshot(path=os.path.join(SP,f'P-{W}.png'))
            print(W,H,m,errs or 'no errors'); await pg.close()
        await b.close()
asyncio.run(main())
