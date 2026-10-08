
/* ================= demo engine: one loop per terminal ================= */
const sleep=ms=>new Promise(res=>{ let left=ms; const step=()=>{ if(!G.paused) left-=100; if(left<=0) res(); else setTimeout(step,100); }; setTimeout(step,0); });
const rid=()=>Math.random().toString(16).slice(2,10);
function setStatus(c,st,now){ c.status=st; c.now=now; c.phaseAt=Date.now(); dirty=true; }
function block(c,k,label){ const now=Date.now(), b=c.blocks[c.blocks.length-1]; if(b&&!b.e) b.e=now; c.blocks.push({s:now,e:null,k,label}); }
function endBlock(c){ const b=c.blocks[c.blocks.length-1]; if(b&&!b.e) b.e=Date.now(); }
function scrollIf(c){ if(sel!==c.num) return; const v=$('chan'); requestAnimationFrame(()=>{ if(v.scrollHeight-v.scrollTop-v.clientHeight<220) v.scrollTop=v.scrollHeight; }); }
function add(c,html){ const li=document.createElement('li'); li.innerHTML=html; c.log.appendChild(li); tail(c); scrollIf(c); return li; }
/* what is waiting to be sent stays at the very bottom */
function tail(c){ const p=c.pendLi; if(p&&p.isConnected&&c.log.lastElementChild!==p) c.log.appendChild(p); }
/* the conversation as a messenger: you on the right in yellow; Claude on the left, under its framed icon */
const AV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" aria-hidden="true"><path d="M3.5 8c2.2-1.6 4.3-1.6 6.5 0s4.3 1.6 6.5 0c1.2-.9 2.4-1.1 4-.6"/><path d="M3.5 13c2.2-1.6 4.3-1.6 6.5 0s4.3 1.6 6.5 0c1.2-.9 2.4-1.1 4-.6"/><path d="M3.5 18c2.2-1.6 4.3-1.6 6.5 0s4.3 1.6 6.5 0"/></svg>';
const mdl=c=> typeof modelName==='function'? modelName(c.model) : (c.model||'');
function aiHead(c,t){ const m=mdl(c); return `<div class="aihd"><i class="av">${AV}</i><b>Claude</b><span>${esc(m)}${m&&t?' · ':''}${t?hm(t):''}</span></div>`; }
function youHTML(body,src,t,extra){ return `<div class="you"><div class="meta"><span>${src}</span>${t?`<time>${hm(t)}</time>`:''}</div><div class="body">${body}${extra||''}</div></div>`; }
/* the files a prompt from this screen named with @: what went to Claude with it, and what did not (and why) */
const ATT_ERR={missing:['見つかりません','このターミナルのフォルダにありません。'],outside:['フォルダの外','このターミナルのフォルダの外なので添付していません。Claude が必要なら自分で読みます。'],
  binary:['テキストでない','画像やバイナリは添付していません。Claude が必要なら Read で読みます。'],large:['大きすぎます','1 MB を超えるので添付していません。Claude が必要なら Read で読みます。'],
  budget:['上限超え','ほかのファイルで添付の上限（20 万字）に達したので、添付していません。'],refused:['添付できません','Claude Code が受け付けませんでした。']};
function filesHTML(files){ if(!files||!files.length) return '';
  return `<div class="att"><span class="ak">添付</span>${files.map(f=>{ const e=f.err&&ATT_ERR[f.err];
    if(f.err) return `<span class="af bad" title="${esc(e?e[1]:f.err)}">@${esc(f.p)}<small>${esc(e?e[0]:f.err)}</small></span>`;
    const n= f.kind==='dir'? `${fmtN(f.lines||0)} 件` : f.shown&&f.lines&&f.shown<f.lines? `${fmtN(f.shown)} / ${fmtN(f.lines)} 行` : `${fmtN(f.lines||0)} 行`;
    return `<span class="af" title="${f.kind==='dir'?'フォルダの中の一覧':'ファイルの中身'}を、この依頼といっしょに Claude に渡しました">@${esc(f.p)}<small>${n}</small></span>`; }).join('')}</div>`; }
function foldHTML(n,t,preview,k){ return `<button class="fold" type="button" aria-expanded="true"><span class="tn">ターン ${n}</span>${t?`<span class="tm">${hm(t)}</span>`:''}<span class="p">${preview}</span><span class="k">${k}</span><span class="chev" aria-hidden="true"></span></button>`; }
/* a turn's header opens and closes it; one the person opened or closed by hand stays as they left it */
function foldBind(li){ const b=li.querySelector('.fold'); b.setAttribute('aria-expanded',String(!li.classList.contains('folded')));
  b.addEventListener('click',()=>{ const f=li.classList.toggle('folded'); b.setAttribute('aria-expanded',String(!f)); li.dataset.hand='1'; }); }
/* the latest turns stay open (the new one and the two before it); a new turn folds the one that falls out */
const KEEP_OPEN=3;
function foldOld(c){ const ts=[...c.log.querySelectorAll('.turn')];
  ts.slice(0,Math.max(0,ts.length-(KEEP_OPEN-1))).forEach(li=>{ if(li.dataset.hand||li.classList.contains('folded')) return;
    li.classList.add('folded'); const b=li.querySelector('.fold'); if(b) b.setAttribute('aria-expanded','false'); }); }
function task(c,t){ if(t.create&&!c.tasks.length) t.create.forEach(x=>c.tasks.push({t:x,st:'todo'}));
  if(t.done!=null&&c.tasks[t.done]) c.tasks[t.done].st='done'; if(t.start!=null&&c.tasks[t.start]&&c.tasks[t.start].st!=='done') c.tasks[t.start].st='doing'; }
function use(id,c,ev){ let l=LINK[id];
  if(!l&&ALLK[id]){ l=ALLK[id]; LINKS.push(l); LINK[id]=l; }   // everywhere's skills and agents join コミュ when first called
  if(!l) return; if(l.kind==='skill') skUse(c,l.label||id,l.src,Date.now()); l.uses++; l.today++; l.last=Date.now(); l.byCh[c.num]=(l.byCh[c.num]||0)+1;
  l.recent.push({t:Date.now(),n:c.num,x:ev.x||'',r:ev.r||''}); if(l.recent.length>30) l.recent.shift();
  if(l.kind==='core') return;
  stUse(l);
  if(!l.card&&giveCard(l)) buildDeck();
  const r=rankOf(l.uses);
  if(r>l.rank){ const first=l.rank===0; l.rank=r; const o=cardEls[l.id]; if(o){ o.el.classList.remove('up'); void o.el.offsetWidth; o.el.classList.add('up'); }
    const nx=toNext(l.uses);
    if(first) toast('up',`${cardHead(l)} を初めて使いました`,`コミュに加わりました（ランク 1${l.card?'':'。カードは種類ごとに 14 枚までなので「一覧」に並びます'}）。ch.${c.num} ${esc(c.name)} で使用。`);
    else toast('up',`${cardHead(l)} がランク ${r} に`,`通算 ${l.uses} 回。${nx!=null?`次のランクまで あと ${nx} 回。`:'最高ランクです。'}`); } }
function spend(c,d,inCtx,st){ const a=d*1000;
  if(inCtx){ c.ctx=Math.min(WIN,c.ctx+a); if(st) st.tok+=a; }
  c.tok+=a*2.4+c.ctx*.004; c.cost+=a*1.2e-5+c.ctx*2.2e-7;
  G.five.pc=Math.min(100,G.five.pc+d*.045); G.seven.pc=Math.min(100,G.seven.pc+d*.005);
  [['five','5時間枠',G.five],['seven','週の枠',G.seven]].forEach(([k,lab,o])=>[80,90].forEach(th=>{ const key=k+th; if(o.pc>=th&&!G.warned[key]){ G.warned[key]=1; toast('wx',`${lab}が ${th}% を超えました`,`全チャンネル合計の値です。リセットは ${k==='five'?hm(o.resetAt):md(o.resetAt)+'（'+wkd(o.resetAt)+'）'}。`); } }));
  if(pct(c)>=85&&!c.warned85){ c.warned85=true; const tl=turnsLeft(c); toast('info',`ch.${c.num} ${esc(c.name)} のコンテキストが ${pct(c)}% です`,`${tl!=null?`あと約 ${tl} ターンで自動で圧縮されます。`:''}「圧縮」で先に空けられます。`,c.num); }
  dirty=true; }
function osdFlash(html){ const o=$('osdBig'); o.innerHTML=html; o.classList.add('on'); clearTimeout(osdFlash.t); osdFlash.t=setTimeout(()=>o.classList.remove('on'),1100); }
function compact(c,manual){ const before=pct(c); c.ctx=Math.round(WIN*(.05+Math.random()*.03)); c.warned85=false;
  add(c,`<div class="sys"><b>${manual?'圧縮しました':'自動で圧縮しました'}</b><span>コンテキストを ${before}% から ${pct(c)}% まで空けました。これまでの要点は要約として残っています。</span></div>`);
  toast('compact',`ch.${c.num} ${esc(c.name)} を圧縮しました`,`コンテキスト ${before}% → ${pct(c)}%`,sel===c.num?null:c.num);
  if(sel===c.num&&!reduce) osdFlash(`${before}%<small>→ ${pct(c)}%　霧が晴れました</small>`); dirty=true; }
let cutAt=0; const cut={cv:null,l:null,until:0};
function cutin(c,l){ if(!l||!l.card||reduce||sel!==c.num||Date.now()-cutAt<1500) return; cutAt=Date.now();
  const el=$('cutin'); el.innerHTML=`<span class="card k-${l.kind}${l.card==='minor'?' minor':''}">${cardFace(l)}</span><span class="lbl"><span class="tag">${esc(l.label)}</span></span>`;
  cut.l=l; cut.cv=el.querySelector('canvas'); cut.until=Date.now()+2100;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); requestAnimationFrame(()=>sizeCanvas(cut.cv)); }
function typeInto(el,html,c,tid){ return new Promise(res=>{ const txt=strip(html); let i=0; el.classList.add('typing');
  if(reduce){ el.innerHTML=html; el.classList.remove('typing'); return res(); }
  const iv=setInterval(()=>{ if(G.paused) return;
    if(tid!==c.turnId){ clearInterval(iv); el.classList.remove('typing'); el.textContent=txt.slice(0,i)+' …（中断）'; return res(); }
    i+=2; el.textContent=txt.slice(0,i); scrollIf(c);
    if(i>=txt.length){ clearInterval(iv); el.innerHTML=html; el.classList.remove('typing'); res(); } },28); }); }

/* approvals: the terminal's dialog by default; this screen only when the person turned it on and paired */
async function perm(c,ev,ops,tid){
  const viaBrowser=G.ap.on&&G.ap.paired;
  const p=document.createElement('div'); p.className='perm';
  p.innerHTML= viaBrowser
    ? `<b>承認待ち</b><p><code>${esc(ev.v)}: ${esc(ev.x)}</code></p>
       <div class="pbtns"><button class="btn primary" type="button" data-ok>許可</button><button class="btn" type="button" data-no>拒否</button><span class="cd"></span></div>
       <p class="s">この画面で応答がなければ、ターミナルの確認ダイアログに切り替わります（実際は 2 分、デモでは 20 秒）。</p>`
    : `<b>承認待ち</b><p><code>${esc(ev.v)}: ${esc(ev.x)}</code></p><p class="s">ターミナルの確認ダイアログで許可してください。（デモでは 8 秒後に許可されます）</p><button class="linkbtn" type="button" data-set>この画面から承認できるようにする</button>`;
  ops.after(p); scrollIf(c);
  setStatus(c,'wait',`承認待ち：<b>${esc(ev.v)}</b> <code>${esc(ev.x)}</code>${viaBrowser?' · 開いて承認できます':''}`); block(c,'wait',ev.x);
  if(sel!==c.num) toast('wait',`ch.${c.num} ${esc(c.name)} が承認を待っています`,`${esc(ev.v)}: ${esc(ev.x)}（押すと開きます）`,c.num);
  let r='ok';
  if(viaBrowser){
    r=await new Promise(res=>{ let left=20; const cd=p.querySelector('.cd'); cd.textContent=`あと ${left} 秒でターミナルへ`;
      const iv=setInterval(()=>{ if(G.paused) return; left--; cd.textContent=`あと ${left} 秒でターミナルへ`; if(left<=0||tid!==c.turnId){ clearInterval(iv); res('term'); } },1000);
      p.querySelector('[data-ok]').addEventListener('click',()=>{ clearInterval(iv); res('ok'); });
      p.querySelector('[data-no]').addEventListener('click',()=>{ clearInterval(iv); res('no'); }); });
    if(r==='term'&&tid===c.turnId){ p.querySelector('.pbtns').remove(); p.querySelector('.s').textContent='応答がなかったので、ターミナルの確認ダイアログに切り替えました。（デモでは 8 秒後に許可されます）'; await sleep(8000); r='term-ok'; }
  } else { p.querySelector('[data-set]').addEventListener('click',openSettings); await sleep(8000); }
  p.remove(); if(tid!==c.turnId) return 'stop';
  const how= r==='ok'&&viaBrowser? 'この画面で許可' : r==='no'? 'この画面で拒否' : 'ターミナルで許可';
  const li=document.createElement('li'); li.className=`op note${r==='no'?' denied':''}`; li.innerHTML=`<span class="num"></span><span class="v">承認</span><span class="x">${how}</span><span class="r">${hm(Date.now())}</span>`; ops.appendChild(li);
  if(r==='no'){ block(c,'work',ev.x); setStatus(c,'work',`<b>${esc(ev.v)}</b> は拒否されました`); return 'no'; }
  block(c,'work',ev.x); setStatus(c,'work', viaBrowser&&r==='ok'? 'この画面で許可しました' : '許可されました'); return 'ok'; }
