# The live page against a real Claude Code terminal (run from run-term.py's "browser" step, with STUB=stub-api-read.mjs):
# an image attached on the screen reaches Claude through Read (no dialog in the terminal); a quote of Claude's answer goes
# at the head of the next message; Esc stops a long turn, and the stopped turn's message is sent again.
#   STUB=stub-api-read.mjs CLAUDE_ARGS="--permission-mode default" python3 dev/term/run-term.py "browser:dev/e2e/real-msg.py 1440x900" show:after stub:8
import asyncio, os, sys, time, zlib, struct
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
def png(w,h):
    raw=b''.join(b'\x00'+b''.join(bytes([255,217,49] if (x+y)%9<4 else [20,24,36]) for x in range(w)) for y in range(h))
    ch=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+ch(b'IDAT',zlib.compress(raw,9))+ch(b'IEND',b'')
async def until(pg,expr,ms=30000):
    t=time.time()
    while time.time()-t<ms/1000:
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(150)
    raise Exception('timed out: '+expr)
ANS="[...document.querySelectorAll('.log:not([hidden]) .flow > .ans')].map(a=>a.innerText).pop()||''"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(URL,wait_until='load'); await pg.wait_for_timeout(1800)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        # 1. an image, picked: kept by the hub, read by Claude
        await pg.set_input_files('#imgPick',files=[{'name':'screen.png','mimeType':'image/png','buffer':png(120,80)}])
        await until(pg,"[...document.querySelectorAll('#ctlAtt .ai')].every(x=>x.classList.contains('ok'))&&document.querySelectorAll('#ctlAtt .ai').length===1")
        await pg.click('#ask'); await pg.keyboard.type('この画像の色を教えて'); await pg.keyboard.press('Enter')
        await until(pg,"/画像/.test("+ANS+")",40000); await pg.wait_for_timeout(600)
        print('Claude said:', await pg.evaluate(ANS))
        print('ops in that turn:', await pg.evaluate("[...[...document.querySelectorAll('.log:not([hidden]) li.turn')].pop().querySelectorAll('.op')].map(o=>o.innerText.replace(/\\s+/g,' '))"))
        print('the message shows its image:', await pg.evaluate("[...[...document.querySelectorAll('.log:not([hidden]) li.turn')].pop().querySelectorAll('.uimg img')].map(i=>[i.naturalWidth,i.naturalHeight])"))
        # another screen (a reload): the image comes from the hub, with the key
        await pg.reload(wait_until='load'); await pg.wait_for_timeout(1600); await pg.keyboard.press('1'); await pg.wait_for_timeout(1500)
        print('after a reload:', await pg.evaluate("[...[...document.querySelectorAll('.log:not([hidden]) li.turn')].pop().querySelectorAll('.uimg img')].map(i=>[i.naturalWidth,i.naturalHeight,i.src.slice(0,5)])"))
        # 2. a quote of Claude's answer, then a message
        a=pg.locator('.log:not([hidden]) li.turn >> nth=-1 >> .flow > .ans'); await a.scroll_into_view_if_needed(); await a.hover(); await pg.wait_for_timeout(300)
        await pg.click('.bubAct [data-a="q"]'); await pg.click('#ask'); await pg.keyboard.type('これはどういう意味？ @nothere.ts も見て'); await pg.keyboard.press('Escape'); await pg.keyboard.press('Enter')
        await until(pg,"/どういう意味/.test("+ANS+")",30000); await pg.wait_for_timeout(400)
        print('quoted, Claude said:', await pg.evaluate(ANS))
        print('the message shows:', await pg.evaluate("(()=>{ const y=[...document.querySelectorAll('.log:not([hidden]) li.turn')].pop().querySelector('.full > .you'); return [[...y.querySelectorAll('.uq')].map(q=>q.innerText.replace(/\\s+/g,' ')), y.querySelector('.body').lastChild&&y.innerText.split('\\n').pop()]; })()"))
        await pg.screenshot(path=os.path.join(OUT,f'RM-quote-{W}.png'))
        # 3. Esc stops a long turn; its message goes again
        await pg.click('#ask'); await pg.keyboard.type('SLOW 長い作業をして'); await pg.keyboard.press('Enter')
        await until(pg,"!document.getElementById('bStop').disabled",20000); await pg.wait_for_timeout(1200)
        await pg.evaluate("document.activeElement.blur()"); await pg.keyboard.press('Escape')
        await until(pg,"[...document.querySelectorAll('.log:not([hidden]) li.turn')].pop().querySelector('.turnFt [data-redo]')!==null",20000)
        print('stopped:', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) li.turn')].pop().querySelector('.turnFt').innerText.replace(/\\s+/g,' ')"))
        n=await pg.evaluate("document.querySelectorAll('.log:not([hidden]) li.turn').length")
        await pg.click('.log:not([hidden]) li.turn >> nth=-1 >> [data-redo="re"]')
        await until(pg,f"document.querySelectorAll('.log:not([hidden]) li.turn').length>{n}",20000)
        print('sent again: new turn with', await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) li.turn')].pop().querySelector('.full > .you .body').innerText"))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1500)
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
