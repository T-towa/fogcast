import asyncio, os, sys
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__))
PAGE=os.environ.get('PAGE','/home/claude/fogcast/hub/guide.html')
async def fonts(route):
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(SP,'fonts/local-fonts.css'),content_type='text/css'); return
    p=url.split('fonts.local/')[1]
    await route.fulfill(path=os.path.join(SP,'fonts',p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for scheme,W,H,full,out in [(x.split(',')[0],int(x.split(',')[1]),int(x.split(',')[2]),x.split(',')[3]=='1',x.split(',')[4]) for x in sys.argv[1:]]:
            ctx=await b.new_context(viewport={'width':W,'height':H},color_scheme=scheme,device_scale_factor=1)
            pg=await ctx.new_page()
            await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('https://fonts.local/**',fonts); await pg.route('**/fonts.gstatic.com/**',lambda r: r.abort())
            errs=[]
            pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
            pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
            await pg.goto('file://'+PAGE,wait_until='load')
            await pg.wait_for_timeout(1200)
            sw=await pg.evaluate('document.documentElement.scrollWidth')
            hh=await pg.evaluate('document.documentElement.scrollHeight')
            await pg.screenshot(path=out,full_page=full)
            print(out,scheme,W,'scrollWidth',sw,'height',hh,'|','; '.join(errs) or 'no errors')
            await ctx.close()
        await b.close()
asyncio.run(main())