async function op(c,ev,ops,st,tid,sub){
  const id=ev.link||ev.id, l=LINK[id]||ALLK[id], kind=l?l.kind:'tool';
  const li=document.createElement('li'); li.className=`op run k-${kind}${sub?' sub':''}`;
  li.innerHTML=`<span class="num">${l?esc(l.num==='—'?'':l.num):''}</span><span class="v">${esc(ev.v)}</span><span class="x" title="${esc(ev.x)}">${esc(ev.x)}</span><span class="r"></span>`;
  ops.appendChild(li); scrollIf(c);
  c.active=id; c.ops.push(id); if(c.ops.length>20) c.ops.shift(); if(l) l.live.add(c.num);
  setStatus(c,'work',`<b>${esc(ev.v)}</b> を実行中：<code>${esc(ev.x)}</code>`); cutin(c,l); st.ops++;
  if(ev.sub){ const ag={type:l?l.label:ev.v,desc:ev.x.split('：')[1]||ev.x,st:'run'}; c.agents.push(ag); dirty=true;
    for(const sb of ev.sub){ await sleep(900); if(tid!==c.turnId) return; await op(c,sb,ops,st,tid,true); if(tid!==c.turnId) return; c.active=id; if(l) l.live.add(c.num); }
    ag.st='done'; }
  await sleep(sub? 750 : 900+Math.random()*900);
  if(l) l.live.delete(c.num);
  if(tid!==c.turnId) return;
  li.classList.remove('run'); li.querySelector('.r').textContent=ev.r||'';
  use(id,c,ev);
  if(ev.f){ const f=c.files[ev.f]||(c.files[ev.f]={add:0,del:0}); f.add+=ev.add||0; f.del+=ev.del||0; }
  spend(c,ev.d||(sub?.9:1),!sub,st); await sleep(300); }
/* a question in the demo: answered on this screen, or (after a while) "in the terminal" with its first option */
async function demoAsk(c,ev,ops,tid){
  const q={id:rid(),qs:ev.ask.qs}, li=document.createElement('li'); li.className='op k-tool';
  li.innerHTML=`<span class="num"></span><span class="v">AskUserQuestion</span><span class="x">${esc(q.qs[0].q)}</span><span class="r"></span>`; ops.appendChild(li);
  let answer=null; const card=qCard(q,async a=>{ await sleep(500); answer=a; });
  ops.after(card); scrollIf(c);
  c.ask=q.id; setStatus(c,'wait',`質問：<b>${esc(q.qs[0].q)}</b>`); block(c,'wait',q.qs[0].q);
  if(sel!==c.num) toast('ask',`ch.${c.num} ${esc(c.name)} が質問しています`,`${esc(q.qs[0].q)}（押すと開いて答えられます）`,c.num);
  for(let i=0;i<150&&!answer&&tid===c.turnId;i++) await sleep(300);      // about 30 s (paused time not counted), then the terminal answers
  c.ask=null; if(tid!==c.turnId){ qDone(card,{err:true}); return; }
  const by=answer?'screen':'terminal', A={};
  q.qs.forEach((x,i)=>{ const a=answer&&answer[i]; A[x.q]= a? [...a.pick.map(k=>x.opts[k].l),...(a.text?[a.text]:[])].join(', ') : x.opts[0].l; });
  qDone(card,{by,answers:A}); li.querySelector('.r').textContent=Object.values(A).join(' / ');
  block(c,'work',q.qs[0].q); setStatus(c,'work',by==='screen'?'この画面で答えました':'質問に答えました'); await sleep(700); }
async function turn(c,T,text,byUser,files){
  const tid=++c.turnId, t0=Date.now(), num=++c.turnNo;
  foldOld(c); c.suggest='';
  const li=document.createElement('li'); li.className='turn';
  li.innerHTML=`${foldHTML(num,t0,esc(strip(text)),'進行中')}
    <div class="full">${youHTML(text,byUser?'この画面から':'ターミナルから',t0,filesHTML(files))}<div class="flow">${aiHead(c,t0)}<ul class="ops"></ul><div class="ans"></div></div><div class="turnFt"></div></div>`;
  foldBind(li);
  c.log.appendChild(li); tail(c); scrollIf(c);
  const ops=li.querySelector('.ops'), ans=li.querySelector('.ans'), st={ops:0,tok:0};
  c.ops=[]; setStatus(c,'work','依頼を受け取りました'); block(c,'work',strip(text)); spend(c,1.2,true,st);
  await sleep(900); if(tid!==c.turnId) return;
  for(const ev of T.events){ if(tid!==c.turnId) return;
    if(ev.task){ task(c,ev.task); dirty=true; await sleep(450); continue; }
    if(ev.ask){ await demoAsk(c,ev,ops,tid); if(tid!==c.turnId) return; continue; }
    if(ev.perm){ const r=await perm(c,ev,ops,tid); if(tid!==c.turnId) return;
      if(r==='no'){ const d=document.createElement('li'); d.className='op denied'; d.innerHTML=`<span class="num"></span><span class="v">${esc(ev.v)}</span><span class="x">${esc(ev.x)}</span><span class="r">拒否のため実行せず</span>`; ops.appendChild(d); await sleep(600); continue; } }
    await op(c,ev,ops,st,tid,false); }
  if(tid!==c.turnId) return;
  c.active=null; setStatus(c,'work','返答を書いています');
  await typeInto(ans,(byUser?'（デモのため、実際の返答の代わりに用意した作業を再生しています）':'')+T.answer,c,tid);
  if(tid!==c.turnId) return;
  spend(c,.6+strip(T.answer).length/400,true,st);
  const sec=Math.round((Date.now()-t0)/1000);
  li.querySelector('.turnFt').innerHTML=`<span>${st.ops}件の操作</span><span>コンテキスト +${fmt(st.tok)}</span><span>${sec}秒</span>`;
  li.querySelector('.fold .k').textContent=`${st.ops}件の操作 · +${fmt(st.tok)} · ${sec}秒`;
  c.perTurn.push(st.tok); if(c.perTurn.length>40) c.perTurn.shift();
  endBlock(c); use('claude',c,{x:strip(text).slice(0,48),r:`${st.ops}件の操作`}); stTurn(st.tok*6);
  setStatus(c,'idle','入力待ち');
  // Claude Code's guess at the next prompt: in the demo, the next one its script has
  if(!c.queue.length&&c.script.length) c.suggest=strip(c.script[c.idx%c.script.length].prompt);
  if(c.ctx>WIN*.95) compact(c,false); }

/* ================= your status in the demo: twelve days in, growing as the demo's turns finish (the live screen gets it from the hub) ================= */
const XPR={turn:10,tok:1e4,day:50,streak:10,streakMax:7,first:30}, ST_RANKS=[10,50,200,600,1500], LV_MAX=99;
const lvFloor=lv=>50*lv*(lv-1), toLv=e=>{ let lv=1; while(lv<LV_MAX&&lvFloor(lv+1)<=e) lv++; return lv; };
const ST_DEF=[['inq','調査','調べる'],['make','構築','書く'],['run','実行','動かす'],['lead','段取り','任せる'],['ext','拡張','広げる']];
const statOf=l=> /^(Read|Grep|Glob|WebSearch|WebFetch|ToolSearch|LSP|Explore)$/.test(l.id)? 'inq' : /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(l.id)? 'make'
  : /^(Bash|PowerShell|Monitor|TaskStop|EnterWorktree|ExitWorktree)$/.test(l.id)? 'run' : l.kind==='agent'||/^(Tasks|ExitPlanMode|EnterPlanMode|AskUserQuestion)$/.test(l.id)? 'lead'
  : l.kind==='skill'||l.kind==='mcp'? 'ext' : null;
const DST={since:dayStart(Date.now())-11*DAY, exp:6480, turns:418, tok:9.62e6, usd:58.4, days:11, streak:6, best:6,
  first:new Set(LINKS.filter(l=>l.uses>0&&l.kind!=='core').map(l=>l.id)), stats:{inq:640,make:410,run:520,lead:150,ext:96},
  n:Object.fromEntries(LINKS.filter(l=>l.kind!=='core'&&l.uses>0).map(l=>[l.id,l.uses])),
  past:[260,380,420,310,90,0,450,500,470,520,480], today:{vol:110,habit:100,first:0,done:8,tok:300000}};      // 8 turns × 10 + 300,000 tokens / 10,000
function demoStatus(){ const D=DST, lv=toLv(D.exp), t=D.today, today=dayStart(Date.now());
  return {since:D.since,lv,max:LV_MAX,exp:D.exp,from:lvFloor(lv),to:lv>=LV_MAX?null:lvFloor(lv+1),
    today:{xp:t.vol+t.habit+t.first,vol:t.vol,habit:t.habit,first:t.first,done:t.done,tok:t.tok},
    stats:ST_DEF.map(([k,n,say])=>{ const p=Math.round(D.stats[k]||0), r=ST_RANKS.filter(v=>p>=v).length; return {k,n,say,p,r,at:r?ST_RANKS[r-1]:0,to:ST_RANKS[r]??null}; }),
    rec:{days:D.days,streak:D.streak,best:D.best,turns:D.turns,tok:D.tok,usd:D.usd,kinds:D.first.size},
    top:Object.entries(D.n).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,n])=>({id,n,label:(ALLK[id]||{}).label||id,kind:(ALLK[id]||{}).kind||'tool'})),
    hist:[...D.past.map((xp,i)=>({d:dk(today-(D.past.length-i)*DAY),xp})).filter(h=>h.xp>0),{d:dk(today),xp:t.vol+t.habit+t.first}],
    rules:XPR, ranks:ST_RANKS}; }
function stChanged(){ const prev=G.status; G.status=demoStatus(); if(prev&&G.status.lv>prev.lv) lvUp(G.status); dirty=true; }
function stGain(kind,n){ if(n>0){ DST.today[kind]+=n; DST.exp+=n; } }
function stUse(l){ if(LIVE) return; const k=statOf(l); if(k) DST.stats[k]+=l.kind==='agent'?3:l.kind==='skill'?2:1;
  DST.n[l.id]=(DST.n[l.id]||0)+1; if(!DST.first.has(l.id)){ DST.first.add(l.id); stGain('first',XPR.first); } stChanged(); }
function stTurn(tok){ if(LIVE) return; const t=DST.today; t.done++; t.tok+=tok; DST.turns++; DST.tok+=tok; DST.usd+=tok*1.1e-6;
  stGain('vol',t.done*XPR.turn+Math.floor(t.tok/XPR.tok)-t.vol); stChanged(); }
if(!LIVE) G.status=demoStatus();

