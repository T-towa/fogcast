# An interactive Claude Code session in a pseudo-terminal, drawn by a terminal emulator, against the
# no-cost stub API. The hub is asked for a pairing code; the screen is printed as the person would see it.
import os, sys, pty, time, json, select, subprocess, urllib.request, signal
import pyte
S=os.path.dirname(os.path.abspath(__file__)); T=os.path.join(S,'t'); os.makedirs(T,exist_ok=True)
HOME=os.path.join(T,'home'); WORK=os.environ.get('WORKDIR') or os.path.join(T,'work'); FH=os.path.join(T,'fh')
for d in (HOME,WORK,FH): os.makedirs(d,exist_ok=True)
KEY='sk-ant-api03-'+'x'*80+'AAstub'
PORT=int(os.environ.get('HUBPORT','4337')); STUB=int(os.environ.get('STUBPORT','4394'))
PLUGIN=os.environ.get('PLUGIN','/home/claude/fogcast')
cfg={'hasCompletedOnboarding':True,'theme':'dark','numStartups':5,'customApiKeyResponses':{'approved':[KEY[-20:]],'rejected':[]},
     'projects':{WORK:{'hasTrustDialogAccepted':True,'hasCompletedProjectOnboarding':True,'allowedTools':[]}}}
json.dump(cfg,open(os.path.join(HOME,'.claude.json'),'w'))
stub=subprocess.Popen(['node',os.path.join(S,'..','ziptest',os.environ.get('STUB','stub-api.mjs'))],env={**os.environ,'STUB_PORT':str(STUB),'STUB_DELAY_MS':'1500','STUB_LOG':os.path.join(T,'stub.log')})
time.sleep(.6)
COLS,ROWS=110,42
screen=pyte.Screen(COLS,ROWS); stream=pyte.ByteStream(screen)
env={'HOME':HOME,'PATH':(os.environ.get('EXTRA_PATH','')+':' if os.environ.get('EXTRA_PATH') else '')+'/opt/node22/bin:/usr/local/bin:/usr/bin:/bin','TERM':'xterm-256color','LANG':'C.UTF-8','COLUMNS':str(COLS),'LINES':str(ROWS),
     **({'WSL_DISTRO_NAME':os.environ['FAKE_WSL']} if os.environ.get('FAKE_WSL') else {}),
     'ANTHROPIC_API_KEY':KEY,'ANTHROPIC_BASE_URL':f'http://127.0.0.1:{STUB}','FOGCAST_PORT':str(PORT),'FOGCAST_HOME':FH,'DISABLE_AUTOUPDATER':'1',
     **{k:v for k,v in os.environ.items() if k.startswith('PROBE_')}}
pid,fd=pty.fork()
if pid==0:
    os.chdir(WORK)
    import fcntl, termios, struct
    argv=['claude']
    for pd in os.environ.get('PLUGINS',PLUGIN).split(':'): argv+=['--plugin-dir',pd]
    argv+=[a for a in os.environ.get('CLAUDE_ARGS','').split(' ') if a]
    os.execvpe('claude',argv,env)
import fcntl, termios, struct
fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',ROWS,COLS,0,0))
def pump(sec):
    end=time.time()+sec
    while time.time()<end:
        r,_,_=select.select([fd],[],[],0.1)
        if r:
            try: data=os.read(fd,65536)
            except OSError: return
            stream.feed(data)
def show(title):
    print(f'===== {title} =====')
    lines=[l.rstrip() for l in screen.display]
    while lines and not lines[-1]: lines.pop()
    print('\n'.join(lines)); print()
def send(s): os.write(fd,s.encode())
def api(path,body,client='term-test'):
    tok=open(os.path.join(FH,'token')).read().strip()
    r=urllib.request.Request(f'http://127.0.0.1:{PORT}{path}',data=json.dumps(body).encode(),headers={'content-type':'application/json','x-fogcast-token':tok,'x-fogcast-client':client},method='POST')
    try: return json.loads(urllib.request.urlopen(r,timeout=5).read())
    except urllib.error.HTTPError as e: return {'status':e.code,'body':e.read().decode()}
