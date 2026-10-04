import app from './app.js';
import {env} from './config/env.js';
import {connectDb} from './config/db.js';
import mongoose from 'mongoose';
await connectDb();const server=app.listen(env.PORT,()=>console.log('Valence API listening on port '+env.PORT));
async function shutdown(){server.close(async()=>{await mongoose.disconnect();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