/* ================= slash commands, as $.command.run would run them ================= */
function cmdScript(name,args){
  const S={
    init:{events:[{id:'Read',v:'Read',x:'package.json',r:'48 行',d:.8},{id:'Grep',v:'Grep',x:'"scripts" in .',r:'6 件',d:.5},{id:'Write',v:'Write',x:'CLAUDE.md',r:'+42',f:'CLAUDE.md',add:42,d:1.2}],answer:'リポジトリの構成とよく使うコマンドを読み取り、<code>CLAUDE.md</code> にまとめました。'},
    'code-review':{events:[{id:'Skill',link:'code-review',v:'Skill',x:'code-review',r:'読み込み',d:.9},{id:'Bash',v:'Bash',x:'git diff main...HEAD',r:'5 files',d:2.2},{id:'Agent',link:'reviewer',v:'Agent',x:'reviewer：変更を確認',r:'指摘 2 件',d:1.8,sub:[{id:'Read',v:'Read',x:'src/lib/http.ts',r:'98 行'},{id:'Grep',v:'Grep',x:'"keepAlive" in src/',r:'3 件'}]}],answer:'5 ファイルの変更を確認しました。指摘は 2 件で、どちらもタイムアウト値を定数にまとめる提案です。'},
    debug:{events:[{id:'Skill',link:'debug',v:'Skill',x:'debug',r:'読み込み',d:.8},{id:'Grep',v:'Grep',x:'"Error" in logs/',r:'14 件',d:.9},{id:'Read',v:'Read',x:'src/orders/client.ts',r:'210 行',d:2.1},{id:'Bash',v:'Bash',x:'npm test -- orders',r:'1 failed',d:1.4}],answer:'失敗しているのは注文の再送テスト 1 件で、モックの待ち時間が短すぎるのが原因でした。'},
    verify:{events:[{id:'Skill',link:'verify',v:'Skill',x:'verify',r:'読み込み',d:.7},{id:'Bash',v:'Bash',x:'npm test',r:'22 passed',d:1.6,perm:true},{id:'Bash',v:'Bash',x:'npm run build',r:'ok',d:.8}],answer:'テスト 22 件とビルドが通ることを確かめました。'},
    'commit-message':{events:[{id:'Skill',link:'commit-message',v:'Skill',x:'commit-message',r:'読み込み',d:.6},{id:'Bash',v:'Bash',x:'git diff --staged',r:'2 files',d:1.1},{id:'Bash',v:'Bash',x:'git commit -m "…"',r:'1 commit',d:.4,perm:true}],answer:'ステージされた 2 ファイルの変更から、コミットメッセージを書いてコミットしました。'},
    'mcp__github__review_pr':{events:[{id:'mcp__github__get_pull_request',link:'github',v:'github',x:`get_pull_request ${args||'#42'}`,r:'12 files',d:3.1},{id:'Read',v:'Read',x:'web/calendar.ts',r:'138 行',d:1.2},{id:'mcp__github__create_review',link:'github',v:'github',x:'create_review',r:'コメント 3 件',d:.6}],answer:'PR を読み、3 件のコメントを付けてレビューを送りました。'},
    'mcp__linear__triage':{events:[{id:'mcp__linear__list_issues',link:'linear',v:'linear',x:'list_issues（未振り分け）',r:'7 件',d:1.9},{id:'mcp__linear__update_issue',link:'linear',v:'linear',x:'update_issue × 7',r:'完了',d:.8}],answer:'未振り分けの課題 7 件に担当とラベルを付けました。'},
  };
  if(S[name]) return S[name];
  const l=ALLK[name];
  return {events:[{id:'Skill',link:name,v:'Skill',x:name,r:'読み込み',d:l&&l.dt? Math.max(.6,l.dt/120) : 1},{id:'Read',v:'Read',x:'README.md',r:'84 行',d:.8},{id:'Edit',v:'Edit',x:'docs/notes.md',r:'+12',f:'docs/notes.md',add:12,d:.9}],answer:`<code>${esc(name)}</code> の手順に沿って進めました（デモ用の返答です）。`};
}
function cmdText(c,name){
  if(name==='usage') return `このセッション  ${fmt(c.tok)} トークン · $${c.cost.toFixed(2)}\n5時間枠        ${G.five.pc.toFixed(0)}%（リセット ${hm(G.five.resetAt)}）\n週の枠          ${G.seven.pc.toFixed(0)}%（リセット ${md(G.seven.resetAt)} ${hm(G.seven.resetAt)}）`;
  if(name==='context'){ const B=breakdown(c); return B.map(b=>`${b.n.padEnd(14,'　')} ${fmt(b.v).padStart(7)}  ${(b.v/WIN*100).toFixed(1)}%`).join('\n')+`\n${'空き'.padEnd(14,'　')} ${fmt(WIN-c.ctx).padStart(7)}  ${((WIN-c.ctx)/WIN*100).toFixed(1)}%`; }
  if(name==='reload-skills') return `スキルを読み込み直しました（${c.loaded.skills.length} 件）。`;
  if(name==='fog') return 'Fogcast の画面をブラウザで開きました。開いていなければ、この下の URL を開いてください。\n\n鍵つきの URL（この画面にだけ出ています）:\n\nhttp://127.0.0.1:4317/#k=…（あなたの鍵）';
  return '「/」でこのチャンネルのコマンドを一覧できます。組み込みのコマンド、スキル、MCP のプロンプトが並びます。';
}
function cmdOut(c,name,args,text){ add(c,`<div class="cmdo"><div class="hd"><span class="tag teal">/${esc(name)}${args?' '+esc(args):''}</span><span class="s">コマンドの結果</span></div><pre>${esc(text)}</pre></div>`); }
async function runCmd(c,it){ const {name,args,k}=it;
  if(k==='turn'){ await turn(c,cmdScript(name,args),esc('/'+name+(args?' '+args:'')),false); return; }
  if(k==='op'){ compact(c,true); return; }
  if(k==='danger'){ clearChannel(c); return; }
  if(k==='pick'){ if(name==='resume'&&it.x) demoResume(c,it.x); return; }
  if(k==='panel'){
    add(c,`<div class="cmdo panel"><div class="hd"><span class="tag">/${esc(name)}</span><span class="s">ターミナルで開きました</span></div><p>このコマンドは選択画面を開くので、ターミナル側に表示されます。操作が終わると、結果はこの画面にも映ります。</p></div>`);
    toast('info',`/${esc(name)} をターミナルで開きました`,`ch.${c.num} ${esc(c.name)} のターミナルに選択画面が出ています。`); return; }
  cmdOut(c,name,args,cmdText(c,name)); }
function queueCmd(c,name,args){ const cmd=commandsFor(c).find(x=>x.n===name);
  if(!cmd){ toast('info',`/${esc(name)} はこのチャンネルにありません`,'「/」で、このチャンネルで使えるコマンドを一覧できます。'); return false; }
  if(cmd.k==='danger'){ confirmClear(c); return true; }
  if(cmd.k==='term'){ toast('info',`/${esc(name)} はターミナルで打ってください`,'Claude Code は、このコマンドを本人がターミナルで打ったときだけ実行します。'); return true; }
  if(cmd.k==='pick'){ if(args) pickArgs(c,name,args); else openPick(c,name); return true; }
  if(LIVE){ liveCommand(c,name,args,cmd); return true; }
  c.queue.push({type:'cmd',name,args,k:cmd.k});
  if(c.status!=='idle') toast('queue',`/${esc(name)} を予約しました`,`ch.${c.num} ${esc(c.name)} の今のターンが終わったら実行します。`);
  return true; }
function confirmClear(c){
  openSheet(`<div class="hd"><span class="tag">確認</span><button class="btn small" type="button" data-close>やめる</button></div>
    <h2 id="sheetT">ch.${c.num} ${esc(c.name)} の会話をリセットしますか？</h2>
    <p class="sub"><code>/clear</code> を実行すると、新しいセッションとして始まります。今の会話は「過去のセッション」に残るので、<code>/resume</code> で戻れます。</p>
    <div class="btns"><button class="btn primary" type="button" id="bClearOk">リセットする</button><button class="btn" type="button" data-close>やめる</button></div>`);
  $('bClearOk').addEventListener('click',()=>{ closeSheet(); if(LIVE){ liveCommand(c,'clear','',{k:'danger'}); return; } if(c.status==='idle') clearChannel(c); else { c.queue.push({type:'cmd',name:'clear',args:'',k:'danger'}); toast('queue','/clear を予約しました','今のターンが終わったらリセットします。'); } }); }
function clearChannel(c){ const old=c.sid||rid(), last=[...c.log.querySelectorAll('.turn .fold .p')].pop();
  PAST.unshift({n:last? last.textContent.slice(0,24) : c.role,cwd:c.cwd,t:`今日 ${hm(Date.now())}`,id:old}); c.sid=rid();
  c.log.innerHTML=''; c.turnNo=0; c.perTurn=[]; c.tasks=[]; c.files={}; c.agents=[]; c.ops=[]; c.ctx=Math.round(WIN*.025); c.warned85=false; c.resume=null;
  add(c,`<div class="sys boot"><b>会話をリセットしました</b><span>新しいセッションとして始まりました。前の会話は「＋ 追加」の過去のセッションから戻れます（再開 ID ${old}）。</span></div>`);
  toast('info',`ch.${c.num} ${esc(c.name)} をリセットしました`,'新しいセッションとして続きます。'); setStatus(c,'idle','入力待ち'); }

/* ================= /resume, /model and /effort: chosen here, carried out in the terminal ================= */
const cut1=(s,n)=>{ s=String(s||'').replace(/\s+/g,' ').trim(); return s.length>n? s.slice(0,n-1)+'…' : s; };
const MODEL_LABEL={default:'既定（おすすめ）',opus:'Opus',sonnet:'Sonnet',haiku:'Haiku',fable:'Fable',best:'いちばん賢いモデル',opusplan:'計画は Opus、実装は Sonnet'};
const MODEL_NOTE={default:'Claude Code が選ぶ既定のモデル',opus:'ふだんの複雑な作業に',sonnet:'決まった作業を手早く',haiku:'短い質問にいちばん速く',fable:'いちばん難しい、長い作業に',best:'使える中でいちばん賢いモデル',opusplan:'計画モードのあいだは Opus、そのほかは Sonnet'};
function modelLabel(o){ const m=/^(.*?)(\[1m\])?$/.exec(String(o||'')); const base=MODEL_LABEL[m[1]]||m[1]; return m[2]? `${base}（100 万トークン）` : base; }
const EFFORT_LABEL={low:'低い',medium:'ふつう',high:'高い',xhigh:'とても高い',max:'最大',auto:'おまかせ'};
const EFFORT_NOTE={low:'速く、トークンを抑える',medium:'ふだんの作業に',high:'丁寧に。確かめも厚く',xhigh:'high より深く考える',max:'いちばん深く考える',auto:'作業に合わせて Claude Code が決める'};
function effortLabel(e){ return EFFORT_LABEL[e]||e||'—'; }
function sinceTxt(ms){ const m=Math.max(0,Math.round(ms/60000)); if(m<1) return 'たった今'; if(m<60) return `${m} 分前`; const h=Math.round(m/60); if(h<24) return `${h} 時間前`; const d=Math.round(h/24); return d<7? `${d} 日前` : md(Date.now()-ms); }
const kb=n=> n>=1e6? `${(n/1e6).toFixed(1)} MB` : `${Math.max(1,Math.round(n/1e3))} KB`;
const modelsOfCh=c=>(LIVE? c.models : (c.models||DEMO_MODELS))||{options:[],value:''};
const effortsOfCh=c=>(LIVE&&c.efforts&&c.efforts.length? c.efforts : DEMO_EFFORTS);
function openPick(c,name){ if(!c||c.status==='off') return; if(name==='resume') openResume(c); else if(name==='model') openModel(c); else if(name==='effort') openEffort(c); }
const busyNote=c=> c.status==='work'||c.status==='wait'? '<p class="pnote">いまは作業中です。選ぶと、今のターンが終わってから切り替わります。</p>' : '';
// /model sonnet, /effort high, /resume <id>: the value is taken as the picker would take it
function pickArgs(c,name,args){ const a=args.trim(), lo=a.toLowerCase();
  if(name==='model'){ const o=modelsOfCh(c).options.find(x=>x.toLowerCase()===lo); if(o){ doModel(c,o); return; } }
  if(name==='effort'&&effortsOfCh(c).includes(lo)){ doEffort(c,lo); return; }
  if(name==='resume'){
    if(LIVE){ if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a)) liveResume(c,a,''); else liveCommand(c,'resume',a,{k:'text'}); return; }
    const x=(DEMO_CONVOS[c.cwd]||[]).find(y=>y.id===a||y.id.startsWith(lo)||y.title===a); if(x){ doResume(c,x); return; } }
  if(LIVE){ liveCommand(c,name,a,{k:'text'}); return; }
  toast('info',`/${esc(name)} ${esc(a)} は見つかりませんでした`,`「/${esc(name)}」だけで送ると、この画面で一覧から選べます。`); }

