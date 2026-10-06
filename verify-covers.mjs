import assert from 'node:assert/strict';
import fs from 'node:fs';
import {coverCandidates,coverMarkup,installCoverFallback} from './dist/covers.js';
const library=JSON.parse(fs.readFileSync('dist/songs.json','utf8')),find=id=>library.songs.find(s=>s.id===id);
let covered=0;
for(const song of library.songs){assert.deepEqual(coverCandidates(song),song.cover.candidates,'Every cover must belong to a verified original PV');if(song.cover.candidates.length)covered++;}
assert.equal(covered,2738);assert.equal(library.songs.length,2739);assert.equal(library.version,'2026-10-04-v10','Covers must not reset ongoing rounds');
const nicoOnly=library.songs.find(s=>s.cover.candidates.length===1&&s.cover.candidates[0].platform==='niconico'),ytOnly=library.songs.find(s=>!s.videos.niconico&&s.cover.candidates[0]?.platform==='youtube'),both=library.songs.find(s=>s.cover.candidates.length===2);
assert(nicoOnly&&ytOnly&&both);assert(coverMarkup(nicoOnly).includes('/api/cover?song='+encodeURIComponent(nicoOnly.id)));assert(coverMarkup(ytOnly).includes('/api/cover?song='+encodeURIComponent(ytOnly.id)));assert.equal(both.cover.candidates[0].platform,'niconico');
for(const url of ['javascript:alert(1)','https://evil.test/photo.jpg','https://i.ytimg.com.evil.test/vi/'+both.videos.youtube.id+'/mqdefault.jpg','https://user:pass@i.ytimg.com/vi/'+both.videos.youtube.id+'/mqdefault.jpg','https://i.ytimg.com/vi/other-video/mqdefault.jpg'])assert.equal(coverCandidates({...both,cover:{candidates:[{...both.cover.candidates[1],url}]}}).length,0);
assert.equal(coverCandidates({...both,cover:{candidates:[{...both.cover.candidates[0],videoId:'sm1'}]}}).length,0);
const unavailable=coverMarkup(find('15662'));assert(unavailable.includes('暂无歌曲封面'));assert(!unavailable.includes('<img'));
const malicious=coverMarkup({...nicoOnly,title:'"><script>bad()</script>',id:'" unsafe'});assert(!malicious.includes('<script>'));assert(malicious.includes('&lt;script&gt;'));
// Simulate browser image failures: alternate official platform, then placeholder.
let removed=false,failed=false,placeholderAttributes={},caption={textContent:''};const handlers={};
const placeholder={removeAttribute:k=>delete placeholderAttributes[k],setAttribute:(k,v)=>placeholderAttributes[k]=v,querySelector:()=>caption},wrapper={dataset:{coverId:both.id},classList:{add:()=>failed=true},querySelector:()=>placeholder},image={tagName:'IMG',dataset:{coverIndex:'0'},closest:()=>wrapper,remove:()=>removed=true};
const root={addEventListener:(type,fn,capture)=>{assert(capture);handlers[type]=fn},removeEventListener:(type,fn,capture)=>{assert(capture);assert.equal(fn,handlers[type])}};
const handler=event=>handlers.error(event);
const detach=installCoverFallback(root,id=>find(id));handler({target:image});assert.equal(image.src,'/api/cover?song='+encodeURIComponent(both.id)+'&candidate=1');assert(!removed);handler({target:image});assert(removed&&failed);assert.equal(placeholderAttributes['aria-label'],'暂无歌曲封面');assert.equal(caption.textContent,'暂无封面');detach();
console.log(JSON.stringify({passed:true,songs:library.songs.length,withCover:covered,checks:'exact official PV binding, Nico-only and YouTube-only songs, URL safety, escaped titles, failed image fallback, preserved game version'}));
