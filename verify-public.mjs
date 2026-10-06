import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHandler,publicLibrary,reserveYoutubeQuota,readYouTubeVideos,allowPlaybackRequest} from './server.mjs';
import {validateLibrary,searchSongs} from './dist/core.js';
import {coverCandidates} from './dist/covers.js';
const source=JSON.parse(readFileSync('dist/songs.json','utf8')),compact=validateLibrary(publicLibrary(source));
assert.equal(compact.version,source.version);assert.deepEqual(compact.songs.map(s=>s.id),source.songs.map(s=>s.id));
for(let i=0;i<source.songs.length;i++){
 const original=source.songs[i],song=compact.songs[i];
 for(const key of ['title','aliases','producerSearchAliases','producers','vocalists','publishDate','year','duration','versionLabel','versionLabelKind'])assert.deepEqual(song[key],original[key]);
 for(const chart of ['billboard','weekly'])for(const key of ['status','weeks','peak','knownWeeks','knownPeak','reason'])assert.deepEqual(song.rankings[chart][key],original.rankings[chart][key]);
 assert.equal('history' in song.rankings.weekly,false);assert.equal('audit' in song,false);
}
for(const query of ['千本樱','harumakigohan','masarada','rolling girl','初音未来'])assert.deepEqual(searchSongs(compact.songs,query).map(s=>s.id),searchSongs(source.songs,query).map(s=>s.id));
assert.ok(Buffer.byteLength(JSON.stringify(compact))<6*1024*1024,'Public library must stay within its transfer budget');
assert.ok(Buffer.byteLength(JSON.stringify(compact))<Buffer.byteLength(JSON.stringify(source))*.75);

function bucket(){
 const records=new Map();let serial=0;
 return{records,async get(key){const value=records.get(key);return value?{etag:value.etag,body:value.body,httpMetadata:value.httpMetadata,customMetadata:value.customMetadata,json:async()=>JSON.parse(value.body)}:null;},async put(key,body,{onlyIf,httpMetadata,customMetadata}={}){
  const prior=records.get(key);
  if(onlyIf instanceof Headers&&onlyIf.get('If-None-Match')==='*'&&prior)return null;
  if(onlyIf?.etagMatches!==undefined&&prior?.etag!==onlyIf.etagMatches)return null;
  const value={etag:String(++serial),body,httpMetadata,customMetadata};records.set(key,value);return{etag:value.etag};
 }};
}
const quotaBucket=bucket(),quotaEnv={BUCKET:quotaBucket};
assert.equal(await reserveYoutubeQuota(quotaEnv,7998),true);
const concurrent=await Promise.all(Array.from({length:12},()=>reserveYoutubeQuota(quotaEnv)));
assert.equal(concurrent.filter(Boolean).length,2,'Concurrent callers must not exceed the shared budget');
assert.equal(await reserveYoutubeQuota(quotaEnv),false);assert.equal(await reserveYoutubeQuota(quotaEnv,1500,true),true);
assert.equal(await reserveYoutubeQuota(quotaEnv,1,true),false);
await assert.rejects(reserveYoutubeQuota({}),/storage unavailable/);

const snapshots={libraryVersion:source.version,niconico:{snapshotAt:'2026-10-05T07:00:00+09:00',records:{}},youtube:{records:{}}};
const handler=createHandler({'/index.html':{body:'public game',type:'text/html',etag:'"page"'}},source,snapshots);
const token='test-maintenance-token-never-used-in-production';
const headers={'Content-Type':'application/json','X-Playback-Refresh':'1'};
const forged={...headers,'oai-authenticated-user-email':'owner@example.test','OAI-Sites-Authorization':'Bearer forged'};
for(const requestHeaders of [headers,forged,{...headers,'X-Playback-Refresh-Token':'wrong'}])assert.equal((await handler.fetch(new Request('https://local/api/refresh',{method:'POST',headers:requestHeaders}),{PLAYBACK_REFRESH_TOKEN:token})).status,403);
assert.equal((await handler.fetch(new Request('https://local/api/refresh',{method:'POST',headers:{...headers,'X-Playback-Refresh-Token':token,Origin:'https://evil.test'}}),{PLAYBACK_REFRESH_TOKEN:token})).status,403);
assert.equal((await handler.fetch(new Request('https://local/api/views?songs=8394',{headers:{Origin:'https://evil.test'}}))).status,403);
assert.equal((await handler.fetch(new Request('https://local/api/views?songs=8394',{method:'HEAD'}))).status,405);
for(let i=0;i<60;i++)assert.equal(allowPlaybackRequest(new Request('https://local',{headers:{'CF-Connecting-IP':'192.0.2.42'}}),0),true);
assert.equal(allowPlaybackRequest(new Request('https://local',{headers:{'CF-Connecting-IP':'192.0.2.42'}}),0),false);
assert.equal(allowPlaybackRequest(new Request('https://local',{headers:{'CF-Connecting-IP':'192.0.2.42'}}),60000),true);
const rateRequest=new Request('https://local/api/views?songs=8394',{headers:{'CF-Connecting-IP':'192.0.2.43'}});
for(let i=0;i<60;i++)allowPlaybackRequest(rateRequest);
const limited=await handler.fetch(rateRequest);assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
const page=await handler.fetch(new Request('https://local/'));assert.equal(page.status,200);
assert.equal((await handler.fetch(new Request('https://local/',{headers:{'If-None-Match':'"page"'}}))).status,304);
assert.equal((await handler.fetch(new Request('https://local/',{headers:{'If-None-Match':'W/"page"'}}))).status,304,'The hosting layer weakens ETags');
const libraryResponse=await handler.fetch(new Request('https://local/api/library')),etag=libraryResponse.headers.get('ETag');assert.ok(etag);
assert.equal((await handler.fetch(new Request('https://local/api/library',{headers:{'If-None-Match':etag}}))).status,304);
assert.equal((await handler.fetch(new Request('https://local/api/library',{headers:{'If-None-Match':'"old", W/'+etag}}))).status,304);

