/* Labosport Pitch Inspector — data collection app (v1)
   Data-collection pass: real entry, on-device persistence, brief autofill, CSV/JSON export.
   Word/PDF report generation (exact template) is the next pass. */
'use strict';

/* ----------------------------- definitions ----------------------------- */
const TESTS = [
  {key:'turf_cover', name:'Turf cover',                   n:3,  unit:'%',    pri:false},
  {key:'weed',       name:'Weed content',                 n:3,  unit:'%',    pri:false},
  {key:'turf_height',name:'Turf height',                  n:3,  unit:'mm',   pri:false},
  {key:'infil',      name:'Infiltration rate',            n:3,  unit:'mm/h', pri:false},
  {key:'soil',       name:'Soil properties (root depth)', n:3,  unit:'mm',   pri:false, note:'Measure root depth (mm) at each position. Add a photo per observation below.', obsPhotos:true},
  {key:'shear',      name:'Root zone shear strength',     n:1,  unit:'Nm',   pri:false},
  {key:'ndvi',       name:'Turf health (NDVI)',           n:25, unit:'',     pri:false},
  {key:'clegg',      name:'Clegg impact (compaction)',    n:25, unit:'g',    pri:true},
  {key:'traction',   name:'Surface traction / 19 mm stud',n:25, unit:'Nm',   pri:true},
  {key:'moisture',   name:'Soil moisture — 38 mm (1.5 in)',n:25, unit:'%',   pri:true},
  {key:'moisture76', name:'Soil moisture — 76 mm (3 in)', n:25, unit:'%',    pri:true},
];
const TKEY = Object.fromEntries(TESTS.map(t=>[t.key,t]));

// Grouped tests: several metrics recorded at the SAME shared positions, entered together on one screen.
// Data still lives in each member's own tests[key] bucket, so reports/CSV/results are unchanged.
const GROUPS = [
  {key:'turf', name:'Turf cover, weed & height', n:3, members:['turf_cover','weed','turf_height']},
];
const GKEY = Object.fromEntries(GROUPS.map(g=>[g.key,g]));
const GROUP_OF = {}; GROUPS.forEach(g=>g.members.forEach(m=>GROUP_OF[m]=g));   // memberKey -> group
const GMETRIC_LABEL = {turf_cover:'Turf cover', weed:'Weed', turf_height:'Height'};
function metricShort(k){ return GMETRIC_LABEL[k] || (TKEY[k]?TKEY[k].name:k); }

// audit sections A-H: [code, title, hint, briefParam, fields]
const YN = 'yn', TXT='text', AREA='area', NUM='num';
const AUDIT = [
  ['A','Field background','Staffing, sports, levels, games & sessions','Field usage',
    [['Number of grounds staff',TXT],['Sports played on the field',TXT],['Levels of play',TXT],['Games per year',TXT],['Practice sessions per year',TXT]]],
  ['B','Pitch dimensions, design & construction','Area, reinforcement, slope, levelness','Pitch dimensions',
    [['Full playing surface area',TXT],['Reinforcement installed?',YN],['Reinforcement details',TXT],['Installation date',TXT],['Slope / gradient shape',TXT],['Slope / gradient assessment',TXT],['Levelness assessment',TXT],['Distance between post sockets',TXT]]],
  ['C','Performance, irrigation & water','Irrigation system, source, quality, perf. data','Irrigation and Water management',
    [['Pop-up irrigation present?',YN],['Number of sprinkler heads',TXT],['Year installed',TXT],['Water supply source',TXT],['Water quality',TXT],['Operational issues / performance concerns',AREA],['Performance data collected?',YN],['Performance data details',AREA]]],
  ['D','Drainage & waterlogging','Ponding, duration, closures','Drainage & Waterlogging Performance',
    [['Ponding / squelchy conditions?',YN],['Ponding / squelchy conditions (details)',AREA],['Typical duration after heavy rain',TXT],['Occurrences per year',TXT],['Avg closure days per season (wet)',TXT]]],
  ['E','Grass type, growth & seasonal','Species, disease / disorder','Soil profile',
    [['Grass species / turf type(s)',TXT],['Disease or disorder identified?',YN],['Disease / disorder details',AREA]]],
  ['F','Turf management resources','Equipment inventory','Resources',
    [['Tractor',YN],['Cylinder mower',YN],['Pedestrian rotary mower',YN],['Fertilizer spreader',YN],['Pedestrian spreader',YN],['Tractor-mounted aerator',YN],['Line marker (Roller/Spray)',YN],['Top dresser',YN],['Boom sprayer',YN],['Over-seeder / Dimple-seeder',YN],['Tractor-drawn brush / Drag mat',YN],['Other',TXT]]],
  ['G','Maintenance operations','Fertilizer, herbicide, other','Additional aspects',
    [['Fertilizer applications/yr (type & rate)',AREA],['Herbicide applications per year',TXT],['Other turf management activities',AREA]]],
  ['H','Other risks','Playability risks & comments','Safety',
    [['Additional playability risks',AREA],['General comments on surface / maintenance',AREA]]],
];

const RISK = [
  ['field_usage','Field usage'],['pitch_dim','Pitch dimensions'],['soil','Soil profile'],
  ['irrigation','Irrigation & water management'],['drainage','Drainage & waterlogging'],
  ['surface','Surface performance'],['safety','Safety'],['turf_mgmt','Turf management skills'],
  ['resources','Resources'],['additional','Additional aspects'],
];
const RLABEL = {1:'Low',2:'Moderate',3:'High',4:'Critical'};
// Risk-box colouring for the Word report. Each *_score (and the overall) cell in
// report_template.docx carries a unique sentinel fill; after rendering we swap it
// for the colour of that pitch's actual level (matches the in-app chip palette).
const RISK_LEVEL_COLOR = {0:'D9D9D9',1:'2E9E5B',2:'E0A000',3:'E8731F',4:'E92840'};
const RISK_SENTINEL = {overall:'AA00FF',field_usage:'AA0001',pitch_dim:'AA0002',soil:'AA0003',
  irrigation:'AA0004',drainage:'AA0005',surface:'AA0006',safety:'AA0007',turf_mgmt:'AA0008',
  resources:'AA0009',additional:'AA000A'};

/* ----------------------------- seed data (from the two Charlotte briefs) ----------------------------- */
const SEED = [
  {name:'Mecklenburg County Sportsplex', alias:'Matthews Sportsplex',
   address:'2425 Sports Pkwy, Matthews, NC 28105', contact:'Jonathan Waszak',
   position:'Sports Field & Grounds Manager', email:'Jonathan.waszak@mecknc.gov', phone:'980-215-2220',
   grass:'Tifway 419 Bermudagrass, winter-overseeded with perennial ryegrass',
   venueComment:'No specific additional risks at present. Surface is ~10 years old; full renovation planned within 1–2 years.',
   wr:'Test both the stadium pitch and the back pitch. Privately run public park with its own grounds team.',
   pitchNames:['Stadium pitch','Back pitch'],
   params:{
     'Field usage':'30–50 games and 0–15 practice sessions. Football, soccer, lacrosse and rugby across youth, community, club/collegiate and elite levels.',
     'Pitch dimensions':'108,900 sq ft. Crowned profile; no reinforcement system installed.',
     'Soil profile':'Sand top-dressed annually. Tifway 419 Bermuda + winter ryegrass overseed. Soil sampled twice per year.',
     'Irrigation and Water management':'52 sprinkler heads; city water (above-average quality). Moisture monitored via SGL TurfPods.',
     'Drainage & Waterlogging Performance':'Drainage efficiency excellent. Ponding occurs but typically <1 hr, ~2–3 events/yr.',
     'Surface Performance':'Surface performance, slope/gradient and levelness all rated good. Performance data = moisture via SGL TurfPods.',
     'Safety':'No specific safety concerns. Preventative fungicide programme in place.',
     'Turf Management Skills':'Previous experience hosting elite teams. Led by Jonathan Waszak, supported by a staff of 5.',
     'Resources':'Tractor, cylinder & rotary mowers, fertilizer spreader, pedestrian & tractor aerators, line marker, top dresser, boom sprayer, drag mat. Topdressing 2×/yr (100–150 t sand), verticut 3–4×/yr, deep tine + core aeration, rolling after aeration.',
     'Additional aspects':'~10 yrs old, renovation in 1–2 yrs. Herbicide ~2–3 applications/yr (more if pre-emergent needed).'
   }},
  {name:'Ramblewood Soccer Complex', alias:'',
   address:'10200 Nations Ford Rd, Charlotte, NC 28273', contact:'Steve Elliott',
   position:'Athletic Coordinator', email:'steven.elliott@mecklenburgcountync.gov', phone:'980-314-1196',
   grass:'Bermuda',
   venueComment:'Fields do close due to rain; fields are at varying sizes.',
   wr:'11 pitches on site (parks & rec facility). Suggest testing 2. Top-3 preference marked on the map (blue=1st, yellow=2nd, green=3rd) — open to agronomist’s opinion.',
   pitchNames:['Pitch — 1st choice (blue)','Pitch — 2nd choice (yellow)'],
   params:{
     'Field usage':'>100 games and >100 practice sessions; recreational / community use.',
     'Pitch dimensions':'11 fields of varying dimensions.',
     'Soil profile':'No annual soil/sand top dressing; no reinforcement system; slope/gradient not provided.',
     'Irrigation and Water management':'No sprinkler heads; water supply source not provided.',
     'Drainage & Waterlogging Performance':'Drainage efficiency good. Ponding/waterlogging typically 6–24 hr, ~10–15 events/yr.',
     'Surface Performance':'Surface performance average; slope/gradient average; levelness good; performance data not collected.',
     'Safety':'Additional risk to playability: weather.',
     'Turf Management Skills':'Herbicide 1–2/yr. Reseeding/resodding as needed; off-seasons for regrowth. Previous experience hosting elite teams: yes.',
     'Resources':'No staff dedicated to the park. Equipment: pedestrian aerator, tractor, line marker (roller/spray), other. Fertilizer applications: unsure.',
     'Additional aspects':'Sports: soccer, lacrosse, rugby, other. Disease/insect/disorder issues: no.'
   }},
];

/* ----------------------------- state / persistence ----------------------------- */
const LSKEY='labosport_v1';
let state=null, CUR=null, CURP=0;

