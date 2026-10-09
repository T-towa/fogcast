# The demo page: a message being written is put aside when the command button (or "/") starts a command, and comes back
# once the command is sent, or put away (Esc, the button again, the box emptied); and what @ shows for an Excel file and
# an image.
#   python3 dev/e2e/demo-aside.py [1440x900]
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
BOX="(()=>{ const a=document.querySelector('#ask'), h=document.querySelector('#ctlHint'); return {v:a.value, sel:[a.selectionStart,a.selectionEnd], pal:!document.querySelector('#pal').hidden, ft:document.querySelector('#palFt').textContent, hint:h.hidden?'':h.innerText.replace(/\\s+/g,' '), focus:document.activeElement===a}; })()"
DRAFT='このファイルを直して @hooks/register.ts の\n12 行目のところ'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H})
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        errs=[]; pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.goto('file:///home/claude/fogcast/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(2000)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(2600)
        async def draft():
            await pg.evaluate(f"(()=>{{ const a=document.querySelector('#ask'); a.focus(); a.value={DRAFT!r}; a.dispatchEvent(new Event('input')); a.setSelectionRange(5,9); }})()")
        ok=lambda s: s['v']==DRAFT
        # 1. the button: the box becomes "/" with the list; Esc brings the draft back, with what was selected in it
        await draft(); await pg.click('#bCmd'); await pg.wait_for_timeout(250); a=await pg.evaluate(BOX)
        print('button:', a['v']=='/' and a['pal'], '| list footer:', a['ft'])
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); a=await pg.evaluate(BOX)
        print('Esc gives it back:', ok(a), a['sel'], a['pal'])
        # 2. the button again closes the list and gives it back
        await pg.click('#bCmd'); await pg.wait_for_timeout(200); await pg.click('#bCmd'); await pg.wait_for_timeout(200); a=await pg.evaluate(BOX)
        print('button twice gives it back:', ok(a), a['pal'])
        # 3. erasing the "/" gives it back
        await pg.click('#bCmd'); await pg.wait_for_timeout(200); await pg.keyboard.press('Backspace'); await pg.wait_for_timeout(200); a=await pg.evaluate(BOX)
        print('erasing the / gives it back:', ok(a))
        # 4. a command picked: its arguments and the draft show over the box; sent, the draft comes back
        await pg.click('#bCmd'); await pg.wait_for_timeout(200); await pg.keyboard.type('rena'); await pg.wait_for_timeout(200)
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300); a=await pg.evaluate(BOX)
        print('picked:', repr(a['v']), '| over the box:', a['hint'])
        await pg.screenshot(path=os.path.join(OUT,f'aside-hint-{W}.png'))
        await pg.keyboard.type('予報の調整'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500); a=await pg.evaluate(BOX)
        print('/rename sent, draft back:', ok(a), '| hint now:', repr(a['hint']))
        # 5. "/" from outside the box does the same
        await pg.evaluate("document.querySelector('#ask').blur()"); await pg.wait_for_timeout(250)
        print('box left: hint hidden:', (await pg.evaluate(BOX))['hint']=='')
        await pg.keyboard.press('/'); await pg.wait_for_timeout(250); a=await pg.evaluate(BOX)
        print('"/" key:', a['v']=='/' and a['pal'] and a['focus'])
        await pg.keyboard.type('cont'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600); a=await pg.evaluate(BOX)
        print('/context sent, draft back:', ok(a))
        # 6. a message sent in the command's place brings the draft back after it
        await pg.click('#bCmd'); await pg.wait_for_timeout(200); await pg.keyboard.press('Backspace')
        a=await pg.evaluate(BOX); print('(erased again, back:', ok(a), ')')
        await pg.click('#bCmd'); await pg.wait_for_timeout(200)
        await pg.evaluate("(()=>{ const a=document.querySelector('#ask'); a.value='別の依頼です'; a.dispatchEvent(new Event('input')); })()"); await pg.wait_for_timeout(200)
        a=await pg.evaluate(BOX); print('typed over the /:', repr(a['v']), '| over the box:', a['hint'])
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500); a=await pg.evaluate(BOX)
        sent=await pg.evaluate("[...document.querySelectorAll('#logs ol:not([hidden]) .you .body')].map(x=>x.innerText).slice(-2)")
        print('message sent, draft back:', ok(a), '| last sent:', sent[-1:])
        # 7. nothing written: the button leaves nothing behind
        await pg.evaluate("(()=>{ const a=document.querySelector('#ask'); a.value=''; a.dispatchEvent(new Event('input')); a.focus(); })()")
        await pg.click('#bCmd'); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); a=await pg.evaluate(BOX)
        print('empty box, button + Esc leaves it empty:', repr(a['v']), a['pal'], '| footer said:', (await pg.evaluate(BOX))['ft'])
        # 8. @ of an Excel file and an image: what went with the message
        await pg.evaluate("(()=>{ const a=document.querySelector('#ask'); a.value='@docs/schedule.xlsx と @docs/screen.png を見て'; a.dispatchEvent(new Event('input')); })()")
        await pg.keyboard.press('Enter')
        for i in range(80):          # it waits its turn if the channel is busy
            if await pg.evaluate("[...document.querySelectorAll('#logs ol:not([hidden]) .you .att')].some(x=>x.innerText.includes('schedule.xlsx'))"): break
            await pg.wait_for_timeout(500)
        chips=await pg.evaluate("[...document.querySelectorAll('#logs ol:not([hidden]) .you .att')].slice(-1).flatMap(x=>[...x.querySelectorAll('.af')].map(f=>f.className+' | '+f.innerText.replace(/\\s+/g,' ')+' | '+f.title))")
        print('chips:', chips)
        el=await pg.query_selector_all('#logs ol:not([hidden]) .you .att')
        if el: await el[-1].screenshot(path=os.path.join(OUT,f'aside-chips-{W}.png'))
        print('errors:', errs or 'none')
        await b.close()
asyncio.run(main())
