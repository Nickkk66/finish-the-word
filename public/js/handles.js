import {profile,setName} from './profile.js';
import {apiUrl} from './net.js';
import {cleanHandle} from './shared/handles.js';
const KEY='ftw_handle_sessions_v1';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return {};}};
export function guestHandleToken(){return read()[profile.id]||null;}
export function createHandles({account}){
 let queue=Promise.resolve();
 const serial=fn=>{const next=queue.then(fn,fn);queue=next.catch(()=>{});return next;};
 async function request(path,body){
  const token=(account.identityToken?.()||account.token())||guestHandleToken()||(memoryToken?.id===profile.id?memoryToken.token:null);
  const response=await fetch(apiUrl(`/api/handle/${path}`),{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not claim your handle. Try again.');
  if(data.token){const sessions=read();sessions[data.id]=data.token;try{localStorage.setItem(KEY,JSON.stringify(sessions));}catch{ /* keep this visit working if browser storage is unavailable */ }memoryToken={id:data.id,token:data.token};}
  setName(data.handle||data.name);return data;
 }
 let memoryToken=null;
 function token(){return (account.identityToken?.()||account.token())||guestHandleToken()||(memoryToken?.id===profile.id?memoryToken.token:null);}
 // Canonical identity wins over a stale save on another device.
 function ensure(){return serial(async()=>{await account.ready;return request(token()?'verify':'claim',token()?null:{id:profile.id,handle:profile.name});});}
 function rename(raw){return serial(async()=>{await account.ready;const handle=cleanHandle(raw);if(!handle)throw new Error('Enter a handle.');return request('claim',{id:profile.id,handle});});}
 return {ensure,rename,token};
}
