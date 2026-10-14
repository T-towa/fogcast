# The demo page's message tools: quoting a message (whole, or a part selected), images (picked, pasted, dropped) shown
# small in the box and in the message, Esc stopping the turn, and a stopped turn's message sent again or changed first.
#   python3 dev/e2e/demo-msg.py [1440x900]
import asyncio, os, sys, base64
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
# a 64x40 PNG made here (a yellow frame), and a big one the page must make smaller
def png(w,h):
    import zlib, struct
    raw=b''.join(b'\x00'+b''.join(bytes([255,217,49] if (x<3 or y<3 or x>w-4 or y>h-4) else [20,24,36]) for x in range(w)) for y in range(h))
    ch=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+ch(b'IDAT',zlib.compress(raw,9))+ch(b'IEND',b'')
SMALL=png(64,40); BIG=png(2600,1400)
ATT="(()=>{ const h=document.getElementById('ctlAtt'); return {shown:!h.hidden, quotes:[...h.querySelectorAll('.aq')].map(x=>x.innerText.replace(/\\s+/g,' ')), imgs:[...h.querySelectorAll('.ai')].map(x=>x.className)}; })()"
LAST="(()=>{ const y=[...document.querySelectorAll('.log:not([hidden]) .you')].pop(); return y? {quote:[...y.querySelectorAll('.uq')].map(q=>q.innerText.replace(/\\s+/g,' ')), text:y.querySelector('.body').innerText.replace(/\\s+/g,' ').slice(0,120), imgs:[...y.querySelectorAll('.uimg img')].map(i=>[i.naturalWidth,i.naturalHeight]), raw:(y.dataset.raw||'').slice(0,200)} : null; })()"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto('file:///home/claude/fogcast/ui-src/demo.html',wait_until='load'); await pg.wait_for_timeout(1500)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(2600)
        for i in range(80):          # a finished answer to quote
            if await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) li.turn')].some(li=>li.querySelector('.turnFt')?.textContent&&(li.querySelector('.flow > .ans')?.textContent.length||0)>20)"): break
            await pg.wait_for_timeout(500)
        await pg.evaluate("document.querySelector('.log:not([hidden]) li.turn.folded')&&0")
        # 1. the pointer on Claude's answer: 引用 puts it in the box
        ans=pg.locator('.log:not([hidden]) li.turn:not(.folded) .flow > .ans').first
        await ans.scroll_into_view_if_needed(); await ans.hover(); await pg.wait_for_timeout(250)
        print('bar over the answer:', await pg.evaluate("document.querySelector('.bubAct').hidden?null:document.querySelector('.bubAct').innerText.replace(/\\n/g,' | ')"))
        await pg.screenshot(path=os.path.join(OUT,f'msg-bar-{W}.png'))
        await pg.click('.bubAct [data-a="q"]'); await pg.wait_for_timeout(200)
        print('box after 引用:', await pg.evaluate(ATT))
        # 2. a part of an answer selected: just that
        await pg.evaluate("""(()=>{ const a=document.querySelector('.log:not([hidden]) li.turn:not(.folded) .flow > .ans'); const t=a.firstChild&&a.firstChild.nodeType===3? a.firstChild : [...a.querySelectorAll('*')].map(e=>e.firstChild).find(n=>n&&n.nodeType===3&&n.textContent.length>8);
          const r=document.createRange(); r.setStart(t,0); r.setEnd(t,Math.min(8,t.textContent.length)); const s=getSelection(); s.removeAllRanges(); s.addRange(r); a.dispatchEvent(new MouseEvent('mouseup',{bubbles:true})); })()""")
        await pg.wait_for_timeout(200)
        print('bar over a selection:', await pg.evaluate("document.querySelector('.bubAct').hidden?null:document.querySelector('.bubAct').innerText"))
        await pg.click('.bubAct [data-a="q"]'); await pg.wait_for_timeout(200)
        print('box with two quotes:', await pg.evaluate(ATT))
        # 3. images: picked (one big, made smaller here), pasted, dropped
        await pg.set_input_files('#imgPick',files=[{'name':'big.png','mimeType':'image/png','buffer':BIG}])
        await pg.evaluate(f"""(()=>{{ const b=Uint8Array.from(atob('{base64.b64encode(SMALL).decode()}'),c=>c.charCodeAt(0)), f=new File([b],'shot.png',{{type:'image/png'}}), d=new DataTransfer(); d.items.add(f);
          document.getElementById('ask').dispatchEvent(new ClipboardEvent('paste',{{clipboardData:d,bubbles:true,cancelable:true}})); }})()""")
        await pg.evaluate(f"""(()=>{{ const b=Uint8Array.from(atob('{base64.b64encode(SMALL).decode()}'),c=>c.charCodeAt(0)), f=new File([b],'drop.png',{{type:'image/png'}}), d=new DataTransfer(); d.items.add(f);
          document.getElementById('screen').dispatchEvent(new DragEvent('dragenter',{{dataTransfer:d,bubbles:true,cancelable:true}})); window.__dropShown=!document.getElementById('drop').hidden;
          document.getElementById('screen').dispatchEvent(new DragEvent('drop',{{dataTransfer:d,bubbles:true,cancelable:true}})); }})()""")
        await pg.wait_for_timeout(1200)
        print('drop area shown while dragging:', await pg.evaluate("window.__dropShown"), '| box:', await pg.evaluate(ATT))
        # text with a picture of itself (cells from Excel): the text goes in, no image
        await pg.evaluate("""(()=>{ const d=new DataTransfer(); d.setData('text/plain','A1\\tB1'); d.items.add(new File([new Uint8Array([137,80,78,71])],'cells.png',{type:'image/png'}));
          const a=document.getElementById('ask'); const ev=new ClipboardEvent('paste',{clipboardData:d,bubbles:true,cancelable:true}); a.dispatchEvent(ev); window.__pasteText=!ev.defaultPrevented; })()""")
        print('text pasted with its picture went in as text:', await pg.evaluate("window.__pasteText"), '| images still', len((await pg.evaluate(ATT))['imgs']))
        await pg.screenshot(path=os.path.join(OUT,f'msg-box-{W}.png'))
        await pg.click('#ask'); await pg.keyboard.type('ここを、この画像のとおりに直してください')
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600)
        print('box after sending:', await pg.evaluate(ATT))
        for i in range(60):
            l=await pg.evaluate(LAST)
            if l and l['imgs'] and l['quote']: break
            await pg.wait_for_timeout(500)
        print('the message:', l)
        el=await pg.query_selector_all('.log:not([hidden]) .you'); await el[-1].scroll_into_view_if_needed(); await el[-1].screenshot(path=os.path.join(OUT,f'msg-sent-{W}.png'))
        # its quote goes back to where it came from; an image opens large
        await pg.click('.log:not([hidden]) .you >> nth=-1 >> .uq >> nth=0'); await pg.wait_for_timeout(900)
        print('quote pressed: lit turn', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) li.turn.hit')].map(li=>li.querySelector('.fold .tn').textContent)"))
        await pg.click('.log:not([hidden]) .you >> nth=-1 >> .uimg img >> nth=0'); await pg.wait_for_timeout(300)
        print('image pressed: sheet', await pg.evaluate("!document.getElementById('scrim').hidden&&!!document.querySelector('.sheet .bigImg')"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # 4. Esc while it works: stopped; the stopped turn's message, again or changed
        for i in range(40):
            if await pg.evaluate("!document.getElementById('bStop').disabled"): break          # the stop button is live while it works
            await pg.wait_for_timeout(400)
        await pg.evaluate("document.activeElement&&document.activeElement.blur()")
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(500)
        print('Esc: stop flashed', await pg.evaluate("document.getElementById('bStop').classList.contains('flash')"), '| last turn footer:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) li.turn')].pop().querySelector('.turnFt').innerText.replace(/\\s+/g,' ')"))
        await pg.screenshot(path=os.path.join(OUT,f'msg-stopped-{W}.png'))
        n0=await pg.evaluate("document.querySelectorAll('.log:not([hidden]) .you').length+document.querySelectorAll('.log:not([hidden]) .pend').length")
        await pg.click('.log:not([hidden]) li.turn >> nth=-1 >> [data-redo="re"]'); await pg.wait_for_timeout(500)
        print('sent again:', await pg.evaluate("(()=>{ const p=[...document.querySelectorAll('.log:not([hidden]) .pend .you, .log:not([hidden]) .you')].pop(); return p&&p.querySelector('.body').innerText.slice(0,60); })()"),
              '| one more message:', await pg.evaluate("document.querySelectorAll('.log:not([hidden]) .you').length+document.querySelectorAll('.log:not([hidden]) .pend').length")>n0)
        # changed first: a draft in the box waits, and comes back after
        await pg.click('#ask'); await pg.keyboard.type('書きかけの別の文')
        await pg.evaluate("document.querySelector('.log:not([hidden]) li.turn[data-ab=\"1\"] [data-redo=\"ed\"]').click()"); await pg.wait_for_timeout(300)
        print('changed first: box', repr(await pg.evaluate("document.getElementById('ask').value")), await pg.evaluate(ATT))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        print('Esc puts it away, the draft comes back:', repr(await pg.evaluate("document.getElementById('ask').value")), (await pg.evaluate(ATT))['shown'])
        # 5. own message: the bar offers sending it again
        y=pg.locator('.log:not([hidden]) li.turn:not(.folded) .full > .you').first; await y.scroll_into_view_if_needed(); await y.hover(); await pg.wait_for_timeout(250)
        print('bar over your message:', await pg.evaluate("document.querySelector('.bubAct').hidden?null:document.querySelector('.bubAct').innerText.replace(/\\n/g,' | ')"))
        print('errors:', errs or 'none')
        await b.close()
asyncio.run(main())
