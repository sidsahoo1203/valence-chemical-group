import {connectDb} from '../src/config/db.js';
import {MongoStore} from '../src/mongo-store.js';
import {seedDatabase} from './seed-data.js';
import mongoose from 'mongoose';
try{
 await connectDb();const result=await seedDatabase(new MongoStore(),{adminEmail:process.env.ADMIN_EMAIL,adminPassword:process.env.ADMIN_PASSWORD});
 console.log(result.adminState==='created'?'Created the configured administrator.':result.adminState==='existing'?'Administrator already exists; password and role unchanged.':'No administrator requested. Set both ADMIN_EMAIL and ADMIN_PASSWORD to provision one.');
 console.log('Added '+result.added+' catalog records. Existing products and users were preserved.');
 console.log('Seed prices/specifications are unapproved; approve product data, pricing, SDS and COA before checkout.');
}catch(error){console.error(error.message?.startsWith('ADMIN_EMAIL is already')?error.message:'Seed failed. Check Atlas connectivity, permissions and ADMIN_EMAIL / ADMIN_PASSWORD (12-72 characters).');process.exitCode=1;}
finally{await mongoose.disconnect();}
