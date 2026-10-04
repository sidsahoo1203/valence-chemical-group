import bcrypt from 'bcryptjs';
import {SignJWT,jwtVerify} from 'jose';
export const uid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const safeUser=u=>({id:u.id,name:u.name,email:u.email,role:u.role,companyName:u.companyName,deliveryRegion:u.deliveryRegion,createdAt:u.createdAt});
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export const hashPassword=p=>bcrypt.hash(p,12);
export const checkPassword=(p,h)=>bcrypt.compare(p,h);
const key=config=>new TextEncoder().encode(config.JWT_SECRET);
async function sign(payload,type,config,expiry){return new SignJWT({...payload,type}).setProtectedHeader({alg:'HS256'}).setIssuer('valence-api').setAudience(config.scope).setIssuedAt().setExpirationTime(expiry).sign(key(config));}
export async function verify(token,type,config){try{const {payload}=await jwtVerify(token,key(config),{issuer:'valence-api',audience:config.scope,algorithms:['HS256']});return payload.type===type?payload:null;}catch{return null;}}
export function refreshCookie(token,config,clear=false){return 'valence_refresh='+token+'; Path=/api/auth; HttpOnly; SameSite='+(config.crossSite?'None':'Lax')+(config.secure?'; Secure':'')+'; Max-Age='+(clear?0:604800);}
export function getRefresh(request){return request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('valence_refresh='))?.slice(16);}
export async function newSession(store,user,config,previous){
  const session=previous||{id:uid(),buyer:user.id,createdAt:now(),revoked:false};
  const refresh=await sign({sub:user.id,sid:session.id,jti:uid(),ver:user.authVersion||0},'refresh',config,'7d');
  session.refreshHash=await digest(refresh);session.expiresAt=new Date(Date.now()+604800000).toISOString();
  await store.commit([{kind:'Session',doc:session}]);
  const accessToken=await sign({sub:user.id,sid:session.id,ver:user.authVersion||0},'access',config,'15m');
  return {body:{accessToken,user:safeUser(user)},cookie:refreshCookie(refresh,config)};
}
export async function authenticate(request,store,config){
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');if(!token)return null;
  const p=await verify(token,'access',config);if(!p)return null;
  const [session,user]=await Promise.all([store.get('Session',p.sid),store.get('User',p.sub)]);
  if(!user||(config.demo&&user.id==='demo-admin')||!session||session.revoked||session.buyer!==user.id||session.expiresAt<now()||p.ver!==(user.authVersion||0))return null;
  return {user,session};
}
