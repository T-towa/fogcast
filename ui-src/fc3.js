
/* ================= account-wide limits (all terminals share them) ================= */
const T0=Date.now();
function nextReset(){ const d=new Date(T0+2*DAY); d.setHours(9,0,0,0); if(d.getTime()-T0<1.6*DAY) d.setDate(d.getDate()+1); return d.getTime(); }
const G=LIVE? {paused:false,act:0,five:{pc:0,resetAt:T0+5*H,none:true},seven:{pc:0,resetAt:T0+7*DAY,none:true},past:{},pace5:null,pace7:null,warned:{},lastWx5:null,lastWx7:null,wxAt:0,ap:{on:false,paired:false,code:''}}
  : {paused:false,act:1.6,five:{pc:44,resetAt:T0+(2*60+14)*60000},seven:{pc:68,resetAt:nextReset()},past:{},warned:{},lastWx5:null,lastWx7:null,wxAt:0,ap:{on:false,paired:false,code:'4821-7730'}};
if(!LIVE) (function(){ const start=G.seven.resetAt-7*DAY, days=[]; for(let d=dayStart(start); d<dayStart(T0); d+=DAY) days.push(d);
  const wts=days.map((d,i)=>{ const w=new Date(d).getDay(); return (w===0?.35:w===6?.5:1)*(i===0?.7:1)*(.8+.4*((i*37)%10)/10); });
  const sum=wts.reduce((a,b)=>a+b,0)||1, total=G.seven.pc-14; days.forEach((d,i)=>{ G.past[d]=total*wts[i]/sum; }); })();
const pastSum=()=>Object.values(G.past).reduce((a,b)=>a+b,0);
const working=()=>CH.filter(c=>c.status==='work').length;
const pace5=()=>LIVE? (G.pace5||0) : 8+6*G.act;      /* % per hour */
const pace7=()=>LIVE? (G.pace7||0) : 10+3*G.act;  /* % per day */
function fc5(){ const left=Math.max(0,G.five.resetAt-Date.now()), proj=G.five.pc+pace5()*left/H; return {left,proj,wx:wxOf(proj),hit:proj>=100? Date.now()+(100-G.five.pc)/pace5()*H : null}; }
function fc7(){ const left=Math.max(0,G.seven.resetAt-Date.now()), proj=G.seven.pc+pace7()*left/DAY; return {left,proj,wx:wxOf(proj),hit:proj>=100? Date.now()+(100-G.seven.pc)/pace7()*DAY : null}; }
const wkd=t=>DOW[new Date(t).getDay()];

/* ================= channels ================= */
const CH=[]; let sel=0, rtab='F', dirty=true;
const chN=n=>CH.find(c=>c.num===n);
const STL={work:'作業中',wait:'承認待ち',idle:'入力待ち',off:'終了'};
/* a channel waiting on a question (AskUserQuestion) waits for an answer, not an approval */
const stl=c=> c.status==='wait'&&c.ask? '回答待ち' : STL[c.status];
const pct=c=>Math.round(c.ctx/(c.win||WIN)*100);
function mkChannel(o){
  const P=PROJECTS[o.cwd];
  const c={num:CH.length+1,name:o.name,role:o.role,cwd:o.cwd,branch:P.branch,model:'Opus 5.5',status:o.off?'off':'idle',now:o.off?'セッションは終了しています':'入力待ち',
    active:null,ops:o.ops||[],ctx:o.ctx,tok:o.tok||0,cost:o.cost||0,perTurn:[],tasks:[],files:{},agents:[],queue:[],script:SCRIPTS[o.script]||[],sk:o.script,idx:0,
    turnId:0,loopId:0,turnNo:0,blocks:[],delay:o.delay||0,effort:o.effort||'medium',models:{...DEMO_MODELS,options:[...DEMO_MODELS.options]},resume:o.resume||null,loaded:loadedFor(o.cwd),endedAt:o.off?Date.now()-(o.endedAgo||20)*60000:null,phaseAt:Date.now(),warned85:false,boot:false};
  c.log=document.createElement('ol'); c.log.className='log'; c.log.hidden=true; c.log.setAttribute('aria-label',`ch.${c.num} ${o.name} の会話`);
  $('logs').appendChild(c.log); CH.push(c); return c;
}
function sig(c){ const p=pct(c), on=Math.max(1,Math.ceil((1-p/100)*5)); return `<span class="sig ${p>88?'bad':p>70?'low':''}" title="コンテキストの空き">${[1,2,3,4,5].map(i=>`<i class="${i<=on?'on':''}"></i>`).join('')}</span>`; }
const fogOf=c=> c.status==='off'? 0 : Math.max(0,Math.min(1,(pct(c)-55)/40));

/* ================= header ================= */
let chsKey=null;
function renderChs(){
  const key=CH.map(c=>c.num+c.name).join('|');
  if(key!==chsKey){ chsKey=key;
    $('chs').innerHTML=`<button class="ch" type="button" role="tab" data-n="0"><span class="in"><span class="n">0</span><span class="nm">全体</span></span></button>`+
      CH.map(c=>`<button class="ch" type="button" role="tab" data-n="${c.num}"><span class="in"><span class="n">${c.num}</span><span class="nm">${esc(c.name)}</span><i class="dot"></i></span></button>`).join('')+
      `<button class="ch add" type="button" id="bAdd" aria-label="チャンネルを追加"><span class="in"><span class="nm">＋ 追加</span></span></button>`;
    $('chs').querySelectorAll('.ch[data-n]').forEach(b=>b.addEventListener('click',()=>select(+b.dataset.n)));
    $('bAdd').addEventListener('click',openAdd); }
  $('chs').querySelectorAll('.ch[data-n]').forEach(b=>{ const n=+b.dataset.n, c=chN(n); b.setAttribute('aria-selected',String(n===sel));
    if(c){ b.querySelector('.dot').className='dot '+c.status; b.title=`ch.${n} ${c.name}：${stl(c)}`; } });
  $('knob').querySelector('.kn').style.setProperty('--ang',(-110+(sel? CH.findIndex(c=>c.num===sel)+1 : 0)*(220/Math.max(1,CH.length)))+'deg');
  $('rxTxt').textContent= LIVE&&!LV.connected? '受け皿に接続しています…' : `受信中 ${CH.filter(c=>c.status!=='off').length} チャンネル${G.ap.on?' · 承認オン':''}`;
  $('rx').classList.toggle('lost',LIVE&&!LV.connected);
}
function renderHud(){ const d=new Date(), f=fc5();
  $('hDate').textContent=`${d.getMonth()+1}/${d.getDate()}`; $('hDow').textContent=DOW[d.getDay()]; $('hTod').textContent=TOD(d.getHours());
  $('hWx').innerHTML=WX[f.wx];
  if(G.five.none){ $('hLim').textContent='5時間枠 —'; $('hLim7').textContent='週の枠 —'; $('hud').setAttribute('aria-label','天気予報を開く。使用枠の情報はまだありません'); return; }
  $('hLim').innerHTML= f.hit? `5時間枠 <em>${G.five.pc.toFixed(0)}%</em> → <em>${hm(f.hit)}</em> に上限` : `5時間枠 <em>${G.five.pc.toFixed(0)}%</em> → 予報 <em>${Math.round(f.proj)}%</em>`;
  $('hLim7').innerHTML=`週の枠 <em>${G.seven.pc.toFixed(0)}%</em> · リセット ${md(G.seven.resetAt)}（${wkd(G.seven.resetAt)}）`;
  $('hud').setAttribute('aria-label',`天気予報を開く。5時間枠 ${G.five.pc.toFixed(0)}%、予報は${WXN[f.wx]}`);
}

/* ================= TV: every channel ================= */
let tilesKey=null;
function wallEmpty(){
  if(LIVE&&!LV.token) return `<div class="wallEmpty"><b>まだこの画面はつながっていません</b><span>ターミナルの Claude Code で <code>/fog</code> を実行すると、鍵の付いたこの画面が開き直されます。ブラウザが開かないときは、<code>/fog</code> のあとターミナルの通知に出る URL（<code>#k=</code> 付き）を開いてください。</span></div>`;
  if(LIVE&&!LV.connected) return `<div class="wallEmpty"><b>受け皿に接続しています…</b><span>つながらないときは、ターミナルで <code>/fog</code> を実行してください。</span></div>`;
  return `<div class="wallEmpty"><b>まだチャンネルがありません</b><span>VS Code のターミナルで <code>claude</code> を起動すると、ここに新しいチャンネルとして映ります。</span></div>`; }
function renderWall(){
  if(!CH.length){ const h=wallEmpty(); if($('tiles').innerHTML!==h) $('tiles').innerHTML=h; tilesKey=null; $('wSum').innerHTML=''; return; }
  const key=CH.map(c=>c.num).join(',');
  if(key!==tilesKey){ tilesKey=key;
    $('tiles').innerHTML=CH.map(c=>`<button class="tile" type="button" data-n="${c.num}"><span class="fogl"></span><span class="bars"></span><span class="hd"><span class="n">${c.num}</span><span class="nm">${esc(c.name)}</span><span class="chip"></span></span><span class="meta"></span><span class="now"></span><span class="ops"></span><span class="ft"></span></button>`).join('');
    $('tiles').querySelectorAll('.tile').forEach(t=>t.addEventListener('click',()=>select(+t.dataset.n))); }
  CH.forEach(c=>{ const t=$('tiles').querySelector(`.tile[data-n="${c.num}"]`); if(!t) return;
    t.className='tile '+c.status+(c.boot?' boot':'');
    t.setAttribute('aria-label',`ch.${c.num} ${c.name}、${stl(c)}。開く`);
    const ch=t.querySelector('.chip'); ch.className='chip '+c.status; ch.textContent=stl(c);
    t.querySelector('.meta').textContent=`${c.role} · ${c.cwd} · ${c.branch}`;
    t.querySelector('.now').innerHTML=c.now;
    t.querySelector('.ops').innerHTML=c.ops.slice(-7).map((id,i,a)=>{ const l=LINK[id]; return l? `<i class="${i===a.length-1&&c.active===id?'on':''}" title="${esc(l.label)}">${l.num}·${esc(l.label.length>10?l.label.slice(0,9)+'…':l.label)}</i>` : ''; }).join('');
    t.querySelector('.ft').innerHTML=`<span>${sig(c)} コンテキスト <b>${pct(c)}%</b></span><span class="tk"><b>${fmt(c.tok)}</b> tokens</span><span><b>$${c.cost.toFixed(2)}</b></span>`;
    t.querySelector('.fogl').style.setProperty('--fog',fogOf(c).toFixed(2)); });
  const n=k=>CH.filter(c=>c.status===k).length, asks=CH.filter(c=>c.status==='wait'&&c.ask).length;
  const sum=`作業中 <b>${n('work')}</b> · 承認待ち <b>${n('wait')-asks}</b>${asks?` · 回答待ち <b>${asks}</b>`:''} · 入力待ち <b>${n('idle')}</b> · 終了 <b>${n('off')}</b>${n('off')?'<button class="tidy" type="button" id="bTidy">終了したチャンネルを片付ける</button>':''}`;
  if($('wSum').dataset.k!==sum){ $('wSum').dataset.k=sum; $('wSum').innerHTML=sum; }
}
let guideKey=null;
function renderGuide(){
  const now=Date.now(), R=60*60000, t0=now-R, pos=t=>Math.max(0,Math.min(100,(t-t0)/R*100));
  const key=CH.map(c=>c.num).join(',');
  if(key!==guideKey){ guideKey=key;
    $('guide').innerHTML=CH.map(c=>`<button class="gLab" type="button" data-n="${c.num}" aria-label="ch.${c.num} ${esc(c.name)} を開く"><span class="n">${c.num}</span><span class="nm">${esc(c.name)}</span></button><div class="gRow" data-n="${c.num}"></div>`).join('')+`<div class="gAxis" id="gAxis"></div>`; }
  CH.forEach(c=>{ const row=$('guide').querySelector(`.gRow[data-n="${c.num}"]`); if(!row) return;
    let h=''; c.blocks.forEach(b=>{ const e=b.e||now; if(e<t0) return; const l=pos(b.s), w=Math.max(.25,pos(e)-l);
      h+=`<span class="gB ${b.k}${b.e?'':' live'}" style="left:${l.toFixed(2)}%;width:${w.toFixed(2)}%" title="${esc(b.label)}">${b.k==='wait'?'承認待ち':esc(b.label)}</span>`; });
    if(c.endedAt&&c.endedAt>t0) h+=`<span class="gEnd" style="left:${pos(c.endedAt).toFixed(2)}%"><span>終了</span></span>`;
    row.innerHTML=h+'<span class="gNow"></span>'; });
  $('gAxis').innerHTML=[60,45,30,15].map(m=>`<span style="left:${(60-m)/60*100}%">${hm(now-m*60000)}</span>`).join('')+`<span style="left:100%">いま ${hm(now)}</span>`;
}