function uid(){return 'id'+Math.random().toString(36).slice(2,9);}
function nameKey(s){return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
function seedId(name){return 'seed_'+nameKey(name);}   // stable id so re-seeding reconciles instead of duplicating
function newPitch(name){
  const tests={}; TESTS.forEach(t=>tests[t.key]={values:Array(t.n).fill(null),comment:'',method:'',photos:{}});
  const audit={}; AUDIT.forEach(s=>audit[s[0]]={fields:{},brief:''});
  const risk={}; RISK.forEach(r=>risk[r[0]]=0);
  return {id:uid(),name:name||'Pitch 1',tests,audit,risk,overall:{level:0,comment:''},bench:{role:'',note:''},photos:[],photoNotes:''};
}
function venueFromSeed(s){
  const v={id:seedId(s.name),name:s.name,alias:s.alias,address:s.address,contact:s.contact,position:s.position,
    email:s.email,phone:s.phone,grass:s.grass,cluster:'Charlotte',wr:s.wr,venueComment:s.venueComment,
    params:s.params||{},briefLoaded:true,
    briefImages:s.briefImages||((window.SEED_BRIEF_IMAGES&&window.SEED_BRIEF_IMAGES[s.name])||[]),pitches:[]};
  (s.pitchNames||['Pitch 1']).forEach(pn=>{const p=newPitch(pn);
    // pre-fill each audit section's brief text from params
    AUDIT.forEach(sec=>{const txt=v.params[sec[3]]||''; if(txt) p.audit[sec[0]].brief=txt;});
    v.pitches.push(p);});
  extractAuditFields(v);
  return v;
}
function venueFromParsed(pv){
  const s={...pv, pitchNames: pv.pitches&&pv.pitches.length?pv.pitches:['Pitch 1']};
  return venueFromSeed(s);
}

/* ---- pull structured audit-field values out of a brief's parameter text ---- */
function mtext(s,re,g){ const m=(s||'').match(re); return m?String(g?m[g]:m[0]).trim():''; }
function equipmentExtractors(){
  const map={'Tractor':/\btractor\b/i,'Cylinder mower':/cylinder mower/i,'Pedestrian rotary mower':/rotary mower/i,
    'Fertilizer spreader':/fertili[sz]er spreader/i,'Pedestrian spreader':/pedestrian spreader/i,
    'Tractor-mounted aerator':/aerat/i,'Line marker (Roller/Spray)':/line marker/i,'Top dresser':/top ?dress/i,
    'Boom sprayer':/boom sprayer/i,'Over-seeder / Dimple-seeder':/over-?seeder|dimple/i,'Tractor-drawn brush / Drag mat':/drag ?mat|brush/i};
  const out={}; Object.keys(map).forEach(k=>{ out[k]=(P)=> map[k].test(P['Resources']||'')?'Yes':''; }); return out;
}
const AUDIT_EXTRACT={
  A:{
    'Number of grounds staff':(P)=>{const s=(P['Turf Management Skills']||'')+' '+(P['Resources']||''); if(/no staff dedicated/i.test(s))return 'None dedicated'; return mtext(s,/staff of (\d+)/i,1)||mtext(s,/(\d+)\s+grounds?\s*staff/i,1);},
    'Sports played on the field':(P)=>mtext(P['Field usage'],/supports? ([^.]+?)(?:\s+across|\.)/i,1)||mtext((P['Additional aspects']||'')+' '+(P['Field usage']||''),/Sports(?: played)?:?\s*([^.]+)/i,1)||mtext(P['Field usage'],/([A-Za-z]+(?:,\s*[A-Za-z]+)+\s+and\s+[A-Za-z]+)\s+across/i,1),
    'Levels of play':(P)=>mtext(P['Field usage'],/across ([^.]*levels)/i,1)||mtext(P['Field usage'],/(youth[^.]*elite[^.]*)/i,1),
    'Games per year':(P)=>mtext(P['Field usage'],/((?:>|more than\s*)?\s*[\d,]+(?:\s*(?:to|–|-)\s*[\d,]+)?)\s*games/i,1),
    'Practice sessions per year':(P)=>mtext(P['Field usage'],/((?:>|more than\s*)?\s*[\d,]+(?:\s*(?:to|–|-)\s*[\d,]+)?)\s*practice sessions/i,1),
  },
  B:{
    'Full playing surface area':(P)=>mtext(P['Pitch dimensions'],/([\d,]+(?:\.\d+)?\s*(?:sq\.?\s*ft|square feet|m²|m2|sqm|acres))/i,1),
    'Reinforcement installed?':(P)=>{const s=P['Pitch dimensions']||''; if(/no reinforcement/i.test(s))return 'No'; if(/reinforcement (system )?installed|reinforced/i.test(s))return 'Yes'; return '';},
    'Slope / gradient shape':(P)=>mtext(P['Pitch dimensions'],/(crowned|flat|sloped|domed|graded)/i,1),
    'Levelness assessment':(P)=>mtext(P['Surface Performance'],/levelness[^.]*?(good|average|poor|excellent|fair)/i,1),
  },
  C:{
    'Pop-up irrigation present?':(P)=>{const s=P['Irrigation and Water management']||''; if(/no sprinkler heads|no irrigation/i.test(s))return 'No'; if(/\d+\s*sprinkler heads|pop-?up|irrigation/i.test(s))return 'Yes'; return '';},
    'Number of sprinkler heads':(P)=>mtext(P['Irrigation and Water management'],/(\d+)\s*sprinkler heads/i,1),
    'Water supply source':(P)=>{const s=P['Irrigation and Water management']||''; if(/not provided/i.test(s))return ''; return mtext(s,/(city water|mains water|well water|reclaimed water|pond|borehole|river)/i,1);},
    'Water quality':(P)=>mtext(P['Irrigation and Water management'],/(above[- ]average|below[- ]average|average|good|poor|excellent)[- ]?quality/i,1),
    'Performance data collected?':(P)=>{const s=(P['Surface Performance']||'')+' '+(P['Irrigation and Water management']||''); if(/not collected/i.test(s))return 'No'; if(/data collected|moisture readings|turfpods/i.test(s))return 'Yes'; return '';},
  },
  D:{
    'Ponding / squelchy conditions?':(P)=>{const s=P['Drainage & Waterlogging Performance']||''; if(/no ponding|no waterlog/i.test(s))return 'No'; if(/ponding|waterlog|squelch/i.test(s))return 'Yes'; return '';},
    'Typical duration after heavy rain':(P)=>mtext(P['Drainage & Waterlogging Performance'],/(less than\s*\d+\s*\w+|<\s*\d+\s*\w+|\d+\s*h(?:ours?|r)?\s*(?:to|–|-)\s*\d+\s*h(?:ours?|r)?|\d+\s*[-–]\s*\d+\s*hrs?)/i,1),
    'Occurrences per year':(P)=>mtext(P['Drainage & Waterlogging Performance'],/([\d]+(?:\s*(?:to|–|-)\s*[\d]+)?)\s*(?:events|occurrences)/i,1),
  },
  E:{
    'Grass species / turf type(s)':(P,v)=>v.grass||mtext(P['Soil profile'],/(Tifway[^.,]*|Bermuda[^.,]*|ryegrass[^.,]*|Kikuyu[^.,]*|Zoysia[^.,]*)/i,1),
    'Disease or disorder identified?':(P)=>{const s=(P['Additional aspects']||'')+' '+(P['Safety']||''); if(/issues:\s*no|no disease|no disorder|disorder issues:\s*no/i.test(s))return 'No'; return '';},
  },
  F: equipmentExtractors(),
  G:{
    'Fertilizer applications/yr (type & rate)':(P)=>{const s=(P['Resources']||'')+' '+(P['Additional aspects']||''); return mtext(s,/(multiple (?:granular|foliar)[^.]*fertili[sz]er applications[^.]*)/i,1)||mtext(s,/Fertilizer applications?:?\s*([^.]+)/i,1);},
    'Herbicide applications per year':(P)=>{const s=(P['Additional aspects']||'')+' '+(P['Turf Management Skills']||'')+' '+(P['Safety']||''); return mtext(s,/herbicide[^.\d]*((?:>|more than\s*)?\d+(?:\s*(?:to|–|-)\s*\d+)?)/i,1);},
    'Other turf management activities':(P)=>mtext(P['Turf Management Skills'],/activities:?\s*([^.]+)/i,1)||mtext(P['Resources'],/(verticut[^.]*|topdressing[^.]*|aerifi[^.]*)/i,1),
  },
  H:{
    'Additional playability risks':(P)=>mtext(P['Safety'],/risk to playability:?\s*([^.]+)/i,1)||mtext(P['Safety'],/(weather|drought|shade|wear)/i,1),
    'General comments on surface / maintenance':(P,v)=>v.venueComment||'',
  },
};
function extractAuditFields(v){
  if(!v||!v.params) return;
  v.pitches.forEach(p=>{
    AUDIT.forEach(sec=>{ const code=sec[0], ex=AUDIT_EXTRACT[code]||{}, fields=p.audit[code].fields;
      Object.keys(ex).forEach(label=>{
        if(fields[label]&&String(fields[label]).trim()) return;   // never clobber existing/edited values
        let val=''; try{ val=ex[label](v.params,v)||''; }catch(e){}
        if(val) fields[label]=String(val).trim();
      });
    });
  });
}
function freshState(){ return {version:1, tester:'', updatedAt:Date.now(), venues:SEED.map(venueFromSeed), _benchMigrated:1}; }
// Ensure a pitch has every test key with a correctly-sized values array.
// Run on load AND on every venue arriving via team/device sync, so report
// generation (which iterates ALL tests) never hits a missing key.
function migratePitchTests(p){
  if(!p) return p; if(!p.tests) p.tests={};
  if(!p.bench||typeof p.bench!=='object') p.bench={role:'',note:''};   // per-pitch benchmark role (benchmark / worse / sim / better)
  TESTS.forEach(t=>{ let td=p.tests[t.key];
    if(!td){ td=p.tests[t.key]={values:Array(t.n).fill(null),comment:'',method:'',photos:{}}; }   // add tests introduced in a newer version (e.g. moisture76)
    if(!Array.isArray(td.values)) td.values=Array(t.n).fill(null);
    if(td.values.length!==t.n){ const nv=Array(t.n).fill(null); for(let i=0;i<Math.min(td.values.length,t.n);i++)nv[i]=td.values[i]; td.values=nv; td.positions=null; }
    if(!td.photos) td.photos={}; });
  return p;
}
// One-time: fold the old global state.benchmark (single benchmark tab across all
// venues) into per-pitch p.bench.role/.note. Runs once, guarded by a flag, so it
// never clobbers values the user later edits in the venue tab.
function migrateBenchmark(st){
  if(!st||st._benchMigrated) return;
  const b=st.benchmark;
  if(b&&(b.benchId||(b.comparisons&&Object.keys(b.comparisons).length))){
    const byId={}; (st.venues||[]).forEach(v=>(v.pitches||[]).forEach(p=>{byId[p.id]=p;}));
    if(b.benchId&&byId[b.benchId]){ const p=byId[b.benchId]; p.bench=p.bench||{role:'',note:''};
      if(!p.bench.role){ p.bench.role='bench'; if(!p.bench.note&&b.rationale) p.bench.note=b.rationale; } }
    Object.keys(b.comparisons||{}).forEach(id=>{ const p=byId[id]; if(!p) return; const c=b.comparisons[id]||{};
      p.bench=p.bench||{role:'',note:''};
      if(!p.bench.role&&c.rel){ p.bench.role=c.rel; if(!p.bench.note&&c.note) p.bench.note=c.note; } });
  }
  st._benchMigrated=1; delete st.benchmark;
}
function load(){
  try{const raw=localStorage.getItem(LSKEY); if(raw){state=JSON.parse(raw); if(!state.updatedAt)state.updatedAt=Date.now();
    try{ (state.venues||[]).forEach(v=>{ extractAuditFields(v);
      if((!v.briefImages||!v.briefImages.length)&&window.SEED_BRIEF_IMAGES&&window.SEED_BRIEF_IMAGES[v.name]) v.briefImages=window.SEED_BRIEF_IMAGES[v.name];
      (v.pitches||[]).forEach(migratePitchTests); }); }catch(e){}   // backfill brief fields/images + migrate test sizes
    try{ migrateBenchmark(state); }catch(e){}                     // fold old global benchmark tab into per-pitch fields
    try{ dedupeVenues(); }catch(e){}                              // collapse any same-name duplicate venues
    initMedia();                                                 // open IndexedDB, migrate old photos out of localStorage, hydrate blobs back in
    return;}}catch(e){}
  state=freshState(); save(); initMedia();
}
let saveTimer=null;
function save(flash,opts){
  opts=opts||{};
  if(!opts.keepStamp){ state.updatedAt=Date.now();
    // Stamp the venue being edited with a local _ts. Without this, locally-edited
    // venues had no _ts (0), so applyRemoteVenue's last-write-wins check let ANY
    // remote snapshot overwrite fresh edits on reopen — i.e. data appeared to "not
    // save". Now a remote copy must be strictly newer than this local edit to win.
    const _v=state.venues&&state.venues.find(x=>x.id===CUR); if(_v) _v._ts=Date.now();
  }
  // Photos/brief-images live in IndexedDB (huge quota); localStorage holds only the small,
  // blob-free state — so a few phone photos can't overflow the ~5MB localStorage budget and
  // wipe the whole save. Falls back to the old (heavy) write until IndexedDB is confirmed open.
  try{ localStorage.setItem(LSKEY, mediaOK ? JSON.stringify(state, mediaReplacer) : JSON.stringify(state));
    if(flash){const s=document.getElementById('savedFlag'); if(s){s.classList.add('show'); clearTimeout(saveTimer); saveTimer=setTimeout(()=>s.classList.remove('show'),900);} }
  }catch(e){ toast('⚠ Storage full — export a backup and remove some photos'); }
  if(mediaOK) persistMedia();
  try{ cloudPersistMedia(); }catch(e){}                          // also push photo bytes to Storage (cross-device)
  if(!opts.noSync && window.GDrive && GDrive.isConnected()) GDrive.schedulePush();
  if(!opts.noFB && window.FB && FB.isEnabled()) FB.schedulePush();
}

/* ----------------------------- media store (IndexedDB) ----------------------------- */
// Keeps large base64 photo data OUT of the 5MB localStorage blob. In memory each photo keeps
// its {id,dataUrl}; on disk localStorage stores only {id,w,h} (dataUrl stripped) and the blobs
// live in IndexedDB keyed by photo id. Brief-image arrays are stored under 'brief:'+venueId.
const MEDIA_DB='labosport_media', MEDIA_STORE='blobs';
let mediaOK=false, _mediaDB=null, mediaSaved=new Set(), mediaBrief={};
const mediaReplacer=(k,v)=> (k==='dataUrl'||k==='briefImages') ? undefined : v;   // drop blobs from the localStorage copy
function mediaOpen(){ return _mediaDB || (_mediaDB=new Promise((res,rej)=>{
  let req; try{ req=indexedDB.open(MEDIA_DB,1); }catch(e){ return rej(e); }
  req.onupgradeneeded=()=>{ const d=req.result; if(!d.objectStoreNames.contains(MEDIA_STORE)) d.createObjectStore(MEDIA_STORE); };
  req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error);
})); }
function mediaTx(mode){ return mediaOpen().then(db=>db.transaction(MEDIA_STORE,mode).objectStore(MEDIA_STORE)); }
function mediaGet(id){ return mediaTx('readonly').then(os=>new Promise((res,rej)=>{ const r=os.get(id); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); })); }
function mediaSet(id,val){ return mediaTx('readwrite').then(os=>new Promise((res,rej)=>{ const r=os.put(val,id); r.onsuccess=()=>res(); r.onerror=()=>rej(r.error); })); }
// visit every photo object {id,dataUrl} in the state (pitch photos + per-observation test photos)
function eachPhoto(st,fn){ (st&&st.venues||[]).forEach(v=>(v.pitches||[]).forEach(p=>{
  (p.photos||[]).forEach(ph=>fn(ph));
  if(p.tests) Object.keys(p.tests).forEach(k=>{ const ph=p.tests[k]&&p.tests[k].photos; if(ph) Object.keys(ph).forEach(pos=>(ph[pos]||[]).forEach(fn)); });
})); }
// push any in-memory blobs not yet in IndexedDB (covers new photos + one-time migration of old localStorage photos)
function persistMedia(){ if(!mediaOK) return Promise.resolve(); const jobs=[];
  try{ eachPhoto(state, ph=>{ if(ph&&ph.id&&ph.dataUrl&&!mediaSaved.has(ph.id)){ mediaSaved.add(ph.id); jobs.push(mediaSet(ph.id,ph.dataUrl).catch(()=>mediaSaved.delete(ph.id))); } });
    (state.venues||[]).forEach(v=>{ const arr=v.briefImages; if(arr&&arr.length&&mediaBrief[v.id]!==arr.length){ mediaBrief[v.id]=arr.length; jobs.push(mediaSet('brief:'+v.id,arr.slice()).catch(()=>{ delete mediaBrief[v.id]; })); } });
  }catch(e){}
  return Promise.all(jobs);
}
// pull blobs back into the in-memory state for photos/brief-images that were stored lite (no dataUrl)
function hydrateMedia(){ const jobs=[];
  try{ eachPhoto(state, ph=>{ if(ph&&ph.id&&!ph.dataUrl){ jobs.push(mediaGet(ph.id).then(d=>{ if(d){ ph.dataUrl=d; mediaSaved.add(ph.id); } })); } });
    (state.venues||[]).forEach(v=>{ if(!v.briefImages||!v.briefImages.length){ jobs.push(mediaGet('brief:'+v.id).then(arr=>{ if(arr&&arr.length){ v.briefImages=arr; mediaBrief[v.id]=arr.length; } })); } });
  }catch(e){}
  return Promise.all(jobs).then(()=>{ try{ render(); }catch(e){} });
}
function initMedia(){ mediaOpen().then(()=>{ mediaOK=true; try{ persistMedia(); }catch(e){} return hydrateMedia(); }).catch(()=>{ mediaOK=false; }); }
/* ---- cloud media tier (Firebase Storage): same idea as IndexedDB, but shared across devices ---- */
let cloudSaved=new Set(), cloudBriefN={};
function cloudActive(){ return window.FB && FB.isSignedIn && FB.isSignedIn() && FB.storageReady && FB.storageReady(); }
// upload any photo bytes / brief images not yet pushed to Storage (mirrors persistMedia)
function cloudPersistMedia(){ if(!cloudActive()) return;
  try{ eachPhoto(state, ph=>{ if(ph&&ph.id&&ph.dataUrl&&!cloudSaved.has(ph.id)){ cloudSaved.add(ph.id);
        FB.putMedia(ph.id, ph.dataUrl).catch(()=>cloudSaved.delete(ph.id)); } });
    (state.venues||[]).forEach(v=>{ const arr=v.briefImages; if(arr&&arr.length&&cloudBriefN[v.id]!==arr.length){ cloudBriefN[v.id]=arr.length;
        FB.putBrief(v.id, arr).catch(()=>{ delete cloudBriefN[v.id]; }); } }); }catch(e){}
}
// pull bytes for any photo ref / brief set that synced as a reference only (mirrors hydrateMedia)
function cloudHydrate(){ if(!cloudActive()) return;
  const reflow=()=>{ if(!ENTRY_ROUTES.test(cur())){ try{ render(); }catch(e){} } };   // don't yank focus mid data-entry
  try{ eachPhoto(state, ph=>{ if(ph&&ph.id&&!ph.dataUrl){ FB.getMedia(ph.id).then(d=>{ if(d){ ph.dataUrl=d; cloudSaved.add(ph.id);
        if(mediaOK){ try{ mediaSet(ph.id,d); mediaSaved.add(ph.id); }catch(e){} } reflow(); } }).catch(()=>{}); } });
    (state.venues||[]).forEach(v=>{ const have=(v.briefImages||[]).length, want=v._briefN||0;
      if(want>have){ FB.getBrief(v.id).then(arr=>{ if(arr&&arr.length){ v.briefImages=arr; cloudBriefN[v.id]=arr.length;
        if(mediaOK){ try{ mediaSet('brief:'+v.id,arr.slice()); mediaBrief[v.id]=arr.length; }catch(e){} } reflow(); } }).catch(()=>{}); } }); }catch(e){}
}
/* ---- incoming team-sync changes from Firestore ---- */
// Field-level merge. The cloud holds one record per venue; previously an incoming copy either
// replaced the whole local venue or was dropped entirely (last-write-wins by _ts). Both paths
// LOST data: edits made on one device wiped edits made on the other for the same venue. We now
// fold the two copies together — union pitches/photos by id and fill every blank from the other
// side — so a value entered anywhere survives. _ts is used only to break true field conflicts
// (the exact same field edited on both devices), where the newer copy wins.

// union two photo arrays by id, keeping whichever copy actually carries the image bytes (dataUrl)
function mergePhotoArr(a,b){ a=a||[]; b=b||[]; const out=[], seen={};
  a.concat(b).forEach(ph=>{ if(!ph||!ph.id) return; const ex=seen[ph.id];
    if(!ex){ seen[ph.id]=Object.assign({},ph); out.push(seen[ph.id]); }
    else if(!ex.dataUrl && ph.dataUrl){ ex.dataUrl=ph.dataUrl; ex.w=ex.w||ph.w; ex.h=ex.h||ph.h; } });
  return out; }
// union per-observation test photo maps { position -> [ {id,..} ] }
function mergeTestPhotos(a,b){ a=a||{}; b=b||{}; const out={};
  new Set(Object.keys(a).concat(Object.keys(b))).forEach(pos=>{ out[pos]=mergePhotoArr(a[pos],b[pos]); }); return out; }
// fold `other` pitch into `base` pitch, filling blanks only (base wins real conflicts)
function mergePitchDeep(base, other){
  if(other.name && !base.name) base.name=other.name;
  if(other.tests){ base.tests=base.tests||{};
    Object.keys(other.tests).forEach(k=>{ const ot=other.tests[k]; let bt=base.tests[k];
      if(!bt){ base.tests[k]=ot; return; }
      if(Array.isArray(ot.values)){ bt.values=bt.values||[]; ot.values.forEach((val,vi)=>{ if(val!=null && bt.values[vi]==null) bt.values[vi]=val; }); }
      if((!bt.comment||!bt.comment.trim())&&ot.comment) bt.comment=ot.comment;
      if((!bt.method||!bt.method.trim())&&ot.method) bt.method=ot.method;
      bt.photos=mergeTestPhotos(bt.photos, ot.photos); }); }
  if(other.audit){ base.audit=base.audit||{};
    Object.keys(other.audit).forEach(s=>{ const oa=other.audit[s]; let ba=base.audit[s];
      if(!ba){ base.audit[s]=oa; return; }
      if(oa.fields){ ba.fields=ba.fields||{}; Object.keys(oa.fields).forEach(k=>{ const ov=oa.fields[k];
        if(ov!=null&&String(ov).trim()!==''&&(ba.fields[k]==null||String(ba.fields[k]).trim()==='')) ba.fields[k]=ov; }); }
      if((!ba.brief||!ba.brief.trim())&&oa.brief) ba.brief=oa.brief; }); }
  if(other.risk){ base.risk=base.risk||{}; Object.keys(other.risk).forEach(k=>{ if(!base.risk[k]&&other.risk[k]) base.risk[k]=other.risk[k]; }); }
  if(other.overall&&other.overall.level&&(!base.overall||!base.overall.level)) base.overall=other.overall;
  if(other.overall&&other.overall.comment&&base.overall&&!(base.overall.comment&&base.overall.comment.trim())) base.overall.comment=other.overall.comment;
  if(other.bench&&(other.bench.role||other.bench.note)&&(!base.bench||(!base.bench.role&&!base.bench.note))) base.bench=other.bench;
  if(other.photos) base.photos=mergePhotoArr(base.photos, other.photos);
  if(other.photoNotes&&!(base.photoNotes&&base.photoNotes.trim())) base.photoNotes=other.photoNotes; }
// fold `other` venue into `base` venue, unioning pitches by id
function mergeVenueDeep(base, other){
  ['name','alias','address','contact','position','email','phone','grass','wr','venueComment','cluster'].forEach(k=>{ if((base[k]==null||!String(base[k]).trim())&&other[k]) base[k]=other[k]; });
  if((!base.params||!Object.keys(base.params).length)&&other.params) base.params=other.params;
  if(other.briefLoaded) base.briefLoaded=true;
  if((!base.briefImages||!base.briefImages.length)&&other.briefImages&&other.briefImages.length) base.briefImages=other.briefImages;
  base._briefN=Math.max(base._briefN||0, other._briefN||0, (base.briefImages||[]).length);   // so cloudHydrate knows to fetch brief images from Storage
  base.pitches=base.pitches||[];
  (other.pitches||[]).forEach(op=>{ const bp=base.pitches.find(x=>x.id===op.id); if(!bp) base.pitches.push(op); else mergePitchDeep(bp, op); }); }

const ENTRY_ROUTES=/^(test:|audit:|overall|risk|venueform|photos)/;
function applyRemoteVenue(remote){
  if(!remote||!remote.id) return;
  const i=state.venues.findIndex(x=>x.id===remote.id), local=i>=0?state.venues[i]:null;
  (remote.pitches||[]).forEach(migratePitchTests);              // backfill any test keys missing from the synced copy
  if(!local){                                                   // brand-new venue → take it wholesale
    state.venues.push(remote);
    if(window.FB) FB.markSeen(remote);
    save(false,{keepStamp:true,noSync:true,noFB:true});
  } else {
    const remoteNewer=(remote._ts||0) > (local._ts||0);
    const base=remoteNewer?remote:local, other=remoteNewer?local:remote;
    mergeVenueDeep(base, other);
    base._ts=Math.max(remote._ts||0, local._ts||0);
    state.venues[i]=base;
    // Push the union back so every device converges on the merged record. pushChanges compares a
    // content hash, so an idempotent merge (nothing new folded in) is a no-op and won't echo-loop.
    save(false,{keepStamp:true,noSync:true});                   // noFB omitted → allow team-sync push
  }
  try{ cloudHydrate(); }catch(e){}                              // pull any photo blobs referenced but not held locally
  try{ dedupeVenues(); }catch(e){}                              // a re-seeded copy may arrive with a new id → collapse it
  if(!ENTRY_ROUTES.test(cur())) render();                       // don't yank focus while entering data
  else toast('Team update received for “'+remote.name+'”');
}
function removeRemoteVenue(id){
  const i=state.venues.findIndex(x=>x.id===id); if(i<0) return;
  const nm=state.venues[i].name; state.venues.splice(i,1);
  if(CUR===id){ CUR=null; stack=['home']; }
  save(false,{keepStamp:true,noSync:true,noFB:true});
  if(!ENTRY_ROUTES.test(cur())) render();
  toast('“'+nm+'” was removed by a teammate');
}
function venue(){return state.venues.find(v=>v.id===CUR);}
function pitch(){const v=venue(); return v?v.pitches[CURP]:null;}