def snapshot(client='term-res'):
    tok=open(os.path.join(FH,'token')).read().strip()
    r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/api/ui/stream',headers={'x-fogcast-token':tok,'x-fogcast-client':client}),timeout=5)
    buf=b''
    while b'\n\n' not in buf: buf+=r.read1(1<<20)
    r.close(); return json.loads(buf.split(b'\n\n')[0][6:])
SESS=[]
def evline(e):
    k=e.get('k'); keep={'resumed':('from','sid','title','src'),'hist':('more','partial'),'cmd':('name','args','text','out','via'),'cmdOut':('name','text','ref'),
        'model':('from','to','src'),'info':('sid','model','effort','tp','branch'),'clear':('prev',),'end':('reason','resume'),'did':('what','ok','error'),
        'turn':('text','via','files'),'say':('text',),'turnEnd':('aborted',),'compact':('trigger',),'note':('text',)}.get(k)
    if keep is None: return None
    d={x:e[x] for x in keep if x in e}
    for x in ('from','sid','prev','resume'):
        if isinstance(d.get(x),str) and len(d[x])>30: d[x]=d[x][:8]
    if k=='hist': d['items']=[(i.get('u','')[:30],i.get('a','')[:30]) for i in e.get('items',[])]
    if 'tp' in d: d['tp']=os.path.basename(d['tp'])[:12]
    return f"{e.get('seq','')}:{k} "+json.dumps(d,ensure_ascii=False)[:220]
