import mongoose from 'mongoose';
// Named collections retain the same domain documents used by the hosted demo.
// Domain mutations pass strict Zod schemas before reaching this repository.
const kinds=['User','Email','Session','Reset','Product','Cart','Order','RFQ','Address','File','Webhook','Notification','Contact','Meta'];
export const models=Object.fromEntries(kinds.map(kind=>{
 const schema=new mongoose.Schema({scope:{type:String,required:true},id:{type:String,required:true},owner:{type:String,default:''},data:{type:mongoose.Schema.Types.Mixed,required:true},version:{type:Number,required:true,default:1}},{strict:'throw',versionKey:false});
 schema.index({scope:1,id:1},{unique:true});schema.index({scope:1,owner:1});
 return [kind,mongoose.models[kind]||mongoose.model(kind,schema)];
}));
const limitSchema=new mongoose.Schema({_id:String,count:Number,expires:Date},{versionKey:false});
limitSchema.index({expires:1},{expireAfterSeconds:0});
export const RateLimit=mongoose.models.RateLimit||mongoose.model('RateLimit',limitSchema);