/* ---- duplicate cleanup: collapse same-name venues (e.g. from a re-seed under a new id) ---- */
function venueDataScore(v){ let s=0;
  (v.pitches||[]).forEach(p=>{
    TESTS.forEach(t=>{ const td=p.tests&&p.tests[t.key]; if(td&&Array.isArray(td.values)) s+=td.values.filter(x=>x!=null).length; });
    AUDIT.forEach(a=>{ const f=p.audit&&p.audit[a[0]]&&p.audit[a[0]].fields; if(f) s+=Object.values(f).filter(x=>x!=null&&String(x).trim()!=='').length; });
    if(p.overall&&p.overall.level) s++;
  });
  return s;
}
// copy any non-empty data from `l` into blanks of `w` so a merge never loses entries
function mergeVenueInto(w,l){
  ['alias','address','contact','position','email','phone','grass','wr','venueComment','cluster'].forEach(k=>{ if((!w[k]||!String(w[k]).trim())&&l[k]) w[k]=l[k]; });
  if((!w.params||!Object.keys(w.params).length)&&l.params) w.params=l.params;
  if(l.briefLoaded) w.briefLoaded=true;
  if((!w.briefImages||!w.briefImages.length)&&l.briefImages&&l.briefImages.length) w.briefImages=l.briefImages;
  (l.pitches||[]).forEach((lp,pi)=>{ const wp=w.pitches&&w.pitches[pi]; if(!wp) return;
    TESTS.forEach(t=>{ const lt=lp.tests&&lp.tests[t.key], wt=wp.tests&&wp.tests[t.key]; if(!lt||!wt) return;
      (lt.values||[]).forEach((val,vi)=>{ if(val!=null && wt.values[vi]==null) wt.values[vi]=val; });
      if((!wt.comment||!wt.comment.trim())&&lt.comment) wt.comment=lt.comment;
      if((!wt.method||!wt.method.trim())&&lt.method) wt.method=lt.method; });
    AUDIT.forEach(a=>{ const lf=lp.audit&&lp.audit[a[0]]&&lp.audit[a[0]].fields, wf=wp.audit&&wp.audit[a[0]]&&wp.audit[a[0]].fields; if(!lf||!wf) return;
      Object.keys(lf).forEach(k=>{ if((wf[k]==null||String(wf[k]).trim()==='')&&lf[k]!=null&&String(lf[k]).trim()!=='') wf[k]=lf[k]; }); });
    if(lp.overall&&lp.overall.level&&(!wp.overall||!wp.overall.level)) wp.overall=lp.overall; });
}
function dedupeVenues(){
  const groups={};
  state.venues.forEach(v=>{ const k=nameKey(v.name); (groups[k]=groups[k]||[]).push(v); });
  const removeIds=[];
  Object.values(groups).forEach(list=>{ if(list.length<2) return;
    // winner = the well-formed one (has pitches), then the most data, then the most recently updated
    list.sort((a,b)=>{ const pa=(a.pitches&&a.pitches.length)?1:0, pb=(b.pitches&&b.pitches.length)?1:0;
      if(pa!==pb) return pb-pa; const da=venueDataScore(a), db=venueDataScore(b);
      if(da!==db) return db-da; return (b.updatedAt||0)-(a.updatedAt||0); });
    const win=list[0];
    for(let i=1;i<list.length;i++){ mergeVenueInto(win,list[i]); removeIds.push(list[i].id); }
  });
  if(!removeIds.length) return false;
  const rm=new Set(removeIds);
  if(CUR&&rm.has(CUR)){ CUR=null; stack=['home']; }   // we're viewing a dropped duplicate → go home
  state.venues=state.venues.filter(v=>!rm.has(v.id));
  if(window.FB&&FB.deleteVenueDoc) removeIds.forEach(id=>{ if(id) FB.deleteVenueDoc(id); });   // remove stale copy from the team database
  return true;
}