/* ================= TV: one channel ================= */
function renderOsd(c){
  // the model and effort are buttons (their pickers): drawn again only when something in the line changed, so a press is never lost
  const off=c.status==='off', old=LIVE&&!c.models&&!off;      // a terminal on an earlier Fogcast: its pickers come with a restart
  const lock=off||old? ` disabled${old?' title="このターミナルの Fogcast は前の版です。claude を起動し直すと使えます"':''}` : '';
  const html=`<span class="n">ch.${c.num}</span><span class="nm">${esc(c.name)}</span><span class="meta" title="${esc(`${c.role} · ${c.cwd} · ${c.branch}`)}">${esc(c.role)} · ${esc(c.cwd)} · ${esc(c.branch)}</span>
    <span class="picks"><button class="osdPick" type="button" data-pick="model"${lock||' title="モデルを切り替える"'}>${esc(c.model||'モデル')}</button><button class="osdPick" type="button" data-pick="effort"${lock||' title="考える深さ（effort）を変える"'}>effort <b>${esc(effortLabel(c.effort))}</b></button></span>
    <span class="right"><span class="chip ${c.status}">${stl(c)}</span><span>${sig(c)} コンテキスト <b>${pct(c)}%</b></span><span class="tk"><b>${fmt(c.tok)}</b> tokens</span><span><b>$${c.cost.toFixed(2)}</b></span></span>`;
  if($('osd').dataset.k!==html){ $('osd').dataset.k=html; $('osd').innerHTML=html; }
  const el=c.status==='off'? '' : `${Math.floor((Date.now()-c.phaseAt)/1000)}s`;
  $('live').innerHTML=`<i class="dot ${c.status}"></i><span class="txt">${c.now}</span><span class="el">${el}</span>`;
  const busy=c.status==='work'||c.status==='wait';
  $('ask').disabled=off; $('bSend').disabled=off; $('bStop').disabled=!busy; $('bCompact').disabled=off; $('bForget').hidden=!off; $('bSend').hidden=off;
  // the dim suggestion sits in the empty box, as in the terminal
  $('ask').placeholder= off? 'このセッションは終了しています。「詳細」から再開コマンドをコピーできます' : c.suggest&&c.status==='idle'? `${c.suggest}　（Tab で入力）` : `ch.${c.num} ${c.name} に送る（Enter で送信、Shift+Enter で改行）`;
  $('sfog').style.setProperty('--fog',(fogOf(c)*.8).toFixed(2)); $('screen').classList.toggle('off',off);
}

/* ================= rail: forecast ================= */
function meter(now,proj){ const n=Math.min(100,now), p=Math.min(100,proj);
  return `<div class="meter" role="img" aria-label="現在 ${Math.round(now)}%、予報 ${Math.min(100,Math.round(proj))}%"><span class="now" style="width:${n}%"></span><span class="fut${proj>=100?' over':''}" style="left:${n}%;width:${Math.max(0,p-n)}%"></span><span class="tick" style="left:calc(80% - 1px)"></span></div><div class="scale"><span>0</span><span>50</span><span>80</span><span>100%</span></div>`; }
function calCells(){
  const f=fc7(), today=dayStart(Date.now()), rs=dayStart(G.seven.resetAt), fogDay=f.hit? dayStart(f.hit) : null, out=[];
  for(let d=dayStart(G.seven.resetAt-7*DAY); d<=rs; d+=DAY){
    const w=new Date(d).getDay(); let u, kind;
    if(d<today){ u=G.past[d]||0; kind='past'; }
    else if(d===today){ u=Math.max(0,G.seven.pc-pastSum()); kind='today'; }
    else { u=pace7()*(d===rs? (G.seven.resetAt-d)/DAY : 1); kind='fut'; }
    const fog=fogDay!=null&&d===fogDay, gone=fogDay!=null&&d>fogDay, fut=kind==='fut';
    const tg= kind==='today'? '<span class="tg">今日</span>' : fog? '<span class="tg fg">上限</span>' : d===rs? '<span class="tg rs">リセット</span>' : '';
    // past days and today carry what was used and open that day's record; days ahead show only their weather
    const cls=`day ${fut?'fut':''} ${kind==='today'?'today':''} ${fog?'fog':''} ${gone?'gone':''} ${w===6?'sat':w===0?'sun':''}`;
    const inner=`${tg}<span class="dt">${new Date(d).getDate()}</span><span class="dw">${DOW[w]}</span>${WX[fog?'fog':dayWx(u)]}${fut?'':`<span class="u">${Math.round(u)}%</span><span class="bar"><i style="width:${Math.min(100,u/25*100)}%"></i></span>`}`;
    out.push(fut? `<div class="${cls}" title="${md(d)}（${DOW[w]}）の予報">${inner}</div>`
      : `<button type="button" class="${cls}" data-d="${d}" title="${md(d)}（${DOW[w]}）使用 ${Math.round(u)}% · 押すとこの日の記録">${inner}</button>`);
  }
  return out.join('');
}
/* one day of the week: what was used, by channel, and what for */
const dk=d=>{ const x=new Date(d); return `${x.getFullYear()}-${p2(x.getMonth()+1)}-${p2(x.getDate())}`; };
function demoDay(d){ const today=d===dayStart(Date.now()), u= today? Math.max(0,G.seven.pc-pastSum()) : (G.past[d]||0);
  if(today) return { turns:CH.reduce((a,c)=>a+c.turnNo,0), tok:CH.reduce((a,c)=>a+c.tok,0), cr:0, usd:CH.reduce((a,c)=>a+c.cost,0),
    chans:CH.map(c=>({name:c.name,turns:c.turnNo,tok:c.tok,usd:c.cost})).sort((a,b)=>b.tok-a.tok),
    links:LINKS.filter(l=>l.kind!=='core'&&l.today>0).map(l=>({id:l.id,label:l.label,kind:l.kind,n:l.today})).sort((a,b)=>b.n-a.n).slice(0,15) };
  if(u<=0) return null;
  const rnd=n=>{ const x=Math.sin(d/864e5*(n+1.7))*1e4; return x-Math.floor(x); }, names=['lead','ui','api','docs'], tok=Math.round(u*52000);
  const sh=names.map((_,i)=>.25+rnd(i)), sum=sh.reduce((a,b)=>a+b,0);
  const chans=names.map((name,i)=>({name,turns:Math.max(1,Math.round(u*1.7*sh[i]/sum)),tok:Math.round(tok*sh[i]/sum),usd:Math.round(u*.95*sh[i]/sum*100)/100})).sort((a,b)=>b.tok-a.tok);
  const links=LINKS.filter(l=>l.kind!=='core'&&l.uses>0).sort((a,b)=>b.uses-a.uses).slice(0,10).map((l,i)=>({id:l.id,label:l.label,kind:l.kind,n:Math.max(1,Math.round(u*(1.5-i*.12)*(.6+rnd(i+7))))})).sort((a,b)=>b.n-a.n);
  return { turns:chans.reduce((a,x)=>a+x.turns,0), tok, cr:tok*6, usd:chans.reduce((a,x)=>a+x.usd,0), chans, links }; }
