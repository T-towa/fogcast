# The live page's コミュ against a real hub (its record holding many skills, agents and MCP servers) and the simulated
# terminals (test/simulate.mjs), with the browser's smooth scrolling on: the pane is wheeled down in small notches while
# the counts keep changing, and must never go back up by itself; then it stays at the bottom. 0.6.1 and before: the
# browser's scroll anchoring, with the cards drawn again as the counts changed, pulled it back up now and then.
#   python3 dev/e2e/live-commu.py 1440x900 [card|list]      (1100x800: the rail under the TV, the page scrolling)
import asyncio, os, json, subprocess, time, tempfile, sys, signal
from playwright.async_api import async_playwright
SP=os.path.dirname(os.path.abspath(__file__)); ROOT=os.environ.get('ROOT') or os.path.abspath(os.path.join(SP,'..','..'))
W,H=(int(x) for x in (sys.argv[1] if len(sys.argv)>1 else '1440x900').split('x')); VIEW=sys.argv[2] if len(sys.argv)>2 else 'card'
PORT=4333; HOME=tempfile.mkdtemp(prefix='fog-commu-')
now=int(time.time()*1000); links={}
def add(id,kind,label,src,uses,dt=0,ago=0):
    links[id]={'id':id,'kind':kind,'label':label,'src':src,'uses':uses,'last':now-ago*86400000 if uses else None,'days':{},'recent':[],'dt':dt,'first':now-40*86400000}
for i in range(40): add(f'skill:skill-{i:02d}','skill',f'skill-{i:02d}','.claude/skills',(i*7)%23,dt=150,ago=(i%5)*9)
for i in range(12): add(f'agent:agent-{i:02d}','agent',f'agent-{i:02d}','.claude/agents',(i*5)%11,dt=80,ago=(i%4)*12)
for i in range(6): add(f'mcp:server{i}','mcp',f'server{i}','MCP',(i*3)%7,dt=3000,ago=(i%3)*20)
for n in ['Read','Edit','Write','Bash','Grep','Glob','WebFetch','WebSearch','TodoWrite','Task']: add(n,'tool',n,'組み込み',50)
json.dump({'links':links,'usage':{'five':None,'seven':None,'series5':[],'series7':[],'days':{}},'past':[],'nums':{},'daily':{},'life':None,'tz':''},open(os.path.join(HOME,'state.json'),'w'))
env={**os.environ,'FOGCAST_PORT':str(PORT),'FOGCAST_HOME':HOME}
hub=subprocess.Popen(['node',f'{ROOT}/hub/hub.mjs'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
for _ in range(100):
    if os.path.exists(os.path.join(HOME,'token')): break
    time.sleep(.05)
time.sleep(.3); TOKEN=open(os.path.join(HOME,'token')).read().strip()
sim=subprocess.Popen(['node',f'{ROOT}/test/simulate.mjs'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
SC="(()=>{ const p=document.getElementById('pL'); return p.scrollHeight>p.clientHeight+2? p.scrollTop : document.scrollingElement.scrollTop; })()"
POS="(()=>{ const p=document.getElementById('pL'), sc=p.scrollHeight>p.clientHeight+2? p : document.scrollingElement; return [Math.round(sc.scrollTop), sc.scrollHeight, sc.clientHeight, sc===p?'pane':'page']; })()"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--enable-smooth-scrolling']); pg=await b.new_page(viewport={'width':W,'height':H}); errs=[]
        pg.on('pageerror',lambda e: errs.append(str(e)))
        await pg.route('**/fonts.googleapis.com/**',lambda r: r.abort()); await pg.route('**/fonts.gstatic.com/**',lambda r: r.abort())
        await pg.goto(f'http://127.0.0.1:{PORT}/#k={TOKEN}',wait_until='load'); await pg.wait_for_timeout(2500)
        await pg.click('#tL'); await pg.wait_for_timeout(800)
        if VIEW=='list': await pg.click('#dview [data-v="list"]'); await pg.wait_for_timeout(400)
        r=await pg.evaluate("(()=>{ const r=document.getElementById('pL').getBoundingClientRect(); return [r.left+r.width/2, Math.max(40,Math.min(innerHeight-40, r.top+Math.min(r.height-20,300)))]; })()")
        await pg.mouse.move(r[0],r[1])
        back=[]
        for i in range(80):
            before=await pg.evaluate(SC); await pg.mouse.wheel(0,100); await pg.wait_for_timeout(160); after=await pg.evaluate(SC)
            if after<before-2: back.append((i,round(before),round(after)))
        print('went back up while wheeling down:', back or 'never')
        end=await pg.evaluate(POS); print('at the bottom:', end, end[0]>=end[1]-end[2]-2)
        seen=[]; t=time.time()
        while time.time()-t<12:
            seen.append((await pg.evaluate(POS))[0]); await pg.wait_for_timeout(250)
        print('stayed there:', min(seen)==max(seen)==end[0])
        print('errors:', errs or 'none'); await b.close()
try: asyncio.run(main())
finally:
    sim.kill(); hub.send_signal(signal.SIGTERM)