/* ----------------------------- helpers ----------------------------- */
const $=id=>document.getElementById(id);
const esc=s=>(s==null?'':String(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(m){const t=$('toast');t.innerHTML=m;t.classList.add('show');clearTimeout(window._tt);window._tt=setTimeout(()=>t.classList.remove('show'),2400);}
function stats(values){
  const nums=values.filter(v=>typeof v==='number'&&!isNaN(v));
  if(!nums.length) return {n:0,avg:null,varPct:null,done:0};
  const avg=nums.reduce((a,b)=>a+b,0)/nums.length;
  const maxDev=Math.max(...nums.map(v=>Math.abs(v-avg)));
  const varPct=avg!==0?Math.round(maxDev/Math.abs(avg)*100):null;
  return {n:nums.length,avg,varPct,done:nums.length};
}
function fmt(n,unit){ if(n==null) return '—'; const r=Math.abs(n)>=10?Math.round(n):Math.round(n*100)/100; return r+(unit?(' '+unit):''); }
function shortNum(v){ return String(Math.abs(v)>=10?Math.round(v):Math.round(v*100)/100); }       // compact label for a map dot
function dotFontSVG(lbl){ const L=String(lbl).length; return L<=2?9:(L===3?7.4:6.2); }

/* ----------------------------- router ----------------------------- */
const TOP=['home','settings'];
let stack=['home'];
function go(route,push){ if(push)stack.push(route); else if(TOP.includes(route))stack=[route]; else if(stack[stack.length-1]!==route)stack.push(route); render(); }
function back(){ if(stack.length>1){stack.pop(); render();} }
function goReplace(route){ stack[stack.length-1]=route; render(); }
function cur(){return stack[stack.length-1];}

function render(){
  const r=cur(); const app=$('app');
  let title='Labosport Pitch Inspector', sub='';
  const onHome=(r==='home');
  if(r==='home'){ app.innerHTML=scrHome(); }
  else if(r==='venue'){ const v=venue(); title=v.name; sub=v.pitches[CURP]?v.pitches[CURP].name:''; app.innerHTML=scrVenue(); }
  else if(r.startsWith('audit:')){ const s=AUDIT.find(a=>a[0]===r.split(':')[1]); title=s[0]+'. '+s[1]; sub='Venue audit'; app.innerHTML=scrAudit(r.split(':')[1]); }
  else if(r.startsWith('test:')){ const t=TKEY[r.split(':')[1]]; title=t.name; sub='On-site testing'; app.innerHTML=scrTest(t.key); }
  else if(r.startsWith('grp:')){ const g=GKEY[r.split(':')[1]]; title=g.name; sub='On-site testing'; app.innerHTML=scrGroup(g.key); }
  else if(r==='overall'){ title='Overall assessment'; sub=venue().name; app.innerHTML=scrOverall(); }
  else if(r==='risk'){ title='Risk assessment'; sub=venue().name; app.innerHTML=scrRisk(); }
  else if(r==='results'){ title='Results summary'; sub=venue().name; app.innerHTML=scrResults(); }
  else if(r==='photos'){ title='Photos'; sub=pitch()?pitch().name:''; app.innerHTML=scrPhotos(); }
  else if(r==='venueform'){ const v=venue(); title='Venue details'; sub=v?v.name:''; app.innerHTML=scrVenueForm(); }
  else if(r==='brief'){ const v=venue(); title='Pitch brief'; sub=v?v.name:''; app.innerHTML=scrBrief(); }
  else if(r==='settings'){ title='Data & settings'; app.innerHTML=scrSettings(); }

  $('barTitle').childNodes[0].nodeValue = onHome?'Labosport Pitch Inspector':title;
  $('barSub').textContent = onHome?'':sub;
  $('barLogo').style.display = onHome?'block':'none';
  $('barTitle').style.display = onHome?'none':'flex';
  $('backBtn').style.display = stack.length>1?'flex':'none';
  $('tabbar').style.display = TOP.includes(r)?'flex':'none';
  document.querySelectorAll('.tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.tab===(TOP.includes(r)?r:null)));
  $('app').parentElement.scrollTop=0;
  bind();
}

/* ----------------------------- screens ----------------------------- */
function venueProgress(v){
  // Granular: every individual measurement counts, so the bar moves on each value entered
  // (not just when a test parameter gets its first reading).
  let done=0,total=0;
  v.pitches.forEach(p=>{ TESTS.forEach(t=>{ const td=p.tests&&p.tests[t.key]; total+=(t.n||0); if(td) done+=stats(td.values).done; }); });
  return total?Math.round(done/total*100):0;
}
function scrHome(){
  const cards=state.venues.map(v=>{
    const prog=venueProgress(v);   // bar reflects real progress for both brief & manual venues
    const state_=v.briefLoaded?'<span class="chip brief">Brief loaded ✓</span>':'<span class="chip ghost">Manual</span>';
    return `<div class="card"><div class="venue" data-open="${v.id}">
      <div class="vh"><div><div class="vn">${esc(v.name)}</div><div class="va">${esc(v.alias?('AKA '+v.alias):v.address)}</div></div>${state_}</div>
      <div class="pbar"><div class="pfill" style="width:${prog}%"></div></div>
      <div class="pmeta"><span>${v.pitches.length} pitch${v.pitches.length>1?'es':''} · ${venueProgress(v)}% tested</span><span>${esc(v.cluster||'')}</span></div></div></div>`;
  }).join('');
  return `<div class="note"><b>Data collection.</b> Everything you enter saves to this device automatically and works offline.</div>
    <h2 class="sec">Venues</h2>${cards}
    <button class="btn dash" id="uploadBrief">⤓ Upload pitch brief (PDF) → autofill</button>
    <button class="btn ghost" id="addVenue">+ Add venue manually</button>`;
}

function scrVenue(){
  const v=venue(), p=pitch();
  const wr=v.wr?`<div class="note wr"><b>World Rugby (confidential):</b> ${esc(v.wr)}</div>`:'';
  const chips=v.pitches.length>1?`<div class="pchips">${v.pitches.map((pp,i)=>`<div class="pchip ${i===CURP?'on':''}" data-pitch="${i}">${esc(pp.name)}</div>`).join('')}<div class="pchip" data-addpitch="1">+ pitch</div></div>`:'';
  const af=v.briefLoaded?' af':'';
  const head=`<div class="card">
    <div class="kv"><span class="k">Venue</span><span class="v${af}">${esc(v.name)}</span></div>
    ${v.alias?`<div class="kv"><span class="k">Also known as</span><span class="v${af}">${esc(v.alias)}</span></div>`:''}
    <div class="kv"><span class="k">Address</span><span class="v${af}">${esc(v.address)||'—'}</span></div>
    <div class="kv"><span class="k">Contact</span><span class="v${af}">${esc(v.contact)||'—'}</span></div>
    <div class="kv"><span class="k">Position</span><span class="v${af}">${esc(v.position)||'—'}</span></div>
    <div class="kv"><span class="k">Email / phone</span><span class="v${af}" style="font-size:12px">${v.email?`<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>`:'—'}<br>${v.phone?`<a href="tel:${esc((v.phone||'').replace(/[^\\d+]/g,''))}">📞 ${esc(v.phone)}</a>`:''}</span></div>
    <div class="kv"><span class="k">Grass type</span><span class="v${af}">${esc(v.grass)||'—'}</span></div>
    <div class="row" data-edit-venue="1" style="cursor:pointer"><div class="meta"><div class="d">Tap to edit venue details</div></div><span class="chev">›</span></div></div>
    ${v.briefLoaded?`<button class="btn ghost" data-go="brief">📄 View loaded brief</button>`:''}`;

  const ov=p.overall.level;
  const ovChip=ov?`<span class="chip ${['','low','mod','high','crit'][ov]}">${RLABEL[ov]} · ${ov}/4</span>`:'<span class="chip ghost">Not rated</span>';

  // Benchmark comparison — only shown for venues with more than one pitch.
  let benchBlock='';
  if(v.pitches.length>1){
    const bp=v.pitches.find(x=>x.bench&&x.bench.role==='bench');
    const role=(p.bench&&p.bench.role)||'';
    const opts=[['bench','★ Benchmark'],['worse','↓ Worse'],['sim','≈ Similar'],['better','↑ Better']];
    const seg=`<div class="seg bench" data-bench>${opts.map(o=>`<button data-v="${o[0]}" class="${role===o[0]?'on':''}">${o[1]}</button>`).join('')}</div>`;
    const isBench=role==='bench';
    const noteLbl=isBench?'Why this benchmark? (selection rationale)':'Notes / significant differences vs benchmark';
    const notePh=isBench?'e.g. Selected as the worst-case candidate because…':'e.g. Slightly firmer surface; more wear in the goalmouths…';
    const note=`<div class="field"><label id="benchNoteLbl">${noteLbl}</label><textarea id="benchNote" placeholder="${esc(notePh)}">${esc((p.bench&&p.bench.note)||'')}</textarea></div>`;
    let hint;
    if(isBench) hint='This pitch is the benchmark for the venue — rate the other pitches relative to it.';
    else if(bp) hint='Benchmark for this venue: <b>'+esc(bp.name)+'</b>. Rate this pitch against it.';
    else hint='No benchmark chosen yet — tap ★ Benchmark on the pitch you inspected in detail.';
    benchBlock=`<h2 class="sec">Benchmark comparison</h2>
    <div class="card"><div class="field"><label>This pitch vs. the venue benchmark</label>${seg}</div>${note}
      <div class="hint" style="padding-bottom:0">${hint}</div></div>`;
  }

  const auditRows=AUDIT.map(s=>{
    const fields=p.audit[s[0]].fields;
    const complete=s[4].every(([label])=>{ const x=fields[label]; return x!=null && String(x).trim()!==''; });   // every question answered
    return `<div class="row" data-go="audit:${s[0]}"><div class="ic">${'ABCDEFGH'.includes(s[0])?s[0]:'•'}</div>
      <div class="meta"><div class="t">${s[0]}. ${esc(s[1])}</div><div class="d">${esc(s[2])}</div></div>
      ${complete?'<span class="tick">✓</span>':(p.audit[s[0]].brief?'<span class="pill">brief</span>':'<span class="chev">›</span>')}</div>`;
  }).join('');

  const shownGroups=new Set();
  const testRows=TESTS.map(t=>{
    const g=GROUP_OF[t.key];
    if(g){   // collapse all members into a single combined row, rendered at the first member's slot
      if(shownGroups.has(g.key)) return '';
      shownGroups.add(g.key);
      let done=0,total=0; g.members.forEach(m=>{ done+=stats(p.tests[m].values).done; total+=TKEY[m].n; });
      const status=done?`<span class="pill">${done}/${total}</span>`:'<span class="chev">›</span>';
      return `<div class="row" data-go="grp:${g.key}"><div class="ic">⬡</div>
        <div class="meta"><div class="t">${esc(g.name)}</div>
        <div class="d">${g.n} shared location${g.n>1?'s':''} · ${g.members.length} readings each</div></div>${status}</div>`;
    }
    const st=stats(p.tests[t.key].values);
    const status=st.done?`<span class="pill">${st.done}/${t.n}</span>`:'<span class="chev">›</span>';
    return `<div class="row" data-go="test:${t.key}"><div class="ic">⬡</div>
      <div class="meta"><div class="t">${esc(t.name)} ${t.pri?'<span class="badge-pri">PRIORITY</span>':''}</div>
      <div class="d">${t.n} position${t.n>1?'s':''}${st.avg!=null?` · avg ${fmt(st.avg,t.unit)}`:''}</div></div>${status}</div>`;
  }).join('');

  return `${wr}${chips}${head}
    <h2 class="sec">1 · Overall assessment</h2>
    <div class="card"><div class="row" data-go="overall"><div class="ic">★</div><div class="meta"><div class="t">Overall risk rating</div><div class="d">Summary & headline comment</div></div>${ovChip}</div></div>
    ${benchBlock}
    <h2 class="sec">2 · Venue audit</h2>
    ${v.briefLoaded?'<div class="hint" style="color:var(--green-d)">✓ Brief loaded — each section shows the questionnaire text; complete/confirm on site.</div>':''}
    <div class="card">${auditRows}</div>
    <h2 class="sec">3 · On-site testing</h2>
    <div class="hint">Tap a test, then type each position reading. Averages & variance update live.</div>
    <div class="card">${testRows}</div>
    <h2 class="sec">4 · Results, risk & photos</h2>
    <div class="card">
      <div class="row" data-go="results"><div class="ic">▦</div><div class="meta"><div class="t">Results summary</div><div class="d">Averages & max variance by parameter</div></div><span class="chev">›</span></div>
      <div class="row" data-go="risk"><div class="ic">◈</div><div class="meta"><div class="t">Risk assessment</div><div class="d">10 parameters · Low → Critical</div></div><span class="chev">›</span></div>
      <div class="row" data-go="photos"><div class="ic">▣</div><div class="meta"><div class="t">Photos</div><div class="d">${p.photos.length} captured</div></div><span class="chev">›</span></div>
    </div>
    <h2 class="sec">5 · Report &amp; export</h2>
    ${v.pitches.length>1
      ? `<div class="hint">Combined report includes all ${v.pitches.length} pitches in sequence. The Word file matches the Field Report Template exactly.</div>
         <button class="btn primary" id="genWordAll">⤓ Word report — all ${v.pitches.length} pitches</button>
         <button class="btn primary" id="genPdfAll">⤓ PDF report — all pitches</button>`
      : `<div class="hint">Generates for <b>${esc(p.name)}</b>. The Word file matches the Field Report Template exactly.</div>
         <button class="btn primary" id="genWord">⤓ Word report (.docx)</button>
         <button class="btn primary" id="genPdf">⤓ PDF report</button>`}
    <button class="btn ghost" id="exportCsv">▦ Export this venue (CSV)</button>
    <button class="btn ghost" id="pubDrive">☁ Publish this venue to Drive folder</button>
    <button class="btn danger" id="delPitch">🗑 Delete ${v.pitches.length>1?'this pitch':'venue'}</button>`;
}

function scrAudit(code){
  const s=AUDIT.find(a=>a[0]===code); const p=pitch(); const a=p.audit[code];
  const briefNote=a.brief?`<div class="note af"><b>From brief — ${esc(s[3])}:</b> ${esc(a.brief)}</div>`:'';
  const fields=s[4].map(([label,type])=>{
    const val=a.fields[label]; const fc=(val&&String(val).trim())?' filled':'';
    if(type===YN){const v=val||''; return `<div class="field"><label>${esc(label)}</label><div class="seg" data-yn="${esc(label)}">
      ${['Yes','No','N/A'].map(o=>`<button data-v="${o}" class="${v===o?'on':''}">${o}</button>`).join('')}</div></div>`;}
    if(type===AREA) return `<div class="field${fc}"><label>${esc(label)}</label><textarea data-f="${esc(label)}">${esc(val||'')}</textarea></div>`;
    return `<div class="field${fc}"><label>${esc(label)}</label><input data-f="${esc(label)}" inputmode="text" value="${esc(val||'')}"></div>`;
  }).join('');
  const ai=AUDIT.findIndex(a=>a[0]===code), an=AUDIT[ai+1];
  return `${briefNote}<div class="hint">Appendix ${s[0]} · ${esc(s[2])} <span class="saved" id="savedFlag">saved ✓</span></div>
    <div class="card">${fields}</div>
    ${an?`<button class="btn primary" id="nextAudit">Next section: ${an[0]}. ${esc(an[1])} →</button>`:''}
    <button class="btn ghost" data-back="1">Done</button>`;
}

function scrTest(key){
  const t=TKEY[key]; const p=pitch(); const td=p.tests[key]; const st=stats(td.values);
  const grid=td.values.map((v,i)=>`<div class="posbox ${v!=null?'done':''}">
    <div class="pn">P${i+1}</div>
    <input data-pos="${i}" inputmode="decimal" enterkeyhint="${i<td.values.length-1?'next':'done'}" placeholder="–" value="${v!=null?v:''}">
    <div class="pu">${esc(t.unit)||'&nbsp;'}</div></div>`).join('');
  const noteLine=t.note?`<div class="hint">${esc(t.note)}</div>`:'';
  const idx=TESTS.findIndex(x=>x.key===key), nx=TESTS[idx+1];
  let obsBox='';
  if(t.obsPhotos){
    const ph=td.photos||{};
    const rows=td.values.map((v,i)=>{
      const list=(ph[i]||[]).map(x=>`<div class="obsphoto"><img src="${x.dataUrl||''}" alt=""><button class="del" data-delobs="${key}|${i}|${x.id}">✕</button></div>`).join('');
      return `<div class="obsrow"><div class="obshd"><b>P${i+1}</b>${v!=null?` · ${esc(shortNum(v))} mm`:' · no reading yet'}<button class="btn sm ghost" data-obsadd="${i}" style="float:right">＋ Photo</button></div>
        <div class="obsgrid">${list||'<span class="hint" style="padding:0">No photos yet</span>'}</div></div>`;
    }).join('');
    obsBox=`<h2 class="sec">Observation photos</h2><div class="card" style="padding:8px 12px">${rows}</div>`;
  }
  return `<div class="hint">${esc(t.name)} · ${t.n} position${t.n>1?'s':''}${t.pri?' · <b style="color:var(--crit)">priority</b>':''} <span class="saved" id="savedFlag">saved ✓</span></div>
    ${pitchSVG(key)}
    <div class="leg"><span><i class="dot" style="background:var(--green)"></i> recorded</span><span><i class="dot" style="background:#fff;border:1px solid var(--line)"></i> pending</span></div>
    <div class="card" style="padding:0">
      <div class="stat">
        <div class="s"><div class="l">Average</div><div class="n" id="tAvg">${st.avg!=null?fmt(st.avg,''):'—'}</div></div>
        <div class="s"><div class="l">Max var.</div><div class="n" id="tVar">${st.varPct!=null?st.varPct+'%':'—'}</div></div>
        <div class="s"><div class="l">Done</div><div class="n" id="tDone">${st.done}/${t.n}</div></div>
      </div>
      <div class="posgrid" id="posGrid">${grid}</div>
    </div>${noteLine}
    <div class="card" style="padding:0">
      <div class="field"><label>Method used to collect this data</label>
        <input id="testMethod" inputmode="text" placeholder="e.g. Clegg hammer 2.25 kg, 1 drop per position" value="${esc(td.method||'')}"></div>
      <div class="field"><label>Comments / observations</label>
        <textarea id="testComment" placeholder="e.g. lower readings in the droughted southern in-goal area…">${esc(td.comment)}</textarea></div></div>
    ${obsBox}
    ${nx?`<button class="btn primary" id="nextTest">Next test: ${esc(nx.name)} →</button>`:''}
    <button class="btn ghost" data-back="1">Done</button>`;
}

// combined entry for a group of metrics sharing the same positions (turf cover, weed, height)
function scrGroup(gkey){
  const g=GKEY[gkey]; const p=pitch();
  const method=g.members.map(k=>p.tests[k].method).find(x=>x&&x.trim())||'';
  const comment=g.members.map(k=>p.tests[k].comment).find(x=>x&&x.trim())||'';
  const statCells=g.members.map(k=>{ const st=stats(p.tests[k].values);
    return `<div class="s"><div class="l">${esc(metricShort(k))} avg</div><div class="n" id="gavg_${k}">${st.avg!=null?fmt(st.avg,''):'—'}</div></div>`;}).join('');
  const rows=Array.from({length:g.n},(_,i)=>{
    const cells=g.members.map(k=>{ const t=TKEY[k]; const v=p.tests[k].values[i];
      return `<label class="grpcell ${v!=null?'done':''}"><span class="gl">${esc(metricShort(k))}</span>
        <input data-gpos="${i}" data-gkey="${k}" inputmode="decimal" enterkeyhint="next" placeholder="–" value="${v!=null?v:''}"><span class="gu">${esc(t.unit)||'&nbsp;'}</span></label>`;}).join('');
    return `<div class="grprow"><div class="grppn">P${i+1}</div><div class="grpcells">${cells}</div></div>`;
  }).join('');
  return `<div class="hint">${esc(g.name)} · ${g.n} shared locations · record all three at each ⬡ <span class="saved" id="savedFlag">saved ✓</span></div>
    ${pitchSVGGroup(g)}
    <div class="leg"><span><i class="dot" style="background:var(--green)"></i> all 3 recorded</span><span><i class="dot" style="background:#bfe0cc"></i> partial</span><span><i class="dot" style="background:#fff;border:1px solid var(--line)"></i> pending</span></div>
    <div class="card" style="padding:0">
      <div class="stat">${statCells}</div>
      <div class="grpentry">${rows}</div>
    </div>
    <div class="card" style="padding:0">
      <div class="field"><label>Method used to collect this data</label>
        <input id="grpMethod" inputmode="text" placeholder="e.g. visual % estimate in 0.25 m² quadrat; sward height by ruler" value="${esc(method)}"></div>
      <div class="field"><label>Comments / observations</label>
        <textarea id="grpComment" placeholder="e.g. weed concentrated in southern in-goal; sward thinning near goalmouth…">${esc(comment)}</textarea></div></div>
    <button class="btn ghost" data-back="1">Done</button>`;
}

function scrOverall(){
  const p=pitch(); const lv=p.overall.level;
  return `<div class="card"><div class="field"><label>Overall risk rating</label>
    <div class="seg risk" id="ovSeg">${[1,2,3,4].map(l=>`<button data-l="${l}" class="${lv===l?'on':''}">${RLABEL[l]} ${l}</button>`).join('')}</div></div>
    <div class="field"><label>Headline comment <span class="saved" id="savedFlag">saved ✓</span></label>
      <textarea id="ovComment" style="min-height:150px" placeholder="Overall assessment narrative…">${esc(p.overall.comment)}</textarea></div></div>
    <button class="btn ghost" data-back="1">Done</button>`;
}

function scrRisk(){
  const p=pitch();
  const rows=RISK.map(([k,label])=>{const lv=p.risk[k]||0;
    return `<div class="field"><label>${esc(label)}</label><div class="seg risk" data-risk="${k}">
      ${[1,2,3,4].map(l=>`<button data-l="${l}" class="${lv===l?'on':''}">${['Low','Mod','High','Crit'][l-1]}</button>`).join('')}</div></div>`;}).join('');
  return `<div class="hint">Set a 1–4 level per parameter. <span class="saved" id="savedFlag">saved ✓</span></div>
    <div class="card">${rows}</div><button class="btn ghost" data-back="1">Done</button>`;
}

function scrResults(){
  const p=pitch();
  const rows=TESTS.map(t=>{const st=stats(p.tests[t.key].values);
    const dim=st.avg==null?'dim':'';
    return `<tr class="${t.pri?'pri':''}"><td>${esc(t.name)} ${t.pri?'<span class="badge-pri">PRI</span>':''}</td>
      <td class="num ${dim}">${st.avg!=null?fmt(st.avg,t.unit):'—'}</td>
      <td class="num ${dim}">${st.varPct!=null?st.varPct:'—'}</td></tr>`;}).join('');
  return `<div class="hint">Live from your on-site entries. Max variance = largest reading deviation from the average (%).</div>
    <div class="card" style="padding:6px 6px 2px"><table class="res"><thead><tr><th>Parameter</th><th class="num">Avg</th><th class="num">Var %</th></tr></thead><tbody>${rows}</tbody></table></div>
    <button class="btn ghost" data-back="1">Back</button>`;
}

function scrPhotos(){
  const p=pitch();
  const items=p.photos.map(ph=>`<div class="photo"><img src="${ph.dataUrl||''}" alt=""><button class="del" data-delphoto="${ph.id}">✕</button></div>`).join('');
  return `<div class="hint">Add photos with the camera or from your library. The first 6 fill the report's photo grid (Overview, Close up, Photo 3–6). <span class="saved" id="savedFlag">saved ✓</span></div>
    <div class="card" style="padding:0"><div class="photogrid">${items}<div class="photo-add" id="addPhoto">📷<span>Take photo</span></div></div>
      <div class="field"><label>Additional photos / notes &amp; comments (report)</label><textarea id="photoNotes" placeholder="Notes that appear under the photo grid…">${esc(p.photoNotes||'')}</textarea></div></div>
    <button class="btn ghost" id="addPhotoLib">🖼 Choose from library</button>
    <button class="btn ghost" data-back="1">Done</button>`;
}

function syncStatusText(){
  if(!window.GDrive) return 'Sync module not loaded';
  if(!GDrive.getClientId()) return 'Not set up — add your Client ID below';
  if(!GDrive.isConnected()) return 'Client ID saved — tap Connect';
  const ls=GDrive.lastSync(); return ls?('Connected · last synced '+timeAgo(ls)):'Connected';
}
function timeAgo(ms){ if(!ms)return 'never'; const s=Math.round((Date.now()-ms)/1000);
  if(s<60)return 'just now'; if(s<3600)return Math.round(s/60)+' min ago'; if(s<86400)return Math.round(s/3600)+' h ago'; return new Date(ms).toLocaleString(); }
function scrVenueForm(){
  const v=venue(); if(!v) return '<div class="hint">No venue.</div>';
  const F=[['name','Venue name','e.g. Ramblewood Soccer Complex','text'],
    ['alias','Also known as','optional','text'],
    ['cluster','Cluster','e.g. Charlotte','text'],
    ['address','Address','street, city, state ZIP','text'],
    ['contact','Grounds manager / contact','full name','text'],
    ['position','Position','e.g. Sports Field Manager','text'],
    ['email','Email','name@example.com','email'],
    ['phone','Phone','e.g. 980-123-4567','tel'],
    ['grass','Grass type','e.g. Bermuda','text']];
  const rows=F.map(([k,label,ph,type])=>`<div class="field"><label>${label}</label><input data-vf="${k}" type="${type}" ${type==='email'?'autocapitalize="off" spellcheck="false"':''} inputmode="${type==='tel'?'tel':(type==='email'?'email':'text')}" value="${esc(v[k]||'')}" placeholder="${esc(ph)}"></div>`).join('');
  return `<div class="hint">Fill in what you know — you can edit any time. <span class="saved" id="savedFlag">saved ✓</span></div>
    <div class="card">${rows}</div>
    <button class="btn primary" data-back="1">Done</button>`;
}
const BRIEF_ORDER=['Field usage','Pitch dimensions','Soil profile','Irrigation and Water management','Drainage & Waterlogging Performance','Surface Performance','Safety','Turf Management Skills','Resources','Additional aspects'];
function scrBrief(){
  const v=venue(); if(!v) return '';
  const hdr=`<div class="card">
    <div class="kv"><span class="k">Venue</span><span class="v">${esc(v.name)}</span></div>
    ${v.alias?`<div class="kv"><span class="k">Also known as</span><span class="v">${esc(v.alias)}</span></div>`:''}
    <div class="kv"><span class="k">Address</span><span class="v">${esc(v.address)||'—'}</span></div>
    <div class="kv"><span class="k">Contact</span><span class="v">${esc(v.contact)||'—'}${v.position?' · '+esc(v.position):''}</span></div>
    <div class="kv"><span class="k">Grass type</span><span class="v">${esc(v.grass)||'—'}</span></div></div>`;
  const wr=v.wr?`<div class="note wr"><b>World Rugby (confidential):</b> ${esc(v.wr)}</div>`:'';
  const vc=v.venueComment?`<div class="note af"><b>Comments from the venue:</b> ${esc(v.venueComment)}</div>`:'';
  const params=BRIEF_ORDER.filter(k=>v.params&&v.params[k]).map(k=>`<div class="brow"><div class="bk">${esc(k)}</div><div class="bv">${esc(v.params[k])}</div></div>`).join('');
  const imgs=(v.briefImages&&v.briefImages.length)
    ? `<h2 class="sec">Brief images / map</h2><div class="briefimgs">${v.briefImages.map((d,i)=>`<a href="${d}" target="_blank" rel="noopener"><img src="${d}" alt="Brief image ${i+1}"></a>`).join('')}</div><div class="hint">Tap an image to open it full-size.</div>`
    : '';
  return `<div class="hint">The inspection brief for this venue — reference it any time while testing.</div>
    ${hdr}${wr}${vc}
    ${params?`<h2 class="sec">Detailed risk assessment (from brief)</h2><div class="card">${params}</div>`:''}
    ${imgs}
    <button class="btn ghost" data-back="1">Done</button>`;
}
function scrSettings(){
  const connected=window.GDrive&&GDrive.isConnected();
  const cid=window.GDrive?GDrive.getClientId():'';
  const auto=window.GDrive?GDrive.autoSyncOn():true;
  const drive=`<h2 class="sec">Google Drive sync</h2>
    <div class="hint" id="syncStatus">${esc(syncStatusText())}</div>
    <div class="card">
      <div class="field"><label>Google OAuth Client ID</label>
        <input id="cidInput" value="${esc(cid)}" placeholder="xxxxx.apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><label>Two-way auto-sync</label>
        <div class="seg" id="autoSeg"><button data-v="1" class="${auto?'on':''}">On</button><button data-v="0" class="${auto?'':'on'}">Off</button></div></div>
    </div>
    ${connected
      ? `<button class="btn primary" id="syncNow">⟳ Sync now</button><button class="btn ghost" id="driveDisc">Disconnect Google Drive</button>`
      : `<button class="btn primary" id="driveConn">Connect Google Drive</button>`}
    <div class="hint">Creates a “Labosport Pitch Inspector” folder in your Drive and keeps <b>labosport_data.json</b> in sync. Setup steps are in the README. The Client ID is not secret.</div>`;
  // ---- team sync (Firebase) ----
  const fbOn=window.FB&&FB.isSignedIn(), fbHas=window.FB&&FB.hasConfig(), fbEmbed=window.FB&&FB.usingEmbedded();
  const fbStat= !window.FB?'Module not loaded' : (!fbHas?'Not set up — paste your Firebase config below' : (fbOn?('Team sync on · '+esc(FB.userEmail())):'Sign in to start syncing'));
  const configBox = fbEmbed
    ? ''
    : `<div class="card"><div class="field"><label>Firebase web config (paste from Firebase console)</label>
        <textarea id="fbConfig" placeholder='{ "apiKey": "…", "authDomain": "…", "projectId": "…", … }' autocapitalize="off" spellcheck="false" style="min-height:96px;font-size:12px">${window.FB?esc(FB.getConfigText()):''}</textarea></div></div>`;
  const signinBox = fbOn
    ? `<div class="hint">Signed in as <b>${esc(FB.userEmail())}</b></div><button class="btn ghost" id="fbSignout">Sign out of team sync</button>`
    : `<button class="btn primary" id="fbConnect">Sign in with Google</button>
       <div class="hint" style="text-align:center;margin:4px 0">— or use any email —</div>
       <div class="card">
         <div class="field"><label>Email</label><input id="fbEmail" type="email" inputmode="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@example.com"></div>
         <div class="field"><label>Password (set one on first use · min 6 characters)</label><input id="fbPass" type="password" placeholder="••••••"></div>
       </div>
       <button class="btn primary" id="fbEmailConnect">Sign in with email</button>`;
  const team=`<h2 class="sec">Team sync (Firebase) — live</h2>
    <div class="hint" id="fbStatus">${fbStat}</div>
    ${configBox}
    ${signinBox}
    <div class="hint">Everyone you authorise shares the same live venue data (measurements, audit, notes). Photos stay on each device — share those via “Publish to Drive”. Your email must be on the team allowlist (see README).</div>`;
  return `<h2 class="sec">Inspector</h2>
    <div class="card"><div class="field"><label>Your name (appears on exports) <span class="saved" id="savedFlag">saved ✓</span></label><input id="testerName" value="${esc(state.tester||'')}" placeholder="e.g. Dillon McCallum"></div></div>
    ${team}
    ${drive}
    <h2 class="sec">Backup & export</h2>
    <div class="card">
      <div class="row" id="expJson"><div class="ic">⤓</div><div class="meta"><div class="t">Export backup (JSON)</div><div class="d">All venues & data — keep it safe</div></div><span class="chev">›</span></div>
      <div class="row" id="impJson"><div class="ic">⤒</div><div class="meta"><div class="t">Import backup (JSON)</div><div class="d">Restore from a backup file</div></div><span class="chev">›</span></div>
      <div class="row" id="expCsvAll"><div class="ic">▦</div><div class="meta"><div class="t">Export all data (CSV)</div><div class="d">Open in Excel / Sheets</div></div><span class="chev">›</span></div>
      <div class="row" id="impCsv"><div class="ic">⤒</div><div class="meta"><div class="t">Import data (CSV)</div><div class="d">Restore lost readings & answers from an exported CSV — fills empty spots only</div></div><span class="chev">›</span></div>
    </div>
    <h2 class="sec">About</h2>
    <div class="card" style="padding:14px;font-size:13px;line-height:1.6;color:var(--ink)">
      <b>Labosport Pitch Inspector</b> — v1 (data collection).<br>
      Works offline once loaded; data is stored on this device only. Use <b>Export backup</b> regularly.<br><br>
      Coming next: Word + PDF reports that exactly match the Field Report Template.
    </div>
    <button class="btn danger" id="clearAll">Reset all data</button>`;
}

/* pitch diagram with draggable test positions */
const PW=360, PH=140, PPAD=14;
function defaultPositions(n){
  let pts;
  if(n<=3) pts=[[.5,.28],[.5,.5],[.5,.72]];
  else if(n===6) pts=[[.28,.3],[.28,.7],[.5,.3],[.5,.7],[.72,.3],[.72,.7]];
  else if(n===25){ pts=[]; const g=[.1,.3,.5,.7,.9];   // snake / boustrophedon numbering
    g.forEach((y,r)=>{ const xs=(r%2)?g.slice().reverse():g; xs.forEach(x=>pts.push([x,y])); }); }   // row1 L→R (1-5), row2 R→L (6 on right…10 on left)… ending P25 bottom-right
  else pts=[[.16,.3],[.16,.7],[.38,.3],[.38,.7],[.5,.3],[.5,.7],[.62,.3],[.62,.7],[.84,.3],[.84,.7],[.5,.12],[.5,.88]];
  return pts.slice(0,n).map(p=>p.slice());
}
function testPositions(p,key){ const t=TKEY[key]; const td=p.tests&&p.tests[key];
  if(td&&td.positions&&td.positions.length===t.n) return td.positions; return defaultPositions(t.n); }
function randomPositions(n){ const pts=[], minD=Math.max(0.08,0.5/Math.sqrt(n));
  for(let i=0;i<n;i++){ let best=null;
    for(let tries=0;tries<30;tries++){ const c=[0.05+Math.random()*0.9, 0.08+Math.random()*0.84];
      if(pts.every(p=>Math.hypot(p[0]-c[0],(p[1]-c[1])*0.4)>minD)){ best=c; break; } if(!best) best=c; }
    pts.push(best); }
  return pts; }
// static field markup (everything except the numbered dots) — shared by single-test and grouped views
function pitchFieldInner(){
  const ix=PPAD, iy=PPAD, iw=PW-2*PPAD, ih=PH-2*PPAD;
  const X=f=>(ix+f*iw).toFixed(1), Y=f=>(iy+f*ih).toFixed(1);
  const W='#ffffff', vT=Y(0), vB=Y(1);
  // in-goal end zones (outside the try lines)
  const inGoal=`<rect x="2" y="${iy}" width="${PPAD-2}" height="${ih}" fill="#2f8f4e"/>
    <rect x="${PW-PPAD}" y="${iy}" width="${PPAD-2}" height="${ih}" fill="#2f8f4e"/>
    <line x1="2" y1="${iy}" x2="2" y2="${iy+ih}" stroke="${W}" stroke-width="1.2"/>
    <line x1="${PW-2}" y1="${iy}" x2="${PW-2}" y2="${iy+ih}" stroke="${W}" stroke-width="1.2"/>`;
  // goal posts on each try line (top-down H)
  const posts=[X(0),X(1)].map(gx=>`<line x1="${gx}" y1="${Y(.40)}" x2="${gx}" y2="${Y(.60)}" stroke="${W}" stroke-width="2"/>
    <line x1="${gx}" y1="${Y(.40)}" x2="${(+gx)+(gx==X(0)?-5:5)}" y2="${Y(.40)}" stroke="${W}" stroke-width="2"/>
    <line x1="${gx}" y1="${Y(.60)}" x2="${(+gx)+(gx==X(0)?-5:5)}" y2="${Y(.60)}" stroke="${W}" stroke-width="2"/>`).join('');
  // vertical field lines: try lines + 22m (solid), 10m (dashed), halfway (solid)
  const vline=(f,dash)=>`<line x1="${X(f)}" y1="${vT}" x2="${X(f)}" y2="${vB}" stroke="${W}" stroke-width="${dash?1.2:1.6}" ${dash?'stroke-dasharray="4 4"':''}/>`;
  const verticals=[vline(0),vline(.22),vline(.40,1),vline(.5),vline(.60,1),vline(.78),vline(1)].join('');
  // dashed 5 m and 15 m lines running the length of the pitch
  const hline=f=>`<line x1="${X(.02)}" y1="${Y(f)}" x2="${X(.98)}" y2="${Y(f)}" stroke="${W}" stroke-width="1" stroke-dasharray="5 6" opacity=".85"/>`;
  const horizontals=[hline(.07),hline(.21),hline(.79),hline(.93)].join('');
  return `<rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="#36a058"/>
    ${inGoal}
    <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" fill="none" stroke="${W}" stroke-width="1.8"/>
    ${verticals}${horizontals}${posts}`;
}
function pitchSVG(key){
  const p=pitch(), pos=testPositions(p,key), vals=p.tests[key].values;
  const dots=pos.map((pp,k)=>{const x=PPAD+pp[0]*(PW-2*PPAD),y=PPAD+pp[1]*(PH-2*PPAD);const done=vals[k]!=null;
    const lbl=done?shortNum(vals[k]):String(k+1);
    return `<g class="dot" data-i="${k}"><circle cx="${x}" cy="${y}" r="11" fill="${done?'#1f7a4d':'#fff'}" stroke="${done?'#155c39':'#c2cad2'}" stroke-width="1.5"/><text x="${x}" y="${y+3.5}" font-size="${dotFontSVG(lbl)}" font-weight="700" text-anchor="middle" fill="${done?'#fff':'#6b7785'}">${esc(lbl)}</text></g>`;}).join('');
  return `<div class="pitchwrap"><svg id="pitchSvg" viewBox="0 0 ${PW} ${PH}" style="width:100%;height:auto;background:#23823f;border-radius:12px;border:1px solid #1c6e34">
    ${pitchFieldInner()}${dots}</svg></div>
    <div class="draghint">Drag any numbered dot to the spot you actually tested</div>
    <div style="text-align:center;margin:-2px 0 8px"><button class="btn sm ghost" id="randDots">🎲 Randomize</button> <button class="btn sm ghost" id="resetDots">↺ Reset to default</button></div>`;
}

/* ---- grouped tests: shared positions across all members ---- */
function groupPositions(p,g){
  for(const k of g.members){ const td=p.tests&&p.tests[k]; if(td&&td.positions&&td.positions.length===g.n) return td.positions; }
  return defaultPositions(g.n);
}
function setGroupPositions(p,g,pos){ g.members.forEach(k=>{ if(p.tests[k]) p.tests[k].positions = pos ? pos.map(a=>a.slice()) : null; }); }
function groupDotStyle(p,g,k){ const cnt=g.members.filter(m=>p.tests[m].values[k]!=null).length; const full=cnt===g.members.length, part=cnt>0&&!full;
  return {fill:full?'#1f7a4d':(part?'#bfe0cc':'#fff'), stroke:full?'#155c39':'#c2cad2', text:full?'#fff':'#6b7785'}; }
function pitchSVGGroup(g){
  const p=pitch(), pos=groupPositions(p,g);
  const dots=pos.map((pp,k)=>{ const x=PPAD+pp[0]*(PW-2*PPAD), y=PPAD+pp[1]*(PH-2*PPAD); const s=groupDotStyle(p,g,k);
    return `<g class="dot" data-i="${k}"><circle cx="${x}" cy="${y}" r="11" fill="${s.fill}" stroke="${s.stroke}" stroke-width="1.5"/><text x="${x}" y="${y+3.5}" font-size="9" font-weight="700" text-anchor="middle" fill="${s.text}">${k+1}</text></g>`;}).join('');
  return `<div class="pitchwrap"><svg id="pitchSvg" viewBox="0 0 ${PW} ${PH}" style="width:100%;height:auto;background:#23823f;border-radius:12px;border:1px solid #1c6e34">
    ${pitchFieldInner()}${dots}</svg></div>
    <div class="draghint">Drag a numbered dot to the spot you tested — all three readings share these locations</div>
    <div style="text-align:center;margin:-2px 0 8px"><button class="btn sm ghost" id="grpRand">🎲 Randomize</button> <button class="btn sm ghost" id="grpReset">↺ Reset to default</button></div>`;
}
function bindPitchDrag(){
  const svg=$('pitchSvg'); if(!svg) return;
  const key=cur().split(':')[1], t=TKEY[key]; if(!t) return;   // group screens use bindGroupPitchDrag instead
  let dragging=null;
  function frac(e){ const r=svg.getBoundingClientRect(); const ux=(e.clientX-r.left)/r.width*PW, uy=(e.clientY-r.top)/r.height*PH;
    let fx=(ux-PPAD)/(PW-2*PPAD), fy=(uy-PPAD)/(PH-2*PPAD); return [Math.max(0,Math.min(1,fx)),Math.max(0,Math.min(1,fy))]; }
  function ensure(){ const td=pitch().tests[key]; if(!td.positions||td.positions.length!==t.n) td.positions=defaultPositions(t.n); return td.positions; }
  svg.querySelectorAll('.dot').forEach(g=>g.addEventListener('pointerdown',ev=>{ ev.preventDefault(); dragging=+g.dataset.i; ensure(); try{svg.setPointerCapture(ev.pointerId);}catch(e){} }));
  svg.addEventListener('pointermove',ev=>{ if(dragging==null)return; const pos=ensure(); pos[dragging]=frac(ev);
    const x=PPAD+pos[dragging][0]*(PW-2*PPAD), y=PPAD+pos[dragging][1]*(PH-2*PPAD), g=svg.querySelector('.dot[data-i="'+dragging+'"]');
    g.querySelector('circle').setAttribute('cx',x); g.querySelector('circle').setAttribute('cy',y);
    const tx=g.querySelector('text'); tx.setAttribute('x',x); tx.setAttribute('y',y+3.5); });
  function end(){ if(dragging!=null){ dragging=null; save(true); } }
  svg.addEventListener('pointerup',end); svg.addEventListener('pointercancel',end);
}
function bindGroupPitchDrag(g){
  const svg=$('pitchSvg'); if(!svg) return; let dragging=null;
  function frac(e){ const r=svg.getBoundingClientRect(); const ux=(e.clientX-r.left)/r.width*PW, uy=(e.clientY-r.top)/r.height*PH;
    let fx=(ux-PPAD)/(PW-2*PPAD), fy=(uy-PPAD)/(PH-2*PPAD); return [Math.max(0,Math.min(1,fx)),Math.max(0,Math.min(1,fy))]; }
  function ensure(){ const p=pitch(); let pos=groupPositions(p,g); if(!pos||pos.length!==g.n) pos=defaultPositions(g.n); pos=pos.map(a=>a.slice()); setGroupPositions(p,g,pos); return groupPositions(p,g); }
  svg.querySelectorAll('.dot').forEach(d=>d.addEventListener('pointerdown',ev=>{ ev.preventDefault(); dragging=+d.dataset.i; ensure(); try{svg.setPointerCapture(ev.pointerId);}catch(e){} }));
  svg.addEventListener('pointermove',ev=>{ if(dragging==null)return; const pos=ensure(); pos[dragging]=frac(ev); setGroupPositions(pitch(),g,pos);
    const x=PPAD+pos[dragging][0]*(PW-2*PPAD), y=PPAD+pos[dragging][1]*(PH-2*PPAD), d=svg.querySelector('.dot[data-i="'+dragging+'"]');
    d.querySelector('circle').setAttribute('cx',x); d.querySelector('circle').setAttribute('cy',y);
    const tx=d.querySelector('text'); tx.setAttribute('x',x); tx.setAttribute('y',y+3.5); });
  function end(){ if(dragging!=null){ dragging=null; save(true); } }
  svg.addEventListener('pointerup',end); svg.addEventListener('pointercancel',end);
}
function bindGroupEntry(g){
  const app=$('app');
  app.querySelectorAll('[data-gpos]').forEach(inp=>{
    inp.oninput=()=>{
      const i=+inp.dataset.gpos, k=inp.dataset.gkey, raw=inp.value.trim();
      const val=raw===''?null:parseFloat(raw.replace(',','.')); pitch().tests[k].values[i]=(val==null||isNaN(val))?null:val;
      const stored=pitch().tests[k].values[i];
      inp.closest('.grpcell').classList.toggle('done',stored!=null);
      const ae=$('gavg_'+k); if(ae){ const st=stats(pitch().tests[k].values); ae.textContent=st.avg!=null?fmt(st.avg,''):'—'; }
      const d=document.querySelector('#pitchSvg .dot[data-i="'+i+'"]');   // recolour the shared dot by completeness
      if(d){ const s=groupDotStyle(pitch(),g,i); d.querySelector('circle').setAttribute('fill',s.fill); d.querySelector('circle').setAttribute('stroke',s.stroke); d.querySelector('text').setAttribute('fill',s.text); }
      save(true);
    };
    inp.onkeydown=ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); const list=[...app.querySelectorAll('[data-gpos]')]; const nx=list[list.indexOf(inp)+1]; if(nx){nx.focus(); if(nx.select)nx.select();} else inp.blur(); } };
  });
  if($('grpMethod'))$('grpMethod').oninput=()=>{ const v=$('grpMethod').value; g.members.forEach(k=>pitch().tests[k].method=v); save(true); };
  if($('grpComment'))$('grpComment').oninput=()=>{ const v=$('grpComment').value; g.members.forEach(k=>pitch().tests[k].comment=v); save(true); };
  if($('grpRand'))$('grpRand').onclick=()=>{ setGroupPositions(pitch(),g,randomPositions(g.n)); save(true); render(); toast('Locations randomized'); };
  if($('grpReset'))$('grpReset').onclick=()=>{ setGroupPositions(pitch(),g,null); save(true); render(); toast('Locations reset to default'); };
  bindGroupPitchDrag(g);
}

