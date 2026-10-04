// Each tab keeps its access token in memory. Web Locks serialize changes to the
// shared HttpOnly cookie; BroadcastChannel carries only a change notification.
export function createSessionClient({base,fetcher=(...args)=>fetch(...args),locks=()=>globalThis.navigator?.locks,channel=null}){
 let token=null,pendingRefresh=null,localQueue=Promise.resolve();
 const listeners=new Set();
 const emit=(session,error=null)=>listeners.forEach(fn=>fn(session,error));
 const apply=session=>{token=session?.accessToken||null;emit(session);return session;};
 function exclusive(task){
  if(locks()?.request)return locks().request('valence-session:'+base,task);
  // Single-tab fallback for older browsers. Supported multi-tab environments
  // are current browsers on HTTPS or localhost (which supply Web Locks).
  const result=localQueue.then(task,task);localQueue=result.catch(()=>{});return result;
 }
 async function send(path,body){
  const response=await fetcher(base+path,{method:'POST',credentials:'include',headers:{'X-Valence-Client':'web',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({message:'The server returned an unreadable response.'}));
  if(!response.ok){const error=new Error(data.message||'Request failed.');error.status=response.status;error.fields=data.fields;throw error;}
  return data;
 }
 function refresh(){
  if(!pendingRefresh)pendingRefresh=exclusive(async()=>{
   try{return apply(await send('/auth/refresh'));}
   catch(error){if(error.status===401)return apply(null);emit(undefined,error);throw error;}
  }).finally(()=>{pendingRefresh=null;});
  return pendingRefresh;
 }
 if(channel)channel.onmessage=event=>{if(event.data==='session-changed'){token=null;refresh().catch(()=>{});}};
 return {
  getToken:()=>token,setToken:value=>{token=value;},refresh,
  subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  async signin(path,body){return exclusive(async()=>{const data=apply(await send(path,body));channel?.postMessage('session-changed');return data.user;});},
  async logout(){return exclusive(async()=>{await send('/auth/logout');apply(null);channel?.postMessage('session-changed');});},
  changed(){channel?.postMessage('session-changed');return refresh();},
  dispose(){channel?.close();listeners.clear();}
 };
}
