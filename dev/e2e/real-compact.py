# The live page against a real Claude Code terminal (STUB=stub-api-echo.mjs STUB_COMPACT_MS=6000: the summary takes 6 s):
# 圧縮 on the screen — the button says 圧縮中… at once, the conversation shows "会話を圧縮しています" while it runs and then
# "圧縮しました", the status line and the chip say so; a reload in the middle comes back to the same.
#   STUB=stub-api-echo.mjs STUB_COMPACT_MS=6000 python3 dev/term/run-term.py "browser:dev/e2e/real-compact.py 1440x900"
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
async def until(pg,expr,ms=30000):
    t=time.time()
    while time.time()-t<ms/1000:
        if await pg.evaluate(expr): return round(time.time()-t,2)
        await pg.wait_for_timeout(100)
    raise Exception('timed out: '+expr)
IDLE="!document.querySelector('#bStop')||document.querySelector('#bStop').disabled"
# the last turn on screen has its footer (it is over) and the channel waits for input
OVER="(()=>{ const t=[...document.querySelectorAll('.log:not([hidden]) li.turn')].pop(); return !!t&&!!t.querySelector('.turnFt').textContent&&document.querySelector('#osd .chip').textContent==='入力待ち'; })()"
STATE="""(()=>{ const b=document.getElementById('bCompact'), box=[...document.querySelectorAll('.log:not([hidden]) .sys.cmpx')].pop();
  return {button:[b.textContent,b.disabled,b.classList.contains('busy')], stop:document.getElementById('bStop').disabled, line:document.querySelector('#live .txt').textContent,
    chip:document.querySelector('#osd .chip').textContent, box:box? [box.classList.contains('done'), box.innerText.replace(/\\s+/g,' ').slice(0,60)] : null}; })()"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(URL,wait_until='load'); await pg.wait_for_timeout(1800)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        async def ask(text):
            n=await pg.evaluate("document.querySelectorAll('.log:not([hidden]) li.turn').length")
            await pg.click('#ask'); await pg.keyboard.type(text); await pg.keyboard.press('Enter')
            await until(pg,f"document.querySelectorAll('.log:not([hidden]) li.turn').length>{n}"); await until(pg,OVER); await pg.wait_for_timeout(500)
        await ask('圧縮の前の依頼です')
        print('before:', await pg.evaluate(STATE))
        await pg.click('#bCompact'); await pg.wait_for_timeout(250)
        print('just pressed:', await pg.evaluate(STATE))
        print('box after', await until(pg,"!!document.querySelector('.log:not([hidden]) .sys.cmpx:not(.done)')",8000), 's:', await pg.evaluate(STATE))
        await pg.screenshot(path=os.path.join(OUT,f'real-compact-1-{W}.png'))
        await pg.keyboard.press('0'); await pg.wait_for_timeout(1000)
        print('wall tile:', await pg.evaluate("[...document.querySelectorAll('.tile')].map(t=>t.querySelector('.chip').textContent+' | '+t.querySelector('.now').textContent)"))
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        print('done after', await until(pg,"!!document.querySelector('.log:not([hidden]) .sys.cmpx.done')&&!document.querySelector('.log:not([hidden]) .sys.cmpx:not(.done)')",20000), 's:', await pg.evaluate(STATE))
        await pg.wait_for_timeout(800); print('settled:', await pg.evaluate(STATE))
        # a reload in the middle of one
        await ask('もうひとつ依頼です')
        await pg.click('#bCompact'); await until(pg,"!!document.querySelector('.log:not([hidden]) .sys.cmpx:not(.done)')",8000)
        await pg.reload(wait_until='load'); await pg.wait_for_timeout(2000); await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        print('reloaded meanwhile:', await pg.evaluate(STATE))
        await until(pg,"!document.querySelector('.log:not([hidden]) .sys.cmpx:not(.done)')",20000); await pg.wait_for_timeout(600)
        print('and then:', await pg.evaluate(STATE), '| boxes:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .sys.cmpx')].map(x=>x.querySelector('b').textContent)"))
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