/* ----------------------------- event binding (per render) ----------------------------- */
function bind(){
  const app=$('app');
  app.querySelectorAll('[data-open]').forEach(e=>e.onclick=()=>{CUR=e.dataset.open;CURP=0;go('venue',true);});
  app.querySelectorAll('[data-go]').forEach(e=>e.onclick=()=>go(e.dataset.go,true));
  app.querySelectorAll('[data-back]').forEach(e=>e.onclick=back);
  app.querySelectorAll('[data-pitch]').forEach(e=>e.onclick=()=>{CURP=+e.dataset.pitch;render();});
  app.querySelectorAll('[data-addpitch]').forEach(e=>e.onclick=addPitch);

  if($('uploadBrief'))$('uploadBrief').onclick=()=>$('pdfInput').click();
  if($('addVenue'))$('addVenue').onclick=addVenueManual;
  app.querySelectorAll('[data-edit-venue]').forEach(e=>e.onclick=editVenue);
  app.querySelectorAll('[data-vf]').forEach(inp=>inp.oninput=()=>{ const v=venue(); if(v){ v[inp.dataset.vf]=inp.value; save(true); } });

  // audit fields
  if($('nextAudit'))$('nextAudit').onclick=()=>{ const code=cur().split(':')[1]; const i=AUDIT.findIndex(a=>a[0]===code); const nx=AUDIT[i+1]; if(nx)goReplace('audit:'+nx[0]); };
  app.querySelectorAll('[data-f]').forEach(inp=>inp.oninput=()=>{const code=cur().split(':')[1];pitch().audit[code].fields[inp.dataset.f]=inp.value;save(true);});
  app.querySelectorAll('[data-yn]').forEach(seg=>seg.querySelectorAll('button').forEach(b=>b.onclick=()=>{const code=cur().split(':')[1];pitch().audit[code].fields[seg.dataset.yn]=b.dataset.v;seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));save(true);}));

  // test entry
  app.querySelectorAll('[data-pos]').forEach(inp=>{
    inp.oninput=()=>{
      const key=cur().split(':')[1],i=+inp.dataset.pos; const raw=inp.value.trim();
      const val=raw===''?null:parseFloat(raw.replace(',','.')); pitch().tests[key].values[i]=(val==null||isNaN(val))?null:val;
      const stored=pitch().tests[key].values[i];
      inp.closest('.posbox').classList.toggle('done',stored!=null);
      const g=document.querySelector('#pitchSvg .dot[data-i="'+i+'"]');   // live-update the map dot to show the value
      if(g){ const done=stored!=null, lbl=done?shortNum(stored):String(i+1), tx=g.querySelector('text');
        g.querySelector('circle').setAttribute('fill',done?'#1f7a4d':'#fff'); g.querySelector('circle').setAttribute('stroke',done?'#155c39':'#c2cad2');
        tx.textContent=lbl; tx.setAttribute('fill',done?'#fff':'#6b7785'); tx.setAttribute('font-size',dotFontSVG(lbl)); }
      const st=stats(pitch().tests[key].values);
      $('tAvg').textContent=st.avg!=null?fmt(st.avg,''):'—'; $('tVar').textContent=st.varPct!=null?st.varPct+'%':'—'; $('tDone').textContent=st.done+'/'+TKEY[key].n;
      save(true);
    };
    // Enter / keyboard "next" key → jump to the next position box (works on desktop + Android)
    inp.onkeydown=ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); posNavGo(1); } };
  });
  bindPitchDrag();
  if(cur().startsWith('grp:')){ const g=GKEY[cur().split(':')[1]]; if(g) bindGroupEntry(g); }   // combined turf/weed/height entry
  if($('randDots'))$('randDots').onclick=()=>{ const key=cur().split(':')[1]; pitch().tests[key].positions=randomPositions(TKEY[key].n); save(true); render(); toast('Positions randomized'); };
  if($('resetDots'))$('resetDots').onclick=()=>{ const key=cur().split(':')[1]; pitch().tests[key].positions=null; save(true); render(); toast('Positions reset to default'); };
  if($('nextTest'))$('nextTest').onclick=()=>{ const key=cur().split(':')[1]; const i=TESTS.findIndex(x=>x.key===key); const nx=TESTS[i+1]; if(nx)goReplace('test:'+nx.key); };
  if($('testMethod'))$('testMethod').oninput=()=>{pitch().tests[cur().split(':')[1]].method=$('testMethod').value;save(true);};
  if($('testComment'))$('testComment').oninput=()=>{pitch().tests[cur().split(':')[1]].comment=$('testComment').value;save(true);};
  // observation photos (per position)
  app.querySelectorAll('[data-obsadd]').forEach(b=>b.onclick=()=>{ obsTarget={key:cur().split(':')[1],pos:+b.dataset.obsadd}; $('obsPhotoInput').click(); });
  app.querySelectorAll('[data-delobs]').forEach(b=>b.onclick=()=>{ const [k,pos,id]=b.dataset.delobs.split('|'); const td=pitch().tests[k]; if(td.photos&&td.photos[pos]){ td.photos[pos]=td.photos[pos].filter(x=>x.id!==id); if(!td.photos[pos].length) delete td.photos[pos]; } save(); render(); });

  // overall
  if($('ovSeg'))$('ovSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{pitch().overall.level=+b.dataset.l;$('ovSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));save(true);});
  if($('ovComment'))$('ovComment').oninput=()=>{pitch().overall.comment=$('ovComment').value;save(true);};

  // risk
  app.querySelectorAll('[data-risk]').forEach(seg=>seg.querySelectorAll('button').forEach(b=>b.onclick=()=>{pitch().risk[seg.dataset.risk]=+b.dataset.l;seg.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));save(true);}));

  // photos
  if($('addPhoto'))$('addPhoto').onclick=()=>$('photoInput').click();
  if($('addPhotoLib'))$('addPhotoLib').onclick=()=>$('photoLibInput').click();
  if($('photoNotes'))$('photoNotes').oninput=()=>{pitch().photoNotes=$('photoNotes').value;save(true);};
  app.querySelectorAll('[data-delphoto]').forEach(e=>e.onclick=()=>{const id=e.dataset.delphoto;const p=pitch();p.photos=p.photos.filter(x=>x.id!==id);save();render();});

  // report + export buttons
  if($('genWord'))$('genWord').onclick=()=>generateWord(venue(),[pitch()]);
  if($('genWordAll'))$('genWordAll').onclick=()=>generateWord(venue(),venue().pitches);
  if($('genPdf'))$('genPdf').onclick=()=>generatePDF(venue(),[pitch()]);
  if($('genPdfAll'))$('genPdfAll').onclick=()=>generatePDF(venue(),venue().pitches);
  if($('exportCsv'))$('exportCsv').onclick=()=>exportCSV(venue());
  if($('pubDrive'))$('pubDrive').onclick=()=>publishVenueDrive(venue());
  if($('delPitch'))$('delPitch').onclick=deletePitchOrVenue;

  // benchmark (per-pitch, in the venue tab — only one benchmark per venue)
  if($('benchNote'))$('benchNote').oninput=()=>{ const p=pitch(); p.bench=p.bench||{role:'',note:''}; p.bench.note=$('benchNote').value; save(true); };
  const benchSeg=app.querySelector('[data-bench]');
  if(benchSeg)benchSeg.querySelectorAll('button').forEach(b=>b.onclick=()=>{
    const p=pitch(); p.bench=p.bench||{role:'',note:''}; const v=b.dataset.v;
    if(p.bench.role===v){ p.bench.role=''; }                 // tap the active option again to clear it
    else { p.bench.role=v; if(v==='bench') venue().pitches.forEach(x=>{ if(x!==p&&x.bench&&x.bench.role==='bench') x.bench.role=''; }); }
    save(); render();   // note label + hint depend on role; re-render also reflects the single-benchmark rule
  });

  // settings
  if($('testerName'))$('testerName').oninput=()=>{state.tester=$('testerName').value;save(true);};
  // google drive sync
  if($('cidInput'))$('cidInput').onchange=()=>{ GDrive.setClientId($('cidInput').value); render(); };
  if($('autoSeg'))$('autoSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{ GDrive.setAutoSync(b.dataset.v==='1'); $('autoSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); });
  if($('fbConfig'))$('fbConfig').onchange=()=>{ if(window.FB){ if(FB.setConfig($('fbConfig').value)) toast('Firebase config saved'); } };
  if($('fbConnect'))$('fbConnect').onclick=()=>{ if(window.FB){ if($('fbConfig')) FB.setConfig($('fbConfig').value); FB.connect(); } };
  if($('fbEmailConnect'))$('fbEmailConnect').onclick=()=>{ if(window.FB){ if($('fbConfig')) FB.setConfig($('fbConfig').value); FB.connectEmail($('fbEmail')?$('fbEmail').value:'', $('fbPass')?$('fbPass').value:''); } };
  if($('fbSignout'))$('fbSignout').onclick=()=>{ if(window.FB){ FB.disconnect(); render(); } };
  if($('driveConn'))$('driveConn').onclick=()=>{ GDrive.setClientId($('cidInput').value); GDrive.connect().then(()=>render()); };
  if($('driveDisc'))$('driveDisc').onclick=()=>{ GDrive.disconnect(); render(); };
  if($('syncNow'))$('syncNow').onclick=()=>{ GDrive.syncNow().then(()=>render()).catch(()=>{}); };
  if($('expJson'))$('expJson').onclick=exportJSON;
  if($('impJson'))$('impJson').onclick=()=>$('importInput').click();
  if($('expCsvAll'))$('expCsvAll').onclick=()=>exportCSV(null);
  if($('impCsv'))$('impCsv').onclick=()=>$('csvImportInput').click();
  if($('clearAll'))$('clearAll').onclick=()=>{if(confirm('Reset ALL data and reload the two seed venues? Export a backup first if unsure.')){state=freshState();save();go('home');}};
}

