const providerCache=new Map();
const NICO_API='https://snapshot.search.nicovideo.jp/api/v2/snapshot';
const OBJECT_KEY='playback/latest.json';
const PLATFORM_NAMES=['niconico','youtube'];
const youtubePending=new Map(),requestWindows=new Map();
const coverPending=new Map();
const YOUTUBE_CACHE_MS=60000,YOUTUBE_FAILURE_MS=10000;
let latestMemory=null,latestChecked=0,versionCache=null,versionChecked=0,refreshPromise=null;
function validCount(value){return Number.isSafeInteger(Number(value))&&Number(value)>=0&&/^\d+$/.test(String(value));}
function notModified(request,etag){const expected=etag?.replace(/^W\//,'');return!!expected&&(request.headers.get('If-None-Match')||'').split(',').some(value=>value.trim()==='*'||value.trim().replace(/^W\//,'')===expected);}
export function publicLibrary(library){
 const pick=(value,fields)=>Object.fromEntries(fields.filter(field=>value?.[field]!==undefined).map(field=>[field,value[field]]));
 const fields=['id','title','aliases','producer','producerId','producerAliases','producerSearchAliases','singers','year','publishDate','duration','source','originalUrl','collections','platformRanks','preferredChineseName','versionLabel','versionLabelKind'];
 return{...pick(library,['version','retrievedAt','source','scope']),charts:library.charts,collectionSources:{playbackRanking:library.collectionSources?.playbackRanking},songs:library.songs.map(song=>({
  ...pick(song,fields),
  producers:song.producers?.map(person=>pick(person,['id','name','aliases','searchAliases'])),vocalists:song.vocalists?.map(person=>pick(person,['id','name','aliases','searchAliases'])),
  videos:Object.fromEntries(Object.entries(song.videos).map(([platform,video])=>[platform,video?pick(video,['id','url','active']):null])),
  rankings:Object.fromEntries(Object.entries(song.rankings).map(([chart,rank])=>[chart,pick(rank,['status','weeks','peak','knownWeeks','knownPeak','reason'])])),
  cover:{candidates:(song.cover?.candidates||[]).map(cover=>pick(cover,['platform','videoId','url','width','height']))}
 }))};
}
async function upstream(url,extraHeaders={}){const r=await fetch(url,{headers:{Accept:'application/json','User-Agent':'MikuSongGuess/1.0',...extraHeaders},signal:AbortSignal.timeout(7000)});if(!r.ok){const e=new Error('Upstream HTTP '+r.status);e.status=r.status;throw e;}return r.json();}
function providerError(error){return error.code|| (error.status?'platform_http_'+error.status:error.name==='TimeoutError'||error.name==='AbortError'?'timeout':error.name==='SyntaxError'?'response_parse_error':'upstream_unavailable');}
function rememberYoutube(key,result){providerCache.set(key,{time:Date.now(),result});if(providerCache.size>2500)providerCache.delete(providerCache.keys().next().value);return result;}
function freshYoutube(record){const age=Date.now()-Date.parse(record?.fetchedAt);return validCount(record?.count)&&age>=0&&age<YOUTUBE_CACHE_MS;}
function quotaDay(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(kind=>parts.find(p=>p.type===kind).value).join('-');}
export async function reserveYoutubeQuota(env,units=1,maintenance=false){
 if(!Number.isInteger(units)||units<1)return false;
 if(!env.BUCKET)throw Error('Playback quota storage unavailable');
 const path='playback/youtube-quota/'+quotaDay()+'.json',ceiling=maintenance?9500:8000;
 for(let attempt=0;attempt<5;attempt++){
  const object=await env.BUCKET.get(path),prior=object?await object.json():{used:0};
  if(!Number.isInteger(prior.used)||prior.used<0)throw Error('Invalid quota record');
  if(prior.used+units>ceiling)return false;
  const onlyIf=object?{etagMatches:object.etag}:new Headers({'If-None-Match':'*'});
  const saved=await env.BUCKET.put(path,JSON.stringify({used:prior.used+units}),{onlyIf});
  if(saved)return true;
 }
 return false;
}
export async function readYouTubeVideos(videos,env={},fallbacks={}){
 const output={},pending=[];
 await Promise.all([...new Map(videos.map(v=>[v.id,v])).values()].map(async video=>{
  const key=video.id+':'+(env.YOUTUBE_API_KEY?'api':'missing'),saved=providerCache.get(key);
  if(saved&&(saved.result.status==='ok'?freshYoutube(saved.result):Date.now()-saved.time<YOUTUBE_FAILURE_MS)){output[video.id]=saved.result;return;}
  if(youtubePending.has(key)){output[video.id]=await youtubePending.get(key);return;}
  try{const shared=await(await env.BUCKET?.get('playback/youtube-live/'+video.id+'.json'))?.json();if(freshYoutube(shared)){output[video.id]=rememberYoutube(key,{...shared,status:'ok',url:video.url});return;}}
  catch{console.warn('youtube_cache_read_failed');}
  pending.push({video,key});
 }));
 const missing=[],waiting=[];
 for(const item of pending){const inflight=youtubePending.get(item.key);if(inflight)waiting.push(inflight.then(result=>{output[item.video.id]=result;}));else missing.push(item);}
 if(!missing.length){await Promise.all(waiting);return output;}
 const job=(async()=>{
  const results={};
  try{
   if(!env.YOUTUBE_API_KEY)throw Error('YouTube key missing');
   if(missing.some(({video})=>!/^[\w-]{11}$/.test(video.id)))throw Error('Invalid YouTube ID');
   if(!await reserveYoutubeQuota(env)){const error=new Error('Daily playback budget reached');error.code='daily_quota_guard';throw error;}
   const data=await upstream('https://www.googleapis.com/youtube/v3/videos?part=statistics&id='+missing.map(({video})=>video.id).join(','),{'x-goog-api-key':env.YOUTUBE_API_KEY});
   if(!Array.isArray(data.items))throw Error('YouTube statistics unavailable');
   const fetchedAt=new Date().toISOString();
   await Promise.all(missing.map(async({video,key})=>{
    const item=data.items.find(item=>item.id===video.id),fallback=fallbacks[video.id];
    const result=item&&validCount(item.statistics?.viewCount)?{status:'ok',count:Number(item.statistics.viewCount),fetchedAt,url:video.url}:fallback?{...fallback,status:'stale',url:video.url,errorCode:'video_unavailable',reason:'原投稿暂时无法读取，保留最近核实播放量'}:{status:'unavailable',count:null,fetchedAt:null,url:video.url};
    results[video.id]=rememberYoutube(key,result);
    if(result.status==='ok'&&env.BUCKET)try{await env.BUCKET.put('playback/youtube-live/'+video.id+'.json',JSON.stringify({count:result.count,fetchedAt}));}catch{console.warn('youtube_cache_write_failed');}
   }));
  }catch(error){for(const{video,key}of missing){const fallback=fallbacks[video.id];results[video.id]=rememberYoutube(key,fallback?{...fallback,status:'stale',url:video.url,errorCode:providerError(error),reason:'更新暂失败，显示最近核实播放量'}:{status:'error',count:null,fetchedAt:null,url:video.url,errorCode:providerError(error),reason:'YouTube 暂时无法读取'});}}
  return results;
 })();
 for(const{video,key}of missing){const promise=job.then(results=>results[video.id]).finally(()=>youtubePending.delete(key));youtubePending.set(key,promise);}
 Object.assign(output,await job);await Promise.all(waiting);return output;
}
export async function validRefreshToken(request,env){
 const token=request.headers.get('X-Playback-Refresh-Token'),expected=env.PLAYBACK_REFRESH_TOKEN;
 if(!token||!expected||token.length>4096)return false;
 const hashes=await Promise.all([token,expected].map(value=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
 const a=new Uint8Array(hashes[0]),b=new Uint8Array(hashes[1]);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];return mismatch===0;
}
export function allowPlaybackRequest(request,now=Date.now()){
 const ip=request.headers.get('CF-Connecting-IP'),key=ip||'unidentified',limit=ip?60:600,minute=Math.floor(now/60000);
 const prior=requestWindows.get(key),entry=prior?.minute===minute?prior:{minute,count:0};
 entry.count++;requestWindows.set(key,entry);
 if(requestWindows.size>10000)for(const[id,value]of requestWindows){if(value.minute!==minute)requestWindows.delete(id);}
 if(requestWindows.size>10000)requestWindows.delete(requestWindows.keys().next().value);
 return entry.count<=limit;
}
export function officialCovers(song){
 return(song?.cover?.candidates||[]).filter(cover=>{
  const video=song.videos?.[cover.platform];if(!video||video.active===false||video.id!==cover.videoId)return false;
  try{const target=new URL(cover.url);return target.protocol==='https:'&&!target.username&&!target.password&&!target.port&&(cover.platform==='niconico'?target.hostname==='nicovideo.cdn.nimg.jp'&&target.pathname.startsWith('/thumbnails/'+video.id.replace(/^(sm|nm|so)/,'')+'/'):cover.platform==='youtube'?target.hostname==='i.ytimg.com'&&target.pathname.startsWith('/vi/'+video.id+'/'):false);}catch{return false;}
 }).filter((cover,index,all)=>all.findIndex(c=>c.url===cover.url)===index);
}
async function loadCover(cover,env){
 const fingerprint=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(cover.url)));
 const key='covers/'+cover.platform+'/'+cover.videoId+'/'+Array.from(fingerprint,byte=>byte.toString(16).padStart(2,'0')).join('')+'.img';
 if(env.BUCKET)try{const stored=await env.BUCKET.get(key);if(stored?.body&&stored.customMetadata?.source===cover.url&&/^image\/(jpeg|png|webp|gif)$/.test(stored.httpMetadata?.contentType||''))return{body:stored.body,type:stored.httpMetadata.contentType};}catch{console.warn('cover_cache_read_failed');}
 if(coverPending.has(key))return coverPending.get(key);
 const job=(async()=>{
  const response=await fetch(cover.url,{redirect:'manual',headers:{Accept:'image/jpeg,image/png,image/webp,image/gif'},signal:AbortSignal.timeout(7000)}),type=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
  if(!response.ok){const error=new Error('Cover upstream failed');error.status=response.status;throw error;}
  if(!/^image\/(jpeg|png|webp|gif)$/.test(type)||Number(response.headers.get('Content-Length')||0)>2*1024*1024)throw Error('Cover type or size rejected');
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw Error('Cover too large');}chunks.push(value);}
  if(!size)throw Error('Empty cover');const body=new Uint8Array(size);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  if(env.BUCKET)try{await env.BUCKET.put(key,body,{httpMetadata:{contentType:type},customMetadata:{source:cover.url}});}catch{console.warn('cover_cache_write_failed');}
  return{body,type};
 })().finally(()=>coverPending.delete(key));coverPending.set(key,job);return job;
}
export function nicoQuery(ids){if(!ids.length||ids.length>100||ids.some(id=>!/^(?:sm|nm|so)\d+$/.test(id)))throw Error('Invalid Nico ID batch');const p=new URLSearchParams({q:'',targets:'title',fields:'contentId,viewCounter',_sort:'-viewCounter',_limit:'100',_context:'miku_song_guess'});ids.forEach((id,i)=>p.set('filters[contentId]['+i+']',id));return NICO_API+'/video/contents/search?'+p;}
export async function readNicoBatch(ids,snapshotAt){const data=await upstream(nicoQuery(ids));if(data.meta?.status!==200||!Array.isArray(data.data))throw Error('Invalid Snapshot response');const records={},allowed=new Set(ids),fetchedAt=new Date().toISOString();for(const row of data.data)if(allowed.has(row.contentId)&&validCount(row.viewCounter))records[row.contentId]={count:Number(row.viewCounter),snapshotAt,fetchedAt};return records;}
async function currentVersion(force=false){if(!force&&versionCache&&Date.now()-versionChecked<3600000)return versionCache;const d=await upstream(NICO_API+'/version');if(typeof d.last_modified!=='string'||!Number.isFinite(Date.parse(d.last_modified)))throw Error('Invalid Snapshot version');versionCache=d.last_modified;versionChecked=Date.now();return versionCache;}
export async function readProvider(platform,video,env={},fallback=null){
 if(!video)return{status:'unlinked',count:null,fetchedAt:null,reason:'尚未收录已核实的官方投稿'};
 if(video.active===false)return{status:'unavailable',count:null,fetchedAt:null,url:video.url,reason:'原投稿已失效'};
 if(platform==='niconico'){
  try{const snapshotAt=await currentVersion();if(fallback?.snapshotAt===snapshotAt)return{...fallback,status:'ok',url:video.url};const rows=await readNicoBatch([video.id],snapshotAt),r=rows[video.id];return r?{...r,status:'ok',url:video.url}:{status:'unindexed',count:null,snapshotAt,fetchedAt:new Date().toISOString(),url:video.url,reason:'官方快照未收录此投稿'};}
  catch(e){return fallback?{...fallback,status:'stale',url:video.url,errorCode:providerError(e),reason:'更新暂失败，保留最近一次成功的快照'}:{status:'error',count:null,url:video.url,fetchedAt:null,errorCode:providerError(e),reason:'官方快照暂时无法读取'};}
 }
 if(platform!=='youtube')return{status:'unlinked',count:null,fetchedAt:null};
 return(await readYouTubeVideos([video],env,{[video.id]:fallback}))[video.id];
}
async function storedSnapshot(env,bundled){if(latestMemory?.libraryVersion===bundled.libraryVersion&&Date.now()-latestChecked<300000)return latestMemory;let saved=null;try{saved=env.BUCKET?await(await env.BUCKET.get(OBJECT_KEY))?.json():null;}catch{console.warn('playback_storage_read_failed');}latestMemory=saved?.libraryVersion===bundled.libraryVersion?saved:bundled;latestChecked=Date.now();return latestMemory;}
function snapshotPath(version){return'playback/nico-'+encodeURIComponent(version)+'.json';}
async function pinnedNico(version,env,snapshot,bundled){if(!version||snapshot.niconico.snapshotAt===version)return snapshot.niconico;if(bundled.niconico.snapshotAt===version)return bundled.niconico;if(!Number.isFinite(Date.parse(version)))return null;try{return await(await env.BUCKET?.get(snapshotPath(version)))?.json()||null;}catch{return null;}}
export function withRanks(library,snapshot){const songs=library.songs.map(s=>({...s,collections:(s.collections||[]).filter(c=>!['niconico100','youtube100'].includes(c)),platformRanks:{}}));for(const song of songs){const count=snapshot.niconico.records[song.videos.niconico?.id]?.count;if(count>=1e6&&!song.collections.includes('legend'))song.collections.push('legend');if(count>=1e7&&!song.collections.includes('myth'))song.collections.push('myth');}for(const p of PLATFORM_NAMES){const available=songs.filter(s=>snapshot[p].records[s.videos[p]?.id]);available.sort((a,b)=>snapshot[p].records[b.videos[p].id].count-snapshot[p].records[a.videos[p].id].count||a.id.localeCompare(b.id));available.slice(0,100).forEach((s,i)=>{s.collections.push(p+'100');s.platformRanks[p]=i+1;});}return{...library,songs,collectionSources:{...library.collectionSources,playbackRanking:{scope:'已收录且已核实的曲目',niconicoSnapshotAt:snapshot.niconico.snapshotAt,youtubeSnapshotAt:snapshot.youtube.snapshotAt}},playbackUpdate:{updatedAt:snapshot.updatedAt||null,revision:snapshotRevision(snapshot),cadence:'weekly',schedule:'每周一 07:00（北京时间）'}};}
export async function refreshPlayback(library,env,bundled,options={}){
 if(!env.BUCKET)throw Error('Snapshot storage unavailable');
 const prior=await storedSnapshot(env,bundled),now=options.now??Date.now();if(!options.force&&prior.updatedAt&&Date.parse(prior.updatedAt)>=Date.parse(weeklySlot(now)))return{skipped:true,updatedAt:prior.updatedAt,nextUpdateAt:nextWeeklyUpdate(now),cadence:'weekly'};if(!env.YOUTUBE_API_KEY)throw Error('YouTube refresh key unavailable');const before=await currentVersion(true);const ids=[...new Set(library.songs.filter(s=>s.videos.niconico?.active!==false).map(s=>s.videos.niconico?.id).filter(Boolean))];
 const nico={snapshotAt:before,fetchedAt:new Date().toISOString(),records:{}};let previousDuration=0;
 if(prior.niconico.snapshotAt===before&&ids.every(id=>prior.niconico.records[id]||!bundled.niconico.records[id]))Object.assign(nico.records,prior.niconico.records);
 else for(let i=0;i<ids.length;i+=100){if(previousDuration)await new Promise(r=>setTimeout(r,previousDuration));const start=Date.now();Object.assign(nico.records,await readNicoBatch(ids.slice(i,i+100),before));previousDuration=Date.now()-start;}
 const after=await upstream(NICO_API+'/version');if(after.last_modified!==before)throw Error('Snapshot changed during refresh');
 const youtube={snapshotAt:new Date().toISOString(),fetchedAt:new Date().toISOString(),records:{...prior.youtube.records}};
 if(env.YOUTUBE_API_KEY){const videoIds=[...new Set(library.songs.filter(s=>s.videos.youtube?.active!==false).map(s=>s.videos.youtube?.id).filter(Boolean))];if(videoIds.length&&!await reserveYoutubeQuota(env,Math.ceil(videoIds.length/50),true))throw Error('Daily refresh budget reached');for(let i=0;i<videoIds.length;i+=50){const batch=videoIds.slice(i,i+50),data=await upstream('https://www.googleapis.com/youtube/v3/videos?part=statistics&id='+batch.join(','),{'x-goog-api-key':env.YOUTUBE_API_KEY});if(!Array.isArray(data.items))throw Error('YouTube refresh failed');const seen=new Set();for(const item of data.items)if(batch.includes(item.id)&&validCount(item.statistics?.viewCount)){seen.add(item.id);youtube.records[item.id]={count:Number(item.statistics.viewCount),snapshotAt:youtube.snapshotAt,fetchedAt:youtube.fetchedAt};}for(const id of batch)if(!seen.has(id))delete youtube.records[id];}}
 const saved={libraryVersion:library.version,niconico:nico,youtube,updatedAt:new Date().toISOString()};
 await env.BUCKET.put(weeklyPath(snapshotRevision(prior)),JSON.stringify(prior));await env.BUCKET.put(weeklyPath(snapshotRevision(saved)),JSON.stringify(saved));await env.BUCKET.put(snapshotPath(prior.niconico.snapshotAt),JSON.stringify(prior.niconico));await env.BUCKET.put(snapshotPath(before),JSON.stringify(nico));await env.BUCKET.put(OBJECT_KEY,JSON.stringify(saved));latestMemory=saved;latestChecked=Date.now();return{updatedAt:saved.updatedAt,niconicoSnapshotAt:before,niconicoRecords:Object.keys(nico.records).length,youtubeRecords:Object.keys(youtube.records).length};
}

