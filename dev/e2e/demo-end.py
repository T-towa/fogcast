# The demo page: the button back to the latest (there while reading further up, lit with a count when messages
# come meanwhile, gone at the bottom), and a question's written answer that wraps and grows to five lines.
#   python3 dev/e2e/demo-end.py [1440x900]
import asyncio, os, sys
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); OUT=os.environ.get('OUT',SP)
W,H=(int(x) for x in (sys.argv[1] if len(sys.argv)>1 else '1440x900').split('x'))
FONTS=os.environ.get('FONTS') or os.path.join(SP,'fonts')
async def fonts(route):
    if not os.path.isdir(FONTS): await route.abort(); return
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(FONTS,'gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(FONTS,p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
BTN="(()=>{ const b=document.querySelector('#toEnd'), v=document.querySelector('#chan'), r=b.getBoundingClientRect(); return {shown:!b.hidden, lit:b.classList.contains('new'), label:b.innerText.trim(), gap:Math.round(v.scrollHeight-v.scrollTop-v.clientHeight), top:Math.round(v.scrollTop), box:[Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height)]}; })()"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H})
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        errs=[]; pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.goto('file:///home/claude/fogcast/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(2000)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(2600)
        print('opened ch.1:', await pg.evaluate(BTN))
        # enough to read further up: wait for the channel to fill a little
        for i in range(60):
            if await pg.evaluate("document.querySelector('#chan').scrollHeight>document.querySelector('#chan').clientHeight+400"): break
            await pg.wait_for_timeout(500)
        async def over_chan():   # the wheel goes to what is under the pointer: the channel's view, wherever the layout put it
            r=await pg.evaluate("(()=>{ const r=document.querySelector('#chan').getBoundingClientRect(); return [r.left+r.width*.4, Math.max(r.top,0)+Math.min(r.height,innerHeight-Math.max(r.top,0))*.5]; })()")
            await pg.mouse.move(r[0],r[1])
        await over_chan(); await pg.mouse.wheel(0,-4000); await pg.wait_for_timeout(500)
        st=await pg.evaluate(BTN); print('scrolled up:', st)
        lit=None
        for i in range(90):
            await pg.wait_for_timeout(500)
            s=await pg.evaluate(BTN)
            if s['lit']: lit=s; break
        print('a message came while up:', lit, '| stayed where I was:', lit and abs(lit['top']-st['top'])<4)
        await pg.screenshot(path=os.path.join(OUT,f'end-lit-{W}.png'))
        await pg.click('#toEnd'); await pg.wait_for_timeout(1400)
        print('after the button:', await pg.evaluate(BTN))
        # reading at the bottom: new things follow, the button stays away
        await pg.wait_for_timeout(6000); print('6 s later at the bottom:', await pg.evaluate(BTN))
        # scroll up, then back down by hand: the button goes once at the bottom
        await over_chan(); await pg.mouse.wheel(0,-1500); await pg.wait_for_timeout(400); a=await pg.evaluate(BTN)
        await pg.mouse.wheel(0,6000); await pg.wait_for_timeout(600); z=await pg.evaluate(BTN)
        print('up by hand:', a['shown'], '| down by hand:', z['shown'], z['gap'])
        # switching channels opens the next at its latest, with no button
        await pg.mouse.wheel(0,-1500); await pg.wait_for_timeout(300); await pg.keyboard.press('2'); await pg.wait_for_timeout(2400)
        print('ch.2 opened:', await pg.evaluate(BTN))
        # a question's written answer (ch.2's second prompt asks one): wraps, grows to five lines, then scrolls inside;
        # Shift+Enter breaks a line, Enter answers, and the answer keeps its breaks
        for i in range(150):
            if await pg.evaluate("!!document.querySelector('#logs ol:not([hidden]) .qcard:not(.done) .qin')"): break
            await pg.wait_for_timeout(500)
        await pg.evaluate("document.querySelector('#logs ol:not([hidden]) .qcard:not(.done)').id='tq'")
        QIN="(()=>{ const t=document.querySelector('#tq .qin'), cs=getComputedStyle(t); return {h:Math.round(t.getBoundingClientRect().height), lines:Math.round((t.clientHeight-parseFloat(cs.paddingTop)-parseFloat(cs.paddingBottom))/parseFloat(cs.lineHeight)), scrolls:t.scrollHeight>t.clientHeight+1, tag:t.tagName, sizing:cs.fieldSizing||'(none)'}; })()"
        print('empty answer box:', await pg.evaluate(QIN))
        await pg.click('#tq .qin')
        await pg.keyboard.type('選択肢にない答えを長めに書いてみます。ここで折り返して、次の行に続くかを見ます。'*2); await pg.wait_for_timeout(200)
        print('long line, wrapped:', await pg.evaluate(QIN))
        for i in range(2): await pg.keyboard.press('Shift+Enter'); await pg.keyboard.type(f'{i+3} 行目の段落')
        await pg.wait_for_timeout(200); print('with Shift+Enter breaks:', await pg.evaluate(QIN), '| answered yet:', await pg.evaluate("document.querySelector('#tq').classList.contains('busy')||document.querySelector('#tq').classList.contains('done')"))
        await pg.evaluate("document.querySelector('#tq').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(OUT,f'end-qin-{W}.png'))
        for i in range(4): await pg.keyboard.press('Shift+Enter'); await pg.keyboard.type(f'さらに {i+5} 行目')
        await pg.wait_for_timeout(200); print('past five lines:', await pg.evaluate(QIN))
        await pg.keyboard.press('Enter')
        for i in range(20):
            await pg.wait_for_timeout(300)
            if await pg.evaluate("document.querySelector('#tq').classList.contains('done')"): break
        print('answered card:', await pg.evaluate("(()=>{ const q=document.querySelector('#tq .qa'); return q&&{lines:Math.round(q.getBoundingClientRect().height/parseFloat(getComputedStyle(q).lineHeight)), breaks:(q.innerText.match(/\\n/g)||[]).length, status:document.querySelector('#tq .qst').textContent}; })()"))
        await pg.evaluate("document.querySelector('#tq').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(OUT,f'end-qdone-{W}.png'))
        print('\n'.join(errs) or 'no errors'); await b.close()
asyncio.run(main())
