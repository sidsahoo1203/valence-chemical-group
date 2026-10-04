import mongoose from 'mongoose';
import {env} from './env.js';
import {models,RateLimit} from '../models/index.js';
export async function connectDb(){mongoose.set('sanitizeFilter',true);await mongoose.connect(env.MONGODB_URI,{serverSelectionTimeoutMS:10000,maxPoolSize:10});await Promise.all([...Object.values(models),RateLimit].map(m=>m.init()));}