function openResume(c){
  openSheet(`<div class="hd"><span class="tag teal">再開</span><button class="btn small" type="button" data-close>閉じる</button></div>
    <h2 id="sheetT">ch.${c.num} ${esc(c.name)} で前の会話に戻る</h2>
    <p class="sub">このフォルダ（<code>${esc(c.cwd)}</code>）で前に話した会話です。選ぶと、ターミナルで <code>/resume</code> したのと同じく、このチャンネルが選んだ会話の続きになります。今の会話は残るので、あとでまたここから戻れます。</p>
    ${busyNote(c)}
    <input class="psearch" id="rsQ" type="search" placeholder="名前や依頼の言葉で絞り込む" aria-label="会話を絞り込む" autocomplete="off">
    <ul class="plist" id="rsList"><li class="pempty">読み込んでいます…</li></ul>
    <div class="pfoot"><p class="sub">ほかのフォルダの会話は、そのフォルダで起動したターミナルのチャンネルから戻れます。開いているターミナルがなければ、「＋ 追加」の過去のセッションから再開コマンドをコピーできます。</p>
      <button class="btn small" type="button" id="rsTerm">ターミナルの一覧で選ぶ</button></div>`,'pick');
  // the terminal's own /resume list, for whatever this one does not show
  $('rsTerm').addEventListener('click',()=>{ closeSheet(); if(LIVE) liveCommand(c,'resume','',{k:'panel'}); else toast('info',`/resume をターミナルで開きます`,`ch.${c.num} ${esc(c.name)} のターミナルに一覧が出ます。`); });
  let all=[];
  const draw=()=>{ const el=$('rsList'); if(!el) return; const q=$('rsQ').value.trim().toLowerCase();
    const list=all.filter(x=>!q||`${x.title} ${x.first} ${x.last}`.toLowerCase().includes(q));
    // named as the terminal's list names it: the name given with /rename or the one Claude Code made up, else the first prompt
    el.innerHTML= list.map(x=>{ const name=x.title||x.first||x.last||'';
      return `<li><div class="pt"><b>${esc(cut1(name,80)||'（名前のない会話）')}</b>${x.title&&x.first?`<span>${esc(cut1(x.first,90))}</span>`:''}</div>
      <small>${sinceTxt(Date.now()-x.t)} · ${kb(x.size)}${x.last&&x.last!==x.first&&x.last!==name?` · 最後の依頼：${esc(cut1(x.last,60))}`:''}</small>
      <span class="btns">${x.open?`<span class="pbusy">ch.${x.open.num} ${esc(x.open.name)} で開いています</span>`:`<button class="btn small primary" type="button" data-i="${all.indexOf(x)}">再開</button>`}</span></li>`; }).join('')
      || `<li class="pempty">${all.length?'一致する会話はありません。':'このフォルダで前に話した会話は見つかりませんでした。下の「ターミナルの一覧で選ぶ」で、ターミナルの一覧からも選べます。'}</li>`;
    el.querySelectorAll('[data-i]').forEach(b=>b.addEventListener('click',()=>{ const x=all[+b.dataset.i]; closeSheet(); doResume(c,x); })); };
  $('rsQ').addEventListener('input',draw);
  const got=r=>{ if(!$('rsList')) return; if(!r||r.ok===false){ $('rsList').innerHTML=`<li class="pempty">${esc((r&&r.error)||'一覧を読めませんでした。')} 下の「ターミナルの一覧で選ぶ」で、ターミナルの一覧からは選べます。</li>`; return; } all=r.sessions||[]; draw(); };
  if(LIVE) api('/api/ui/sessions',{chan:c.id}).then(got).catch(err=>got({ok:false,error:`一覧を読めませんでした（${err.message}）`}));
  else setTimeout(()=>got({ok:true,sessions:(DEMO_CONVOS[c.cwd]||[]).filter(x=>x.id!==c.sid).map(x=>({...x,t:Date.now()-x.age*60e3}))}),250);
}
function doResume(c,x){ if(LIVE){ liveResume(c,x.id,x.title||x.first||x.last); return; }
  if(c.status!=='idle'){ c.queue.push({type:'cmd',name:'resume',args:x.id,k:'pick',x}); toast('queue','再開を予約しました',`ch.${c.num} ${esc(c.name)} の今のターンが終わったら切り替えます。`); return; }
  demoResume(c,x); }
function demoResume(c,x){ const old=c.sid||rid(), last=[...c.log.querySelectorAll('.turn .fold .p')].pop(), first=[...c.log.querySelectorAll('.turn .fold .p')][0];
  const list=DEMO_CONVOS[c.cwd]||(DEMO_CONVOS[c.cwd]=[]), i=list.indexOf(x); if(i>=0) list.splice(i,1);
  list.unshift({id:old,title:c.title||'',first:first? first.textContent : c.role,last:last? last.textContent : '',age:0,size:180e3,hist:[]});
  PAST.unshift({n:c.title||(first? first.textContent.slice(0,24) : c.role),cwd:c.cwd,t:`今日 ${hm(Date.now())}`,id:old});
  c.sid=x.id; c.title=x.title||''; c.perTurn=[]; c.tasks=[]; c.files={}; c.agents=[]; c.ops=[]; c.cur=null;
  resumedBox(c,{title:x.title||x.first,from:old});
  histTurns(c,(x.hist||[]).map(h=>({u:h.u,a:h.a,html:true})),0);
  toast('info',`ch.${c.num} ${esc(c.name)} で前の会話を再開しました`,esc(cut1(x.title||x.first,60))); setStatus(c,'idle','入力待ち'); scrollIf(c); }
/* the turn the conversation was swapped at, and the last exchanges of the one returned to */
function resumedBox(c,ev){ c.cur=null; const li=document.createElement('li'); li.className='swap';
  li.innerHTML=`<div class="sys res"><b>前の会話を再開しました<span class="rt">${ev.title?`：${esc(cut1(ev.title,80))}`:''}</span></b><span>ここから下は、選んだ会話の続きです。それまでの会話も残っていて、「再開」からまた戻れます${ev.from?`（ID ${esc(String(ev.from).slice(0,8))}）`:''}。</span></div>`;
  c.log.appendChild(li); }
function histTurns(c,items,more){ if(!items||!items.length) return; const li=document.createElement('li'); li.className='hist';
  li.innerHTML=`<details class="histBox"${items.length<=2?' open':''}><summary><b>再開した会話のこれまで</b><span>${items.length} 往復${more?`（その前に ${more} 往復）`:''}</span></summary>
    <div class="histIn">${items.map(x=>`${x.u?youHTML(userText(x.u),'以前の依頼',x.t||0):''}${x.a?`<div class="ans">${x.html? x.a : typeof mdLite==='function'? mdLite(x.a) : esc(x.a)}</div>`:''}`).join('')}</div></details>`;
  c.log.appendChild(li); }

function openModel(c){
  // nothing set in /config means Claude Code's own default: that row is the one in use
  const M=modelsOfCh(c), cur=M.value||(M.options.includes('default')?'default':''), base=o=>String(o).replace(/\[1m\]$/,'');
  openSheet(`<div class="hd"><span class="tag teal">モデル</span><button class="btn small" type="button" data-close>閉じる</button></div>
    <h2 id="sheetT">ch.${c.num} ${esc(c.name)} のモデルを切り替える</h2>
    <p class="sub">今のモデル：<b>${esc(c.model||'—')}</b>。選ぶと、ターミナルの設定（<code>/config</code> のモデルの行）で切り替えます。<code>/model</code> と同じく、新しいセッションの既定も変わります。</p>
    ${c.turnNo>0?'<p class="pnote">会話の途中で切り替えると、次の返答で新しいモデルが会話を最初から読み直します。その 1 回は時間とトークンが多くかかります。</p>':''}
    ${busyNote(c)}
    ${M.options.length?`<ul class="plist" id="mdList">${M.options.map((o,i)=>`<li class="${o===cur?'on':''}"><div class="pt"><b>${esc(modelLabel(o))}</b><span><code>${esc(o)}</code>${MODEL_NOTE[base(o)]?` · ${esc(MODEL_NOTE[base(o)])}`:''}</span></div><span class="btns">${o===cur?'<span class="pcur">設定中</span>':`<button class="btn small primary" type="button" data-i="${i}">切り替える</button>`}</span></li>`).join('')}</ul>`
      : '<p class="pempty">このターミナルからモデルの一覧を受け取れていません。ターミナルで <code>/model</code> を使ってください。</p>'}`,'pick');
  $('sheet').querySelectorAll('#mdList [data-i]').forEach(b=>b.addEventListener('click',()=>{ const o=M.options[+b.dataset.i]; closeSheet(); doModel(c,o); })); }
function doModel(c,o){ if(LIVE){ liveModel(c,o); return; }
  const M=c.models||(c.models={...DEMO_MODELS,options:[...DEMO_MODELS.options]}); M.value=o;
  const DEMO_NAME={default:'Opus 5.5',best:'Opus 5.5',opus:'Opus 5.5',sonnet:'Sonnet 5.5',haiku:'Haiku 5.5',fable:'Fable 5.1',opusplan:'Opus 5.5'};
  const was=c.model, to=DEMO_NAME[o.replace(/\[1m\]$/,'')]||o;
  c.model=to; modelBox(c,{from:was,to,src:'screen'}); toast('info',`ch.${c.num} ${esc(c.name)} のモデルを切り替えました`,esc(modelLabel(o))); dirty=true; }
function modelBox(c,ev){ const d=document.createElement('div'); d.className='sys';
  d.innerHTML=`<b>モデルを切り替えました：${esc(ev.from||'—')} → ${esc(ev.to)}</b><span>${ev.src==='screen'?'この画面から切り替えました。':'ターミナルで切り替えました。'}次の返答から、このモデルで答えます。</span>`;
  if(c.cur) c.cur.flow.appendChild(d); else { const li=document.createElement('li'); li.appendChild(d); c.log.appendChild(li); } }

function openEffort(c){
  const L=effortsOfCh(c), cur=c.effort||'';
  openSheet(`<div class="hd"><span class="tag teal">effort</span><button class="btn small" type="button" data-close>閉じる</button></div>
    <h2 id="sheetT">ch.${c.num} ${esc(c.name)} の考える深さ（effort）</h2>
    <p class="sub">今：<b>${esc(effortLabel(cur))}</b>${cur?`（<code>${esc(cur)}</code>）`:'（まだ分かりません。最初の返答で分かります）'}${c.effortUsed&&cur&&c.effortUsed!==cur?`。最後の返答は ${esc(effortLabel(c.effortUsed))}（<code>${esc(c.effortUsed)}</code>）でした`:''}。選ぶと、ターミナルで <code>/effort</code> を実行したのと同じになります。新しいセッションの既定にも保存されるかは、会話の欄に出る結果の 1 行に書かれます（<code>max</code> はこのセッションだけ）。深くするほど、返答に時間とトークンがかかります。</p>
    ${busyNote(c)}
    <div class="eff" id="efList">${L.map((x,i)=>`<button type="button" class="${x===cur?'on':''}" data-i="${i}" aria-pressed="${x===cur}"><b>${esc(effortLabel(x))}</b><code>${esc(x)}</code><small>${esc(EFFORT_NOTE[x]||'')}</small></button>`).join('')}</div>`,'pick');
  $('efList').querySelectorAll('[data-i]').forEach(b=>b.addEventListener('click',()=>{ const x=L[+b.dataset.i]; closeSheet(); if(x!==cur) doEffort(c,x); })); }
function doEffort(c,x){ if(LIVE){ liveEffort(c,x); return; }
  c.effort=x; cmdOut(c,'effort',x,`Set effort level to ${x} (saved as your default for new sessions)`); toast('info',`ch.${c.num} ${esc(c.name)} の effort を変えました`,esc(effortLabel(x))); dirty=true; }
$('osd').addEventListener('click',e=>{ const b=e.target.closest('[data-pick]'); if(b) openPick(chN(sel),b.dataset.pick); });

