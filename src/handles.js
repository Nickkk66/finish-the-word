import {cleanHandle,handleKey,validHandle} from '../public/js/shared/handles.js';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const secret=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(v=>v.toString(16).padStart(2,'0')).join('');

export const handleMethods={
 initHandles(){
  this.sql.exec('CREATE TABLE IF NOT EXISTS handles (handle TEXT PRIMARY KEY, owner TEXT UNIQUE NOT NULL, name TEXT NOT NULL, secret_hash TEXT, account TEXT UNIQUE, revision INTEGER NOT NULL DEFAULT 1)');
  try{this.sql.exec('ALTER TABLE handles ADD COLUMN revision INTEGER NOT NULL DEFAULT 1');}catch{}
  this.sql.exec('CREATE TABLE IF NOT EXISTS handle_rooms (owner TEXT NOT NULL, room TEXT NOT NULL, seen_at INTEGER NOT NULL, PRIMARY KEY(owner,room))');
  // Reserve existing accounts before any guest can claim their current identity.
  for(const a of this.sql.exec('SELECT username,profile FROM accounts ORDER BY created_at,username')){
   const p=JSON.parse(a.profile);
   if(this.one('SELECT owner FROM handles WHERE account=?',a.username))continue;
   let name=cleanHandle(p.name)||cleanHandle(a.username)||'Player',suffix=1;
   if(/^bot-/i.test(name))name='Player';
   const base=name;
   while(this.one('SELECT owner FROM handles WHERE handle=?',handleKey(name)))name=base.slice(0,12)+suffix++;
   // Legacy saves occasionally share a client-generated id; keep account identities distinct.
   if(this.one('SELECT owner FROM handles WHERE owner=?',p.id))p.id=secret().slice(0,24);
   this.sql.exec('INSERT INTO handles(handle,owner,name,account) VALUES(?,?,?,?)',handleKey(name),p.id,name,a.username);
   p.name=name;this.sql.exec('UPDATE accounts SET profile=? WHERE username=?',JSON.stringify(p),a.username);
  }
 },
 async handleIdentity(request){
  const session=await this.session(request);
  if(session){const row=this.one('SELECT * FROM handles WHERE account=?',session.username);return row?{row,session}:null;}
  const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization')||'')?.[1];
  if(!token)return null;
  const row=this.one('SELECT * FROM handles WHERE secret_hash=? AND account IS NULL',await hash(token));
  return row?{row,session:null}:null;
 },
 async notifyHandle(row){
  if(!this.env?.ROOMS)return;
  const rooms=[...this.sql.exec('SELECT room FROM handle_rooms WHERE owner=?',row.owner)];
  await Promise.all(rooms.map(async({room})=>{
   try{await this.env.ROOMS.get(this.env.ROOMS.idFromName(room)).fetch('https://internal/handle-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:row.owner,name:row.name,revision:row.revision})});}catch{ /* reconnect always re-verifies the current handle */ }
  }));
  if(this.env.LEADERBOARD){try{await this.env.LEADERBOARD.get(this.env.LEADERBOARD.idFromName('global')).fetch('https://internal/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:row.owner,name:row.name,revision:row.revision})});}catch{}}
 },
 async handleRequest(request,path,readBody){
  const identity=await this.handleIdentity(request);
  if(path==='/verify'&&request.method==='GET'){
   if(!identity)return json({error:'Choose and claim your handle before joining.'},401);
   const room=new URL(request.url).searchParams.get('room');
   if(room&&/^[A-Z0-9]{4,8}$/.test(room))this.sql.exec('INSERT INTO handle_rooms(owner,room,seen_at) VALUES(?,?,?) ON CONFLICT(owner,room) DO UPDATE SET seen_at=excluded.seen_at',identity.row.owner,room,Date.now());
   return json({id:identity.row.owner,name:identity.row.name,revision:identity.row.revision});
  }
  if(path!=='/claim'||request.method!=='POST')return json({error:'Not found.'},404);
  const body=await readBody(request),name=typeof body.handle==='string'?body.handle.trim():'';
  if(!validHandle(name))return json({error:'Use 1–16 letters, numbers, spaces, underscores, dots or hyphens. “bot-” is reserved.'},400);
  const key=handleKey(name),taken=this.one('SELECT owner FROM handles WHERE handle=?',key);
  if(taken&&taken.owner!==identity?.row.owner)return json({error:'That handle is taken. Choose another.',code:'handle_taken'},409);
  if(identity){
   // No await between availability check and write: this central SQLite object serializes claims.
   const row=this.one('UPDATE handles SET handle=?,name=?,revision=revision+1 WHERE owner=? RETURNING *',key,name,identity.row.owner);
   if(identity.session){
    const account=this.one('SELECT profile FROM accounts WHERE username=?',identity.session.username),p=JSON.parse(account.profile);
    p.name=name;this.sql.exec('UPDATE accounts SET profile=? WHERE username=?',JSON.stringify(p),identity.session.username);
   }
   await this.notifyHandle(row);
   return json({id:row.owner,handle:name});
  }
  if(request.headers.has('Authorization'))return json({error:'Your handle session expired. Sign in again.'},401);
  const id=body.id;
  if(typeof id!=='string'||!/^[a-z0-9]{8,40}$/i.test(id))return json({error:'Invalid player identity.'},400);
  if(this.one('SELECT owner FROM handles WHERE owner=?',id))return json({error:'This identity already has a handle. Restore its saved session or sign in.'},409);
  const token=secret(),tokenHash=await hash(token);
  // Recheck after the digest await to protect simultaneous first claims.
  if(this.one('SELECT owner FROM handles WHERE handle=? OR owner=?',key,id))return json({error:'That handle is taken. Choose another.',code:'handle_taken'},409);
  this.sql.exec('INSERT INTO handles(handle,owner,name,secret_hash) VALUES(?,?,?,?)',key,id,name,tokenHash);
  return json({id,handle:name,token});
 },
 async registerHandle(profile,username,token){
  if(this.one('SELECT owner FROM handles WHERE account=?',username))return false;
  const previous=this.one('SELECT * FROM handles WHERE owner=?',profile.id);
  if(previous){
   if(previous.account||!token||previous.secret_hash!==await hash(token))return false;
   // Recheck after await: another registration could have adopted this guest.
   const changed=[...this.sql.exec('UPDATE handles SET account=?,secret_hash=NULL WHERE owner=? AND account IS NULL AND secret_hash=? RETURNING name',username,profile.id,previous.secret_hash)][0];
   if(!changed)return false;profile.name=changed.name;return true;
  }
  const name=cleanHandle(profile.name);
  if(!validHandle(name)||this.one('SELECT owner FROM handles WHERE handle=?',handleKey(name)))return false;
  this.sql.exec('INSERT INTO handles(handle,owner,name,account) VALUES(?,?,?,?)',handleKey(name),profile.id,name,username);profile.name=name;return true;
 },
};
