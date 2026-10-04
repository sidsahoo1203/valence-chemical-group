import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/api.mjs';
import {hashPassword,now,newSession} from '../shared/auth.js';
async function staff(f){const user={id:'staff',name:'Staff',email:'staff@example.test',role:'admin',companyName:'Valence',passwordHash:await hashPassword('Staff-test-password-123!'),createdAt:now()};await f.store.commit([{kind:'User',doc:user},{kind:'Email',doc:{id:user.email,buyer:user.id}}]);return (await f.call('/auth/login',{method:'POST',body:{email:user.email,password:'Staff-test-password-123!'}})).data;}
const rfq={productName:'Acetone',casNumber:'67-64-1',amount:5000,unit:'L',targetPurity:99.5,deliveryRegion:'Chennai',notes:'Guest delivery requirement',contactName:'Guest Buyer',contactEmail:'guest@example.test',companyName:'Guest Works',attachmentIds:[]};
const contact={name:'Sales Prospect',companyName:'Prospect Works',email:'prospect@example.test',message:'Please contact us about supply availability.'};
await test('guest and buyer public submissions reach staff queues with exact fields and new counts',async()=>{
 const f=fixture(),admin=await staff(f),buyer=await f.call('/auth/register',{method:'POST',body:f.registration});
 const guest=await f.call('/rfqs',{method:'POST',body:rfq}),own=await f.call('/rfqs',{method:'POST',body:{...rfq,contactEmail:f.registration.email,notes:'Buyer requirement'},token:buyer.data.accessToken}),message=await f.call('/contact',{method:'POST',body:contact});
 assert.equal(guest.status,201);assert.equal(own.status,201);assert.equal(message.status,201);
 const queue=await f.call('/admin/rfqs',{token:admin.accessToken});assert.equal(queue.data.length,2);
 const saved=queue.data.find(r=>r.id===guest.data.id);for(const [key,value]of Object.entries(rfq))assert.deepEqual(saved[key],value);assert.equal(saved.buyer,'');
 const ownQueue=await f.call('/rfqs',{token:buyer.data.accessToken});assert.deepEqual(ownQueue.data.map(r=>r.id),[own.data.id]);
 const messages=await f.call('/admin/contacts',{token:admin.accessToken});for(const [key,value]of Object.entries(contact))assert.equal(messages.data[0][key],value);assert.equal(messages.data[0].status,'new');assert.ok(messages.data[0].createdAt);
 const metrics=await f.call('/admin/metrics',{token:admin.accessToken});assert.equal(metrics.data.newRfqs,2);assert.equal(metrics.data.newEnquiries,1);
 await f.call('/admin/rfqs/'+guest.data.id+'/status',{method:'POST',token:admin.accessToken,body:{status:'under-review'}});
 assert.equal((await f.call('/admin/metrics',{token:admin.accessToken})).data.newRfqs,1);
 assert.equal((await f.call('/admin/metrics',{token:admin.accessToken})).data.pendingRfqs,2);f.close();
});
await test('staff can review, quote and decline a guest RFQ without inventing a buyer account',async()=>{
 const f=fixture(),admin=await staff(f),r=await f.call('/rfqs',{method:'POST',body:rfq}),id=r.data.id;
 for(const [action,body,status]of [['status',{status:'under-review'},'under-review'],['quote',{priceCents:950000,leadTimeDays:7,notes:'Freight included'},'quoted'],['status',{status:'declined'},'declined']]){
  const response=await f.call('/admin/rfqs/'+id+'/'+action,{method:'POST',token:admin.accessToken,body});assert.equal(response.status,200);assert.equal(response.data.status,status);
 }
 const detail=await f.call('/rfqs/'+id,{token:admin.accessToken});assert.equal(detail.data.quote.priceCents,950000);assert.equal(detail.data.buyer,'');f.close();
});
await test('sales enquiry statuses persist, filter correctly and reject unauthorized or invalid changes',async()=>{
 const f=fixture(),admin=await staff(f),buyer=await f.call('/auth/register',{method:'POST',body:f.registration}),r=await f.call('/contact',{method:'POST',body:contact}),path='/admin/contacts/'+r.data.id;
 assert.equal((await f.call(path,{method:'PATCH',body:{status:'closed'}})).status,401);
 assert.equal((await f.call(path,{method:'PATCH',body:{status:'closed'},token:buyer.data.accessToken})).status,403);
 assert.equal((await f.call('/admin/contacts',{token:buyer.data.accessToken})).status,403);
 assert.equal((await f.call(path,{method:'PATCH',body:{status:'deleted'},token:admin.accessToken})).status,400);
 assert.equal((await f.call(path,{method:'PATCH',body:{status:'closed',message:'tampered'},token:admin.accessToken})).status,400);
 for(const status of ['contacted','closed','new']){
  const result=await f.call(path,{method:'PATCH',body:{status},token:admin.accessToken});assert.equal(result.status,200);assert.equal(result.data.status,status);assert.equal(result.data.message,contact.message);assert.ok(result.data.updatedAt);
  assert.equal((await f.call('/admin/contacts?status='+status,{token:admin.accessToken})).data[0].id,r.data.id);
  assert.equal((await f.call('/admin/metrics',{token:admin.accessToken})).data.newEnquiries,status==='new'?1:0);
 }
 assert.equal((await f.call('/admin/contacts/not-found',{method:'PATCH',body:{status:'closed'},token:admin.accessToken})).status,404);f.close();
});
await test('RFQ attachments are visible to staff and owner, hidden from guests and unrelated buyers',async()=>{
 const f=fixture(),admin=await staff(f),buyer=await f.call('/auth/register',{method:'POST',body:f.registration}),other=await f.call('/auth/register',{method:'POST',body:{...f.registration,email:'other@example.test'}});
 const file={id:'private-file',buyer:buyer.data.user.id,name:'specification.pdf',kind:'attachment',mime:'application/pdf',url:'/api/files/private-file',key:'private-file'};
 await f.store.commit([{kind:'File',doc:file}]);
 const r=await f.call('/rfqs',{method:'POST',body:{...rfq,attachmentIds:[file.id]},token:buyer.data.accessToken});assert.equal(r.status,201);
 const detail=await f.call('/rfqs/'+r.data.id,{token:admin.accessToken});assert.equal(detail.data.attachments[0].name,'specification.pdf');
 assert.equal((await f.call('/rfqs/'+r.data.id,{token:other.data.accessToken})).status,404);
 assert.equal((await f.call('/rfqs',{method:'POST',body:{...rfq,attachmentIds:[file.id]}})).status,401);f.close();
});
await test('demo auth permits buyer only and rejects existing legacy admin-demo sessions',async()=>{
 const f=fixture(),cfg={...f.config,demo:true,demoIdentity:'test-visitor'};
 assert.equal((await f.call('/demo/session',{method:'POST',body:{role:'admin'},cfg})).status,400);
 assert.equal((await f.call('/demo/session',{method:'POST',body:{role:'buyer'},cfg})).data.user.role,'buyer');
 const legacy={id:'demo-admin',name:'Old Demo Staff',role:'admin',email:'legacy@example.test'};await f.store.commit([{kind:'User',doc:legacy}]);const s=await newSession(f.store,legacy,cfg);
 assert.equal((await f.call('/admin/metrics',{token:s.body.accessToken,cfg})).status,401);
 assert.equal((await f.call('/auth/refresh',{method:'POST',cookie:s.cookie.split(';')[0],cfg})).status,401);f.close();
});
await test('real admin seeding is idempotent and never silently promotes an existing buyer',async()=>{
 const {seedDatabase}=await import('../server/scripts/seed-data.js');const f=fixture();const options={adminEmail:'owner@example.test',adminPassword:'Owner-test-password-123!'};
 let result=await seedDatabase(f.store,options);assert.deepEqual(result,{added:12,adminState:'created'});
 result=await seedDatabase(f.store,options);assert.deepEqual(result,{added:0,adminState:'existing'});
 assert.equal((await f.call('/auth/login',{method:'POST',body:{email:options.adminEmail,password:options.adminPassword}})).data.user.role,'admin');
 await f.call('/auth/register',{method:'POST',body:f.registration});await assert.rejects(seedDatabase(f.store,{...options,adminEmail:f.registration.email}),/No role was changed/);f.close();
});