async function loop(c){ const lid=++c.loopId; await sleep(c.delay);
  while(lid===c.loopId&&c.status!=='off'){
    let w=0; const patience=60+Math.random()*70;
    while(!c.queue.length&&w<patience){ await sleep(100); w++; if(lid!==c.loopId) return; }
    const it=c.queue.shift();
    if(it&&it.type==='cmd'){ await runCmd(c,it); await sleep(it.k==='turn'? 2500 : 600); continue; }
    if(!c.script.length) continue;
    const T=c.script[c.idx%c.script.length]; c.idx++;
    if(it&&it.lid) pendDone(c,x=>x.lid===it.lid);       // its bubble gives way to the turn
    await turn(c,T,it? it.text : esc(T.prompt),!!it,it&&it.files);
    await sleep(2500+Math.random()*3000); } }
function stopTurn(c){ if(c.status!=='work'&&c.status!=='wait') return; c.turnId++;
  c.log.querySelectorAll('.op.run').forEach(li=>{ li.classList.remove('run'); li.querySelector('.r').textContent='中断'; });
  c.log.querySelectorAll('.perm').forEach(p=>p.remove());
  c.log.querySelectorAll('.typing').forEach(e=>e.classList.remove('typing'));
  const ts=c.log.querySelectorAll('.turn'), lt=ts[ts.length-1]; if(lt) lt.querySelector('.fold .k').textContent='中断';
  c.agents.forEach(a=>{ if(a.st==='run') a.st='stop'; }); [...LINKS,...ALL].forEach(l=>l.live.delete(c.num)); c.active=null; endBlock(c);
  add(c,`<div class="sys"><b>ターンを止めました</b><span>実行中の道具も止めています。次の依頼から続けられます。</span></div>`);
  setStatus(c,'idle','入力待ち'); }

/* ================= switching channels: a yellow band sweeps across ================= */
function select(n){ if(n!==0&&!chN(n)) return; const changed=n!==sel; sel=n;
  const swap=()=>{ if(sel!==n) return;
    CH.forEach(c=>{ c.log.hidden= c.num!==n; });
    $('wall').hidden= n!==0; $('chan').hidden= n===0; $('ctl').hidden= n===0; $('ctl0').hidden= n!==0; closePal(); askFit();
    if(n){ renderOsd(chN(n)); requestAnimationFrame(()=>{ $('chan').scrollTop=$('chan').scrollHeight; }); }
    else { $('sfog').style.setProperty('--fog','0'); $('screen').classList.remove('off'); renderWall(); renderGuide(); }
    if(rtab==='D') renderDetail(true); if(rtab==='S') renderSkills(true); };
  if(changed&&!reduce){ const w=$('wipe'), c=chN(n); $('wipeN').textContent= n===0? 'ch.0' : `ch.${n}`; $('wipeS').textContent= n===0? '全チャンネル' : c.name;
    w.classList.remove('go'); void w.offsetWidth; w.classList.add('go'); clearTimeout(select.t); select.t=setTimeout(swap,750); }   // mid-hold of the 1.5 s band
  else swap();
  renderChs(); }
function setTab(k){ rtab=k; [['F','tF','pF'],['L','tL','pL'],['S','tS','pS'],['D','tD','pD']].forEach(([kk,t,p])=>{ $(t).setAttribute('aria-selected',String(kk===k)); $(p).hidden= kk!==k; });
  if(k==='F') renderForecast(); if(k==='L'){ deckOrderKey=''; listKey=''; updateDeck(); requestAnimationFrame(sizeDeck); } if(k==='D') renderDetail(true); if(k==='S') renderSkills(true); }
[['tF','F'],['tL','L'],['tS','S'],['tD','D']].forEach(([id,k])=>$(id).addEventListener('click',()=>setTab(k)));
$('filters').querySelectorAll('.fbtn').forEach(b=>b.addEventListener('click',()=>{ deckFilter=b.dataset.k;
  $('filters').querySelectorAll('.fbtn').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); updateDeck(); }));
$('knob').addEventListener('click',()=>{ const nums=[0,...CH.map(c=>c.num)]; select(nums[(nums.indexOf(sel)+1)%nums.length]); });
$('hud').addEventListener('click',()=>{ setTab('F'); if(innerWidth<=1180) document.querySelector('.rail').scrollIntoView({behavior:reduce?'auto':'smooth',block:'start'}); });
$('guide').addEventListener('click',e=>{ const t=e.target.closest('[data-n]'); if(t) select(+t.dataset.n); });
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&!$('scrim').hidden){ closeSheet(); return; }
  if(stvOpen){ if(e.key==='Escape'){ e.preventDefault(); closeStatus(); } return; }
  if(coKeys(e)||co) return;
  const tag=(e.target.tagName||'').toLowerCase();
  if(tag==='textarea'||tag==='input'||tag==='select'||e.metaKey||e.ctrlKey||e.altKey||!$('scrim').hidden) return;
  if(/^[0-9]$/.test(e.key)&&(+e.key===0||chN(+e.key))){ select(+e.key); e.preventDefault(); }
  if(e.key==='/'&&sel){ e.preventDefault(); $('ask').value='/'; $('ask').focus(); openPal(); } });

/* ================= composer and its command palette ================= */
const pal={items:[],i:0,open:false,mode:'cmd',tok:null,seq:0,wait:false,err:'',recent:false};
function palQuery(){ const v=$('ask').value; return v.startsWith('/')? v.slice(1).split(/\s/)[0].toLowerCase() : ''; }
function openPal(){ const c=chN(sel); if(!c||c.status==='off') return; const q=palQuery(); pal.mode='cmd'; pal.seq++; $('palTag').textContent='コマンド';
  const all=commandsFor(c); pal.items=all.filter(x=>!q||x.n.toLowerCase().includes(q)||x.d.toLowerCase().includes(q));
  pal.items.sort((a,b)=>(q&&a.n.startsWith(q)?0:1)-(q&&b.n.startsWith(q)?0:1)); pal.i=Math.min(pal.i,Math.max(0,pal.items.length-1));
  $('palSub').textContent=`ch.${c.num} ${c.name} で使えるもの ${all.length} 件（起動したフォルダで変わります）`;
  renderPal(); $('pal').hidden=false; pal.open=true; $('ask').setAttribute('aria-expanded','true'); }
function closePal(){ const was=pal.open; $('pal').hidden=true; pal.open=false; pal.seq++; $('ask').setAttribute('aria-expanded','false'); $('ask').removeAttribute('aria-activedescendant'); if(was) ctlHint(); }
function renderPal(){ if(pal.mode==='file'){ renderFiles(); return; } let g='', html='';
  const groups={}; pal.items.forEach(x=>{ groups[x.g]=(groups[x.g]||0)+1; });
  const order=['組み込み','スキル','プラグイン','MCP']; const items=[...pal.items].sort((a,b)=>order.indexOf(a.g)-order.indexOf(b.g)); pal.items=items;
  items.forEach((x,i)=>{ if(x.g!==g){ g=x.g; html+=`<li class="pg" role="presentation">${g}（${groups[g]}）</li>`; }
    html+=`<li role="option" id="po${i}" class="po${i===pal.i?' on':''}" aria-selected="${i===pal.i}" data-i="${i}"><code>/${esc(x.n)}</code><span class="h">${esc(x.h)}</span><span class="d">${esc(x.d)}</span><span class="kd k-${x.k}">${CKIND[x.k]}</span></li>`; });
  $('palList').innerHTML=html||'<li class="pg" role="presentation">一致するコマンドはありません</li>';
  if(items.length){ $('ask').setAttribute('aria-activedescendant','po'+pal.i); const on=$('palList').querySelector('.po.on'); on&&on.scrollIntoView({block:'nearest'}); } }
function pickPal(i){ if(pal.mode==='file'){ pickFile(i); return; } const x=pal.items[i]; if(!x) return; $('ask').value='/'+x.n+' '; closePal(); $('ask').focus(); askFit(); ctlHint(); }

/* @ in the message box: the channel's files, as the terminal's @ offers them; sent, what they hold goes to Claude */
// the @ being typed at the caret: where it starts, where its word ends, and what follows the @
function atToken(){ const a=$('ask'), v=a.value, i=a.selectionStart==null? v.length : a.selectionStart; if(a.selectionEnd!==i) return null;
  const m=/(^|[\s(（「『【、。，．：；])@("?)([^\s"]*)$/.exec(v.slice(0,i)); if(!m) return null;
  const rest=/^[^\s"]*"?/.exec(v.slice(i))[0];
  return {from:i-m[3].length-m[2].length-1,to:i+rest.length,q:m[3]}; }
let fileTimer=0;
function openFiles(t){ const c=chN(sel); if(!c||c.status==='off') return;
  if(pal.mode!=='file'||!pal.open||!pal.tok||pal.tok.q!==t.q) pal.i=0;
  pal.mode='file'; pal.tok=t; $('palTag').textContent='ファイル';
  $('palSub').textContent=`ch.${c.num} ${c.name} のフォルダ（${c.cwd}）から。送ると、選んだファイルの中身がこの依頼といっしょに Claude に渡ります`;
  if(!pal.open){ pal.items=[]; pal.wait=true; pal.err=''; renderPal(); $('pal').hidden=false; pal.open=true; $('ask').setAttribute('aria-expanded','true'); }
  clearTimeout(fileTimer); const seq=++pal.seq;
  const got=r=>{ if(seq!==pal.seq||!pal.open||pal.mode!=='file') return; pal.wait=false;
    pal.err= r&&r.ok===false? (r.error||'一覧を読めませんでした。') : ''; pal.recent=!!(r&&r.recent);
    pal.items=((r&&r.files)||[]).map(f=>({p:f.p,dir:!!f.d})); pal.i=Math.min(pal.i,Math.max(0,pal.items.length-1)); renderPal(); };
  if(LIVE) fileTimer=setTimeout(()=>api('/api/ui/files',{chan:c.id,q:t.q}).then(got).catch(err=>got({ok:false,error:`一覧を読めませんでした（${err.message}）`})),70);
  else got(demoFiles(t.q)); }
function renderFiles(){ const L=pal.items;
  $('palList').innerHTML= pal.wait? '<li class="pg" role="presentation">読み込んでいます…</li>'
    : pal.err? `<li class="pg" role="presentation">${esc(pal.err)}</li>`
    : !L.length? '<li class="pg" role="presentation">一致するファイルはありません</li>'
    : (pal.recent?'<li class="pg" role="presentation">最近変わったファイル（続けて打つと名前で探します）</li>':'')+L.map((x,i)=>{ const k=x.p.lastIndexOf('/'), dir=k>=0? x.p.slice(0,k+1) : '', base=x.p.slice(k+1);
      return `<li role="option" id="po${i}" class="po pf${i===pal.i?' on':''}" aria-selected="${i===pal.i}" data-i="${i}"><code><span class="dp">@${esc(dir)}</span>${esc(base)}${x.dir?'/':''}</code><span class="kd k-${x.dir?'dir':'file'}">${x.dir?'フォルダ':'ファイル'}</span></li>`; }).join('');
  if(L.length&&!pal.wait){ $('ask').setAttribute('aria-activedescendant','po'+pal.i); const on=$('palList').querySelector('.po.on'); on&&on.scrollIntoView({block:'nearest'}); }
  else $('ask').removeAttribute('aria-activedescendant'); }
/* the demo: its folder's files, ranked as the hub ranks them, and what a prompt's @ would attach */
function fileScore(p,q){ const pl=p.toLowerCase(), base=pl.slice(pl.lastIndexOf('/')+1);
  if(q.includes('/')){ if(pl.startsWith(q)) return pl.length/1e4; if(pl.includes(q)) return 2+pl.length/1e4; }
  else { if(base===q) return 0; if(base.startsWith(q)) return 1+pl.length/1e4; if(base.includes(q)) return 2+pl.length/1e4; if(pl.includes(q)) return 3+pl.length/1e4; }
  let i=0, gaps=0, last=-1; for(const ch of q){ const j=pl.indexOf(ch,i); if(j<0) return -1; if(last>=0&&j>last+1) gaps++; last=j; i=j+1; }
  return 4+gaps/10+pl.length/1e4; }
function demoTree(){ const dirs=new Set(); DEMO_FILES.forEach(p=>{ let i=p.lastIndexOf('/'); while(i>0){ dirs.add(p.slice(0,i)); i=p.lastIndexOf('/',i-1); } });
  return [...DEMO_FILES.map(p=>({p,d:false})),...[...dirs].map(p=>({p,d:true}))]; }
function demoFiles(q){ q=String(q||'').toLowerCase().replace(/^\.\//,'');
  if(!q) return {ok:true,recent:true,files:['hooks/register.ts','hub/hub.mjs','ui-src/fc4.js','README.md','hooks/shape.ts','ui-src/fc-head.html'].map(p=>({p,d:false}))};
  const hits=demoTree().map(f=>[fileScore(f.p,q),f]).filter(x=>x[0]>=0).sort((a,b)=>a[0]-b[0]||Number(a[1].d)-Number(b[1].d)||a[1].p.localeCompare(b[1].p));
  return {ok:true,files:hits.slice(0,40).map(x=>x[1])}; }
function demoAttach(text){ const out=[], re=/(^|[\s(（「『【、。，．：；])@(?:"([^"\n]+)"|([^\s"]+))/g; let m;
  while((m=re.exec(String(text)))&&out.length<10){ const raw=(m[2]||m[3]||'').trim(), p=(/^[\w./~@+#%=,-]+/.exec(raw)||[raw])[0].replace(/[,.]+$/,''), dir=p.replace(/\/$/,'');
    if(out.some(x=>x.p===p||x.p===dir+'/')) continue;
    if(DEMO_FILES.includes(p)) out.push({p,kind:'file',lines:60+(p.length*37)%400});
    else if(DEMO_FILES.some(f=>f.startsWith(dir+'/'))) out.push({p:dir+'/',kind:'dir',lines:DEMO_FILES.filter(f=>f.startsWith(dir+'/')&&!f.slice(dir.length+1).includes('/')).length});
    else out.push({p:raw,err:/^(~|\/)/.test(raw)?'outside':'missing'}); }
  return out; }
// a file goes in as @path and a space; a folder as @folder/, its files listed next
function pickFile(i){ const x=pal.items[i], t=atToken()||pal.tok; if(!x||!t) return; const a=$('ask'), v=a.value;
  const p=x.dir? x.p+'/' : x.p, q=/\s/.test(p), put=(q? `@"${p}"` : `@${p}`)+(x.dir? '' : ' ');
  a.value=v.slice(0,t.from)+put+v.slice(t.to); const at=t.from+put.length-(x.dir&&q? 1 : 0);
  a.focus(); a.setSelectionRange(at,at); askFit();
  if(x.dir){ const nt=atToken(); if(nt){ openFiles(nt); return; } }
  closePal(); ctlHint(); }
$('palList').addEventListener('mousedown',e=>{ const li=e.target.closest('.po'); if(li){ e.preventDefault(); pickPal(+li.dataset.i); } });
$('ask').addEventListener('input',()=>{ const v=$('ask').value, t=atToken(); askFit();
  if(t) openFiles(t);
  else if(v.startsWith('/')&&!/\s/.test(v)) { pal.i=0; openPal(); }
  else if(pal.open) closePal();
  ctlHint(); });
// the caret moved off the @ word: its list closes
['click','keyup'].forEach(k=>$('ask').addEventListener(k,e=>{ if(k==='keyup'&&!/^(ArrowLeft|ArrowRight|Home|End)$/.test(e.key)) return; if(pal.open&&pal.mode==='file'&&!atToken()) closePal(); }));
$('ask').addEventListener('keydown',e=>{
  if(pal.open){
    if(e.key==='ArrowDown'){ e.preventDefault(); pal.i=Math.min(pal.items.length-1,pal.i+1); renderPal(); return; }
    if(e.key==='ArrowUp'){ e.preventDefault(); pal.i=Math.max(0,pal.i-1); renderPal(); return; }
    if((e.key==='Enter'||e.key==='Tab')&&!e.isComposing&&pal.items.length){ e.preventDefault(); pickPal(pal.i); return; }
    if(e.key==='Escape'){ e.preventDefault(); closePal(); return; } }
  // the suggestion in the empty box: Tab (or →) takes it, as in the terminal
  if((e.key==='Tab'&&!e.shiftKey||e.key==='ArrowRight')&&!e.isComposing&&!$('ask').value&&takeSugg()){ e.preventDefault(); return; }
  if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){ e.preventDefault(); $('ctl').requestSubmit(); } });
