import fs from 'node:fs';
import assert from 'node:assert/strict';
import {evaluate,searchSongMatches,searchSongs,validateLibrary} from './dist/core.js';
import {comparePeople,peopleCell,producersOf,vocalistsOf,personTags} from './dist/people.js';
const library=validateLibrary(JSON.parse(fs.readFileSync('dist/songs.json','utf8'))),songs=library.songs;
const artist=(id,name,aliases=[])=>({id,name,aliases});
const a=artist('a','A'),b=artist('b','B'),c=artist('c','C');
const partial=comparePeople([a,b],[b,c]);assert.equal(partial.status,'close');assert.deepEqual(partial.tags.map(p=>[p.id,p.status]),[['a','wrong'],['b','exact']]);
assert.equal(comparePeople([a,b],[b,a]).status,'exact');assert.equal(comparePeople([a,b],[c]).status,'wrong');
assert.equal(comparePeople([a],[a,b]).status,'close','A solo and collaboration must not be fully equal');
assert.equal(comparePeople([a,a],[a]).tags.length,1,'Duplicate credits must not create duplicate tags');
const markup=peopleCell(partial);assert(markup.includes('person-tag unmatched'));assert(markup.includes('person-tag matched'));assert(markup.includes('1 / 2 位匹配'));assert(!markup.includes('td class="exact"'),'A partial match must not color the whole cell green');
assert(!personTags([artist('x','<img src=x onerror=evil>')]).includes('<img'),'Artist text must be escaped');
for(const song of songs){assert(song.producers?.length);assert(song.vocalists?.length);assert.equal(new Set(song.producers.map(p=>p.id)).size,song.producers.length);assert.equal(new Set(song.vocalists.map(p=>p.id)).size,song.vocalists.length);assert.deepEqual(song.singers,song.vocalists.map(p=>p.name));assert.equal(song.producer,song.producers.map(p=>p.name).join(' × '));assert.equal(evaluate(song,song).producer,'exact');assert.equal(evaluate(song,song).singers,'exact');}
const harumaki=songs.filter(s=>producersOf(s).some(p=>p.name==='はるまきごはん'));assert(harumaki.length>=12);
for(const q of ['はるまきごはん','春卷饭','春捲飯','harumakigohan','Harumaki Gohan']){const matched=searchSongMatches(songs,q);assert.deepEqual(new Set(matched.filter(r=>r.matchKind==='producer').map(r=>r.song.id)),new Set(harumaki.map(s=>s.id)),q+' must find the same author works');}
const miku=songs.filter(s=>vocalistsOf(s).some(p=>p.name==='初音ミク'));
for(const q of ['初音ミク','初音未来','初音未來','Hatsune Miku']){const matches=searchSongMatches(songs,q);assert(miku.every(s=>matches.some(r=>r.song.id===s.id)),q+' must find every Miku song');}
for(const q of ['镜音铃','鏡音リン','巡音流歌','巡音ルカ','重音 Teto','重音テト'])assert(searchSongs(songs,q).length>0,q+' must be searchable');
const devil=songs.find(s=>s.title==='デビルじゃないもん');assert(devil);assert(producersOf(devil).some(p=>p.name==='DECO*27'));assert(producersOf(devil).some(p=>p.name==='ピノキオピー'));assert(searchSongMatches([devil],'PinocchioP').some(r=>r.matchKind==='producer'));
const decoSolo=songs.find(s=>producersOf(s).length===1&&producersOf(s)[0].name==='DECO*27');const f=evaluate(devil,decoSolo);assert.equal(f.producer,'close');assert.deepEqual(f.producerDetails.tags.map(p=>[p.name,p.status]).sort(),[['DECO*27','exact'],['ピノキオピー','wrong']]);
const singerSolo=songs.find(s=>vocalistsOf(s).length===1&&vocalistsOf(s)[0].name==='初音ミク'),duet=songs.find(s=>vocalistsOf(s).length>1&&vocalistsOf(s).some(p=>p.name==='初音ミク'));assert(singerSolo&&duet);const sf=evaluate(duet,singerSolo);assert.equal(sf.singers,'close');assert(sf.singerDetails.tags.some(p=>p.name==='初音ミク'&&p.status==='exact'));assert(sf.singerDetails.tags.some(p=>p.name!=='初音ミク'&&p.status==='wrong'));
assert(!songs.some(s=>s.singers.some(n=>['初音未来','镜音铃','镜音连','巡音流歌','重音 Teto'].includes(n))));
for(const nicoId of ['sm9047689','sm10282629']){const song=songs.find(s=>s.videos.niconico?.id===nicoId);assert(song);assert.equal(song.producers.length,1,'A mixing credit must not turn a solo composition into a duet');assert.equal(song.producers[0].name,'ひとしずくP');}
assert(!searchSongMatches(songs,'かいりきベア').some(r=>r.matchKind==='producer'&&r.song.producers.length===1&&r.song.producers[0].id==='1665'),'An alias belonging to another P must not leak to MARETU');
assert(searchSongMatches(songs,'ワンオポ').some(r=>r.song.videos.niconico?.id==='sm24909819'&&r.matchKind==='producer'),'A music unit can be searched without merging individual composer identities');
for(const [id,title,producer]of [['youtube:heTaHWABCOo','私の恋はヘルファイア','SLAVE.V-V-R'],['youtube:efXqozK4A40','プシ','r-906'],['youtube:qiMQWPI_u3Y','ふぁうんどふってーじ','■37']]){const song=songs.find(s=>s.id===id);assert.equal(song.title,title);assert.equal(song.producer,producer);}
console.log(JSON.stringify({passed:true,songs:songs.length,harumakiSongs:harumaki.length,multiProducerSongs:songs.filter(s=>s.producers.length>1).length,multiSingerSongs:songs.filter(s=>s.vocalists.length>1).length,checks:'author aliases, Chinese singer search, original singer names, stable identities, per-tag intersections, no whole-cell green, solo/collaboration inequality, escaped labels'}));
