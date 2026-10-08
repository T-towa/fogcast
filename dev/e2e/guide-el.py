import asyncio, os
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
        for scheme,W,out in [('dark',1440,'g-wsl-sec.png'),('light',390,'g-wsl-sec-phone.png')]:
            ctx=await b.new_context(viewport={'width':W,'height':900},color_scheme=scheme)
            pg=await ctx.new_page()
            await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('https://fonts.local/**',fonts); await pg.route('**/fonts.gstatic.com/**',lambda r: r.abort())
            await pg.goto('file:///home/claude/fogcast/hub/guide.html',wait_until='load'); await pg.wait_for_timeout(900)
            y=await pg.evaluate("document.getElementById('wsl').getBoundingClientRect().top+scrollY")
            end=await pg.evaluate("document.getElementById('parts').getBoundingClientRect().top+scrollY")
            await pg.screenshot(path=os.path.join(SP,out),full_page=True,clip={'x':0,'y':y-20,'width':W,'height':end-y})
            await ctx.close()
        await b.close()
asyncio.run(main())
