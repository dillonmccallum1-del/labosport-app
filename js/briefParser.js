// briefParser.js — parses a Labosport pitch-inspection brief.
// Input: pages = [ [ {x,y,str}, ... ], ... ]  (one array of text items per page; pdf.js geometry)
// Output: structured venue object. Runs identically in Node and the browser.

const KNOWN_PARAMS = [
  "Field usage","Pitch dimensions","Soil profile","Irrigation and Water management",
  "Drainage & Waterlogging Performance","Surface Performance","Safety",
  "Turf Management Skills","Resources","Additional aspects"
];
const norm = s => (s||"").replace(/\s+/g," ").trim();
const keyNorm = s => norm(s).toLowerCase().replace(/[&]/g,"and").replace(/[^a-z ]/g,"").replace(/\s+/g," ").trim();

function matchParam(label){
  const k = keyNorm(label);
  let best=null,bestScore=0;
  for(const p of KNOWN_PARAMS){
    const pk=keyNorm(p);
    // score by shared prefix words
    const a=k.split(" "), b=pk.split(" ");
    let i=0; while(i<a.length&&i<b.length&&a[i]===b[i]) i++;
    const score=i + (pk.startsWith(k)||k.startsWith(pk)?0.5:0);
    if(score>bestScore){bestScore=score;best=p;}
  }
  return bestScore>=1?best:null;
}

// group items on one page into visual lines (by y), left-to-right
function linesOf(items){
  const rows={};
  items.forEach(it=>{ if(!it.str.trim())return; const y=Math.round(it.y); (rows[y]=rows[y]||[]).push(it); });
  return Object.keys(rows).map(Number).sort((a,b)=>b-a)
    .map(y=>({y, text:norm(rows[y].sort((a,b)=>a.x-b.x).map(i=>i.str).join(" "))}));
}

