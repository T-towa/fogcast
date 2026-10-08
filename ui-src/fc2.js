
/* ================= arcana art: line drawings that move faster while the card is in use ================= */
function art(g,w,h,name,t,a,pulse){
  const Y='255,217,49', T='63,230,214', R='255,134,192', B='147,180,255';
  const k=Math.min(w,h*.82), cx=w/2, cy=h*.5;
  const col=(c,al)=>`rgba(${c},${al})`;
  const base=.34+.56*a+.3*pulse;
  const lw=Math.max(1,k*.014);
  g.lineWidth=lw; g.lineCap='round'; g.lineJoin='round';
  g.shadowBlur=k*.08*a; g.shadowColor=col(Y,.8);
  g.strokeStyle=col(Y,base); g.fillStyle=col(Y,base);
  const sp=t*(.15+a*1.6);
  const L=(x1,y1,x2,y2)=>{ g.beginPath(); g.moveTo(x1,y1); g.lineTo(x2,y2); g.stroke(); };
  const C=(x,y,r,fill)=>{ g.beginPath(); g.arc(x,y,r,0,6.283); fill? g.fill() : g.stroke(); };
  const dots=(n,r,ph,sz,c)=>{ for(let i=0;i<n;i++){ const an=i/n*6.283+ph; g.beginPath(); g.arc(cx+Math.cos(an)*r,cy+Math.sin(an)*r*.95,sz,0,6.283); g.fillStyle=c; g.fill(); } };
  switch(name){
    case 'fool': { // a sun, a cliff edge and a path that keeps going
      C(cx,cy-k*.18,k*.14);
      for(let i=0;i<12;i++){ const an=i/12*6.283+sp*.3, r2=k*(.24+.03*Math.sin(t*2+i)); L(cx+Math.cos(an)*k*.18,cy-k*.18+Math.sin(an)*k*.18,cx+Math.cos(an)*r2,cy-k*.18+Math.sin(an)*r2); }
      g.beginPath(); g.moveTo(w*.12,h*.82); g.bezierCurveTo(w*.35,h*.62,w*.6,h*.9,w*.88,h*.68); g.stroke();
      g.setLineDash([k*.02,k*.04]); g.lineDashOffset=-sp*k*.3; g.strokeStyle=col(T,.4+.5*a); g.beginPath(); g.moveTo(w*.12,h*.74); g.bezierCurveTo(w*.4,h*.5,w*.62,h*.78,w*.9,h*.56); g.stroke(); g.setLineDash([]);
      break; }
    case 'pillars': { // two pillars and a moon between: reading
      g.strokeRect(w*.18,h*.2,w*.12,h*.6); g.strokeRect(w*.7,h*.2,w*.12,h*.6);
      g.beginPath(); g.arc(cx,cy-k*.05,k*.13,-1.2,1.2,true); g.arc(cx+k*.05,cy-k*.05,k*.11,1.1,-1.1); g.stroke();
      for(let i=0;i<6;i++){ const y=h*(.62+i*.035), len=w*.28*(.6+.4*Math.sin(sp*2+i)); g.globalAlpha=.4+.6*a; L(cx-len/2,y,cx+len/2,y); }
      g.globalAlpha=1; break; }
    case 'infinity': { // a lemniscate traced by a point: editing
      g.beginPath(); for(let i=0;i<=80;i++){ const u=i/80*6.283, s=k*.26/(1+Math.sin(u)**2); const x=cx+s*Math.cos(u), y=cy-k*.05+s*Math.sin(u)*Math.cos(u); i? g.lineTo(x,y) : g.moveTo(x,y); } g.stroke();
      { const u=sp*2, s=k*.26/(1+Math.sin(u)**2); g.beginPath(); g.arc(cx+s*Math.cos(u),cy-k*.05+s*Math.sin(u)*Math.cos(u),k*.03,0,6.283); g.fillStyle=col(T,.5+.5*a); g.fill(); }
      L(cx,cy+k*.12,cx,cy+k*.32); break; }
    case 'crown': { // a crown of twelve stars: creating
      dots(12,k*.24,sp*.4,k*.02,col(Y,base)); C(cx,cy,k*.15);
      g.beginPath(); g.arc(cx,cy,k*.15*(.3+.7*a)*(.6+.4*Math.sin(sp*3)),0,6.283); g.fillStyle=col(T,.15+.35*a); g.fill(); break; }
    case 'lantern': { // the hermit holds up a lantern; its light walks down the lines and lights up every match it finds
      const n=6, top=h*.52, gap=Math.min(h*.072,k*.085), x0=w*.1, x1=w*.9;
      const run=(sp*.32)%1.25, scan=Math.min(1,run), sy=top+scan*(n-1)*gap;   // a pause at the bottom before it starts again
      const hx=w*.68, hy=h*.1, lx=hx-k*.2+Math.sin(sp*1.4)*k*.015, ly=hy+k*.25;
      /* the light: a cone from the lantern down to the line being read, and a pool on that line */
      g.save(); g.globalAlpha=.18+.32*a; const cone=g.createLinearGradient(0,ly,0,sy); cone.addColorStop(0,col(T,.55)); cone.addColorStop(1,col(T,.05));
      g.fillStyle=cone; g.beginPath(); g.moveTo(lx-k*.02,ly+k*.05); g.lineTo(x0,sy+gap*.5); g.lineTo(x1,sy+gap*.5); g.lineTo(lx+k*.02,ly+k*.05); g.closePath(); g.fill(); g.restore();
      /* lines of text: dim words, brighter where the light falls */
      const MATCH=[[.22,.42],null,[.56,.78],[.12,.3],null,[.44,.66]];
      for(let i=0;i<n;i++){ const y=top+i*gap, lit=Math.max(0,1-Math.abs(y-sy)/(gap*1.2));
        let x=x0, s=i*3+1; g.lineWidth=lw*1.15;
        while(x<x1-k*.02){ const len=k*(.05+((s*13)%7)*.018), xe=Math.min(x1,x+len); g.strokeStyle=col(Y,.16+.5*lit); L(x,y,xe,y); x=xe+k*.03; s++; }
        const m=MATCH[i]; if(m){ const found=scan*(n-1)>=i-.15 && run<1.2, mx0=x0+(x1-x0)*m[0], mx1=x0+(x1-x0)*m[1];
          g.fillStyle= found? col(T,.28+.5*a+.25*lit) : col(T,.06); g.fillRect(mx0-k*.012,y-gap*.34,mx1-mx0+k*.024,gap*.68);
          if(found){ g.strokeStyle=col(T,.7+.3*lit); g.lineWidth=lw*1.3; L(mx0,y,mx1,y); } } }
      g.lineWidth=lw; g.strokeStyle=col(Y,base);
      /* the hermit: a hooded cloak, a staff, an arm holding the lantern up */
      g.beginPath(); g.moveTo(hx-k*.1,hy+k*.36); g.lineTo(hx-k*.05,hy+k*.08); g.quadraticCurveTo(hx,hy-k*.04,hx+k*.06,hy+k*.08); g.lineTo(hx+k*.13,hy+k*.36); g.stroke();
      g.beginPath(); g.arc(hx+k*.005,hy+k*.1,k*.028,0,6.283); g.stroke();
      L(hx+k*.19,hy-k*.01,hx+k*.19,hy+k*.38);
      L(hx-k*.04,hy+k*.17,lx+k*.02,ly-k*.04); L(lx,ly-k*.07,lx,ly-k*.045);
      g.strokeRect(lx-k*.035,ly-k*.045,k*.07,k*.09);
      /* the six-pointed star inside the lantern, brighter while it searches */
      g.save(); g.translate(lx,ly); g.rotate(sp*.4); g.fillStyle=col(Y,.5+.5*a*(.6+.4*Math.sin(t*6)));
      [0,Math.PI].forEach(o=>{ g.beginPath(); for(let j=0;j<3;j++){ const an=o+j*2.094-Math.PI/2; g.lineTo(Math.cos(an)*k*.024,Math.sin(an)*k*.024); } g.closePath(); g.fill(); }); g.restore();
      break; }
    case 'chariot': { // a box on two wheels driving forward: running a command
      g.strokeRect(cx-k*.2,cy-k*.14,k*.4,k*.22);
      [cx-k*.13,cx+k*.13].forEach(x=>{ C(x,cy+k*.16,k*.08);
        for(let i=0;i<4;i++){ const an=i/4*3.1416+sp*3; L(x-Math.cos(an)*k*.08,cy+k*.16-Math.sin(an)*k*.08,x+Math.cos(an)*k*.08,cy+k*.16+Math.sin(an)*k*.08); } });
      g.globalAlpha=a; for(let i=0;i<3;i++){ const x=(cx-k*.24)-((sp*k*.6+i*k*.12)%(k*.36)); L(x,cy-k*.06,x+k*.08,cy-k*.06); } g.globalAlpha=1; break; }
    case 'star': { // an eight-point star over water: searching the web
      g.save(); g.translate(cx,cy-k*.08); g.rotate(sp*.25);
      g.beginPath(); for(let i=0;i<16;i++){ const r=i%2?k*.07:k*.2, an=i/16*6.283; g.lineTo(Math.cos(an)*r,Math.sin(an)*r); } g.closePath(); g.stroke(); g.restore();
      dots(7,k*.32,-sp*.6,k*.013,col(T,.4+.6*a));
      for(let i=0;i<3;i++){ g.beginPath(); g.moveTo(w*.15,h*(.76+i*.04)); for(let s=0;s<=10;s++) g.lineTo(w*(.15+s*.07),h*(.76+i*.04)+Math.sin(s*1.2+sp*3+i)*k*.012); g.stroke(); } break; }
    case 'moon': { // a moon above two towers, drops falling: fetching a page
      C(cx,cy-k*.2,k*.12); g.beginPath(); g.arc(cx+k*.05,cy-k*.22,k*.1,0,6.283); g.fillStyle='#0f1420'; g.fill();
      g.strokeRect(w*.16,cy,w*.1,h*.24); g.strokeRect(w*.74,cy,w*.1,h*.24);
      for(let i=0;i<6;i++){ const ph=(sp*.8+i/6)%1; g.beginPath(); g.arc(cx+(i-2.5)*k*.05,cy-k*.05+ph*k*.4,k*.013,0,6.283); g.fillStyle=col(T,(1-ph)*(.3+.7*a)); g.fill(); } break; }
    case 'keys': { // two crossed keys: a skill being loaded
      [-1,1].forEach(s=>{ g.save(); g.translate(cx,cy); g.rotate(s*.6+Math.sin(sp)*.08*a);
        g.beginPath(); g.arc(0,-k*.24,k*.06,0,6.283); g.moveTo(0,-k*.18); g.lineTo(0,k*.26); g.moveTo(0,k*.18); g.lineTo(s*k*.06,k*.18); g.moveTo(0,k*.24); g.lineTo(s*k*.06,k*.24); g.stroke(); g.restore(); });
      g.globalAlpha=.3+.5*a; C(cx,cy,k*.3*(.9+.1*Math.sin(sp*3))); g.globalAlpha=1; break; }
    case 'world': { // a wreath with a figure inside: a subagent working on its own
      g.beginPath(); g.ellipse(cx,cy,k*.2,k*.3,0,0,6.283); g.stroke();
      for(let i=0;i<14;i++){ const an=i/14*6.283+sp*.5; g.beginPath(); g.arc(cx+Math.cos(an)*k*.2,cy+Math.sin(an)*k*.3,k*.015,0,6.283); g.fillStyle=col(R,.3+.6*a); g.fill(); }
      [[.18,.16],[.82,.16],[.18,.84],[.82,.84]].forEach(([x,y],i)=>C(w*x,h*y,k*.04*(1+.3*a*Math.sin(sp*2+i))));
      C(cx,cy-k*.1,k*.035); L(cx,cy-k*.06,cx,cy+k*.1); break; }
    case 'throne': { // a grid with a route being laid across it: planning
      const n=4, s=k*.12, ox=cx-n*s/2, oy=cy-n*s/2+k*.08;
      g.globalAlpha=.3+.35*a; for(let i=0;i<=n;i++){ L(ox+i*s,oy,ox+i*s,oy+n*s); L(ox,oy+i*s,ox+n*s,oy+i*s); } g.globalAlpha=1;
      const P=[[0,4],[0,3],[2,3],[2,1],[4,1],[4,0]]; const seg=[]; let tot=0; for(let i=1;i<P.length;i++){ const d=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]); seg.push(d); tot+=d; }
      let rem=((sp*.35)%1)*tot; g.strokeStyle=col(T,.5+.5*a); g.lineWidth=lw*1.7; g.beginPath(); g.moveTo(ox+P[0][0]*s,oy+P[0][1]*s);
      for(let i=1;i<P.length&&rem>0;i++){ const f=Math.min(1,rem/seg[i-1]); g.lineTo(ox+(P[i-1][0]+(P[i][0]-P[i-1][0])*f)*s,oy+(P[i-1][1]+(P[i][1]-P[i-1][1])*f)*s); rem-=seg[i-1]; } g.stroke();
      g.lineWidth=lw; g.strokeStyle=col(Y,base); const cy2=oy-k*.13;
      g.beginPath(); g.moveTo(cx-k*.12,cy2+k*.06); g.lineTo(cx-k*.12,cy2-k*.02); g.lineTo(cx-k*.06,cy2+k*.02); g.lineTo(cx,cy2-k*.05); g.lineTo(cx+k*.06,cy2+k*.02); g.lineTo(cx+k*.12,cy2-k*.02); g.lineTo(cx+k*.12,cy2+k*.06); g.closePath(); g.stroke(); break; }
    case 'lovers': { // two circles whose overlap glows: choosing a design
      const off=k*(.1+.03*Math.sin(sp*1.5));
      g.save(); g.beginPath(); g.arc(cx-off,cy,k*.2,0,6.283); g.clip(); g.beginPath(); g.arc(cx+off,cy,k*.2,0,6.283); g.fillStyle=col(T,.16+.4*a); g.fill(); g.restore();
      C(cx-off,cy,k*.2); C(cx+off,cy,k*.2);
      [Y,T,R].forEach((c,i)=>{ g.beginPath(); g.arc(cx+(i-1)*k*.12,cy-k*.34,k*.035,0,6.283); g.fillStyle=col(c,.45+.5*a); g.fill(); }); break; }
    case 'scales': { // a balance beam that tips and settles: writing a commit message
      const tilt=Math.sin(sp*1.2)*.18*(.3+a);
      L(cx,cy-k*.26,cx,cy+k*.3); L(cx-k*.12,cy+k*.3,cx+k*.12,cy+k*.3);
      g.save(); g.translate(cx,cy-k*.2); g.rotate(tilt); L(-k*.26,0,k*.26,0);
      [-1,1].forEach(s=>{ g.save(); g.translate(s*k*.26,0); g.rotate(-tilt); L(0,0,-k*.07,k*.16); L(0,0,k*.07,k*.16); g.beginPath(); g.arc(0,k*.16,k*.08,0,Math.PI); g.stroke(); g.restore(); });
      g.restore(); C(cx,cy-k*.2,k*.025,true); break; }
    case 'wheel': { // a turning wheel: exploring the code
      C(cx,cy,k*.28); C(cx,cy,k*.1);
      for(let i=0;i<8;i++){ const an=i/8*6.283+sp*.8; L(cx+Math.cos(an)*k*.1,cy+Math.sin(an)*k*.1,cx+Math.cos(an)*k*.28,cy+Math.sin(an)*k*.28); }
      dots(8,k*.35,sp*.8+.39,k*.018,col(R,.35+.6*a)); break; }
    case 'cups': { // a stream poured from one cup to another: syncing with GitHub
      const cup=(px,py)=>{ g.beginPath(); g.moveTo(px-k*.09,py-k*.08); g.lineTo(px-k*.06,py+k*.08); g.lineTo(px+k*.06,py+k*.08); g.lineTo(px+k*.09,py-k*.08); g.stroke(); L(px,py+k*.08,px,py+k*.14); L(px-k*.05,py+k*.14,px+k*.05,py+k*.14); };
      cup(cx-k*.17,cy-k*.14); cup(cx+k*.17,cy+k*.12);
      g.setLineDash([k*.03,k*.03]); g.lineDashOffset=-sp*k*.4; g.strokeStyle=col(B,.45+.5*a);
      g.beginPath(); g.moveTo(cx-k*.09,cy-k*.21); g.bezierCurveTo(cx,cy-k*.32,cx+k*.12,cy-k*.12,cx+k*.13,cy+k*.03); g.stroke(); g.setLineDash([]); break; }
    case 'sun': { // a sun over the rows of a table: querying a database
      const sy=cy-k*.15; C(cx,sy,k*.11);
      for(let i=0;i<12;i++){ const an=i/12*6.283+sp*.25, r2=k*(.2+.02*Math.sin(t*2+i)); L(cx+Math.cos(an)*k*.15,sy+Math.sin(an)*k*.15,cx+Math.cos(an)*r2,sy+Math.sin(an)*r2); }
      const hot=Math.floor(sp*1.5)%4;
      for(let i=0;i<4;i++){ const y=cy+k*(.13+i*.07); g.strokeStyle= hot===i? col(B,.6+.4*a) : col(Y,base*.7); L(cx-k*.25,y,cx+k*.25,y); }
      g.strokeStyle=col(Y,base*.7); L(cx-k*.09,cy+k*.1,cx-k*.09,cy+k*.36); break; }
    case 'judgement': { // a horn sending rays while checkmarks rise: reviewing
      g.beginPath(); g.moveTo(cx-k*.26,cy-k*.16); g.lineTo(cx+k*.02,cy-k*.27); g.lineTo(cx+k*.02,cy-k*.07); g.closePath(); g.stroke();
      for(let i=0;i<3;i++){ const an=-.45+i*.25; L(cx+k*.07,cy-k*.17,cx+k*.07+Math.cos(an)*k*.22,cy-k*.17+Math.sin(an)*k*.22); }
      for(let i=0;i<3;i++){ const ph=(sp*.5+i/3)%1, yy=cy+k*.32-ph*k*.36, xx=cx+(i-1)*k*.15; g.globalAlpha=(1-ph)*(.4+.6*a); g.strokeStyle=col(R,1);
        g.beginPath(); g.moveTo(xx-k*.045,yy); g.lineTo(xx-k*.012,yy+k*.03); g.lineTo(xx+k*.05,yy-k*.04); g.stroke(); }
      g.globalAlpha=1; break; }
    case 'strength': { // a mane of rays around a calm centre, an infinity above: steady work
      for(let i=0;i<16;i++){ const an=i/16*6.283+Math.sin(sp*.6)*.05, r1=k*.13, r2=k*(.22+.03*Math.sin(t*2+i*1.7)*(.3+a)); L(cx+Math.cos(an)*r1,cy+k*.06+Math.sin(an)*r1,cx+Math.cos(an)*r2,cy+k*.06+Math.sin(an)*r2); }
      C(cx,cy+k*.06,k*.11);
      g.beginPath(); for(let i=0;i<=40;i++){ const u=i/40*6.283, s=k*.09/(1+Math.sin(u)**2), x=cx+s*Math.cos(u), y=cy-k*.27+s*Math.sin(u)*Math.cos(u); i? g.lineTo(x,y) : g.moveTo(x,y); }
      g.strokeStyle=col(T,.5+.5*a); g.stroke(); break; }
    case 'hanged': { // a figure hanging upside down from a beam: looking from another angle
      L(cx-k*.24,cy-k*.32,cx+k*.24,cy-k*.32); L(cx-k*.2,cy-k*.32,cx-k*.2,cy-k*.4); L(cx+k*.2,cy-k*.32,cx+k*.2,cy-k*.4);
      g.save(); g.translate(cx,cy-k*.32); g.rotate(Math.sin(sp*1.1)*.12*(.3+a));
      L(0,0,0,k*.26); L(0,k*.05,k*.07,k*.12); L(k*.07,k*.12,0,k*.16); L(0,k*.26,-k*.08,k*.36); L(0,k*.26,k*.08,k*.36); C(0,k*.42,k*.05);
      g.strokeStyle=col(T,.25+.5*a); C(0,k*.42,k*.1); g.restore(); break; }
    case 'death': { // a sun crossing the horizon between two towers: ending one thing to start the next
      const hy=cy+k*.12; L(w*.1,hy,w*.9,hy);
      const sy=hy+k*.1-((sp*.15)%1)*k*.3; g.save(); g.beginPath(); g.rect(0,0,w,hy); g.clip(); C(cx,sy,k*.1); g.restore();
      g.strokeRect(w*.18,hy-k*.24,w*.08,k*.24); g.strokeRect(w*.74,hy-k*.24,w*.08,k*.24);
      for(let i=0;i<4;i++){ g.globalAlpha=(.2+.5*a)*(1-i/4); L(w*.2+i*k*.02,hy+k*(.06+i*.05),w*.8-i*k*.02,hy+k*(.06+i*.05)); } g.globalAlpha=1;
      for(let i=0;i<5;i++){ const an=i/5*6.283+sp*.2; g.beginPath(); g.arc(cx+Math.cos(an)*k*.035,cy-k*.3+Math.sin(an)*k*.035,k*.03,0,6.283); g.fillStyle=col(R,.4+.5*a); g.fill(); } break; }
    case 'devil': { // chains hanging from a bar, swinging: guarding against risky changes
      L(cx-k*.26,cy-k*.28,cx+k*.26,cy-k*.28);
      [-1,1].forEach(s=>{ g.save(); g.translate(cx+s*k*.12,cy-k*.28); g.rotate(Math.sin(sp*1.3+s)*.15*(.3+a));
        for(let i=0;i<4;i++){ g.beginPath(); g.ellipse(0,k*(.06+i*.09),k*.03,k*.05,0,0,6.283); g.stroke(); }
        C(0,k*.48,k*.06); g.restore(); });
      g.strokeStyle=col(R,.5+.4*a); g.beginPath(); g.moveTo(cx-k*.08,cy-k*.34); g.quadraticCurveTo(cx-k*.1,cy-k*.42,cx-k*.04,cy-k*.44); g.moveTo(cx+k*.08,cy-k*.34); g.quadraticCurveTo(cx+k*.1,cy-k*.42,cx+k*.04,cy-k*.44); g.stroke(); break; }
    case 'tower': { // a tower struck by lightning, blocks falling: fixing a broken build
      g.strokeRect(cx-k*.09,cy-k*.2,k*.18,k*.5);
      g.beginPath(); g.moveTo(cx-k*.12,cy-k*.2); g.lineTo(cx-k*.06,cy-k*.3); g.lineTo(cx,cy-k*.23); g.lineTo(cx+k*.06,cy-k*.3); g.lineTo(cx+k*.12,cy-k*.2); g.stroke();
      const fl=Math.sin(sp*2.3)>.6? 1 : .25; g.strokeStyle=col(T,(.3+.7*a)*fl); g.lineWidth=lw*1.6;
      g.beginPath(); g.moveTo(cx+k*.3,cy-k*.42); g.lineTo(cx+k*.16,cy-k*.28); g.lineTo(cx+k*.24,cy-k*.26); g.lineTo(cx+k*.1,cy-k*.16); g.stroke(); g.lineWidth=lw;
      for(let i=0;i<4;i++){ const ph=(sp*.6+i/4)%1; g.globalAlpha=(1-ph)*(.3+.6*a); g.fillStyle=col(Y,1); g.fillRect(cx-k*.2+i*k*.12,cy-k*.13+ph*k*.4,k*.04,k*.04); } g.globalAlpha=1; break; }
    default: if(name&&name.startsWith('suit:')){ // minor arcana: the suit's pips, or a crowned pip for a court card
      const [,su,ns]=name.split(':'), n=+ns, c0={pent:Y,sword:R,cup:B,wand:T}[su]||Y;
      const pip=(x,y,s)=>{ g.strokeStyle=col(c0,base); g.fillStyle=col(c0,base);
        if(su==='pent'){ C(x,y,s); g.beginPath(); for(let i=0;i<=5;i++){ const an=-Math.PI/2+i*4*Math.PI/5; const px=x+Math.cos(an)*s*.72, py=y+Math.sin(an)*s*.72; i? g.lineTo(px,py) : g.moveTo(px,py); } g.stroke(); }
        else if(su==='sword'){ L(x,y-s*1.1,x,y+s*.7); L(x-s*.5,y+s*.35,x+s*.5,y+s*.35); C(x,y+s*.95,s*.18,true); }
        else if(su==='cup'){ g.beginPath(); g.moveTo(x-s*.7,y-s*.6); g.quadraticCurveTo(x-s*.65,y+s*.25,x,y+s*.3); g.quadraticCurveTo(x+s*.65,y+s*.25,x+s*.7,y-s*.6); g.closePath(); g.stroke(); L(x,y+s*.3,x,y+s*.8); L(x-s*.35,y+s*.8,x+s*.35,y+s*.8); }
        else { L(x-s*.6,y+s*.9,x+s*.6,y-s*.9); L(x+s*.1,y-s*.15,x+s*.45,y-s*.05); L(x-s*.15,y+s*.25,x-s*.5,y+s*.15); } };
      const P={1:[[.5,.5]],2:[[.5,.3],[.5,.7]],3:[[.5,.25],[.5,.5],[.5,.75]],4:[[.33,.3],[.67,.3],[.33,.7],[.67,.7]],5:[[.33,.28],[.67,.28],[.5,.5],[.33,.72],[.67,.72]],
        6:[[.33,.25],[.67,.25],[.33,.5],[.67,.5],[.33,.75],[.67,.75]],7:[[.33,.22],[.67,.22],[.5,.36],[.33,.5],[.67,.5],[.33,.78],[.67,.78]],8:[[.33,.2],[.67,.2],[.5,.34],[.33,.48],[.67,.48],[.5,.62],[.33,.8],[.67,.8]],
        9:[[.33,.2],[.67,.2],[.33,.4],[.67,.4],[.5,.5],[.33,.6],[.67,.6],[.33,.8],[.67,.8]],10:[[.33,.18],[.67,.18],[.5,.28],[.33,.38],[.67,.38],[.33,.62],[.67,.62],[.5,.72],[.33,.82],[.67,.82]]};
      if(n>10){ pip(cx,cy+k*.08,k*.14); g.strokeStyle=col(Y,base); const cy2=cy-k*.22;
        g.beginPath(); g.moveTo(cx-k*.12,cy2+k*.06); g.lineTo(cx-k*.12,cy2-k*.02); g.lineTo(cx-k*.06,cy2+k*.02); g.lineTo(cx,cy2-k*.05); g.lineTo(cx+k*.06,cy2+k*.02); g.lineTo(cx+k*.12,cy2-k*.02); g.lineTo(cx+k*.12,cy2+k*.06); g.closePath(); g.stroke();
        for(let i=0;i<n-10;i++) C(cx-k*.09+i*k*.06,cy+k*.36,k*.012,true); }
      else (P[n]||P[1]).forEach(([px,py],i)=>pip(w*px,h*(.12+py*.76)+Math.sin(sp*1.5+i)*k*.012*a,k*(n===1?.15:n>6?.06:.075)));
    }
  }
  g.shadowBlur=0;
}
