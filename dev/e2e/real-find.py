# The live page against a real Claude Code terminal (run from run-term.py's "browser" step, with STUB=stub-api-echo.mjs, which
# answers with the message itself): searching the channel finds the words in your messages and in Claude's answers whatever
# their case or width, goes to them with Enter, counts what comes in while the bar is open, and is the same after a reload
# (the conversation drawn again from the hub).
#   STUB=stub-api-echo.mjs python3 dev/term/run-term.py "browser:dev/e2e/real-find.py 1440x900"
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
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(150)
    raise Exception('timed out: '+expr)
IDLE="!document.querySelector('#bStop')||document.querySelector('#bStop').disabled"
STATE="""(()=>{ const f=document.getElementById('find'), hl=k=>CSS.highlights.has(k)? CSS.highlights.get(k).size : 0;
  return {open:!f.hidden, n:document.getElementById('findN').textContent, all:hl('fc-find'), on:hl('fc-find-on')}; })()"""
CUR="""(()=>{ const h=CSS.highlights.get('fc-find-on'); if(!h||!h.size) return null; const r=[...h][0], e=r.startContainer.parentElement, b=r.getBoundingClientRect(), v=document.getElementById('chan').getBoundingClientRect();
  return {text:r.toString(), where:e.closest('.you')? 'you' : e.closest('.ans')? 'claude' : e.closest('.op')? 'op' : e.className, seen:b.height>0&&b.top>=v.top&&b.bottom<=v.bottom}; })()"""
async def send(pg,text):
    await pg.click('#ask'); await pg.keyboard.type(text); await pg.keyboard.press('Enter')
    await pg.wait_for_timeout(1200); await until(pg,IDLE,40000); await pg.wait_for_timeout(500)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(URL,wait_until='load'); await pg.wait_for_timeout(1800)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        for t in ['霧の予報を Fogcast で見る','FOG と fog と ＦＯＧ は同じに数える','関係のない依頼です。'*4,'設定の fog_level を 3 にして']:
            await send(pg,t)
        await pg.keyboard.press('Control+f'); await pg.wait_for_timeout(250)
        await pg.keyboard.type('fog'); await pg.wait_for_timeout(500)
        s=await pg.evaluate(STATE); print('fog:', s, await pg.evaluate(CUR))
        seen=[]
        for i in range(int(s['n'].split('/')[1])):
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200); c=await pg.evaluate(CUR); seen.append((c['text'],c['where'],c['seen']))
        print('Enter through all:', seen)
        await pg.screenshot(path=os.path.join(OUT,f'real-find-1-{W}.png'))
        # a message sent while the bar is open: its words are counted when they come
        await pg.fill('#ask','もう一度 fog を探して'); await pg.press('#ask','Enter'); await pg.wait_for_timeout(1500); await until(pg,IDLE,40000); await pg.wait_for_timeout(900)
        print('after one more turn:', await pg.evaluate(STATE))
        await pg.click('#findIn'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); print('Esc:', await pg.evaluate(STATE))
        # drawn again from the hub
        await pg.reload(wait_until='load'); await pg.wait_for_timeout(2200); await pg.keyboard.press('1'); await pg.wait_for_timeout(1200)
        await pg.keyboard.press('Control+f'); await pg.keyboard.type('FOG_LEVEL'); await pg.wait_for_timeout(500)
        print('after a reload, FOG_LEVEL:', await pg.evaluate(STATE), await pg.evaluate(CUR))
        await pg.screenshot(path=os.path.join(OUT,f'real-find-2-{W}.png'))
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
