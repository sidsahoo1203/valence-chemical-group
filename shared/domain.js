import {seedProducts,estimate} from './catalog.js';
import {uid,now,hashPassword} from './auth.js';
import {ServiceError} from './providers.js';
export const fail=(message,status=400)=>{throw new ServiceError(message,status);};
export const clean=doc=>{if(!doc)return null;const {_v,...rest}=doc;return rest;};
export async function required(store,kind,id){const d=await store.get(kind,id);if(!d)fail('Record not found.',404);return d;}
export function owns(record,user){if(record.buyer!==user.id&&user.role!=='admin')fail('Record not found.',404);}
export async function initializeDemo(store){
 if(await store.get('Meta','seed-v1'))return;
 const passwordHash=await hashPassword(uid()+uid().slice(0,10));
 const buyer={id:'demo-buyer',name:'Alex Morgan',email:'buyer@valence.example',companyName:'Northstar Manufacturing',deliveryRegion:'Chicago, IL, United States',role:'buyer',passwordHash,createdAt:now()};
 const address={id:'demo-address',buyer:buyer.id,label:'Main facility',name:buyer.name,companyName:buyer.companyName,line1:'100 Example Industrial Way',line2:'Receiving bay 2',city:'Chicago',state:'IL',postalCode:'60601',country:'United States',phone:'+1 312 555 0100',createdAt:now()};
 const p=seedProducts[0],e=estimate(p,'drum',4);
 const order={id:'demo-delivered',buyer:buyer.id,number:'VCG-DEMO-1001',lines:[{productId:p.id,name:p.name,casNumber:p.casNumber,packagingType:'drum',packagingLabel:e.pack.label,quantity:4,amount:200,unit:'L',unitPriceCents:e.pack.priceCents,lineTotalCents:e.subtotalCents-e.discountCents}],subtotalCents:e.subtotalCents,discountCents:e.discountCents,freightCents:e.freightCents,totalCents:e.totalCents,paymentStatus:'demo-paid',paymentProvider:'demo',orderStatus:'delivered',shippingAddress:address,trackingNumber:'DEMO-FREIGHT-1042',fulfillmentNotes:'Illustrative shipment. No physical goods are dispatched.',history:[{status:'pending',at:'2026-09-01T09:00:00Z'},{status:'paid',at:'2026-09-01T09:02:00Z'},{status:'processing',at:'2026-09-01T11:00:00Z'},{status:'shipped',at:'2026-09-02T08:00:00Z'},{status:'delivered',at:'2026-09-04T10:00:00Z'}],createdAt:'2026-09-01T09:00:00Z',updatedAt:'2026-09-04T10:00:00Z'};
 const rfq={id:'demo-quote',buyer:buyer.id,number:'RFQ-DEMO-1001',productName:'Isopropyl Alcohol',casNumber:'67-63-0',amount:6000,unit:'L',targetPurity:99.9,deliveryRegion:buyer.deliveryRegion,notes:'Six IBC totes. Please confirm the earliest dispatch window.',contactName:buyer.name,contactEmail:buyer.email,companyName:buyer.companyName,attachmentIds:[],status:'quoted',quote:{priceCents:1295000,leadTimeDays:7,notes:'Demo offer for 6 × 1,000 L IBC totes; freight included.',quotedAt:now()},createdAt:now(),updatedAt:now()};
 const changes=[...seedProducts.map(doc=>({kind:'Product',doc})),{kind:'User',doc:buyer},{kind:'Email',doc:{id:buyer.email,buyer:buyer.id}},{kind:'Address',doc:address},{kind:'Order',doc:order},{kind:'RFQ',doc:rfq},{kind:'Meta',doc:{id:'seed-v1',createdAt:now()}}];
 try{await store.commit(changes);}catch(e){if(!(await store.get('Meta','seed-v1')))throw e;}
}
export async function cartView(store,buyer){
 const cart=await store.get('Cart',buyer)||{id:buyer,buyer,lines:[]};
 const lines=[];for(const line of cart.lines){const product=await store.get('Product',line.productId);const pack=product?.packagingOptions.find(p=>p.type===line.packagingType);if(!product||product.archived||!pack){lines.push({...line,unavailable:true,name:product?.name||'Unavailable product'});continue;}const e=estimate(product,line.packagingType,line.quantity);lines.push({...line,name:product.name,slug:product.slug,casNumber:product.casNumber,stockStatus:product.stockStatus,packagingLabel:pack.label,stockUnits:pack.stockUnits,unitPriceCents:pack.priceCents,...e,pack:undefined});}
 const subtotalCents=lines.reduce((s,l)=>s+(l.subtotalCents||0),0),discountCents=lines.reduce((s,l)=>s+(l.discountCents||0),0),freightCents=lines.reduce((s,l)=>s+(l.freightCents||0),0);
 return {lines,subtotalCents,discountCents,freightCents,totalCents:subtotalCents-discountCents+freightCents};
}
export async function reserveCart(store,user,input,config){
 const orderId='order-'+user.id+'-'+input.idempotencyKey;
 const existing=await store.get('Order',orderId);if(existing){owns(existing,user);return existing;}
 const cart=await store.get('Cart',user.id);if(!cart?.lines.length)fail('Your cart is empty.');
 const products=new Map(),lines=[],changes=[];let subtotalCents=0,discountCents=0,freightCents=0;
 for(const line of cart.lines){const product=products.get(line.productId)||await required(store,'Product',line.productId);products.set(product.id,product);
  if(product.archived||['out-of-stock','made-to-order'].includes(product.stockStatus))fail(product.name+' is only available by quote.');
  if(!config.demo&&(!product.approved||!product.sdsUrl||!product.coaUrl))fail(product.name+' is awaiting approved product documentation. Please request a quote.');
  const pack=product.packagingOptions.find(p=>p.type===line.packagingType);if(!pack||pack.stockUnits<line.quantity)fail('Insufficient stock for '+product.name+'. Update your cart or request a quote.');
  const e=estimate(product,line.packagingType,line.quantity);pack.stockUnits-=line.quantity;
  lines.push({...line,name:product.name,casNumber:product.casNumber,packagingLabel:pack.label,amount:pack.amount,unit:pack.unit,unitPriceCents:pack.priceCents,lineTotalCents:e.subtotalCents-e.discountCents});subtotalCents+=e.subtotalCents;discountCents+=e.discountCents;freightCents+=e.freightCents;
 }
 const order={id:orderId,buyer:user.id,number:'VCG-'+uid().slice(0,8).toUpperCase(),lines,subtotalCents,discountCents,freightCents,totalCents:subtotalCents-discountCents+freightCents,shippingAddress:input.shippingAddress,paymentProvider:config.demo?'demo':'stripe',paymentStatus:'unpaid',orderStatus:'pending',reserved:true,history:[{status:'pending',at:now()}],createdAt:now(),updatedAt:now()};
 for(const doc of products.values())changes.push({kind:'Product',doc});changes.push({kind:'Order',doc:order},{kind:'Cart',doc:{...cart,lines:[]}});await store.commit(changes);return required(store,'Order',orderId);
}
export async function markPaid(store,orderId,reference,demo=false,event){
 const order=await required(store,'Order',orderId);
 if(['paid','demo-paid'].includes(order.paymentStatus))return order;
 if(order.orderStatus!=='pending')fail('Order cannot be paid in its current state.',409);
 order.paymentStatus=demo?'demo-paid':'paid';order.orderStatus='paid';order.paymentReference=reference;order.reserved=false;order.updatedAt=now();order.history.push({status:'paid',at:now()});
 const changes=[{kind:'Order',doc:order}];if(event)changes.push({kind:'Webhook',doc:{id:event,createdAt:now()}});await store.commit(changes);return clean(order);
}
export async function cancelOrder(store,order,reason){
 if(order.orderStatus==='cancelled')return order;if(order.paymentStatus!=='unpaid'||order.orderStatus!=='pending')fail('Only unpaid pending orders can be cancelled.',409);
 const products=new Map();if(order.reserved){for(const line of order.lines){const p=products.get(line.productId)||await store.get('Product',line.productId);if(!p)continue;products.set(p.id,p);const pack=p.packagingOptions.find(x=>x.type===line.packagingType);if(pack)pack.stockUnits+=line.quantity;}}
 order.reserved=false;order.orderStatus='cancelled';order.fulfillmentNotes=reason;order.updatedAt=now();order.history.push({status:'cancelled',at:now()});
 await store.commit([...products.values()].map(doc=>({kind:'Product',doc})).concat({kind:'Order',doc:order}));return clean(order);
}
export async function convertQuote(store,rfq,user,address){
 owns(rfq,user);if(rfq.status==='converted')return required(store,'Order',rfq.orderId);if(rfq.status!=='quoted')fail('This quote is no longer open.',409);
 const id='quote-'+rfq.id;const order={id,buyer:user.id,number:'VCG-'+uid().slice(0,8).toUpperCase(),rfqId:rfq.id,lines:[{name:rfq.productName,casNumber:rfq.casNumber,packagingLabel:'Custom quoted supply',quantity:1,amount:rfq.amount,unit:rfq.unit,unitPriceCents:rfq.quote.priceCents,lineTotalCents:rfq.quote.priceCents}],subtotalCents:rfq.quote.priceCents,discountCents:0,freightCents:0,totalCents:rfq.quote.priceCents,shippingAddress:address,paymentStatus:'unpaid',orderStatus:'pending',history:[{status:'pending',at:now()}],leadTimeDays:rfq.quote.leadTimeDays,createdAt:now(),updatedAt:now()};
 await store.commit([{kind:'RFQ',doc:{...rfq,status:'converted',acceptedAt:now(),convertedAt:now(),orderId:id,updatedAt:now()}},{kind:'Order',doc:order}]);return clean(order);
}
