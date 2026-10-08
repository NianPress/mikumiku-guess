import {readFile, writeFile, mkdir, readdir, rm, copyFile} from 'node:fs/promises';
import {resolve, relative} from 'node:path';
import {createHash} from 'node:crypto';
import {assetFiles} from '../asset-files.mjs';
import {publicLibrary, withRanks, snapshotRevision} from '../server.mjs';

export const fileId = id => Buffer.from(id).toString('base64url');
export async function readSnapshots() {
  const library = JSON.parse(await readFile('dist/songs.json', 'utf8'));
  let latest;
  try { latest = JSON.parse(await readFile('data/playback-latest.json', 'utf8')); }
  catch (e) { if(e.code !== 'ENOENT') throw e; }
  if (!latest) {
    const niconico = JSON.parse(await readFile('data/niconico-snapshot.json', 'utf8'));
    const youtube = JSON.parse(await readFile('data/youtube-snapshot.json', 'utf8'));
    latest = {libraryVersion:library.version, niconico, youtube,
      updatedAt:[niconico.fetchedAt, youtube.fetchedAt].filter(Boolean).sort().at(-1)};
  }
  if (latest.libraryVersion !== library.version) throw Error('播放量快照与曲库版本不一致');
  const snapshots = new Map([[snapshotRevision(latest), latest]]);
  try {
    for (const file of (await readdir('data/playback-archive')).filter(f=>f.endsWith('.json'))) {
      const snapshot = JSON.parse(await readFile('data/playback-archive/'+file,'utf8'));
      if (snapshot.libraryVersion === library.version) {
        snapshots.set(snapshotRevision(snapshot), snapshot);
        // The first build used fetchedAt as its revision, before the updater
        // archived the bundled snapshot without an updatedAt field.
        if (!snapshot.updatedAt) {
          const initialRevision = [snapshot.niconico.fetchedAt, snapshot.youtube.fetchedAt]
            .filter(Boolean).sort().at(-1);
          if (initialRevision && !snapshots.has(initialRevision)) snapshots.set(initialRevision, snapshot);
        }
      }
    }
  } catch(e) { if(e.code !== 'ENOENT') throw e; }
  return {library, latest, snapshots};
}

const {library:full, latest, snapshots} = await readSnapshots();
const library = withRanks(publicLibrary(full), latest);
const difficulties=JSON.parse(await readFile('data/difficulties.json','utf8'));
for(const [key,count] of [['easy',50],['normal',200],['hard',500]]){
 const ids=difficulties.presets[key];
 if(ids.length!==count||new Set(ids).size!==count||ids.some(id=>!library.songs.some(s=>s.id===id)))throw Error('Invalid difficulty '+key);
 if(key!=='easy'&&difficulties.presets[key==='normal'?'easy':'normal'].some(id=>!ids.includes(id)))throw Error('Difficulties must be nested');
}
library.difficultyInfo={version:difficulties.version,snapshotAt:difficulties.snapshotAt,scope:difficulties.scope,cohorts:difficulties.cohorts,quota:difficulties.quota};
for(const song of library.songs)song.difficulties=Object.keys(difficulties.presets).filter(key=>difficulties.presets[key].includes(song.id));
const output = resolve('.cloudflare/assets');
const sources=await Promise.all(assetFiles.filter(f=>f!=='songs.json').map(async file=>[file,await readFile('dist/'+file,'utf8')]));
const release=createHash('sha256').update(JSON.stringify(sources)+JSON.stringify(library.difficultyInfo)).digest('hex').slice(0,12);
// Delete generated output only; never remove source directories.
if (relative(resolve('.cloudflare'),output) !== 'assets') throw Error('Invalid build output');
// Keep the output root so Windows watchers do not lock its removal.
await mkdir(output,{recursive:true});
for(const name of await readdir(output)){
 const target=resolve(output,name);
 if(relative(output,target).startsWith('..'))throw Error('Invalid generated asset path');
 await rm(target,{recursive:true,force:true});
}
await mkdir(output+'/_game/songs',{recursive:true});
await mkdir(output+'/api',{recursive:true});
for (const [file,source] of sources) {
 const text=file.endsWith('.html')?source.replace(/((?:src|href)="\/[^"?]+\.(?:js|css))"/g,'$1?v='+release+'"')
  :file.endsWith('.js')?source.replace(/from\s*(['"])(\.\/[^'"?]+\.js)\1/g,(_,quote,path)=>'from'+quote+path+'?v='+release+quote):source;
 await writeFile(output+'/'+file,text);
}
const body = JSON.stringify(library);
await writeFile(output+'/api/library',body);
await writeFile(output+'/songs.json',body);
await writeFile(output+'/_game/catalog.json',JSON.stringify({version:library.version,revision:snapshotRevision(latest),
 songs:library.songs.map(s=>({id:s.id,year:s.year,collections:s.collections,difficulties:s.difficulties,rankings:Object.fromEntries(['billboard','weekly'].map(key=>[key,{weeks:s.rankings[key].weeks||0}]))}))}));
for (const song of library.songs) {
  const records = {}, nicoVersions = {};
  for (const [revision, snapshot] of snapshots) {
    const values = {};
    for (const platform of ['niconico','youtube']) {
      const video = song.videos[platform], source = snapshot[platform];
      const record = source.records[video?.id];
      values[platform] = !video ? {status:'unlinked',count:null,fetchedAt:null}
        : video.active === false ? {status:'unavailable',count:null,fetchedAt:null,url:video.url}
        : record ? {...record,status:'ok',url:video.url}
        : {status:'unindexed',count:null,fetchedAt:null,snapshotAt:source.snapshotAt};
    }
    records[revision] = values;
    if(snapshot.niconico.snapshotAt) nicoVersions[snapshot.niconico.snapshotAt] = values.niconico;
  }
  await writeFile(output+'/_game/songs/'+fileId(song.id)+'.json',JSON.stringify({
    song, records, nicoVersions
  }));
}
await writeFile(output+'/_headers',`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Cache-Control: public, max-age=300\n/api/library\n  Content-Type: application/json; charset=utf-8\n  Cache-Control: public, max-age=0, must-revalidate\n/_game/*\n  Cache-Control: public, max-age=3600\n`);
await mkdir('.cloudflare',{recursive:true});
await writeFile('.cloudflare/build-info.mjs','export default '+JSON.stringify({
  libraryVersion:library.version, revision:snapshotRevision(latest), updatedAt:latest.updatedAt,
  songs:library.songs.length, buildHash:createHash('sha256').update(body).digest('hex').slice(0,16)
})+';\n');
console.log('Cloudflare build:',library.songs.length,'songs,',snapshots.size,'snapshot revisions,',Buffer.byteLength(body),'library bytes');
