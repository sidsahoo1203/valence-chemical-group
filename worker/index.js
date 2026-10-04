import {handleApi} from '../shared/api.js';
import {D1Store} from '../shared/store.js';
import {digest} from '../shared/auth.js';
import assets from 'virtual:valence-assets';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')){
   const identity=request.headers.get('oai-authenticated-user-id');
   if(env.DEMO_MODE!=='true'||!identity)return new Response(JSON.stringify({message:'This private demo requires an authenticated site session.'}),{status:401,headers:{'Content-Type':'application/json'}});
   const scope='demo-'+(await digest(identity)).slice(0,24);
   if(!env.JWT_SECRET||env.JWT_SECRET.length<32)return new Response(JSON.stringify({message:'The application is awaiting secure session configuration.'}),{status:503,headers:{'Content-Type':'application/json'}});
   const config={clientIp:request.headers.get('cf-connecting-ip')||'unknown',demo:true,demoIdentity:identity,scope,JWT_SECRET:env.JWT_SECRET,FRONTEND_ORIGIN:url.origin,secure:true,crossSite:false,bucket:env.BUCKET};
   return handleApi(request,new D1Store(env.DB,scope),config);
  }
  const asset=assets[url.pathname]||(!url.pathname.split('/').pop().includes('.')?assets['/index.html']:null);
  if(!asset||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404});
  const response=new Response(request.method==='HEAD'?null:asset.content,{headers:{'Content-Type':asset.type+'; charset=utf-8','Cache-Control':url.pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'}});
  const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com");
  return new Response(response.body,{status:response.status,headers});
 }
};
