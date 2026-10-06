import fs from 'node:fs';
import {normalize} from './dist/core.js';
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const save=(path,data)=>fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
const library=read('dist/songs.json'),registry=read('data/producer-registry.json'),mapping=read('data/producer-id-map.json'),overrides=read('data/song-producer-overrides.json'),singerRegistry=read('data/singer-registry.json'),evidence=read('data/alias-sources.json');
const titleAliases={
 'youtube:heTaHWABCOo':['私の恋はヘルファイア','わたしのこいはヘルファイア','watashi no koi wa hellfire','watashi no koi ha herufaia'],
 'youtube:efXqozK4A40':['プシ','ぷし','Pushi','Pusi'],
 'youtube:qiMQWPI_u3Y':['ふぁうんどふってーじ','ファウンドフッテージ','Found Footage','faundo futteeji']
};
for(const correction of read('data/artist-identity-corrections.json')){const song=library.songs.find(s=>s.id===correction.songId);if(!song)throw new Error('Unknown title correction '+correction.songId);song.title=correction.suggestedTitle;song.aliases=titleAliases[song.id];song.artistAudit={...song.artistAudit,titleCorrection:correction};if(evidence.songs[song.id])evidence.songs[song.id].aliases=[];}
const artists=new Map(registry.artists.map(p=>[p.id,p])),songOverrides=new Map(overrides.songs.map(s=>[s.songId,s])),singerAliases=new Map();
const dedupe=names=>[...new Set(names.filter(n=>typeof n==='string'&&n.trim()).map(n=>n.trim()))];
const rejectedByArtist=new Map();for(const r of read('data/artist-rejections.json').rejected||[]){if(r.artistId){const set=rejectedByArtist.get(r.artistId)||new Set();set.add(normalize(r.value));rejectedByArtist.set(r.artistId,set);}}
for(const p of singerRegistry.artists||singerRegistry.singers||singerRegistry){for(const alias of [p.name,...p.aliases]){const key=normalize(alias),other=singerAliases.get(key);if(other&&other.id!==p.id)throw new Error('Conflicting singer identity: '+alias);singerAliases.set(key,p);}}
// Propagate only aliases of confirmed single artists; composite uploader names
// must not leak into a collaborator’s personal alias list.
for(const song of library.songs){const id=mapping.byExistingId[song.producerId]||mapping.byExistingName[song.producer]||song.producerId;if(!songOverrides.has(song.id)){let p=artists.get(id);if(!p){p={id,name:song.producer,aliases:[],sources:[{kind:'previous-catalog',url:song.source}],aliasEvidence:[]};artists.set(id,p);}p.aliases=dedupe([p.name,...p.aliases,...song.producerAliases,song.producer]);}}
for(const p of artists.values()){const rejected=rejectedByArtist.get(p.id);if(rejected){p.aliases=p.aliases.filter(a=>!rejected.has(normalize(a)));p.aliasEvidence=(p.aliasEvidence||[]).filter(a=>!rejected.has(normalize(a.value)));}}
let multiProducer=0,multiSinger=0,removedAliases=0;
for(const song of library.songs){
 const override=songOverrides.get(song.id),id=mapping.byExistingId[song.producerId]||mapping.byExistingName[song.producer];
 let people=override?.producers.map(p=>{if(!artists.has(p.id))artists.set(p.id,p);return artists.get(p.id);})||[id?artists.get(id):{id:song.producerId,name:song.producer,aliases:song.producerAliases}];
 if(people.some(p=>!p))throw new Error('Missing producer for '+song.id);
 song.producers=[...new Map(people.map(p=>[p.id,{id:p.id,name:p.name,aliases:dedupe([p.name,...p.aliases]),searchAliases:dedupe(p.searchAliases||[])}])).values()];
 song.producerId=song.producers[0].id;song.producer=song.producers.map(p=>p.name).join(' × ');song.producerAliases=dedupe(song.producers.flatMap(p=>[p.name,...p.aliases]));
 song.producerSearchAliases=dedupe(override?.additionalSearchAliases||song.producerSearchAliases||[]);
 const originalSingers=song.singers;
 song.vocalists=[...new Map(originalSingers.map(name=>{const p=singerAliases.get(normalize(name));if(!p)throw new Error('Unmapped singer: '+name);return[p.id,{id:p.id,name:p.name,aliases:dedupe([p.name,...p.aliases])}];})).values()];
 song.singers=song.vocalists.map(p=>p.name);
 if(override)song.artistAudit={...song.artistAudit,reason:override.reason,creditEvidence:override.creditEvidence};
 const producerNames=new Set([song.producer,...song.producerAliases,song.videos.niconico?.author,song.videos.youtube?.author].filter(Boolean).map(normalize));
 const rejected=song.aliases.filter(a=>producerNames.has(normalize(a)));removedAliases+=rejected.length;
 song.aliases=song.aliases.filter(a=>!producerNames.has(normalize(a)));
 if(rejected.length){song.aliasAudit={...song.aliasAudit,rejectedArtistAliases:dedupe([...(song.aliasAudit?.rejectedArtistAliases||[]),...rejected])};if(evidence.songs[song.id])evidence.songs[song.id].aliases=evidence.songs[song.id].aliases.filter(a=>!producerNames.has(normalize(a.text)));}
 if(song.producers.length>1)multiProducer++;if(song.vocalists.length>1)multiSinger++;
}
library.version=registry.libraryVersion||library.version;library.artistMetadata={version:registry.version,producerIdentityCount:artists.size,singerIdentityCount:new Set(library.songs.flatMap(s=>s.vocalists.map(p=>p.id))).size,multiProducerSongs:multiProducer,multiSingerSongs:multiSinger,scope:'主要音乐作者与官方联合署名创作者；共同人员独立判定，歌姬用官方原名，中文及英文别名仅供检索'};
save('dist/songs.json',library);save('data/producer-registry.json',{...registry,artists:[...artists.values()]});save('data/alias-sources.json',evidence);
console.log(JSON.stringify({songs:library.songs.length,...library.artistMetadata,removedAliases}));
