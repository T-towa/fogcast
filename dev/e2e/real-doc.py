# The live page against a real Claude Code terminal (run from run-term.py's "browser" step): @ of an Excel, a Word and a
# PowerPoint file, a Shift_JIS CSV, an image and an old .xls; what the message's "添付" says of each. Then a message
# being written is put aside by the command button and comes back after the command. Usage: browser:dev/e2e/real-doc.py WxH
# (the work folder needs data/売上.xlsx, data/sjis.csv, data/old.xls, docs/minutes.docx, docs/deck.pptx and shot.png;
#  run the terminal with STUB=stub-api-dump.mjs STUB_DUMP=… to see what reached the model)
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
LIST="[...document.querySelectorAll('#palList li')].slice(0,8).map(li=>li.innerText.replace(/\\n/g,' '))"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(URL,wait_until='load'); await pg.wait_for_timeout(1800)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(900)
        # the @ list offers them all
        await pg.click('#ask'); await pg.keyboard.type('@'); await pg.wait_for_timeout(300); await pg.keyboard.type('x')
        await until(pg,"!/読み込んで/.test(document.querySelector('#palList').innerText)"); await pg.wait_for_timeout(300)
        print('@x lists:', await pg.evaluate(LIST))
        await pg.keyboard.press('Escape')
        await pg.evaluate("(()=>{ const a=document.getElementById('ask'); a.value='@data/売上.xlsx と @data/sjis.csv、@docs/minutes.docx @docs/deck.pptx @shot.png @data/old.xls を見て'; a.dispatchEvent(new Event('input')); })()")
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Enter')
        await until(pg,"[...document.querySelectorAll('.log:not([hidden]) .you .att')].length>0",40000); await pg.wait_for_timeout(500)
        print('attached:'); [print('  ',x) for x in await pg.evaluate("[...[...document.querySelectorAll('.log:not([hidden]) .you .att')].pop().querySelectorAll('.af')].map(f=>f.className+' | '+f.innerText.replace(/\\s+/g,' ')+' | '+f.title)")]
        await pg.evaluate("document.getElementById('chan').scrollTop=1e9"); await pg.wait_for_timeout(300)
        el=await pg.query_selector_all('.log:not([hidden]) .you')
        if el: await el[-1].screenshot(path=os.path.join(OUT,f'RD-att-{W}.png'))
        await until(pg,"/入力待ち/.test(document.querySelector('#osd').innerText)||[...document.querySelectorAll('.log:not([hidden]) .ai')].length>0",40000)
        await pg.wait_for_timeout(1500)
        # a message being written stays while a command is picked and sent
        await pg.click('#ask'); await pg.keyboard.type('書きかけの依頼です')
        await pg.click('#bCmd'); await pg.wait_for_timeout(300)
        print('command list open:', await pg.evaluate("[document.getElementById('ask').value, !document.getElementById('pal').hidden, document.getElementById('palFt').textContent]"))
        await pg.keyboard.type('cont'); await pg.wait_for_timeout(300); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        print('over the box:', await pg.evaluate("document.getElementById('ctlHint').hidden?'':document.getElementById('ctlHint').innerText.replace(/\\s+/g,' ')"))
        await pg.screenshot(path=os.path.join(OUT,f'RD-aside-{W}.png'))
        await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600)
        print('after /context:', repr(await pg.evaluate("document.getElementById('ask').value")))
        await until(pg,"[...document.querySelectorAll('.log:not([hidden]) .cmdo')].some(x=>/context/.test(x.innerText))",30000)
        print('/context row:', (await pg.evaluate("[...document.querySelectorAll('.log:not([hidden]) .cmdo')].map(x=>x.innerText.replace(/\\s+/g,' ').slice(0,80)).pop()")))
        print('errors:', errs or 'none'); await b.close()
asyncio.run(main())
