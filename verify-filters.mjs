import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterLibrary,filterKey,normalizeFilters,visibleCharts} from './dist/filters.js';
import {compareViews} from './dist/core.js';
const library=JSON.parse(readFileSync('dist/songs.json','utf8')),songs=library.songs;
assert.deepEqual(visibleCharts({chart:'all'}),['billboard','weekly']);assert.deepEqual(visibleCharts({chart:'billboard'}),['billboard']);assert.deepEqual(visibleCharts({chart:'weekly'}),['weekly']);
const range=filterLibrary(songs,{from:2009,to:2013});assert.ok(range.length>50);assert.ok(range.every(s=>s.year>=2009&&s.year<=2013));
assert.ok(filterLibrary(songs,{to:2016}).every(s=>s.year<2017));assert.equal(filterLibrary(songs,{from:2013,to:2009}).length,0);
const recent=filterLibrary(songs,{chart:'billboard'}),older=filterLibrary(songs,{chart:'weekly'});assert.ok(recent.length>100);assert.ok(recent.every(s=>s.rankings.billboard.weeks>0));assert.ok(older.every(s=>s.rankings.weekly.weeks>0));
assert.equal(filterLibrary(songs,{ranges:['niconico100']}).length,100);assert.equal(filterLibrary(songs,{ranges:['youtube100']}).length,100);
const nico=new Set(filterLibrary(songs,{ranges:['niconico100']}).map(s=>s.id)),yt=new Set(filterLibrary(songs,{ranges:['youtube100']}).map(s=>s.id));assert.equal(filterLibrary(songs,{ranges:['niconico100','youtube100']}).length,nico.size);
assert.equal(filterKey({ranges:['youtube100','legend'],from:'2009'}),filterKey({collection:'youtube100',from:2009}));assert.deepEqual(normalizeFilters({ranges:['nonexistent']}),normalizeFilters());
assert.equal(compareViews({status:'ok',count:123,snapshotAt:'one'},{status:'ok',count:123,snapshotAt:'two'}).status,'unknown');assert.equal(compareViews({status:'stale',count:123,snapshotAt:'one'},{status:'ok',count:123,snapshotAt:'one'}).status,'exact');
const representatives=JSON.parse(readFileSync('data/producer-representatives.json','utf8'));assert.equal(representatives.producers.length,100);for(const p of representatives.producers){assert.ok(p.selectedCount<=10);for(const song of p.songs)assert.ok(song.criteria.length>0);}for(const s of songs){assert.equal('bilibili' in s.videos,false);assert.equal(s.rankings.weekly.status,s.videos.niconico?'complete':'unavailable');}
console.log(JSON.stringify({passed:true,songs:songs.length,years2009to2013:range.length,billboardLibrary:recent.length,weeklyLibrary:older.length,checks:'single collection, legacy settings migration, ranked membership, inclusive years, empty range, chart scope, Top100, representative eligibility, missing chart comparisons'}));

assert.deepEqual(normalizeFilters({from:'',to:''}),{chart:'all',ranges:['all'],from:2007,to:2026});
assert.equal(normalizeFilters({from:2009}).to,2026);
assert.equal(normalizeFilters({to:2013}).from,2007);
assert.deepEqual(normalizeFilters({ranges:['classic','producers100']}),normalizeFilters());
