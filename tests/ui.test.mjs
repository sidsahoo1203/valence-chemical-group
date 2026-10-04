import test from 'node:test';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://valence.test'});
for(const k of ['window','document','HTMLElement','Node','MutationObserver'])globalThis[k]=dom.window[k];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=await import('react');const {render,fireEvent,waitFor,cleanup}=await import('@testing-library/react');
const {MemoryRouter}=await import('react-router-dom');
await mkdir(new URL('../.test-build/',import.meta.url),{recursive:true});
const outfile=new URL('../.test-build/components.mjs',import.meta.url);
await build({stdin:{contents:"export {default as Admin} from './client/src/pages/Admin.jsx'; export {History} from './client/src/pages/Account.jsx'; export {useLoad} from './client/src/components/UI.jsx';",resolveDir:process.cwd(),loader:'jsx'},bundle:true,packages:'external',format:'esm',platform:'node',jsx:'automatic',define:{'import.meta.env':'{}'},outfile:fileURLToPath(outfile)});
const {Admin,History,useLoad}=await import(outfile.href);
const h=React.createElement;
const order={id:'order1',number:'ORDER-ONE',lines:[{name:'Acetone'}],createdAt:'2026-10-01',orderStatus:'pending',totalCents:500};
const rfq={id:'rfq1',number:'RFQ-ONE',productName:'Acetone',amount:20,unit:'L',createdAt:'2026-10-01',status:'submitted'};
const json=value=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
await test('admin Orders → Quote requests → Orders never renders a stale record as the other kind',async()=>{
 globalThis.fetch=async url=>json(String(url).includes('/admin/orders')?[order]:[rfq]);
 const ui=render(h(MemoryRouter,{initialEntries:['/admin?tab=orders']},h(Admin)));
 await waitFor(()=>assert.ok(ui.getByText('ORDER-ONE')));
 fireEvent.click(ui.getByRole('button',{name:'Quote requests'}));
 assert.equal(ui.queryByText('ORDER-ONE'),null);
 await waitFor(()=>assert.ok(ui.getByText('RFQ-ONE')));
 fireEvent.click(ui.getByRole('button',{name:'Orders',exact:true}));
 await waitFor(()=>assert.ok(ui.getByText('ORDER-ONE')));cleanup();
});
await test('History tolerates absent RFQ amount and absent order lines',()=>{
 let ui=render(h(MemoryRouter,null,h(History,{kind:'rfqs',provided:[{id:'x',number:'INCOMPLETE'}]})));assert.ok(ui.getByText('INCOMPLETE'));cleanup();
 ui=render(h(MemoryRouter,null,h(History,{kind:'orders',provided:[{id:'x',number:'INCOMPLETE'}]})));assert.ok(ui.getByText('INCOMPLETE'));cleanup();
});
await test('useLoad hides old-path data immediately and ignores a late response after navigation',async()=>{
 const pending=new Map();globalThis.fetch=url=>new Promise(resolve=>pending.set(String(url),resolve));
 function Probe({path}){const {data}=useLoad(path);return h('p',null,data?.label||'Loading');}
 const ui=render(h(Probe,{path:'/first'}));await React.act(async()=>pending.get('/api/first')(json({label:'First'})));
 ui.rerender(h(Probe,{path:'/second'}));assert.equal(ui.queryByText('First'),null);
 ui.rerender(h(Probe,{path:'/third'}));await React.act(async()=>pending.get('/api/second')(json({label:'Stale'})));assert.equal(ui.queryByText('Stale'),null);
 await React.act(async()=>pending.get('/api/third')(json({label:'Third'})));assert.ok(ui.getByText('Third'));cleanup();
});
