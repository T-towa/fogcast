# The live page against a real Claude Code terminal (run from run-term.py's "browser" step, with STUB=stub-api-ask.mjs):
# the 履歴 tab lists the channel's turns newest first and a card takes the screen to its turn (opened if folded, marked);
# on 全チャンネル the cards carry their channel and open it at that turn. Also: 使い方 inside 設定, a command's arguments
# over the box, and the suggestion's button in the box. Usage: browser:dev/e2e/real-hist.py WxH
import asyncio, os, sys, time
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); OUT=os.environ.get('OUT') or '/tmp'
URL=sys.argv[1]; W,H=(int(x) for x in (sys.argv[2] if len(sys.argv)>2 else '1440x900').split('x'))
FONTS=os.environ.get('FONTS') or os.path.join(SP,'fonts')
async def fonts(route):
    if not os.path.isdir(FONTS): await route.abort(); return
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(FONTS,'gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(FONTS,p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def until(pg,expr,ms=20000):
    t=time.time()
    while time.time()-t<ms/1000:
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(120)
    raise Exception('timed out: '+expr)
CARDS="[...document.querySelectorAll('#pH li')].map(l=>(l.querySelector('.hc')?(l.querySelector('.hc').classList.contains('here')?'* ':'C '):'— ')+l.innerText.replace(/\\n/g,' | ').slice(0,70))"
TURN1="(()=>{ const v=document.getElementById('chan'), o=document.getElementById('osd').getBoundingClientRect(); const t=[...document.querySelectorAll('.log:not([hidden]) li.turn')][0]; return {fromHeader:Math.round(t.getBoundingClientRect().top-o.bottom), folded:t.classList.contains('folded'), lit:t.classList.contains('hit'), toEnd:!document.getElementById('toEnd').hidden}; })()"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(URL,wait_until='load'); await pg.wait_for_timeout(1800)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        ANS="document.querySelectorAll('.log:not([hidden]) .ans').length"
        for i in range(5):
            n=await pg.evaluate(ANS)
            await pg.click('#ask'); await pg.keyboard.type(f'{i+1} 通目の依頼。'+'履歴のカードから戻れるかを確かめるための文です。'*4); await pg.keyboard.press('Enter')
            await until(pg,f"{ANS}>{n}&&document.querySelector('#bStop').disabled",30000)
        await pg.wait_for_timeout(800)
        # the suggestion: in the box, with its button
        try: await until(pg,"!document.getElementById('bSugg').hidden",15000)
        except Exception: pass
        print('suggestion:', await pg.evaluate("[!document.getElementById('bSugg').hidden, document.getElementById('ask').placeholder]"))
        if await pg.evaluate("!document.getElementById('bSugg').hidden"):
            await pg.click('#bSugg'); print('button took it:', repr(await pg.evaluate("document.getElementById('ask').value")), '| button gone:', await pg.evaluate("document.getElementById('bSugg').hidden"))
            await pg.fill('#ask',''); await pg.dispatch_event('#ask','input')
        # a command's arguments, over the box
        await pg.click('#ask'); await pg.keyboard.type('/effort '); await pg.wait_for_timeout(250)
        print('arguments:', await pg.evaluate("(()=>{ const h=document.getElementById('ctlHint'); return [h.hidden, h.innerText.replace(/\\n/g,' ')]; })()"))
        await pg.screenshot(path=os.path.join(OUT,f'RH-arg-{W}.png'))
        await pg.fill('#ask',''); await pg.dispatch_event('#ask','input')
        # 履歴
        await pg.click('#tH'); await pg.wait_for_timeout(500)
        print('history:', await pg.evaluate(CARDS))
        await pg.screenshot(path=os.path.join(OUT,f'RH-hist-{W}.png'))
        await pg.evaluate("[...document.querySelectorAll('#pH .hc')].pop().click()"); await pg.wait_for_timeout(1300)
        print('pressed the oldest:', await pg.evaluate(TURN1), '| marked:', await pg.evaluate("(document.querySelector('#pH .hc.here b')||{}).textContent"))
        await pg.screenshot(path=os.path.join(OUT,f'RH-jump-{W}.png'))
        # a new turn while reading back: the history gets it, the screen stays
        top=await pg.evaluate("document.getElementById('chan').scrollTop")
        n=await pg.evaluate("document.querySelectorAll('#pH .hc').length")
        await pg.click('#ask'); await pg.keyboard.type('6 通目'); await pg.keyboard.press('Enter')
        await until(pg,f"document.querySelectorAll('#pH .hc').length>{n}",30000); await pg.wait_for_timeout(1500)
        print('sent from here: cards', n, '->', await pg.evaluate("document.querySelectorAll('#pH .hc').length"), '| newest:', await pg.evaluate("document.querySelector('#pH .hc').innerText.replace(/\\n/g,' | ').slice(0,60)"))
        # 全チャンネル: every channel's turns, newest first; a card opens its channel at that turn
        await pg.fill('#ask',''); await pg.evaluate("document.activeElement.blur()"); await pg.keyboard.press('0'); await pg.wait_for_timeout(1700)
        print('wall history:', (await pg.evaluate(CARDS))[:3])
        await pg.evaluate("[...document.querySelectorAll('#pH .hc')].pop().click()"); await pg.wait_for_timeout(2400)
        print('from the wall:', await pg.evaluate("[document.getElementById('chan').hidden, (document.querySelector('.osd .n')||{}).textContent]"), await pg.evaluate(TURN1))
        # 設定 holds 使い方
        await pg.click('#bSet'); await pg.wait_for_timeout(400)
        print('settings:', await pg.evaluate("[document.getElementById('sheetT').textContent, (document.querySelector('.setGuide a')||{}).getAttribute&&document.querySelector('.setGuide a').getAttribute('href')]"))
        await pg.screenshot(path=os.path.join(OUT,f'RH-set-{W}.png'))
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
