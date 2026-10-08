/* ================= boot ================= */
if(LIVE) liveBoot();
else {
LINKS.forEach(l=>{ l.today=l.kind==='core'? 0 : Math.round(l.uses*.14); });
const chs=[
  mkChannel({name:'lead',role:'全体の指揮',cwd:'~/dev/fogcast',script:'lead',ctx:WIN*.31,tok:412000,cost:2.86,delay:700,ops:['Read','Edit','Bash']}),
  mkChannel({name:'ui',role:'予報画面',cwd:'~/dev/fogcast-ui',script:'ui',ctx:WIN*.46,tok:268000,cost:1.74,delay:2600,ops:['frontend-design','Write','Bash']}),
  mkChannel({name:'api',role:'注文 API の修正',cwd:'~/dev/shop-api',script:'api',ctx:WIN*.78,tok:1210000,cost:6.92,delay:4600,ops:['Grep','Read','Edit','Bash']}),
  mkChannel({name:'docs',role:'ドキュメント',cwd:'~/dev/docs-site',script:'docs',ctx:WIN*.12,tok:96000,cost:.58,off:true,endedAgo:21,resume:'c09e4a71',ops:['Read','Edit']}),
];
chs.forEach(c=>{ c.sid=rid(); bootCard(c); earlier(c); seedBlocks(c,false);
  if(c.status==='off') add(c,`<div class="sys"><b>セッションは ${hm(c.endedAt)} に終了しました</b><span>続きから始めるには、ターミナルで <code>cd ${esc(c.cwd)} && claude --resume ${esc(c.resume)}</code> を実行します。「詳細」からコピーできます。</span></div>`);
  else c.now=`入力待ち · 前のターンは ${Math.round(2+c.num*1.5)} 分前`; });
chs.forEach(c=>{ if(c.status!=='off') loop(c); });
}
buildDeck(); skySize(); addEventListener('resize',()=>{ skySize(); if(rtab==='L') sizeDeck(); });
if('ResizeObserver' in window) new ResizeObserver(()=>{ if(rtab==='L') sizeDeck(); }).observe($('deck'));
select(0); renderHud(); renderForecast();
requestAnimationFrame(frame);
})();
</script>
