import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/api.mjs';
import {digest} from '../shared/auth.js';
import {handleApi} from '../shared/api.js';
import {createSessionClient} from '../client/src/lib/session.js';
await test('valid registration/login use normalized email, buyer role and safe user response',async()=>{
 const f=fixture();const r=await f.call('/auth/register',{method:'POST',body:{...f.registration,email:' Buyer@Example.Test '}});
 assert.equal(r.status,200);assert.equal(r.data.user.email,'buyer@example.test');assert.equal(r.data.user.role,'buyer');assert.equal(r.data.user.passwordHash,undefined);assert.match(r.cookie,/valence_refresh=/);
 assert.equal((await f.call('/auth/login',{method:'POST',body:{email:'BUYER@example.test',password:f.registration.password}})).status,200);f.close();
});
await test('known-user wrong password, duplicate email, weak password and empty fields have explicit errors',async()=>{
 const f=fixture();await f.call('/auth/register',{method:'POST',body:f.registration});
 let r=await f.call('/auth/login',{method:'POST',body:{email:f.registration.email,password:'wrong-password'}});assert.equal(r.status,401);assert.match(r.data.message,/Email or password is incorrect/);
 r=await f.call('/auth/register',{method:'POST',body:f.registration});assert.equal(r.status,409);assert.match(r.data.message,/already exists/);
 r=await f.call('/auth/register',{method:'POST',body:{...f.registration,email:'weak@example.test',password:'short'}});assert.equal(r.status,400);assert.match(r.data.message,/12 characters/);
 for(const path of ['/auth/login','/auth/register','/auth/forgot-password','/auth/reset-password'])assert.equal((await f.call(path,{method:'POST',body:{}})).status,400);f.close();
});
await test('forgot-password hides account existence and never exposes production reset tokens',async()=>{
 const f=fixture();await f.call('/auth/register',{method:'POST',body:f.registration});
 const existing=await f.call('/auth/forgot-password',{method:'POST',body:{email:f.registration.email}}),missing=await f.call('/auth/forgot-password',{method:'POST',body:{email:'absent@example.test'}});
 assert.deepEqual(existing.data,missing.data);assert.equal(existing.data.demoResetUrl,undefined);assert.equal(f.emails.length,1);
 const cfg={...f.config,notifications:undefined};await f.call('/auth/forgot-password',{method:'POST',body:{email:f.registration.email},cfg});
 const outbox=await f.store.list('Notification');assert.equal(outbox[0].deliveryStatus,'provider-not-configured');assert.ok(!JSON.stringify(outbox).includes('resetUrl'));f.close();
});
await test('reset validates token/strength, rejects expiry and reuse, and revokes old sessions',async()=>{
 const f=fixture();const user=await f.call('/auth/register',{method:'POST',body:f.registration});
 await f.call('/auth/forgot-password',{method:'POST',body:{email:f.registration.email}});let token=new URL(f.emails[0].resetUrl).searchParams.get('token');
 assert.equal((await f.call('/auth/reset-password',{method:'POST',body:{token,password:'weak'}})).status,400);
 const reset=await f.store.get('Reset',await digest(token));await f.store.commit([{kind:'Reset',doc:{...reset,expiresAt:'2000-01-01T00:00:00.000Z'}}]);
 assert.equal((await f.call('/auth/reset-password',{method:'POST',body:{token,password:'New-valid-password-123!'}})).status,400);
 await f.call('/auth/forgot-password',{method:'POST',body:{email:f.registration.email}});token=new URL(f.emails[1].resetUrl).searchParams.get('token');
 const body={token,password:'New-valid-password-123!'};assert.equal((await f.call('/auth/reset-password',{method:'POST',body})).status,200);
 assert.equal((await f.call('/auth/reset-password',{method:'POST',body})).status,400);assert.equal((await f.call('/me',{token:user.data.accessToken})).status,401);assert.equal((await f.call('/auth/refresh',{method:'POST',cookie:user.cookie})).status,401);
 assert.equal((await f.call('/auth/login',{method:'POST',body:{email:f.registration.email,password:f.registration.password}})).status,401);
 assert.equal((await f.call('/auth/login',{method:'POST',body:{email:f.registration.email,password:body.password}})).status,200);f.close();
});
await test('logout invalidates both the access token and refresh cookie',async()=>{
 const f=fixture(),user=await f.call('/auth/register',{method:'POST',body:f.registration});
 assert.equal((await f.call('/auth/logout',{method:'POST',cookie:user.cookie})).status,200);assert.equal((await f.call('/me',{token:user.data.accessToken})).status,401);assert.equal((await f.call('/auth/refresh',{method:'POST',cookie:user.cookie})).status,401);f.close();
});
function browserFixture(f){
 let cookie='',queue=Promise.resolve(),calls=0;
 const lock={request(name,task){const result=queue.then(task);queue=result.catch(()=>{});return result;}};
 const fetcher=async(url,options)=>{calls++;const headers=new Headers(options.headers);headers.set('Origin',f.config.FRONTEND_ORIGIN);if(cookie)headers.set('Cookie',cookie);
  const response=await handleApi(new Request('http://localhost:5173'+url,{...options,headers}),f.store,f.config);
  const c=response.headers.get('set-cookie');if(c)cookie=c.split(';')[0];return response;
 };
 return {client:()=>createSessionClient({base:'/api',fetcher,locks:()=>lock}),get calls(){return calls;},get cookie(){return cookie;}};
}
await test('reload and concurrent tabs rotate sequentially against the SQLite API without session replay',async()=>{
 const f=fixture(),browser=browserFixture(f),first=browser.client();await first.signin('/auth/register',f.registration);
 const reloaded=browser.client();assert.equal(reloaded.getToken(),null);assert.equal((await reloaded.refresh()).user.email,f.registration.email);
 const second=browser.client();for(let i=0;i<10;i++){const results=await Promise.all([reloaded.refresh(),second.refresh()]);assert.ok(results.every(r=>r.user.email===f.registration.email));}
 assert.equal((await f.call('/me',{token:second.getToken()})).status,200);assert.ok((await f.store.list('Session')).every(s=>!s.revoked));
 const before=browser.calls;await Promise.all([first.refresh(),first.refresh(),first.refresh()]);assert.equal(browser.calls-before,1);f.close();
});
await test('refresh 429/network errors preserve the in-memory token; only 401 ends the session',async()=>{
 let mode=429;const client=createSessionClient({base:'/api',fetcher:async()=>{if(mode===0)throw new Error('Network unavailable');return new Response(JSON.stringify({message:'Please retry.'}),{status:mode});}});
 client.setToken('existing-memory-token');await assert.rejects(client.refresh(),{status:429});assert.equal(client.getToken(),'existing-memory-token');
 mode=0;await assert.rejects(client.refresh(),/Network unavailable/);assert.equal(client.getToken(),'existing-memory-token');mode=401;assert.equal(await client.refresh(),null);assert.equal(client.getToken(),null);
});