$('ask').addEventListener('blur',()=>setTimeout(()=>{ if(document.activeElement!==$('ask')) closePal(); },120));
$('bCmd').addEventListener('click',()=>{ if(pal.open&&pal.mode==='cmd'){ closePal(); return; } if(!$('ask').value.startsWith('/')) $('ask').value='/'; $('ask').focus(); pal.i=0; openPal(); askFit(); });
$('ctl').addEventListener('submit',e=>{ e.preventDefault(); const c=chN(sel), v=$('ask').value.trim(); if(!c||!v||c.status==='off') return;
  if(v.startsWith('/')){ const m=v.slice(1).match(/^(\S+)\s*([\s\S]*)$/); if(!m) return; if(queueCmd(c,m[1],m[2].trim())){ $('ask').value=''; closePal(); askFit(); } return; }
  sendText(c,v); $('ask').value=''; closePal(); askFit(); ctlHint(); });

/* the message box grows with what is typed, a line at a time, up to a share of the window; past that it scrolls inside.
   The screen above gives up the room it takes (down to a floor), and a channel read to its end stays at its end */
const ASK_MIN=46;
function askFit(){ const a=$('ask'), root=document.documentElement;
  if($('ctl').hidden){ root.style.setProperty('--askGrow','0px'); return; }
  const max=Math.round(Math.max(120,Math.min(innerHeight*(innerWidth<=620? .3 : .36),360)));
  const view=$('chan'), atEnd=!view.hidden&&view.scrollHeight-view.scrollTop-view.clientHeight<40;
  a.style.height='auto'; const want=Math.max(ASK_MIN,a.scrollHeight+2), h=Math.min(want,max);
  a.style.height=h+'px'; a.style.overflowY= want>max? 'auto' : 'hidden';
  root.style.setProperty('--askGrow',Math.max(0,h-ASK_MIN)+'px');
  if(atEnd) view.scrollTop=view.scrollHeight; }
addEventListener('resize',askFit);
$('bStop').addEventListener('click',()=>{ const c=chN(sel); if(c) LIVE? liveStop(c) : stopTurn(c); });
$('bCompact').addEventListener('click',()=>{ const c=chN(sel); if(!c||c.status==='off') return; if(LIVE){ liveCompact(c); return; }
  if(c.status!=='idle'){ queueCmd(c,'compact',''); return; } compact(c,true); });
$('bPause').addEventListener('click',e=>{ G.paused=!G.paused; e.currentTarget.setAttribute('aria-pressed',String(G.paused)); e.currentTarget.textContent=G.paused?'再開':'一時停止'; });
['bSet','bSetCh'].forEach(id=>$(id).addEventListener('click',()=>LIVE? liveSettings() : openSettings()));

/* ================= what you send shows at once: it waits at the bottom of the channel until its turn starts ================= */
// c.pend: [{lid, id, text, t, st:'sending'|'queued'|'sent'|'err', err}]; the hub keeps the same list for every screen
/* a message as typed: line breaks kept, a very long one cut (the terminal has it whole) */
function userText(t){ t=String(t||''); const long=t.length>1600; return esc(long? t.slice(0,1600) : t).replace(/\n/g,'<br>')+(long?'<span class="more">…（続きはターミナルで）</span>':''); }
const PST={sending:'送っています…',sent:'ターミナルに渡しました · まもなく始まります',queued:'順番待ち · 今の作業が終わると始まります',err:'送れませんでした'};
function renderPend(c){ const items=c.pend||(c.pend=[]);
  if(!items.length){ if(c.pendLi) c.pendLi.remove(); return; }
  let p=c.pendLi; if(!p){ p=c.pendLi=document.createElement('li'); p.className='pends'; }
  if(c.log.lastElementChild!==p) c.log.appendChild(p);
  p.innerHTML=items.map((x,i)=>`<div class="pend ${x.st}" data-i="${i}">${youHTML(userText(x.text),x.other?'ほかの画面から':'この画面から',x.t)}
    <div class="pst">${x.st==='err'?`<b>${PST.err}</b>${x.err?`<span>${esc(x.err)}</span>`:''}<button class="linkbtn" type="button" data-re>もう一度送る</button><button class="linkbtn" type="button" data-drop>消す</button>`:`<i class="spin" aria-hidden="true"></i><span>${PST[x.st]||''}</span>`}</div></div>`).join('');
  p.querySelectorAll('[data-re]').forEach(b=>b.addEventListener('click',()=>{ const x=items[+b.closest('.pend').dataset.i]; dropPend(c,x); sendText(c,x.text); }));
  p.querySelectorAll('[data-drop]').forEach(b=>b.addEventListener('click',()=>dropPend(c,items[+b.closest('.pend').dataset.i])));
  scrollIf(c); }
function dropPend(c,x){ const i=(c.pend||[]).indexOf(x); if(i<0) return; c.pend.splice(i,1); if(LIVE&&x.id&&x.st==='err') api('/api/ui/unsend',{chan:c.id,id:x.id}).catch(()=>{}); renderPend(c); }
function pendDone(c,pred){ const n=(c.pend||[]).length; c.pend=(c.pend||[]).filter(x=>!pred(x)); if(c.pend.length!==n) renderPend(c); }
function sendText(c,text){ c.suggest='';           // as in the terminal, a prompt sent puts the suggestion away
  if(LIVE){ liveSend(c,text); return; }
  const lid=rid(); (c.pend||(c.pend=[])).push({lid,text,t:Date.now(),st:c.status==='idle'?'sent':'queued'}); renderPend(c);
  c.queue.push({type:'prompt',text:esc(text),lid,files:demoAttach(text)}); askFit(); }

/* ================= Claude's questions (AskUserQuestion): answer here or in the terminal; the first answer counts ================= */
// q: {id, qs:[{q, h, multi, opts:[{l, d}]}]}; send(answers) resolves once the answer is on its way
function qCard(q,send){ const d=document.createElement('div'); d.className='qcard'; d.dataset.id=q.id;
  const one=q.qs.length===1&&!q.qs[0].multi&&q.qs[0].opts.length>0;
  d.innerHTML=`<div class="qhd"><b>Claude からの質問</b><span class="s">${one?'押すとすぐ答えます':'選んでから「答える」を押します'}。ターミナルでも答えられ、先に答えた方が使われます。</span></div>
    ${q.qs.map((x,i)=>`<fieldset class="qq" data-i="${i}"><legend>${x.h?`<span class="qh">${esc(x.h)}</span>`:''}<span class="qt">${esc(x.q||'（質問）')}</span>${x.multi?'<small>いくつでも選べます</small>':''}</legend>
      ${x.opts.length?`<div class="qopts">${x.opts.map((o,k)=>`<button type="button" class="qo" data-k="${k}" aria-pressed="false"><b>${esc(o.l)}</b>${o.d?`<small>${esc(o.d)}</small>`:''}</button>`).join('')}</div>`:''}
      <input class="qin" type="text" maxlength="2000" placeholder="${x.opts.length?'ほかの答えを書く（選択肢にないとき）':'答えを書く'}" aria-label="${esc(x.q)}：${x.opts.length?'ほかの答え':'答え'}"></fieldset>`).join('')}
    <div class="qft">${one?'':'<button class="btn primary" type="button" data-send disabled>答える</button>'}<span class="qst" role="status"></span></div>`;
  const S=q.qs.map(()=>({pick:new Set(),text:''})), sendB=d.querySelector('[data-send]'), st=d.querySelector('.qst');
  const ready=()=>S.every(s=>s.pick.size||s.text.trim());
  const draw=()=>{ d.querySelectorAll('.qq').forEach((f,i)=>f.querySelectorAll('.qo').forEach(b=>b.setAttribute('aria-pressed',String(S[i].pick.has(+b.dataset.k))))); if(sendB) sendB.disabled=!ready(); };
  const go=async()=>{ if(!ready()||d.classList.contains('busy')) return; d.classList.add('busy'); d.querySelectorAll('button,input').forEach(b=>b.disabled=true); st.className='qst'; st.textContent='送っています…';
    try{ await send(S.map(s=>({pick:[...s.pick].sort((a,b)=>a-b),text:s.text.trim()}))); if(!d.classList.contains('done')) st.textContent='送りました。ターミナルの質問が閉じるのを待っています…'; }
    catch(err){ d.classList.remove('busy'); d.querySelectorAll('button,input').forEach(b=>b.disabled=false); draw(); st.className='qst bad'; st.textContent=`送れませんでした（${err.message}）`; } };
  d.querySelectorAll('.qq').forEach((f,i)=>{ const x=q.qs[i], s=S[i], inp=f.querySelector('.qin');
    f.querySelectorAll('.qo').forEach(b=>b.addEventListener('click',()=>{ const k=+b.dataset.k;
      if(x.multi){ s.pick.has(k)? s.pick.delete(k) : s.pick.add(k); } else { s.pick=new Set([k]); s.text=''; inp.value=''; }
      draw(); if(one) go(); }));
    inp.addEventListener('input',()=>{ s.text=inp.value; if(!x.multi&&s.text.trim()) s.pick.clear(); draw(); });
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.isComposing){ e.preventDefault(); go(); } }); });
  if(sendB) sendB.addEventListener('click',go);
  d._picks=S; return d; }
