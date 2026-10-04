import test from 'node:test';
import assert from 'node:assert/strict';
import {TestD1} from './helpers/store.mjs';
import {D1Store} from '../shared/store.js';
import {handleApi} from '../shared/api.js';
import {newSession} from '../shared/auth.js';
import {adapterHeaders,createApp} from '../server/src/http-app.js';
const cfg={scope:'security-tests',demo:false,JWT_SECRET:'unit-test-secret-never-for-deployment-123456789',FRONTEND_ORIGIN:'https://valence.test',clientIp:'192.0.2.10'};
function setup(){const db=new TestD1();return new D1Store(db,cfg.scope);}
async function request(store,path,{cookie,body,headers={},config=cfg}={}){return handleApi(new Request('https://valence.test/api'+path,{method:'POST',headers:{'X-Valence-Client':'web',Origin:cfg.FRONTEND_ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...headers},body:JSON.stringify(body||{})}),store,config);}
async function session(store,id){const user={id,name:'Test Buyer',email:id+'@example.test',role:'buyer',companyName:'Test',createdAt:new Date().toISOString()};await store.commit([{kind:'User',doc:user}]);return newSession(store,user,cfg);}
await test('refresh survives 80 reloads and does not consume login IP quota',async()=>{
 const store=setup();let s=await session(store,'one'),cookie=s.cookie.split(';')[0];
 for(let i=0;i<80;i++){const r=await request(store,'/auth/refresh',{cookie});assert.equal(r.status,200);cookie=r.headers.get('set-cookie').split(';')[0];}
 const r=await request(store,'/auth/login',{body:{email:'missing@example.test',password:'incorrect'}});assert.equal(r.status,401);
});
await test('refresh quota is isolated per verified session, not shared office IP',async()=>{
 const store=setup(),one=await session(store,'one'),two=await session(store,'two');
 const sid=(await store.list('Session','one'))[0].id;
 for(let i=0;i<900;i++)await store.rate('refresh:'+sid,900,900);
 assert.equal((await request(store,'/auth/refresh',{cookie:one.cookie.split(';')[0]})).status,429);
 assert.equal((await request(store,'/auth/refresh',{cookie:two.cookie.split(';')[0]})).status,200);
});
await test('forged client headers cannot bypass login IP quota',async()=>{
 const store=setup();
 for(let i=0;i<35;i++)assert.equal((await request(store,'/auth/login',{body:{email:`missing${i}@example.test`,password:'incorrect'},headers:{'cf-connecting-ip':`192.0.2.${i+20}`,'x-real-ip':`198.51.100.${i}`,'x-forwarded-for':`203.0.113.${i}`}})).status,401);
 assert.equal((await request(store,'/auth/login',{body:{email:'new@example.test',password:'incorrect'},headers:{'cf-connecting-ip':'8.8.8.8'}})).status,429);
});
await test('login email quota remains effective across changing IPs',async()=>{
 const store=setup();for(let i=0;i<10;i++)assert.equal((await request(store,'/auth/login',{body:{email:'same@example.test',password:'incorrect'},config:{...cfg,clientIp:`192.0.2.${i}`}})).status,401);
 assert.equal((await request(store,'/auth/login',{body:{email:'SAME@example.test',password:'incorrect'},config:{...cfg,clientIp:'198.51.100.1'}})).status,429);
});
await test('Express adapter strips proxy claims but preserves auth and Stripe raw-byte headers',()=>{
 const h=adapterHeaders({'cf-connecting-ip':'spoof','cf-connecting-ipv6':'spoof','x-real-ip':'spoof','true-client-ip':'spoof',forwarded:'for=spoof','x-forwarded-for':'spoof','x-forwarded-host':'spoof',authorization:'Bearer token','stripe-signature':'t=1,v1=abc',cookie:'valence_refresh=token'});
 assert.deepEqual([...h.keys()].sort(),['authorization','cookie','stripe-signature']);
 const store=setup();assert.equal(createApp({config:cfg,storeFactory:()=>store}).get('trust proxy'),0);
 assert.equal(createApp({config:cfg,storeFactory:()=>store,trustProxy:1}).get('trust proxy'),1);
});
