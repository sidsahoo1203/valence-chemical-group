import {createContext,useContext,useEffect,useState,useCallback} from 'react';
import {api,refreshSession,sessionClient} from './api';
const Context=createContext(null);
export function AppProvider({children}){
 const [user,setUser]=useState(null),[ready,setReady]=useState(false),[sessionError,setSessionError]=useState(null),[config,setConfig]=useState(null),[cart,setCart]=useState(null),[notice,setNotice]=useState(null);
 const toast=useCallback((message,tone='success')=>setNotice({message,tone,id:Date.now()}),[]);
 const reloadCart=useCallback(async()=>{try{setCart(await api('/cart'));}catch{setCart(null);}},[]);
 const retrySession=useCallback(async()=>{setReady(false);setSessionError(null);try{await refreshSession();}catch(e){setSessionError(e);}finally{setReady(true);}},[]);
 useEffect(()=>sessionClient.subscribe((session,error)=>{if(error){setSessionError(error);return;}setUser(session?.user||null);setSessionError(null);}),[]);
 useEffect(()=>{let active=true;api('/config').then(c=>{if(active)setConfig(c);}).catch(e=>{if(active)toast(e.message,'error');});retrySession();return()=>{active=false;};},[toast,retrySession]);
 useEffect(()=>{if(user)reloadCart();else setCart(null);},[user,reloadCart]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(null),5000);return()=>clearTimeout(t);},[notice]);
 async function signin(path,body){return sessionClient.signin(path,body);}
 async function logout(){await sessionClient.logout();setCart(null);}
 return <Context.Provider value={{user,setUser,ready,sessionError,retrySession,config,cart,reloadCart,signin,logout,toast}}>{children}{notice&&<div className={'toast '+notice.tone} role={notice.tone==='error'?'alert':'status'}>{notice.message}<button onClick={()=>setNotice(null)} aria-label="Dismiss notification">×</button></div>}</Context.Provider>;
}
export const useApp=()=>useContext(Context);
