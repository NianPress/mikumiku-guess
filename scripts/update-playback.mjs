import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {nicoQuery} from '../server.mjs';

const NICO = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot';
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const valid = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value)>=0;

export async function collectPlayback(library,prior,key,{fetcher=fetch,pause=sleep,now=()=>new Date().toISOString()}={}) {
  if(!key) throw Error('请在 GitHub Actions Secrets 中配置 YOUTUBE_API_KEY');
  async function request(url,headers={}) {
    for(let attempt=0;attempt<3;attempt++) {
      let response;
      try {response = await fetcher(url,{headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(20000)});}
      catch {if(attempt===2) throw Error('平台连接失败，保留旧快照'); await pause(2000*(attempt+1)); continue;}
      if(response.ok) return response.json();
      if(attempt===2 || ![429,500,502,503,504].includes(response.status)) throw Error('平台查询失败 HTTP '+response.status+'，保留旧快照');
      await pause(response.status===503 ? 300000 : Math.max(2000*(attempt+1),Math.min(Number(response.headers.get('Retry-After')||0)*1000,300000)));
    }
  }
  const {last_modified:version} = await request(NICO+'/version');
  if(!Number.isFinite(Date.parse(version))) throw Error('Nico 快照版本无效');
  const niconico = {snapshotAt:version,fetchedAt:now(),source:'Niconico official Snapshot API; exact bound original IDs; version checked before and after collection',records:{}};
  const nicoIds = [...new Set(library.songs.filter(s=>s.videos.niconico?.active!==false).map(s=>s.videos.niconico?.id).filter(Boolean))];
  for(let i=0;i<nicoIds.length;i+=100) {
    const ids=nicoIds.slice(i,i+100),allowed=new Set(ids),response=await request(NICO+'/video/contents/search?'+nicoQuery(ids).split('?')[1]);
    if(response.meta?.status!==200 || !Array.isArray(response.data)) throw Error('Nico 快照响应无效');
    for(const row of response.data) if(allowed.has(row.contentId) && valid(row.viewCounter)) niconico.records[row.contentId]={count:Number(row.viewCounter),snapshotAt:version,fetchedAt:now()};
    await pause(1000);
  }
  if((await request(NICO+'/version')).last_modified!==version) throw Error('Nico 快照在采集中变化，保留旧快照');
  const time=now(),youtube={snapshotAt:time,fetchedAt:time,source:'YouTube Data API v3 videos.list; official original uploads only',records:{}};
  const youtubeIds = [...new Set(library.songs.filter(s=>s.videos.youtube?.active!==false).map(s=>s.videos.youtube?.id).filter(Boolean))];
  if(youtubeIds.some(id=>!/^[\w-]{11}$/.test(id))) throw Error('曲库中存在无效 YouTube 视频 ID');
  for(let i=0;i<youtubeIds.length;i+=50) {
    const ids=youtubeIds.slice(i,i+50),allowed=new Set(ids);
    const response=await request('https://www.googleapis.com/youtube/v3/videos?part=statistics&id='+ids.join(','),{'x-goog-api-key':key});
    if(!Array.isArray(response.items)) throw Error('YouTube 响应无效');
    for(const item of response.items) if(allowed.has(item.id) && valid(item.statistics?.viewCount)) youtube.records[item.id]={count:Number(item.statistics.viewCount),snapshotAt:time,fetchedAt:now()};
    await pause(250);
  }
  for(const [name,next] of [['niconico',niconico],['youtube',youtube]]) {
    const before=Object.keys(prior[name]?.records||{}).length,after=Object.keys(next.records).length;
    if(before>100 && after<before*0.8) throw Error(name+' 返回数据异常减少，需人工核对，旧快照未替换');
  }
  return {libraryVersion:library.version,niconico,youtube,updatedAt:now()};
}

export async function updatePlayback() {
  if(!process.env.YOUTUBE_API_KEY) throw Error('请配置 YOUTUBE_API_KEY');
  const library = JSON.parse(await readFile('dist/songs.json','utf8'));
  let prior;
  try {prior=JSON.parse(await readFile('data/playback-latest.json','utf8'));}
  catch(e) {if(e.code!=='ENOENT')throw e; prior={libraryVersion:library.version,niconico:JSON.parse(await readFile('data/niconico-snapshot.json','utf8')),youtube:JSON.parse(await readFile('data/youtube-snapshot.json','utf8'))};}
  const next=await collectPlayback(library,prior,process.env.YOUTUBE_API_KEY);
  await mkdir('data/playback-archive',{recursive:true});
  const archiveName = value => Buffer.from(value.updatedAt||'bundled-'+value.libraryVersion).toString('base64url')+'.json';
  await writeFile('data/playback-archive/'+archiveName(prior),JSON.stringify(prior));
  await writeFile('data/playback-archive/'+archiveName(next),JSON.stringify(next));
  await writeFile('data/playback-latest.json.tmp',JSON.stringify(next,null,2));
  await rename('data/playback-latest.json.tmp','data/playback-latest.json');
  console.log('Updated snapshot:',next.updatedAt,'Nico:',Object.keys(next.niconico.records).length,'YouTube:',Object.keys(next.youtube.records).length);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) updatePlayback().catch(error=>{console.error(error.message);process.exitCode=1;});
