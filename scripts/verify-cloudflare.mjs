import assert from 'node:assert/strict';
import {readFile,readdir,stat,mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {assetFiles} from '../asset-files.mjs';
import worker from '../cloudflare/worker.mjs';
import info from '../.cloudflare/build-info.mjs';
import {localDatabase} from '../local-db.mjs';
import {collectPlayback} from './update-playback.mjs';

const root=resolve('.cloudflare/assets');
let assetReads=0;
const overrides=new Map();
const ASSETS={async fetch(request){
  assetReads++;
  const path=new URL(request.url).pathname;
  if(overrides.has(path)) return Response.json(overrides.get(path));
  try{return new Response(await readFile(root+path),{headers:{'Content-Type':path.endsWith('.json')||path==='/api/library'?'application/json':'text/html'}});}catch{return new Response('Not found',{status:404});}
}};
const DB=localDatabase(),env={ASSETS,DB,FEEDBACK_SIGNING_KEY:'local-test-signing-key'},request=(path,options={})=>worker.fetch(new Request('https://test'+path,options),env);
const library=await (await request('/api/library')).json();
assert.equal(library.songs.length,2739);
assert.equal(library.playbackUpdate.revision,info.revision);
assert.equal(library.playbackUpdate.cadence,'weekly');
for(const name of ['youtube100','niconico100']) assert.equal(library.songs.filter(s=>s.collections.includes(name)).length,100);
const selected=library.songs.find(s=>s.videos.niconico&&s.videos.youtube),id=selected.id;
const file=Buffer.from(id).toString('base64url'),path='/_game/songs/'+file+'.json';
const data=JSON.parse(await readFile(root+path));
const originalFetch=globalThis.fetch; let upstreamCalls=0;
globalThis.fetch=async()=>{upstreamCalls++;throw Error('Gameplay must not query provider APIs');};
const current=await (await request('/api/views?songs='+encodeURIComponent(id))).json();
assert.equal(current.revision,info.revision);
assert.deepEqual(current.songs[id],data.records[info.revision]);
assert.equal(upstreamCalls,0);
const old='2026-10-01T00:00:00.000Z',oldRecord=structuredClone(data.records[info.revision]);
oldRecord.youtube.count=12345;
overrides.set(path,{...data,records:{...data.records,[old]:oldRecord}});
const pinned=await (await request('/api/views?songs='+encodeURIComponent(id)+'&revision='+old)).json();
assert.equal(pinned.songs[id].youtube.count,12345);
// Exercise the real build with the legacy first-update archive. An already
// running round must keep its original fetchedAt revision after publication.
const fixture=await mkdtemp(resolve('.cloudflare')+'/snapshot-regression-');
try {
  await mkdir(fixture+'/dist');await mkdir(fixture+'/data/playback-archive',{recursive:true});
  await writeFile(fixture+'/dist/songs.json',JSON.stringify(library));
  await writeFile(fixture+'/data/difficulties.json',await readFile('data/difficulties.json'));
  for(const asset of assetFiles.filter(f=>f!=='songs.json')) await writeFile(fixture+'/dist/'+asset,'fixture');
  await writeFile(fixture+'/dist/updates.json',await readFile('dist/updates.json'));
  const prior={libraryVersion:library.version,
    niconico:JSON.parse(await readFile('data/niconico-snapshot.json','utf8')),
    youtube:JSON.parse(await readFile('data/youtube-snapshot.json','utf8'))};
  const initialRevision=[prior.niconico.fetchedAt,prior.youtube.fetchedAt].filter(Boolean).sort().at(-1);
  const next=structuredClone(prior);next.updatedAt='2026-10-06T12:00:00.000Z';
  next.youtube.records[selected.videos.youtube.id]={count:7654321,fetchedAt:next.updatedAt,snapshotAt:next.updatedAt};
  await writeFile(fixture+'/data/playback-archive/legacy.json',JSON.stringify(prior));
  await writeFile(fixture+'/data/playback-latest.json',JSON.stringify(next));
  execFileSync(process.execPath,[resolve('scripts/build.mjs')],{cwd:fixture,stdio:'pipe'});
  const archived=JSON.parse(await readFile(fixture+'/.cloudflare/assets'+path));
  assert.deepEqual(archived.records[initialRevision],archived.records['bundled-'+library.version]);
  assert.equal(archived.records[next.updatedAt].youtube.count,7654321);
  overrides.set(path,archived);
  const resumed=await (await request('/api/views?songs='+encodeURIComponent(id)+'&revision='+encodeURIComponent(initialRevision))).json();
  assert.equal(resumed.songs[id].youtube.count,prior.youtube.records[selected.videos.youtube.id].count);
  assert.notEqual(resumed.songs[id].youtube.count,7654321);
} finally {
  assert.equal(dirname(fixture),resolve('.cloudflare'));
  await rm(fixture,{recursive:true,force:true});
}
assert.equal((await request('/api/views?songs='+encodeURIComponent(id)+'&revision=missing')).status,503);
assert.equal((await request('/api/views?songs=missing')).status,400);
assert.equal((await request('/api/views?songs='+Array(12).fill(encodeURIComponent(id)).join(','))).status,400);
assert.equal((await request('/api/views?songs='+encodeURIComponent(id),{headers:{Origin:'https://elsewhere.test'}})).status,403);
assert.equal((await request('/api/views?songs='+encodeURIComponent(id),{method:'POST'})).status,405);
assert.equal((await request('/api/cover?song='+encodeURIComponent(id)+'&url=https://evil.test')).status,404);
assert.equal(upstreamCalls,0);
overrides.clear();globalThis.fetch=originalFetch;

const headers={'Content-Type':'application/json','X-Feedback-Submission':'1','CF-Connecting-IP':'cloudflare-test','Origin':'https://test'};
const ticketResponse=await request('/api/feedback-ticket',{headers}),ticket=(await ticketResponse.json()).ticket;
assert.equal(ticketResponse.status,200);
const body={id:crypto.randomUUID(),rating:5,message:'Cloudflare 本地反馈测试',page:'/',website:''};
const post=()=>request('/api/feedback',{method:'POST',headers:{...headers,'X-Feedback-Ticket':ticket},body:JSON.stringify(body)});
assert.equal((await post()).status,201);assert.equal((await post()).status,200);
assert.equal(DB.database.prepare('SELECT count(*) AS n FROM feedback').get().n,1);
assert.equal((await request('/api/feedback/list')).status,404);
assert.equal((await request('/api/refresh',{method:'POST'})).status,404);
const health=await(await request('/api/health')).json();assert.equal(health.feedbackAvailable,true);assert(!JSON.stringify(health).includes(env.FEEDBACK_SIGNING_KEY));
DB.database.close();

const tiny={version:'test',songs:[{videos:{niconico:{id:'sm9'},youtube:{id:'abcdefghijk'}}}]};
const calls=[],version='2026-10-06T00:00:00Z';
const fetcher=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/version'))return Response.json({last_modified:version});
  if(url.includes('nicovideo.jp'))return Response.json({meta:{status:200},data:[{contentId:'sm9',viewCounter:1000000},{contentId:'sm99',viewCounter:99999999}]});
  return Response.json({items:[{id:'abcdefghijk',statistics:{viewCount:'2345678'}},{id:'unrelated',statistics:{viewCount:'999'}}]});
};
const refreshed=await collectPlayback(tiny,{niconico:{records:{}},youtube:{records:{}}},'mock-key',{fetcher,pause:async()=>{},now:()=>version});
assert.equal(refreshed.niconico.records.sm9.count,1000000);
assert.equal(refreshed.youtube.records.abcdefghijk.count,2345678);
assert(!refreshed.niconico.records.sm99);assert(!refreshed.youtube.records.unrelated);
assert.equal(calls.find(c=>c.url.includes('googleapis.com')).options.headers['x-goog-api-key'],'mock-key');
let checks=0;
await assert.rejects(collectPlayback(tiny,{niconico:{records:{}},youtube:{records:{}}},'mock-key',{fetcher:async(u,o)=>u.endsWith('/version')?Response.json({last_modified:checks++? '2026-10-07T00:00:00Z':version}):fetcher(u,o),pause:async()=>{}}),/变化/);
await assert.rejects(collectPlayback(tiny,{},'',{fetcher}),/YOUTUBE_API_KEY/);

let total=0,maxBytes=0;
async function files(directory){for(const item of await readdir(directory,{withFileTypes:true})){const path=directory+'/'+item.name;if(item.isDirectory())await files(path);else{total++;maxBytes=Math.max(maxBytes,(await stat(path)).size);}}}
await files(root);assert(total<20000);assert(maxBytes<25*1024*1024);
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
assert(!config.assets.run_worker_first.includes('/api/library'),'Large library must bypass Worker CPU');
assert(!config.r2_buckets,'Free test requires no R2 billing subscription');
console.log('Cloudflare checks passed:',library.songs.length,'songs,',total,'static files,',assetReads,'bounded asset reads; pinned views, feedback persistence and atomic collector verified');
