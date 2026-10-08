# The live page against a real Claude Code terminal (run from cmdcheck/term/run.py's "browser" step):
# the resume, model and effort pickers, and a command's output, carried out in that terminal.
import asyncio, os, sys, time
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); OUT=os.environ.get('OUT') or '/tmp'
URL=sys.argv[1]; W,H=(int(x) for x in (sys.argv[2] if len(sys.argv)>2 else '1440x900').split('x')); PART=sys.argv[3] if len(sys.argv)>3 else 'all'
FONTS=os.environ.get('FONTS') or os.path.join(SP,'fonts')     # the page's web fonts, kept locally (the sandbox reaches no font server)
async def fonts(route):
    if not os.path.isdir(FONTS): await route.abort(); return      # without them the page falls back to system fonts
    url=route.request.url
    if 'fonts.googleapis.com' in url:
        await route.fulfill(path=os.path.join(FONTS,'gstatic-fonts.css'),content_type='text/css'); return
    p=url.split('/local/')[1]
    await route.fulfill(path=os.path.join(FONTS,p),content_type='font/woff2' if p.endswith('woff2') else 'font/woff')
async def until(pg,expr,ms=20000):
    t=time.time()
    while time.time()-t<ms/1000:
        if await pg.evaluate(expr): return True
        await pg.wait_for_timeout(150)
    raise Exception('timed out: '+expr)
