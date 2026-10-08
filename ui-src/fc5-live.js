
/* ================= live: the hub's reports on the same screen =================
   The page the hub serves sets window.FOGCAST={live:true}. Everything above draws from CH, LINKS
   and G; here they are filled from the hub's stream instead of the demo's script, and what the
   person does on this page goes back to the hub, which hands it to that terminal's mod. */
const LV={token:'',client:'',connected:false,helloDone:false,ap:{on:false,pairing:false,pairedHere:false,paired:0},asks:new Map(),past:[],home:'',
  byId:new Map(),wait:600,replaying:false,ctrl:null,lastMsg:0,onAp:null,lids:new Set()};
/* the 22 major arcana, fixed to what every session has */
const LIVE_MAJ={claude:0,Edit:1,Read:2,Write:3,'agent:Plan':4,ToolSearch:5,AskUserQuestion:6,Bash:7,Tasks:8,'agent:Explore':9,'agent:general-purpose':10,
  Glob:11,Monitor:12,TaskStop:13,NotebookEdit:14,EnterWorktree:15,ExitPlanMode:16,WebSearch:17,WebFetch:18,Grep:19,compact:20,clear:21};
const LIVE_WHAT={
  claude:'すべてのチャンネルの中心です。依頼を受けて道具を呼び、結果をまとめて返します。このカードはターンの回数を数えます。',
  Edit:'既存のファイルの一部を書き換えます。',Read:'ファイルを読み込みます。読んだ分だけコンテキストを使います。',Write:'新しいファイルを作るか、丸ごと書き直します。',
  'agent:Plan':'実装の前に計画を立てるサブエージェントです。',ToolSearch:'必要になったツールの定義を、その場で読み込みます。',AskUserQuestion:'選択肢を出して、あなたに質問します。',
  Bash:'シェルコマンドを実行します。テスト、ビルド、git はここを通ります。',Tasks:'作業をタスクに分けて、進み具合を記録します。',
  'agent:Explore':'コードを読んで回るサブエージェントです。中での作業はこのチャンネルのコンテキストに入りません。','agent:general-purpose':'何でも任せられるサブエージェントです。',
  Glob:'ファイル名のパターンでファイルを探します。',Monitor:'バックグラウンドで動いている処理の出力を見張ります。',TaskStop:'バックグラウンドの処理を止めます。',
  NotebookEdit:'Jupyter ノートブックのセルを書き換えます。',EnterWorktree:'git worktree に入り、別の作業フォルダで続けます。',ExitPlanMode:'計画を見せて、実装に進んでよいか確かめます。',
  WebSearch:'Web を検索して候補のページを集めます。',WebFetch:'指定したページを取得して読みます。',Grep:'リポジトリの中から文字列やパターンを探します。',
  compact:'会話を要約してコンテキストを空けます。このカードは圧縮の回数を数えます。',clear:'会話をリセットして、新しいセッションとして始めます。',
};
const kindWhat=l=> l.kind==='skill'? `スキルです（${l.src||'—'}）。名前と説明は毎回のコンテキストに入り、本文は使うときだけ読み込まれます。`
  : l.kind==='agent'? `サブエージェントです（${l.src||'—'}）。中での作業はこのチャンネルのコンテキストに入りません。`
  : l.kind==='mcp'? `${l.label} の MCP サーバーです。ツールの定義がコンテキストに入ります。` : `${l.label} ツールです。`;