function openDay(d){ const w=new Date(d).getDay(), today=d===dayStart(Date.now()), r= LIVE? (G.daily||{})[dk(d)] : demoDay(d);
  const pc= today? Math.max(0,G.seven.pc-pastSum()) : (G.past[d]||0);
  const body= !r? `<p class="sub">この日の記録はありません。${LIVE?'日ごとの記録は、受け皿が動いているあいだの分を残しています（0.2.0 から）。':''}</p>` : `
    <div class="dayfacts"><div><b>${Math.round(pc)}%</b><span>週の枠</span></div><div><b>${r.turns}</b><span>ターン</span></div><div><b>${fmt(r.tok)}</b><span>トークン</span></div><div><b>$${r.usd.toFixed(2)}</b><span>料金</span></div></div>
    <h3>チャンネル別</h3>${r.chans.length? `<div class="tw"><table class="tbl"><thead><tr><th>チャンネル</th><th class="num">ターン</th><th class="num">トークン</th><th class="num">料金</th></tr></thead><tbody>${r.chans.map(x=>`<tr><td>${esc(x.name)}</td><td class="num">${x.turns}</td><td class="num">${fmt(x.tok)}</td><td class="num">$${x.usd.toFixed(2)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="note">チャンネルの記録はありません。</p>'}
    <h3>よく使ったもの</h3>${r.links.length? `<ul class="daylinks">${r.links.map(x=>`<li><span class="k k-${x.kind}">${KIND[x.kind]||x.kind}</span><b>${esc(x.label)}</b><span class="n">${x.n} 回</span></li>`).join('')}</ul>` : '<p class="note">ツールやスキルは使われていません。</p>'}
    <p class="note">トークンは入力・出力・キャッシュ作成の合計です（キャッシュの読み込み ${fmt(r.cr)} は含みません）。料金は、Claude Code が数えた金額のうち、この日に増えた分です。</p>`;
  openSheet(`<div class="hd"><span class="tag teal">${today?'今日':'記録'}</span><button class="btn small" type="button" data-close>閉じる</button></div><h2 id="sheetT">${md(d)}（${DOW[w]}）の使用</h2>${body}`); }
function usesBlk(){ const maxT=Math.max(1,...CH.map(c=>c.tok)), tt=CH.reduce((a,c)=>a+c.tok,0), tc=CH.reduce((a,c)=>a+c.cost,0);
  return `<div class="blk"><h3>今日の使用量<small>チャンネル別のトークンとコスト</small></h3><div class="uses" style="display:grid;gap:7px">
    ${CH.map(c=>`<div class="urow"><span class="nm"><span class="n">${c.num}</span>${esc(c.name)}</span><span class="bar"><i style="width:${(c.tok/maxT*100).toFixed(1)}%"></i></span><span class="v">${fmt(c.tok)} · $${c.cost.toFixed(2)}</span></div>`).join('')}
    <div class="urow tot"><span class="nm">合計</span><span></span><span class="v">${fmt(tt)} · $${tc.toFixed(2)}</span></div></div></div>`; }
function renderForecast(){
  if(G.five.none&&G.seven.none){ $('pF').innerHTML=`<div class="blk"><h3>使用枠の天気予報</h3><p class="note">5 時間枠と週の枠の値は、Claude の応答が返ってくるたびに届きます。最初の応答のあとに予報が出ます（API キーで使っている場合は使用枠がないので出ません）。</p></div>${usesBlk()}`; return; }
  const f=fc5(), f7=fc7(), five=G.five, seven=G.seven;
  const says5= f.hit? `このペースだと <b>${hm(f.hit)}</b> に上限に達し、リセットの ${hm(five.resetAt)} まで使えません。` : (f.proj>=95? `このペースだとリセット直前に約 <b>${Math.round(f.proj)}%</b>。ぎりぎり持つ見込みです。` : `このペースならリセット時に約 <b>${Math.round(f.proj)}%</b>。上限には届かない見込みです。`);
  const says7= f7.hit? `このペースだと <b>${md(f7.hit)}（${wkd(f7.hit)}）${hm(f7.hit)}ごろ</b>に上限に達し、リセットまで使えません。` : (f7.proj>=95? `このペースだとリセット直前に約 <b>${Math.round(f7.proj)}%</b>。ぎりぎり持つ見込みです。` : `このペースならリセット時に約 <b>${Math.round(f7.proj)}%</b>。週の終わりまで持ちそうです。`);
  const maxT=Math.max(1,...CH.map(c=>c.tok)), tt=CH.reduce((a,c)=>a+c.tok,0), tc=CH.reduce((a,c)=>a+c.cost,0);
  $('pF').innerHTML=`
  <div class="blk"><h3>5時間枠<small>全チャンネル合計 · リセット ${hm(five.resetAt)}（あと ${span(f.left)}）</small></h3>
    <div class="fc"><span class="ico">${WX[f.wx]}</span><span class="big">${five.pc.toFixed(0)}%<small>予報 ${WXN[f.wx]}</small></span><span class="says${f.hit?' bad':''}">${says5}</span></div>
    ${meter(five.pc,f.proj)}
    <div class="facts"><span>今のペース <b>${pace5().toFixed(0)}% / 時</b></span><span>作業中 <b>${working()}</b> チャンネル</span></div></div>
  <div class="blk"><h3>週の枠<small>リセット ${md(seven.resetAt)}（${wkd(seven.resetAt)}）${hm(seven.resetAt)}</small></h3>
    <div class="fc"><span class="ico">${WX[f7.wx]}</span><span class="big">${seven.pc.toFixed(0)}%<small>予報 ${WXN[f7.wx]}</small></span><span class="says${f7.hit?' bad':''}">${says7}</span></div>
    ${meter(seven.pc,f7.proj)}
    <div class="cal" role="group" aria-label="週のカレンダー">${calCells()}</div>
    <p class="note">これまでの日と今日は使った割合で、押すとその日の記録が出ます。先の日は今のペースでの天気だけです（1 日 9% 未満は晴れ、18% 以上は雨、上限に届く日は霧）。</p></div>
  <div class="blk"><h3>今日の使用量<small>チャンネル別のトークンとコスト</small></h3><div class="uses" style="display:grid;gap:7px">
    ${CH.map(c=>`<div class="urow"><span class="nm"><span class="n">${c.num}</span>${esc(c.name)}</span><span class="bar"><i style="width:${(c.tok/maxT*100).toFixed(1)}%"></i></span><span class="v">${fmt(c.tok)} · $${c.cost.toFixed(2)}</span></div>`).join('')}
    <div class="urow tot"><span class="nm">合計</span><span></span><span class="v">${fmt(tt)} · $${tc.toFixed(2)}</span></div></div></div>
  <p class="note">背景の雨は今のペース、霧は週の枠の近さを表しています。</p>`;
  $('pF').querySelectorAll('.day[data-d]').forEach(b=>b.addEventListener('click',()=>openDay(+b.dataset.d)));
}

/* ================= rail: social links ================= */
let deckFilter='all', deckSort='uses', deckView='card', deckQ=''; let cardEls={};
const io='IntersectionObserver' in window? new IntersectionObserver(es=>es.forEach(e=>{ const o=cardEls[e.target.dataset.id]; if(o){ o.vis=e.isIntersecting; if(o.vis) o.need=true; } })) : null;
const DAYMS=86400000;
const isUnused=l=>l.kind!=='core'&&l.kind!=='tool'&&(l.last==null||Date.now()-l.last>30*DAYMS);
const ago=t=> t==null? '未使用' : (()=>{ const d=Math.floor((dayStart(Date.now())-dayStart(t))/DAYMS); return d<=0?'今日':d===1?'昨日':`${d}日前`; })();
const KORD={core:0,tool:1,skill:2,agent:3,mcp:4};
const SORTS={kind:(a,b)=>KORD[a.kind]-KORD[b.kind]||b.uses-a.uses||a.label.localeCompare(b.label),uses:(a,b)=>b.uses-a.uses||a.label.localeCompare(b.label),recent:(a,b)=>(b.last||0)-(a.last||0),rank:(a,b)=>b.rank-a.rank||b.uses-a.uses,cost:(a,b)=>b.dt-a.dt||b.uses-a.uses,name:(a,b)=>a.label.localeCompare(b.label)};
function cardFace(l,id){ return `<span class="face"><span class="num">${esc(l.num)}</span><canvas${id?` id="${id}"`:''}></canvas><span class="ar">${esc(l.arc)}</span></span>`; }
function buildDeck(){
  Object.values(cardEls).forEach(o=>io&&io.unobserve(o.el)); cardEls={}; deckOrderKey='';
  $('deck').innerHTML=LINKS.filter(l=>l.card).map(l=>`<button class="card k-${l.kind}${l.card==='minor'?' minor':''}" type="button" data-id="${l.id}" aria-label="${esc(l.label)}（${esc(l.num)} ${esc(l.arc)}）の詳細を開く">${cardFace(l)}<span class="lb"><b>${esc(l.label)}</b><small><span>${KIND[l.kind]}</span><span class="rk"></span></small>${l.kind==='core'?'':`<span class="pips">${'<i></i>'.repeat(10)}</span>`}</span></button>`).join('');
  $('deck').querySelectorAll('.card').forEach(b=>{ const l=LINK[b.dataset.id]; cardEls[l.id]={el:b,cv:b.querySelector('canvas'),act:.06,vis:!io,need:true}; b.addEventListener('click',()=>openCard(l.id)); if(io) io.observe(b); });
}
function deckItems(){ const q=deckQ.trim().toLowerCase();
  return LINKS.filter(l=>(deckFilter==='all'||(deckFilter==='unused'? isUnused(l) : l.kind===deckFilter))&&(!q||l.label.toLowerCase().includes(q)||String(l.arc).includes(q)||KIND[l.kind].includes(q))).sort(SORTS[deckSort]); }
let deckOrderKey='', listKey='', unusedKey='';
function rankText(l){ return l.kind==='core'? `ターン ${l.uses}` : l.uses? `R${l.rank} · ${l.uses}回` : '未使用'; }
function updateDeck(){
  const items=deckItems(), ids=new Set(items.map(l=>l.id)), carded=LINKS.filter(l=>l.card).length;
  $('deckCount').textContent=`${items.length} 件を表示（全 ${LINKS.length} 件 · カード ${carded} 枚）`;
  $('deck').hidden= deckView!=='card'; $('dlist').hidden= deckView!=='list';
  if(deckView==='card'){
    const order=items.filter(l=>cardEls[l.id]).map(l=>l.id), key=order.join(',');
    if(key!==deckOrderKey){ deckOrderKey=key; order.forEach(id=>$('deck').appendChild(cardEls[id].el)); Object.values(cardEls).forEach(o=>{ o.el.hidden=!ids.has(o.el.dataset.id); o.need=true; }); requestAnimationFrame(sizeDeck); }
    const noCard=items.filter(l=>!l.card).length;
    $('deckNote').textContent= noCard? `カードのない ${noCard} 件は「一覧」に並びます。` : '';
    LINKS.forEach(l=>{ const o=cardEls[l.id]; if(!o) return; const el=o.el;
      el.classList.toggle('on',l.live.size>0); el.classList.toggle('locked',l.kind!=='core'&&l.uses===0);
      el.querySelector('.rk').textContent=rankText(l);
      el.querySelectorAll('.pips i').forEach((p,i)=>p.classList.toggle('on',i<l.rank)); });
  } else {
    $('deckNote').textContent='';
    const key=items.map(l=>l.id+l.uses+(l.live.size?'*':'')).join(',');
    if(key!==listKey){ listKey=key;
      $('dlist').innerHTML=`<div class="lhead" aria-hidden="true"><span>番号</span><span>名前</span><span>ランク</span><span>最後</span><span>負担</span></div><ul>`+items.map(l=>`<li><button class="lrow k-${l.kind}${l.live.size?' on':''}" type="button" data-id="${l.id}"><span class="ln">${esc(l.num)}</span><span class="lnm"><b>${esc(l.label)}</b><small>${KIND[l.kind]} · ${esc(l.src)}</small></span><span class="lrk">${l.kind==='core'?'':`<span class="pips">${[...Array(10)].map((_,i)=>`<i class="${i<l.rank?'on':''}"></i>`).join('')}</span>`}<small>${rankText(l)}</small></span><span class="llast">${l.live.size?'使用中':ago(l.last)}</span><span class="ltok">${l.dt?fmt(l.dt):'—'}</span></button></li>`).join('')+`</ul>`; }
  }
  renderUnused();
}
function renderUnused(){
  const u=LINKS.filter(l=>isUnused(l)&&!(l.kind==='skill'&&!l.dt)).sort((a,b)=>b.dt-a.dt), tot=u.reduce((a,l)=>a+l.dt,0), key=u.map(l=>l.id).join(',')+tot;
  if(key===unusedKey) return; unusedKey=key;
  $('unused').innerHTML=`<h3>使っていないもの<small>30 日以上 · 合計 約 ${fmt(tot)} トークン分</small></h3>
    <ul class="list">${u.slice(0,7).map(l=>`<li><span class="st">${l.kind==='mcp'?'MCP':l.kind==='agent'?'AG':'SK'}</span><span class="x">${esc(l.label)}</span><span class="r">${ago(l.last)} · ${fmt(l.dt)}</span></li>`).join('')}</ul>
    ${u.length>7?`<p class="note">ほか ${u.length-7} 件は「使っていない」で絞り込むと見られます。</p>`:''}
    <p class="note">スキルの本文は使うときだけ読み込まれますが、名前と説明は毎回のコンテキストに入ります。手動で呼ぶだけのスキルは <code>disable-model-invocation: true</code> にすると説明が外れ、<code>/</code> からは今まで通り呼べます。使っていない MCP サーバーは、外すとツールの定義ごと空きます。</p>
    <div class="btns"><button class="btn small" type="button" id="bDoctor">/skill-doctor を実行</button></div>`;
  $('bDoctor').addEventListener('click',()=>{ const c=chN(sel)&&chN(sel).status!=='off'? chN(sel) : CH.find(x=>x.status!=='off'); if(c){ queueCmd(c,'skill-doctor',''); if(sel!==c.num) select(c.num); } });
}
function sizeCanvas(cv){ if(!cv) return; const r=cv.getBoundingClientRect(), d=Math.min(devicePixelRatio||1,2); cv.width=Math.max(1,Math.round(r.width*d)); cv.height=Math.max(1,Math.round(r.height*d)); cv._d=d; }
function sizeDeck(){ Object.values(cardEls).forEach(o=>{ if(!o.el.hidden){ sizeCanvas(o.cv); o.need=true; } }); }
$('dq').addEventListener('input',e=>{ deckQ=e.target.value; updateDeck(); });
$('ds').addEventListener('change',e=>{ deckSort=e.target.value; updateDeck(); });
$('dview').querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ deckView=b.dataset.v; $('dview').querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); listKey=''; updateDeck(); }));
$('dlist').addEventListener('click',e=>{ const b=e.target.closest('.lrow'); if(b) openCard(b.dataset.id); });

