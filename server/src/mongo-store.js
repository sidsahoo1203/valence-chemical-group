import mongoose from 'mongoose';
import {models,RateLimit} from './models/index.js';
import {Conflict} from '../../shared/store.js';
export class MongoStore {
 constructor(scope='production'){this.scope=scope;}
 async get(kind,id){const r=await models[kind].findOne({scope:this.scope,id:String(id)}).lean();return r?{...r.data,_v:r.version}:null;}
 async list(kind,owner){const query={scope:this.scope};if(owner!==undefined)query.owner=String(owner);const rows=await models[kind].find(query).sort({_id:-1}).limit(1000).lean();return rows.map(r=>({...r.data,_v:r.version}));}
 async commit(changes){
  const session=await mongoose.startSession();try{await session.withTransaction(async()=>{
   for(const {kind,doc,remove=false} of changes){const {_v,...data}=doc;const q={scope:this.scope,id:doc.id,version:_v};
    if(remove){const result=await models[kind].deleteOne(q,{session});if(result.deletedCount!==1)throw new Conflict();}
    else if(_v){const result=await models[kind].updateOne(q,{$set:{data,owner:doc.buyer||doc.owner||''},$inc:{version:1}},{session});if(result.modifiedCount!==1)throw new Conflict();}
    else await models[kind].create([{scope:this.scope,id:doc.id,owner:doc.buyer||doc.owner||'',data,version:1}],{session});
   }
  });}catch(e){if(e.code===11000)throw new Conflict();throw e;}finally{await session.endSession();}
 }
 async rate(key,limit,windowSeconds){
  const id=this.scope+':'+key,now=new Date(),expires=new Date(Date.now()+windowSeconds*1000);
  const result=await RateLimit.findOneAndUpdate({_id:id},[{$set:{count:{$cond:[{$gt:['$expires',now]},{$add:['$count',1]},1]},expires:{$cond:[{$gt:['$expires',now]},'$expires',expires]}}}],{upsert:true,new:true});return result.count<=limit;
 }
}
