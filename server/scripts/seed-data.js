import {seedProducts} from '../../shared/catalog.js';
import {hashPassword,uid,now} from '../../shared/auth.js';
import {email,password} from '../../shared/schemas.js';
export async function seedDatabase(store,{adminEmail,adminPassword}={}){
 let admin=null,adminState='not-requested';
 if(adminEmail||adminPassword){
  const normalized=email.parse(adminEmail),secret=password.parse(adminPassword);
  const ref=await store.get('Email',normalized),existing=ref?await store.get('User',ref.buyer):null;
  if(ref&&existing?.role!=='admin')throw new Error('ADMIN_EMAIL is already in use by a non-admin account. Choose an unused email. No role was changed.');
  if(existing)adminState='existing';
  else{admin={id:uid(),name:'Valence Administrator',email:normalized,passwordHash:await hashPassword(secret),role:'admin',companyName:'Valence Chemical Group',deliveryRegion:'',createdAt:now()};adminState='created';}
 }
 let added=0;
 for(const product of seedProducts)if(!await store.get('Product',product.id)){await store.commit([{kind:'Product',doc:product}]);added++;}
 if(admin)await store.commit([{kind:'User',doc:admin},{kind:'Email',doc:{id:admin.email,buyer:admin.id}}]);
 return {added,adminState};
}
