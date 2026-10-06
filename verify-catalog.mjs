import fs from 'node:fs';
import assert from 'node:assert/strict';
import {filterLibrary} from './dist/filters.js';

const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const library=read('dist/songs.json'),songs=library.songs;
const snapshots={niconico:read('data/niconico-snapshot.json'),youtube:read('data/youtube-snapshot.json')};
assert.equal(new Set(songs.map(s=>s.id)).size,songs.length);
for(const platform of Object.keys(snapshots)){
 assert.equal(snapshots[platform].snapshotAt,library.collectionSources.playbackRanking[platform+'SnapshotAt'],'Published snapshot time must match the embedded playback data');
 if(platform==='niconico')assert(Object.values(snapshots[platform].records).every(r=>r.snapshotAt===snapshots[platform].snapshotAt),'Nico counts must come from one canonical daily snapshot');
 const links=songs.map(s=>s.videos[platform]?.id).filter(Boolean);
 assert.equal(new Set(links).size,links.length,'Repeated official PV association');
 const top=filterLibrary(songs,{ranges:[platform+'100']},library.charts.billboard.from).sort((a,b)=>a.platformRanks[platform]-b.platformRanks[platform]);
 assert.equal(top.length,100);assert.deepEqual(top.map(s=>s.platformRanks[platform]),Array.from({length:100},(_,i)=>i+1));
 const counts=top.map(s=>snapshots[platform].records[s.videos[platform].id]?.count);
 assert(counts.every(n=>Number.isSafeInteger(n)&&n>=0));assert(counts.every((n,i)=>i===0||n<=counts[i-1]));
}
const find=id=>songs.find(s=>s.id===id);
assert.equal(find('nico:sm24276234').videos.youtube.id,'XogSflwXgpw');
assert.equal(find('youtube:sqK-jh4TDXo').title,'Machine Love');
assert.notEqual(find('youtube:sqK-jh4TDXo').videos.niconico?.id,'nm3611741','Reference to another song is not an original PV');
assert.equal(find('youtube:WdHRGH1Qv70').producers[0].id,'179');assert(find('youtube:WdHRGH1Qv70').producerAliases.includes('emon'));
assert.deepEqual(find('youtube:WdHRGH1Qv70').singers,['巡音ルカ']);
assert.equal(songs.find(s=>s.videos.youtube?.id==='Q_QEPrkwZ-Q').videos.niconico.id,'sm28868044');
for(const id of ['nico:sm21986543','nico:sm33965071','nico:sm44509911','nico:sm8166339','nico:sm7696158'])assert(find(id),'Different original or Reloaded work was merged');
assert.notEqual(find('nico:sm1136355').title,find('nico:sm1111376').title,'Full and prototype versions need explicit names');
assert.equal(find('nico:sm38667465').videos.youtube,null,'A short game clip must not supply original-song views');
assert.equal(/AIza[0-9A-Za-z_-]{30,}/.test(JSON.stringify(library)),false,'Runtime keys must not be part of the public catalog');
assert(!songs.some(s=>s.videos.youtube?.id==='ZBXfocss8N8'),'A title word is not a synthetic-vocal credit');
for(const id of ['HAIDqt2aUek','W2TE0DjdNqI','5S21AIWMLbw','SqTq1P6y70Q'])assert(songs.some(s=>s.videos.youtube?.id===id&&s.producer==='Porter Robinson'),'Primary-source verified English original missing');
console.log(JSON.stringify({passed:true,songs:songs.length,checks:'unique works and PVs, playback ranking, YouTube exclusive original, reference-link rejection, separate Reloaded and prototype versions, short-clip rejection, secret exclusion'}));
