import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
export const strip=s=>s.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"');
export function parseBillboard(html,url){
 const date=html.match(/(\d{4})\/(\d{2})\/(\d{2})\s*(?:公開|付)/)?.slice(1).join('-');
 const rows=[...html.matchAll(/<tr\b[^>]*class="rank\d+"[\s\S]*?<\/tr>/g)].map(m=>{
  const h=m[0],id=h.match(/nicovideo\.jp\/watch\/((?:sm|nm|so)\d+)/)?.[1];
  return{id,rank:Number(h.match(/headers="rank"[^>]*>\s*<span>(\d+)/)?.[1]),title:strip(h.match(/class="musuc_title"[^>]*>([\s\S]*?)<\/p>/)?.[1]||''),artist:strip(h.match(/class="artist_name"[^>]*>([\s\S]*?)<\/p>/)?.[1]||''),cumulative:Number(h.match(/チャートイン：(\d+)/)?.[1])};
 }).filter(x=>x.rank>=1&&x.rank<=20);
 const previous=html.match(/href="([^"]+)"[^>]*>＜&nbsp;LastWeek/)?.[1]?.replaceAll('&amp;','&');
 if(!date||rows.length!==20||new Set(rows.map(x=>x.rank)).size!==20)throw new Error('Billboard format/coverage invalid: '+url);
 return{date,url,rows,previous:previous?new URL(previous,'https://www.billboard-japan.com').href:null};
}
export function parseLegacyWeekly(html,id){
 if(!html.includes('周刊Vocaloid'))throw new Error('Unexpected history HTML');
 // Archive history contains both main and auxiliary rows. The archive's onrank
 // marker is checked on the rank cell, then the historical TOP30 bound is applied.
 return[...html.matchAll(/<tr>[\s\S]*?<\/tr>/g)].flatMap(m=>{
  const row=m[0],episode=Number(row.match(/weeklies\/(\d+)/)?.[1]),rank=Number(row.match(/<td class="name onrank">\s*(\d+)位/)?.[1]);
  return episode>=1&&episode<=612&&rank>=1&&rank<=30?[{episode,rank,id}]:[];
 });
}
const root='D:/codex/reference-notes/chart-cache';
await mkdir(root,{recursive:true});
async function cached(url){
 const path=join(root,createHash('sha256').update(url).digest('hex')+'.html');
 try{return await readFile(path,'utf8')}catch{}
 for(let attempt=0;attempt<3;attempt++){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('HTTP '+r.status);const h=await r.text();if(h.length<2000)throw new Error('Empty response');await writeFile(path,h);return h}catch(e){if(attempt===2)throw e;await new Promise(r=>setTimeout(r,1000*(attempt+1)))}
 }
}
async function billboard(){
 const charts=[],seen=new Set();let url='https://www.billboard-japan.com/charts/detail/?a=niconico';
 while(url){const c=parseBillboard(await cached(url),url);if(seen.has(c.date))throw new Error('Repeated chart '+c.date);seen.add(c.date);charts.push(c);if(charts.length%25===0)console.log('Billboard:',charts.length,'through',c.date);if(c.date==='2022-12-07')break;if(c.date<'2022-12-07'||charts.length>220)throw new Error('Missing first chart');url=c.previous;}
 if(charts.at(-1)?.date!=='2022-12-07')throw new Error('First chart not reached');
 await writeFile('data/billboard-records.json',JSON.stringify({retrievedAt:'2026-10-02',from:'2022-12-07',through:charts[0].date,charts},null,2));console.log('Billboard complete:',charts.length);
}
async function weekly(){
 const library=JSON.parse(await readFile('dist/songs.json','utf8')),ids=[...new Set(library.songs.map(s=>s.videos.niconico?.id).filter(Boolean))];
 const records={},errors={};let next=0,done=0;
 await Promise.all(Array.from({length:3},async()=>{while(next<ids.length){const id=ids[next++];try{const h=await cached('https://www.vocarancn.cc/musics/'+id);records[id]=parseLegacyWeekly(h,id)}catch(e){errors[id]=e.message}done++;if(done%15===0)console.log('Weekly history:',done,'/',ids.length)}}));
 await writeFile('data/weekly-records.json',JSON.stringify({retrievedAt:'2026-10-02',fromEpisode:1,legacyThrough:612,modernThrough:null,status:'partial',scope:'Old TOP30; modern overall TOP10 awaits verified history; new-song and UTAU charts excluded',records,errors},null,2));console.log('Legacy weekly complete:',Object.keys(records).length,'errors',Object.keys(errors).length);
}
if(process.argv.includes('--collect')){await mkdir('data',{recursive:true});await Promise.all([billboard(),weekly()]);}