/* ----------------------------- actions ----------------------------- */
function addPitch(){ const name=prompt('Name for the new pitch:','Pitch '+(venue().pitches.length+1)); if(!name)return; venue().pitches.push(newPitch(name.trim())); CURP=venue().pitches.length-1; save(); render(); }
function addVenueManual(){ const v={id:uid(),name:'New venue',alias:'',address:'',contact:'',position:'',email:'',phone:'',grass:'',cluster:'Charlotte',wr:'',venueComment:'',params:{},briefLoaded:false,pitches:[newPitch('Pitch 1')]}; state.venues.push(v); CUR=v.id; CURP=0; save(); go('venueform',true); }
function editVenue(){ go('venueform',true); }
function deletePitchOrVenue(){ const v=venue();
  if(v.pitches.length>1){ if(confirm('Delete pitch “'+v.pitches[CURP].name+'” and its data?')){v.pitches.splice(CURP,1);CURP=0;save();render();toast('Pitch deleted');} }
  else { if(confirm('Delete venue “'+v.name+'” and all its data? This cannot be undone.')){state.venues=state.venues.filter(x=>x.id!==v.id);save();go('home');toast('Venue deleted');} } }

/* brief upload -> parse -> autofill */
const pdfjsLib = window['pdfjsLib'] || window['pdfjs-dist/build/pdf'];
function setupPdf(){ try{ if(window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }catch(e){} }
/* pull large embedded images (e.g. the venue/pitch map) out of a brief PDF */
async function extractBriefImages(pdfDoc){
  const PDFJS=window.pdfjsLib; if(!PDFJS||!PDFJS.OPS) return [];
  const out=[], seen=new Set();
  const IMG_OPS=[PDFJS.OPS.paintImageXObject, PDFJS.OPS.paintJpegXObject].filter(x=>x!=null);
  for(let i=1;i<=pdfDoc.numPages;i++){
    let page,ops; try{ page=await pdfDoc.getPage(i); ops=await page.getOperatorList(); }catch(e){ continue; }
    const names=[];
    for(let j=0;j<ops.fnArray.length;j++){ if(IMG_OPS.indexOf(ops.fnArray[j])>=0){ const a=ops.argsArray[j]; if(a&&typeof a[0]==='string') names.push(a[0]); } }
    for(const name of names){
      if(seen.has(name))continue; seen.add(name);
      let img=null;
      try{ img = page.objs.has(name) ? page.objs.get(name)
        : await new Promise(r=>{ let done=false; try{ page.objs.get(name,v=>{done=true;r(v);}); }catch(e){ r(null);} setTimeout(()=>{ if(!done)r(null); },2000); }); }catch(e){ img=null; }
      if(!img||!img.width||!img.height||img.width<300||img.height<300||!img.data) continue;
      try{
        const w=img.width,h=img.height,N=w*h, c=document.createElement('canvas'); c.width=w;c.height=h;
        const ctx=c.getContext('2d'), id=ctx.createImageData(w,h), dst=id.data, src=img.data;
        if(src.length===N*4){ dst.set(src); }
        else if(src.length===N*3){ for(let k=0,s=0,d=0;k<N;k++){ dst[d++]=src[s++];dst[d++]=src[s++];dst[d++]=src[s++];dst[d++]=255; } }
        else if(src.length===N){ for(let k=0,d=0;k<N;k++){ const g=src[k]; dst[d++]=g;dst[d++]=g;dst[d++]=g;dst[d++]=255; } }
        else continue;
        ctx.putImageData(id,0,0);
        let cw=w,ch=h; const max=900;
        if(cw>max){ ch=Math.round(ch*max/cw); cw=max; const c2=document.createElement('canvas'); c2.width=cw;c2.height=ch; c2.getContext('2d').drawImage(c,0,0,cw,ch); out.push(c2.toDataURL('image/jpeg',0.65)); }
        else out.push(c.toDataURL('image/jpeg',0.65));
      }catch(e){}
    }
  }
  return out;
}
async function handleBrief(file){
  if(!window.pdfjsLib){ toast('⚠ PDF engine not loaded — connect to the internet once, then retry'); return; }
  toast('<span class="spin"></span> Reading brief…');
  try{
    const buf=await file.arrayBuffer();
    const doc=await window.pdfjsLib.getDocument({data:new Uint8Array(buf)}).promise;
    const pages=[];
    for(let i=1;i<=doc.numPages;i++){ const tc=await (await doc.getPage(i)).getTextContent();
      pages.push(tc.items.filter(it=>it.str).map(it=>({x:it.transform[4],y:it.transform[5],str:it.str}))); }
    const pv=parseBrief(pages);
    if(!pv.name){ toast('⚠ Could not read this brief — is it a Labosport brief PDF?'); return; }
    // update existing venue by name, else add
    let v=state.venues.find(x=>x.name.toLowerCase().trim()===pv.name.toLowerCase().trim());
    if(v){ Object.assign(v,{address:pv.address||v.address,contact:pv.contact||v.contact,position:pv.position||v.position,
        email:pv.email||v.email,phone:pv.phone||v.phone,grass:pv.grass||v.grass,wr:pv.wr||v.wr,
        venueComment:pv.venueComment||v.venueComment,params:Object.keys(pv.params).length?pv.params:v.params,briefLoaded:true});
      v.pitches.forEach(p=>AUDIT.forEach(s=>{const t=v.params[s[3]]||''; if(t&&!p.audit[s[0]].brief)p.audit[s[0]].brief=t;}));
      extractAuditFields(v);
      toast('Updated “'+v.name+'” from brief ✓');
    } else { v=venueFromParsed(pv); state.venues.push(v); toast('Added “'+v.name+'” from brief ✓'); }
    try{ const imgs=await extractBriefImages(doc); if(imgs.length) v.briefImages=imgs; }catch(e){ console.warn('brief image extract failed',e); }
    save(); CUR=v.id; CURP=0; go('venue',true);
  }catch(e){ console.error(e); toast('⚠ Failed to read PDF: '+e.message); }
}

/* photo capture with downscale — pushes a {id,dataUrl,w,h} into the given target array (default = pitch photos).
   Decodes via createImageBitmap first (handles iPhone HEIC/HEIF library photos and applies EXIF orientation),
   then falls back to FileReader+Image for older browsers. Returns true only if a photo was actually stored. */
function isHeic(file){ return /hei[cf]/i.test(file&&file.type||'') || /\.(heic|heif)$/i.test(file&&file.name||''); }
function blobToImage(blob){
  return new Promise((res,rej)=>{ const r=new FileReader();
    r.onload=()=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>rej(new Error('decode')); im.src=r.result; };
    r.onerror=()=>rej(new Error('read')); r.readAsDataURL(blob); });
}
async function decodeToBitmap(file){
  // Preferred: createImageBitmap can decode HEIC/HEIF on modern iOS Safari and is faster.
  try{ const bmp=await createImageBitmap(file,{imageOrientation:'from-image'}); if(bmp&&bmp.width) return bmp; }catch(e){}
  try{ const bmp=await createImageBitmap(file); if(bmp&&bmp.width) return bmp; }catch(e){}
  // HEIC/HEIF fallback for desktop browsers (Chrome/Firefox/Edge) that can't decode it
  // natively — convert to JPEG with heic2any, then decode the result.
  if(window.heic2any && isHeic(file)){
    try{
      const out=await window.heic2any({blob:file, toType:'image/jpeg', quality:0.85});
      const blob=Array.isArray(out)?out[0]:out;
      try{ const bmp=await createImageBitmap(blob); if(bmp&&bmp.width) return bmp; }catch(e){}
      try{ const im=await blobToImage(blob); if(im&&im.width) return im; }catch(e){}
    }catch(e){ console.warn('heic2any decode failed',e); }
  }
  // Fallback: FileReader → Image (JPEG/PNG everywhere; cannot decode HEIC).
  try{ return await blobToImage(file); }catch(e){ return null; }
}
async function addPhotoFile(file, target){
  const src=await decodeToBitmap(file);
  if(!src) return false;
  const max=1000; let w=src.width||src.naturalWidth, h=src.height||src.naturalHeight;
  if(!w||!h){ if(src.close)try{src.close();}catch(e){} return false; }
  if(w>h&&w>max){h=h*max/w;w=max;} else if(h>max){w=w*max/h;h=max;}
  const c=document.createElement('canvas'); c.width=Math.round(w); c.height=Math.round(h);
  c.getContext('2d').drawImage(src,0,0,c.width,c.height);
  if(src.close)try{src.close();}catch(e){}
  const photo={id:uid(),dataUrl:c.toDataURL('image/jpeg',0.6),w:c.width,h:c.height};
  (target||pitch().photos).push(photo);
  if(mediaOK){ try{ await mediaSet(photo.id,photo.dataUrl); mediaSaved.add(photo.id); }catch(e){} }   // durable in IndexedDB before we report success
  return true;
}
function pickImageFiles(fileList){
  // Accept by MIME type, or by extension when the type is blank (common for multi-select from the library).
  return Array.from(fileList||[]).filter(f=>f&&(/^image\//.test(f.type||'')||/\.(jpe?g|png|heic|heif|webp|gif|tiff?)$/i.test(f.name||'')));
}
async function handlePhotos(fileList){
  const files=pickImageFiles(fileList); if(!files.length){ toast('⚠ No image files selected'); return; }
  toast('<span class="spin"></span> Adding photo'+(files.length>1?'s':'')+'…');
  let ok=0; for(const f of files){ try{ if(await addPhotoFile(f)) ok++; }catch(e){} }
  try{ save(); render(); }catch(e){ render(); toast('⚠ Storage full — remove some photos or export a backup'); return; }
  if(ok===files.length) toast('Added '+ok+' photo'+(ok>1?'s':'')+' ✓');
  else if(ok>0) toast('Added '+ok+' of '+files.length+' — '+(files.length-ok)+" couldn't be read");
  else toast("⚠ Couldn't read "+(files.length>1?'those photos':'that photo')+" — try Settings ▸ Camera ▸ Formats ▸ Most Compatible");
}
let obsTarget=null;   // {key,pos} for the test-observation photo currently being added
async function handleObsPhotos(fileList){
  const files=pickImageFiles(fileList); if(!files.length||!obsTarget){ if(!files.length)toast('⚠ No image files selected'); return; }
  const {key,pos}=obsTarget; const td=pitch().tests[key]; if(!td.photos)td.photos={}; if(!td.photos[pos])td.photos[pos]=[];
  toast('<span class="spin"></span> Adding photo'+(files.length>1?'s':'')+'…');
  let ok=0; for(const f of files){ try{ if(await addPhotoFile(f, td.photos[pos])) ok++; }catch(e){} }
  obsTarget=null;
  try{ save(); render(); }catch(e){ render(); toast('⚠ Storage full — remove some photos or export a backup'); return; }
  if(ok) toast('Photo'+(ok>1?'s':'')+' added to P'+(pos+1)+' ✓');
  else toast("⚠ Couldn't read that photo — try Settings ▸ Camera ▸ Formats ▸ Most Compatible");
}

/* ----------------------------- exports ----------------------------- */
function dl(name,content,type){ const blob=new Blob([content],{type:type||'text/plain'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
function csvCell(s){ s=(s==null?'':String(s)); return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function csvForVenue(onlyVenue){
  const rows=[['Venue','Pitch','Category','Item','Value','Unit']];
  const vs=onlyVenue?[onlyVenue]:state.venues;
  vs.forEach(v=>v.pitches.forEach(p=>{
    TESTS.forEach(t=>{ const td=p.tests[t.key]; td.values.forEach((val,i)=>rows.push([v.name,p.name,'Test: '+t.name,'P'+(i+1),val==null?'':val,t.unit]));
      const st=stats(td.values); rows.push([v.name,p.name,'Test summary',t.name+' — average',st.avg!=null?Math.round(st.avg*100)/100:'',t.unit]);
      rows.push([v.name,p.name,'Test summary',t.name+' — max variance %',st.varPct!=null?st.varPct:'','%']);
      if(td.method) rows.push([v.name,p.name,'Test method',t.name,td.method,'']);
      if(td.comment) rows.push([v.name,p.name,'Test comment',t.name,td.comment,'']); });
    AUDIT.forEach(s=>{ const a=p.audit[s[0]]; if(a.brief)rows.push([v.name,p.name,'Audit '+s[0]+' brief',s[1],a.brief,'']);
      Object.entries(a.fields).forEach(([k,val])=>{ if(val&&String(val).trim())rows.push([v.name,p.name,'Audit '+s[0],k,val,'']); }); });
    RISK.forEach(([k,label])=>{ if(p.risk[k])rows.push([v.name,p.name,'Risk',label,p.risk[k]+' ('+RLABEL[p.risk[k]]+')','']); });
    if(p.overall.level)rows.push([v.name,p.name,'Overall','Risk rating',p.overall.level+' ('+RLABEL[p.overall.level]+')','']);
    if(p.overall.comment)rows.push([v.name,p.name,'Overall','Comment',p.overall.comment,'']);
    if(p.photos&&p.photos.length)rows.push([v.name,p.name,'Photos','Count',p.photos.length,'']);
    TESTS.forEach(t=>{ const ph=p.tests[t.key]&&p.tests[t.key].photos; if(ph) Object.keys(ph).forEach(pos=>{ const n=(ph[pos]||[]).length; if(n)rows.push([v.name,p.name,'Observation photos',t.name+' P'+(+pos+1),n,'']); }); });
    if(p.photoNotes)rows.push([v.name,p.name,'Photos','Notes',p.photoNotes,'']);
  }));
  return rows.map(r=>r.map(csvCell).join(',')).join('\n');
}
function exportCSV(onlyVenue){
  const csv=csvForVenue(onlyVenue);
  const stamp=new Date().toISOString().slice(0,10);
  dl(`labosport_${onlyVenue?onlyVenue.name.replace(/\W+/g,'_'):'all'}_${stamp}.csv`,csv,'text/csv');
  toast('CSV exported');
}
function exportJSON(){ dl('labosport_backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(state,null,2),'application/json'); toast('Backup exported'); }
function importJSON(file){ const r=new FileReader(); r.onload=()=>{ try{ const obj=JSON.parse(r.result); if(!obj.venues)throw new Error('not a backup'); if(confirm('Replace all current data with this backup?')){state=obj;save();go('home');toast('Backup restored');} }catch(e){ toast('⚠ Invalid backup file'); } }; r.readAsText(file); }

/* ---- CSV import: restore lost readings & survey answers from an exported CSV. Fills EMPTY spots only. ---- */
function parseCSV(text){   // quote-aware: handles commas, escaped "" and newlines inside quoted cells
  const rows=[]; let row=[], cur='', q=false; text=String(text||'').replace(/\r\n?/g,'\n');
  for(let i=0;i<text.length;i++){ const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else if(c==='"') q=true;
    else if(c===',') { row.push(cur); cur=''; }
    else if(c==='\n'){ row.push(cur); rows.push(row); row=[]; cur=''; }
    else cur+=c;
  }
  if(cur!==''||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
function newVenueNamed(name){ return {id:uid(),name:name||'Imported venue',alias:'',address:'',contact:'',position:'',email:'',phone:'',grass:'',cluster:'Charlotte',wr:'',venueComment:'',params:{},briefLoaded:false,pitches:[]}; }
function applyCsvData(rows){
  const testKey={}; TESTS.forEach(t=>testKey[t.name]=t.key);
  const riskKey={}; RISK.forEach(([k,label])=>riskKey[label]=k);
  const sum={filled:0,vNew:0,pNew:0};
  const lvl=v=>{ const m=String(v).match(/\d+/); const n=m?+m[0]:0; return (n>=1&&n<=4)?n:0; };
  function getVenue(name){ let v=state.venues.find(x=>x.name===name); if(!v){ v=newVenueNamed(name); state.venues.push(v); sum.vNew++; } return v; }
  function getPitch(v,name){ let p=v.pitches.find(x=>x.name===name); if(!p){ p=newPitch(name); migratePitchTests(p); v.pitches.push(p); sum.pNew++; } return p; }
  rows.forEach((r,ri)=>{
    if(!r||r.length<5) return;
    const venueN=String(r[0]||''), pitchN=String(r[1]||''), cat=String(r[2]||''), item=String(r[3]||''), valRaw=String(r[4]==null?'':r[4]);
    if(ri===0 && venueN==='Venue') return;                       // header row
    if(!venueN||!pitchN||!cat) return;
    const val=valRaw.trim(); if(val==='') return;
    const v=getVenue(venueN), p=getPitch(v,pitchN);
    const fillStr=(obj,key)=>{ if(!obj[key]||!String(obj[key]).trim()){ obj[key]=valRaw; sum.filled++; } };
    if(cat.indexOf('Test: ')===0){                               // a position reading, e.g. P6
      const key=testKey[cat.slice(6)]; const td=key&&p.tests[key]; if(!td) return;
      const i=parseInt(item.replace(/[^0-9]/g,''),10)-1; if(isNaN(i)||i<0||i>=td.values.length) return;
      const num=parseFloat(val.replace(',','.')); if(isNaN(num)) return;
      if(td.values[i]==null){ td.values[i]=num; sum.filled++; }
    }
    else if(cat==='Test method'){ const key=testKey[item]; if(key&&p.tests[key]) fillStr(p.tests[key],'method'); }
    else if(cat==='Test comment'){ const key=testKey[item]; if(key&&p.tests[key]) fillStr(p.tests[key],'comment'); }
    else if(cat.indexOf('Audit ')===0 && / brief$/.test(cat)){ const code=cat.split(' ')[1]; if(p.audit[code]) fillStr(p.audit[code],'brief'); }
    else if(cat.indexOf('Audit ')===0){ const code=cat.split(' ')[1]; const a=p.audit[code]; if(a){ if(!a.fields[item]||!String(a.fields[item]).trim()){ a.fields[item]=valRaw; sum.filled++; } } }
    else if(cat==='Risk'){ const key=riskKey[item], n=lvl(val); if(key&&n&&!p.risk[key]){ p.risk[key]=n; sum.filled++; } }
    else if(cat==='Overall'){ if(/risk rating/i.test(item)){ const n=lvl(val); if(n&&!p.overall.level){ p.overall.level=n; sum.filled++; } } else if(/comment/i.test(item)){ fillStr(p.overall,'comment'); } }
    else if(cat==='Photos' && /notes/i.test(item)){ fillStr(p,'photoNotes'); }
    // skipped: 'Test summary' (derived), 'Photos'/'Count', 'Observation photos' (photos aren't in CSV)
  });
  return sum;
}
function importCSV(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const rows=parseCSV(r.result), head=rows[0]||[];
      if(!(head[0]==='Venue' && head.indexOf('Value')>=0)) throw new Error('not a labosport CSV');
      const vp=new Set(); rows.slice(1).forEach(x=>{ if(x[0]&&x[1]) vp.add(x[0]+' › '+x[1]); });
      if(!confirm('Import data from this CSV?\n\n'+vp.size+' pitch(es) found. Only EMPTY fields are filled — nothing you already have is changed. (Photos and venue contact details aren’t stored in CSV.)')) return;
      const sum=applyCsvData(rows);
      save(); go('home'); render();
      toast('Imported · '+sum.filled+' field(s) filled'+(sum.vNew?' · '+sum.vNew+' venue(s) added':'')+(sum.pNew?' · '+sum.pNew+' pitch(es) added':''));
    }catch(e){ toast('⚠ Invalid CSV file'); }
  };
  r.readAsText(file);
}

/* ----------------------------- report generation ----------------------------- */
// app audit field label -> template tag, per section
const REPORT_MAP = {
  A:{'Number of grounds staff':'a_staff','Sports played on the field':'a_sports','Levels of play':'a_levels','Games per year':'a_games','Practice sessions per year':'a_sessions'},
  B:{'Full playing surface area':'b_area','Reinforcement installed?':'b_reinf','Reinforcement details':'b_reinf_details','Installation date':'b_install','Slope / gradient shape':'b_slope','Slope / gradient assessment':'b_slope_assess','Levelness assessment':'b_level','Distance between post sockets':'b_sockets'},
  C:{'Pop-up irrigation present?':'c_popup','Number of sprinkler heads':'c_heads','Year installed':'c_year','Water supply source':'c_source','Water quality':'c_quality','Operational issues / performance concerns':'c_issues','Performance data collected?':'c_perf','Performance data details':'c_perf_details'},
  D:{'Ponding / squelchy conditions?':'d_ponding','Ponding / squelchy conditions (details)':'d_details','Typical duration after heavy rain':'d_duration','Occurrences per year':'d_occur','Avg closure days per season (wet)':'d_closure'},
  E:{'Grass species / turf type(s)':'e_species','Disease or disorder identified?':'e_disease','Disease / disorder details':'e_disease_details'},
  F:{'Tractor':'f_tractor','Cylinder mower':'f_cylinder','Pedestrian rotary mower':'f_rotary','Fertilizer spreader':'f_fertspread','Pedestrian spreader':'f_pedspread','Tractor-mounted aerator':'f_aerator','Line marker (Roller/Spray)':'f_linemarker','Top dresser':'f_topdresser','Boom sprayer':'f_boom','Over-seeder / Dimple-seeder':'f_overseed','Tractor-drawn brush / Drag mat':'f_dragmat','Other':'f_other'},
  G:{'Fertilizer applications/yr (type & rate)':'g_fert','Herbicide applications per year':'g_herb','Other turf management activities':'g_other'},
  H:{'Additional playability risks':'h_risks','General comments on surface / maintenance':'h_comments'},
};
const RES_KEYS = ['turf_cover','turf_height','weed','infil','soil','shear','ndvi','clegg','traction','moisture','moisture76'];
function today(){ return new Date().toISOString().slice(0,10); }
function sanitize(s){ return (s||'').replace(/[^\w\-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40); }
function reportName(v,p,ext){ return `Labosport_${sanitize(v.name)}_${sanitize(p.name)}_${today()}.${ext}`; }

function buildReportData(v,p){
  const d={ venue_name:v.name||'', cluster:v.cluster||'Charlotte', address:v.address||'', contact:v.contact||'',
    position:v.position||'', email:v.email||'', phone:v.phone||'', grass:v.grass||'',
    agronomist:state.tester||'', checked_by:'', visit_date:today() };
  // overall
  const ol=p.overall.level;
  d.overall_label = ol?(RLABEL[ol].toUpperCase()+' RISK'):''; d.overall_score = ol?(ol+'/4'):''; d.overall_comment=p.overall.comment||'';
  // risk
  RISK.forEach(([k])=>{ const lv=p.risk[k]||0; d['risk_'+k+'_label']=lv?RLABEL[lv]:''; d['risk_'+k+'_score']=lv?String(lv):''; });
  // per-pitch risk-box fill colours (sentinel hex -> level colour), applied post-render
  const fills=[[RISK_SENTINEL.overall, RISK_LEVEL_COLOR[ol||0]]];
  RISK.forEach(([k])=>{ const s=RISK_SENTINEL[k]; if(s) fills.push([s, RISK_LEVEL_COLOR[p.risk[k]||0]]); });
  d.__riskFills=fills;
  // results
  RES_KEYS.forEach(k=>{ const t=TKEY[k]; const st=stats(p.tests[k].values);
    d['res_'+k+'_avg']=st.avg!=null?fmt(st.avg,t.unit):''; d['res_'+k+'_var']=st.varPct!=null?String(st.varPct):''; d['res_'+k+'_cmt']=p.tests[k].comment||''; });
  // audit fields
  AUDIT.forEach(s=>{ const map=REPORT_MAP[s[0]]||{}; const f=p.audit[s[0]].fields;
    Object.keys(map).forEach(label=>{ const val=f[label]; if(val!=null&&String(val).trim())d[map[label]]=String(val); }); });
  return d;
}
function dlBlob(name,blob){ const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500); }

const WHITE_PX='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGP8//8/AwwwMSABFA4Aby0DAyMYAwQAAAAASUVORK5CYII=';
function b64ToArrayBuffer(dataUrl){ const i=dataUrl.indexOf('base64,'); const bin=atob(dataUrl.slice(i+7)); const len=bin.length; const u=new Uint8Array(len); for(let j=0;j<len;j++)u[j]=bin.charCodeAt(j); return u.buffer; }
function fitBox(w,h,maxW,maxH){ const s=Math.min(maxW/w,maxH/h); return [Math.round(w*s),Math.round(h*s)]; }

/* render one test's pitch map onto a canvas region */
function drawPitchOnCanvas(ctx,ox,oy,w,h,p,key){
  const pos=testPositions(p,key), vals=(p.tests[key]&&p.tests[key].values)||[], pad=w*0.04;
  ctx.fillStyle='#cfe8d6'; ctx.fillRect(ox+pad,oy+pad,w-2*pad,h-2*pad);
  ctx.strokeStyle='#9cc9ad'; ctx.lineWidth=2; ctx.strokeRect(ox+pad,oy+pad,w-2*pad,h-2*pad);
  ctx.beginPath(); ctx.moveTo(ox+w/2,oy+pad); ctx.lineTo(ox+w/2,oy+h-pad); ctx.stroke();
  ctx.setLineDash([5,5]); [0.22,0.78].forEach(fx=>{const x=ox+pad+(w-2*pad)*fx; ctx.beginPath(); ctx.moveTo(x,oy+pad); ctx.lineTo(x,oy+h-pad); ctx.stroke();}); ctx.setLineDash([]);
  const r=Math.max(9,w*0.028);
  pos.forEach((pp,k)=>{ const done=vals[k]!=null;
    if(!done) return;                                   // report maps: show only tested positions (green dots)
    const x=ox+pad+pp[0]*(w-2*pad), y=oy+pad+pp[1]*(h-2*pad);
    const lbl=shortNum(vals[k]), L=lbl.length;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle='#1f7a4d'; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='#155c39'; ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold '+Math.round(r*(L<=2?1.05:(L===3?0.82:0.68)))+'px Arial,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(lbl,x,y); });
}
/* composite image of all test maps for the report appendix; returns {dataUrl,w,h} */
function buildTestMapsImage(p){
  const cols=2, cellW=600, mapH=234, titleH=34, gap=18, rows=Math.ceil(TESTS.length/cols);
  const W=cols*cellW+gap*(cols+1), H=rows*(mapH+titleH+gap)+gap;
  const c=document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  TESTS.forEach((t,i)=>{ const rw=Math.floor(i/cols), col=i%cols, ox=gap+col*(cellW+gap), oy=gap+rw*(mapH+titleH+gap);
    const st=stats((p.tests&&p.tests[t.key]&&p.tests[t.key].values)||[]);
    ctx.fillStyle='#28282A'; ctx.font='bold 22px Arial,sans-serif'; ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText(t.name+'  ('+t.n+' pos'+(st.avg!=null?', avg '+fmt(st.avg,t.unit):'')+')',ox,oy);
    drawPitchOnCanvas(ctx,ox,oy+titleH,cellW,mapH,p,t.key);
  });
  return {dataUrl:c.toDataURL('image/png'),w:W,h:H};
}

/* single test-location map (one parameter) for Section 3 — title + pitch, returns {dataUrl,w,h} */
function buildSingleTestMapImage(p,key){
  const t=TKEY[key]; const cellW=620, mapH=300, titleH=40, pad=14;
  const W=cellW+pad*2, H=mapH+titleH+pad*2;
  const c=document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  const st=stats((p.tests&&p.tests[key]&&p.tests[key].values)||[]);
  ctx.fillStyle='#28282A'; ctx.font='bold 22px Arial,sans-serif'; ctx.textAlign='left'; ctx.textBaseline='top';
  ctx.fillText(t.name+'  ('+t.n+' pos'+(st.avg!=null?', avg '+fmt(st.avg,t.unit):'')+')', pad, pad);
  drawPitchOnCanvas(ctx,pad,pad+titleH,cellW,mapH,p,key);
  return {dataUrl:c.toDataURL('image/png'),w:W,h:H};
}
/* Section 3 maps: which parameters, and the device-named caption beneath each. Edit captions here. */
const SEC3_MAPS=[
  ['shear','map_shear','cap_shear','Root zone shear strength — measured with a shear vane apparatus'],
  ['clegg','map_clegg','cap_clegg','Clegg impact (compaction) — measured with a Clegg Impact Soil Tester'],
  ['traction','map_traction','cap_traction','Surface traction (19 mm stud) — measured with a studded-disc rotational traction tester'],
];

function loadImage(src){ return new Promise(res=>{ if(!src||typeof src!=='string'){ res(null); return; }   // skip photos with no image data (avoids GET /undefined 404)
  const im=new Image(); im.onload=()=>res(im); im.onerror=()=>res(null); im.src=src; }); }
/* composite of the soil-test observation photos, grouped by position (for report Appendix K) */
async function buildSoilPhotosImage(p){
  const td=p.tests&&p.tests.soil, ph=(td&&td.photos)||{};
  const positions=[]; (td?td.values:[]).forEach((v,i)=>{ if((ph[i]||[]).length) positions.push({i,v,photos:ph[i]}); });
  if(!positions.length) return null;
  const W=1240, pad=24, cols=3, cellW=Math.floor((W-pad*(cols+1))/cols), cellH=Math.round(cellW*0.75), titleH=34, blockGap=20;
  const blocks=positions.map(pos=>({pos, rows:Math.ceil(pos.photos.length/cols)})).map(b=>({...b, h:titleH + b.rows*(cellH+10) + blockGap}));
  const H=pad + blocks.reduce((a,b)=>a+b.h,0);
  const c=document.createElement('canvas'); c.width=W; c.height=H; const ctx=c.getContext('2d');
  ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
  let y=pad;
  for(const b of blocks){ const pos=b.pos;
    ctx.fillStyle='#28282A'; ctx.font='bold 22px Arial,sans-serif'; ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillText('Position P'+(pos.i+1)+(pos.v!=null?'  ·  '+shortNum(pos.v)+' mm root depth':''), pad, y);
    for(let k=0;k<pos.photos.length;k++){ const col=k%cols, row=Math.floor(k/cols);
      const x=pad+col*(cellW+pad), cy=y+titleH+row*(cellH+10);
      ctx.fillStyle='#eef1f4'; ctx.fillRect(x,cy,cellW,cellH);
      const im=await loadImage(pos.photos[k].dataUrl);
      if(im&&im.width){ const ar=im.width/im.height, car=cellW/cellH; let dw,dh,dx,dy;
        if(ar>car){ dh=cellH; dw=dh*ar; dx=x-(dw-cellW)/2; dy=cy; } else { dw=cellW; dh=dw/ar; dx=x; dy=cy-(dh-cellH)/2; }
        ctx.save(); ctx.beginPath(); ctx.rect(x,cy,cellW,cellH); ctx.clip(); ctx.drawImage(im,dx,dy,dw,dh); ctx.restore(); }
      ctx.strokeStyle='#c9ccd0'; ctx.lineWidth=1; ctx.strokeRect(x,cy,cellW,cellH);
    }
    y+=b.h;
  }
  return {dataUrl:c.toDataURL('image/jpeg',0.7), w:W, h:H};
}
async function buildPitchReportData(v,p){
  const data=buildReportData(v,p), sizeMap={};
  for(let i=0;i<6;i++){ const ph=p.photos[i], key='photo'+(i+1);
    if(ph){ data[key]=ph.dataUrl; sizeMap[ph.dataUrl]=fitBox(ph.w||240,ph.h||160,250,185); }
    else { data[key]=WHITE_PX; sizeMap[WHITE_PX]=[235,150]; } }
  data.photo_notes=p.photoNotes||'';
  try{ const tm=buildTestMapsImage(p); data.test_maps=tm.dataUrl; sizeMap[tm.dataUrl]=fitBox(tm.w,tm.h,640,900); }
  catch(e){ console.error('test-maps image failed:',e); data.test_maps=WHITE_PX; sizeMap[WHITE_PX]=[235,150]; }
  // Section 3 — individual location maps for shear, compaction (clegg) and traction, each with a device caption.
  SEC3_MAPS.forEach(([key,imgTag,capTag,caption])=>{
    try{ const m=buildSingleTestMapImage(p,key); data[imgTag]=m.dataUrl; sizeMap[m.dataUrl]=fitBox(m.w,m.h,440,430); }
    catch(e){ console.error('section-3 map failed ('+key+'):',e); data[imgTag]=WHITE_PX; sizeMap[WHITE_PX]=[235,150]; }
    data[capTag]=caption;
  });
  try{ const sp=await buildSoilPhotosImage(p);
    if(sp){ data.has_soil_photos=true; data.soil_photos=sp.dataUrl; sizeMap[sp.dataUrl]=fitBox(sp.w,sp.h,660,900); }
    else data.has_soil_photos=false;
  }catch(e){ data.has_soil_photos=false; }
  return {data,sizeMap};
}
/* Sniff an image's real format from its leading bytes so we can name the embedded
   file with a matching extension. The bundled image module names EVERY image
   "image_generated_N.png"; when the bytes are actually JPEG, strict readers
   (MS Word, Google Docs) refuse to render them — the cause of blank photos. */
function imgExtFromBytes(u8){
  if(u8&&u8.length>3){
    if(u8[0]===0x89&&u8[1]===0x50&&u8[2]===0x4E&&u8[3]===0x47) return 'png';
    if(u8[0]===0xFF&&u8[1]===0xD8&&u8[2]===0xFF) return 'jpg';
    if(u8[0]===0x47&&u8[1]===0x49&&u8[2]===0x46) return 'gif';
    if(u8[0]===0x52&&u8[1]===0x49&&u8[2]===0x46&&u8[3]===0x46) return 'webp';
  }
  return 'png';
}
function renderReportZip(buf,data,sizeMap,withImages){
  const modules=[];
  if(withImages && window.ImageModule){
    let nextExt='png';
    // Fresh placeholder bytes per call — never share one buffer between images:
    // PizZip may transfer/detach the buffer on generate, and a reused (detached)
    // buffer throws "assign to read-only property" on iOS.
    const whiteBytes=()=>new Uint8Array(b64ToArrayBuffer(WHITE_PX));
    const mod=new window.ImageModule({centered:true,
      // Never throw from here: a single malformed/HEIC/blob image must not blank
      // every image in the report. Bad tags fall back to a 1px white placeholder.
      getImage:tag=>{ try{
          if(typeof tag!=='string' || tag.indexOf('base64,')<0){ nextExt='png'; return whiteBytes(); }
          const u=new Uint8Array(b64ToArrayBuffer(tag));
          if(!u.length){ nextExt='png'; return whiteBytes(); }
          nextExt=imgExtFromBytes(u); return u;
        }catch(e){ console.warn('report image decode failed, using placeholder',e); nextExt='png'; return whiteBytes(); } },
      getSize:(img,tag)=>{ const s=sizeMap[tag]; return (Array.isArray(s)&&s[0]>0&&s[1]>0)?s:[235,150]; }});
    // getImage() always runs immediately before getNextImageName() for the same image,
    // so nextExt is the format of the image about to be written — use it for the filename.
    mod.getNextImageName=function(){ const n='image_generated_'+this.imageNumber+'.'+nextExt; this.imageNumber++; return n; };
    modules.push(mod);
  }
  const doc=new window.docxtemplater(new window.PizZip(buf),{modules,paragraphLoop:true,linebreaks:true,delimiters:{start:'{',end:'}'},nullGetter:()=>''});
  doc.render(data);
  const zip=doc.getZip();
  applyRiskFills(zip,data.__riskFills);
  return zip;
}
/* Swap each risk-box sentinel fill for the colour of this pitch's actual level. */
function applyRiskFills(zip,fills){
  if(!fills||!fills.length) return;
  try{ let xml=zip.file('word/document.xml').asText();
    // Strip any theme-fill attributes globally: when a cell has w:themeFill, Microsoft Word shows
    // the THEME colour and ignores the literal w:fill we swap below — so the risk colours looked
    // right everywhere except Word. Removing them forces Word to use the literal fill.
    xml=xml.replace(/\s+w:themeFill(?:Tint|Shade)?="[^"]*"/g,'');
    fills.forEach(([sent,color])=>{
      // replace the whole shd element for this sentinel (drops any leftover theme attrs), then a
      // plain value swap as a fallback in case the shd is structured differently.
      xml=xml.replace(new RegExp('<w:shd[^>]*w:fill="'+sent+'"[^>]*/>','g'),'<w:shd w:val="clear" w:color="auto" w:fill="'+color+'"/>');
      xml=xml.split('w:fill="'+sent+'"').join('w:fill="'+color+'"');
    });
    zip.file('word/document.xml',xml);
  }catch(e){ console.warn('risk-fill colouring failed',e); }
}
const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
function dataUrlToUint8(dataUrl){ return new Uint8Array(b64ToArrayBuffer(dataUrl)); }
async function buildVenueWordBlob(v, pitchesArr){
  const pitches=pitchesArr&&pitchesArr.length?pitchesArr:v.pitches;
  const res=await fetch('report_template.docx'); if(!res.ok) throw new Error('template not found ('+res.status+')');
  const buf=await res.arrayBuffer();
  const built=await Promise.all(pitches.map(p=>buildPitchReportData(v,p)));
  function make(withImages){ const zips=built.map(d=>renderReportZip(buf,d.data,d.sizeMap,withImages));
    const merged=(zips.length>1 && window.mergeDocxZips)?window.mergeDocxZips(zips):zips[0];
    return merged.generate({type:'blob',mimeType:DOCX_MIME}); }
  try{ return make(true); }catch(e){ console.warn('publish: image render failed, text-only',e); return make(false); }
}
async function publishVenueDrive(v){
  if(!window.GDrive){ toast('Sync module not loaded'); return; }
  if(!GDrive.getClientId()){ toast('Set up Google Drive in the Data tab first'); go('settings'); return; }
  toast('<span class="spin"></span> Publishing “'+v.name+'” to Drive…');
  try{
    const files=[];
    files.push({name:sanitize(v.name)+'_data_'+today()+'.csv', content:csvForVenue(v), mime:'text/csv'});
    files.push({name:'Labosport_'+sanitize(v.name)+'_report_'+today()+'.docx', content:await buildVenueWordBlob(v,v.pitches), mime:DOCX_MIME});
    v.pitches.forEach(p=>{ p.photos.forEach((ph,i)=>{ files.push({name:sanitize(p.name)+'_photo_'+(i+1)+'.jpg', content:dataUrlToUint8(ph.dataUrl), mime:'image/jpeg'}); });
      TESTS.forEach(t=>{ const ph=p.tests[t.key]&&p.tests[t.key].photos; if(ph) Object.keys(ph).forEach(pos=>{ (ph[pos]||[]).forEach((x,n)=>{ files.push({name:sanitize(p.name)+'_'+t.key+'_P'+(+pos+1)+'_'+(n+1)+'.jpg', content:dataUrlToUint8(x.dataUrl), mime:'image/jpeg'}); }); }); }); });
    await GDrive.publishToSubfolder(v.name, files, (n,tot)=>toast('<span class="spin"></span> Publishing “'+v.name+'” to Drive… '+n+'/'+tot));
    toast('Published “'+v.name+'” to Drive ✓ ('+files.length+' files)');
  }catch(e){ console.error(e); toast('⚠ Publish failed: '+(e.message||e)); }
}
async function generateWord(v,pitchesArr){
  if(!window.PizZip||!window.docxtemplater){ toast('⚠ Report engine still loading — try again in a moment'); return; }
  const pitches=pitchesArr&&pitchesArr.length?pitchesArr:[pitch()];
  toast('<span class="spin"></span> Building Word report'+(pitches.length>1?' ('+pitches.length+' pitches)':'')+'…');
  let buf;
  try{ const res=await fetch('report_template.docx'); if(!res.ok) throw new Error('template not found ('+res.status+')'); buf=await res.arrayBuffer(); }
  catch(e){ console.error(e); toast('⚠ Report failed: '+(e.message||e)); return; }
  const built=await Promise.all(pitches.map(p=>buildPitchReportData(v,p)));
  const name = pitches.length>1 ? ('Labosport_'+sanitize(v.name)+'_all-pitches_'+today()+'.docx') : reportName(v,pitches[0],'docx');
  function make(withImages){
    const zips=built.map(d=>renderReportZip(buf,d.data,d.sizeMap,withImages));
    const merged=(zips.length>1 && window.mergeDocxZips)?window.mergeDocxZips(zips):zips[0];
    return merged.generate({type:'blob',mimeType:DOCX_MIME});
  }
  try{ dlBlob(name, make(true)); toast('Word report downloaded ✓'); }
  catch(e1){ console.error('image render failed:',e1);
    // Surface the FULL error so we can diagnose why images fail (the image step silently
    // dropping to text-only is why reports come out with no photos/maps). Stash it for inspection
    // and show it untruncated; tap the toast to copy the full text.
    const full=(e1&&e1.name||'Error')+': '+(e1&&e1.message||String(e1))+(e1&&e1.stack?('\n\n'+String(e1.stack).split('\n').slice(0,4).join('\n')):'');
    window.__lastReportError=full;
    try{ dlBlob(name, make(false));
      // Show the full error in a modal alert (reliable on mobile, unlike the clipboard) so it can be
      // read or screenshotted. Also try to copy as a convenience.
      try{ if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(full).catch(()=>{}); }catch(_){}
      const t=$('toast'); if(t){ t.textContent='⚠ Photos/maps skipped — image step failed. Tap for details.'; t.classList.add('show');
        t.onclick=()=>{ alert(full); };
        clearTimeout(window.__rptErrT); window.__rptErrT=setTimeout(()=>{t.classList.remove('show');t.onclick=null;},10000); }
      setTimeout(()=>{ try{ alert('Report made WITHOUT photos/maps.\n\nImage step error:\n'+full); }catch(_){} }, 300);
    }
    catch(e2){ console.error(e2); toast('⚠ Report failed: '+(e2.name||'')+' '+(e2.message||e2)); }
  }
}

/* print-to-PDF report (HTML facsimile of the template; the .docx is the exact one) */
function rrow(cells){ return '<tr>'+cells.map(c=>`<td>${c}</td>`).join('')+'</tr>'; }
// risk-level cell colour, matching the Word report + in-app chips (1 green → 4 red). Inline so it
// survives both the browser's print-to-PDF and any other renderer.
function riskCellStyle(lv){ const c=RISK_LEVEL_COLOR[lv]||'D9D9D9'; return `background:#${c};color:${lv?'#fff':'#28282A'};font-weight:700;text-align:center`; }
function reportSheet(v,p){
  const E=esc; const ol=p.overall.level;
  const riskRows=RISK.map(([k,label])=>{const lv=p.risk[k]||0;
    return `<tr><td>${E(label)}</td><td>${lv?RLABEL[lv]:'—'}</td><td style="${riskCellStyle(lv)}">${lv?lv:'—'}</td></tr>`;}).join('');
  const resRows=RES_KEYS.map(k=>{const t=TKEY[k],st=stats(p.tests[k].values);
    return rrow([E(t.name),st.avg!=null?E(fmt(st.avg,t.unit)):'—',st.varPct!=null?st.varPct:'—',E(p.tests[k].comment||'')]);}).join('');
  const appendix=AUDIT.map(s=>{const f=p.audit[s[0]].fields;const rows=s[4].map(([label])=>{const val=f[label];return rrow([E(label),val?E(val):'—']);}).join('');
    return `<h3>Appendix ${s[0]} — ${E(s[1])}</h3><table class="t2">${rows}</table>`;}).join('');
  let bench=''; const pb=p.bench||{};
  if(pb.role==='bench'){ bench=`<h3>Benchmark selection</h3><p>${pb.note?E(pb.note):'Selected as the benchmark pitch for this venue.'}</p>`; }
  else if(pb.role){ const bp=(v.pitches||[]).find(x=>x.bench&&x.bench.role==='bench');
    bench=`<h3>Comparison vs benchmark</h3><p><b>${({worse:'Worse than',sim:'Similar to',better:'Better than'}[pb.role]||'')} benchmark${bp?(' ('+E(bp.name)+')'):''}.</b> ${E(pb.note||'')}</p>`; }
  return `<div class="sheet">
    <div class="hd"><div class="ttl">PITCH INSPECTION <span class="lb">REPORT</span></div><div class="muted">Labosport Group · ${E(today())}</div></div>
    <div class="grid">
      <div><div class="kv"><span class="k">Venue</span><b>${E(v.name)}</b></div>
        <div class="kv"><span class="k">Pitch</span><b>${E(p.name)}</b></div>
        <div class="kv"><span class="k">Cluster</span><span>${E(v.cluster||'Charlotte')}</span></div>
        <div class="kv"><span class="k">Address</span><span>${E(v.address)||'—'}</span></div></div>
      <div><div class="kv"><span class="k">Contact</span><span>${E(v.contact)||'—'}</span></div>
        <div class="kv"><span class="k">Position</span><span>${E(v.position)||'—'}</span></div>
        <div class="kv"><span class="k">Grass type</span><span>${E(v.grass)||'—'}</span></div>
        <div class="kv"><span class="k">Agronomist</span><span>${E(state.tester)||'—'}</span></div></div>
    </div>
    <h2>1 · Overall assessment — venue</h2>
    <p><span class="rate">${ol?E(RLABEL[ol].toUpperCase()+' RISK · '+ol+'/4'):'NOT RATED'}</span></p>
    <p>${E(p.overall.comment)||'<span class="muted">No overall comment recorded.</span>'}</p>
    <h2>2 · Detailed risk assessment by parameter</h2>
    <table><tr><td style="${riskCellStyle(1)}">Low · 1</td><td style="${riskCellStyle(2)}">Moderate · 2</td><td style="${riskCellStyle(3)}">High · 3</td><td style="${riskCellStyle(4)}">Critical · 4</td></tr></table>
    <table><tr><th>Parameter</th><th>Level of risk</th><th>Score</th></tr>${riskRows}</table>
    <h2>3 · Results for pitch</h2>
    <table><tr><th>Parameter</th><th>Average</th><th>Max variance (%)</th><th>Comments</th></tr>${resRows}</table>
    ${bench?'<h2>Benchmark & comparison</h2>'+bench:''}
    <h2>Appendix · Venue audit</h2>${appendix}
  </div>`;
}
function reportHTML(v,pitches){
  const sheets=pitches.map(p=>reportSheet(v,p)).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(v.name)} report</title>
  <style>
    @page{size:A4;margin:14mm}
    *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact} body{font-family:Arial,Helvetica,sans-serif;color:#28282A;font-size:11px;margin:0}
    .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #E92840;padding-bottom:8px;margin-bottom:10px}
    .hd .ttl{font-size:18px;font-weight:800;letter-spacing:1px}
    .lb{color:#E92840} .muted{color:#838384}
    table{width:100%;border-collapse:collapse;margin:6px 0 14px}
    td,th{border:1px solid #c9ccd0;padding:5px 7px;text-align:left;vertical-align:top}
    th{background:#28282A;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
    h2{font-size:12px;text-transform:uppercase;letter-spacing:.5px;border-left:4px solid #E92840;padding-left:8px;margin:16px 0 6px}
    h3{font-size:11px;margin:10px 0 3px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
    .kv{display:flex;justify-content:space-between;border-bottom:1px solid #eee;padding:3px 0}
    .kv .k{color:#838384}
    .rate{display:inline-block;background:#E92840;color:#fff;font-weight:800;padding:3px 10px;border-radius:4px}
    .t2 td:first-child{width:46%;color:#444;background:#fafafa}
    @media screen{body{background:#eee;padding:16px}.sheet{background:#fff;max-width:800px;margin:0 auto 16px;padding:22px;box-shadow:0 2px 12px rgba(0,0,0,.15)}.noprint{margin:0 auto 12px;max-width:800px}}
    @media print{.noprint{display:none}.sheet:not(:first-of-type){page-break-before:always}}
    .pbtn{background:#E92840;color:#fff;border:none;padding:10px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-size:14px}
  </style></head><body>
  <div class="noprint"><button class="pbtn" onclick="window.print()">⤓ Save as PDF / Print</button>${pitches.length>1?' &nbsp; <span class="muted">'+pitches.length+' pitches in sequence</span>':''}</div>
  ${sheets}
  <div class="noprint muted" style="max-width:800px;margin:0 auto">The Word (.docx) export matches the official Field Report Template exactly; this PDF is generated from the same data.</div>
  </body></html>`;
}
function generatePDF(v,pitchesArr){
  const pitches=pitchesArr&&pitchesArr.length?pitchesArr:[pitch()];
  const w=window.open('','_blank');
  if(!w){ toast('⚠ Allow pop-ups for PDF, or use the Word report'); return; }
  w.document.write(reportHTML(v,pitches)); w.document.close();
  try{ w.focus(); }catch(e){}
}

/* -------- position-entry keyboard nav (Next/Prev accessory bar) --------
   The iOS numeric/decimal keypad has no return key, so a focused position box
   can't be advanced from the keyboard. This sticky bar (pinned just above the
   keyboard via visualViewport) lets the tester move Next/Prev without tapping
   each box. On desktop/Android the Enter key handles it, so the bar only shows
   on touch devices. */
let _posInputs=[];
const _isTouch = (typeof matchMedia==='function' && matchMedia('(pointer:coarse)').matches) || ('ontouchstart' in window);
function _posList(){ return Array.from(document.querySelectorAll('#app [data-pos]')); }
function posNavShow(inp){
  if(!_isTouch) return;
  const bar=$('keyNav'); if(!bar) return;
  _posInputs=_posList(); const idx=_posInputs.indexOf(inp); if(idx<0) return;
  const lbl=$('knLbl'); if(lbl) lbl.textContent='P'+(idx+1);
  const prev=$('knPrev'); if(prev) prev.disabled = idx===0;
  bar.hidden=false; posNavPosition();
}
function posNavHide(){ const bar=$('keyNav'); if(bar) bar.hidden=true; }
function posNavGo(delta){
  if(!_posInputs.length) _posInputs=_posList();
  let idx=_posInputs.indexOf(document.activeElement);
  if(idx<0) return;
  const next=_posInputs[idx+delta];
  if(next){
    next.focus(); try{next.select();}catch(e){}
    try{next.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){}
    const ni=_posInputs.indexOf(next), lbl=$('knLbl'), prev=$('knPrev');
    if(lbl) lbl.textContent='P'+(ni+1); if(prev) prev.disabled=ni===0;
  } else if(delta>0){                       // advanced past the last box → finish entry
    const a=document.activeElement; if(a&&a.blur)a.blur(); posNavHide();
  }
}
function posNavPosition(){
  const bar=$('keyNav'); if(!bar||bar.hidden) return;
  const vv=window.visualViewport;
  bar.style.bottom = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))+'px' : '0px';
}
function bindPosNav(){
  const bar=$('keyNav'); if(!bar) return;
  const hold=(el,fn)=>{ if(el) el.addEventListener('pointerdown',ev=>{ ev.preventDefault(); fn(); }); };
  hold($('knPrev'),()=>posNavGo(-1));
  hold($('knNext'),()=>posNavGo(1));
  hold($('knDone'),()=>{ const a=document.activeElement; if(a&&a.blur)a.blur(); posNavHide(); });
  if(window.visualViewport){ window.visualViewport.addEventListener('resize',posNavPosition); window.visualViewport.addEventListener('scroll',posNavPosition); }
}

/* ----------------------------- init ----------------------------- */
function init(){
  load(); setupPdf();
  $('backBtn').onclick=back;
  $('settingsBtn').onclick=()=>go('settings');
  document.querySelectorAll('.tabbar button').forEach(b=>b.onclick=()=>go(b.dataset.tab));
  $('pdfInput').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)handleBrief(f);};
  $('photoInput').onchange=e=>{const fs=Array.from(e.target.files||[]);e.target.value='';handlePhotos(fs);};
  if($('obsPhotoInput'))$('obsPhotoInput').onchange=e=>{const fs=Array.from(e.target.files||[]);e.target.value='';handleObsPhotos(fs);};
  if($('photoLibInput'))$('photoLibInput').onchange=e=>{const fs=Array.from(e.target.files||[]);e.target.value='';handlePhotos(fs);};
  $('importInput').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)importJSON(f);};
  if($('csvImportInput'))$('csvImportInput').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)importCSV(f);};
  bindPosNav();
  // Google Drive two-way sync
  if(window.GDrive){
    GDrive.configure({
      getState:()=>state,
      applyState:(obj)=>{ if(!obj||!obj.venues)return; state=obj;
        try{ (state.venues||[]).forEach(v=>(v.pitches||[]).forEach(migratePitchTests)); migrateBenchmark(state); }catch(e){}
        if(!state.updatedAt)state.updatedAt=Date.now();
        CUR=null; CURP=0; stack=['home']; save(false,{keepStamp:true,noSync:true}); render(); },
      onStatus:(m,kind)=>{ if(kind!=='muted') toast(m); const e=$('syncStatus'); if(e&&cur()==='settings') e.innerHTML=m; }
    });
    GDrive.autoStart();
  }
  // Firebase live team sync
  if(window.FB){
    FB.configure({
      getState:()=>state,
      applyRemoteVenue:applyRemoteVenue,
      removeRemoteVenue:removeRemoteVenue,
      onStatus:(m,kind)=>{ if(kind!=='muted') toast(m); const e=$('fbStatus'); if(e&&cur()==='settings') e.innerHTML=m; }
    });
    FB.autoStart();
  }
  render();
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
}
document.addEventListener('DOMContentLoaded',init);