try:
    pump(12)
    show('started')
    for step in sys.argv[1:]:
        kind,_,arg=step.partition(':')
        if kind=='wait': pump(float(arg))
        elif kind=='show': show(arg)
        elif kind=='tail':
            n,_,title=arg.partition(':'); lines=[l.rstrip() for l in screen.display]
            while lines and not lines[-1]: lines.pop()
            lines=[l for l in lines if l.strip()]
            print(f'===== {title} ====='); print('\n'.join(lines[-int(n):])); print()
        elif kind=='type': send(arg)
        elif kind=='enter': send('\r')
        elif kind=='key': send({'tab':'\t','esc':'\x1b','ctrlx':'\x18','down':'\x1b[B','up':'\x1b[A','right':'\x1b[C','left':'\x1b[D','space':' '}[arg])
        elif kind=='chan':
            m=snapshot(); ch=m['chans'][-1]
            print('chan:',{k:(ch.get(k)[:8] if k=='sid' and ch.get(k) else ch.get(k)) for k in ('num','status','sid','title','model','effort','effortUsed')},'| models value:',repr((ch.get('models') or {}).get('value')),'| tdir:',bool(ch.get('tdir')))
            evs=[x for x in (evline(e) for e in ch.get('events',[])) if x]
            print('\n'.join('  '+x for x in evs[-int(arg or 12):]))
            print('past:',[(p.get('id','')[:8],p.get('title') or p.get('name'),p.get('how')) for p in m.get('past',[])][:6])
        elif kind=='sessions':
            ch=snapshot()['chans'][-1]; r=api('/api/ui/sessions',{'chan':ch['id']})
            SESS[:]=r.get('sessions',[])
            print('sessions ->',r.get('ok'),r.get('error',''),[(x['id'][:8],x.get('title'),x.get('first','')[:30],x.get('last','')[:30],x.get('open')) for x in SESS])
        elif kind in ('resume','typeresume'):
            sid=SESS[int(arg)]['id'] if arg.isdigit() else arg
            if kind=='resume':
                ch=snapshot()['chans'][-1]; print('resume',sid[:8],'->',api('/api/ui/resume',{'chan':ch['id'],'sid':sid}))
            else: send(f'/resume {sid}'); pump(.6); send('\r'); print('typed /resume',sid[:8])
        elif kind in ('model','effort'):
            ch=snapshot()['chans'][-1]; print(kind,arg,'->',api(f'/api/ui/{kind}',{'chan':ch['id'],'value':arg}))
        elif kind=='uapi':
            # any screen request for this channel: "uapi:/api/ui/compact {}" (the channel's id is filled in)
            path,_,body=arg.partition(' '); ch=snapshot()['chans'][-1]; print(path,'->',api(path,{'chan':ch['id'],**json.loads(body or '{}')}))
        elif kind=='ucmd':
            name,_,args=arg.partition(' '); ch=snapshot()['chans'][-1]; print('command',name,args,'->',api('/api/ui/command',{'chan':ch['id'],'name':name,'args':args}))
        elif kind=='stub':
            print('----- stub -----'); print('\n'.join([l for l in open(os.path.join(T,'stub.log')).read().splitlines() if 'main=true' in l][-int(arg or 3):]))
        elif kind=='browser':
            # a browser script against this hub, while the terminal keeps being read
            tok=open(os.path.join(FH,'token')).read().strip()
            script,_,rest=arg.partition(' ')
            bp=subprocess.Popen(['python3',script,f'http://127.0.0.1:{PORT}/#k={tok}',*rest.split()],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
            while bp.poll() is None: pump(.3)
            print('----- browser',rest,'-----'); print(bp.stdout.read().decode().rstrip())
        elif kind=='log':
            # the probe plugin's notes, from where the last look left off
            pth=os.path.join(T,'probe.log'); txt=open(pth).read() if os.path.exists(pth) else ''
            print('----- probe.log -----'); print(txt[getattr(sys.modules[__name__],'_logpos',0):].rstrip()); globals()['_logpos']=len(txt)
        elif kind=='api':
            path,_,body=arg.partition(' ')
            print('api',path,'->',api(path,json.loads(body or '{}')))
        elif kind=='links':
            # what a screen gets on connecting: コミュ entries, and what each channel loaded
            tok=open(os.path.join(FH,'token')).read().strip()
            r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/api/ui/stream',headers={'x-fogcast-token':tok,'x-fogcast-client':'term-links'}),timeout=5)
            buf=b''
            while b'\n\n' not in buf: buf+=r.read1(65536)
            r.close(); m=json.loads(buf.split(b'\n\n')[0][6:])
            print('links:',sorted((l['id'],l.get('src'),l.get('uses')) for l in m.get('links',[]) if l['kind'] in ('skill','agent','mcp')))
            for ch in m.get('chans',[]): print('loaded skills:',[(s['n'],s['src']) for s in (ch.get('loaded') or {}).get('skills',[])][:12],'| agents:',[(a['n'],a['src']) for a in (ch.get('loaded') or {}).get('agents',[])][:8])
        elif kind=='events':
            # how the hub recorded the conversation: turns, and messages typed while one was running
            tok=open(os.path.join(FH,'token')).read().strip()
            r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/api/ui/stream',headers={'x-fogcast-token':tok,'x-fogcast-client':'term-events'}),timeout=5)
            buf=b''
            while b'\n\n' not in buf: buf+=r.read1(1<<20)
            r.close(); m=json.loads(buf.split(b'\n\n')[0][6:])
            for ch in m.get('chans',[]):
                for ev in ch.get('events',[]):
                    if ev.get('k') in ('turn','user','turnEnd','say','tool'): print('  ev',ev.get('k'),json.dumps({k:ev[k] for k in ('text','name','input','aborted','mid') if k in ev},ensure_ascii=False)[:140])
        elif kind=='status':
            # what the status screen gets: Lv, EXP and today's parts, as a screen in Tokyo asks for it
            tok=open(os.path.join(FH,'token')).read().strip()
            r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/api/ui/stream',headers={'x-fogcast-token':tok,'x-fogcast-client':'term-status','x-fogcast-tz':'Asia/Tokyo'}),timeout=5)
            buf=b''
            while b'\n\n' not in buf: buf+=r.read1(1<<20)
            r.close(); st=json.loads(buf.split(b'\n\n')[0][6:])['usage']['status']
            print('status: Lv',st['lv'],'EXP',st['exp'],'today',st['today'],'| stats',[(x['k'],x['p']) for x in st['stats']],'| rec',st['rec'])
        elif kind=='seen':
            # what the hub was told about one skill: the loaded list (with its estimate) and the command list
            tok=open(os.path.join(FH,'token')).read().strip()
            r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/api/ui/stream',headers={'x-fogcast-token':tok,'x-fogcast-client':'term-seen'}),timeout=5)
            buf=b''
            while b'\n\n' not in buf: buf+=r.read1(1<<20)
            r.close(); m=json.loads(buf.split(b'\n\n')[0][6:])
            for ch in m.get('chans',[]):
                L=ch.get('loaded') or {}
                print('loaded skills:',[s for s in L.get('skills',[]) if s['n'] in (arg,'house-style','dataviz')],'| total',L.get('totalSkills'),'included',L.get('includedSkills'))
                print('command:',[c for c in ch.get('commands',[]) if c['name']==arg])
                print('links:',[l['id'] for l in m.get('links',[]) if arg in l['id']])
        elif kind=='desc':
            # the command list as the hub has it: which skills are there, and how long their descriptions are
            tok=open(os.path.join(FH,'token')).read().strip()
            r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/api/ui/stream',headers={'x-fogcast-token':tok,'x-fogcast-client':'term-desc'}),timeout=5)
            buf=b''
            while b'\n\n' not in buf: buf+=r.read1(1<<20)
            r.close(); m=json.loads(buf.split(b'\n\n')[0][6:])
            for ch in m.get('chans',[]):
                for c in ch.get('commands',[]):
                    if c['name'] in ('check-rules','house-style','model-only','dataviz'): print('command', c['name'], c['source'], len(c['description']), repr(c['description'][-40:]))
                print('loaded:', [(s['n'], s.get('manual',False)) for s in (ch.get('loaded') or {}).get('skills',[]) if s['n'] in ('check-rules','house-style','model-only','dataviz')])
        elif kind in ('snap','answer','send'):
            # the screen's view of the channel: what it waits on, the suggestion, what is pending; or answer / send as the screen does
            tok=open(os.path.join(FH,'token')).read().strip()
            r=urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{PORT}/api/ui/stream',headers={'x-fogcast-token':tok,'x-fogcast-client':'term-snap'}),timeout=5)
            buf=b''
            while b'\n\n' not in buf: buf+=r.read1(1<<20)
            r.close(); m=json.loads(buf.split(b'\n\n')[0][6:]); ch=m['chans'][-1]
            if kind=='snap':
                print('chan:',{k:ch.get(k) for k in ('status','now','ask','suggest','pending')})
                print('hints:',[(c['name'],c.get('hint')) for c in ch.get('commands',[]) if c.get('hint')][:6])
                print('descs:',[(l['id'],l.get('desc','')[:60]) for l in m.get('links',[]) if l.get('desc')])
                print('events:',[(e['k'],e.get('by') or e.get('cid') or e.get('via') or '') for e in ch.get('events',[]) if e['k'] in ('turn','question','questionEnd','toolEnd')][-8:])
            elif kind=='answer':
                print('answer ->',api('/api/ui/question',{'chan':ch['id'],'id':ch.get('ask'),'answers':json.loads(arg)}))
            else:
                print('send ->',api('/api/ui/send',{'chan':ch['id'],'text':arg,'local':'lid-term'}))
        elif kind=='pair':
            # the screen side: read nothing from the terminal, type what the person would read
            code=None
            import re
            for l in screen.display:
                m=re.search(r'ブラウザ承認の合言葉\s+(\d{4}-\d{4})',l)
                if m: code=m.group(1); break
            print('code read off the terminal screen:',code)
            print('pair ->',api('/api/ui/pair',{'code':code or ''}))
finally:
    try: os.kill(pid,signal.SIGTERM)
    except Exception: pass
    stub.kill()
