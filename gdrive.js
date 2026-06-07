/* gdrive.js — two-way Google Drive sync for the Labosport Pitch Inspector.
   Uses Google Identity Services (token model) + Drive REST API with the
   non-sensitive `drive.file` scope (the app only ever touches its own folder/file).
   No backend. Config: a public OAuth Web Client ID pasted in Settings. */
(function(){
  'use strict';
  const SCOPE='https://www.googleapis.com/auth/drive.file';
  const FOLDER_NAME='Labosport Pitch Inspector';
  const FILE_NAME='labosport_data.json';
  const META_KEY='labosport_sync';

  let meta = loadMeta();           // {clientId, autoSync, lastSync, connected, folderId, fileId}
  let tokenClient=null, accessToken=null, tokenExpiry=0;
  let hooks={ getState:()=>({}), applyState:()=>{}, onStatus:()=>{} };
  let pushTimer=null, syncing=false;

  function loadMeta(){ try{ return Object.assign({clientId:'',autoSync:true,lastSync:0,connected:false,folderId:'',fileId:''}, JSON.parse(localStorage.getItem(META_KEY)||'{}')); }catch(e){ return {clientId:'',autoSync:true,lastSync:0,connected:false,folderId:'',fileId:''}; } }
  function saveMeta(){ try{ localStorage.setItem(META_KEY, JSON.stringify(meta)); }catch(e){} }
  function status(msg,kind){ hooks.onStatus(msg,kind); }

  function gisReady(){ return typeof google!=='undefined' && google.accounts && google.accounts.oauth2; }

  function initClient(){
    if(!gisReady()||!meta.clientId) return false;
    if(tokenClient) return true;
    tokenClient = google.accounts.oauth2.initTokenClient({ client_id: meta.clientId, scope: SCOPE, callback: ()=>{} });
    return true;
  }
  // resolve an access token; interactive=true shows Google consent/login if needed
  function getToken(interactive){
    return new Promise((resolve,reject)=>{
      if(accessToken && Date.now() < tokenExpiry-60000) return resolve(accessToken);
      if(!initClient()) return reject(new Error('Google sign-in not ready — set your Client ID first'));
      tokenClient.callback=(resp)=>{ if(resp&&resp.error) return reject(new Error(resp.error)); accessToken=resp.access_token; tokenExpiry=Date.now()+((resp.expires_in||3600)*1000); resolve(accessToken); };
      try{ tokenClient.requestAccessToken({prompt: interactive?'consent':''}); }catch(e){ reject(e); }
    });
  }

  /* ---------- Drive REST helpers ---------- */
  async function api(url,opts){ const t=await getToken(false); opts=opts||{}; opts.headers=Object.assign({Authorization:'Bearer '+t},opts.headers||{});
    const r=await fetch(url,opts); if(r.status===401){ accessToken=null; const t2=await getToken(false); opts.headers.Authorization='Bearer '+t2; return fetch(url,opts);} return r; }
  async function apiErr(r,label){ let m=''; try{ const j=JSON.parse(await r.text()); m=(j.error&&(j.error.message||j.error.status))||''; }catch(e){}
    if(r.status===403 && /not been used|disabled|accessNotConfigured|SERVICE_DISABLED/i.test(m)) m='Google Drive API is not enabled for this project — enable it in Google Cloud Console.';
    else if(r.status===403 && !m) m='Permission denied (403). Check that the Drive API is enabled and the OAuth app is published.';
    return new Error(label+' ('+r.status+')'+(m?': '+m:'')); }
  async function findId(q){ const r=await api('https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&spaces=drive&fields=files(id,name,modifiedTime)&pageSize=1'); if(!r.ok) throw await apiErr(r,'Drive search failed'); const j=await r.json(); return (j.files&&j.files[0])||null; }
  async function ensureFolder(){ if(meta.folderId) return meta.folderId;
    const f=await findId("name='"+FOLDER_NAME+"' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    if(f){ meta.folderId=f.id; saveMeta(); return f.id; }
    const r=await api('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:FOLDER_NAME,mimeType:'application/vnd.google-apps.folder'})});
    if(!r.ok) throw await apiErr(r,'Could not create Drive folder'); meta.folderId=(await r.json()).id; saveMeta(); return meta.folderId; }
  async function findDataFile(){ const fid=await ensureFolder();
    const f=await findId("name='"+FILE_NAME+"' and '"+fid+"' in parents and trashed=false"); if(f){ meta.fileId=f.id; saveMeta(); } return f; }
  async function uploadFile(contentStr){
    if(meta.fileId){ const r=await api('https://www.googleapis.com/upload/drive/v3/files/'+meta.fileId+'?uploadType=media',{method:'PATCH',headers:{'Content-Type':'application/json'},body:contentStr}); if(r.ok)return meta.fileId; if(r.status!==404) throw await apiErr(r,'Upload failed'); meta.fileId=''; }
    const fid=await ensureFolder(); const boundary='lbsp'+Math.random().toString(36).slice(2);
    const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:FILE_NAME,parents:[fid],mimeType:'application/json'})+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+contentStr+'\r\n--'+boundary+'--';
    const r=await api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    if(!r.ok) throw await apiErr(r,'Create failed'); meta.fileId=(await r.json()).id; saveMeta(); return meta.fileId; }
  async function downloadFile(){ const f=await findDataFile(); if(!f) return null; const r=await api('https://www.googleapis.com/drive/v3/files/'+f.id+'?alt=media'); if(!r.ok) throw await apiErr(r,'Download failed'); try{ return JSON.parse(await r.text()); }catch(e){ throw new Error('Drive file is not valid JSON'); } }

  /* ---------- sync logic ---------- */
  async function push(){ const s=hooks.getState(); await uploadFile(JSON.stringify(s)); meta.lastSync=s.updatedAt||Date.now(); saveMeta(); }
  async function syncNow(silent){
    if(syncing) return; syncing=true;
    try{
      if(!meta.clientId){ status('Add your Google Client ID first','warn'); return; }
      if(!silent) status('<span class="spin"></span> Syncing with Google Drive…','info');
      const local=hooks.getState(); const lStamp=local.updatedAt||0;
      const remote=await downloadFile();
      if(!remote){ await push(); status('Synced to Drive ✓','ok'); return 'pushed'; }
      const rStamp=remote.updatedAt||0;
      if(rStamp>lStamp){ hooks.applyState(remote); meta.lastSync=rStamp; saveMeta(); status('Pulled newer data from Drive ✓','ok'); return 'pulled'; }
      if(lStamp>rStamp){ await push(); status('Synced to Drive ✓','ok'); return 'pushed'; }
      meta.lastSync=lStamp; saveMeta(); status('Already up to date ✓','ok'); return 'insync';
    }catch(e){ console.error(e); status('⚠ Sync failed: '+(e.message||e),'warn'); throw e; }
    finally{ syncing=false; }
  }
  function schedulePush(){ if(!meta.connected||!meta.autoSync||!meta.clientId) return; clearTimeout(pushTimer);
    pushTimer=setTimeout(()=>{ getToken(false).then(()=>push().then(()=>status('Auto-saved to Drive ✓','muted')).catch(()=>{})).catch(()=>{}); }, 4000); }

  async function connect(){
    if(!meta.clientId){ status('Add your Google Client ID first','warn'); return; }
    status('<span class="spin"></span> Connecting to Google…','info');
    try{ await getToken(true); meta.connected=true; saveMeta(); status('Connected to Google Drive ✓','ok'); await syncNow(true); status('Connected & synced ✓','ok'); }
    catch(e){ console.error(e); status('⚠ Could not connect: '+(e.message||e),'warn'); }
  }
  function disconnect(){ try{ if(accessToken&&gisReady()) google.accounts.oauth2.revoke(accessToken,()=>{}); }catch(e){} accessToken=null; tokenExpiry=0; meta.connected=false; saveMeta(); status('Disconnected from Drive','muted'); }

  /* ---------- one-way publish: per-venue sub-folders with finished files ---------- */
  async function ensureSubFolder(name, parentId){
    const q="name='"+name.replace(/'/g,"\\'")+"' and mimeType='application/vnd.google-apps.folder' and '"+parentId+"' in parents and trashed=false";
    const f=await findId(q); if(f) return f.id;
    const r=await api('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]})});
    if(!r.ok) throw await apiErr(r,'Could not create sub-folder'); return (await r.json()).id;
  }
  async function uploadNamedFile(parentId, name, content, mime){
    let id; const q="name='"+name.replace(/'/g,"\\'")+"' and '"+parentId+"' in parents and trashed=false";
    const existing=await findId(q);
    if(existing){ id=existing.id; }
    else { const r=await api('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,parents:[parentId],mimeType:mime})});
      if(!r.ok) throw await apiErr(r,'Create file failed'); id=(await r.json()).id; }
    const r2=await api('https://www.googleapis.com/upload/drive/v3/files/'+id+'?uploadType=media',{method:'PATCH',headers:{'Content-Type':mime},body:content});
    if(!r2.ok) throw await apiErr(r2,'Upload failed'); return id;
  }
  async function ensureToken(){ try{ return await getToken(false); }catch(e){ return await getToken(true); } }
  async function publishToSubfolder(subName, files, onProgress){
    if(!meta.clientId) throw new Error('Add your Google Client ID first');
    await ensureToken(); meta.connected=true; saveMeta();
    const main=await ensureFolder();
    const sub=await ensureSubFolder(subName, main);
    let n=0; for(const f of files){ await uploadNamedFile(sub, f.name, f.content, f.mime); n++; if(onProgress)onProgress(n,files.length); }
    return sub;
  }
  // attempt silent sync on app open if previously connected
  async function autoStart(){ if(!meta.connected||!meta.clientId) return; let tries=0;
    (function wait(){ if(gisReady()||tries>40){ if(gisReady()){ getToken(false).then(()=>syncNow(true)).catch(()=>status('Tap “Sync now” to reconnect Drive','muted')); } return; } tries++; setTimeout(wait,150); })(); }

  window.GDrive={
    configure(h){ hooks=Object.assign(hooks,h); },
    setClientId(id){ meta.clientId=(id||'').trim(); meta.folderId=''; meta.fileId=''; tokenClient=null; accessToken=null; saveMeta(); },
    getClientId(){ return meta.clientId; },
    isConnected(){ return !!meta.connected; },
    autoSyncOn(){ return !!meta.autoSync; },
    setAutoSync(v){ meta.autoSync=!!v; saveMeta(); },
    lastSync(){ return meta.lastSync||0; },
    connect, disconnect, syncNow, schedulePush, autoStart, publishToSubfolder
  };
})();