/* ================= rail: details ================= */
function foundHTML(L){ const loc=L.skills.filter(s=>isLocal(s.src)), glo=L.skills.filter(s=>!isLocal(s.src));
  return `<div><b>CLAUDE.md</b><span>${L.md?'あり（プロジェクトの指示）':'なし'}</span></div>
  <div><b>スキル（ローカル）${loc.length}</b><span>${loc.map(s=>esc(s.n)+(s.manual?'（手動）':'')).join('、')||'なし'}</span></div>
  <div><b>スキル（グローバル）${glo.length}</b><span>${glo.map(s=>esc(s.n)+(s.manual?'（手動）':'')).join('、')||'なし'}</span></div>
  <div><b>エージェント ${L.agents.length}</b><span>${L.agents.map(s=>esc(s.n)).join('、')}</span></div>
  <div><b>MCP ${L.mcp.length}</b><span>${L.mcp.map(esc).join('、')||'なし'}</span></div>
  <div><b>Mod</b><span>${L.mods.join('、')}</span></div>${L.tree?`<div><b>作業フォルダ</b><span>${esc(L.tree)}</span></div>`:''}`; }
function breakdown(c){ if(LIVE) return liveBreakdown(c); const L=c.loaded, sk=L.skills.reduce((a,x)=>a+(x.dt||0),0), mc=L.mcp.reduce((a,m)=>a+(LINK[m]?LINK[m].dt:0),0);
  const fixed=[{n:'システム',v:3200,c:'rgba(243,239,226,.45)'},{n:'ツールの定義',v:14800+L.agents.length*70,c:'#3fe6d6'},{n:'MCP',v:mc,c:'#93b4ff'},{n:'CLAUDE.md',v:L.md?2600:0,c:'#ff86c0'},{n:`スキルの説明（${L.skills.length}）`,v:sk,c:'#ffd931'}].filter(b=>b.v>0);
  const f=fixed.reduce((a,b)=>a+b.v,0); return [...fixed,{n:'会話',v:Math.max(0,c.ctx-f),c:'#f3efe2'}]; }
function turnsLeft(c){ const v=c.perTurn.slice(-5); if(!v.length) return null; const avg=v.reduce((a,b)=>a+b,0)/v.length, at=(c.loaded&&c.loaded.autoCompactAt)||(c.win||WIN)*.95; return avg>0? Math.max(0,Math.floor((at-c.ctx)/avg)) : null; }
function turnBars(c){ const v=c.perTurn.slice(-12); if(!v.length) return '<p class="note">まだターンがありません。</p>';
  const mx=Math.max(...v), W=320, Hh=70, bw=W/12;
  return `<svg class="tbars" viewBox="0 0 ${W} ${Hh+16}" role="img" aria-label="ターンごとのコンテキストの増え方。最大 ${fmt(mx)}、直近 ${fmt(v[v.length-1])}">
    <line x1="0" y1="${Hh}" x2="${W}" y2="${Hh}" stroke="rgba(243,239,226,.18)"/>
    ${v.map((x,i)=>{ const h=Math.max(2,x/mx*(Hh-14)); return `<rect x="${(i*bw+3).toFixed(1)}" y="${(Hh-h).toFixed(1)}" width="${(bw-6).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${i===v.length-1?'#ffd931':'rgba(63,230,214,.62)'}"/>`; }).join('')}
    <text x="0" y="10" fill="rgba(243,239,226,.55)" font-size="10" font-family="sans-serif">最大 +${fmt(mx)}</text>
    <text x="${W}" y="${Hh+14}" text-anchor="end" fill="#ffd931" font-size="10" font-family="sans-serif">直近 +${fmt(v[v.length-1])}</text></svg>`; }
/* ================= rail: skills — what a channel used, and what it loaded (its project's own, and everywhere's) ================= */
function skUse(c,name,src,t){ const m=c.usedSk||(c.usedSk=new Map()), x=m.get(name)||{n:name,uses:0,last:0,src:''};
  x.uses++; x.last=t||Date.now(); if(src) x.src=src; m.set(name,x); dirty=true; }
let skTab='used', skKey=null;
function renderSkills(force){
  const c=chN(sel), chans=c? [c] : CH, sk=ch=>(ch.loaded&&ch.loaded.skills)||[];
  const used=new Map();
  for(const ch of chans) for(const x of (ch.usedSk||new Map()).values()){ const y=used.get(x.n)||{n:x.n,uses:0,last:0,src:x.src,chs:new Set()}; y.uses+=x.uses; y.last=Math.max(y.last,x.last); y.src=y.src||x.src; y.chs.add(ch.num); used.set(x.n,y); }
  const srcOf=n=>{ for(const ch of chans){ const s=sk(ch).find(s=>s.n===n); if(s) return s.src; } const l=LINK[`skill:${n}`]||LINK[n]; return l? l.src : ''; };
  const local=[], glob=new Map();
  for(const ch of chans) for(const s of sk(ch)){ if(isLocal(s.src)) local.push({...s,ch}); else if(!glob.has(s.n)) glob.set(s.n,s); }
  const U=[...used.values()].sort((a,b)=>b.uses-a.uses||b.last-a.last), G2=[...glob.values()].sort((a,b)=>a.n.localeCompare(b.n));
  const key=[sel,skTab,U.map(x=>x.n+x.uses).join(','),local.map(s=>s.n).join(','),G2.length].join('|');
  if(!force&&key===skKey) return; skKey=key;
  const scope=src=> isLocal(src)? '<span class="sc loc">ローカル</span>' : '<span class="sc glo">グローバル</span>';
  const tok=a=>a.reduce((n,s)=>n+(s.dt||0),0);
  const row=(name,mid,right)=>`<li><b>${esc(name)}</b>${mid}<span class="r">${right}</span></li>`;
  // a skill only the person runs (disable-model-invocation) is never handed to Claude until it is run
  const cost=s=> s.manual? '<span class="man">手動のみ · 0</span>' : s.dt? `約 ${fmt(s.dt)}` : '';
  const manualNote=a=> a.some(s=>s.manual)? '「手動のみ」は <code>disable-model-invocation: true</code> のスキルで、<code>/</code> から実行するまで Claude には渡らないため、毎回のコンテキストを使いません。' : '';
  let body;
  if(skTab==='used') body= U.length? `<ul class="sklist">${U.map(x=>row(x.n,scope(x.src||srcOf(x.n)),`${x.uses} 回 · ${hm(x.last)}${c?'':' · '+[...x.chs].map(n=>'ch.'+n).join(' ')}`)).join('')}</ul>`
    : `<p class="note">${c?'このチャンネルでは':'どのチャンネルでも'}、まだスキルは使われていません。</p>`;
  else if(skTab==='local') body= local.length? `<ul class="sklist">${local.map(s=>row(s.n,`<span class="src">${esc(s.src)}${c?'':` · ch.${s.ch.num} ${esc(s.ch.name)}`}</span>`,cost(s))).join('')}</ul>`
    : '<p class="note">このプロジェクトの <code>.claude/skills</code> にスキルはありません。</p>';
  else body= G2.length? `<ul class="sklist">${G2.map(s=>row(s.n,`<span class="src">${esc(s.src||'—')}</span>`,cost(s))).join('')}</ul>` : '<p class="note">どこでも読み込まれるスキルはありません。</p>';
  const say= skTab==='used'? 'このセッションで呼び出されたスキルです。グローバルのスキルも、呼び出されるとコミュに加わります。'
    : skTab==='local'? `このプロジェクトの <code>.claude/skills</code> にあるスキルです。名前と説明が毎回のコンテキストに入ります（合計 約 ${fmt(tok(local))} トークン）。${manualNote(local)}`
    : `ユーザーの <code>~/.claude/skills</code>、プラグイン、組み込みのスキルで、どのプロジェクトでも読み込まれます（合計 約 ${fmt(tok(G2))} トークン）。${manualNote(G2)}`;
  $('pS').innerHTML=`<div class="blk"><h3>スキル<small>${c?`ch.${c.num} ${esc(c.name)}`:'全チャンネル'}</small></h3>
    <div class="seg sktabs" role="tablist" aria-label="スキルの種類">${[['used','使った',U.length],['local','ローカル',local.length],['global','グローバル',G2.length]].map(([k,t,n])=>`<button type="button" role="tab" data-k="${k}" aria-selected="${skTab===k}">${t}<small>${n}</small></button>`).join('')}</div>
    <p class="note">${say}</p>${body}</div>`;
  $('pS').querySelectorAll('.sktabs [data-k]').forEach(b=>b.addEventListener('click',()=>{ skTab=b.dataset.k; renderSkills(true); })); }
/* ================= your status: Lv, EXP, five abilities and records (the hub keeps them; the demo makes them up) ================= */
let stvOpen=false, stvKey='', stvBack=null;
const stPct=s=> s.to? Math.max(0,Math.min(100,(s.exp-s.from)/(s.to-s.from)*100)) : 100;
function renderLvChip(){ const s=G.status, b=$('lvChip'); if(!s){ b.hidden=true; return; } b.hidden=false;
  $('lvN').textContent=s.lv; $('lvXp').style.width=stPct(s).toFixed(1)+'%';
  const say=`ステータスを開く（Lv ${s.lv}${s.to?`、次の Lv まで あと ${fmtN(s.to-s.exp)} EXP`:''}）`; b.setAttribute('aria-label',say); b.title=say; }
function lvUp(s){ const t=toast('lv',`Lv ${s.lv} に上がりました`,`EXP ${fmtN(s.exp)}${s.to?`。次の Lv まで あと ${fmtN(s.to-s.exp)}`:''}。押すとステータスを開きます。`);
  t.style.cursor='pointer'; t.addEventListener('click',()=>{ openStatus(); t.remove(); });
  const b=$('lvChip'); b.classList.remove('up'); void b.offsetWidth; b.classList.add('up'); }
