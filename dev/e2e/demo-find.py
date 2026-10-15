# The demo: searching a channel. Ctrl+F opens the bar under the header; every match is lit and the one you are on is bright;
# Enter / Shift+Enter go down and up, and a match in a folded turn opens it; case and width do not matter (HOOKS = ｈｏｏｋｓ);
# Esc closes it and nothing stays lit; the bar follows to another channel; a second Ctrl+F in the bar is the browser's own.
#   python3 dev/e2e/demo-find.py 1440x900   (390x844: a phone, opened from the magnifier in the header)
import asyncio, os, sys
from playwright.async_api import async_playwright
ROOT='/home/claude/fogcast'
W,H=(int(x) for x in (sys.argv[1] if len(sys.argv)>1 else '1440x900').split('x'))
OUT=os.environ.get('OUT','/tmp')
FONTS=os.environ.get('FONTS','')
async def fonts(route):
    url=route.request.url
    if not FONTS: await route.abort(); return
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(FONTS,'gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(FONTS,p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
STATE="""(()=>{ const f=document.getElementById('find'), lg=document.querySelector('#logs ol:not([hidden])');
  const hl=k=>window.CSS&&CSS.highlights&&CSS.highlights.has(k)? CSS.highlights.get(k).size : 0;
  return {open:!f.hidden, n:document.getElementById('findN').textContent, none:f.classList.contains('none'), all:hl('fc-find'), on:hl('fc-find-on'),
    focus:document.activeElement&&document.activeElement.id, btn:!!document.querySelector('.osdFind.on'),
    badges:lg? [...lg.querySelectorAll('[data-find]')].map(e=>(e.closest('li.turn')?.querySelector('.fold .tn')?.textContent||e.textContent.slice(0,12))+'='+e.dataset.find) : '-',
    folded:lg? [...lg.querySelectorAll('li.turn.folded .fold .tn')].map(e=>e.textContent) : '-' }; })()"""
CUR="""(()=>{ const h=CSS.highlights.get('fc-find-on'); if(!h||!h.size) return null; const r=[...h][0]; const b=r.getBoundingClientRect(), v=document.getElementById('chan').getBoundingClientRect();
  return {text:r.toString(), turn:r.startContainer.parentElement.closest('li.turn')?.querySelector('.fold .tn')?.textContent||'-', y:Math.round(b.top-v.top), seen:b.top>=v.top&&b.bottom<=v.bottom&&b.height>0}; })()"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(f'file://{ROOT}/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(1200)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(9000)
        await pg.click('#bPause')                                   # hold the demo still so the counts stay put
        phone=W<700
        if phone:
            await pg.click('.osdFind')
        else:
            await pg.keyboard.press('Control+f')
        await pg.wait_for_timeout(300)
        print('opened:', await pg.evaluate(STATE))
        await pg.keyboard.type('ステータスライン'); await pg.wait_for_timeout(500)
        s=await pg.evaluate(STATE); print('typed (two folded turns hold it):', s); print('  on:', await pg.evaluate(CUR))
        await pg.screenshot(path=os.path.join(OUT,f'find-1-{W}.png'))
        for k in ['Enter','Enter','Shift+Enter']:
            await pg.keyboard.press(k); await pg.wait_for_timeout(250)
            print(k, (await pg.evaluate(STATE))['n'], await pg.evaluate(CUR))
        await pg.screenshot(path=os.path.join(OUT,f'find-2-{W}.png'))
        await pg.fill('#findIn','HOOKS'); await pg.wait_for_timeout(450); print('HOOKS:', (await pg.evaluate(STATE))['n'], await pg.evaluate(CUR))
        await pg.fill('#findIn','ｈｏｏｋｓ'); await pg.wait_for_timeout(450); print('full width:', (await pg.evaluate(STATE))['n'])
        await pg.fill('#findIn','受け皿'); await pg.wait_for_timeout(450); print('受け皿:', (await pg.evaluate(STATE))['n'], await pg.evaluate(CUR))
        await pg.screenshot(path=os.path.join(OUT,f'find-3-{W}.png'))
        await pg.fill('#findIn','zzzz-none'); await pg.wait_for_timeout(450); print('no match:', await pg.evaluate(STATE))
        await pg.screenshot(path=os.path.join(OUT,f'find-4-{W}.png'))
        # Enter straight after typing: the new words count at once
        await pg.fill('#findIn',''); await pg.wait_for_timeout(300); await pg.keyboard.type('受け皿'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(250)
        print('typed+Enter at once:', (await pg.evaluate(STATE))['n'], await pg.evaluate(CUR))
        # the second Ctrl+F in the bar is left to the browser
        await pg.evaluate("window.__cf=null; document.addEventListener('keydown',e=>{ if(e.ctrlKey&&e.key==='f') setTimeout(()=>{ window.__cf=e.defaultPrevented; },0); })")
        await pg.keyboard.press('Control+f'); await pg.wait_for_timeout(100); print('second Ctrl+F taken by the page:', await pg.evaluate('window.__cf'))
        # Esc closes it: nothing lit, no counts on folded turns, the turn keeps going
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); print('Esc:', await pg.evaluate(STATE))
        # opened again: the words are still there, and lit again
        await pg.keyboard.press('Control+f'); await pg.wait_for_timeout(400); print('again:', await pg.evaluate(STATE))
        # Esc with the pointer in the conversation (not the bar): it closes the bar, not the turn
        await pg.click('#bPause'); await pg.wait_for_timeout(200)
        for i in range(120):
            if 'work' in await pg.evaluate("document.querySelector('#osd .chip').className"): break
            await pg.wait_for_timeout(250)
        await pg.click('#logs ol:not([hidden]) li.turn:last-child .aihd'); await pg.wait_for_timeout(100)
        st=await pg.evaluate("document.querySelector('#osd .chip').className")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        print('Esc outside the bar:', (await pg.evaluate(STATE))['open'], 'status before/after:', st, await pg.evaluate("document.querySelector('#osd .chip').className"))
        # Esc in the message box: the bar goes first (the turn is not stopped), and the keys stay in the box
        await pg.keyboard.press('Control+f'); await pg.wait_for_timeout(300); await pg.click('#ask'); st=await pg.evaluate("document.querySelector('#osd .chip').className")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        print('Esc in the message box:', (await pg.evaluate(STATE))['open'], (await pg.evaluate(STATE))['focus'], 'status before/after:', st, await pg.evaluate("document.querySelector('#osd .chip').className"))
        # to another channel with it open: the same words, counted there
        await pg.keyboard.press('Control+f'); await pg.wait_for_timeout(300)
        await pg.fill('#findIn','テスト'); await pg.wait_for_timeout(450); print('ch.1 テスト:', (await pg.evaluate(STATE))['n'])
        await pg.click('#chs [data-n="3"]'); await pg.wait_for_timeout(1600)
        print('ch.3 テスト:', await pg.evaluate(STATE))
        await pg.click('#findIn'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(250); print('  Enter:', (await pg.evaluate(STATE))['n'], await pg.evaluate(CUR))
        await pg.screenshot(path=os.path.join(OUT,f'find-5-{W}.png'))
        # new text that comes in is counted (the demo going on)
        await pg.fill('#findIn','を'); await pg.wait_for_timeout(450); a=(await pg.evaluate(STATE))['n']
        await pg.wait_for_timeout(12000); print('as the channel goes on:', a, '->', (await pg.evaluate(STATE))['n'])
        await pg.click('#chs [data-n="0"]'); await pg.wait_for_timeout(1600); print('to the wall:', await pg.evaluate(STATE))
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
