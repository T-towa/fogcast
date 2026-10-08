# The demo page on its own: no errors; everywhere's never-called skills are not in コミュ until one is run.
import asyncio, os, json
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__))
async def fonts(route):
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(SP,'fonts/gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(SP,'fonts',p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
LIST="[...document.querySelectorAll('#dlist .lrow b')].map(b=>b.textContent)"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':1920,'height':910})
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        errs=[]; pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
        await pg.goto('file:///home/claude/fogcast/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(2500)
        await pg.click('#tL'); await pg.wait_for_timeout(400); await pg.click('#dview button[data-v=list]'); await pg.wait_for_timeout(500)
        names=await pg.evaluate(LIST)
        print('list has', len(names), '| never-called everywhere skills listed:', [n for n in ['i18n-check','docker-compose','terraform-plan','storybook','figma-handoff','docx','pptx'] if n in names])
        print('own never-used still listed:', [n for n in ['postgres','figma'] if n in names])
        await pg.keyboard.press('1'); await pg.wait_for_timeout(2000)
        await pg.fill('#ask','/storybook'); await pg.keyboard.press('Escape'); await pg.click('#bSend')
        for i in range(40):
            await pg.wait_for_timeout(500)
            if 'storybook' in await pg.evaluate(LIST): break
        names=await pg.evaluate(LIST)
        print('after /storybook: listed', 'storybook' in names, '| toasts:', await pg.evaluate("[...document.querySelectorAll('.toast')].map(t=>t.innerText.replace(/\\n/g,' / ')).filter(t=>t.includes('storybook'))"))
        await pg.screenshot(path=os.path.join(SP,'D-after.png'))
        await pg.click('#tS'); await pg.wait_for_timeout(500)
        print('skills tab:', (await pg.evaluate("document.querySelector('#pS').innerText")).replace('\n',' / ')[:300])
        print('\n'.join(errs) or 'no errors'); await b.close()
asyncio.run(main())
