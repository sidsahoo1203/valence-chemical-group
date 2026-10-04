import {digest,uid,now} from './auth.js';
export class ServiceError extends Error {constructor(message,status=503){super(message);this.status=status;}}
export function paymentProvider(config){
  if(config.demo)return {name:'demo',async create(order){return {reference:'demo_'+order.id,url:null};},async expire(){},async webhook(){throw new ServiceError('Stripe is disabled in the demo.',404);}};
  const request=async(path,body,key)=>{if(!config.STRIPE_SECRET_KEY)throw new ServiceError('Payments are not configured. Please request a quote.');const r=await fetch('https://api.stripe.com/v1/'+path,{method:'POST',headers:{Authorization:'Bearer '+config.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded',...(key?{'Idempotency-Key':key}:{})},body:new URLSearchParams(body)});const data=await r.json();if(!r.ok)throw new ServiceError('The payment provider is unavailable. Try again shortly.');return data;};
  return {name:'stripe',async create(order){
    const params={mode:'payment',success_url:config.FRONTEND_ORIGIN+'/orders/'+order.id+'?payment=returned',cancel_url:config.FRONTEND_ORIGIN+'/orders/'+order.id+'?payment=cancelled',client_reference_id:order.id,'metadata[orderId]':order.id,'metadata[scope]':config.scope,'payment_intent_data[metadata][orderId]':order.id,expires_at:String(Math.floor(new Date(order.createdAt).getTime()/1000)+3600)};
    // Snapshot total already includes negotiated/product discounts and quoted freight.
    params['line_items[0][price_data][currency]']='usd';params['line_items[0][price_data][unit_amount]']=String(order.totalCents);params['line_items[0][price_data][product_data][name]']='Valence order '+order.number;params['line_items[0][quantity]']='1';
    const s=await request('checkout/sessions',params,'checkout-'+order.id);return {reference:s.id,url:s.url};
  },async expire(reference){if(reference)await request('checkout/sessions/'+encodeURIComponent(reference)+'/expire',{},'expire-'+reference);},async webhook(raw,signature){
    if(!config.STRIPE_WEBHOOK_SECRET)throw new ServiceError('Webhook is not configured.');
    const parts=(signature||'').split(',').map(p=>p.split('=')),stamp=parts.find(p=>p[0]==='t')?.[1],hashes=parts.filter(p=>p[0]==='v1').map(p=>p[1]);
    if(!stamp||Math.abs(Date.now()/1000-Number(stamp))>300)throw new ServiceError('Invalid webhook signature.',400);
    const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.STRIPE_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const h=[...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(stamp+'.'+raw)))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(!hashes.some(v=>{if(v.length!==h.length)return false;let d=0;for(let i=0;i<h.length;i++)d|=v.charCodeAt(i)^h.charCodeAt(i);return d===0;}))throw new ServiceError('Invalid webhook signature.',400);
    return JSON.parse(raw);
  }};
}
export async function notifyReset(store,user,token,config){
  // Replace this provider with email delivery. Production outbox deliberately excludes the reset secret.
  const resetUrl=config.FRONTEND_ORIGIN+'/reset-password?token='+encodeURIComponent(token);
  if(config.notifications?.sendReset)await config.notifications.sendReset({email:user.email,resetUrl});
  else await store.commit([{kind:'Notification',doc:{id:uid(),buyer:user.id,type:'password-reset',deliveryStatus:'provider-not-configured',createdAt:now()}}]);
  return config.demo?resetUrl:undefined;
}
export async function storeUpload(file,kind,user,store,config){
  if(!file||typeof file.arrayBuffer!=='function'||file.size<1||file.size>10*1024*1024)throw new ServiceError('Choose a file between 1 byte and 10 MB.',400);
  const allowed=kind==='image'?['image/jpeg','image/png','image/webp']:['application/pdf'];
  if(!allowed.includes(file.type))throw new ServiceError(kind==='image'?'Use a JPEG, PNG or WebP image.':'Use a PDF document.',400);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const magic=file.type==='application/pdf'?new TextDecoder().decode(bytes.slice(0,5))==='%PDF-':file.type==='image/png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:file.type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:new TextDecoder().decode(bytes.slice(0,4))==='RIFF'&&new TextDecoder().decode(bytes.slice(8,12))==='WEBP';
  if(!magic)throw new ServiceError('The file contents do not match its type.',400);
  const id=uid(),name=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120),key=config.scope+'/'+id+'/'+name;
  let url='';
  if(config.bucket){await config.bucket.put(key,bytes,{httpMetadata:{contentType:file.type,contentDisposition:'attachment; filename="'+name+'"'}});url='/api/files/'+id;}
  else {
    if(!config.CLOUDINARY_CLOUD_NAME||!config.CLOUDINARY_API_KEY||!config.CLOUDINARY_API_SECRET)throw new ServiceError('File storage is not configured.');
    const timestamp=Math.floor(Date.now()/1000),folder='valence/'+config.scope,publicId=id;
    const string='folder='+folder+'&public_id='+publicId+'&timestamp='+timestamp+'&type=authenticated'+config.CLOUDINARY_API_SECRET;
    const signature=[...new Uint8Array(await crypto.subtle.digest('SHA-1',new TextEncoder().encode(string)))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const form=new FormData();form.set('file',file);form.set('folder',folder);form.set('public_id',publicId);form.set('timestamp',String(timestamp));form.set('type','authenticated');form.set('api_key',config.CLOUDINARY_API_KEY);form.set('signature',signature);
    const r=await fetch('https://api.cloudinary.com/v1_1/'+encodeURIComponent(config.CLOUDINARY_CLOUD_NAME)+'/auto/upload',{method:'POST',body:form});if(!r.ok)throw new ServiceError('File upload failed. Please retry.');const d=await r.json();url='/api/files/'+id;
    // Private asset fetched through the API using a short-lived signed download URL.
    config._uploadRemote={publicId:d.public_id,format:d.format,resourceType:d.resource_type};
  }
  const doc={id,buyer:user.id,name,mime:file.type,size:file.size,kind,key,url,remote:config._uploadRemote||null,createdAt:now()};delete config._uploadRemote;
  await store.commit([{kind:'File',doc}]);return doc;
}
export async function readCloudinaryFile(doc,config){
  const timestamp=Math.floor(Date.now()/1000),{publicId,format,resourceType}=doc.remote;
  const params={...(format?{format}:{}),public_id:publicId,timestamp:String(timestamp),type:'authenticated'};
  const input=Object.keys(params).sort().map(k=>k+'='+params[k]).join('&')+config.CLOUDINARY_API_SECRET;
  const sig=[...new Uint8Array(await crypto.subtle.digest('SHA-1',new TextEncoder().encode(input)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const q=new URLSearchParams({...params,api_key:config.CLOUDINARY_API_KEY,signature:sig});
  return fetch('https://api.cloudinary.com/v1_1/'+encodeURIComponent(config.CLOUDINARY_CLOUD_NAME)+'/'+resourceType+'/download?'+q);
}
