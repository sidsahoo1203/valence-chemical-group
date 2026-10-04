import {D1Store} from '../../shared/store.js';
import {handleApi} from '../../shared/api.js';
import {TestD1} from './store.mjs';
export function fixture(){
 const db=new TestD1(),store=new D1Store(db,'acceptance'),emails=[];
 const config={demo:false,scope:'acceptance',JWT_SECRET:'sqlite-acceptance-secret-not-a-deployment-secret',FRONTEND_ORIGIN:'http://localhost:5173',secure:false,clientIp:'192.0.2.50',notifications:{sendReset:async message=>{emails.push(message);}}};
 async function call(path,{method='GET',body,token,cookie,headers={},cfg=config}={}){
  const multipart=body instanceof FormData;
  const request=new Request('http://localhost:5173/api'+path,{method,headers:{'X-Valence-Client':'web',Origin:config.FRONTEND_ORIGIN,...(!multipart?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:multipart?body:JSON.stringify(body)}:{})});
  const response=await handleApi(request,store,cfg);return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 const registration={name:'Acceptance Buyer',email:'buyer@example.test',password:'Acceptance-password-123!',companyName:'Acceptance Works',deliveryRegion:'Chennai'};
 return {db,store,config,emails,call,registration,close:()=>db.sql.close()};
}
