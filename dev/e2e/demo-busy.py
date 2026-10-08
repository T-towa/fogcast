# Sending to a channel that is working: the bubble waits ("順番待ち") until the turn ends; on a phone too.
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
    W,H=(int(x) for x in (sys.argv[1] if len(sys.argv)>1 else '1440x900').split('x'))
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto('file:///home/claude/fogcast/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(1200)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(1600)
        await pg.wait_for_function("document.querySelector('#osd .chip.work')",timeout=40000)
        await pg.fill('#ask','終わったら、変更点を 3 行でまとめて'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500)
        print('bubble while working:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .pend')].map(x=>x.className+' | '+x.querySelector('.pst').textContent)"))
        await pg.evaluate("document.querySelector('.log:not([hidden]) .pends').scrollIntoView({block:'end'})"); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(SP,f'N-busy-{W}.png'))
        await pg.wait_for_function("!document.querySelector('.log:not([hidden]) .pend')",timeout=90000)
        print('started as its own turn:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .turn .you .body')].pop().textContent"))
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
