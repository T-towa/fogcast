# The live page against a real Claude Code terminal (run from run-term.py's "browser" step, with STUB=stub-api-ask.mjs):
# reading further up, a message from elsewhere lights the button back to the latest with a count and the view stays
# put; the button takes it down. Then a question's written answer: it wraps and grows to five lines, Shift+Enter
# breaks a line, Enter answers, and the answer reaches Claude with its breaks. Usage: browser:dev/e2e/real-end.py WxH
import asyncio, os, sys, time, json, urllib.request
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); OUT=os.environ.get('OUT') or '/tmp'
URL=sys.argv[1]; W,H=(int(x) for x in (sys.argv[2] if len(sys.argv)>2 else '1440x900').split('x'))
BASE=URL.split('/#')[0]; TOK=URL.split('#k=')[1]
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
def other_screen(text):
    # what another screen sends: the hub's own API, as that page would call it
    r=urllib.request.urlopen(urllib.request.Request(f'{BASE}/api/ui/stream',headers={'x-fogcast-token':TOK,'x-fogcast-client':'other-screen'}),timeout=5)
    buf=b''
    while b'\n\n' not in buf: buf+=r.read1(1<<20)
    r.close(); ch=json.loads(buf.split(b'\n\n')[0][6:])['chans'][-1]
    q=urllib.request.Request(f'{BASE}/api/ui/send',data=json.dumps({'chan':ch['id'],'text':text,'local':'lid-other'}).encode(),headers={'content-type':'application/json','x-fogcast-token':TOK,'x-fogcast-client':'other-screen'},method='POST')
    return json.loads(urllib.request.urlopen(q,timeout=5).read())
BTN="(()=>{ const b=document.querySelector('#toEnd'), v=document.querySelector('#chan'); return {shown:!b.hidden, lit:b.classList.contains('new'), label:b.innerText.trim(), gap:Math.round(v.scrollHeight-v.scrollTop-v.clientHeight), top:Math.round(v.scrollTop)}; })()"
IDLE="document.querySelector('#bStop').disabled"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(URL,wait_until='load'); await pg.wait_for_timeout(1800)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        # enough conversation to read further up
        ANS="document.querySelectorAll('.log:not([hidden]) .ans').length"
        for i in range(5):
            n=await pg.evaluate(ANS)
            await pg.click('#ask'); await pg.keyboard.type(f'{i+1} 通目。'+'画面を上に戻して読み返せるだけの長さにするための文です。'*5); await pg.keyboard.press('Enter')
            await until(pg,f"{ANS}>{n}&&{IDLE}",30000)
        await pg.wait_for_timeout(600)
        print('filled:', await pg.evaluate(BTN))
        r=await pg.evaluate("(()=>{ const r=document.querySelector('#chan').getBoundingClientRect(); return [r.left+r.width*.4, r.top+r.height*.5]; })()")
        await pg.mouse.move(r[0],r[1]); await pg.mouse.wheel(0,-5000); await pg.wait_for_timeout(500)
        up=await pg.evaluate(BTN); print('read further up:', up)
        print('another screen sends ->', other_screen('ほかの画面から送った依頼です'))
        await until(pg,"document.querySelector('#toEnd').classList.contains('new')",30000); await pg.wait_for_timeout(2500)
        lit=await pg.evaluate(BTN); print('while up:', lit, '| stayed put:', abs(lit['top']-up['top'])<4)
        if os.environ.get('SHOW_EVENTS'):
            r=urllib.request.urlopen(urllib.request.Request(f'{BASE}/api/ui/stream',headers={'x-fogcast-token':TOK,'x-fogcast-client':'ev-peek'}),timeout=5); buf=b''
            while b'\n\n' not in buf: buf+=r.read1(1<<20)
            r.close(); evs=json.loads(buf.split(b'\n\n')[0][6:])['chans'][-1]['events']
            print('last events:', [(e['k'], (e.get('text') or '')[:20]) for e in evs[-6:]])
        await pg.screenshot(path=os.path.join(OUT,f'RE-lit-{W}.png'))
        await pg.click('#toEnd'); await pg.wait_for_timeout(1400)
        print('after the button:', await pg.evaluate(BTN), '| last bubble:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .you .body')].pop().innerText.slice(0,30)"))
        # a question, answered here in writing over several lines
        await pg.click('#ask'); await pg.keyboard.type('ASK_ME 方式を選んでから進めて'); await pg.keyboard.press('Enter')
        await until(pg,"!!document.querySelector('.log:not([hidden]) .qcard:not(.done) .qin')",30000); await pg.wait_for_timeout(300)
        QIN="(()=>{ const t=document.querySelector('.log:not([hidden]) .qcard .qin'), cs=getComputedStyle(t); return {lines:Math.round((t.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom))/parseFloat(cs.lineHeight)), scrolls:t.scrollHeight>t.clientHeight+1}; })()"
        print('answer box empty:', await pg.evaluate(QIN))
        await pg.click('.log:not([hidden]) .qcard:not(.done) .qin')
        await pg.keyboard.type('A案でもB案でもなく、まず小さく試してから決めたいです。理由は二つあります。'); await pg.keyboard.press('Shift+Enter')
        await pg.keyboard.type('一つ目：影響範囲が読めない。'); await pg.keyboard.press('Shift+Enter'); await pg.keyboard.type('二つ目：戻しやすくしたい。')
        await pg.wait_for_timeout(200); print('answer box written:', await pg.evaluate(QIN))
        await pg.screenshot(path=os.path.join(OUT,f'RE-qin-{W}.png'))
        await pg.keyboard.press('Enter')
        await until(pg,"!!document.querySelector('.log:not([hidden]) .qcard.done')",30000)
        await until(pg,"[...document.querySelectorAll('.log:not([hidden]) .ans')].some(a=>a.innerText.includes('受け取りました'))",30000)
        print('card:', await pg.evaluate("document.querySelector('.log:not([hidden]) .qcard.done .qst').textContent"), '| answer line:', repr(await pg.evaluate("document.querySelector('.log:not([hidden]) .qcard.done .qa').innerText")))
        print("Claude's reply:", await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .ans')].pop().innerText.slice(0,160)"))
        await pg.evaluate("document.querySelector('.log:not([hidden]) .qcard.done').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(OUT,f'RE-qdone-{W}.png'))
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
