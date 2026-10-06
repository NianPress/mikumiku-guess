import fs from 'node:fs';
import {normalize} from './dist/core.js';
const read=path=>JSON.parse(fs.readFileSync(path,'utf8'));
const save=(path,data)=>fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
const library=read('dist/songs.json'),audit=read('data/title-audit-v10.json'),readings=read('data/producer-readings-v10.json'),forms=read('data/title-readings-v10.json'),registry=read('data/producer-registry.json'),evidence=read('data/alias-sources.json'),overrides=read('data/song-producer-overrides.json');
const dedupe=values=>[...new Set(values.filter(v=>typeof v==='string'&&v.replace(/[\s\p{Cf}]/gu,'')).map(v=>v.trim().normalize('NFC')))];
const artistById=new Map(registry.artists.map(p=>[p.id,p]));
for(const item of readings.artists){const artist=artistById.get(item.id);if(!artist)throw Error('Missing producer identity '+item.id);artist.searchAliases=dedupe([...(artist.searchAliases||[]),...item.aliases]);}
for(const rejection of readings.aliasRejections||[]){const artist=artistById.get(rejection.id||rejection.artistId);if(!artist)continue;const key=normalize(rejection.value);artist.aliases=artist.aliases.filter(a=>normalize(a)!==key);artist.searchAliases=artist.searchAliases.filter(a=>normalize(a)!==key);}
for(const correction of audit.relatedArtistCorrections){const song=library.songs.find(s=>s.id===correction.id);const people=correction.suggestedNames.map(name=>{const p=registry.artists.find(p=>p.name===name);if(!p)throw Error('Unresolved joint author '+name);return p;});song.producers=people.map(p=>({id:p.id,name:p.name,aliases:p.aliases}));song.artistAudit={...song.artistAudit,creditEvidence:correction.source,reason:correction.reason};const replacement={songId:song.id,producers:people,creditEvidence:correction.source,reason:correction.reason};const index=overrides.songs.findIndex(s=>s.songId===song.id);if(index===-1)overrides.songs.push(replacement);else overrides.songs[index]={...overrides.songs[index],...replacement};}
for(const song of library.songs){song.producers=song.producers.map(p=>{const artist=artistById.get(p.id);if(!artist)throw Error('Missing artist '+p.id);return{...p,aliases:dedupe([artist.name,...artist.aliases]),searchAliases:artist.searchAliases||[]};});song.producerAliases=dedupe(song.producers.flatMap(p=>[p.name,...p.aliases]));song.producer=song.producers.map(p=>p.name).join(' × ');song.producerId=song.producers[0].id;}
const formsById=new Map(forms.songs.map(s=>[s.id,s])),byId=new Map(library.songs.map(s=>[s.id,s]));let aliasesRemoved=0;
for(const c of audit.corrections){
 const song=byId.get(c.id);if(!song||![c.before,c.after].includes(song.title))throw Error('Unexpected title state '+c.id);
 const oldTitle=c.before,reading=formsById.get(c.id),record=evidence.songs[c.id];
 const removeKeys=new Set([...(c.removeExactAliases||[]),...(reading?.oldGeneratedForms||[])].map(normalize));
 const canonicalKey=normalize(c.after),people=[...song.producers,...song.vocalists];
 const purePeople=new Set(people.flatMap(p=>[p.name,...p.aliases,...(p.searchAliases||[])]).map(normalize));
 const foreignMetadata=people.flatMap(p=>[p.name,...p.aliases]).map(normalize).filter(p=>p.length>=4&&!canonicalKey.includes(p));
 const verified=new Set((record?.aliases||[]).map(a=>normalize(a.text)));
 const allowed=alias=>{const key=normalize(alias);if(!alias.replace(/[\s\p{Cf}]/gu,''))return false;if(key===canonicalKey)return true;if(purePeople.has(key))return false;if(removeKeys.has(key)&&(!verified.has(key)||normalize(oldTitle)===key))return false;if(/(?:\bfeat\.?|\boriginal\b|\bofficial\b|\bMV\b|オリジナル曲?|原創|原创)/iu.test(alias))return false;if((c.removeAliasesMatching||[]).some(v=>alias.toLowerCase().includes(v.toLowerCase())))return false;return !foreignMetadata.some(p=>key.includes(p));};
 const existing=c.aliasMode==='replace_with_verified_song_only'?[]:song.aliases.filter(allowed);
 const next=dedupe([c.after,...existing,...c.cleanedSongOnlyAliases,...(reading?.aliases||[])]).filter(allowed);
 aliasesRemoved+=song.aliases.filter(a=>!next.includes(a)).length;song.title=c.after;song.aliases=next;
 if(c.aliasMode==='replace_with_verified_song_only')song.preferredChineseName=c.cleanedSongOnlyAliases.find(a=>a!==c.after&&/[\p{Script=Han}]/u.test(a)&&!/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(a))||null;
 if(c.versionLabel)song.versionLabel=c.versionLabel;
 if(c.versionLabelKind)song.versionLabelKind=c.versionLabelKind;
 song.titleAudit={checkedAt:'2026-10-04',previousCanonicalTitle:oldTitle,source:c.source,reason:c.reason};
 if(record){record.title=c.after;record.aliases=c.aliasMode==='replace_with_verified_song_only'?[]:record.aliases.filter(a=>allowed(a.text));for(const a of c.aliasEvidence||[]){if(!next.includes(a.value))continue;const source=a.sourceUrl||a.source,matchedPV=a.matchedPV||(a.derivedFrom&&(c.aliasEvidence||[]).find(b=>b.value===a.derivedFrom)?.matchedPV)||['niconico','youtube'].map(p=>song.videos[p]&&source===song.videos[p].url?p+':'+song.videos[p].id:null).find(Boolean);if(!matchedPV)throw Error('Unlinked alias evidence '+c.id+' / '+a.value);record.aliases.push({text:a.value,kind:a.sourceKind==='encyclopedia'?'encyclopedia_title':'official_song_name',sourceType:a.sourceKind||'official_original_upload',source,priority:a.priority||2,matchedPV});}record.aliases=[...new Map(record.aliases.map(a=>[a.text,a])).values()];record.preferredChineseName=song.preferredChineseName;record.hasVerifiedChinese=Boolean(song.preferredChineseName);}
}
// Author names stay exclusively in author search terms, including newly added readings.
for(const song of library.songs){const authors=new Set([song.producer,...song.producerAliases,...song.producers.flatMap(p=>p.searchAliases),song.videos.niconico?.author,song.videos.youtube?.author].filter(Boolean).map(normalize));const pure=alias=>!authors.has(normalize(alias));song.aliases=dedupe(song.aliases.filter(pure));if(evidence.songs[song.id])evidence.songs[song.id].aliases=evidence.songs[song.id].aliases.filter(a=>pure(a.text));}
library.version='2026-10-04-v10';registry.version='2026-10-04-artist-v10';registry.libraryVersion=library.version;evidence.libraryVersion=library.version;
library.artistMetadata={...library.artistMetadata,version:registry.version,multiProducerSongs:library.songs.filter(s=>s.producers.length>1).length,romanization:{version:readings.version,scope:'已核实读音及假名转写，仅用于作者检索',coverage:readings.coverage}};
library.titleMetadata={version:audit.version,scannedSongs:audit.coverage.scannedSongs,correctedTitles:audit.corrections.length,excludedSongs:audit.exclusions.length,policy:'可核实的原投稿曲名；简介中的正式曲名也可采用。歌姬/作者/投稿标识单独显示，官方命名版本保留。'};
save('dist/songs.json',library);save('data/producer-registry.json',registry);save('data/alias-sources.json',evidence);save('data/song-producer-overrides.json',overrides);
console.log(JSON.stringify({songs:library.songs.length,titleCorrections:audit.corrections.length,aliasesRemoved,multiProducerSongs:library.artistMetadata.multiProducerSongs}));
