# The live page's message box against a real Claude Code terminal (run from run-term.py's "browser" step): @ lists the
# terminal's files from the hub, picking puts @path in, and the request is sent with them attached; a long message
# makes the box grow, then scroll. Usage: browser:dev/e2e/real-at.py WxH
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
LIST="[...document.querySelectorAll('#palList li')].slice(0,6).map(li=>li.innerText.replace(/\\n/g,' '))"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(URL,wait_until='load'); await pg.wait_for_timeout(1800)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        await pg.click('#ask'); await pg.keyboard.type('@'); await until(pg,"!document.querySelector('#palList li.pg')||!/読み込んで/.test(document.querySelector('#palList').innerText)")
        print('@ alone:', await pg.evaluate(LIST))
        await pg.keyboard.type('hel'); await pg.wait_for_timeout(400)
        print('@hel:', await pg.evaluate(LIST))
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150)
        await pg.keyboard.type('と @do'); await pg.wait_for_timeout(400)
        print('@do:', await pg.evaluate(LIST))
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        print('in docs/:', await pg.evaluate(LIST))
        await pg.keyboard.press('Escape'); await pg.keyboard.type(' を見て'); await pg.wait_for_timeout(100)
        print('box:', repr(await pg.evaluate("document.getElementById('ask').value")))
        await pg.screenshot(path=os.path.join(OUT,f'RA-box-{W}.png'))
        await pg.keyboard.press('Enter')
        await until(pg,"[...document.querySelectorAll('.log:not([hidden]) .you .att')].length>0",30000); await pg.wait_for_timeout(400)
        print('attached:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .you .att')].pop().innerText.replace(/\\n/g,' ')"))
        await pg.evaluate("document.getElementById('chan').scrollTop=1e9"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(OUT,f'RA-sent-{W}.png'))
        # a long message: the box grows, then scrolls; sent, it is back to one line
        await pg.click('#ask')
        for i in range(1,26): await pg.keyboard.type(f'{i} 行目'); await pg.keyboard.press('Shift+Enter')
        print('long:', await pg.evaluate("(()=>{const a=document.getElementById('ask');return [a.offsetHeight,a.scrollHeight>a.clientHeight+2,getComputedStyle(a).overflowY,document.getElementById('screen').offsetHeight,document.documentElement.scrollHeight,innerHeight]})()"))
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        print('after send:', await pg.evaluate("[document.getElementById('ask').offsetHeight,document.getElementById('screen').offsetHeight]"))
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