function stRadar(stats){
  const W=400,H=322,cx=200,cy=168,R=116,N=stats.length,ang=i=>-Math.PI/2+i*2*Math.PI/N,pt=(i,r)=>[cx+Math.cos(ang(i))*r,cy+Math.sin(ang(i))*r],xy=p=>p.map(v=>v.toFixed(1)).join(',');
  const val=x=>Math.min(5,x.r+(x.to!=null&&x.to>x.at? Math.max(0,Math.min(1,(x.p-x.at)/(x.to-x.at))) : 0));
  const ring=k=>stats.map((_,i)=>xy(pt(i,R*k/5))).join(' ');
  const grid=[1,2,3,4,5].map(k=>`<polygon points="${ring(k)}" fill="${k===5?'rgba(255,255,255,.03)':'none'}" stroke="rgba(243,239,226,${k===5?.32:.12})" stroke-width="${k===5?1.5:1}"/>`).join('');
  const axes=stats.map((_,i)=>{ const [x,y]=pt(i,R); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(243,239,226,.14)"/>`; }).join('');
  const at=stats.map((x,i)=>pt(i,Math.max(R*.05,R*val(x)/5)));
  const dots=stats.map((x,i)=>`<circle class="st-${x.k}" cx="${at[i][0].toFixed(1)}" cy="${at[i][1].toFixed(1)}" r="4.5" style="fill:var(--c)" stroke="#000" stroke-width="1.5"/>`).join('');
  const labels=stats.map((x,i)=>{ const [lx,ly]=pt(i,R+30), a=Math.abs(lx-cx)<8?'middle':lx<cx?'end':'start';
    return `<g class="st-${x.k}"><text x="${lx.toFixed(1)}" y="${(ly-1).toFixed(1)}" text-anchor="${a}" font-family="'Dela Gothic One',sans-serif" font-size="17" style="fill:var(--c)">${x.n}</text><text x="${lx.toFixed(1)}" y="${(ly+15).toFixed(1)}" text-anchor="${a}" font-size="11.5" fill="rgba(243,239,226,.72)">${x.r?`ランク ${x.r}`:'—'}</text></g>`; }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="能力のレーダー。${stats.map(x=>`${x.n} ランク ${x.r}`).join('、')}">${grid}${axes}<polygon class="poly" points="${at.map(xy).join(' ')}" fill="rgba(255,217,49,.26)" stroke="#ffd931" stroke-width="2.5" stroke-linejoin="round"/>${dots}${labels}</svg>`; }
function stvHTML(s){
  const R=s.rules, t=s.today, r=s.rec, left=s.to? s.to-s.exp : 0;
  const lv=`<div class="stLv"><div class="stLvN"><span class="l">Lv</span><b>${s.lv}</b>${s.lv>=s.max?'<small>最高</small>':''}</div>
    <div class="stXp"><div class="bar" role="img" aria-label="次の Lv まで ${stPct(s).toFixed(0)}%"><i data-w="${stPct(s).toFixed(1)}%"></i></div>
      <div class="nums"><span>EXP <b>${fmtN(s.exp)}</b></span><span>${s.to? `次の Lv まで あと <b>${fmtN(left)}</b>` : '最高レベルです'}</span></div></div></div>`;
  const today=`<div class="blk"><h3>今日<small>+${fmtN(t.xp)} EXP</small></h3><div class="stParts">
    <div><span>量</span><b>+${fmtN(t.vol)}</b><i class="cap" aria-hidden="true"><i style="width:${Math.min(100,t.vol/R.cap*100).toFixed(1)}%"></i></i><small>やり終えたターン ${fmtN(t.done)} 回・トークン ${fmt(t.tok)}（1 日 ${R.cap} まで）</small></div>
    <div><span>習慣</span><b>+${fmtN(t.habit)}</b><small>${t.habit? `作業した日 +${R.day}${t.habit>R.day?`・${r.streak} 日連続 +${t.habit-R.day}`:''}` : `今日はじめてターンをやり終えると +${R.day}（連続した日は上乗せ）`}</small></div>
    <div><span>初めて</span><b>+${fmtN(t.first)}</b><small>${t.first? `初めて使った道具 ${Math.round(t.first/R.first)} 種` : `初めての道具を使うと +${R.first}`}</small></div></div></div>`;
  // the last 14 days, one slot each, today at the right; a day without EXP keeps its slot
  const byD=Object.fromEntries(s.hist.map(h=>[h.d,h.xp])), d0=dayStart(Date.now()), since=dayStart(s.since);
  const days=[...Array(14)].map((_,i)=>{ const t=d0-(13-i)*DAY+12*H; return {t,xp:byD[dk(t)]||0,pre:t<since}; }), mx=Math.max(100,...days.map(h=>h.xp));
  const hist=`<div class="blk"><h3>日ごとの EXP<small>直近 14 日</small></h3><div class="stHist">
    <div class="xpBars">${days.map((h,i)=>`<i class="${i===13?'on':''}${h.xp?'':h.pre?' pre':' z'}" style="${h.xp?`height:${Math.max(3,h.xp/mx*100).toFixed(1)}%;`:''}--i:${i}" title="${md(h.t)}（${DOW[new Date(h.t).getDay()]}）${h.pre?' 記録の前':` +${fmtN(h.xp)} EXP`}"></i>`).join('')}</div>
    <div class="lab"><span>${md(days[0].t)}</span><span>今日</span></div></div>
    ${days.filter(h=>!h.pre).length<3?'<p class="note">記録を始めた日から、1 日ずつ右に積み上がります。</p>':''}</div>`;
  const abs=`<div class="blk"><h3>能力<small>使った道具で上がります</small></h3><ul class="stAbs">${s.stats.map((x,i)=>`<li class="stAb st-${x.k}" style="--i:${i}">
    <span class="nm"><b>${x.n}</b><small>${x.say}</small></span>
    <span class="pips" role="img" aria-label="ランク ${x.r} / 5">${[1,2,3,4,5].map(k=>`<i class="${k<=x.r?'on':''}"></i>`).join('')}</span>
    <span class="v">ランク ${x.r}<small>${fmtN(x.p)} pt${x.to!=null?`・次まで ${fmtN(x.to-x.p)}`:'・最高'}</small></span></li>`).join('')}</ul></div>`;
  const rec=`<div class="blk"><h3>記録<small>${md(s.since)} から</small></h3><div class="stRec">
    <div><b>${fmtN(r.days)}</b><span>作業した日</span></div><div><b>${fmtN(r.streak)}</b><span>連続（最長 ${fmtN(r.best)}）</span></div><div><b>${fmtN(r.turns)}</b><span>やり終えたターン</span></div>
    <div><b>${fmt(r.tok)}</b><span>トークン</span></div><div><b>$${(r.usd||0).toFixed(2)}</b><span>料金（目安）</span></div><div><b>${fmtN(r.kinds)}</b><span>使った道具の種類</span></div></div>
    ${s.top.length? `<ul class="stTop">${s.top.map(x=>`<li><span class="k k-${x.kind}">${KIND[x.kind]||x.kind}</span><b>${esc(x.label)}</b><span class="n">${fmtN(x.n)} 回</span></li>`).join('')}</ul>` : '<p class="note">まだ道具は使われていません。</p>'}</div>`;
  const how=`<details class="blk stHow"><summary>EXP と能力のしくみ</summary><ul>
    <li><b>量</b>：やり終えたターン 1 回で +${R.turn}、トークン ${fmtN(R.tok)} ごとに +1（入力・出力・キャッシュ作成。キャッシュの読み込みは数えません）。1 日 ${R.cap} まで。</li>
    <li><b>習慣</b>：その日はじめてターンをやり終えると +${R.day}。続けて作業した日は 1 日ごとに +${R.streak} ずつ上乗せ（+${R.streak*R.streakMax} まで）。</li>
    <li><b>初めて</b>：ツール・スキル・エージェント・MCP を初めて使うと +${R.first}。</li>
    <li><b>Lv</b>：Lv n から n+1 までに 100 × n EXP（最高 Lv ${s.max}）。</li>
    <li><b>能力</b>：使った道具 1 回ごとに 1 pt（サブエージェントは 3 pt、スキルは 2 pt）。調査＝Read・Grep・Glob・Web 検索・Explore、構築＝Edit・Write、実行＝Bash など、段取り＝サブエージェント・タスク・計画、拡張＝スキル・MCP。${s.ranks.join('・')} pt でランク 1〜5。</li>
    <li>記録は ${md(s.since)} から、Fogcast が動いているあいだの分です。料金は Claude Code が数えた目安で、実際の請求とは違うことがあります。</li></ul></details>`;
  return `<div class="stCol c1">${lv}${today}${hist}</div><div class="stCol c2"><div class="stRadar">${stRadar(s.stats)}</div>${abs}</div><div class="stCol c3">${rec}</div>${how}`; }
function renderStv(force){ if(!stvOpen) return; const s=G.status;
  const key=s? JSON.stringify([s.exp,s.today,s.rec,s.stats.map(x=>x.p),s.top.map(x=>x.n),s.hist.map(h=>h.xp)]) : 'none';
  if(!force&&key===stvKey) return; stvKey=key;
  const body=$('stvBody'), how=body.querySelector('.stHow'), open=!!(how&&how.open), y=body.scrollTop;
  body.classList.toggle('still',!force);
  $('stvSub').textContent= s? `${md(s.since)}（${wkd(s.since)}）から記録${LIVE?'':'・デモの数字です'}` : '';
  body.innerHTML= s? stvHTML(s) : `<div class="blk"><h3>まだ記録がありません</h3><p class="note">ターミナルの Fogcast がこの画面の受け皿につながると、やり終えたターンや使った道具から記録が始まります。</p></div>`;
  if(open) body.querySelector('.stHow').open=true;
  if(!force) body.scrollTop=y;
  const bar=body.querySelector('.stXp .bar i'); if(bar){ if(force&&!reduce) requestAnimationFrame(()=>requestAnimationFrame(()=>{ bar.style.width=bar.dataset.w; })); else { bar.style.transition='none'; bar.style.width=bar.dataset.w; } } }
function openStatus(){ if(stvOpen) return; if(co) coClose(); stvOpen=true; stvBack=document.activeElement;
  const el=$('stv'); el.hidden=false; el.classList.remove('out'); document.querySelector('.app').inert=true;
  renderStv(true); el.focus({preventScroll:true}); }
function closeStatus(){ if(!stvOpen) return; stvOpen=false; const el=$('stv');
  document.querySelector('.app').inert=false; el.classList.add('out');
  setTimeout(()=>{ if(!stvOpen){ el.hidden=true; el.classList.remove('out'); } },reduce?0:220);
  if(stvBack&&stvBack.focus) stvBack.focus({preventScroll:true}); }
$('lvChip').addEventListener('click',openStatus);
$('stvBack').addEventListener('click',closeStatus);

let detailKey='';
function renderDetail(force){
  const c=chN(sel);
  const key=c? [c.num,c.status,pct(c),c.perTurn.length,c.tasks.map(t=>t.st).join(''),Object.values(c.files).map(f=>f.add+'-'+f.del).join(','),c.agents.map(a=>a.st).join('')].join('|') : 'all|'+CH.map(c=>c.status+pct(c)+Math.round(c.tok/1000)).join(',');
  if(!force&&key===detailKey) return; detailKey=key;
  if(!c){
    $('pD').innerHTML=`<div class="blk"><h3>全チャンネル<small>行を押すとそのチャンネルへ</small></h3><div class="tw"><table class="tbl"><thead><tr><th>ch.</th><th>状態</th><th class="num">コンテキスト</th><th class="num">トークン</th><th class="num">コスト</th></tr></thead><tbody>
      ${CH.map(c=>`<tr data-n="${c.num}" style="cursor:pointer"><td>${c.num} ${esc(c.name)}</td><td>${stl(c)}</td><td class="num">${pct(c)}%</td><td class="num">${fmt(c.tok)}</td><td class="num">$${c.cost.toFixed(2)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="blk"><h3>この画面のしくみ</h3><p class="note">各ターミナルの Fogcast（Mod）が、会話・道具の呼び出し・使用量を localhost の受け皿に送り、この画面がそれを映しています。この画面を見ていても、Claude のコンテキストは増えません。</p></div>`;
    $('pD').querySelectorAll('tr[data-n]').forEach(tr=>tr.addEventListener('click',()=>select(+tr.dataset.n)));
    return; }
  const p=pct(c), B=breakdown(c), tl=turnsLeft(c), done=c.tasks.filter(t=>t.st==='done').length;
  const tasks= c.tasks.length? `<ul class="list">${c.tasks.map(t=>`<li class="${t.st}"><span class="st">${t.st==='done'?'✓':t.st==='doing'?'▶':'□'}</span><span class="x">${esc(t.t)}</span></li>`).join('')}</ul>` : '<p class="note">このチャンネルにタスクはありません。</p>';
  const fl=Object.entries(c.files);
  const files= fl.length? `<ul class="list">${fl.map(([f,v])=>`<li><code class="x">${esc(f)}</code><span class="r"><span class="add">+${v.add}</span> <span class="del">−${v.del}</span></span></li>`).join('')}</ul>` : '<p class="note">まだファイルは変わっていません。</p>';
  const ags= c.agents.length? `<ul class="list">${c.agents.slice(-6).reverse().map(a=>`<li><span class="st">${a.st==='run'?'▶':a.st==='stop'?'■':'✓'}</span><span class="x">${esc(a.type)} · ${esc(a.desc)}</span><span class="r">${a.st==='run'?'作業中':a.st==='stop'?'中断':'完了'}</span></li>`).join('')}</ul>` : '<p class="note">サブエージェントはまだ使われていません。</p>';
  const resume= c.status==='off'&&c.resume? `<div class="blk"><h3>続きから始める</h3><div class="cmd"><code id="rsCmd">cd ${esc(c.cwd)} && claude --resume ${esc(c.resume)}</code><button class="btn small" type="button" id="bRs">コピー</button></div><p class="note">VS Code のターミナルに貼り付けて実行すると、このチャンネルに戻ってきます。</p></div>` : '';
  $('pD').innerHTML=`${resume}
  <div class="blk"><h3>コンテキスト<small>${fmt(c.ctx)} / ${fmt(c.win||WIN)} トークン</small></h3>
    <div class="ctxBig"><b>${p}%</b>${sig(c)}<span>${tl!=null? (tl<=3? `<b style="color:var(--yolk)">自動圧縮まで あと約 ${tl} ターン</b>` : `自動圧縮まで あと約 ${tl} ターン`) : 'まだ十分に空いています'}</span></div>
    <div class="stack" role="img" aria-label="コンテキストの内訳">${B.map(b=>`<i style="width:${(b.v/(c.win||WIN)*100).toFixed(2)}%;background:${b.c}" title="${b.n} ${fmt(b.v)}"></i>`).join('')}</div>
    <ul class="legend">${B.map(b=>`<li style="--c:${b.c}"><i></i>${b.n}<b>${fmt(b.v)}</b></li>`).join('')}<li style="--c:rgba(255,255,255,.14)"><i></i>空き<b>${fmt(Math.max(0,(c.win||WIN)-c.ctx))}</b></li></ul></div>
  <div class="blk"><h3>ターンごとの増え方<small>コンテキストが増えた量</small></h3>${turnBars(c)}</div>
  <div class="blk"><h3>タスク<small>${c.tasks.length? `${done} / ${c.tasks.length} 完了`:''}</small></h3>${tasks}</div>
  <div class="blk"><h3>変更したファイル<small>このセッション</small></h3>${files}</div>
  <div class="blk"><h3>サブエージェント<small>中の作業は別のコンテキスト</small></h3>${ags}</div>
  <div class="blk"><h3>起動時に読み込んだもの<small>${esc(c.cwd)}</small></h3><div class="found" style="padding:0;background:none;border:0">${foundHTML(c.loaded)}</div></div>`;
  if($('bRs')) $('bRs').addEventListener('click',()=>copy($('rsCmd').textContent,$('rsCmd')));
}

/* ================= status line, toasts, sheets ================= */
const KT={wait:'承認待ち',ask:'質問',up:'ランクアップ',wx:'予報',compact:'圧縮',queue:'送信予約',start:'受信',info:'お知らせ',lv:'レベルアップ'};
function toast(kind,title,text,n){
  const t=document.createElement('div'); t.className='toast glass'; t.setAttribute('role','status');
  if(n) t.dataset.n=n;
  t.innerHTML=`<span class="k tag${kind==='up'||kind==='start'?' teal':''}">${KT[kind]||kind}</span><b>${title}</b>${text?`<p>${text}</p>`:''}`;
  if(n) t.addEventListener('click',()=>{ select(n); t.remove(); });
  $('toasts').append(t); while($('toasts').children.length>3) $('toasts').firstChild.remove();
  setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),400); },6500);
  return t;
}
let sheetArt=null, lastFocus=null;
function openSheet(html,cls){ lastFocus=document.activeElement; sheetArt=null; $('sheet').className='sheet'+(cls?' '+cls:''); $('sheet').innerHTML=html; $('scrim').hidden=false;
  $('sheet').querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',closeSheet));
  const f=$('sheet').querySelector('button,input'); f&&f.focus({preventScroll:true}); }
