/* firebase.js — live team sync via Firebase Auth (Google) + Cloud Firestore.
   Each venue is a document in the `venues` collection. Real-time listener merges
   teammates' changes into the local store (last-write-wins by _ts). Debounced push
   on local changes. Offline persistence handled by the Firestore SDK.
   Photos & brief images are NOT stored in Firestore (size limit) — they stay local
   and are preserved on merge; share those via the Drive publish feature. */
(function(){
  'use strict';
  const CFG_KEY='labosport_fb';
  let cfg=load();                       // {config:{...}|null, enabled:bool}
  let app=null, auth=null, db=null, storage=null, user=null, unsub=null, started=false;
  let hooks={ getState:()=>({venues:[]}), onStatus:()=>{}, applyRemoteVenue:()=>{}, removeRemoteVenue:()=>{} };
  let lastSeen={};                      // venueId -> content hash (excludes photos/_ts)
  let pushTimer=null, wired=false;

  function load(){ try{ return Object.assign({config:null,enabled:false}, JSON.parse(localStorage.getItem(CFG_KEY)||'{}')); }catch(e){ return {config:null,enabled:false}; } }
  function saveCfg(){ try{ localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }catch(e){} }
  function status(m,k){ hooks.onStatus(m,k); }
  // config baked into the app (firebase-config.js) — used automatically so teammates never paste it
  function embedded(){ const c=(typeof window!=='undefined')&&window.LABOSPORT_FB_CONFIG; return (c&&c.projectId)?c:null; }
  function activeConfig(){ return cfg.config || embedded(); }
  function fbReady(){ return typeof firebase!=='undefined' && firebase.firestore && firebase.auth; }

  // venue doc to store in Firestore: keep small photo refs {id,w,h} so teammates learn which photos
  // exist (the bytes go to Storage), drop the heavy brief-image data (kept in Storage under brief/<id>),
  // record the brief count so receivers know to fetch, and drop the transient _ts.
  function forFirestore(v){ const c=JSON.parse(JSON.stringify(v));
    c._briefN=Math.max((v.briefImages||[]).length, v._briefN||0); delete c.briefImages;
    const strip=ph=>{ if(ph) delete ph.dataUrl; };               // keep {id,w,h}; image bytes live in Storage
    (c.pitches||[]).forEach(p=>{ (p.photos||[]).forEach(strip);
      if(p.tests) Object.keys(p.tests).forEach(k=>{ const ph=p.tests[k]&&p.tests[k].photos; if(ph) Object.keys(ph).forEach(pos=>(ph[pos]||[]).forEach(strip)); }); });
    return c; }
  function contentHash(v){ const c=forFirestore(v); delete c._ts; delete c._by; return JSON.stringify(c); }

  function init(){
    if(app) return true;
    const conf=activeConfig();
    if(!fbReady()||!conf) return false;
    try{
      app=firebase.initializeApp(conf);
      auth=firebase.auth(); db=firebase.firestore();
      try{ if(firebase.storage) storage=firebase.storage(); }catch(e){}   // photo/brief blobs (optional; needs Storage enabled)
      db.enablePersistence({synchronizeTabs:true}).catch(()=>{});   // offline cache
      auth.onAuthStateChanged(u=>{
        user=u;
        if(u){ cfg.enabled=true; saveCfg(); status('Team sync on · '+(u.email||u.uid),'ok'); startListener(); schedulePush(); }
        else { stopListener(); status('Signed out of team sync','muted'); }
      });
      // Flush pending edits the instant the app is hidden/closed (don't let them die in the
      // debounce window), and re-push when the network returns. This is the main reason edits
      // "didn't reach others": the user closed/switched away before the timer fired.
      if(!wired){ wired=true;
        if(typeof document!=='undefined') document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden') flush(); });
        if(typeof window!=='undefined'){ window.addEventListener('pagehide',flush); window.addEventListener('online',()=>schedulePush()); }
      }
      return true;
    }catch(e){ console.error(e); status('⚠ Firebase init failed: '+(e.message||e),'warn'); return false; }
  }
  function startListener(){
    stopListener(); if(!db) return;
    unsub=db.collection('venues').onSnapshot(snap=>{
      snap.docChanges().forEach(ch=>{
        if(ch.doc.metadata.hasPendingWrites) return;        // ignore our own writes
        const id=ch.doc.id;
        if(ch.type==='removed'){ delete lastSeen[id]; hooks.removeRemoteVenue(id); }
        else { const data=ch.doc.data(); data.id=data.id||id; lastSeen[id]=contentHash(data); hooks.applyRemoteVenue(data); }
      });
    }, err=>status('⚠ Team sync error: '+(err&&err.message||err),'warn'));
  }
  function stopListener(){ if(unsub){ try{unsub();}catch(e){} unsub=null; } }

  function pushChanges(){
    if(!db||!user) return;
    const st=hooks.getState(); const ids=new Set();
    (st.venues||[]).forEach(v=>{ ids.add(v.id);
      const h=contentHash(v);
      if(lastSeen[v.id]!==h){ lastSeen[v.id]=h; const doc=forFirestore(v); doc._ts=Date.now(); doc._by=(user.email||user.uid);
        // On failure, un-mark so the change is retried — otherwise one blip strands it forever.
        db.collection('venues').doc(v.id).set(doc).catch(e=>{ delete lastSeen[v.id]; status('⚠ Push failed (will retry): '+(e.message||e),'warn'); clearTimeout(pushTimer); pushTimer=setTimeout(pushChanges,5000); }); }
    });
    Object.keys(lastSeen).forEach(id=>{ if(!ids.has(id)){ const prev=lastSeen[id]; delete lastSeen[id]; db.collection('venues').doc(id).delete().catch(()=>{ lastSeen[id]=prev; }); } });
  }
  function flush(){ clearTimeout(pushTimer); pushChanges(); }
  function schedulePush(){ if(!cfg.enabled||!user) return; clearTimeout(pushTimer); pushTimer=setTimeout(pushChanges,700); }
  // call after a remote venue is merged locally so we don't immediately echo it back
  function markSeen(v){ if(v&&v.id) lastSeen[v.id]=contentHash(v); }

  function parseConfig(text){
    text=(text||'').trim(); if(!text) return null;
    try{ return JSON.parse(text); }catch(e){}
    try{ return (new Function('return ('+text+')'))(); }catch(e){}   // tolerate JS-object form from the console
    return null;
  }

  function connect(){
    if(!activeConfig()){ status('Paste your Firebase config first','warn'); return; }
    if(!init()){ status('Firebase still loading — try again in a moment','warn'); return; }
    status('<span class="spin"></span> Signing in to Google…','info');
    const prov=new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(prov).catch(e=>{
      if(e&&/popup/i.test(e.code||'')){ try{ auth.signInWithRedirect(prov); return; }catch(_){} }
      status('⚠ Sign-in failed: '+(e.message||e.code||e),'warn');
    });
  }
  // email + password sign-in (works for any email; no Google account needed).
  // single flow: try to sign in, and if the account doesn't exist yet, create it.
  async function connectEmail(email,pw){
    email=(email||'').trim();
    if(!email||!pw){ status('Enter your email and a password','warn'); return; }
    if(pw.length<6){ status('Password must be at least 6 characters','warn'); return; }
    if(!activeConfig()){ status('Team sync isn’t configured yet','warn'); return; }
    if(!init()){ status('Firebase still loading — try again in a moment','warn'); return; }
    status('<span class="spin"></span> Signing in…','info');
    try{ await auth.signInWithEmailAndPassword(email,pw); }
    catch(e){
      const code=e&&e.code||'';
      if(/user-not-found|invalid-credential|invalid-login/.test(code)){
        try{ await auth.createUserWithEmailAndPassword(email,pw); }     // first time -> create the account
        catch(e2){ const c2=e2&&e2.code||'';
          if(/email-already-in-use|invalid-credential/.test(c2)) status('⚠ Wrong password for that email','warn');
          else if(/weak-password/.test(c2)) status('⚠ Password too short (min 6 characters)','warn');
          else if(/operation-not-allowed/.test(c2)) status('⚠ Enable Email/Password sign-in in Firebase first','warn');
          else status('⚠ Sign-in failed: '+(e2.message||c2),'warn');
          return; }
      } else if(/operation-not-allowed/.test(code)){ status('⚠ Enable Email/Password sign-in in Firebase first','warn'); return; }
      else { status('⚠ Sign-in failed: '+(e.message||code),'warn'); return; }
    }
    // onAuthStateChanged takes it from here
  }
  function disconnect(){ try{ if(auth) auth.signOut(); }catch(e){} cfg.enabled=false; saveCfg(); status('Disconnected from team sync','muted'); }
  // auto-init when there's any config (baked-in or saved). Firebase Auth persists the session,
  // so after the first sign-in this silently restores it and resumes background sync.
  function autoStart(){ if(!activeConfig()) return; let n=0; (function wait(){ if(fbReady()){ init(); } else if(n++<60){ setTimeout(wait,150); } })(); }

  /* ---------- photo / brief blobs in Cloud Storage ---------- */
  // Mirrors the local IndexedDB media tier across devices. Each photo is stored by its stable id;
  // brief-image arrays by venue id. Failures are surfaced to the caller, which treats them as
  // "photo stays local" — no data is ever lost, the image just doesn't appear on the other device.
  function blobToDataURL(b){ return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.onerror=()=>rej(fr.error); fr.readAsDataURL(b); }); }
  function putMedia(id, dataUrl){ if(!storage||!id||!dataUrl) return Promise.reject(new Error('storage unavailable'));
    return storage.ref('media/'+id).putString(dataUrl,'data_url').then(()=>true); }
  function getMedia(id){ if(!storage||!id) return Promise.reject(new Error('storage unavailable'));
    return storage.ref('media/'+id).getDownloadURL().then(u=>fetch(u)).then(r=>{ if(!r.ok) throw new Error('download '+r.status); return r.blob(); }).then(blobToDataURL); }
  function putBrief(vid, arr){ if(!storage||!vid) return Promise.reject(new Error('storage unavailable'));
    return storage.ref('brief/'+vid+'.json').putString(JSON.stringify(arr||[]),'raw',{contentType:'application/json'}).then(()=>true); }
  function getBrief(vid){ if(!storage||!vid) return Promise.reject(new Error('storage unavailable'));
    return storage.ref('brief/'+vid+'.json').getDownloadURL().then(u=>fetch(u)).then(r=>{ if(!r.ok) throw new Error('download '+r.status); return r.text(); }).then(t=>JSON.parse(t)); }

  window.FB={
    configure(h){ hooks=Object.assign(hooks,h); },
    setConfig(text){ const c=parseConfig(text); if(!c||!c.projectId){ status('⚠ That doesn’t look like a Firebase config','warn'); return false; } cfg.config=c; saveCfg(); return true; },
    getConfigText(){ const c=activeConfig(); return c?JSON.stringify(c,null,2):''; },
    hasConfig(){ return !!activeConfig(); },
    usingEmbedded(){ return !cfg.config && !!embedded(); },
    isEnabled(){ return !!cfg.enabled || !!embedded(); },
    isConfigured(){ return !!activeConfig(); },
    isSignedIn(){ return !!user; },
    userEmail(){ return user?(user.email||user.uid):''; },
    storageReady(){ return !!storage; },
    putMedia, getMedia, putBrief, getBrief,
    connect, connectEmail, disconnect, schedulePush, flush, autoStart, markSeen,
    deleteVenueDoc(id){ try{ delete lastSeen[id]; if(db&&id) db.collection('venues').doc(id).delete().catch(()=>{}); }catch(e){} },
    syncNow(){ pushChanges(); }
  };
})();
