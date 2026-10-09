import {readFile} from 'node:fs/promises';
export const repository='NianPress/mikumiku-guess';
export async function readReleases(){
 const releases=JSON.parse(await readFile('dist/updates.json','utf8')),seen=new Set();let previous;
 if(!Array.isArray(releases)||!releases.length)throw Error('At least one release is required');
 for(const note of releases){
  if(!/^\d+\.\d+\.\d+$/.test(note.version)||seen.has(note.version)||!/^\d{4}-\d{2}-\d{2}$/.test(note.date)||new Date(note.date+'T00:00:00Z').toISOString().slice(0,10)!==note.date||typeof note.title!=='string'||!note.title.trim()||!Array.isArray(note.changes)||!note.changes.length||note.changes.some(c=>typeof c!=='string'||!c.trim()))throw Error('Invalid release note');
  const version=note.version.split('.').map(Number);if(previous){const differing=version.findIndex((v,i)=>v!==previous[i]);if(differing<0||version[differing]>=previous[differing])throw Error('Releases must be in descending version order');}
  previous=version;seen.add(note.version);
 }
 return releases;
}
export function releaseBody(note){return `发布日期：${note.date}（北京时间）\n\n`+note.changes.map(change=>'- '+change).join('\n')+'\n\n[开始游玩](https://mikumiku-guess.online/)\n';}
export function changelog(releases){return '# 初一把更新公告\n\n[游戏网站](https://mikumiku-guess.online/) · [GitHub 仓库](https://github.com/'+repository+')\n\n'+releases.map(note=>`## v${note.version} · ${note.title}\n\n`+releaseBody(note)).join('\n');}