function closeSheet(){ $('scrim').hidden=true; sheetArt=null; $('sheet').className='sheet'; $('sheet').innerHTML=''; if(lastFocus&&lastFocus.focus) lastFocus.focus({preventScroll:true}); }
$('scrim').addEventListener('click',e=>{ if(e.target.id==='scrim') closeSheet(); });
function copy(text,el){ const ok=()=>toast('info','コピーしました',`<code>${esc(text)}</code>`);
  const fallback=()=>{ const r=document.createRange(); r.selectNodeContents(el); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast('info','選択しました','Ctrl+C（⌘C）でコピーしてください。'); };
  try{ navigator.clipboard.writeText(text).then(ok,fallback); }catch(e){ fallback(); } }
/* ================= コミュ: a card, opened =================
   The card covers the screen. Every card in the deck's current order rides a large wheel whose
   centre lies past the right edge (past the bottom edge on a narrow, tall screen); the card at the
   wheel's front is shown in full on the left. The wheel turns with the arrow keys, the mouse
   wheel, a drag, or a press on another card, and settles one notch at a time, like a cylinder. */
const KRGB={core:'243,239,226',tool:'63,230,214',skill:'255,217,49',agent:'255,134,192',mcp:'147,180,255'};
const mod=(a,n)=>((a%n)+n)%n;
const CO_STEP=13*Math.PI/180;
let co=null;
const coLoop=()=>co.ids.length>8;   // a long list goes round; a short one stops at its ends
const coAt=k=>{ const N=co.ids.length; if(!N) return null; if(coLoop()) return LINK[co.ids[mod(k,N)]]; return k>=0&&k<N? LINK[co.ids[k]] : null; };
const coIndex=k=>coLoop()? mod(k,co.ids.length) : Math.max(0,Math.min(Math.max(0,co.ids.length-1),k));
const coClampK=k=>coLoop()? k : Math.max(0,Math.min(Math.max(0,co.ids.length-1),k));
const coSelK=()=>co.drag? Math.round(co.F) : co.T;
const coKey=l=>[l.id,l.uses,l.today,l.rank,l.live.size,l.recent.length,l.last,Object.values(l.byCh).join('.'),(l.desc||'').length].join('|');

function openCard(id){
  let ids=deckItems().map(l=>l.id); if(!ids.includes(id)){ deckFilter='all'; deckQ=''; $('dq').value=''; coSyncRail(); ids=deckItems().map(l=>l.id); }
  const i=Math.max(0,ids.indexOf(id));
  co={ids,T:i,F:i,v:0,kc:i,drag:null,spin:null,cur:null,key:'',geo:null,hit:[],wacc:0,wt:0,flash:0,back:document.activeElement};
  const el=$('co'); el.hidden=false; el.classList.remove('out'); document.querySelector('.app').inert=true;
  coHead(); coLayout();
  if(!reduce){ co.spin={from:i-6,t0:performance.now(),d:.9}; co.F=i-6; co.kc=i-6; }
  coShow(); el.focus({preventScroll:true}); }
/* sorting and narrowing inside the overlay: the same choices as the rail's, kept in step with it */
const CO_KINDS=[['all','すべて'],['tool','ツール'],['skill','スキル'],['agent','エージェント'],['mcp','MCP'],['unused','使っていない']];
function coSyncRail(){ $('filters').querySelectorAll('.fbtn').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.k===deckFilter))); $('ds').value=deckSort; deckOrderKey=''; listKey=''; updateDeck(); }
function coHead(){ const q=deckQ.trim().toLowerCase(), hit=l=>!q||l.label.toLowerCase().includes(q)||String(l.arc).includes(q)||KIND[l.kind].includes(q);
  const n=k=>LINKS.filter(l=>hit(l)&&(k==='all'||(k==='unused'? isUnused(l) : l.kind===k))).length;
  $('coFil').innerHTML=CO_KINDS.map(([k,t])=>`<button type="button" data-k="${k}" aria-pressed="${k===deckFilter}"><span>${t}<small>${n(k)}</small></span></button>`).join('');
  $('coSort').value=deckSort;
  $('coSub').textContent= co? `${co.ids.length} 件${deckQ.trim()?` · 「${deckQ.trim()}」で絞り込み中`:''}` : ''; }
function coRefilter(){ if(!co) return; const ids=deckItems().map(l=>l.id), cur=co.cur;
  co.ids=ids; co.cur=null;
  if(!ids.length){ co.T=co.F=0; co.v=0; co.spin=null; sheetArt=null; $('coInfo').innerHTML=`<div class="coNone"><b>このグループのカードはありません</b><span>ほかの種類を選ぶか、「すべて」に戻してください。</span></div>`; $('coBig').className='card nocard'; $('coNum').textContent='—'; $('coAr').textContent=''; $('coPos').textContent='0 / 0'; coHead(); return; }
  const i=Math.max(0,ids.indexOf(cur));
  co.T=i; co.v=0; if(reduce){ co.F=i; co.spin=null; } else { co.spin={from:i-5,t0:performance.now(),d:.7}; co.F=i-5; co.kc=i-5; }
  coHead(); coShow(); }
$('coFil').addEventListener('click',e=>{ const b=e.target.closest('button[data-k]'); if(!b||!co||b.dataset.k===deckFilter) return; deckFilter=b.dataset.k; coSyncRail(); coRefilter(); });
$('coSort').addEventListener('change',e=>{ if(!co) return; deckSort=e.target.value; coSyncRail(); coRefilter(); });
function coClose(){ if(!co) return; const el=$('co'), back=co.back; co=null; sheetArt=null;
  document.querySelector('.app').inert=false; el.classList.add('out');
  setTimeout(()=>{ if(!co){ el.hidden=true; el.classList.remove('out'); } },reduce?0:220);
  if(back&&back.focus) back.focus({preventScroll:true}); }
function coLayout(){ if(!co) return; const bm=innerWidth<720&&innerHeight>innerWidth*1.05;
  co.mode=bm?'bottom':'right'; $('co').classList.toggle('bm',bm); $('coPrev').textContent=bm?'◀':'▲'; $('coNext').textContent=bm?'▶':'▼';
  sizeCanvas($('coRing')); if(sheetArt) sizeCanvas(sheetArt.cv);
  $('co').style.setProperty('--top',($('co').querySelector('.coTop').offsetHeight+28)+'px');
  const cv=$('coRing'); if(cv._d&&!bm){ const G=coGeo(cv.width/cv._d,cv.height/cv._d); $('coNav').style.right=Math.round(G.W-(G.cx-G.R)+G.r0*2.5+10)+'px'; } else $('coNav').style.right=''; }
addEventListener('resize',coLayout);

/* ---------- moving the wheel ---------- */
function coGo(k){ co.T=coClampK(k); co.spin=null; if(reduce){ co.F=co.T; co.v=0; } coShow(); }
function coStep(d){ coGo(co.T+d); }
function coJump(i){ if(!co.ids.length) return; const N=co.ids.length, cur=coIndex(co.T); let dk=i-cur; if(coLoop()){ dk=mod(dk,N); if(dk>N/2) dk-=N; }
  if(Math.abs(dk)>7&&!reduce){ co.T+=dk; co.spin={from:co.T-Math.sign(dk)*6,t0:performance.now(),d:.55}; co.F=co.spin.from; coShow(); return; }
  coGo(co.T+dk); }
