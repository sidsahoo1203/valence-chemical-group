import {z} from 'zod';
import * as S from './schemas.js';
import {estimate} from './catalog.js';
import {uid,now,digest,safeUser,hashPassword,checkPassword,newSession,authenticate,verify,getRefresh,refreshCookie} from './auth.js';
import {paymentProvider,notifyReset,storeUpload,readCloudinaryFile,ServiceError} from './providers.js';
import {clean,fail,required,owns,initializeDemo,cartView,reserveCart,markPaid,cancelOrder,convertQuote} from './domain.js';
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const sessionResponse=s=>json(s.body,200,{'Set-Cookie':s.cookie});
const update=doc=>({...doc,updatedAt:now()});
async function payload(request,schema){let raw;try{raw=await request.json();}catch{fail('Send a valid JSON request.');}return schema.parse(raw);}
export async function handleApi(request,store,config){
 const requestId=uid();
 try{
  if(request.body){
   const max=new URL(request.url).pathname==='/api/uploads'?11*1024*1024:1024*1024;
   const reader=request.body.getReader(),chunks=[];let size=0;
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();fail('Request exceeds the size limit.',413);}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   request=new Request(request,{body:bytes});
  }
  const response=await dispatch(request,store,config);
  const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');headers.set('X-Request-ID',requestId);headers.set('X-Frame-Options','SAMEORIGIN');
  return new Response(response.body,{status:response.status,headers});
 }catch(e){
  if(e instanceof z.ZodError)return json({message:e.issues.map(x=>(x.path.join('.')?x.path.join('.')+': ':'')+x.message).join(' '),fields:e.flatten().fieldErrors,requestId},400);
  const status=e.status||500;if(status>=500)console.error(JSON.stringify({requestId,error:e.name,status,message:config.demo?e.message:'Internal service error'}));
  return json({message:status>=500?'The service is temporarily unavailable. Please retry.':e.message,requestId},status);
 }
}
async function dispatch(request,store,config){
 const url=new URL(request.url),path=url.pathname.replace(/\/$/,''),method=request.method,ip=config.clientIp||'unknown';
 const write=!['GET','HEAD','OPTIONS'].includes(method),isWebhook=path==='/api/webhooks/stripe';
 if(write&&!isWebhook){if(request.headers.get('X-Valence-Client')!=='web')fail('Missing request verification header.',403);const origin=request.headers.get('origin');if(origin&&origin!==config.FRONTEND_ORIGIN)fail('Origin is not allowed.',403);}
 if(Number(request.headers.get('content-length')||0)>11*1024*1024)fail('Request is too large.',413);
 if(path==='/api/health'){await store.get('Meta','health');return json({ok:true,service:'valence-api',mode:config.demo?'demo':'production',timestamp:now()});}
 if(config.demo)await initializeDemo(store);
 if(path==='/api/config')return json({demo:config.demo,currency:'USD',paymentProvider:config.demo?'demo':'stripe',paymentsConfigured:config.demo||!!config.STRIPE_SECRET_KEY,uploadsConfigured:!!(config.bucket||config.CLOUDINARY_CLOUD_NAME),emailConfigured:!!config.notifications?.sendReset});
 if(['/api/auth/login','/api/auth/register','/api/auth/forgot-password','/api/auth/reset-password','/api/demo/session'].includes(path))if(!await store.rate('auth:'+ip,35,900))fail('Too many authentication attempts. Try again in 15 minutes.',429);
 if(path==='/api/demo/session'&&method==='POST'){
  if(!config.demo||!config.demoIdentity)fail('Not found.',404);const {role}=await payload(request,z.object({role:z.literal('buyer')}).strict());const user=await required(store,'User','demo-'+role);return sessionResponse(await newSession(store,user,config));
 }
 if(path==='/api/auth/register'&&method==='POST'){
  const data=await payload(request,S.register);if(await store.get('Email',data.email))fail('An account with this email already exists.',409);
  const {password,...details}=data;const user={...details,id:uid(),role:'buyer',passwordHash:await hashPassword(password),createdAt:now(),updatedAt:now()};
  await store.commit([{kind:'User',doc:user},{kind:'Email',doc:{id:data.email,buyer:user.id}}]);return sessionResponse(await newSession(store,user,config));
 }
 if(path==='/api/auth/login'&&method==='POST'){
  const data=await payload(request,S.login);if(!await store.rate('login:'+await digest(data.email),10,900))fail('Too many login attempts. Try again in 15 minutes.',429);
  const email=await store.get('Email',data.email),user=email?await store.get('User',email.buyer):null;
  const valid=user?await checkPassword(data.password,user.passwordHash):false;
  if(!valid)fail('Email or password is incorrect.',401);return sessionResponse(await newSession(store,user,config));
 }
 if(path==='/api/auth/refresh'&&method==='POST'){
  const token=getRefresh(request),p=token?await verify(token,'refresh',config):null;
  if(!p){if(!await store.rate('refresh-invalid:'+ip,60,900))fail('Too many invalid session requests. Try again later.',429);fail('Please sign in again.',401);}
  if(!await store.rate('refresh:'+p.sid,900,900))fail('Too many session refreshes. Please wait and retry.',429);
  const session=await store.get('Session',p.sid);if(!session||session.revoked||session.expiresAt<now()||session.buyer!==p.sub)fail('Please sign in again.',401);
  if(session.refreshHash!==await digest(token)){await store.commit([{kind:'Session',doc:{...session,revoked:true}}]);fail('Session reuse detected. Please sign in again.',401);}
  const user=await required(store,'User',p.sub);if(config.demo&&user.id==='demo-admin')fail('Use a configured staff account to sign in.',401);if(p.ver!==(user.authVersion||0))fail('Please sign in again.',401);return sessionResponse(await newSession(store,user,config,session));
 }
 if(path==='/api/auth/logout'&&method==='POST'){
  const token=getRefresh(request),p=token?await verify(token,'refresh',config):null;if(p){const session=await store.get('Session',p.sid);if(session)await store.commit([{kind:'Session',doc:{...session,revoked:true}}]);}
  return json({ok:true},200,{'Set-Cookie':refreshCookie('',config,true)});
 }
 if(path==='/api/auth/forgot-password'&&method==='POST'){
  const {email}=await payload(request,z.object({email:S.email}).strict());const ref=await store.get('Email',email),user=ref?await store.get('User',ref.buyer):null;let resetUrl;
  if(user){const token=uid()+uid(),id=await digest(token);await store.commit([{kind:'Reset',doc:{id,buyer:user.id,expiresAt:new Date(Date.now()+1800000).toISOString(),used:false,createdAt:now()}}]);resetUrl=await notifyReset(store,user,token,config);}
  return json({message:'If this account exists, a password reset has been requested.',...(resetUrl?{demoResetUrl:resetUrl}:{})});
 }
 if(path==='/api/auth/reset-password'&&method==='POST'){
  const {token,password}=await payload(request,z.object({token:z.string().min(32).max(200),password:S.password}).strict());const reset=await store.get('Reset',await digest(token));if(!reset||reset.used||reset.expiresAt<now())fail('This reset link is invalid or expired.');
  const user=await required(store,'User',reset.buyer),sessions=await store.list('Session',user.id);user.passwordHash=await hashPassword(password);user.authVersion=(user.authVersion||0)+1;
  await store.commit([{kind:'User',doc:update(user)},{kind:'Reset',doc:{...reset,used:true}},...sessions.filter(s=>!s.revoked).map(doc=>({kind:'Session',doc:{...doc,revoked:true}}))]);return json({message:'Password updated. Sign in with your new password.'});
 }
 if(path==='/api/products'&&method==='GET'){
  const q=(url.searchParams.get('q')||'').slice(0,150).toLowerCase(),category=url.searchParams.get('category');const products=await store.list('Product');
  return json(products.filter(p=>!p.archived&&(!category||p.category===category)&&(!q||(p.name+' '+p.casNumber+' '+p.grade).toLowerCase().includes(q))).map(clean));
 }
 let match;
 if((match=path.match(/^\/api\/products\/([^/]+)$/))&&method==='GET'){const product=await required(store,'Product',S.id.parse(match[1]));if(product.archived)fail('Product not found.',404);return json(clean(product));}
 if(path==='/api/estimate'&&method==='POST'){const line=await payload(request,S.cartLine);const p=await required(store,'Product',line.productId);if(p.archived)fail('Product unavailable.',404);return json(estimate(p,line.packagingType,line.quantity));}
 if(isWebhook&&method==='POST'){
  const raw=await request.text();if(raw.length>1e6)fail('Webhook too large.',413);const event=await paymentProvider(config).webhook(raw,request.headers.get('stripe-signature'));
  if(await store.get('Webhook',event.id))return json({received:true});
  const session=event.data?.object,id=session?.metadata?.orderId;if(!id||session.metadata.scope!==config.scope)return json({received:true});
  const order=await store.get('Order',id);if(!order)return json({received:true});
  if(order.paymentProvider!=='stripe'||order.paymentReference!==session.id)fail('Payment reference does not match.',409);
  if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&session.payment_status==='paid'){
   if(session.currency!=='usd'||session.amount_total!==order.totalCents)fail('Payment amount does not match.',400);await markPaid(store,id,session.id,false,event.id);
  }else if(['checkout.session.expired','checkout.session.async_payment_failed'].includes(event.type)&&order.paymentStatus==='unpaid')await cancelOrder(store,order,'Payment session expired or failed.');
  return json({received:true});
 }
 const auth=await authenticate(request,store,config),user=auth?.user;
 // File reads allow only public catalog-linked documents or the owner / staff for private RFQ files.
 if((match=path.match(/^\/api\/files\/([^/]+)$/))&&method==='GET'){
  const file=await required(store,'File',S.id.parse(match[1]));let permitted=user&&(file.buyer===user.id||user.role==='admin');
  if(!permitted&&file.kind!=='attachment'){const products=await store.list('Product');permitted=products.some(p=>!p.archived&&[p.imageUrl,p.sdsUrl,p.coaUrl].includes('/api/files/'+file.id));}
  if(!permitted)fail('Document not found.',404);
  const headers={'Content-Type':file.mime,'Content-Disposition':(file.kind==='image'?'inline':'attachment')+'; filename="'+file.name+'"','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=300'};
  if(config.bucket){const object=await config.bucket.get(file.key);if(!object)fail('Document not found.',404);return new Response(object.body,{headers});}
  const response=await readCloudinaryFile(file,config);if(!response.ok)fail('Document unavailable.',503);return new Response(response.body,{headers});
 }
 if(path==='/api/rfqs'&&method==='POST'){
  if(!await store.rate('rfq:'+ip,15,3600))fail('Too many requests. Try again later.',429);const data=await payload(request,S.rfq);
  if(data.attachmentIds.length&&!user)fail('Sign in to attach documents.',401);
  for(const id of data.attachmentIds){const file=await required(store,'File',id);if(file.buyer!==user.id||file.kind!=='attachment')fail('Invalid attachment.',400);}
  const doc={...data,id:uid(),buyer:user?.id||'',number:'RFQ-'+uid().slice(0,8).toUpperCase(),status:'submitted',createdAt:now(),updatedAt:now()};await store.commit([{kind:'RFQ',doc}]);return json(clean(doc),201);
 }
 if(path==='/api/contact'&&method==='POST'){
  if(!await store.rate('contact:'+ip,10,3600))fail('Too many messages. Try again later.',429);
  const data=await payload(request,z.object({name:z.string().trim().min(1).max(100),email:S.email,companyName:z.string().trim().min(1).max(150),message:z.string().trim().min(10).max(5000)}).strict());const doc={...data,id:uid(),status:'new',createdAt:now()};await store.commit([{kind:'Contact',doc}]);return json({id:doc.id,message:'Your enquiry has been saved for the sales team.'},201);
 }
 if(!user)fail('Sign in to continue.',401);
 if(path.startsWith('/api/admin/')&&user.role!=='admin')fail('Administrator access is required.',403);
 if(path==='/api/me'&&method==='GET')return json(safeUser(user));
 if(path==='/api/me'&&method==='PATCH'){const data=await payload(request,S.profile);const doc=update({...user,...data});await store.commit([{kind:'User',doc}]);return json(safeUser(doc));}
 if(path==='/api/addresses'&&method==='GET')return json((await store.list('Address',user.id)).map(clean));
 if(path==='/api/addresses'&&method==='POST'){const data=await payload(request,S.address);const doc={...data,id:uid(),buyer:user.id,createdAt:now()};await store.commit([{kind:'Address',doc}]);return json(clean(doc),201);}
 if((match=path.match(/^\/api\/addresses\/([^/]+)$/))){const doc=await required(store,'Address',S.id.parse(match[1]));if(doc.buyer!==user.id)fail('Address not found.',404);if(method==='DELETE'){await store.commit([{kind:'Address',doc,remove:true}]);return json({ok:true});}if(method==='PATCH'){const data=await payload(request,S.address);await store.commit([{kind:'Address',doc:{...doc,...data}}]);return json({...clean(doc),...data});}}
 if(path==='/api/cart'&&method==='GET')return json(await cartView(store,user.id));
 if(path==='/api/cart/items'&&method==='POST'){
  const line=await payload(request,S.cartLine),p=await required(store,'Product',line.productId),pack=p.packagingOptions.find(x=>x.type===line.packagingType);
  if(p.archived||!pack||['made-to-order','out-of-stock'].includes(p.stockStatus))fail('This selection is only available by quote.');
  const cart=await store.get('Cart',user.id)||{id:user.id,buyer:user.id,lines:[]};const existing=cart.lines.find(x=>x.productId===line.productId&&x.packagingType===line.packagingType);const quantity=line.quantity+(existing?.quantity||0);if(quantity>pack.stockUnits)fail('The requested quantity exceeds available stock. Please request a quote.');
  if(existing)existing.quantity=quantity;else{if(cart.lines.length>=50)fail('A cart can contain up to 50 lines.');cart.lines.push(line);}await store.commit([{kind:'Cart',doc:update(cart)}]);return json(await cartView(store,user.id));
 }
 if(path==='/api/cart/items'&&['PATCH','DELETE'].includes(method)){
  const data=await payload(request,method==='DELETE'?S.cartLine.omit({quantity:true}):S.cartLine);const cart=await required(store,'Cart',user.id);const i=cart.lines.findIndex(x=>x.productId===data.productId&&x.packagingType===data.packagingType);if(i<0)fail('Cart item not found.',404);
  if(method==='DELETE')cart.lines.splice(i,1);else{const p=await required(store,'Product',data.productId),pack=p.packagingOptions.find(x=>x.type===data.packagingType);if(!pack||data.quantity>pack.stockUnits)fail('Requested quantity exceeds stock.');cart.lines[i]=data;}
  await store.commit([{kind:'Cart',doc:update(cart)}]);return json(await cartView(store,user.id));
 }
 if(path==='/api/orders'&&method==='GET')return json((await store.list('Order',user.id)).map(clean));
 if(path==='/api/checkout'&&method==='POST'){
  const data=await payload(request,S.checkout);if(!config.demo&&!config.STRIPE_SECRET_KEY)fail('Payments are not yet configured. Please request a quote.',503);
  let order=data.orderId?await required(store,'Order',data.orderId):await reserveCart(store,user,data,config);owns(order,user);
  if(order.orderStatus!=='pending'||order.paymentStatus!=='unpaid')fail('This order is no longer awaiting payment.',409);
  if(order.checkoutUrl||order.paymentReference?.startsWith('demo_'))return json({order:clean(order),checkoutUrl:order.checkoutUrl||null});
  order.shippingAddress=data.shippingAddress;order.paymentProvider=config.demo?'demo':'stripe';
  const result=await paymentProvider(config).create(order);order.paymentReference=result.reference;order.checkoutUrl=result.url;await store.commit([{kind:'Order',doc:update(order)}]);return json({order:clean(order),checkoutUrl:result.url});
 }
 if((match=path.match(/^\/api\/orders\/([^/]+)(?:\/(demo-pay|cancel))?$/))){
  const order=await required(store,'Order',S.id.parse(match[1]));owns(order,user);
  if(!match[2]&&method==='GET')return json(clean(order));
  if(match[2]==='demo-pay'&&method==='POST'){if(!config.demo||!config.demoIdentity)fail('Not found.',404);return json(await markPaid(store,order.id,'demo_'+order.id,true));}
  if(match[2]==='cancel'&&method==='POST'){if(order.orderStatus==='cancelled')return json(clean(order));if(order.paymentStatus!=='unpaid')fail('A paid order cannot be cancelled here.',409);if(order.paymentReference&&!config.demo)await paymentProvider(config).expire(order.paymentReference);return json(await cancelOrder(store,await required(store,'Order',order.id),'Cancelled by buyer.'));}
 }
 if(path==='/api/rfqs'&&method==='GET')return json((await store.list('RFQ',user.id)).map(clean));
 if((match=path.match(/^\/api\/rfqs\/([^/]+)(?:\/(respond))?$/))){
  const rfq=await required(store,'RFQ',S.id.parse(match[1]));owns(rfq,user);
  if(!match[2]&&method==='GET'){const attachments=await Promise.all((rfq.attachmentIds||[]).map(x=>store.get('File',x)));return json({...clean(rfq),attachments:attachments.filter(Boolean).map(clean)});}
  if(match[2]&&method==='POST'){const data=await payload(request,z.object({decision:z.enum(['accepted','declined']),shippingAddress:S.address.optional()}).strict());if(user.id!==rfq.buyer)fail('Only the buyer can respond to a quote.',403);
   if(data.decision==='accepted'){if(!data.shippingAddress)fail('A shipping address is required.');return json({order:await convertQuote(store,rfq,user,data.shippingAddress)});}
   if(rfq.status!=='quoted')fail('This quote is no longer open.',409);await store.commit([{kind:'RFQ',doc:update({...rfq,status:'declined'})}]);return json({status:'declined'});
  }
 }
 if(path==='/api/uploads'&&method==='POST'){
  if(!await store.rate('uploads:'+user.id,30,3600))fail('Upload limit reached. Try again later.',429);const form=await request.formData(),kind=z.enum(['image','sds','coa','attachment']).parse(form.get('kind'));if(kind!=='attachment'&&user.role!=='admin')fail('Administrator access is required.',403);const doc=await storeUpload(form.get('file'),kind,user,store,config);return json(clean(doc),201);
 }
 if(path==='/api/admin/metrics'&&method==='GET'){
  const [orders,rfqs,products,buyers,contacts]=await Promise.all(['Order','RFQ','Product','User','Contact'].map(k=>store.list(k)));return json({revenueCents:orders.filter(o=>['paid','demo-paid'].includes(o.paymentStatus)).reduce((s,o)=>s+o.totalCents,0),orderCount:orders.length,newRfqs:rfqs.filter(r=>r.status==='submitted').length,newEnquiries:contacts.filter(c=>(c.status||'new')==='new').length,pendingRfqs:rfqs.filter(r=>['submitted','under-review'].includes(r.status)).length,buyerCount:buyers.filter(u=>u.role==='buyer').length,lowStock:products.filter(p=>!p.archived&&(p.stockStatus==='low-stock'||p.packagingOptions.some(x=>x.stockUnits<3))).map(clean),recentOrders:orders.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,6).map(clean)});
 }
 if(path==='/api/admin/products'&&method==='GET')return json((await store.list('Product')).filter(p=>!p.archived).map(clean));
 if(path==='/api/admin/products'&&method==='POST'){const data=await payload(request,S.product);await validateProductFiles(data,user,store);if(await store.get('Product',data.slug))fail('This product slug already exists.',409);const doc={...data,id:data.slug,archived:false,createdAt:now(),updatedAt:now()};await store.commit([{kind:'Product',doc}]);return json(clean(doc),201);}
 if((match=path.match(/^\/api\/admin\/products\/([^/]+)$/))){const doc=await required(store,'Product',S.id.parse(match[1]));if(method==='PATCH'){const data=await payload(request,S.product);if(data.slug!==doc.slug)fail('The product URL cannot change after creation.');await validateProductFiles(data,user,store);await store.commit([{kind:'Product',doc:update({...doc,...data})}]);return json({...clean(doc),...data});}if(method==='DELETE'){await store.commit([{kind:'Product',doc:update({...doc,archived:true})}]);return json({ok:true});}}
 if(path==='/api/admin/orders'&&method==='GET'){const status=url.searchParams.get('status');return json((await store.list('Order')).filter(o=>!status||o.orderStatus===status).map(clean));}
 if((match=path.match(/^\/api\/admin\/orders\/([^/]+)$/))&&method==='PATCH'){
  const data=await payload(request,S.orderUpdate),order=await required(store,'Order',S.id.parse(match[1]));const next={paid:'processing',processing:'shipped',shipped:'delivered'};
  if(!['paid','demo-paid'].includes(order.paymentStatus))fail('Payment must be confirmed before fulfillment.',409);
  if(data.orderStatus!==order.orderStatus&&next[order.orderStatus]!==data.orderStatus)fail('Order status must advance one step at a time.',409);
  if(data.orderStatus==='shipped'&&!data.trackingNumber)fail('Add a tracking reference before shipping.');
  if(data.orderStatus!==order.orderStatus)order.history.push({status:data.orderStatus,at:now()});const doc=update({...order,...data});await store.commit([{kind:'Order',doc}]);return json(clean(doc));
 }
 if(path==='/api/admin/rfqs'&&method==='GET'){const status=url.searchParams.get('status');return json((await store.list('RFQ')).filter(r=>!status||r.status===status).map(clean));}
 if((match=path.match(/^\/api\/admin\/rfqs\/([^/]+)\/(quote|status)$/))&&method==='POST'){
  const doc=await required(store,'RFQ',S.id.parse(match[1]));if(!['submitted','under-review','quoted'].includes(doc.status))fail('This request is closed.',409);
  if(match[2]==='quote'){const data=await payload(request,S.quote);doc.quote={...data,quotedAt:now()};doc.status='quoted';}
  else{const {status}=await payload(request,z.object({status:z.enum(['under-review','declined'])}).strict());if(status==='under-review'&&doc.status!=='submitted')fail('This request is already being handled.',409);doc.status=status;}
  await store.commit([{kind:'RFQ',doc:update(doc)}]);return json(clean(doc));
 }
 if(path==='/api/admin/buyers'&&method==='GET')return json((await store.list('User')).filter(u=>u.role==='buyer').map(safeUser));
 if((match=path.match(/^\/api\/admin\/buyers\/([^/]+)$/))&&method==='GET'){const buyer=await required(store,'User',S.id.parse(match[1]));const [orders,rfqs]=await Promise.all([store.list('Order',buyer.id),store.list('RFQ',buyer.id)]);return json({buyer:safeUser(buyer),orders:orders.map(clean),rfqs:rfqs.map(clean)});}
 if(path==='/api/admin/contacts'&&method==='GET'){
  const raw=url.searchParams.get('status'),status=raw?z.enum(['new','contacted','closed']).parse(raw):null;
  return json((await store.list('Contact')).map(c=>({...clean(c),status:c.status||'new'})).filter(c=>!status||c.status===status));
 }
 if((match=path.match(/^\/api\/admin\/contacts\/([^/]+)$/))&&method==='PATCH'){
  const {status}=await payload(request,z.object({status:z.enum(['new','contacted','closed'])}).strict());
  const doc=await required(store,'Contact',S.id.parse(match[1]));const saved=update({...doc,status,updatedBy:user.id});
  await store.commit([{kind:'Contact',doc:saved}]);return json(clean(saved));
 }
 fail('Page not found.',404);
}
async function validateProductFiles(product,user,store){for(const key of ['imageUrl','sdsUrl','coaUrl'])if(product[key]){const match=product[key].match(/^\/api\/files\/([a-zA-Z0-9_-]+)$/);if(!match)fail('Use the upload control for product assets.');const doc=await required(store,'File',match[1]);if(doc.kind!==({imageUrl:'image',sdsUrl:'sds',coaUrl:'coa'}[key]))fail('Incorrect document type.');}if(product.approved&&(!product.sdsUrl||!product.coaUrl))fail('Upload the approved SDS and COA before approving this product.');}