function parseBrief(pages){
  const all = pages.flat();
  const fullLines = pages.flatMap(linesOf).map(l=>l.text);

  // ---------- HEADER (page 1, two-column: name/contact/email/grass | address/position) ----------
  const out = {name:"",alias:"",address:"",contact:"",position:"",email:"",phone:"",grass:"",
               venueComment:"",wr:"",params:{},pitches:[]};
  const joined = fullLines.join("\n");
  const grab=(re)=>{ const m=joined.match(re); return m?norm(m[1]):""; };

  // header band only: above the "OVERALL COMMENTS" / first comments line
  const p0=(pages[0]||[]);
  let cutY=0;
  p0.forEach(it=>{ if(/OVERALL COMMENTS|COMMENTS FROM THE VENUE/i.test(it.str)) cutY=Math.max(cutY,it.y); });
  if(!cutY) cutY=560;
  const p1 = p0.filter(it=>{
    const t=norm(it.str); if(!t) return false;
    if(it.y>728 || it.y<=cutY+4) return false;                  // title band / below header
    if(/OUTDOOR TRAINING|MATCH VENUES|PITCH INSPECTION BRIEF|Labosport Group|labosport\.com/i.test(t)) return false;
    return true;
  });
  const colJoin = arr => norm(arr.sort((a,b)=> b.y-a.y || a.x-b.x).map(i=>i.str).join(" "));
  const leftText  = colJoin(p1.filter(it=>it.x<220));
  const rightText = colJoin(p1.filter(it=>it.x>=220));
  const between=(s,a,b)=>{ const re=new RegExp(a+"\\s*([\\s\\S]*?)\\s*(?:"+b+")","i"); const m=s.match(re); return m?norm(m[1]):""; };
  const after =(s,a)=>{ const re=new RegExp(a+"\\s*([\\s\\S]*)","i"); const m=s.match(re); return m?norm(m[1]):""; };

  out.name    = between(leftText,"VENUE NAME:","Primary contact:|Email \\+ phone:|Grass Type:|$") || after(leftText,"VENUE NAME:");
  out.address = between(rightText,"ADDRESS:","Position:|$") || after(rightText,"ADDRESS:")
             || between(leftText,"ADDRESS:","Primary contact:|$");
  out.contact = between(leftText,"Primary contact:","Email \\+ phone:|Grass Type:|Position:|$");
  out.position= between(rightText,"Position:","$") || between(leftText,"Position:","Email|Grass|$");
  out.email   = (leftText.match(/([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})/)||[])[1]||"";
  const ephone= (leftText.match(/(\(?\+?\d[\d\s\-().]{6,}\d)\s*(?:Grass Type:|$)/)||[])[1]
             || (leftText.match(/(\(?\+?\d[\d\s\-().]{6,}\d)/)||[])[1] || "";
  out.phone   = norm(ephone.replace(/[|]/g,"").replace(/\s+/g,""));
  out.grass   = after(leftText,"Grass Type:").replace(/\s*1\. OVERALL.*$/i,"").trim();

  // ---------- SECTION 1 comments ----------
  out.venueComment = grab(/COMMENTS FROM THE VENUE:\s*([\s\S]*?)(?:\nCOMMENTS FROM WORLD RUGBY|\n2\. DETAILED|\nLabosport Group)/i);
  out.wr           = grab(/COMMENTS FROM WORLD RUGBY[^\n]*\n([\s\S]*?)(?:\n2\. DETAILED|\nLabosport Group|\nOUTDOOR TRAINING)/i);

  // ---------- SECTION 2 table (x-column split + nearest-center assignment) ----------
  // find the section-2 page index
  let s2 = pages.findIndex(pg => linesOf(pg).some(l=>/2\. DETAILED RISK ASSESSMENT/i.test(l.text)));
  if(s2<0) s2 = pages.length-1;
  const items = pages.slice(s2).flat().filter(it=>{
    const t=norm(it.str); if(!t) return false;
    if(it.y>740 || it.y<55) return false;                 // header band / footer
    if(/PARAMETER|COMMENTS FROM THE VENUE|DETAILED RISK|OUTDOOR TRAINING|MATCH VENUES/i.test(t)) return false;
    return true;
  });
  const COLX=150;
  const left  = items.filter(it=>it.x<COLX);
  const right = items.filter(it=>it.x>=COLX && it.x<430);

  // cluster left items into labels by y-gap
  left.sort((a,b)=>b.y-a.y);
  const clusters=[]; let cur=null;
  for(const it of left){
    if(cur && (cur.lastY-it.y)<24){ cur.parts.push(it.str); cur.ys.push(it.y); cur.lastY=it.y; }
    else { cur={parts:[it.str],ys:[it.y],lastY:it.y}; clusters.push(cur); }
  }
  const labels = clusters.map(c=>({
    text:norm(c.parts.join(" ")),
    center:c.ys.reduce((a,b)=>a+b,0)/c.ys.length,
    param:matchParam(c.parts.join(" "))
  })).filter(l=>l.param);

  // assign each right line (grouped by y) to nearest label center
  const rlines={};
  right.forEach(it=>{const y=Math.round(it.y);(rlines[y]=rlines[y]||[]).push(it);});
  const ordered=Object.keys(rlines).map(Number).sort((a,b)=>b-a);
  const buckets={}; labels.forEach(l=>buckets[l.param]=[]);
  for(const y of ordered){
    const text=norm(rlines[y].sort((a,b)=>a.x-b.x).map(i=>i.str).join(" "));
    let best=null,bd=1e9;
    for(const l of labels){ const d=Math.abs(l.center-y); if(d<bd){bd=d;best=l;} }
    if(best) buckets[best.param].push(text);
  }
  labels.forEach(l=>{ out.params[l.param]=norm(buckets[l.param].join(" ")); });

  // ---------- pitch suggestions (from WR note) ----------
  out.pitches = derivePitches(out.wr);
  return out;
}

function derivePitches(wr){
  const w=(wr||"").toLowerCase();
  if(/stadium/.test(w) && /back/.test(w)) return ["Stadium pitch","Back pitch"];
  const m=w.match(/testing\s+(\d+)/);
  if(m){ const n=Math.min(parseInt(m[1]),6); return Array.from({length:n},(_,i)=>`Pitch ${i+1}`); }
  return ["Pitch 1"];
}

if (typeof module!=="undefined") module.exports={parseBrief, KNOWN_PARAMS};