function coShow(){ if(!co.ids.length) return; const k=coSelK(), l=coAt(k); if(!l) return; if(co.cur===l.id) return; co.cur=l.id; coRender(l,coIndex(k)); }
function coKeys(e){ if(!co) return false;
  if(e.key==='Escape'){ e.preventDefault(); coClose(); return true; }
  const m={ArrowDown:1,ArrowRight:1,PageDown:1,ArrowUp:-1,ArrowLeft:-1,PageUp:-1};
  if(m[e.key]&&!e.metaKey&&!e.ctrlKey&&!e.altKey){ e.preventDefault(); coStep(m[e.key]); return true; }
  if(e.key==='Home'||e.key==='End'){ e.preventDefault(); coJump(e.key==='Home'?0:co.ids.length-1); return true; }
  return false; }
// the inside of the overlay is the only thing that takes the keyboard while it is up
$('co').addEventListener('keydown',e=>{ if(e.key!=='Tab') return; const f=[...$('co').querySelectorAll('button')].filter(b=>!b.disabled&&b.offsetParent);
  if(!f.length) return; const i=f.indexOf(document.activeElement); if(e.shiftKey&&(i<=0)){ e.preventDefault(); f[f.length-1].focus(); } else if(!e.shiftKey&&i===f.length-1){ e.preventDefault(); f[0].focus(); } });
$('coBack').addEventListener('click',coClose);
$('coPrev').addEventListener('click',()=>coStep(-1));
$('coNext').addEventListener('click',()=>coStep(1));
$('co').addEventListener('wheel',e=>{ if(!co) return; const body=e.target.closest('.coBody');
  if(body&&body.scrollHeight>body.clientHeight+4) return;   // a long page scrolls first
  e.preventDefault(); const raw=Math.abs(e.deltaY)>=Math.abs(e.deltaX)? e.deltaY : e.deltaX, d=e.deltaMode===1? raw*40 : raw, now=performance.now();
  if(Math.abs(d)>=50){ if(now-co.wt>110){ co.wt=now; coStep(Math.sign(d)); } co.wacc=0; return; }
  co.wacc+=d; if(Math.abs(co.wacc)>=70&&now-co.wt>80){ co.wt=now; coStep(Math.sign(co.wacc)); co.wacc=0; } },{passive:false});
function coPt(e){ const b=$('coRing').getBoundingClientRect(); return {x:e.clientX-b.left,y:e.clientY-b.top}; }
(function(){ const w=$('coWheel');
  w.addEventListener('pointerdown',e=>{ if(!co||e.button!==0||e.target.closest('button')) return; e.preventDefault();
    co.drag={id:e.pointerId,last:coPt(e),x0:e.clientX,y0:e.clientY,moved:0,t:performance.now(),w:0}; co.spin=null; co.v=0;
    w.setPointerCapture(e.pointerId); w.classList.add('drag'); });
  w.addEventListener('pointermove',e=>{ const d=co&&co.drag; if(!d||e.pointerId!==d.id||!co.geo) return; const p=coPt(e), G=co.geo;
    const delta=G.bm? p.x-d.last.x : p.y-d.last.y, dF=-delta/(G.R*CO_STEP); d.last=p;
    co.F+=dF; if(!coLoop()) co.F=Math.max(-.45,Math.min(co.ids.length-.55,co.F));
    const now=performance.now(), dt=Math.max(.008,(now-d.t)/1000); d.t=now; d.w=d.w*.5+dF/dt*.5;
    d.moved=Math.max(d.moved,Math.hypot(e.clientX-d.x0,e.clientY-d.y0)); });
  const end=e=>{ const d=co&&co.drag; if(!d||e.pointerId!==d.id) return; co.drag=null; w.classList.remove('drag');
    if(d.moved<6){ const p=coPt(e), hit=[...co.hit].sort((a,b)=>Math.abs(a.dd)-Math.abs(b.dd)).find(it=>it.l&&Math.hypot(p.x-it.p.x,p.y-it.p.y)<it.r+8);
      if(hit) coGo(hit.k); else coGo(Math.round(co.F)); return; }
    if(performance.now()-d.t>120) d.w=0;
    co.v=Math.max(-14,Math.min(14,d.w*.6)); coGo(Math.round(co.F+Math.max(-8,Math.min(8,d.w*.22)))); };
  w.addEventListener('pointerup',end); w.addEventListener('pointercancel',end); })();

/* ---------- the page for the card in front ---------- */
const LT_STYLE=[0,1,0,2,3,0,1,2,0,0,1,2,3,0,1,0,2];
function nameHTML(s){ const ch=[...s], n=ch.length;
  const fs= n<=4? 84 : n<=7? 70 : n<=10? 58 : n<=14? 48 : n<=19? 40 : 32;
  const letter=(c,i)=>{ const code=c.codePointAt(0)||0;
    const st=/[\s\-_.:/@]/.test(c)? 2 : LT_STYLE[(i*5+code)%LT_STYLE.length], r=((code*7+i*11)%9-4)*.9, k=(st===1?.84:st===2?1.06:1)*(1+((code+i*3)%5-2)*.045);
    return `<span class="lt s${st}" aria-hidden="true" style="--i:${i};--r:${r.toFixed(1)}deg;--k:${k.toFixed(3)}">${c===' '?'&nbsp;':esc(c)}</span>`; };
  // a long name breaks after a hyphen or a space, never inside a word
  let i=0, words=[], cur=''; for(const c of ch){ const ltr=letter(c,i++); cur+=ltr; if(/[\s\-_/]/.test(c)){ words.push(cur); cur=''; } } if(cur) words.push(cur);
  return `<h2 class="coName" id="coName" style="--fs:${fs}px" aria-label="${esc(s)}">${words.map(w=>`<span class="lw">${w}</span>`).join('')}</h2>`; }
function starSVG(t){ const p=[]; for(let i=0;i<34;i++){ const a=i/34*Math.PI*2-Math.PI/2, r=i%2? 32+((i*7)%5) : 47-((i*3)%4); p.push(`${(Math.cos(a)*r).toFixed(1)},${(Math.sin(a)*r).toFixed(1)}`); }
  return `<svg class="coStar" viewBox="-52 -52 104 104" aria-hidden="true"><polygon points="${p.join(' ')}"/><text x="0" y="3" text-anchor="middle" dominant-baseline="middle"${String(t).length>2?' class="sm"':''}>${esc(t)}</text></svg>`; }
function coInfoHTML(l){
  const nx=toNext(l.uses), by=Object.entries(l.byCh), mx=Math.max(1,...by.map(([,v])=>v));
  const prev=l.rank? RANKS[l.rank-1] : 0, next=RANKS[l.rank], fill= next==null? 100 : Math.max(2,Math.min(100,(l.uses-prev)/(next-prev)*100));
  const rows= by.length? by.map(([n,v])=>{ const c=chN(+n); return `<div class="urow"><span class="nm"><span class="n">ch.${n}</span>${esc(c?c.name:'')}</span><span class="bar"><i style="width:${(v/mx*100).toFixed(1)}%"></i></span><span class="v">${v} 回</span></div>`; }).join('') : '<p class="none">この画面を開いてからは、まだ使われていません。</p>';
  const rec= l.recent.slice(-6).reverse().map(r=>`<li><span class="st">ch.${r.n}</span><span class="x">${esc(r.x)}</span><span class="r">${hm(r.t)}${r.r?' · '+esc(r.r):''}</span></li>`).join('') || '<li class="none">まだありません</li>';
  const meter= l.kind==='core'
    ? `<div class="coMeter"><span class="n">ターン ${l.uses}</span><div class="coBar"><i style="width:100%"></i></div><small>全チャンネルの通算</small></div>`
    : `<div class="coMeter"><span class="n">${next==null?`${l.uses} · MAX`:`${l.uses} / ${next}`}</span><div class="coBar"><i style="width:${fill.toFixed(1)}%"></i></div><small>${l.uses===0?'まだ使われていません':nx!=null?`次のランクまで あと ${nx} 回 · 今日 ${l.today} 回`:`最高ランクです · 今日 ${l.today} 回`}</small></div>`;
  const what=esc(l.what||'').split(esc(l.label)).join(`<em>${esc(l.label)}</em>`);
  const why= l.card? '' : `<p class="why">カードは大アルカナ 22 枚と、種類ごとのスート 14 枚ずつです。入りきらないものは一覧にだけ並び、よく使うようになれば空いたカードが回ってきます。</p>`;
  // the skill's (or agent's) own words: its SKILL.md / definition `description`, as Claude Code lists it
  const own= l.desc? `<div class="coDesc"><span class="k">${l.kind==='agent'?'エージェントの説明':'スキルの説明'}<small>${l.kind==='agent'?'定義ファイルの description':'SKILL.md の description'}</small></span><p>${esc(l.desc)}</p></div>` : '';
  return `<div class="coSrc"><b>${KIND[l.kind]}</b><span>${esc(l.src)}</span></div>
    ${nameHTML(l.label)}
    <div class="coRank">${starSVG(l.kind==='core'? '0' : l.rank)}${meter}<div class="coArc">${l.card?`<b>${esc(l.num)}</b><span>${esc(l.arc)}</span>`:'<b>—</b><span>カードなし</span>'}</div></div>
    <div class="coPw dark"><section class="coP"><h3>このカードについて</h3><p>${what}</p>${own}${why}
      <div class="coFacts"><span><i>種類</i>${KIND[l.kind]}</span><span><i>場所</i>${esc(l.src)}</span><span><i>最後に使った日</i>${l.live.size?'使用中':ago(l.last)}</span>${l.dt?`<span><i>毎回のコンテキスト</i>約 ${fmt(l.dt)} トークン</span>`:''}</div></section></div>
    <div class="coPw l1"><section class="coP"><h3>チャンネル別<small>${by.length? `${by.length} チャンネルで使用` : ''}</small></h3><div class="rows">${rows}</div></section></div>
    <div class="coPw l2"><section class="coP"><h3>最近の使用</h3><ul class="list">${rec}</ul></section></div>`; }
function coRender(l,i){ const N=co.ids.length;
  $('coInfo').classList.remove('still'); $('coInfo').innerHTML=coInfoHTML(l); co.key=coKey(l);
  const b=$('coBig');
  b.className=`card k-${l.kind}${l.card==='minor'?' minor':''}${l.card?'':' nocard'}${l.kind!=='core'&&l.uses===0?' locked':''}${l.live.size?' on':''}`;
  $('coNum').textContent=l.num; $('coAr').textContent=l.card? l.arc : '一覧のみ';
  sheetArt= l.card? {l,cv:$('coArt')} : null; if(sheetArt) sizeCanvas(sheetArt.cv);
  if(!reduce){ b.classList.remove('flip'); void b.offsetWidth; b.classList.add('flip'); }
  $('coPos').textContent=`${String(i+1).padStart(2,'0')} / ${N}`;
  $('coSay').textContent=`${i+1} / ${N}　${l.label}（${l.card?`${l.num} ${l.arc}`:'カードなし'}）`; }
// keep the open card's numbers current, without replaying its entrance
function coSync(){ if(!co||!co.cur) return; const l=LINK[co.cur]; if(coKey(l)===co.key) return;
  co.key=coKey(l); $('coInfo').classList.add('still'); $('coInfo').innerHTML=coInfoHTML(l);
  const b=$('coBig'); b.classList.toggle('on',l.live.size>0); b.classList.toggle('locked',l.kind!=='core'&&l.uses===0); }