// the question was answered (here or in the terminal), or closed without an answer
function qDone(d,ev){ if(!d||d.classList.contains('done')) return; d.classList.remove('busy'); d.classList.add('done'); d.querySelectorAll('button,input').forEach(b=>b.disabled=true);
  const A=ev.answers||{}, qs=[...d.querySelectorAll('.qq')];
  qs.forEach(f=>{ const t=f.querySelector('.qt').textContent, a=A[t]; const got=a!=null? String(a).split(', ') : [];
    f.querySelectorAll('.qo').forEach(b=>{ if(got.includes(b.querySelector('b').textContent)) b.setAttribute('aria-pressed','true'); });
    const inp=f.querySelector('.qin'); if(a!=null&&!f.querySelector('.qo[aria-pressed="true"]')) inp.value=a; if(!inp.value) inp.hidden=true;
    if(a!=null){ let r=f.querySelector('.qa'); if(!r){ r=document.createElement('p'); r.className='qa'; f.appendChild(r); } r.innerHTML=`<span>答え</span>${esc(a)}`; } });
  const st=d.querySelector('.qst'); st.className='qst'+(ev.err?' bad':' ok');
  st.textContent= ev.err? '答えずに閉じられました（ターミナルで取り消したか、止めました）' : ev.by==='screen'? 'この画面で答えました' : 'ターミナルで答えました';
  const hd=d.querySelector('.qhd .s'); if(hd) hd.remove(); }

/* ================= Claude Code's guess at your next prompt (Tab takes it), and a command's arguments ================= */
function ctlHint(){ const c=chN(sel); if(!c) return; const v=$('ask').value, h=$('ctlHint');
  const m=/^\/(\S+)(\s*)$/.exec(v), cmd=m&&commandsFor(c).find(x=>x.n===m[1]);
  let html='';
  if(cmd&&cmd.h) html=`<span class="hk">引数</span><code>/${esc(cmd.n)}</code> <span class="ah">${esc(cmd.h)}</span>${cmd.d?` <span class="ad">${esc(cmd.d)}</span>`:''}`;
  else if(!v&&c.suggest&&c.status==='idle') html=`<span class="hk">次の提案</span><span class="sgt">${esc(c.suggest)}</span><button class="linkbtn" type="button" id="bSugg">入れる（Tab）</button>`;
  else if(pal.open&&pal.mode==='file') html=`<span class="hk">@</span><span>選んだファイルは <code>@パス</code> で入り、送るとその中身がこの依頼といっしょに Claude に渡ります（ターミナルの <code>@</code> と同じ）。このターミナルのフォルダの中のものだけです。</span>`;
  else if(c.status==='off') html=`<span>終了したチャンネルです。「チャンネルを消す」でこの画面から片付けられます（セッションは残り、<code>claude --resume</code> で続きから始められます）。</span>`;
  const key=html||'-'; if(h.dataset.key===key) return; h.dataset.key=key;
  h.classList.toggle('alt',!!html);
  h.innerHTML= html || '送った文は、そのターミナルで入力したのと同じ扱いになります。「/」で始めると組み込みのコマンドやスキルを実行でき、「@」でファイルを指定できます。作業中に送ると、終わってから始まります。';
  const b=$('bSugg'); if(b) b.addEventListener('click',takeSugg); }
function takeSugg(){ const c=chN(sel); if(!c||!c.suggest||$('ask').value) return false; $('ask').value=c.suggest; $('ask').focus(); $('ask').setSelectionRange(c.suggest.length,c.suggest.length); askFit(); ctlHint(); return true; }

/* ================= putting away channels whose terminal has gone ================= */
function confirmForget(list){ if(!list.length) return; const one=list.length===1;
  openSheet(`<div class="hd"><span class="tag">片付け</span><button class="btn small" type="button" data-close>やめる</button></div>
    <h2 id="sheetT">${one? `ch.${list[0].num} ${esc(list[0].name)} を消しますか？` : `終了したチャンネルを片付けますか？`}</h2>
    <p class="sub">${one?'このチャンネルを':'選んだチャンネルを'}画面から消します。消えるのはこの画面の表示だけで、Claude Code のセッションはそのまま残ります。続きから始めるときは <code>claude --resume</code> で戻れます（「＋ 追加」の過去のセッションにも残ります）。</p>
    <ul class="fgl" id="fgl">${list.map((c,i)=>`<li><label><input type="checkbox" data-i="${i}" checked${one?' hidden':''}><span class="n">ch.${c.num}</span><b>${esc(c.name)}</b><small>${esc(c.cwd)} · ${c.endedAt?`${hm(c.endedAt)} に終了`:'終了'}${/途絶/.test(c.now||'')?' · 報告が途絶えました':''}</small></label></li>`).join('')}</ul>
    <div class="btns"><button class="btn primary" type="button" id="bFgOk">${one?'消す':'片付ける'}</button><button class="btn" type="button" data-close>やめる</button></div>`);
  $('bFgOk').addEventListener('click',()=>{ const pick=list.filter((_,i)=>$('fgl').querySelector(`[data-i="${i}"]`).checked); closeSheet(); forget(pick); }); }
function forget(list){ list=list.filter(c=>c.status==='off'); if(!list.length) return;
  if(LIVE){ liveForget(list); return; }
  list.forEach(c=>{ if(c.resume&&!PAST.some(p=>p.id===c.resume)) PAST.unshift({n:c.role,cwd:c.cwd,t:`今日 ${hm(c.endedAt||Date.now())}`,id:c.resume});
    c.log.remove(); const i=CH.indexOf(c); if(i>=0) CH.splice(i,1); });
  tilesKey=null; guideKey=null; chsKey=null; if(sel&&!chN(sel)) select(0);
  toast('info',`${list.length===1?`ch.${list[0].num} ${esc(list[0].name)} を`:`${list.length} チャンネルを`}片付けました`,'セッションは残っています。「＋ 追加」の過去のセッションから戻れます。'); dirty=true; }
$('bForget').addEventListener('click',()=>{ const c=chN(sel); if(c&&c.status==='off') confirmForget([c]); });
$('wSum').addEventListener('click',e=>{ if(e.target.closest('#bTidy')) confirmForget(CH.filter(c=>c.status==='off')); });

/* ================= settings: approving from this screen ================= */
// 設定 (under the wall's tips, and under a channel's composer) says, in a word, whether this screen can approve right now
let setKey='';
function renderSetBtn(){ let cls='', pill, say;
  if(LIVE){ const a=LV.ap; if(a.on&&a.pairedHere){ cls='on'; pill='オン'; } else if(a.pairing){ cls='half'; pill='入力待ち'; say='合言葉の入力待ち'; } else if(a.on){ cls='half'; pill='未接続'; say='オン · この画面は未接続'; } else pill='オフ'; }
  else if(G.ap.on&&G.ap.paired){ cls='on'; pill='オン'; } else pill='オフ';
  say=say||`画面で承認 ${pill}`;
  if(cls+say===setKey) return; setKey=cls+say;
  const lab=`設定を開く（${say}）`;
  document.querySelectorAll('.setBtn').forEach(b=>{ b.className='setBtn'+(cls?' '+cls:''); b.querySelector('.setSt').innerHTML=`画面で承認<em class="pill">${pill}</em>`; b.setAttribute('aria-label',lab); b.title=lab; });
  const tip=document.querySelector('#ctl0 .apTip'); tip.classList.toggle('on',cls==='on');
  tip.textContent= cls==='on'? '承認はこの画面でもできます' : '承認はターミナルの確認ダイアログで行います'; }
function openSettings(){
  openSheet(`<div class="hd"><span class="tag">設定</span><button class="btn small" type="button" data-close>閉じる</button></div>
    <h2 id="sheetT">ブラウザから承認</h2>
    <p class="sub">オンにすると、ツールを実行する前の確認を、この画面で許可・拒否できます。初期設定はオフです。</p>
    <div class="swrow"><span><b>この画面から承認する</b><small id="apState"></small></span><button class="sw" type="button" role="switch" id="swAp" aria-checked="${G.ap.on}" aria-label="この画面から承認する"><i></i></button></div>
    <div class="pair" id="pair" hidden>
      <div class="pairHd"><b>ターミナルに出た合言葉を入力</b><span class="left">あと 5:00</span></div>
      <div class="where">
        <div class="tmock" aria-hidden="true">
          <div class="tmT"><i></i><i></i><i></i><span>ch.1 lead のターミナル（デモ）</span></div>
          <div class="tmL">⏺ 直前の会話</div>
          <div class="tmRow"><div class="tmBand"><span class="tmK">Fogcast  ブラウザ承認の合言葉</span><span class="tmCode">${G.ap.code}</span></div><span class="tmTag">ここ</span></div>
          <div class="tmP"><span>&gt;</span><i class="cur"></i></div>
          <div class="tmRow"><div class="tmSl">Fogcast ch.1 · <b>合言葉 ${G.ap.code}</b> · ctx …</div><span class="tmTag">ここにも</span></div>
        </div>
        <p>合言葉は、Claude Code を開いているターミナルの<b>入力欄のすぐ上</b>に、黄色い枠で出ています。入力欄の下のステータスラインにも出ます。5 分で使えなくなります。</p>
      </div>
      <div class="pairrow"><input id="pairIn" inputmode="numeric" autocomplete="off" placeholder="0000-0000" aria-label="合言葉"><button class="btn primary" type="button" id="bPair">つなぐ</button><button class="btn" type="button" id="bPairDemo">デモ用に入力</button></div>
      <p class="err" id="pairErr" hidden>合言葉が違います。ターミナルの表示を確かめてください。</p>
    </div>
    <ul class="rules">
      <li>この画面で応答がなければ、2 分後にターミナルの確認ダイアログに切り替わります。</li>
      <li>この画面を閉じているときは、最初からターミナルで確認します。</li>
      <li>組織の設定で確認が必須になっているツールは、ターミナルでだけ承認できます。</li>
      <li>受け皿は 127.0.0.1 だけで待ち受けます。合言葉を知らない Web ページや他のプログラムは承認できません。</li>
    </ul>`);
  const state=()=>{ $('apState').textContent= G.ap.on? 'オン · このブラウザとつながっています' : 'オフ · 承認はターミナルで行います'; $('swAp').setAttribute('aria-checked',String(G.ap.on)); };
  state();
  $('swAp').addEventListener('click',()=>{ if(G.ap.on){ G.ap.on=false; G.ap.paired=false; state(); $('pair').hidden=true; toast('info','ブラウザからの承認をオフにしました','承認はターミナルで行います。'); dirty=true; return; }
    $('pair').hidden=false; $('pairIn').focus(); });
  const tryPair=()=>{ const v=$('pairIn').value.replace(/\D/g,''); if(v===G.ap.code.replace(/\D/g,'')){ G.ap.on=true; G.ap.paired=true; $('pair').hidden=true; $('pairErr').hidden=true; state();
      toast('info','この画面から承認できるようになりました','承認待ちのチャンネルを開くと、許可・拒否のボタンが出ます。'); dirty=true; } else $('pairErr').hidden=false; };
  $('bPair').addEventListener('click',tryPair);
  $('pairIn').addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); tryPair(); } });
  $('bPairDemo').addEventListener('click',()=>{ $('pairIn').value=G.ap.code; tryPair(); }); }