const realFetch=globalThis.fetch;let youtubeCalls=0,imageCalls=0;
try{
 globalThis.fetch=async(url,options)=>{
  const target=new URL(url);
  if(target.hostname==='www.googleapis.com'){
   youtubeCalls++;assert.equal(target.searchParams.has('key'),false);assert.equal(options.headers['x-goog-api-key'],'test-only-key');
   await new Promise(resolve=>setTimeout(resolve,5));
   return Response.json({items:target.searchParams.get('id').split(',').map(id=>({id,statistics:{viewCount:'1234567'}}))});
  }
  if(target.pathname.endsWith('/version'))return Response.json({last_modified:snapshots.niconico.snapshotAt});
  if(target.hostname==='snapshot.search.nicovideo.jp')return Response.json({meta:{status:200},data:[]});
  if(['nicovideo.cdn.nimg.jp','i.ytimg.com'].includes(target.hostname)){imageCalls++;assert.equal(options.redirect,'manual');return new Response(new Uint8Array([255,216,255,217]),{headers:{'Content-Type':'image/jpeg'}});}
  throw Error('Unexpected upstream');
 };
 const liveBucket=bucket(),liveEnv={BUCKET:liveBucket,YOUTUBE_API_KEY:'test-only-key'};
 const videos=[{id:'publictestA',url:'https://www.youtube.com/watch?v=publictestA'},{id:'publictestB',url:'https://www.youtube.com/watch?v=publictestB'}];
 const results=await Promise.all([readYouTubeVideos(videos,liveEnv),readYouTubeVideos(videos,liveEnv)]);
 assert.equal(youtubeCalls,1,'Concurrent identical guesses should share one batched upstream call');
 assert.equal(results[0].publictestA.count,1234567);assert.equal(results[1].publictestB.status,'ok');
 await liveBucket.put('playback/youtube-live/sharedtest1.json',JSON.stringify({count:7654321,fetchedAt:new Date().toISOString()}));
 assert.equal((await readYouTubeVideos([{id:'sharedtest1',url:'https://www.youtube.com/watch?v=sharedtest1'}],liveEnv)).sharedtest1.count,7654321);assert.equal(youtubeCalls,1);
 const noStorage=await readYouTubeVideos([{id:'nostorage01',url:'https://www.youtube.com/watch?v=nostorage01'}],{YOUTUBE_API_KEY:'test-only-key'},{nostorage01:{count:42,fetchedAt:'2026-10-04T00:00:00Z'}});assert.equal(noStorage.nostorage01.status,'stale');assert.equal(youtubeCalls,1,'Storage failure must not bypass quota accounting');
 const small={...source,version:'weekly-writer-fixture',songs:source.songs.slice(0,1)},empty={libraryVersion:'weekly-writer-fixture',niconico:{snapshotAt:snapshots.niconico.snapshotAt,records:{}},youtube:{records:{}}},writer=createHandler({},small,empty),writerBucket=bucket();
 const written=await writer.fetch(new Request('https://local/api/refresh',{method:'POST',headers:{...headers,'X-Playback-Refresh-Token':token},body:'{}'}),{BUCKET:writerBucket,PLAYBACK_REFRESH_TOKEN:token,YOUTUBE_API_KEY:'test-only-key'});
 assert.equal(written.status,200);assert.ok(writerBucket.records.has('playback/latest.json'));
 const coverSong=source.songs.find(song=>song.cover.candidates.length===2),coverEnv={BUCKET:bucket()};
 for(const candidate of [0,1]){
  const url='https://local/api/cover?song='+encodeURIComponent(coverSong.id)+'&candidate='+candidate;
  const image=await handler.fetch(new Request(url),coverEnv);assert.equal(image.status,200);assert.equal(image.headers.get('Content-Type'),'image/jpeg');
  assert.equal((await handler.fetch(new Request(url),coverEnv)).status,200);
 }
 assert.equal(imageCalls,2,'Stored official covers should not re-fetch their external platform');
 for(const query of ['song=unknown','song='+coverSong.id+'&candidate=999','song='+coverSong.id+'&url=https://evil.test','song='+coverSong.id+'&candidate=-1'])assert.equal((await handler.fetch(new Request('https://local/api/cover?'+query),coverEnv)).status,404);
 assert.equal(imageCalls,2,'Arbitrary cover targets must be rejected before outbound requests');
 for(const song of compact.songs)assert.deepEqual(coverCandidates(song).map(c=>c.url),coverCandidates(source.songs.find(original=>original.id===song.id)).map(c=>c.url));
}finally{globalThis.fetch=realFetch;}
console.log(JSON.stringify({passed:true,checks:'full catalog parity, public payload reduction, service-only writer, spoofed identity rejected, shared quota races, batched requests, shared cache, fail-closed budget, conditional responses, rate limits'}));