/* ---------- drawing the wheel ---------- */
function coGeo(W,H){
  if(co.mode!=='bottom'){ const R=Math.max(300,Math.min(700,H*.68)), sel=Math.max(112,Math.min(196,W*.47));
    return {bm:false,R,cx:W-sel+R,cy:H*.5,th0:Math.PI,dir:-1,r0:Math.max(22,Math.min(38,H*.04)),W,H}; }
  const R=Math.max(300,Math.min(720,W*1.05)), sel=Math.max(96,Math.min(132,H*.62));
  return {bm:true,R,cx:W*.5,cy:H-sel+R,th0:-Math.PI/2,dir:1,r0:Math.max(22,Math.min(30,W*.062)),W,H}; }
function coPos(G,d,rad){ const th=G.th0+d*CO_STEP*G.dir, r=rad==null?G.R:rad; return {th,x:G.cx+r*Math.cos(th),y:G.cy+r*Math.sin(th)}; }
function coFrame(dt){ const c=co; if(!c) return;
  if(c.drag){}
  else if(c.spin){ const u=Math.min(1,(performance.now()-c.spin.t0)/1000/c.spin.d), e=1-Math.pow(1-u,3), prev=c.F;
    c.F=c.spin.from+(c.T-c.spin.from)*e; c.v=dt?(c.F-prev)/dt:0; if(u>=1){ c.spin=null; c.F=c.T; c.v=0; c.flash=1; } }
  else if(c.F!==c.T||c.v){ const k=150, damp=2*Math.sqrt(k)*.7; c.v+=((c.T-c.F)*k-c.v*damp)*dt; c.F+=c.v*dt;
    if(Math.abs(c.T-c.F)<.002&&Math.abs(c.v)<.01){ c.F=c.T; c.v=0; } }
  const kc=Math.round(c.F); if(kc!==c.kc){ c.kc=kc; c.flash=Math.max(c.flash,.55); if(c.drag) coShow(); }
  c.flash=Math.max(0,c.flash-dt*2.5);
  coDraw();
  if(sheetArt) drawCard(sheetArt.cv,sheetArt.l.art,sheetArt.l.live.size?1:.8); }
function coDraw(){ const c=co, cv=$('coRing'); if(!cv._d) return; const g=cv.getContext('2d'), d=cv._d; g.setTransform(d,0,0,d,0,0);
  const W=cv.width/d, H=cv.height/d; g.clearRect(0,0,W,H);
  const G=coGeo(W,H), TAU=Math.PI*2, R=G.R, tw=G.r0*.92, k0=Math.floor(c.F)-9, k1=Math.ceil(c.F)+9, out=(x,y,m)=>x<-m||x>W+m||y<-m||y>H+m;
  c.geo=G;
  // the cylinder the cards are loaded in: a dark disc whose chambers turn with them
  const hub=g.createRadialGradient(G.cx,G.cy,R*.25,G.cx,G.cy,R);
  hub.addColorStop(0,'#090c14'); hub.addColorStop(.82,'#171d2c'); hub.addColorStop(1,'#2a3348');
  g.fillStyle=hub; g.beginPath(); g.arc(G.cx,G.cy,R-tw*.5,0,TAU); g.fill();
  g.lineWidth=1; for(let i=1;i<=6;i++){ g.strokeStyle=`rgba(255,255,255,${(.02+.01*i).toFixed(3)})`; g.beginPath(); g.arc(G.cx,G.cy,R-tw*.5-i*8,0,TAU); g.stroke(); }
  const cr=R-tw*.5-G.r0*2.05;
  for(let k=k0;k<=k1;k++){ const p=coPos(G,k-c.F,cr); if(out(p.x,p.y,40)) continue;
    const hg=g.createRadialGradient(p.x-4,p.y-5,1,p.x,p.y,G.r0*.66); hg.addColorStop(0,'#000'); hg.addColorStop(1,'#202839');
    g.fillStyle=hg; g.beginPath(); g.arc(p.x,p.y,G.r0*.64,0,TAU); g.fill(); g.strokeStyle='rgba(255,255,255,.13)'; g.lineWidth=1; g.stroke(); }
  // the track the cards ride on
  g.lineWidth=tw; g.strokeStyle='#ffd931'; g.beginPath(); g.arc(G.cx,G.cy,R,0,TAU); g.stroke();
  g.lineWidth=tw*.32; g.strokeStyle=`rgba(255,255,255,${(.18+.3*c.flash).toFixed(3)})`; g.beginPath(); g.arc(G.cx,G.cy,R+tw*.16,0,TAU); g.stroke();
  g.lineWidth=3; g.strokeStyle='#000'; g.beginPath(); g.arc(G.cx,G.cy,R+tw/2,0,TAU); g.stroke(); g.beginPath(); g.arc(G.cx,G.cy,R-tw/2,0,TAU); g.stroke();
  g.lineWidth=1.5; g.strokeStyle='rgba(255,255,255,.75)'; g.beginPath(); g.arc(G.cx,G.cy,R+tw/2+3,0,TAU); g.stroke();
  // stops between the cards: they click past as the wheel turns
  for(let k=k0;k<=k1;k++){ const p=coPos(G,k+.5-c.F); if(out(p.x,p.y,20)) continue;
    g.save(); g.translate(p.x,p.y); g.rotate(p.th); g.fillStyle='#000'; g.fillRect(-tw*.5,-3,tw*.46,6); g.restore(); }
  // the cards, the front one drawn last
  const items=[];
  const big=G.bm||G.H>=520? .55 : .3;   // a short screen leaves less room around the card in front
  for(let k=k0;k<=k1;k++){ const dd=k-c.F; if(Math.abs(dd)>7) continue; const p=coPos(G,dd), near=Math.max(0,1-Math.abs(dd)), r=G.r0*(1+big*near);
    if(out(p.x,p.y,r+6)) continue; items.push({k,dd,p,r,near,l:coAt(k)}); }
  items.sort((a,b)=>Math.abs(b.dd)-Math.abs(a.dd)); c.hit=items;
  if(deckSort==='kind'&&deckFilter==='all') for(let k=k0;k<=k1;k++){ const a=coAt(k-1), b=coAt(k); if(!a||!b||a.kind===b.kind) continue;
    const p=coPos(G,k-.5-c.F,R-tw*.5-G.r0*.9); if(out(p.x,p.y,40)) continue; const t=KIND[b.kind]; g.font='400 11px "Dela Gothic One", sans-serif'; const w=g.measureText(t).width+14;
    g.save(); g.translate(p.x,p.y); g.rotate(G.bm?0:-.08); g.fillStyle='#000'; g.fillRect(-w/2,-10,w,20); g.strokeStyle='#ffd931'; g.lineWidth=1.5; g.strokeRect(-w/2,-10,w,20);
    g.fillStyle='#ffd931'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(t,0,1); g.restore(); }
  for(const it of items) coMedal(g,it,G,c); }
function coMedal(g,it,G,c){ const {p,r,l,near,dd}=it, TAU=Math.PI*2, x=p.x, y=p.y, front=Math.abs(dd)<.5;
  if(!l){ g.setLineDash([4,5]); g.lineWidth=2; g.strokeStyle='rgba(255,255,255,.22)'; g.beginPath(); g.arc(x,y,r*.75,0,TAU); g.stroke(); g.setLineDash([]); return; }
  const rgb=KRGB[l.kind]||KRGB.core;
  if(near>.04){ g.save(); g.translate(x,y); g.rotate(TT*.35); g.globalAlpha=Math.min(1,near*1.1); g.fillStyle='#ffd931'; g.beginPath();
    for(let i=0;i<26;i++){ const a=i/26*TAU, rr=i%2? r*1.2 : r*(1.5+.08*Math.sin(TT*3+i)+.12*c.flash); i? g.lineTo(Math.cos(a)*rr,Math.sin(a)*rr) : g.moveTo(Math.cos(a)*rr,Math.sin(a)*rr); }
    g.closePath(); g.fill(); g.lineWidth=3; g.strokeStyle='#000'; g.stroke(); g.restore(); }
  g.fillStyle='rgba(0,0,0,.6)'; g.beginPath(); g.arc(x+4,y+5,r+5,0,TAU); g.fill();
  g.fillStyle='#000'; g.beginPath(); g.arc(x,y,r+5,0,TAU); g.fill();
  g.fillStyle='#f6f2e6'; g.beginPath(); g.arc(x,y,r+3.2,0,TAU); g.fill();
  g.fillStyle=`rgb(${rgb})`; g.beginPath(); g.arc(x,y,r+1.3,0,TAU); g.fill();
  g.save(); g.beginPath(); g.arc(x,y,r-.5,0,TAU); g.clip(); g.fillStyle='#070a12'; g.fillRect(x-r,y-r,2*r,2*r);
  if(l.art){ g.save(); g.translate(x-r,y-r*1.1); art(g,r*2,r*2.2,l.art,TT,front?(l.live.size?1:.85):(l.live.size?.7:.28),0); g.restore();
    if(l.kind!=='core'&&l.uses===0){ g.globalCompositeOperation='saturation'; g.fillStyle='#808080'; g.fillRect(x-r,y-r,2*r,2*r); g.globalCompositeOperation='source-over'; g.fillStyle='rgba(4,6,11,.45)'; g.fillRect(x-r,y-r,2*r,2*r); } }
  else { g.fillStyle='rgba(255,255,255,.35)'; g.font=`400 ${Math.round(r*.7)}px "Dela Gothic One", sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.fillText('—',x,y+1); }
  const dim=Math.min(.6,Math.abs(dd)*.15); if(dim>.01){ g.fillStyle=`rgba(3,4,8,${dim.toFixed(3)})`; g.fillRect(x-r,y-r,2*r,2*r); }
  g.restore();
  if(l.live.size){ g.lineWidth=2.5; g.strokeStyle=`rgba(63,230,214,${(.6+.3*Math.sin(TT*4)).toFixed(3)})`; g.beginPath(); g.arc(x,y,r+9,0,TAU); g.stroke(); }
  if(Math.abs(dd)<2.6&&l.card){ const t=l.num, fz=front?13:10; g.font=`400 ${fz}px "Dela Gothic One", sans-serif`; const w=g.measureText(t).width+12;
    g.save(); g.translate(x,y+r+3); g.rotate(-.07); g.fillStyle='#000'; g.fillRect(-w/2,0,w,fz+6); g.fillStyle=front?'#ffd931':'#f6f2e6'; g.textAlign='center'; g.textBaseline='top'; g.fillText(t,0,3); g.restore(); }
  coLabel(g,it,G); }
function coLabel(g,it,G){ const {p,r,l,dd}=it, front=Math.abs(dd)<.5; if(!l) return;
  const fit=(s,max)=>{ if(g.measureText(s).width<=max) return s; let t=s; while(t.length>1&&g.measureText(t+'…').width>max) t=t.slice(0,-1); return t+'…'; };
  if(!G.bm){ const right=p.x-r-16, max=Math.max(40,right-8);
    if(front) return;
    const a=Math.max(.15,.8-Math.abs(dd)*.14); if(a<=.16) return;
    g.font='500 12px "Zen Kaku Gothic New", sans-serif'; g.fillStyle=`rgba(243,239,226,${a.toFixed(3)})`; g.textAlign='right'; g.textBaseline='middle'; g.fillText(fit(l.label,max),right,p.y); return; }
  if(Math.abs(dd)>1.4||front) return;
  g.font='500 11px "Zen Kaku Gothic New", sans-serif'; g.fillStyle='rgba(243,239,226,.6)'; g.textAlign='center'; g.textBaseline='bottom'; g.fillText(fit(l.label,G.W*.28),p.x,p.y-r-8); }
