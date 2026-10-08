# Screenshots of chosen chapters of the built guide: sections given as id pairs (from:to), dark desktop and light phone.
import asyncio, os, sys
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__))
async def fonts(route):
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(SP,'fonts/local-fonts.css'),content_type='text/css'); return
    p=url.split('fonts.local/')[1]
    await route.fulfill(path=os.path.join(SP,'fonts',p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for scheme,W,tag in [('dark',1440,'d'),('light',390,'p')]:
            ctx=await b.new_context(viewport={'width':W,'height':900},color_scheme=scheme)
            pg=await ctx.new_page(); errs=[]
            pg.on('pageerror',lambda e: errs.append(str(e)))
            await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('https://fonts.local/**',fonts); await pg.route('**/fonts.gstatic.com/**',lambda r: r.abort())
            await pg.goto('file:///home/claude/fogcast/hub/guide.html',wait_until='load'); await pg.wait_for_timeout(900)
            print(tag,'scrollW',await pg.evaluate("document.documentElement.scrollWidth"),'errors',errs)
            for spec in sys.argv[1:]:
                a,_,z=spec.partition(':')
                y=await pg.evaluate(f"document.getElementById('{a}').getBoundingClientRect().top+scrollY")
                end=await pg.evaluate(f"document.getElementById('{z}').getBoundingClientRect().top+scrollY")
                await pg.screenshot(path=os.path.join(SP,f'G-{tag}-{a}.png'),full_page=True,clip={'x':0,'y':y-20,'width':W,'height':end-y})
            await ctx.close()
        await b.close()
asyncio.run(main())
