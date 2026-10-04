import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import {Readable} from 'node:stream';
import {handleApi} from '../../shared/api.js';
import {getRefresh,verify} from '../../shared/auth.js';

export function adapterHeaders(input){
 const headers=new Headers();
 for(const [key,value] of Object.entries(input)){
  const k=key.toLowerCase();
  // Express has already resolved req.ip using the trusted ingress. Never forward IP claims.
  if(value!==undefined&&!['host','content-length','forwarded','true-client-ip','x-real-ip','client-ip','x-client-ip','fastly-client-ip'].includes(k)&&!k.startsWith('cf-')&&!k.startsWith('x-forwarded-'))headers.set(k,Array.isArray(value)?value.join(','):value);
 }
 return headers;
}
export function createApp({config,storeFactory,trustProxy=0}){
 const app=express();app.disable('x-powered-by');app.set('trust proxy',trustProxy);
 app.use(helmet());
 app.use(cors({origin:config.FRONTEND_ORIGIN,credentials:true,methods:['GET','POST','PATCH','DELETE','OPTIONS'],allowedHeaders:['Content-Type','Authorization','X-Valence-Client']}));
 const options={windowMs:15*60*1000,standardHeaders:'draft-7',legacyHeaders:false,message:{message:'Too many authentication attempts. Try again in 15 minutes.'}};
 app.use(['/api/auth/login','/api/auth/register','/api/auth/forgot-password','/api/auth/reset-password'],rateLimit({...options,limit:60}));
 const validRefresh=rateLimit({...options,limit:1200,keyGenerator:req=>req.verifiedRefreshSid});
 const invalidRefresh=rateLimit({...options,limit:60});
 app.use('/api/auth/refresh',async(req,res,next)=>{
  try{
   const token=getRefresh({headers:new Headers({cookie:req.headers.cookie||''})});
   const p=token?await verify(token,'refresh',config):null;
   if(p?.sid){req.verifiedRefreshSid=p.sid;return validRefresh(req,res,next);}
   return invalidRefresh(req,res,next);
  }catch(error){next(error);}
 });
 // Preserve exact bytes for Stripe signatures and multipart uploads.
 app.use('/api',express.raw({type:()=>true,limit:'11mb'}));
 app.use(async(req,res,next)=>{
  if(!req.originalUrl.startsWith('/api/'))return res.status(404).json({message:'Not found.'});
  try{
   const request=new Request('http://api.internal'+req.originalUrl,{method:req.method,headers:adapterHeaders(req.headers),...(!['GET','HEAD'].includes(req.method)&&req.body?.length?{body:req.body}:{})});
   const response=await handleApi(request,storeFactory(),{...config,clientIp:req.ip});
   res.status(response.status);response.headers.forEach((v,k)=>res.setHeader(k,v));
   if(response.body)Readable.fromWeb(response.body).pipe(res);else res.end();
  }catch(error){next(error);}
 });
 app.use((error,req,res,next)=>{const status=error.type==='entity.too.large'?413:500;res.status(status).json({message:status===413?'File exceeds the upload limit.':'The service is temporarily unavailable.'});});
 return app;
}
