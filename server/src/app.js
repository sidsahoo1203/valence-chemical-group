import {env} from './config/env.js';
import {MongoStore} from './mongo-store.js';
import {createApp} from './http-app.js';
export default createApp({
 config:{...env,scope:'production',demo:false,secure:env.NODE_ENV==='production',crossSite:env.COOKIE_SAME_SITE==='none'},
 storeFactory:()=>new MongoStore(),
 // Render's direct ingress is one trusted hop. Direct local connections trust none.
 trustProxy:env.TRUST_PROXY_HOPS
});