// The playback writer and anonymous feedback tickets have distinct scopes.
const feedbackWindows=new Map();
export function weeklySlot(now=Date.now()){
 const date=new Date(now+3600000); // Beijing 07:00 is 23:00 UTC on the previous day.
 const day=(date.getUTCDay()+6)%7;
 return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-day)-3600000).toISOString();
}
export function nextWeeklyUpdate(now=Date.now()){return new Date(Date.parse(weeklySlot(now))+7*86400000).toISOString();}
export function snapshotRevision(snapshot){return snapshot.updatedAt||'bundled-'+snapshot.libraryVersion;}
function weeklyPath(revision){return'playback/weekly-'+encodeURIComponent(revision)+'.json';}
async function pinnedSnapshot(revision,env,snapshot,bundled){
 if(!revision||revision===snapshotRevision(snapshot))return snapshot;
 if(revision===snapshotRevision(bundled))return bundled;
 if(revision.length>100||!Number.isFinite(Date.parse(revision)))return null;
 try{const saved=await(await env.BUCKET?.get(weeklyPath(revision)))?.json();return saved?.libraryVersion===bundled.libraryVersion?saved:null;}catch{return null;}
}
function sameOrigin(request){const origin=new URL(request.url).origin;return(!request.headers.get('Origin')||request.headers.get('Origin')===origin)&&request.headers.get('Sec-Fetch-Site')!=='cross-site';}
const encoder=new TextEncoder();
function toBase64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromBase64(text){return Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
async function feedbackKey(env){return crypto.subtle.importKey('raw',encoder.encode('chu-yiba-feedback-v1:'+env.PLAYBACK_REFRESH_TOKEN),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function clientFingerprint(request){const digest=await crypto.subtle.digest('SHA-256',encoder.encode(request.headers.get('CF-Connecting-IP')||'unknown'));return toBase64(new Uint8Array(digest));}
export async function issueFeedbackTicket(request,env,now=Date.now()){
 if(!env.PLAYBACK_REFRESH_TOKEN)throw Error('Feedback signing unavailable');
 const payload=toBase64(encoder.encode(JSON.stringify({scope:'feedback',nonce:crypto.randomUUID(),expires:now+15*60000,client:await clientFingerprint(request)})));
 return payload+'.'+toBase64(new Uint8Array(await crypto.subtle.sign('HMAC',await feedbackKey(env),encoder.encode(payload))));
}
export async function verifyFeedbackTicket(request,env,now=Date.now()){
 try{
  const ticket=request.headers.get('X-Feedback-Ticket');if(!ticket||ticket.length>1024||!env.PLAYBACK_REFRESH_TOKEN)return null;
  const [payload,signature,...extra]=ticket.split('.');if(extra.length||!payload||!signature)return null;
  if(!await crypto.subtle.verify('HMAC',await feedbackKey(env),fromBase64(signature),encoder.encode(payload)))return null;
  const value=JSON.parse(new TextDecoder().decode(fromBase64(payload)));
  return value.scope==='feedback'&&typeof value.nonce==='string'&&Number.isFinite(value.expires)&&value.expires>now&&value.expires<=now+15*60000&&value.client===await clientFingerprint(request)?value:null;
 }catch{return null;}
}
function allowFeedback(request,now=Date.now()){
 const ip=request.headers.get('CF-Connecting-IP')||'unknown',hour=Math.floor(now/3600000),key=ip;
 let item=feedbackWindows.get(key);if(item?.hour!==hour)item={hour,count:0};item.count++;feedbackWindows.set(key,item);
 if(feedbackWindows.size>10000)for(const[k,v]of feedbackWindows)if(v.hour!==hour)feedbackWindows.delete(k);
 return item.count<=(ip==='unknown'?100:5);
}
export async function feedbackEndpoint(request,env,headers){
 const json=(body,status=200)=>Response.json(body,{status,headers:{...headers,'Cache-Control':'no-store'}});
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!sameOrigin(request)||request.headers.get('Content-Type')!=='application/json'||request.headers.get('X-Feedback-Submission')!=='1')return json({error:'无法提交此请求'},403);
 const ticket=await verifyFeedbackTicket(request,env);if(!ticket)return json({error:'提交凭据已过期，请重试'},403);
 if(!env.DB)return json({error:'反馈暂时无法保存，请稍后重试'},503);
 let body;
 try{if(Number(request.headers.get('Content-Length')||0)>16384)return json({error:'内容过长'},413);const reader=request.body?.getReader();if(!reader)return json({error:'缺少内容'},400);let size=0,parts=[];for(;;){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16384){await reader.cancel();return json({error:'内容过长'},413);}parts.push(value);}const bytes=new Uint8Array(size);let at=0;for(const part of parts){bytes.set(part,at);at+=part.byteLength;}body=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'内容格式有误'},400);}
 if(!body||typeof body!=='object'||!Number.isInteger(body.rating)||body.rating<1||body.rating>5||typeof body.message!=='string'||body.message.length>2000||typeof body.id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.id)||!['/','/daily','/single'].includes(body.page)||body.website)return json({error:'请选择 1–5 分，建议不超过 2000 字'},400);
 try{
  const prior=await env.DB.prepare('SELECT id, rating, message, page, created_at FROM feedback WHERE id = ?').bind(body.id).first();
  if(prior)return prior.rating===body.rating&&prior.message===body.message.trim()&&prior.page===body.page?json({id:prior.id,createdAt:prior.created_at,duplicate:true}):json({error:'提交内容已改变，请重新提交'},409);
  if(!allowFeedback(request))return json({error:'提交较频繁，请稍后再试'},429);
  const isTest=request.headers.get('X-Feedback-Test')==='1'&&await validRefreshToken(request,env)?1:0,createdAt=new Date().toISOString();
  await env.DB.prepare('INSERT INTO feedback (id, rating, message, page, created_at, ticket_id, is_test) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').bind(body.id,body.rating,body.message.trim(),body.page,createdAt,ticket.nonce,isTest).run();
  const saved=await env.DB.prepare('SELECT id, rating, message, page, created_at FROM feedback WHERE id = ?').bind(body.id).first();
  if(!saved||saved.rating!==body.rating||saved.message!==body.message.trim()||saved.page!==body.page)return json({error:'提交凭据已使用，请重试'},409);
  return json({id:saved.id,createdAt:saved.created_at},201);
 }catch{console.warn('feedback_save_failed');return json({error:'反馈暂时无法保存，内容已保留'},503);}
}

