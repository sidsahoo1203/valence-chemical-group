import {useEffect,useState,useId} from 'react';
import {Link} from 'react-router-dom';
import {ArrowRight,LoaderCircle,AlertCircle,PackageSearch} from 'lucide-react';
import {api} from '../lib/api';
export const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((n||0)/100);
export const date=x=>!x||Number.isNaN(new Date(x).getTime())?'—':new Date(x).toLocaleDateString('en-US',{day:'numeric',month:'short',year:'numeric'});
export function Badge({value}){return <span className={'badge badge-'+value}>{value?.replaceAll('-',' ')||'—'}</span>;}
export function PageHeading({eyebrow,title,children,action}){return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{children&&<p>{children}</p>}</div>{action}</div>;}
export function Empty({title='Nothing here yet',children,to,label}){return <div className="empty-state"><PackageSearch size={36}/><h3>{title}</h3>{children&&<p>{children}</p>}{to&&<Link className="btn" to={to}>{label||'Browse catalog'}<ArrowRight size={16}/></Link>}</div>;}
export function ErrorBox({error,retry}){if(!error)return null;return <div role="alert" className="error-box"><AlertCircle size={18}/><span>{error.message||error}</span>{retry&&<button className="text-button" onClick={retry}>Retry</button>}</div>;}
export function Loading(){return <div className="loading" role="status"><LoaderCircle className="spin" size={24}/> Loading…</div>;}
export function useLoad(path){
 const [state,setState]=useState({path:null,data:null,error:null}),[version,setVersion]=useState(0);
 useEffect(()=>{
  const c=new AbortController();let active=true;
  setState({path,data:null,error:null});
  if(path)api(path,{signal:c.signal}).then(data=>{if(active)setState({path,data,error:null});}).catch(error=>{if(active&&error.name!=='AbortError')setState({path,data:null,error});});
  return()=>{active=false;c.abort();};
 },[path,version]);
 // Effects run after rendering: never expose another path's data during that render.
 return {data:state.path===path?state.data:null,error:state.path===path?state.error:null,setData:data=>setState(s=>({path,data:typeof data==='function'?data(s.path===path?s.data:null):data,error:null})),reload:()=>setVersion(v=>v+1)};
}
export function Field({label,children,hint,...props}){const id=useId();return <label className="field"><span id={id+'-label'}>{label}</span>{children||<input aria-labelledby={id+'-label'} aria-describedby={hint?id+'-hint':undefined} {...props}/>} {hint&&<small id={id+'-hint'}>{hint}</small>}</label>;}
export function AddressFields({value,onChange}){const f=(key,label,required=true)=><Field key={key} label={label} value={value[key]||''} required={required} maxLength={key==='postalCode'?20:180} onChange={e=>onChange({...value,[key]:e.target.value})}/>;return <><div className="field-pair">{f('label','Address label')}{f('name','Recipient name')}</div>{f('companyName','Company',false)}{f('line1','Street address')}{f('line2','Apartment / building / floor',false)}<div className="field-pair">{f('city','City')}{f('state','State / region')}</div><div className="field-pair">{f('postalCode','Postal code')}{f('country','Country')}</div>{f('phone','Contact phone')}</>;}
