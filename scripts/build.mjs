import {execSync} from 'node:child_process';
import {mkdirSync,cpSync,existsSync,rmSync,readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
rmSync('dist',{recursive:true,force:true});
execSync('npm run build --workspace client',{stdio:'inherit'});
mkdirSync('dist/server',{recursive:true});
cpSync('client/dist','dist/client',{recursive:true});
const assets={};
function collect(dir,prefix=''){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=prefix+'/'+entry.name;if(entry.isDirectory())collect(dir+'/'+entry.name,path);else{const type=path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/html';assets[path]={type,content:readFileSync(dir+'/'+entry.name,'utf8')};}}}
collect('client/dist');
await build({entryPoints:['worker/index.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',conditions:['worker','browser'],external:['cloudflare:workers','node:*'],minify:true,plugins:[{name:'built-client-assets',setup(b){b.onResolve({filter:/^virtual:valence-assets$/},()=>({path:'assets',namespace:'valence'}));b.onLoad({filter:/.*/,namespace:'valence'},()=>({contents:'export default '+JSON.stringify(assets),loader:'js'}));}}]});
mkdirSync('dist/.openai',{recursive:true});
cpSync('.openai/hosting.json','dist/.openai/hosting.json');
if(existsSync('drizzle'))cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