/* ================= adding a channel ================= */
let addCwd='~/dev/docs-site';
const NAMES={'~/dev/fogcast':'lead','~/dev/fogcast-ui':'ui','~/dev/shop-api':'api','~/dev/docs-site':'docs'};
const SK={'~/dev/fogcast':'lead','~/dev/fogcast-ui':'ui','~/dev/shop-api':'api','~/dev/docs-site':'docs'};
function nameFor(cwd){ const b=NAMES[cwd]||'new'; const n=CH.filter(c=>c.name===b||c.name.startsWith(b+'-')).length; return n? `${b}-${n+1}` : b; }
function openAdd(){ if(LIVE) return liveAdd();
  openSheet(`<div class="hd"><span class="tag teal">新しいチャンネル</span><button class="btn small" type="button" data-close>閉じる</button></div>
    <h2 id="sheetT">チャンネルを追加</h2>
    <p class="sub">VS Code のターミナルで新しいタブを開き、下のコマンドを実行すると、Fogcast が自動でここに新しいチャンネルとして映します。同じリポジトリで並行して作業するときは、git worktree で作業フォルダを分けるとファイルの変更がぶつかりません。</p>
    <fieldset class="projs" id="projs"></fieldset>
    <div class="found" id="found"></div>
    <div class="cmd"><code id="cmdTxt"></code><button class="btn small" type="button" id="bCopy">コピー</button></div>
    <div class="btns"><button class="btn primary" type="button" id="bLaunch">デモで起動する</button></div>
    <h3>過去のセッション</h3><ul class="past" id="past"></ul>`);
  renderAdd(); }
function renderAdd(){
  $('projs').innerHTML=`<legend class="note" style="padding:0;margin-bottom:6px">起動するフォルダ</legend>`+Object.keys(PROJECTS).map(k=>`<label><input type="radio" name="proj" value="${k}" ${k===addCwd?'checked':''}><span>${k}</span><small>${PROJECTS[k].branch}${PROJECTS[k].tree?' · worktree':''}</small></label>`).join('');
  $('projs').querySelectorAll('input').forEach(i=>i.addEventListener('change',()=>{ addCwd=i.value; renderAdd(); const r=$('projs').querySelector('input:checked'); r&&r.focus(); }));
  $('found').innerHTML=foundHTML(loadedFor(addCwd));
  $('cmdTxt').textContent=`cd ${addCwd} && claude`;
  $('bCopy').onclick=()=>copy($('cmdTxt').textContent,$('cmdTxt'));
  $('bLaunch').onclick=()=>{ closeSheet(); launch(addCwd); };
  $('past').innerHTML=PAST.map((p,i)=>`<li><b>${esc(p.n)}</b><small>${esc(p.cwd)} · ${esc(p.t)} · ${p.id}</small><span class="btns"><button class="btn small" type="button" data-c="${i}">コマンドをコピー</button><button class="btn small" type="button" data-r="${i}">デモで再開</button></span></li>`).join('')||'<li><small>過去のセッションはありません。</small></li>';
  $('past').querySelectorAll('[data-c]').forEach(b=>b.addEventListener('click',()=>{ const p=PAST[+b.dataset.c]; copy(`cd ${p.cwd} && claude --resume ${p.id}`,b.closest('li').querySelector('small')); }));
  $('past').querySelectorAll('[data-r]').forEach(b=>b.addEventListener('click',()=>{ const p=PAST.splice(+b.dataset.r,1)[0]; closeSheet(); launch(p.cwd,{resume:p.id,title:p.n}); }));
}
function bootCard(c){ const L=c.loaded;
  add(c,`<div class="sys boot"><b>${c.resume&&c.status!=='off'?'セッションを再開しました':'セッション開始'}</b><span>${esc(c.cwd)}（${esc(c.branch)}）· ${c.model}${c.resume?` · 再開 ID ${esc(c.resume)}`:''}</span>
    <div class="row"><span>CLAUDE.md ${L.md?'あり':'なし'}</span><span>スキル ${L.skills.length}</span><span>エージェント ${L.agents.length}</span><span>MCP ${L.mcp.length}</span><span>Mod fogcast</span></div></div>`); }
function launch(cwd,o={}){
  const c=mkChannel({name:o.resume? nameFor(cwd)+'·再開' : nameFor(cwd),role:o.resume?(o.title||'再開したセッション'):'新しいセッション',cwd,script:SK[cwd]||'docs',ctx:WIN*(o.resume?.18:.02),delay:2600,resume:o.resume||null});
  c.boot=true; setTimeout(()=>{ c.boot=false; dirty=true; },1200);
  bootCard(c); if(o.resume) add(c,`<div class="sys"><b>前回の続き</b><span>${esc(o.title||'')} の要約を読み込みました。</span></div>`);
  seedBlocks(c,true); toast('start',`ch.${c.num} ${esc(c.name)} を受信しました`,`${esc(cwd)} で起動しました。`);
  select(c.num); if(!reduce){ $('screen').classList.add('power'); setTimeout(()=>$('screen').classList.remove('power'),900); }
  loop(c); dirty=true; }

/* ================= the night outside ================= */
const sky=$('sky'), sk=sky.getContext('2d'); let SW=1,SH=1,SD=1;
function skySize(){ SD=Math.min(devicePixelRatio||1,1.5); SW=sky.width=Math.max(1,Math.round(innerWidth*SD)); SH=sky.height=Math.max(1,Math.round(innerHeight*SD)); }
const DROPS=Array.from({length:180},()=>({x:Math.random(),y:Math.random(),l:.016+Math.random()*.034,v:.55+Math.random()*.6}));
const GLOWS=[{c:'255,217,49',x:.1,y:.9,r:.34},{c:'63,230,214',x:.9,y:.14,r:.38},{c:'255,150,70',x:.62,y:.96,r:.22},{c:'147,180,255',x:.34,y:.08,r:.28}];
let rainLv=.5, fogLv=.4;
function drawSky(t,dt){
  const f7=fc7(); rainLv+=(Math.min(1,G.act/3)-rainLv)*Math.min(1,dt*.5); fogLv+=(Math.max(0,Math.min(1,(f7.proj-70)/40))-fogLv)*Math.min(1,dt*.4);
  const g=sk.createLinearGradient(0,0,0,SH); g.addColorStop(0,'#0a1020'); g.addColorStop(1,'#040509'); sk.fillStyle=g; sk.fillRect(0,0,SW,SH);
  GLOWS.forEach((L,i)=>{ const x=(L.x+Math.sin(t*.05+i)*.03)*SW, y=(L.y+Math.cos(t*.04+i*2)*.03)*SH, r=L.r*Math.max(SW,SH);
    const rg=sk.createRadialGradient(x,y,0,x,y,r); rg.addColorStop(0,`rgba(${L.c},.15)`); rg.addColorStop(1,`rgba(${L.c},0)`); sk.fillStyle=rg; sk.fillRect(0,0,SW,SH); });
  for(let i=0;i<4;i++){ const y=(.2+i*.22)*SH, x=((((t*.012*(i%2?1:-1)+i*.37)%1.6)+1.6)%1.6-.3)*SW, R=SW*.55;
    sk.save(); sk.translate(x,y); sk.scale(1,.3); const rg=sk.createRadialGradient(0,0,0,0,0,R), a=.035+fogLv*.15;
    rg.addColorStop(0,`rgba(205,214,235,${a.toFixed(3)})`); rg.addColorStop(1,'rgba(205,214,235,0)'); sk.fillStyle=rg; sk.beginPath(); sk.arc(0,0,R,0,6.283); sk.fill(); sk.restore(); }
  if(!reduce){ const n=Math.round(50+rainLv*130); sk.strokeStyle=`rgba(190,215,255,${(.08+rainLv*.14).toFixed(3)})`; sk.lineWidth=SD; sk.beginPath();
    for(let i=0;i<n;i++){ const d=DROPS[i]; d.y+=d.v*dt*(.7+rainLv*.9); if(d.y>1.05){ d.y=-.05; d.x=Math.random(); } const x=d.x*SW, y=d.y*SH, l=d.l*SH; sk.moveTo(x,y); sk.lineTo(x-l*.1,y+l); }
    sk.stroke(); } }
function drawCard(cv,name,a){ if(!cv||!cv._d||!name) return; const x=cv.getContext('2d'), d=cv._d; x.setTransform(d,0,0,d,0,0); const w=cv.width/d, h=cv.height/d; x.clearRect(0,0,w,h); art(x,w,h,name,TT,a,0); }
let last=performance.now(), TT=0, frameNo=0;
function frame(now){ const raw=Math.min(.05,(now-last)/1000); last=now; frameNo++;
  const dt=G.paused?0:raw*(reduce?.3:1); TT+=dt;
  drawSky(TT,dt);
  if(rtab==='L'&&deckView==='card'){ LINKS.forEach(l=>{ const o=cardEls[l.id]; if(!o||o.el.hidden||!o.vis) return; const on=l.live.size>0;
      o.act+=((on?1:.06)-o.act)*Math.min(1,dt*2.5);
      if(on||o.act>.09||o.need){ drawCard(o.cv,l.art,o.act); o.need=false; } }); }
  if(cut.l&&Date.now()<cut.until) drawCard(cut.cv,cut.l.art,1);
  if(co) coFrame(raw);
  requestAnimationFrame(frame); }

/* ================= ticks ================= */
const ORDER={sun:0,cloud:1,rain:2,fog:3};
function secondTick(){
  if(LIVE) liveTick();
  if(!G.paused&&!LIVE){ G.act+=(working()-G.act)*.04;
    if(Date.now()>G.five.resetAt){ G.five.pc=0; G.five.resetAt=Date.now()+5*H; G.warned.five80=G.warned.five90=0; toast('wx','5時間枠がリセットされました','次のリセットは 5 時間後です。'); }
    const f=fc5(), f7=fc7();
    if(G.lastWx5&&ORDER[f.wx]>ORDER[G.lastWx5]&&Date.now()-G.wxAt>45000){ G.wxAt=Date.now(); toast('wx',`5時間枠の予報が「${WXN[f.wx]}」になりました`, f.hit? `このペースだと ${hm(f.hit)} に上限に達します。` : `リセット時に約 ${Math.round(f.proj)}% の見込みです。`); }
    if(f7.hit&&!G.warned.fog7){ G.warned.fog7=1; toast('wx','週の枠が尽きる予報です',`このペースだと ${md(f7.hit)}（${wkd(f7.hit)}）${hm(f7.hit)}ごろ。リセットは ${md(G.seven.resetAt)}（${wkd(G.seven.resetAt)}）${hm(G.seven.resetAt)} です。`); }
    if(!f7.hit) G.warned.fog7=0;
    G.lastWx5=f.wx; }
  renderHud(); if(rtab==='F') renderForecast(); if(sel&&chN(sel)) renderOsd(chN(sel));
  CH.forEach(c=>{ c.blocks=c.blocks.filter(b=>!b.e||b.e>Date.now()-70*60000); });
}
function renderCore(){ if(sel&&!chN(sel)) select(0); renderChs(); if(sel===0) renderWall(); else { renderOsd(chN(sel)); ctlHint(); } if(rtab==='L') updateDeck(); if(rtab==='D') renderDetail(); if(rtab==='S') renderSkills(); coSync(); renderLvChip(); renderStv(); renderSetBtn(); }
setInterval(()=>{ if(dirty){ dirty=false; renderCore(); } },250);
setInterval(secondTick,1000);
setInterval(()=>{ if(sel===0) renderGuide(); },2000);

/* ================= boot ================= */
function seedBlocks(c,fresh){ if(fresh) return; let s=c.num*97+13; const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
  const E=EARLIER[c.sk]||[]; let t=Date.now()-64*60000, i=0; const end=c.endedAt||Date.now()-90000;
  while(t<end){ t+=(1.5+rnd()*5)*60000; if(t>=end) break; const e=Math.min(end,t+(2+rnd()*5)*60000), label=E.length? E[i%E.length].p : '作業'; i++;
    if(rnd()<.35){ const w=Math.min(e,t+(.6+rnd())*60000); c.blocks.push({s:t,e:w,k:'work',label},{s:w,e:Math.min(e,w+45000),k:'wait',label},{s:Math.min(e,w+45000),e,k:'work',label}); }
    else c.blocks.push({s:t,e,k:'work',label});
    t=e; } }
function earlier(c){ (EARLIER[c.sk]||[]).forEach(e=>{ const num=++c.turnNo; const li=document.createElement('li'); li.className='turn folded';
    li.innerHTML=`${foldHTML(num,null,esc(e.p),`${e.ops}件の操作 · +${fmt(e.tok)} · ${e.sec}秒`)}
      <div class="full">${youHTML(esc(e.p),'ターミナルから',null)}<div class="sys"><span>このターンの細かい記録は、受け皿に保存された履歴から読み込みます（デモでは省略しています）。</span></div><div class="turnFt"><span>${e.ops}件の操作</span><span>コンテキスト +${fmt(e.tok)}</span><span>${e.sec}秒</span></div></div>`;
    foldBind(li); c.log.appendChild(li); c.perTurn.push(e.tok); }); }
