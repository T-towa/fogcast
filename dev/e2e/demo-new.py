# The demo's new parts: a sent message shown at once, Claude's question answered by a button, the next-prompt
# suggestion taken with Tab, an ended channel put away, and a skill's own description on its card.
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
        pg.on('pageerror',lambda e: errs.append(str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' else None)
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto('file:///home/claude/fogcast/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(1200)
        await pg.keyboard.press('2'); await pg.wait_for_timeout(1600)
        await pg.fill('#ask','カレンダーの部品をお願いします'); await pg.keyboard.press('Enter')
        await pg.wait_for_timeout(120)
        print('bubble right after Enter:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .pend')].map(x=>x.className+' | '+x.querySelector('.pst').textContent)"))
        await pg.screenshot(path=os.path.join(SP,f'N-pend-{W}.png'))
        # its turn starts: the bubble gives way
        await pg.wait_for_function("!document.querySelector('.log:not([hidden]) .pend')",timeout=20000)
        print('bubble gone once the turn started:', await pg.evaluate("document.querySelector('.log:not([hidden]) .turn:last-of-type .you .body').textContent"))
        # the turn ends: Claude Code's suggestion for the next prompt
        await pg.wait_for_function("!document.getElementById('bSugg').hidden",timeout=60000)
        print('suggestion button:', await pg.evaluate("document.getElementById('bSugg').innerText.replace(/\\n/g,' ')"), '| placeholder:', await pg.evaluate("document.getElementById('ask').placeholder"))
        await pg.screenshot(path=os.path.join(SP,f'N-sugg-{W}.png'))
        await pg.focus('#ask'); await pg.keyboard.press('Tab')
        print('Tab took it:', await pg.evaluate("document.getElementById('ask').value"))
        await pg.keyboard.press('Enter')
        # the next turn asks a question
        await pg.wait_for_selector('.log:not([hidden]) .qcard',timeout=30000); await pg.wait_for_timeout(400)
        print('tile chip while asking:', await pg.evaluate("document.querySelector('#osd .chip').textContent"))
        q=await pg.query_selector('.log:not([hidden]) .qcard'); await q.scroll_into_view_if_needed(); await pg.wait_for_timeout(300)
        await q.screenshot(path=os.path.join(SP,f'N-q-{W}.png'))
        await pg.click('.log:not([hidden]) .qcard .qo[data-k="1"]')
        await pg.wait_for_selector('.log:not([hidden]) .qcard.done',timeout=8000); await pg.wait_for_timeout(300)
        print('after the press:', await pg.evaluate("document.querySelector('.log:not([hidden]) .qcard .qst').textContent"), '|', await pg.evaluate("document.querySelector('.log:not([hidden]) .qcard .qa').textContent"))
        await q.screenshot(path=os.path.join(SP,f'N-qdone-{W}.png'))
        # an ended channel, put away
        await pg.keyboard.press('Escape'); await pg.click('body',position={'x':5,'y':5})
        await pg.keyboard.press('0'); await pg.wait_for_timeout(1600)
        print('tidy button:', await pg.evaluate("!!document.getElementById('bTidy')"))
        await pg.keyboard.press('4'); await pg.wait_for_timeout(1600)
        print('remove button on the ended channel:', await pg.evaluate("!document.getElementById('bForget').hidden"), '| send hidden:', await pg.evaluate("document.getElementById('bSend').hidden"))
        await pg.screenshot(path=os.path.join(SP,f'N-off-{W}.png'))
        await pg.click('#bForget'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=os.path.join(SP,f'N-forget-{W}.png'))
        await pg.click('#bFgOk'); await pg.wait_for_timeout(1800)
        print('channels now:', await pg.evaluate("[...document.querySelectorAll('#chs .ch[data-n]')].map(b=>b.textContent.trim())"), '| tidy:', await pg.evaluate("!!document.getElementById('bTidy')"))
        # a skill's own description on its card
        await pg.click('#tL'); await pg.wait_for_timeout(600)
        await pg.click('#deck .card[data-id="api-conventions"]'); await pg.wait_for_timeout(1500)
        print('card desc:', await pg.evaluate("(document.querySelector('#coInfo .coDesc')||{}).innerText"))
        await pg.screenshot(path=os.path.join(SP,f'N-card-{W}.png'))
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