LOG="document.querySelector('.log:not([hidden])')"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e))); pg.on('console',lambda m: errs.append('console: '+m.text) if m.type=='error' and not (m.text.endswith('net::ERR_FAILED') and not os.path.isdir(FONTS)) else None)
        await pg.route('**/fonts.googleapis.com/**',fonts); await pg.route('**/fonts.gstatic.com/**',fonts)
        await pg.goto(URL,wait_until='load'); await pg.wait_for_timeout(1800)
        await pg.keyboard.press('1'); await pg.wait_for_timeout(800)
        print('header picks:', await pg.evaluate("[...document.querySelectorAll('#osd .osdPick')].map(b=>b.innerText+(b.disabled?' (off)':''))"))
        if PART in ('all','resume'):
            await pg.click('#ask'); await pg.keyboard.type('/resume'); await pg.wait_for_timeout(250)
            print('palette first:', await pg.evaluate("[...document.querySelectorAll('#palList .po')].slice(0,3).map(li=>li.querySelector('code').textContent+'='+li.querySelector('.kd').textContent)"))
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150); await pg.keyboard.press('Enter')
            await pg.wait_for_selector('#rsList li',timeout=6000); await pg.wait_for_timeout(500)
            print('resume list:', await pg.evaluate("[...document.querySelectorAll('#rsList li')].map(li=>li.innerText.replace(/\\n/g,' | '))"))
            await pg.screenshot(path=os.path.join(OUT,f'R-resume-{W}.png'))
            n0=await pg.evaluate(f"{LOG}.querySelectorAll('.swap').length")
            await pg.click('#rsList li .btn')
            await until(pg,f"{LOG}.querySelectorAll('.swap').length>{n0}")
            await until(pg,f"!!{LOG}.querySelector('li.hist:last-child, li.hist')")
            await pg.wait_for_timeout(600)
            print('after resume:', await pg.evaluate(f"(()=>{{ const l={LOG}; const s=[...l.querySelectorAll('.swap')].pop(); const h=[...l.querySelectorAll('li.hist')].pop(); return [s&&s.innerText.replace(/\\n/g,' '), h&&h.querySelector('summary').innerText.replace(/\\n/g,' '), h&&h.querySelector('.histIn').innerText.replace(/\\n/g,' | ').slice(0,160)] }})()"))
            print('status:', await pg.evaluate("document.querySelector('#osd')?.innerText.replace(/\\n/g,' ').slice(0,160)"))
            await pg.evaluate("document.getElementById('chan').scrollTop=1e9"); await pg.wait_for_timeout(300)
            await pg.screenshot(path=os.path.join(OUT,f'R-resumed-{W}.png'))
        if PART=='resumeterm':
            # the terminal's own /resume list, opened from the picker's footer
            await pg.click('#ask'); await pg.fill('#ask','/resume'); await pg.keyboard.press('Escape'); await pg.keyboard.press('Enter')
            await pg.wait_for_selector('#rsList li',timeout=6000); await pg.wait_for_timeout(400)
            print('resume list:', await pg.evaluate("[...document.querySelectorAll('#rsList li')].map(li=>li.innerText.replace(/\\n/g,' | '))"))
            await pg.screenshot(path=os.path.join(OUT,f'R-resume-{W}.png'))
            await pg.click('#rsTerm'); await pg.wait_for_timeout(1500)
            print('toast:', await pg.evaluate("[...document.querySelectorAll('.toast')].slice(-1).map(t=>t.innerText.replace(/\\n/g,' '))"))
        if PART in ('all','model'):
            await pg.click('#osd .osdPick[data-pick="model"]'); await pg.wait_for_selector('#mdList',timeout=4000); await pg.wait_for_timeout(200)
            print('models:', await pg.evaluate("[...document.querySelectorAll('#mdList li')].map(li=>li.querySelector('.pt b').textContent+(li.classList.contains('on')?'*':''))"))
            await pg.screenshot(path=os.path.join(OUT,f'R-model-{W}.png'))
            # a model other than the one set: the first of these without the 設定中 mark
            pick=await pg.evaluate("['sonnet','opus','haiku'].find(o=>{ const li=[...document.querySelectorAll('#mdList li')].find(l=>l.querySelector('code')?.textContent===o); return li&&li.querySelector('.btn'); })")
            fam={'sonnet':'Sonnet','opus':'Opus','haiku':'Haiku'}[pick]
            print('picking:', pick)
            await pg.click(f"#mdList li:has(code:text-is('{pick}')) .btn")
            await until(pg,f"[...document.querySelectorAll('#osd .osdPick')][0].innerText.startsWith('{fam}')")
            await pg.wait_for_timeout(1500)
            print('header after model:', await pg.evaluate("[...document.querySelectorAll('#osd .osdPick')].map(b=>b.innerText)"))
            await pg.click('#osd .osdPick[data-pick="model"]'); await pg.wait_for_selector('#mdList',timeout=4000); await pg.wait_for_timeout(200)
            print('marked now:', await pg.evaluate("[...document.querySelectorAll('#mdList li.on')].map(li=>li.querySelector('.pt b').textContent)"), '|', await pg.evaluate("document.querySelector('.sheet .sub')?.innerText.slice(0,40)"))
            await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
            print('model box:', await pg.evaluate(f"[...{LOG}.querySelectorAll('.sys')].pop()?.innerText.replace(/\\n/g,' ')"))
        if PART in ('all','effort'):
            await pg.click('#osd .osdPick[data-pick="effort"]'); await pg.wait_for_selector('#efList',timeout=4000); await pg.wait_for_timeout(200)
            print('effort now:', await pg.evaluate("document.querySelector('#efList .on')?.innerText.replace(/\\n/g,' ')"))
            await pg.click("#efList button:has(code:text-is('max'))")
            await until(pg,"[...document.querySelectorAll('#osd .osdPick')][1].innerText.includes('最大')")
            await pg.wait_for_timeout(1500)
            print('header after effort:', await pg.evaluate("[...document.querySelectorAll('#osd .osdPick')].map(b=>b.innerText)"))
            print('effort row:', await pg.evaluate(f"[...{LOG}.querySelectorAll('.cmdo')].pop()?.innerText.replace(/\\n/g,' ')"))
        if PART in ('all','context'):
            await pg.fill('#ask','/context'); await pg.keyboard.press('Escape'); await pg.keyboard.press('Enter')
            await until(pg,f"[...{LOG}.querySelectorAll('.cmdo')].some(d=>d.dataset.name==='context'&&d.querySelector('.cmdmd,pre'))")
            await pg.wait_for_timeout(400)
            print('context row:', await pg.evaluate(f"[...{LOG}.querySelectorAll('.cmdo')].filter(d=>d.dataset.name==='context').pop().innerText.replace(/\\n/g,' | ').slice(0,200)"))
            await pg.evaluate("document.getElementById('chan').scrollTop=1e9"); await pg.wait_for_timeout(300)
            await pg.screenshot(path=os.path.join(OUT,f'R-context-{W}.png'))
            await pg.evaluate("document.getElementById('chan').scrollTop=0"); await pg.wait_for_timeout(300)
            await pg.screenshot(path=os.path.join(OUT,f'R-top-{W}.png'))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
