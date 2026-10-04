import mongoose from 'mongoose';
import {connectDb} from '../src/config/db.js';
import {models} from '../src/models/index.js';
try{
 await connectDb();await mongoose.connection.db.admin().command({ping:1});
 const hello=await mongoose.connection.db.admin().command({hello:1});
 if(!hello.setName&&hello.msg!=='isdbgrid')throw new Error('ReplicaSetRequired');
 const session=await mongoose.startSession();
 try{await session.withTransaction(async()=>{await models.Meta.findOne({scope:'production',id:'health'}).session(session).lean();});}finally{await session.endSession();}
 const products=await models.Product.countDocuments({scope:'production'}),admins=await models.User.countDocuments({scope:'production','data.role':'admin'});
 console.log('Database connection: OK');console.log('Transaction read: OK');console.log('Catalog records: '+products);console.log('Administrator accounts: '+admins);
}catch(error){console.error('Database check: FAILED. Check your URI, database credentials, Atlas network access and replica-set support. ('+(error.message==='ReplicaSetRequired'?'ReplicaSetRequired':error.name)+')');process.exitCode=1;}
finally{await mongoose.disconnect();}
