import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {searchSongs,searchSongMatches,normalize,validateLibrary} from './dist/core.js';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),library=validateLibrary(read('dist/songs.json')),songs=library.songs,audit=read('data/title-audit-v10.json'),baseline=read('data/title-baseline-v9.json'),find=id=>songs.find(s=>s.id===id);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(library.version,'2026-10-04-v10');assert.equal(songs.length,baseline.songs.length);
const changedCredits=new Set(audit.relatedArtistCorrections.map(c=>c.id));
for(const before of baseline.songs){const song=find(before.id);assert(song,'An existing song must not silently disappear');assert.equal(hash([song.videos,song.rankings,song.year,song.publishDate,song.duration,song.vocalists,song.collections,song.platformRanks]),before.identityHash,'Title/search edits must preserve PVs, chart histories, years, singers and platform ranks: '+song.id);if(!changedCredits.has(song.id))assert.deepEqual(song.producers.map(p=>({id:p.id,name:p.name})),before.producers);}
for(const c of audit.corrections){assert.equal(find(c.id).title,c.after);assert(find(c.id).titleAudit.source.sourceUrl);assert(!/[\p{Cf}]/u.test(find(c.id).title));}
assert.equal(find('nico:sm39398775').title,'Shadow Shadow');assert.equal(searchSongs(songs,'shadow shadow')[0].id,'nico:sm39398775');
assert.equal(find('nico:sm17945847').title,'恋愛フィロソフィア');assert(!find('nico:sm17945847').aliases.some(a=>/幸福|koufuku|こちら|kochira/i.test(a)));assert.equal(searchSongs(songs,'恋爱哲学')[0].id,'nico:sm17945847');assert.equal(searchSongs(songs,'幸福安心委员会')[0].id,'13260');
assert.equal(find('nico:sm34812268').title,'スクランブル交際');assert.equal(find('nico:sm32411787').title,'トウキョウダイバアフェイクショウ');assert.equal(find('youtube:nIWZfhpnq6M').title,'桜日和とタイムマシン');
assert.equal(find('nico:sm39422060').title,'モザイクロール (Reloaded)');assert.equal(find('51082').title,'+♂');assert(songs.some(s=>s.title==='D/N/A'));
for(const correction of audit.relatedArtistCorrections)assert.deepEqual(find(correction.id).producers.map(p=>p.name),correction.suggestedNames);
const masarada=songs.filter(s=>s.producers.some(p=>p.name==='マサラダ'));
for(const q of ['masarada','MASARADA']){const results=searchSongMatches(songs,q).filter(r=>r.matchKind==='producer');assert(masarada.length>0);assert.deepEqual(new Set(results.map(r=>r.song.id)),new Set(masarada.map(s=>s.id)));}
for(const [q,name]of [['surii','すりぃ'],['shishishishi','獅子志司'],['natsuyama yotsugi','夏山よつぎ']])assert(searchSongMatches(songs,q).some(r=>r.matchKind==='producer'&&r.song.producers.some(p=>p.name===name)),q);
const readings=read('data/producer-readings-v10.json'),ids=new Set(readings.artists.map(a=>a.id));assert.equal(ids.size,526);
for(const s of songs){assert(s.title.replace(/[\s\p{Cf}]/gu,''));assert(!/\bfeat\.?|【original】|\[オリジナル\]/i.test(s.title));const authors=new Set(s.producers.flatMap(p=>[p.name,...p.aliases,...p.searchAliases]).map(normalize));assert(!s.aliases.some(a=>authors.has(normalize(a))),'An author reading must not become a song alias');for(const p of s.producers){assert(ids.has(p.id));assert(Array.isArray(p.searchAliases));}}
assert(!songs.filter(s=>s.producers.length===1&&s.producers[0].name==='もじゃ').some(s=>s.producerAliases.includes('れるりり')));
console.log(JSON.stringify({passed:true,songs:songs.length,correctedTitles:audit.corrections.length,masaradaSongs:masarada.length,producerReadings:readings.coverage.availableIdentities,checks:'exact original PV and chart preservation, invisible titles, description names, official versions and symbols, foreign alias purge, separate artist search and romaji'}));
