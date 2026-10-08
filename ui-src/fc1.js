
<script>
(function(){
'use strict';
const LIVE=!!(window.FOGCAST&&window.FOGCAST.live);   /* the hub serves this page with live data; the published demo plays a script */
const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const $=id=>document.getElementById(id);
const esc=t=>String(t).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const strip=h=>String(h).replace(/<[^>]+>/g,'');
const fmt=n=> n>=1e6?(n/1e6).toFixed(2)+'M': n>=1e3?(n/1e3).toFixed(1)+'K':String(Math.round(n));
const fmtN=n=>Math.round(n||0).toLocaleString('ja-JP');
const p2=n=>String(n).padStart(2,'0');
const hm=t=>{ const d=new Date(t); return `${d.getHours()}:${p2(d.getMinutes())}`; };
const span=ms=>{ const m=Math.max(0,Math.round(ms/60000)); const d=Math.floor(m/1440), h=Math.floor(m%1440/60), mm=m%60; return d?`${d}日${h}時間`:`${h}:${p2(mm)}`; };
const DOW='日月火水木金土';
const md=t=>{ const d=new Date(t); return `${d.getMonth()+1}/${d.getDate()}`; };
const dayStart=t=>{ const d=new Date(t); d.setHours(0,0,0,0); return d.getTime(); };
const H=3.6e6, DAY=8.64e7, WIN=1000000;

/* weather icons */
const rays=()=>[0,45,90,135,180,225,270,315].map(a=>{ const r=a*Math.PI/180; return `<line x1="${(20+Math.cos(r)*11.5).toFixed(1)}" y1="${(20+Math.sin(r)*11.5).toFixed(1)}" x2="${(20+Math.cos(r)*16).toFixed(1)}" y2="${(20+Math.sin(r)*16).toFixed(1)}"/>`; }).join('');
const WX={
  sun:`<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="7.5" fill="#ffd931"/><g stroke="#ffd931" stroke-width="2.4" stroke-linecap="round">${rays()}</g></svg>`,
  cloud:`<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="27" cy="13" r="5.5" fill="#ffd931" opacity=".9"/><path d="M10.5 30h19a6.3 6.3 0 0 0 .7-12.6 8.6 8.6 0 0 0-16.6 2.2A5.2 5.2 0 0 0 10.5 30z" fill="#d3dbea"/></svg>`,
  rain:`<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M10.5 25h19a6.3 6.3 0 0 0 .7-12.6 8.6 8.6 0 0 0-16.6 2.2A5.2 5.2 0 0 0 10.5 25z" fill="#a8b6cf"/><g stroke="#3fe6d6" stroke-width="2.3" stroke-linecap="round"><line x1="14" y1="29" x2="12" y2="35"/><line x1="21" y1="29" x2="19" y2="35"/><line x1="28" y1="29" x2="26" y2="35"/></g></svg>`,
  fog:`<svg viewBox="0 0 40 40" aria-hidden="true"><g stroke="#ff6a55" stroke-width="2.7" stroke-linecap="round"><line x1="8" y1="12" x2="32" y2="12"/><line x1="5" y1="18.5" x2="29" y2="18.5" opacity=".85"/><line x1="11" y1="25" x2="35" y2="25" opacity=".7"/><line x1="7" y1="31.5" x2="27" y2="31.5" opacity=".55"/></g></svg>`,
};
const WXN={sun:'晴れ',cloud:'くもり',rain:'雨',fog:'霧'};
const wxOf=p=> p>=100?'fog': p>=80?'rain': p>=50?'cloud':'sun';
const dayWx=u=> u>=18?'rain': u>=9?'cloud':'sun';
const TOD=h=> h<5?'深夜': h<8?'早朝': h<12?'午前': h<13?'昼': h<17?'午後': h<19?'夕方':'夜';

/* social links: every tool, skill, subagent and MCP server Claude can use.
   The 22 major arcana are fixed to the core set; the rest get a minor-arcana card of their kind's suit,
   most-used first, 14 per suit. Anything beyond that lives in the list only. */
const KIND={core:'Claude',tool:'ツール',skill:'スキル',agent:'エージェント',mcp:'MCP'};
const MAJOR=[['0','愚者','fool'],['I','魔術師','infinity'],['II','女教皇','pillars'],['III','女帝','crown'],['IV','皇帝','throne'],['V','法王','keys'],['VI','恋人','lovers'],['VII','戦車','chariot'],['VIII','正義','scales'],['IX','隠者','lantern'],['X','運命の輪','wheel'],['XI','力','strength'],['XII','吊るされた男','hanged'],['XIII','死神','death'],['XIV','節制','cups'],['XV','悪魔','devil'],['XVI','塔','tower'],['XVII','星','star'],['XVIII','月','moon'],['XIX','太陽','sun'],['XX','審判','judgement'],['XXI','世界','world']];
const SUIT={skill:{k:'pent',j:'金貨',n:'ペンタクル'},agent:{k:'sword',j:'剣',n:'ソード'},mcp:{k:'cup',j:'聖杯',n:'カップ'},tool:{k:'wand',j:'棒',n:'ワンド'}};
const COURT=['','エース','2','3','4','5','6','7','8','9','10','ペイジ','ナイト','クイーン','キング'];
/* id, kind, where it comes from, uses so far, days since last use (null = never), tokens it keeps in context every turn, major arcana index, what it does */
const L0=LIVE? [] : [
  ['claude','core','—',128,0,0,0,'すべてのチャンネルの中心です。依頼を受けて道具を呼び、結果をまとめて返します。このカードはターンの回数を数えます。'],
  ['Edit','tool','組み込み',30,0,0,1,'既存のファイルの一部を書き換えます。'],
  ['Read','tool','組み込み',37,0,0,2,'ファイルを読み込みます。読んだ分だけコンテキストを使います。'],
  ['Write','tool','組み込み',10,0,0,3,'新しいファイルを作るか、丸ごと書き直します。'],
  ['Plan','agent','組み込み',2,6,90,4,'実装の前に計画を立てるサブエージェントです。'],
  ['plugin-authoring','skill','組み込み',11,0,120,5,'Mod の書き方をまとめたスキルです。'],
  ['frontend-design','skill','.claude/skills',4,1,180,6,'画面デザインの進め方をまとめたスキルです。'],
  ['Bash','tool','組み込み',29,0,0,7,'シェルコマンドを実行します。テスト、ビルド、git はここを通ります。'],
  ['commit-message','skill','~/.claude/skills',7,0,110,8,'コミットメッセージの書き方をまとめたスキルです。'],
  ['Grep','tool','組み込み',15,0,0,9,'リポジトリの中から文字列やパターンを探します。'],
  ['Explore','agent','組み込み',7,1,80,10,'コードを読んで回るサブエージェントです。中での作業はこのチャンネルのコンテキストに入りません。'],
  ['test-runner','agent','.claude/agents',8,0,70,11,'テストを走らせて結果をまとめるサブエージェントです。'],
  ['debug','skill','組み込み',4,1,80,12,'問題の原因を調べる組み込みのスキルです（/debug）。'],
  ['refactor-plan','skill','~/.claude/skills',3,5,150,13,'リファクタリングの計画を立てる手順です。'],
  ['github','mcp','MCP',2,0,9800,14,'GitHub の MCP サーバーです。Issue や PR を読み書きします。ツールの定義がコンテキストに入ります。'],
  ['security-check','skill','~/.claude/skills',2,7,170,15,'セキュリティの観点で変更を確かめる手順です。'],
  ['ci-fix','skill','~/.claude/skills',5,2,140,16,'CI の失敗を直す手順です。'],
  ['WebSearch','tool','組み込み',7,1,0,17,'Web を検索して候補のページを集めます。'],
  ['WebFetch','tool','組み込み',4,1,0,18,'指定したページを取得して読みます。'],
  ['postgres','mcp','MCP',0,null,1400,19,'Postgres の MCP サーバーです。クエリを実行します。'],
  ['reviewer','agent','.claude/agents',4,1,70,20,'変更を確認するサブエージェントです。'],
  ['general-purpose','agent','組み込み',6,2,60,21,'何でも任せられるサブエージェントです。'],
  ['code-review','skill','組み込み',6,1,90,null,'変更をレビューする組み込みのスキルです（/code-review）。'],
  ['verify','skill','組み込み',3,2,80,null,'変更が動くか確かめる組み込みのスキルです（/verify）。'],
  ['pr-description','skill','~/.claude/skills',9,1,140,null,'PR の説明文を書く手順です。'],
  ['test-writer','skill','~/.claude/skills',11,0,180,null,'テストの書き方をまとめた手順です。'],
  ['spec-writer','skill','~/.claude/skills',4,3,210,null,'仕様書の下書きを作る手順です。'],
  ['release-notes','skill','~/.claude/skills',3,6,120,null,'リリースノートを書く手順です。'],
  ['copywriting','skill','~/.claude/skills',3,4,130,null,'画面の文言を書く手順です。'],
  ['changelog','skill','~/.claude/skills',2,12,90,null,'CHANGELOG を更新する手順です。'],
  ['perf-profile','skill','~/.claude/skills',2,9,170,null,'性能を測る手順です。'],
  ['data-viz','skill','~/.claude/skills',2,8,160,null,'グラフを作る手順です。'],
  ['adr-writer','skill','~/.claude/skills',1,24,160,null,'設計判断の記録（ADR）を書く手順です。'],
  ['a11y-check','skill','~/.claude/skills',1,40,150,null,'アクセシビリティを確かめる手順です。'],
  ['tailwind-tokens','skill','~/.claude/skills',1,33,110,null,'デザイントークンを Tailwind に反映する手順です。'],
  ['i18n-check','skill','~/.claude/skills',0,null,130,null,'翻訳漏れを調べる手順です。'],
  ['docker-compose','skill','~/.claude/skills',0,null,100,null,'Docker Compose の構成を作る手順です。'],
  ['terraform-plan','skill','~/.claude/skills',0,null,190,null,'Terraform の差分を確かめる手順です。'],
  ['storybook','skill','~/.claude/skills',0,null,120,null,'Storybook のストーリーを書く手順です。'],
  ['figma-handoff','skill','~/.claude/skills',0,null,150,null,'Figma のデザインを実装に落とす手順です。'],
  ['api-conventions','skill','.claude/skills',7,1,240,null,'shop-api の API 設計ルールです。'],
  ['db-migration','skill','.claude/skills',5,2,200,null,'マイグレーションを書く手順です。'],
  ['sql-style','skill','.claude/skills',6,2,110,null,'SQL の書き方のルールです。'],
  ['openapi-sync','skill','.claude/skills',2,5,160,null,'OpenAPI の定義と実装を揃える手順です。'],
  ['release-check','skill','.claude/skills',3,4,0,null,'リリース前に確かめる手順です。手動でだけ実行します（disable-model-invocation）。'],
  ['pdf','skill','プラグイン document-skills',1,15,260,null,'PDF を読み書きします。'],
  ['xlsx','skill','プラグイン document-skills',2,10,250,null,'Excel ファイルを読み書きします。'],
  ['docx','skill','プラグイン document-skills',0,null,250,null,'Word ファイルを読み書きします。'],
  ['pptx','skill','プラグイン document-skills',0,null,250,null,'PowerPoint ファイルを読み書きします。'],
  ['db-migrator','agent','.claude/agents',2,4,70,null,'マイグレーションを担当するサブエージェントです。'],
  ['docs-writer','agent','~/.claude/agents',1,20,70,null,'ドキュメントを書くサブエージェントです。'],
  ['linear','mcp','MCP',3,3,6300,null,'Linear の MCP サーバーです。'],
  ['sentry','mcp','MCP',1,9,3200,null,'Sentry の MCP サーバーです。'],
  ['figma','mcp','MCP',0,null,4100,null,'Figma の MCP サーバーです。'],
];
const NOW0=Date.now();
/* a project's own (.claude in the repository) as against everywhere's (~/.claude, plugins, built in) */
const isLocal=src=>/^\.claude/.test(String(src||''));
/* every one the demo knows; コミュ lists a project's own skills and agents from the start, everywhere's once they are called */
const ALL=L0.map(([id,kind,src,uses,last,dt,maj,what])=>({id,kind,src,uses,dt,maj,what,label:id==='claude'?'Claude':id,last:last==null?null:NOW0-last*86400000-3600000*(3+id.length%7)}));
/* what the demo's skills and agents say of themselves (their SKILL.md / definition `description`) */
const DESC=LIVE? {} : {
  'frontend-design':'画面を新しく作るとき・作り直すときに使う。見た目の方向性、文字組み、余白の決め方を先に決めてから部品を書く。',
  'commit-message':'コミットするときに使う。変更の要点を 1 行目に、理由を本文に書く。Conventional Commits の型（feat / fix / docs など）を付ける。',
  'refactor-plan':'大きめのリファクタリングの前に使う。影響の範囲を洗い出し、小さく安全な手順に分けて計画を書く。',
  'security-check':'認証・入力の検証・秘密情報の扱いに触れる変更を確かめるときに使う。',
  'ci-fix':'CI が失敗したときに使う。ログから失敗したジョブと原因を特定し、手元で再現してから直す。',
  'pr-description':'PR を作るときに使う。何を変えたか、なぜか、どう確かめたかの 3 つを見出しにして書く。',
  'test-writer':'テストを書くときに使う。境界値と失敗する場合を先に挙げ、1 つのテストで 1 つのことだけ確かめる。',
  'api-conventions':'shop-api の API を設計・変更するときに使う。\nURL の命名、エラーの形（code と message）、ページングの書き方をまとめている。',
  'db-migration':'テーブルや索引を変えるときに使う。戻せるマイグレーションを書き、本番の件数で所要時間を見積もる。',
  'sql-style':'SQL を書くときに使う。キーワードは大文字、テーブルの別名は 1〜2 文字、JOIN の条件は ON に書く。',
  'openapi-sync':'API の実装を変えたあとに使う。OpenAPI の定義と実装の差を調べて揃える。',
  'release-check':'リリースの前に /release-check で実行する。バージョン、CHANGELOG、マイグレーション、環境変数の 4 つを確かめる。',
  'test-runner':'テストを実行して、失敗したものだけを原因と一緒に短くまとめて返すサブエージェント。テストの出力が長いときに使う。',
  'reviewer':'変更のレビューを任せるサブエージェント。差分を読み、バグの可能性と読みにくい箇所を指摘する。',
  'db-migrator':'マイグレーションの作成と確認を任せるサブエージェント。',
};
ALL.forEach(l=>{ if(DESC[l.id]) l.desc=DESC[l.id]; });
const ALLK=Object.fromEntries(ALL.map(l=>[l.id,l]));
const LINKS=ALL.filter(l=>!((l.kind==='skill'||l.kind==='agent')&&!isLocal(l.src)&&!l.uses));
const LINK=Object.fromEntries(LINKS.map(l=>[l.id,l]));
const RANKS=[1,3,6,10,15,21,28,36,45,55];
const rankOf=u=>{ let r=0; RANKS.forEach((t,i)=>{ if(u>=t) r=i+1; }); return r; };
const toNext=u=>{ const t=RANKS.find(t=>u<t); return t==null? null : t-u; };
ALL.forEach(l=>{ l.rank=rankOf(l.uses); l.recent=[]; l.byCh={}; l.today=0; l.live=new Set(); });
/* hand out the cards: majors as listed, then each kind's suit to its most-used members */
function giveCard(l){ if(l.maj!=null){ const [num,arc,art]=MAJOR[l.maj]; Object.assign(l,{card:'major',num,arc,art}); return true; }
  const s=SUIT[l.kind]; if(!s) return false; const taken=LINKS.filter(x=>x.card==='minor'&&x.kind===l.kind).length; if(taken>=14) return false;
  const n=taken+1; Object.assign(l,{card:'minor',num:`${s.j} ${n<=10?n:COURT[n]}`,arc:`${s.n}の${COURT[n]}`,art:`suit:${s.k}:${n}`}); return true; }
LINKS.filter(l=>l.maj!=null).forEach(giveCard);
['skill','agent','mcp','tool'].forEach(k=>LINKS.filter(l=>l.maj==null&&l.kind===k&&l.uses>0).sort((a,b)=>b.uses-a.uses||a.id.localeCompare(b.id)).forEach(giveCard));
ALL.forEach(l=>{ if(!l.card){ l.card=null; l.num='—'; l.arc='カードなし'; l.art=null; } });
const SKILLS_ALL=ALL.filter(l=>l.kind==='skill');
/* the toast's head: the card, when it has one, and the name */
const cardHead=l=>`${l.card?`${esc(l.num)} ${esc(l.arc)}：`:''}${esc(l.label)}`;

/* what each folder loads when claude starts there */
const PROJECTS={
  '~/dev/fogcast':{branch:'main',md:true,skills:[],agents:['reviewer','test-runner'],mcp:['github','linear']},
  '~/dev/fogcast-ui':{branch:'feat/forecast-ui',md:true,tree:'~/dev/fogcast の worktree',skills:['frontend-design'],agents:['reviewer','test-runner'],mcp:['github','figma']},
  '~/dev/shop-api':{branch:'develop',md:true,skills:['api-conventions','db-migration','sql-style','openapi-sync','release-check'],agents:['reviewer','db-migrator'],mcp:['github','postgres','sentry']},
  '~/dev/docs-site':{branch:'main',md:false,skills:[],agents:[],mcp:[]},
};
const SRC=l=>l.src==='組み込み'?'組み込み':l.src;
function loadedFor(cwd){ const p=PROJECTS[cwd]||PROJECTS['~/dev/docs-site'];
  const everywhere=SKILLS_ALL.filter(l=>l.src==='組み込み'||l.src==='~/.claude/skills'||l.src.startsWith('プラグイン'));
  const skills=[...p.skills.map(n=>LINK[n]),...everywhere].map(l=>({n:l.id,src:SRC(l),dt:l.dt,manual:l.kind==='skill'&&!l.dt}));
  const agents=['general-purpose','Explore','Plan','docs-writer',...p.agents].map(n=>({n,src:SRC(LINK[n])}));
  return {md:p.md,tree:p.tree||null,skills,agents,mcp:p.mcp,mods:['fogcast']}; }

/* slash commands: what $.command.list() hands back, and how each behaves when run from here */
const BUILTIN=[
  ['resume','前の会話に戻る','pick','[会話の ID か名前]'],
  ['model','モデルを切り替える','pick','[モデル]'],
  ['effort','考える深さ（effort）を変える','pick','[low|medium|high|xhigh|max|auto]'],
  ['compact','会話を要約してコンテキストを空ける','op'],
  ['clear','会話をリセットして新しいセッションにする','danger'],
  ['rename','この会話に名前を付ける（/resume の一覧に出る）','text','[名前]'],
  ['context','コンテキストの内訳を表示する','text'],
  ['plan','計画モードに切り替える','text'],
  ['export','会話をファイルに書き出す','text','[ファイル名]'],
  ['init','このリポジトリの CLAUDE.md を作る','turn'],
  ['code-review','今の変更をレビューする（裏で動く）','turn'],
  ['simplify','変更したコードを見直して整える','turn'],
  ['security-review','今のブランチの変更をセキュリティの面で確かめる','turn'],
  ['usage','トークンとコストの画面を開く','panel'],
  ['status','セッションの状態を開く','panel'],
  ['permissions','許可の設定を開く','panel'],
  ['skills','スキルの一覧を開く','panel'],
  ['rewind','会話とコードを前の時点に戻す','panel'],
  ['help','使い方を表示する','panel'],
  ['recap','今の会話を 1 行にまとめる','term'],
];
const CKIND={text:'結果を表示',panel:'ターミナルで開く',turn:'ターンを始める',op:'圧縮',danger:'会話をリセット',pick:'この画面で選ぶ',term:'ターミナルで打つ'};
/* what the model and effort pickers offer in the demo (the live page takes the terminal's own) */
const DEMO_MODELS={options:['default','opus','sonnet','haiku','fable','opus[1m]','opusplan'],value:'default'};
const DEMO_EFFORTS=['low','medium','high','xhigh','max','auto'];
function commandsFor(c){ if(LIVE) return liveCommands(c); const L=c.loaded, out=[];
  BUILTIN.forEach(([n,d,k,h])=>out.push({n,d,k,h:h||'',g:'組み込み'}));
  L.skills.forEach(s=>out.push({n:s.n,d:(ALLK[s.n]&&ALLK[s.n].what)||'スキル',k:'turn',h:'[指示]',g:'スキル',src:s.src}));
  out.push({n:'fog',d:'Fogcast の画面（全ターミナルの会話と使用量）をブラウザで開く',k:'text',h:'',g:'プラグイン',src:'fogcast'});
  if(L.mcp.includes('github')) out.push({n:'mcp__github__review_pr',d:'GitHub の PR をレビューする（MCP のプロンプト）',k:'turn',h:'[PR 番号]',g:'MCP',src:'github'});
  if(L.mcp.includes('linear')) out.push({n:'mcp__linear__triage',d:'Linear の課題を振り分ける（MCP のプロンプト）',k:'turn',h:'',g:'MCP',src:'linear'});
  return out; }

/* demo scripts: what each terminal is asked to do */
const SCRIPTS=LIVE? {} : {
  lead:[
    {prompt:'予報の計算と画面を、このチャンネルと ui に分けて進めたい。タスクに分けて', events:[
      {id:'Skill',link:'plugin-authoring',v:'Skill',x:'plugin-authoring',r:'読み込み',d:2.1},
      {id:'Read',v:'Read',x:'types/claude-code.d.ts',r:'20,819 行',d:9.6},
      {task:{create:['受け皿サーバー（localhost）','使用枠の予報を計算','週カレンダーの画面','ランクの集計'],start:0}},
      {id:'Write',v:'Write',x:'hooks/bridge.ts',r:'+64',f:'hooks/bridge.ts',add:64,d:1.6},
      {id:'Bash',v:'Bash',x:'claude plugin validate .',r:'ok',d:.7}],
     answer:'4 つのタスクに分けました。週カレンダーの画面は ch.2 の <code>ui</code> に任せ、こちらでは受け皿サーバーと予報の計算を進めます。受け皿の起動部分は <code>hooks/bridge.ts</code> に書いています。'},
    {prompt:'使用枠の値を localhost に送るようにして。送る間隔は 5 秒で', events:[
      {id:'Read',v:'Read',x:'hooks/register.tsx',r:'88 行',d:1.1},
      {id:'Edit',v:'Edit',x:'hooks/register.tsx',r:'+22 −3',f:'hooks/register.tsx',add:22,del:3,d:1.8},
      {id:'Bash',v:'Bash',x:'claude plugin test .',r:'9 passed',d:1.3,perm:true},
      {task:{done:0,start:1}}],
     answer:'<code>session.measure</code> のたびに使用枠とコンテキストを受け皿へ送るようにしました。5 秒より短い間隔の送信はまとめています。テストは 9 件通っています。'},
    {prompt:'ui の変更とぶつかっていないか確認して、問題なければコミットして', events:[
      {id:'Agent',link:'reviewer',v:'Agent',x:'reviewer：2 つのブランチの差分を確認',r:'衝突なし',d:3.4,sub:[
        {id:'Bash',v:'Bash',x:'git diff main...feat/forecast-ui',r:'4 files'},
        {id:'Read',v:'Read',x:'web/calendar.ts',r:'120 行'},
        {id:'Grep',v:'Grep',x:'"forecast(" in hooks/ web/',r:'6 件'}]},
      {id:'Skill',link:'commit-message',v:'Skill',x:'commit-message',r:'読み込み',d:.8},
      {id:'Bash',v:'Bash',x:'git commit -m "bridge: send usage to the hub"',r:'1 file',d:.5}],
     answer:'reviewer に確認させました。<code>web/calendar.ts</code> と <code>hooks/register.tsx</code> は別々の箇所を変えていて、衝突はありません。コミットも済ませています。'},
    {prompt:'予報の計算を関数にして。5 時間枠と週の枠の両方', events:[
      {id:'Grep',v:'Grep',x:'"rateLimits" in hooks/',r:'3 件',d:.6},
      {id:'Write',v:'Write',x:'hooks/forecast.ts',r:'+48',f:'hooks/forecast.ts',add:48,d:1.9},
      {id:'Bash',v:'Bash',x:'claude plugin test .',r:'12 passed',d:1.0},
      {task:{done:1,start:3}}],
     answer:'<code>forecast()</code> を作りました。直近 30 分のペースからリセット時点の使用率を出し、100% を超える場合は上限に達する時刻も返します。'},
  ],
  ui:[
    {prompt:'週のカレンダーに予報を出す部品を作って', events:[
      {id:'Skill',link:'frontend-design',v:'Skill',x:'frontend-design',r:'読み込み',d:1.6},
      {id:'Read',v:'Read',x:'web/forecast.ts',r:'64 行',d:.9},
      {id:'Write',v:'Write',x:'web/calendar.ts',r:'+120',f:'web/calendar.ts',add:120,d:3.2},
      {id:'Bash',v:'Bash',x:'npm run build',r:'ok',d:1.0,perm:true}],
     answer:'過去の日は使用量、これからの日は予報を出すカレンダー部品を作りました。予報の日は点線の枠で区別しています。'},
    {prompt:'上限に達する日を目立たせて。テストも書いて', events:[
      {ask:{qs:[{q:'上限に達する日は、どう目立たせますか？',h:'見せ方',multi:false,opts:[{l:'赤い枠とラベル',d:'枠を赤くして「霧」のラベルを付ける'},{l:'マスを塗る',d:'日付のマスを薄い赤で塗る'},{l:'点滅させる',d:'動きで注意を引く（動きを減らす設定では止める）'}]}]}},
      {id:'Edit',v:'Edit',x:'web/calendar.ts',r:'+18 −2',f:'web/calendar.ts',add:18,del:2,d:.9},
      {id:'Write',v:'Write',x:'web/calendar.test.ts',r:'+40',f:'web/calendar.test.ts',add:40,d:1.1},
      {id:'Bash',v:'Bash',x:'npm test',r:'14 passed',d:1.2,perm:true}],
     answer:'上限に達する見込みの日を、選んだ見せ方で目立たせました。テストを 1 件足し、14 件すべて通っています。'},
    {prompt:'GitHub の issue #18 のコメントを読んで、指摘に対応して', events:[
      {id:'mcp__github__get_issue',link:'github',v:'github',x:'get_issue #18',r:'コメント 3 件',d:1.4},
      {id:'Edit',v:'Edit',x:'web/calendar.ts',r:'+6 −4',f:'web/calendar.ts',add:6,del:4,d:.7},
      {id:'mcp__github__add_comment',link:'github',v:'github',x:'add_comment #18',r:'投稿',d:.5}],
     answer:'issue #18 の指摘どおり、色の指定をテーマの値に揃えました。対応した内容を issue にコメントしています。'},
  ],
  api:[
    {prompt:'注文 API がたまにタイムアウトする原因を調べて', events:[
      {id:'Agent',link:'Explore',v:'Agent',x:'Explore：タイムアウトが起きる経路を調査',r:'候補 2 件',d:4.2,sub:[
        {id:'Grep',v:'Grep',x:'"timeout" in src/',r:'11 件'},
        {id:'Read',v:'Read',x:'src/orders/client.ts',r:'210 行'},
        {id:'Read',v:'Read',x:'src/lib/http.ts',r:'96 行'}]},
      {id:'WebSearch',v:'WebSearch',x:'undici keepAliveTimeout ECONNRESET',r:'10 件',d:2.4},
      {id:'WebFetch',v:'WebFetch',x:'undici.nodejs.org/#/docs/api/Agent',r:'読了',d:6.8},
      {id:'Edit',v:'Edit',x:'src/lib/http.ts',r:'+5 −1',f:'src/lib/http.ts',add:5,del:1,d:.8}],
     answer:'接続を使い回すときに、相手側が先に閉じた接続を使ってしまうのが原因でした。<code>keepAliveTimeout</code> を相手の設定より短くしています。'},
    {prompt:'直したところにテストを書いて実行して', events:[
      {id:'Write',v:'Write',x:'tests/http.test.ts',r:'+52',f:'tests/http.test.ts',add:52,d:1.4},
      {id:'Bash',v:'Bash',x:'npm test -- http',r:'6 passed',d:2.1,perm:true}],
     answer:'接続が切られた直後の再送を確かめるテストを書きました。6 件すべて通っています。'},
    {prompt:'注文一覧のクエリが遅いので、実行計画を見て', events:[
      {id:'mcp__postgres__query',link:'postgres',v:'postgres',x:'EXPLAIN ANALYZE SELECT … FROM orders',r:'1,240 ms',d:2.6},
      {id:'Write',v:'Write',x:'migrations/0042_orders_idx.sql',r:'+3',f:'migrations/0042_orders_idx.sql',add:3,d:.6},
      {id:'mcp__postgres__query',link:'postgres',v:'postgres',x:'EXPLAIN ANALYZE（索引あり）',r:'38 ms',d:1.2}],
     answer:'<code>orders</code> を <code>user_id</code> と日付で絞る索引がなく、全件を読んでいました。索引を足すマイグレーションを作り、1,240 ms から 38 ms になることを確かめています。'},
  ],
  docs:[
    {prompt:'README の導入手順を新しいコマンドに合わせて', events:[
      {id:'Read',v:'Read',x:'README.md',r:'84 行',d:.6},
      {id:'Edit',v:'Edit',x:'README.md',r:'+12 −9',f:'README.md',add:12,del:9,d:.9}],
     answer:'導入手順を <code>/plugin install</code> の 1 行に置き換え、古い手順は削りました。'},
  ],
};
/* earlier turns, already folded when the page opens */
const EARLIER=LIVE? {} : {
  lead:[{p:'Fogcast の雛形を作って、ステータスラインに使用枠を出して',ops:7,tok:31200,sec:94},{p:'ステータスラインの表示を 1 行に収めて',ops:3,tok:8400,sec:31}],
  ui:[{p:'予報画面のレイアウト案を 2 つ出して',ops:5,tok:22100,sec:70}],
  api:[{p:'develop を取り込んでテストを通して',ops:6,tok:40500,sec:122},{p:'注文 API のログに request id を出して',ops:4,tok:12300,sec:48}],
  docs:[{p:'README に導入手順を書いて',ops:4,tok:9800,sec:40},{p:'スクリーンショットを差し替えて',ops:3,tok:6100,sec:28}],
};
const PAST=LIVE? [] : [
  {n:'ステータスラインの幅が崩れる不具合',cwd:'~/dev/fogcast',t:'今日 11:05',id:'7f3a9c2e'},
  {n:'注文 API のリトライ処理',cwd:'~/dev/shop-api',t:'昨日 18:40',id:'2b81d0f4'},
  {n:'CI のテストを速くする',cwd:'~/dev/shop-api',t:'日曜',id:'5d2e8b13'},
];
/* the demo's conversations on disk, by folder: what the resume picker lists (the live page reads the terminal's) */
/* the demo channels' folder, for @ in the message box (the live screen asks the hub for the terminal's own) */
const DEMO_FILES=['README.md','CLAUDE.md','package.json','tsconfig.json','.claude-plugin/plugin.json','hooks/hooks.json','hooks/register.ts','hooks/register.test.ts','hooks/shape.ts','hooks/bridge.ts',
  'hub/hub.mjs','hub/ui.html','hub/guide.html','ui-src/build.sh','ui-src/fc1.js','ui-src/fc2.js','ui-src/fc3.js','ui-src/fc4.js','ui-src/fc-head.html','ui-src/guide.html','test/hub.test.mjs','test/simulate.mjs','docs/forecast.md','docs/statusline.md'];
const DEMO_CONVOS=LIVE? {} : {
  '~/dev/fogcast':[
    {id:'7f3a9c2e-1b4d-4e8a-9c21-3d4e5f6a8b90',title:'statusline-fix',first:'ステータスラインの幅が崩れる不具合を直して',last:'狭い端末でも 1 行に収まるか確かめて',age:95,size:412e3,
      hist:[{u:'ステータスラインの幅が崩れる不具合を直して',a:'全角文字の幅を 1 と数えていたのが原因でした。<code>stringWidth</code> で数えるようにしています。'},{u:'狭い端末でも 1 行に収まるか確かめて',a:'80 桁と 60 桁で確かめました。60 桁では予報の部分を省きます。'}]},
    {id:'0c9d8e7f-6a5b-4c3d-8e2f-1a0b9c8d7e6f',title:'',first:'受け皿の再起動で回数が二重になるのを直して',last:'',age:60*26,size:228e3,
      hist:[{u:'受け皿の再起動で回数が二重になるのを直して',a:'送り直しのあいだは数えないようにしました。'}]},
  ],
  '~/dev/fogcast-ui':[
    {id:'3a2b1c0d-9e8f-4a7b-8c6d-5e4f3a2b1c0d',title:'calendar-v1',first:'週のカレンダーに予報を出す部品を作って',last:'色をテーマの値に揃えて',age:60*5,size:530e3,
      hist:[{u:'週のカレンダーに予報を出す部品を作って',a:'過去の日は使用量、これからの日は予報を出す部品を作りました。'},{u:'色をテーマの値に揃えて',a:'色の指定をテーマの値に揃えました。'}]},
  ],
  '~/dev/shop-api':[
    {id:'2b81d0f4-7c6e-4d5a-9b8c-7d6e5f4a3b2c',title:'',first:'注文 API のリトライ処理を見直して',last:'リトライの上限を 3 回にして',age:60*20,size:610e3,
      hist:[{u:'注文 API のリトライ処理を見直して',a:'再送のたびに待ち時間を倍にするようにしました。'},{u:'リトライの上限を 3 回にして',a:'上限を 3 回にし、超えたらエラーを返します。'}]},
    {id:'5d2e8b13-4f3a-4b2c-8d1e-0f9a8b7c6d5e',title:'ci-speedup',first:'CI のテストを速くする',last:'キャッシュを効かせて',age:60*72,size:345e3,
      hist:[{u:'CI のテストを速くする',a:'テストを 4 つに分けて並列に走らせるようにしました。'}]},
  ],
  '~/dev/docs-site':[
    {id:'9f8e7d6c-5b4a-4392-8a1b-0c9d8e7f6a5b',title:'',first:'README に導入手順を書いて',last:'',age:60*30,size:120e3,hist:[{u:'README に導入手順を書いて',a:'導入手順を 3 段で書きました。'}]},
  ],
};