export function createHandler(assets,library,bundled={libraryVersion:library.version,niconico:{records:{},snapshotAt:null},youtube:{records:{},snapshotAt:null}}){
 library=publicLibrary(library);
 const songs=new Map(library.songs.map(s=>[s.id,s]));
 let cachedLibrarySnapshot=null,cachedLibraryPayload=null;
 function libraryPayload(snapshot){
  if(cachedLibrarySnapshot!==snapshot){cachedLibrarySnapshot=snapshot;cachedLibraryPayload=(async()=>{const body=JSON.stringify(withRanks(library,snapshot));const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(body)));return{body,etag:'"'+Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('')+'"'};})();}
  return cachedLibraryPayload;
 }
 return{async fetch(request,env={}){
  const url=new URL(request.url),headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
  if(url.pathname==='/api/feedback')return feedbackEndpoint(request,env,headers);
  if(url.pathname==='/api/feedback-ticket'){
   if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers});
   if(!sameOrigin(request))return new Response('Forbidden',{status:403,headers});
   if(!allowPlaybackRequest(request))return Response.json({error:'请求较频繁，请稍后再试'},{status:429,headers:{...headers,'Cache-Control':'no-store'}});
   try{return Response.json({ticket:await issueFeedbackTicket(request,env)},{headers:{...headers,'Cache-Control':'no-store'}});}catch{return Response.json({error:'反馈暂时不可用，请稍后重试'},{status:503,headers});}
  }
  if(url.pathname==='/api/refresh'){
   // The public game and maintenance writer have separate permissions.
   if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers});
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site'||request.headers.get('Content-Type')!=='application/json'||request.headers.get('X-Playback-Refresh')!=='1')return new Response('Forbidden',{status:403,headers});
   if(!await validRefreshToken(request,env))return new Response('Forbidden',{status:403,headers});
   try{refreshPromise??=refreshPlayback(library,env,bundled).finally(()=>refreshPromise=null);return Response.json(await refreshPromise,{headers:{...headers,'Cache-Control':'no-store'}});}catch(e){console.warn('playback_refresh_failed',providerError(e));return Response.json({error:'更新失败，原快照已保留',errorCode:providerError(e),retryAfterSeconds:e.status===503?300:60},{status:503,headers});}
  }
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers});
  if(url.pathname==='/api/cover'){
   const song=songs.get(url.searchParams.get('song')),value=url.searchParams.get('candidate')||'0';
   if(!song||!/^\d{1,2}$/.test(value)||url.searchParams.has('url'))return new Response('Not found',{status:404,headers});
   const cover=officialCovers(song)[Number(value)];if(!cover)return new Response('Not found',{status:404,headers});
   if(request.method==='HEAD')return new Response(null,{headers:{...headers,'Cache-Control':'public, max-age=3600'}});
   try{const image=await loadCover(cover,env);return new Response(image.body,{headers:{...headers,'Content-Type':image.type,'Cache-Control':'public, max-age=3600'}});}catch(error){console.warn('cover_fetch_failed',providerError(error));return new Response('Cover unavailable',{status:503,headers:{...headers,'Cache-Control':'no-store'}});}
  }
  if(url.pathname==='/api/library'){const snapshot=await storedSnapshot(env,bundled),payload=await libraryPayload(snapshot),responseHeaders={...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-cache',ETag:payload.etag};if(notModified(request,payload.etag))return new Response(null,{status:304,headers:responseHeaders});return new Response(request.method==='HEAD'?null:payload.body,{headers:responseHeaders});}
  if(url.pathname==='/api/views'){
   if(request.method!=='GET')return new Response('Method not allowed',{status:405,headers});
   if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return new Response('Forbidden',{status:403,headers});
   const ids=(url.searchParams.get('songs')||'').split(',');if(ids.length>11||ids.some(id=>!songs.has(id)))return Response.json({error:'请指定曲库中的歌曲，最多 11 首'},{status:400,headers});
   if(!allowPlaybackRequest(request))return Response.json({error:'请求较频繁，请稍后再试',retryAfterSeconds:60},{status:429,headers:{...headers,'Cache-Control':'no-store','Retry-After':'60'}});
   const latest=await storedSnapshot(env,bundled),revision=url.searchParams.get('revision'),snapshot=await pinnedSnapshot(revision,env,latest,bundled);
   if(!snapshot)return Response.json({error:'本局快照暂时无法读取，请稍后重试'},{status:503,headers});
   const pin=url.searchParams.get('snapshot');if(pin&&!Number.isFinite(Date.parse(pin)))return Response.json({error:'快照时间格式有误'},{status:400,headers});
   const nico=await pinnedNico(pin,env,snapshot,bundled);
   const entries=[...new Set(ids)].map(id=>{const song=songs.get(id);return[id,Object.fromEntries(PLATFORM_NAMES.map(platform=>{
    const video=song.videos[platform],record=(platform==='niconico'?nico:snapshot.youtube)?.records[video?.id];
    return[platform,!video?{status:'unlinked',count:null,fetchedAt:null}:video.active===false?{status:'unavailable',count:null,fetchedAt:null,url:video.url}:record?{...record,status:'ok',url:video.url}:{status:'unindexed',count:null,fetchedAt:null,snapshotAt:(platform==='niconico'?nico:snapshot.youtube)?.snapshotAt}];
   }))];});
   return Response.json({songs:Object.fromEntries(entries),revision:snapshotRevision(snapshot),cacheSeconds:0,niconicoCadence:'weekly',youtubeCadence:'weekly',updatedAt:snapshot.updatedAt||null,retrievedAt:new Date().toISOString()},{headers:{...headers,'Cache-Control':'no-store'}});
  }
  const asset=assets[url.pathname==='/'?'/index.html':url.pathname==='/daily'?'/daily.html':url.pathname==='/single'?'/single.html':url.pathname];if(!asset)return new Response('Not found',{status:404,headers});const responseHeaders={...headers,'Content-Type':asset.type,'Cache-Control':'no-cache',...(asset.etag?{ETag:asset.etag}:{})};if(notModified(request,asset.etag))return new Response(null,{status:304,headers:responseHeaders});return new Response(request.method==='HEAD'?null:asset.body,{headers:responseHeaders});
 }};
}
