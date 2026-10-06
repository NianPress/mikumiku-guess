import {readFileSync,writeFileSync} from 'node:fs';
import {coverCandidates} from './dist/covers.js';
const library=JSON.parse(readFileSync('dist/songs.json','utf8')),covers=JSON.parse(readFileSync('data/song-covers.json','utf8'));
for(const song of library.songs){song.cover=covers.songs[song.id]||{candidates:[]};song.cover.candidates=coverCandidates(song)}
writeFileSync('dist/songs.json',JSON.stringify(library,null,2));
console.log(JSON.stringify({songs:library.songs.length,withCover:library.songs.filter(s=>s.cover.candidates.length).length,libraryVersion:library.version}));
