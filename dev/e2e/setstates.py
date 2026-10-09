# The 設定 gear in each state (off / waiting / on, by its dot) and when hovered, cloned side by side under the header.
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
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1600,'height':900})
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto('file:///home/claude/fogcast/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(1200)
        await pg.evaluate("""(()=>{const src=document.getElementById('bSet'), top=document.querySelector('.top');
          const box=document.createElement('div'); box.id='probe'; box.style.cssText='position:fixed;left:20px;top:120px;z-index:99;display:flex;align-items:center;gap:28px;padding:18px 24px;background:#07080b';
          [['','オフ'],['half','入力待ち'],['on','オン']].forEach(([c,t])=>{const k=src.cloneNode(true); k.id=''; k.className='btn setBtn '+c; k.title=t; box.appendChild(k);});
          document.body.appendChild(box);})()""")
        await pg.wait_for_timeout(300)
        el=await pg.query_selector('#probe'); await el.screenshot(path=os.path.join(SP,'S-states.png'))
        await pg.hover('#probe .setBtn:nth-child(3)'); await pg.wait_for_timeout(300)
        await el.screenshot(path=os.path.join(SP,'S-hover.png'))
        await b.close()
asyncio.run(main())
