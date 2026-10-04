import {createSessionClient} from './session';
const BASE=(import.meta.env.VITE_API_URL||'/api').replace(/\/$/,'');
const channel=typeof window!=='undefined'&&window.BroadcastChannel?new window.BroadcastChannel('valence-session:'+BASE):null;
export const sessionClient=createSessionClient({base:BASE,channel});
export const setToken=value=>sessionClient.setToken(value);
export const refreshSession=()=>sessionClient.refresh();
export async function api(path,{method='GET',body,retry=true,...options}={}){
 const accessToken=sessionClient.getToken(),multipart=body instanceof FormData;
 const r=await fetch(BASE+path,{...options,method,credentials:'include',headers:{'X-Valence-Client':'web',...(!multipart&&body?{'Content-Type':'application/json'}:{}),...(accessToken?{Authorization:'Bearer '+accessToken}:{})},body:body?(multipart?body:JSON.stringify(body)):undefined});
 if(r.status===401&&retry&&!path.startsWith('/auth/')){const s=await refreshSession();if(s)return api(path,{method,body,retry:false,...options});}
 const data=r.status===204?null:await r.json().catch(()=>({message:'The server returned an unreadable response.'}));
 if(!r.ok){const error=new Error(data?.message||'Request failed.');error.status=r.status;error.fields=data?.fields;throw error;}if(path==='/auth/reset-password'&&method==='POST')await sessionClient.changed().catch(()=>{});return data;
}
export async function downloadFile(url,name){const path=url.startsWith('/api/')?url.slice(4):null;if(!path)throw new Error('Invalid document link.');const accessToken=sessionClient.getToken();const r=await fetch(BASE+path,{credentials:'include',headers:accessToken?{Authorization:'Bearer '+accessToken}:{}});if(!r.ok)throw new Error('Document unavailable. Please try again.');const href=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=href;a.download=name||'valence-document.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(href),1000);}
export function assetUrl(url){return url?.startsWith('/api/')?BASE+url.slice(4):url;}
