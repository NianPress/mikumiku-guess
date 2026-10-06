import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{weeklySlot,nextWeeklyUpdate,createHandler,refreshPlayback}from'./server.mjs';
assert.equal(weeklySlot(Date.parse('2026-10-05T06:59:59+08:00')),'2026-09-27T23:00:00.000Z');
assert.equal(weeklySlot(Date.parse('2026-10-05T07:00:00+08:00')),'2026-10-04T23:00:00.000Z');
assert.equal(weeklySlot(Date.parse('2026-10-11T23:59:59+08:00')),'2026-10-04T23:00:00.000Z');
assert.equal(nextWeeklyUpdate(Date.parse('2026-10-05T07:00:00+08:00')),'2026-10-11T23:00:00.000Z');
const full=JSON.parse(readFileSync('dist/songs.json','utf8')),song=full.songs.find(s=>s.videos.niconico&&s.videos.youtube),library={...full,version:'weekly-fixture',songs:[song]},oldTime='2026-10-05T00:00:00.000Z',newTime='2026-10-12T00:00:00.000Z';
const snapshot=time=>({libraryVersion:library.version,updatedAt:time,niconico:{snapshotAt:time,records:{[song.videos.niconico.id]:{count:2000000,snapshotAt:time,fetchedAt:time}}},youtube:{snapshotAt:time,records:{[song.videos.youtube.id]:{count:3000000,snapshotAt:time,fetchedAt:time}}}}),prior=snapshot(oldTime),latest=snapshot(newTime);latest.niconico.records[song.videos.niconico.id].count=10000000;latest.youtube.records[song.videos.youtube.id].count=20000000;
const objects=new Map([['playback/latest.json',JSON.stringify(latest)],['playback/weekly-'+encodeURIComponent(oldTime)+'.json',JSON.stringify(prior)]]),env={BUCKET:{get:async key=>objects.has(key)?{json:async()=>JSON.parse(objects.get(key))}:null,put:async()=>{throw Error('Unexpected write');}},YOUTUBE_API_KEY:'test'};
const handler=createHandler({},library,prior),realFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No upstream calls allowed');};
try{
 const data=await(await handler.fetch(new Request('https://test/api/views?songs='+encodeURIComponent(song.id)+'&revision='+encodeURIComponent(oldTime)),env)).json();assert.equal(data.songs[song.id].niconico.count,2000000);assert.equal(data.songs[song.id].youtube.count,3000000);
 const fresh=await(await handler.fetch(new Request('https://test/api/views?songs='+encodeURIComponent(song.id)),env)).json();assert.equal(fresh.songs[song.id].youtube.count,20000000);assert.equal(fresh.youtubeCadence,'weekly');
 assert.equal((await refreshPlayback(library,env,prior,{now:Date.parse('2026-10-13T00:00:00Z')})).skipped,true);assert.equal(calls,0);
 const body=await(await handler.fetch(new Request('https://test/api/library'),env)).json();assert(body.songs[0].collections.includes('myth'));
}finally{globalThis.fetch=realFetch;}
console.log('Weekly snapshots: Monday 07:00 boundary, both platforms pinned, skipped duplicate updates, no guessing API calls verified');
