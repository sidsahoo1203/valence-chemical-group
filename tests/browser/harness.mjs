import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createServer as createVite} from 'vite';
import {createApp} from '../../server/src/http-app.js';
import {fixture} from '../helpers/api.mjs';
import {seedProducts} from '../../shared/catalog.js';
import {hashPassword,now} from '../../shared/auth.js';
export const adminCredentials={email:'staff@example.test',password:'Test-staff-password-123!'};
export async function startHarness(){
 const f=fixture();
 await f.store.commit(seedProducts.map(doc=>({kind:'Product',doc})));
 const admin={id:'staff-test',name:'Test Administrator',role:'admin',email:adminCredentials.email,passwordHash:await hashPassword(adminCredentials.password),companyName:'Acceptance Works',deliveryRegion:'Chennai',createdAt:now()};
 await f.store.commit([{kind:'User',doc:admin},{kind:'Email',doc:{id:admin.email,buyer:admin.id}}]);
 const objects=new Map();f.config.bucket={put:async(key,bytes)=>objects.set(key,bytes),get:async key=>objects.has(key)?{body:objects.get(key)}:null};
 const vite=await createVite({configFile:false,root:fileURLToPath(new URL('../../client',import.meta.url)),plugins:[(await import('@vitejs/plugin-react')).default()],server:{middlewareMode:true,hmr:false},appType:'spa'});
 let app;
 const server=createServer((req,res)=>req.url.startsWith('/api/')?app(req,res):vite.middlewares(req,res));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;f.config.FRONTEND_ORIGIN=origin;
 app=createApp({config:f.config,storeFactory:()=>f.store});
 return {...f,origin,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await vite.close();f.close();}};
}