const rnd=()=>{ const b=new Uint8Array(12); crypto.getRandomValues(b); return [...b].map(x=>x.toString(16).padStart(2,'0')).join(''); };
const cssq=s=>window.CSS&&CSS.escape? CSS.escape(String(s)) : String(s).replace(/["\\]/g,'\\$&');
const tilde=p=>{ p=String(p||''); return LV.home&&(p===LV.home||p.startsWith(LV.home+'/')||p.startsWith(LV.home+'\\'))? '~'+p.slice(LV.home.length) : p; };
const clip1=(s,n)=>{ s=String(s||'').replace(/\s+/g,' ').trim(); return s.length>n? s.slice(0,n-1)+'…' : s; };
// claude-opus-5-5[1m] → Opus 5.5（1M）: the long-context variant is a model of its own in the picker, so it says so here too
function modelName(m){ const s=String(m||''), x=/claude-([a-z]+)-(\d+)-(\d+)/i.exec(s); return x? `${x[1][0].toUpperCase()}${x[1].slice(1)} ${x[2]}.${x[3]}${/\[1m\]$/i.test(s)?'（1M）':''}` : s; }

/* ---------------- the key, and talking to the hub ---------------- */
function liveKeys(){
  const m=/[#&]k=([0-9a-f]{32,})/.exec(location.hash);
  try{ if(m){ localStorage.setItem('fogcast.k',m[1]); history.replaceState(null,'',location.pathname+location.search); } LV.token=m? m[1] : (localStorage.getItem('fogcast.k')||''); }catch(e){ LV.token=m? m[1] : ''; }
  try{ LV.client=localStorage.getItem('fogcast.client')||''; if(!LV.client){ LV.client=rnd(); localStorage.setItem('fogcast.client',LV.client); } }catch(e){ LV.client=LV.client||rnd(); } }
async function api(path,body){
  const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-fogcast-token':LV.token,'x-fogcast-client':LV.client},body:JSON.stringify(body||{})});
  let j=null; try{ j=await r.json(); }catch(e){}
  if(r.status===401){ LV.token=''; try{ localStorage.removeItem('fogcast.k'); }catch(e){} dirty=true; }
  if(!r.ok) throw Object.assign(new Error((j&&j.error)||`HTTP ${r.status}`),{status:r.status,body:j});
  return j||{}; }
async function liveStream(){
  if(!LV.token){ LV.connected=false; dirty=true; return; }
  try{
    const ctrl=new AbortController(); LV.ctrl=ctrl;
    // the hub counts days in this screen's time zone (under WSL its own clock can differ)
    let tz=''; try{ tz=Intl.DateTimeFormat().resolvedOptions().timeZone||''; }catch(e){}
    const r=await fetch('/api/ui/stream',{headers:{'x-fogcast-token':LV.token,'x-fogcast-client':LV.client,...(tz&&/^[\x20-\x7e]+$/.test(tz)?{'x-fogcast-tz':tz}:{})},signal:ctrl.signal,cache:'no-store'});
    if(r.status===401){ LV.token=''; try{ localStorage.removeItem('fogcast.k'); }catch(e){} LV.connected=false; dirty=true; return; }
    if(!r.ok||!r.body) throw new Error('stream');
    const rd=r.body.getReader(), dec=new TextDecoder(); let buf='';
    for(;;){ const {value,done}=await rd.read(); if(done) break; buf+=dec.decode(value,{stream:true});
      let i; while((i=buf.indexOf('\n\n'))>=0){ const chunk=buf.slice(0,i); buf=buf.slice(i+2); if(chunk.startsWith('data: ')){ try{ liveMsg(JSON.parse(chunk.slice(6))); }catch(err){ console.error(err); } } } }
  }catch(e){}
  LV.connected=false; dirty=true;
  setTimeout(liveStream,LV.wait); LV.wait=Math.min(5000,Math.round(LV.wait*1.6)); }
function liveMsg(m){ LV.lastMsg=Date.now();
  switch(m.type){
    case 'hello': liveHello(m); break;
    case 'chan': { const c=chanFrom(m.chan); if(m.chan.events) liveReplay(c,m.chan.events); dirty=true; break; }
    case 'ev': { const c=LV.byId.get(m.chan); if(c) liveEv(c,m.ev,false); break; }
    case 'links': liveLinks(m.links,false); break;
    case 'global': liveUsage(m.usage); break;
    case 'ap': LV.ap=m.approvals; G.ap.on=LV.ap.on&&LV.ap.pairedHere; dirty=true; if(LV.onAp) LV.onAp(); break;
    case 'ask': liveAsk(m.ask); break;
    case 'askEnd': liveAskEnd(m); break;
    case 'gone': { const c=LV.byId.get(m.chan); if(c) liveRemove(c); dirty=true; break; }
  } }
function liveHello(m){
  LV.connected=true; LV.wait=600; LV.home=(m.hub&&m.hub.home)||''; LV.past=m.past||[]; LV.ap=m.approvals||LV.ap; G.ap.on=LV.ap.on&&LV.ap.pairedHere;
  const keep=new Set((m.chans||[]).map(x=>x.id)); for(const c of [...CH]) if(!keep.has(c.id)) liveRemove(c);
  LV.replaying=true;
  liveLinks(m.links||[],true);
  for(const x of m.chans||[]){ const c=chanFrom(x); liveReplay(c,x.events||[]); }
  LV.replaying=false;
  liveUsage(m.usage);
  LV.asks.clear(); (m.asks||[]).forEach(liveAsk);
  LV.helloDone=true; dirty=true; tilesKey=null; guideKey=null; chsKey=null;
  if(sel&&!chN(sel)) select(0); else if(sel) select(sel); }
function liveRemove(c){ c.log.remove(); LV.byId.delete(c.id); const i=CH.indexOf(c); if(i>=0) CH.splice(i,1); tilesKey=null; guideKey=null; chsKey=null; }

/* ---------------- channels ---------------- */
function liveLoaded(x){ return {md:!!x.md,memory:x.memory||[],skills:(x.skills||[]).map(s=>({n:s.n,src:s.src,dt:s.dt,manual:!!s.manual})),agents:(x.agents||[]).map(a=>({n:a.n,src:a.src,dt:a.dt})),
  mcp:x.mcp||[],mods:x.mods||['fogcast'],tree:null,totalSkills:x.totalSkills,includedSkills:x.includedSkills,autoCompactAt:x.autoCompactAt||null,window:x.window||null}; }
function chanFrom(x){ let c=LV.byId.get(x.id);
  if(!c){ c={id:x.id,num:x.num,name:x.name||'claude',role:'',cwd:'',branch:'—',model:'',status:'idle',now:'入力待ち',active:null,ops:[],ctx:0,win:200000,tok:0,cost:0,perTurn:[],tasks:[],files:{},agents:[],
      queue:[],blocks:[],loaded:{md:false,skills:[],agents:[],mcp:[],mods:['fogcast']},commands:[],breakdownRaw:[],endedAt:null,resume:null,phaseAt:Date.now(),boot:false,warned85:false,cur:null,lis:new Map(),turnNo:0};
    c.log=document.createElement('ol'); c.log.className='log'; c.log.hidden=true; $('logs').appendChild(c.log);
    LV.byId.set(x.id,c); CH.push(c);
    if(LV.helloDone&&!LV.replaying&&x.status!=='off'){ toast('start',`ch.${x.num} ${esc(x.name)} を受信しました`,`${esc(tilde(x.cwd))} で始まりました。`,x.num); c.boot=true; setTimeout(()=>{ c.boot=false; dirty=true; },1200); } }
  const was=c.status;
  if(x.num!=null) c.num=x.num; if(x.name) c.name=x.name;
  if('ask' in x) c.ask=x.ask||null;
  if('suggest' in x) c.suggest=x.suggest||'';
  if(x.pending) livePending(c,x.pending);
  if(x.cwd!=null) c.cwd=tilde(x.cwd); if(x.branch!=null) c.branch=x.branch||'—'; if(x.model) c.model=modelName(x.model);
  if(x.status){ c.status=x.status; c.now=x.now||c.now; if(x.since) c.phaseAt=x.since; }
  if(x.ctx){ c.ctx=x.ctx.tokens||0; c.win=x.ctx.window||c.win; }
  if(x.usd!=null) c.cost=x.usd; if(x.tok!=null) c.tok=x.tok;
  for(const k of ['perTurn','blocks','tasks','files','agents','ops']) if(x[k]) c[k]=x[k];
  if('active' in x) c.active=x.active;
  if(x.endedAt!==undefined) c.endedAt=x.endedAt; if(x.resume!==undefined) c.resume=x.resume; if(x.sid) c.sid=x.sid;
  if(x.loaded) c.loaded=liveLoaded(x.loaded);
  if(x.commands) c.commands=x.commands;
  if(x.effort!==undefined) c.effort=x.effort||''; if(x.effortUsed!==undefined) c.effortUsed=x.effortUsed||''; if(x.title!==undefined) c.title=x.title||'';
  if(x.models!==undefined) c.models=x.models; if(x.efforts!==undefined) c.efforts=x.efforts||[];
  if(x.breakdown) c.breakdownRaw=x.breakdown;
  c.log.setAttribute('aria-label',`ch.${c.num} ${c.name} の会話`);
  CH.sort((a,b)=>a.num-b.num);
  if(!LV.replaying&&LV.helloDone){
    if(was!=='wait'&&c.status==='wait'&&!c.ask&&sel!==c.num) toast('wait',`ch.${c.num} ${esc(c.name)} が承認を待っています`,`${c.now.replace(/^承認待ち：/,'')}（押すと開きます）`,c.num);
    if(c.status!=='off'&&pct(c)>=85&&!c.warned85){ c.warned85=true; const tl=turnsLeft(c); toast('info',`ch.${c.num} ${esc(c.name)} のコンテキストが ${pct(c)}% です`,`${tl!=null?`あと約 ${tl} ターンで自動で圧縮されます。`:''}「圧縮」で先に空けられます。`,c.num); } }
  if(pct(c)<70) c.warned85=false;
  return c; }
const BKN={'System prompt':['システム','rgba(243,239,226,.45)'],'System tools':['ツールの定義','#3fe6d6'],'MCP tools':['MCP','#93b4ff'],'Custom agents':['エージェントの説明','#ff86c0'],
  'Memory files':['CLAUDE.md など','#c9a2ff'],'Skills':['スキルの説明','#ffd931'],'Messages':['会話','#f3efe2']};
function liveBreakdown(c){ const fixed=(c.breakdownRaw||[]).filter(b=>b.n!=='Messages').map(b=>{ const k=BKN[b.n]||[b.n,'rgba(147,180,255,.55)']; return {n:k[0],v:b.v,c:k[1]}; });
  const f=fixed.reduce((a,b)=>a+b.v,0); return [...fixed,{n:'会話',v:Math.max(0,c.ctx-f),c:'#f3efe2'}]; }
function liveUsage(u){ if(!u) return;
  if(u.five) G.five={pc:u.five.pc,resetAt:u.five.resetsAt||Date.now()+5*H};
  if(u.seven) G.seven={pc:u.seven.pc,resetAt:u.seven.resetsAt||Date.now()+7*DAY};
  G.pace5=u.pace5;
  if(u.pace7!=null) G.pace7=u.pace7;
  else if(u.seven&&u.seven.resetsAt){ const el=Math.max(.5,7-(u.seven.resetsAt-Date.now())/DAY); G.pace7=u.seven.pc/el; }
  G.past={}; for(const [k,v] of Object.entries(u.past||{})) G.past[+k]=v;
  G.daily=u.daily||{};
  // your status: a level gained while this screen watched is told once, here only
  const was=G.status; G.status=u.status||null;
  if(was&&G.status&&G.status.lv>was.lv&&LV.helloDone&&!LV.replaying) lvUp(G.status);
  dirty=true; }
function liveTick(){ const now=Date.now();
  if(!G.five.none&&now>G.five.resetAt) G.five={pc:0,resetAt:G.five.resetAt+5*H};
  if(!G.seven.none&&now>G.seven.resetAt){ G.seven={pc:0,resetAt:G.seven.resetAt+7*DAY}; G.past={}; }
  G.act+=(working()-G.act)*.04;
  for(const a of LV.asks.values()){ const c=LV.byId.get(a.chan); const cd=c&&c.log.querySelector(`.perm[data-id="${cssq(a.id)}"] .cd`); if(cd) cd.textContent=`あと ${Math.max(0,Math.round((a.exp-now)/1000))} 秒でターミナルへ`; } }

/* ---------------- コミュ: the hub keeps the counts ---------------- */
function linkFrom(x){ let l=LINK[x.id]; const isNew=!l;
  if(!l){ l=LINK[x.id]={id:x.id,kind:x.kind,label:x.label,src:'',uses:0,rank:0,recent:[],byCh:{},today:0,live:new Set(),last:null,dt:0,maj:LIVE_MAJ[x.id]??null,what:LIVE_WHAT[x.id]||null,card:null,num:'—',arc:'カードなし',art:null,firstUse:null}; LINKS.push(l); }
  const before=l.uses;
  Object.assign(l,{kind:x.kind,label:x.id==='claude'?'Claude':x.label,src:x.src||l.src||'',desc:x.desc||l.desc||'',uses:x.uses||0,last:x.last||null,today:x.today||0,dt:x.dt||0,firstUse:x.firstUse||l.firstUse});
  if(!LIVE_WHAT[x.id]) l.what=kindWhat(l);
  l.recent=(x.recent||[]).map(r=>({t:r.t,n:r.n,x:r.x||'',r:r.r||''}));
  l.byCh={}; for(const r of l.recent) l.byCh[r.n]=(l.byCh[r.n]||0)+1;
  l.live=new Set(x.live||[]); l.rank=rankOf(l.uses);
  return {l,isNew,before}; }
// majors are fixed; each suit goes to its kind in the order they were first used, 14 at most
function assignCards(){ let changed=false;
  for(const l of LINKS) if(l.maj!=null&&!l.card){ giveCard(l); changed=true; }
  for(const k of ['skill','agent','mcp','tool']) LINKS.filter(l=>l.maj==null&&l.kind===k&&l.uses>0&&!l.card).sort((a,b)=>(a.firstUse||a.last||0)-(b.firstUse||b.last||0)||a.id.localeCompare(b.id)).forEach(l=>{ if(giveCard(l)) changed=true; });
  for(const l of LINKS) if(!l.card){ l.card=null; l.num='—'; l.arc='カードなし'; l.art=null; }
  return changed; }
function liveLinks(list,full){ let rebuild=false;
  if(full){ LINKS.length=0; for(const k of Object.keys(LINK)) delete LINK[k]; rebuild=true; }
  const ups=[];
  for(const x of list){ const {l,isNew,before}=linkFrom(x); if(isNew) rebuild=true; if(!full&&!LV.replaying&&l.kind!=='core'&&rankOf(before)<l.rank) ups.push({l,first:before===0}); }
  if(assignCards()) rebuild=true;
  if(rebuild) buildDeck();
  for(const {l,first} of ups){ const o=cardEls[l.id]; if(o){ o.el.classList.remove('up'); void o.el.offsetWidth; o.el.classList.add('up'); }
    const r=l.recent[l.recent.length-1], where=r? `ch.${r.n} ${esc(r.ch||'')}` : '';
    if(first) toast('up',`${cardHead(l)} を初めて使いました`,`コミュに加わりました（ランク 1${l.card?'':'。カードは種類ごとに 14 枚までなので「一覧」に並びます'}）。${where?where+' で使用。':''}`);
    else { const nx=toNext(l.uses); toast('up',`${cardHead(l)} がランク ${l.rank} に`,`通算 ${l.uses} 回。${nx!=null?`次のランクまで あと ${nx} 回。`:'最高ランクです。'}`); } }
  dirty=true; }

/* ---------------- the conversation, event by event ---------------- */
/* Claude's words and a command's markdown: code blocks, tables, headings, bold, code and lists, nothing more */
const mdInline=s=>esc(s).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>');
const mdText=p=>mdInline(p).replace(/^#{1,6} (.+)$/gm,'<b>$1</b>').replace(/^\s*[-*] /gm,'• ').replace(/\n{2,}/g,'<br><br>').replace(/\n/g,'<br>');
const mdCells=r=>r.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(x=>x.trim());
const isRow=l=>/^\s*\|.*\|\s*$/.test(l), isSep=l=>isRow(l)&&mdCells(l).every(x=>/^:?-{2,}:?$/.test(x));
function mdTables(p){ const L=p.split('\n'), out=[]; let buf=[];
  const flush=()=>{ if(buf.length){ out.push(mdText(buf.join('\n'))); buf=[]; } };
  for(let i=0;i<L.length;i++){
    if(isRow(L[i])&&isSep(L[i+1]||'')){ const head=mdCells(L[i]), rows=[]; i+=2;
      while(i<L.length&&isRow(L[i])){ rows.push(mdCells(L[i])); i++; } i--; flush();
      out.push(`<div class="mdt"><table><thead><tr>${head.map(h=>`<th>${mdInline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${mdInline(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); }
    else buf.push(L[i]); }
  flush(); return out.join(''); }
function mdLite(t){ const parts=String(t||'').split(/```[^\n]*\n?/); return parts.map((p,i)=> i%2? `<pre>${esc(p.replace(/\n$/,''))}</pre>` : mdTables(p)).join(''); }
const stripAnsi=s=>String(s||'').replace(/\x1b\[[0-9;]*[A-Za-z]/g,'');
function flowOf(c){ if(c.cur) return c.cur.flow; const li=document.createElement('li'); li.className='solo'; const f=document.createElement('div'); f.className='flow'; li.appendChild(f); c.log.appendChild(li); return f; }
function sysBox(c,html){ const d=document.createElement('div'); d.className='sys'; d.innerHTML=html; if(c.cur) c.cur.flow.appendChild(d); else { const li=document.createElement('li'); li.appendChild(d); c.log.appendChild(li); } return d; }
function permBox(c,id,name,input){ let p=c.log.querySelector(`.perm[data-id="${cssq(id)}"]`);
  if(!p){ p=document.createElement('div'); p.className='perm'; p.dataset.id=id; flowOf(c).appendChild(p); }
  const a=LV.asks.get(id), q=name==='質問';
  if(a&&!a.decision){
    p.innerHTML=`<b>承認待ち</b><p><code>${esc(name||a.tool)}: ${esc(input||a.input)}</code></p><div class="pbtns"><button class="btn primary" type="button" data-ok>許可</button><button class="btn" type="button" data-no>拒否</button><span class="cd"></span></div><p class="s">この画面で応答がなければ、ターミナルの確認ダイアログに切り替わります。ターミナルの「ここで確認する」でも切り替えられます。</p>`;
    const go=d=>()=>api('/api/ui/answer',{id,decision:d}).catch(err=>toast('info','送れませんでした',esc(err.message)));
    p.querySelector('[data-ok]').addEventListener('click',go('allow')); p.querySelector('[data-no]').addEventListener('click',go('deny')); }
  else {
    p.innerHTML=`<b>${q?'質問への回答待ち':'承認待ち'}</b><p><code>${esc(name)}: ${esc(input)}</code></p><p class="s">${q?'ターミナルで答えてください。':a&&a.decision==='terminal'?'ターミナルの確認ダイアログに切り替えました。':'ターミナルの確認ダイアログで許可してください。'}</p>${!q&&!(LV.ap.on&&LV.ap.pairedHere)?'<button class="linkbtn" type="button" data-set>この画面から承認できるようにする</button>':''}`;
    const s=p.querySelector('[data-set]'); if(s) s.addEventListener('click',liveSettings); }
  p.dataset.name=name||''; p.dataset.input=input||''; return p; }
/* what this screen (or another) sent and the hub holds until its turn starts: merged with the bubbles shown here */
function livePending(c,list){ const mine=c.pend||(c.pend=[]), ids=new Set(list.map(p=>p.id));
  const keep=mine.filter(x=>!x.id||ids.has(x.id));            // ours the hub no longer holds have started
  for(const p of list){ let x=keep.find(y=>y.id===p.id||(p.local&&y.lid===p.local));
    const st=p.err?'err':p.queued?'queued':'sent';
    if(!x) keep.push({id:p.id,lid:p.local||null,text:p.text,t:p.t,st,err:p.err||'',other:!(p.local&&LV.lids.has(p.local))});
    else Object.assign(x,{id:p.id,st,err:p.err||''}); }
  keep.sort((a,b)=>a.t-b.t);
  const key=keep.map(x=>`${x.id||x.lid}:${x.st}:${x.err||''}`).join('|');
  c.pend=keep; if(key!==c.pendKey){ c.pendKey=key; renderPend(c); } }
const EVH={
  turn(c,ev){ foldOld(c); if(ev.cid) pendDone(c,x=>x.id===ev.cid);
    const li=document.createElement('li'); li.className='turn'; const n=ev.n||++c.turnNo; c.turnNo=Math.max(c.turnNo,n);
    li.innerHTML=`${foldHTML(n,ev.t,esc(clip1(ev.text,120)||'（続き）'),'進行中')}
      <div class="full">${youHTML(userText(ev.text||'（続き）'),ev.via==='screen'?'この画面から':'ターミナルから',ev.t)}<div class="flow">${aiHead(c,ev.t)}</div><div class="turnFt"></div></div>`;
    foldBind(li); li.dataset.turn=ev.id||'';
    c.log.appendChild(li); c.cur={li,flow:li.querySelector('.flow'),ops:0,id:ev.id};
    if(!c.role&&ev.text) c.role=clip1(ev.text,28); },
  user(c,ev){ flowOf(c).insertAdjacentHTML('beforeend',youHTML(userText(ev.text),ev.mid?'作業中にターミナルから':'ターミナルから',ev.t)); },
  say(c,ev){ const f=flowOf(c), last=f.lastElementChild; if(last&&last.classList.contains('ans')) last.insertAdjacentHTML('beforeend','<br><br>'+mdLite(ev.text)); else { const d=document.createElement('div'); d.className='ans'; d.innerHTML=mdLite(ev.text); f.appendChild(d); } },
  tool(c,ev,replay){ const f=flowOf(c); let ul=f.lastElementChild; if(!ul||!ul.classList.contains('ops')){ ul=document.createElement('ul'); ul.className='ops'; f.appendChild(ul); }
    const l=ev.link&&LINK[ev.link], li=document.createElement('li'); li.className=`op run k-${l?l.kind:'tool'}${ev.agent?' sub':''}`;
    li.innerHTML=`<span class="num">${l&&l.card?esc(l.num):''}</span><span class="v">${esc(ev.name)}</span><span class="x" title="${esc(ev.input)}">${esc(ev.input)}</span><span class="r"></span>`;
    ul.appendChild(li); c.lis.set(ev.id,li); if(c.cur&&!ev.agent) c.cur.ops++;
    if(ev.link&&ev.link.startsWith('skill:')) skUse(c,ev.link.slice(6),l&&l.src,ev.t);
    if(!replay&&l) cutin(c,l); },
  toolEnd(c,ev){ const li=c.lis.get(ev.id); if(li){ li.classList.remove('run'); li.querySelector('.r').textContent=ev.out||''; if(ev.err) li.classList.add('denied'); }
    const p=c.log.querySelector(`.perm[data-id="${cssq(ev.id)}"]`); if(p) p.remove();
    const q=c.log.querySelector(`.qcard[data-id="${cssq(ev.id)}"]:not(.done)`); if(q) qDone(q,{err:true}); },
  // Claude asks with options: answerable here and in the terminal at once
  question(c,ev,replay){ const card=qCard({id:ev.id,qs:ev.qs||[]},answers=>api('/api/ui/question',{chan:c.id,id:ev.id,answers}));
    flowOf(c).appendChild(card);
    if(!replay&&!LV.replaying&&sel!==c.num){ const q=(ev.qs&&ev.qs[0]&&ev.qs[0].q)||''; toast('ask',`ch.${c.num} ${esc(c.name)} が質問しています`,`${esc(clip1(q,80))}（押すと開いて答えられます）`,c.num); } },
  questionEnd(c,ev){ qDone(c.log.querySelector(`.qcard[data-id="${cssq(ev.id)}"]`),ev); },
  wait(c,ev){ permBox(c,ev.id,ev.name,ev.input); },
  run(c,ev){ const p=c.log.querySelector(`.perm[data-id="${cssq(ev.id)}"]`); if(p) p.remove();
    const li=c.lis.get(ev.id), n=document.createElement('li'); n.className='op note';
    n.innerHTML=`<span class="num"></span><span class="v">承認</span><span class="x">${ev.how==='screen'?'この画面で許可':'許可されました'}</span><span class="r">${hm(ev.t)}</span>`;
    if(li) li.after(n); },
  skill(c,ev){ const f=flowOf(c); let ul=f.lastElementChild; if(!ul||!ul.classList.contains('ops')){ ul=document.createElement('ul'); ul.className='ops'; f.appendChild(ul); }
    const l=LINK[`skill:${ev.name}`], li=document.createElement('li'); li.className='op k-skill'; skUse(c,ev.name,l&&l.src,ev.t);
    li.innerHTML=`<span class="num">${l&&l.card?esc(l.num):''}</span><span class="v">Skill</span><span class="x">${esc(ev.name)}</span><span class="r">読み込み</span>`; ul.appendChild(li); },
  cmd(c,ev){ const text=stripAnsi(ev.text||ev.out||'').trim(), d=document.createElement('div');
    Object.assign(d.dataset,{seq:ev.seq||'',name:ev.name||'',args:ev.args||'',via:ev.via||''}); cmdFill(d,text);
    if(c.cur) c.cur.flow.appendChild(d); else { const li=document.createElement('li'); li.appendChild(d); c.log.appendChild(li); } },
  // the line a command printed ("Set model to …"), which comes after its row: it fills that row
  cmdOut(c,ev){ const d=ev.ref&&c.log.querySelector(`.cmdo[data-seq="${cssq(ev.ref)}"]`), text=stripAnsi(ev.text).trim(); if(!text) return;
    if(d){ cmdFill(d,text); return; }
    EVH.cmd(c,{name:ev.name,args:ev.args||'',text,seq:ev.seq,via:ev.via}); },
  resumed(c,ev,replay){ c.title=ev.title||''; const name=ev.title||ev.label||''; c.role=name? clip1(name,28) : ''; resumedBox(c,{title:name,from:ev.from});
    if(!replay&&!LV.replaying) toast('info',`ch.${c.num} ${esc(c.name)} で前の会話を再開しました`,esc(cut1(name,60))||'ここから下が、その続きです。',sel===c.num?null:c.num); },
  // with what the conversation began with, when the resume could not name it
  hist(c,ev){ if(ev.label){ const r=[...c.log.querySelectorAll('.swap .rt')].pop(); if(r&&!r.textContent) r.textContent=`：${cut1(ev.label,80)}`; if(!c.role) c.role=clip1(ev.label,28); }
    histTurns(c,ev.items||[],ev.more||0); },
  model(c,ev){ const was=modelName(ev.from), to=modelName(ev.to); c.model=to; modelBox(c,{from:was,to,src:ev.src}); },
  compact(c,ev,replay){ sysBox(c,`<b>${ev.trigger==='auto'?'自動で圧縮しました':'圧縮しました'}</b><span>これまでの要点は要約として残っています。</span>`);
    if(!replay){ toast('compact',`ch.${c.num} ${esc(c.name)} を圧縮しました`,'コンテキストが空きました。',sel===c.num?null:c.num); if(sel===c.num&&!reduce) osdFlash(`${pct(c)}%<small>霧が晴れました</small>`); } },
  turnEnd(c,ev){ const t=c.cur; if(!t) return;
    t.li.querySelectorAll('.op.run').forEach(li=>{ if(!li.classList.contains('sub')||ev.aborted){ li.classList.remove('run'); li.querySelector('.r').textContent=ev.aborted?'中断':li.querySelector('.r').textContent; } });
    t.li.querySelectorAll('.perm').forEach(p=>p.remove());
    t.li.querySelectorAll('.qcard:not(.done)').forEach(d=>qDone(d,{err:true}));
    Object.assign(t.li.dataset,{ops:ev.ops!=null? ev.ops : t.ops,sec:Math.max(0,Math.round((ev.ms||0)/1000)),ab:ev.aborted?'1':''});
    turnFoot(t.li,ev.grew||0); c.cur=null; },
  grew(c,ev){ const li=c.log.querySelector(`li.turn[data-turn="${cssq(ev.id)}"]`); if(li&&li.dataset.ops!=null) turnFoot(li,ev.grew||0); },
  clear(c){ c.cur=null; sysBox(c,'<b>会話をリセットしました（/clear）</b><span>新しいセッションとして続きます。前の会話は「＋ 追加」の過去のセッションから再開できます。</span>'); },
  end(c,ev){ c.cur=null; const cmd=ev.resume? `cd ${esc(c.cwd)} && claude --resume ${esc(ev.resume)}` : '';
    sysBox(c,`<b>${ev.reason==='lost'?'このターミナルからの報告が途絶えました':`セッションは ${hm(ev.t)} に終了しました`}</b>${cmd?`<span>続きから始めるには、ターミナルで <code>${cmd}</code> を実行します。「詳細」からコピーできます。</span>`:''}`); },
  did(c,ev,replay){ if(!replay&&ev.ok===false) toast('info',`ch.${c.num}：${ev.what==='command'?'コマンド':ev.what==='compact'?'圧縮':'操作'}を実行できませんでした`,esc(ev.error||'')); },
  note(c,ev){ sysBox(c,`<span>${esc(ev.text)}</span>`); },
};
function turnFoot(li,grew){ const d=li.dataset, ab=d.ab==='1';
  li.querySelector('.turnFt').innerHTML=`<span>${d.ops}件の操作</span><span>コンテキスト +${fmt(grew)}</span><span>${d.sec}秒</span>${ab?'<span>止めました</span>':''}`;
  li.querySelector('.fold .k').textContent=`${d.ops}件の操作 · +${fmt(grew)} · ${d.sec}秒${ab?' · 中断':''}`; }
function liveEv(c,ev,replay){ try{ const f=EVH[ev.k]; if(f) f(c,ev,replay); }catch(err){ console.error(err); } tail(c); if(!replay){ scrollIf(c); dirty=true; } }
function liveReplay(c,events){ c.log.innerHTML=''; c.cur=null; c.lis=new Map(); c.turnNo=0; c.role=''; c.usedSk=new Map();
  const was=LV.replaying; LV.replaying=true; for(const ev of events) liveEv(c,ev,true); LV.replaying=was; c.pendKey=null; renderPend(c);
  for(const a of LV.asks.values()) if(a.chan===c.id&&!a.decision){ const p=c.log.querySelector(`.perm[data-id="${cssq(a.id)}"]`); permBox(c,a.id,p?p.dataset.name:a.tool,p?p.dataset.input:a.input); }
  if(sel===c.num) requestAnimationFrame(()=>{ $('chan').scrollTop=$('chan').scrollHeight; }); }
function liveAsk(a){ LV.asks.set(a.id,a); const c=LV.byId.get(a.chan); if(!c) return;
  const p=c.log.querySelector(`.perm[data-id="${cssq(a.id)}"]`); permBox(c,a.id,p?p.dataset.name:a.tool,p?p.dataset.input:a.input);
  if(!LV.replaying&&sel!==c.num) toast('wait',`ch.${c.num} ${esc(c.name)} が承認を待っています`,`${esc(a.tool)}: ${esc(a.input)}（押すと開いて許可・拒否できます）`,c.num); }
function liveAskEnd(m){ const a=LV.asks.get(m.id); if(!a) return; a.decision=m.decision; LV.asks.delete(m.id); const c=LV.byId.get(a.chan); if(!c) return;
  const p=c.log.querySelector(`.perm[data-id="${cssq(m.id)}"]`); if(!p) return;
  if(m.decision==='terminal'){ LV.asks.set(m.id,a); permBox(c,m.id,p.dataset.name,p.dataset.input); LV.asks.delete(m.id); }
  else if(m.decision==='deny'){ p.remove(); const li=c.lis.get(m.id); if(li){ const n=document.createElement('li'); n.className='op note denied'; n.innerHTML=`<span class="num"></span><span class="v">承認</span><span class="x">この画面で拒否</span><span class="r">${hm(Date.now())}</span>`; li.after(n); } }
  else if(m.decision==='gone') p.remove(); }

/* ---------------- what the person does here ---------------- */
/* how each command behaves when this page runs it, as Claude Code 2.1.293 was seen to: a skill (even one listed as
   built-in) starts a turn; a built-in not named here opens its screen in the terminal */
const LIVE_KIND={resume:'pick',model:'pick',effort:'pick',compact:'op',clear:'danger',
  context:'text',rename:'text',plan:'text','output-style':'text',copy:'text','reload-skills':'text','reload-plugins':'text',color:'text',
  goal:'turn',init:'turn',review:'turn','security-review':'turn','pr-comments':'turn','code-review':'turn',simplify:'turn',doctor:'turn',verify:'turn',
  debug:'turn',batch:'turn',loop:'turn','deep-research':'turn',run:'turn',insights:'turn',diff:'panel',recap:'term'};
const HIDE_CMD=new Set(['fog','exit','quit','login','logout','vim','terminal-setup','heapdump','stickers','mobile','passes','radio','tui','scroll-speed','focus',
  'pro-trial-expired','__remote-workflow','workflow-launch-exec','setup-bedrock','setup-vertex']);
function liveCommands(c){ return (c.commands||[]).filter(x=>!HIDE_CMD.has(x.name)&&!x.hidden).map(x=>{ const b=x.source==='builtin', k=x.skill? 'turn' : LIVE_KIND[x.name]||(b?'panel':'turn');
  return {n:x.name,d:x.description||'',k,h:x.hint||(k==='turn'?'[指示]':''),g:b?'組み込み':x.source==='plugin'?'プラグイン':x.source==='mcp'?'MCP':'スキル',src:x.plugin||''}; }); }
function cmdFill(d,text){ const x=d.dataset; d.className='cmdo'+(text?'':' panel');
  // markdown (/context's tables) is drawn as such; a plain line stays as printed
  const md=/^#{1,6} /m.test(text)||text.split('\n').some((l,i,L)=>isRow(l)&&isSep(L[i+1]||''));
  d.innerHTML=`<div class="hd"><span class="tag teal">/${esc(x.name)}${x.args?' '+esc(x.args):''}</span><span class="s">${x.via==='screen'?'この画面から実行':'ターミナルで実行'}${text?'':' · 表示はターミナルに出ています'}</span></div>${!text?'':md?`<div class="cmdmd">${mdLite(text)}</div>`:`<pre>${esc(text)}</pre>`}`; }
/* the pickers' choices, carried out in that terminal */
function liveResume(c,sid,title){ api('/api/ui/resume',{chan:c.id,sid}).then(r=>{ if(r.queued) toast('queue','再開を予約しました',`ch.${c.num} ${esc(c.name)} の今のターンが終わったら「${esc(cut1(title||sid,40))}」に切り替えます。`); })
  .catch(err=>toast('info','再開できませんでした',esc(err.message==='sid'?'会話の ID が正しくありません。':err.message))); }
function liveModel(c,o){ api('/api/ui/model',{chan:c.id,value:o}).then(r=>{ if(c.models&&!r.queued) c.models={...c.models,value:o}; toast(r.queued?'queue':'info',r.queued?'モデルの切り替えを予約しました':`ch.${c.num} ${esc(c.name)} のモデルを切り替えます`,`${esc(modelLabel(o))}${r.queued?'（今のターンが終わったら）':''}`); })
  .catch(err=>toast('info','モデルを切り替えられませんでした',esc(err.message==='model'?'このターミナルでは選べないモデルです。':err.message))); }
function liveEffort(c,x){ api('/api/ui/effort',{chan:c.id,value:x}).then(r=>{ if(!r.queued){ c.effort=x; dirty=true; } toast(r.queued?'queue':'info',r.queued?'effort の変更を予約しました':`ch.${c.num} ${esc(c.name)} の effort を変えます`,`${esc(effortLabel(x))}（${esc(x)}）${r.queued?' · 今のターンが終わったら':''}`); })
  .catch(err=>toast('info','effort を変えられませんでした',esc(err.message==='effort'?'このターミナルでは選べない値です。':err.message))); }
// shown at once as a bubble; the hub hands it to the terminal, which starts it when it is free
function liveSend(c,text){ const lid=rnd(); LV.lids.add(lid); const x={lid,text,t:Date.now(),st:'sending'}; (c.pend||(c.pend=[])).push(x); c.pendKey=null; renderPend(c);
  api('/api/ui/send',{chan:c.id,text,local:lid}).then(r=>{ x.id=x.id||r.id; if(x.st==='sending') x.st=r.queued?'queued':'sent'; c.pendKey=null; renderPend(c); })
    .catch(err=>{ x.st='err'; x.err=err.message; c.pendKey=null; renderPend(c); }); }
function liveForget(list){ api('/api/ui/forget',{chans:list.map(c=>c.id)}).then(r=>{ toast('info',`${list.length===1?`ch.${list[0].num} ${esc(list[0].name)} を`:`${r.gone||list.length} チャンネルを`}片付けました`,'セッションは残っています。「＋ 追加」の過去のセッションから戻れます。'); })
  .catch(err=>toast('info','片付けられませんでした',esc(err.message))); }
function liveCommand(c,name,args,cmd){ api('/api/ui/command',{chan:c.id,name,args:args||''}).then(r=>{
    if(cmd&&cmd.k==='panel'&&!args) toast('info',`/${esc(name)} をターミナルで開きます`,`ch.${c.num} ${esc(c.name)} のターミナルに選択画面が出ます。`);
    else if(r.queued) toast('queue',`/${esc(name)} を予約しました`,`ch.${c.num} ${esc(c.name)} の今のターンが終わったら実行します。`); })
  .catch(err=>toast('info',`/${esc(name)} を送れませんでした`,esc(err.message))); }
function liveStop(c){ if(c.status!=='work'&&c.status!=='wait') return; api('/api/ui/stop',{chan:c.id}).catch(err=>toast('info','止められませんでした',esc(err.message))); }
function liveCompact(c){ api('/api/ui/compact',{chan:c.id}).then(r=>{ if(r.queued) toast('queue','圧縮を予約しました',`ch.${c.num} ${esc(c.name)} の今のターンが終わったら圧縮します。`); })
  .catch(err=>toast('info','圧縮を送れませんでした',esc(err.message))); }
function liveSettings(){
  const live=()=>CH.filter(c=>c.status!=='off').map(c=>`ch.${c.num} ${esc(c.name)}`).join('、');
  openSheet(`<div class="hd"><span class="tag">設定</span><span class="hdR"><a class="btn small" href="/guide" target="_blank" rel="noopener">使い方</a><button class="btn small" type="button" data-close>閉じる</button></span></div>
    <h2 id="sheetT">ブラウザから承認</h2>
    <p class="sub">オンにすると、ツールを実行する前の確認を、この画面で許可・拒否できます。初期設定はオフです。オンにするときは、ターミナルに出る合言葉をここに入力して、このブラウザをつなぎます。</p>
    <div class="swrow"><span><b>この画面から承認する</b><small id="apState"></small></span><button class="sw" type="button" role="switch" id="swAp" aria-label="この画面から承認する"><i></i></button></div>
    <div class="pair" id="pair" hidden>
      <div class="pairHd"><b>ターミナルに出た合言葉を入力</b><span class="left" id="pairLeft"></span></div>
      <div class="where">
        <div class="tmock" aria-hidden="true">
          <div class="tmT"><i></i><i></i><i></i><span>Claude Code のターミナル</span></div>
          <div class="tmL">⏺ 直前の会話</div>
          <div class="tmRow"><div class="tmBand"><span class="tmK">Fogcast  ブラウザ承認の合言葉</span><span class="tmCode">••••-••••</span></div><span class="tmTag">ここ</span></div>
          <div class="tmP"><span>&gt;</span><i class="cur"></i></div>
          <div class="tmRow"><div class="tmSl">Fogcast ch.1 · <b>合言葉 ••••-••••</b> · ctx …</div><span class="tmTag">ここにも</span></div>
        </div>
        <p id="pairMsg"></p>
      </div>
      <div class="pairrow"><input id="pairIn" inputmode="numeric" autocomplete="off" placeholder="0000-0000" aria-label="合言葉"><button class="btn primary" type="button" id="bPair">つなぐ</button></div>
      <p class="err" id="pairErr" hidden></p>
      <div class="pairFt"><button class="linkbtn" type="button" id="bRe">合言葉を出し直す</button><button class="linkbtn" type="button" id="bQuit">やめる</button></div>
    </div>
    <ul class="rules">
      <li>合言葉は 5 分間だけ使えます。5 回間違えると使えなくなるので、「合言葉を出し直す」で新しいものを出してください。</li>
      <li>この画面で応答がなければ、2 分後にターミナルの確認ダイアログに切り替わります。ターミナル側の「ここで確認する」でもすぐ切り替えられます。</li>
      <li>この画面を閉じているときは、最初からターミナルで確認します。</li>
      <li>組織の設定で確認が必須になっているツールは、ターミナルでだけ承認できます。</li>
      <li>受け皿は 127.0.0.1 だけで待ち受けます。合言葉を知らない Web ページや他のプログラムは承認できません。</li>
    </ul>`);
  const END={expired:'合言葉の期限（5 分）が切れました。「合言葉を出し直す」で新しい合言葉を出せます。','cancel-terminal':'ターミナルで合言葉が取り消されました。続けるときは「合言葉を出し直す」を押してください。',
    tries:'5 回間違えたため、この合言葉は使えなくなりました。「合言葉を出し直す」で新しい合言葉を出してください。'};
  let asked=false;     // this sheet asked for a code: say so if it stops working
  const where=()=>{ const t=live(); $('pairMsg').innerHTML=`合言葉は、Claude Code を開いているターミナル${t?`（${t}）`:''}の<b>入力欄のすぐ上</b>に、黄色い枠で出ています。入力欄の下のステータスラインにも「合言葉 ••••-••••」と出ます。どのターミナルの合言葉も同じです。`; };
  const tickLeft=()=>{ const el=$('pairLeft'); if(!el) return false; const s=Math.max(0,Math.round(((LV.ap.exp||0)-Date.now())/1000));
    el.textContent= LV.ap.pairing&&s>0? `あと ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` : ''; return true; };
  const timer=setInterval(()=>{ if(!tickLeft()) clearInterval(timer); },1000);
  const state=()=>{ const on=LV.ap.on&&LV.ap.pairedHere;
    $('apState').textContent= on? 'オン · このブラウザとつながっています' : LV.ap.pairing? '合言葉を入力すると、オンになります' : LV.ap.on? 'オン · 別のブラウザとつながっています' : 'オフ · 承認はターミナルで行います';
    $('swAp').setAttribute('aria-checked',String(on||LV.ap.pairing));
    if(on){ $('pair').hidden=true; return; }
    if(LV.ap.pairing){ $('pair').hidden=false; where(); tickLeft(); }
    else if(asked&&END[LV.ap.end]){ $('pair').hidden=false; $('pairLeft').textContent=''; $('pairErr').hidden=false; $('pairErr').textContent=END[LV.ap.end]; }
    else if(!asked) $('pair').hidden=true; };
  state(); LV.onAp=()=>{ if($('apState')) state(); };
  const issue=async()=>{ $('pairErr').hidden=true;
    try{ const r=await api('/api/ui/approvals',{on:true}); asked=true; LV.ap.pairing=true; LV.ap.exp=Date.now()+300000; $('pair').hidden=false; where(); tickLeft(); $('pairIn').value=''; $('pairIn').focus();
      toast('info','合言葉をターミナルに出しました',`${(r.terminals||[]).map(t=>`ch.${t.num} ${esc(t.name)}`).join('、')} の入力欄のすぐ上を見てください。`); }
    catch(err){ $('pair').hidden=false; $('pairErr').hidden=false; $('pairErr').textContent= err.message==='no-terminal'? '合言葉を出せるターミナルがありません。ターミナルで claude を起動してから、もう一度オンにしてください。' : `合言葉を出せませんでした（${err.message}）`; } };
  $('swAp').addEventListener('click',async()=>{
    if(LV.ap.on&&LV.ap.pairedHere){ await api('/api/ui/approvals',{on:false}).catch(()=>{}); $('pair').hidden=true; toast('info','ブラウザからの承認をオフにしました','承認はターミナルで行います。'); return; }
    if(LV.ap.pairing){ $('pairIn').focus(); return; }
    issue(); });
  $('bRe').addEventListener('click',issue);
  $('bQuit').addEventListener('click',async()=>{ asked=false; await api('/api/ui/pair/cancel',{}).catch(()=>{}); $('pair').hidden=true; $('pairErr').hidden=true; });
  const tryPair=async()=>{ try{ await api('/api/ui/pair',{code:$('pairIn').value}); asked=false; $('pair').hidden=true; $('pairErr').hidden=true; toast('info','この画面から承認できるようになりました','承認待ちのチャンネルを開くと、許可・拒否のボタンが出ます。'); }
    catch(err){ $('pairErr').hidden=false; $('pairErr').textContent= err.message==='wrong'? `合言葉が違います。ターミナルの入力欄のすぐ上の表示を確かめてください${err.body&&err.body.left!=null?`（あと ${err.body.left} 回）`:''}。` : err.message==='expired'? '合言葉の期限が切れています。「合言葉を出し直す」を押してください。' : `つなげませんでした（${err.message}）`; } };
  $('bPair').addEventListener('click',tryPair); $('pairIn').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); tryPair(); } }); }
function liveAdd(){
  const dirs=[...new Set([...CH.map(c=>c.cwd),...LV.past.map(p=>tilde(p.cwd))].filter(Boolean))].slice(0,8);
  openSheet(`<div class="hd"><span class="tag teal">新しいチャンネル</span><button class="btn small" type="button" data-close>閉じる</button></div>
    <h2 id="sheetT">チャンネルを追加</h2>
    <p class="sub">VS Code のターミナルで新しいタブを開き、<code>claude</code> を起動すると、Fogcast が自動でここに新しいチャンネルとして映します。同じリポジトリで並行して作業するときは、git worktree で作業フォルダを分けるとファイルの変更がぶつかりません。</p>
    <h3>最近のフォルダ</h3><ul class="past" id="pDirs">${dirs.map((d,i)=>`<li><b>${esc(d)}</b><small>cd ${esc(d)} && claude</small><span class="btns"><button class="btn small" type="button" data-d="${i}">コマンドをコピー</button></span></li>`).join('')||'<li><small>まだありません。</small></li>'}</ul>
    <h3>過去のセッション</h3><ul class="past" id="pPast">${LV.past.slice(0,12).map((p,i)=>`<li><b>${esc(p.title||p.name||'セッション')}</b><small>${esc(tilde(p.cwd))} · ${md(p.endedAt)} ${hm(p.endedAt)} · ${esc(String(p.id).slice(0,8))}</small><span class="btns"><button class="btn small" type="button" data-p="${i}">再開コマンドをコピー</button></span></li>`).join('')||'<li><small>過去のセッションはありません。</small></li>'}</ul>`);
  $('pDirs').querySelectorAll('[data-d]').forEach(b=>b.addEventListener('click',()=>copy(`cd ${dirs[+b.dataset.d]} && claude`,b.closest('li').querySelector('small'))));
  $('pPast').querySelectorAll('[data-p]').forEach(b=>b.addEventListener('click',()=>{ const p=LV.past[+b.dataset.p]; copy(`cd ${tilde(p.cwd)} && claude --resume ${p.id}`,b.closest('li').querySelector('small')); })); }
function liveBoot(){
  liveKeys();
  const d=document.querySelector('.demo'); if(d) d.textContent='LIVE';
  $('bPause').hidden=true; $('bGuide').hidden=false;
  liveStream();
  // a key that arrives in the address of an open page (/fog in the same tab) takes effect at once
  addEventListener('hashchange',()=>{ const before=LV.token; liveKeys(); if(LV.token&&LV.token!==before){ LV.wait=600; if(LV.ctrl&&LV.connected) LV.ctrl.abort(); else liveStream(); } });
  setInterval(()=>{ if(LV.connected&&Date.now()-LV.lastMsg>45000&&LV.ctrl) LV.ctrl.abort(); },5000); }
