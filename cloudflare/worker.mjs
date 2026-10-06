import info from '../.cloudflare/build-info.mjs';
import {feedbackEndpoint, issueFeedbackTicket, allowPlaybackRequest, officialCovers} from '../server.mjs';
import {getBeijingDate} from '../dist/core.js';
import {GameError} from './game-data.mjs';
import {identity} from './identity.mjs';
import {leaderboard} from './daily.mjs';
export {DailyChallenge} from './daily.mjs';
export {GameRoom} from './rooms.mjs';

const baseHeaders = {'X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin'};
const json = (body,status=200,headers={}) => Response.json(body,{status,headers:{...baseHeaders,'Cache-Control':'no-store',...headers}});
const sameOrigin = request => (!request.headers.get('Origin') || request.headers.get('Origin') === new URL(request.url).origin) && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
const fileId = id => btoa(String.fromCharCode(...new TextEncoder().encode(id))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
async function songData(id,request,env) {
  if(typeof id !== 'string' || id.length < 1 || id.length > 100) return null;
  const target = new URL('/_game/songs/'+fileId(id)+'.json',request.url);
  const response = await env.ASSETS.fetch(new Request(target));
  if(!response.ok) return null;
  const data = await response.json();
  return data.song?.id === id ? data : null;
}

async function views(request,env) {
  if(request.method !== 'GET') return json({error:'Method not allowed'},405);
  if(!sameOrigin(request)) return json({error:'Forbidden'},403);
  const url = new URL(request.url), ids = (url.searchParams.get('songs') || '').split(',');
  if(ids.length > 11 || ids.some(id=>!id || id.length>100)) return json({error:'请指定曲库中的歌曲，最多 11 首'},400);
  if(!allowPlaybackRequest(request)) return json({error:'请求较频繁，请稍后再试'},429,{'Retry-After':'60'});
  const revision = url.searchParams.get('revision') || info.revision, pin = url.searchParams.get('snapshot');
  if(revision.length > 100 || pin && !Number.isFinite(Date.parse(pin))) return json({error:'快照格式有误'},400);
  const rows = await Promise.all([...new Set(ids)].map(async id=>[id,await songData(id,request,env)]));
  if(rows.some(([,data])=>!data)) return json({error:'请指定曲库中的歌曲'},400);
  const result = {};
  for(const [id,data] of rows) {
    if(!Object.hasOwn(data.records,revision) || pin && !Object.hasOwn(data.nicoVersions,pin)) return json({error:'本局快照暂时无法读取，请稍后重试'},503);
    result[id] = {...data.records[revision]};
    if(pin) result[id].niconico = data.nicoVersions[pin];
  }
  return json({songs:result,revision,cacheSeconds:0,niconicoCadence:'weekly',youtubeCadence:'weekly',updatedAt:info.updatedAt,retrievedAt:new Date().toISOString()});
}

async function cover(request,env,ctx) {
  if(!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
  const url = new URL(request.url), id = url.searchParams.get('song'), index = url.searchParams.get('candidate') || '0';
  if(url.searchParams.has('url') || !/^\d{1,2}$/.test(index)) return new Response('Not found',{status:404});
  const data = await songData(id,request,env), candidate = data && officialCovers(data.song)[Number(index)];
  if(!candidate) return new Response('Not found',{status:404});
  const cacheKey = new Request(new URL('/api/cover?song='+encodeURIComponent(id)+'&candidate='+Number(index)+'&v='+info.buildHash,request.url));
  const cache = globalThis.caches?.default;
  const cached = cache && await cache.match(cacheKey);
  if(cached) return request.method === 'HEAD' ? new Response(null,{headers:cached.headers}) : cached;
  if(request.method === 'HEAD') return new Response(null,{headers:{...baseHeaders,'Cache-Control':'public, max-age=86400'}});
  try {
    const response = await fetch(candidate.url,{redirect:'manual',signal:AbortSignal.timeout(7000),headers:{Accept:'image/jpeg,image/png,image/webp,image/gif'}});
    const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if(!response.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type) || Number(response.headers.get('Content-Length') || 0) > 2097152) throw Error('Invalid cover');
    const chunks = [], reader = response.body.getReader(); let size = 0;
    for(;;) {const {done,value} = await reader.read(); if(done) break; size += value.byteLength; if(size>2097152){await reader.cancel();throw Error('Cover too large');} chunks.push(value);}
    if(!size) throw Error('Empty cover');
    const body = new Uint8Array(size); let offset=0;
    for(const part of chunks){body.set(part,offset);offset+=part.byteLength;}
    const result = new Response(body,{headers:{...baseHeaders,'Content-Type':type,'Cache-Control':'public, max-age=86400'}});
    if(cache && ctx?.waitUntil) ctx.waitUntil(cache.put(cacheKey,result.clone()).catch(()=>{}));
    return result;
  } catch { return new Response('Cover unavailable',{status:503,headers:{...baseHeaders,'Cache-Control':'no-store'}}); }
}

async function gameAPI(request,env){
 if(!sameOrigin(request))return json({error:'Forbidden'},403);
 const path=new URL(request.url).pathname,date=getBeijingDate();
 try{
  if(!allowPlaybackRequest(request))return json({error:'请求较频繁，请稍后再试'},429);
  if(path==='/api/leaderboard'){if(request.method!=='GET')return json({error:'Method not allowed'},405);return json(await leaderboard(env,date));}
  const daily=['/api/daily','/api/daily/guess','/api/daily/score'].includes(path);
  const match=path.match(/^\/api\/rooms\/([A-HJ-NP-Z2-9]{6})\/(join|state|events|configure|ready|start|next|guess|give-up|end-round|leave|close-match|rematch)$/);
  const create=path==='/api/rooms';
  if(!daily&&!match&&!create)return json({error:'Not found'},404);
  const read=path==='/api/daily'||match&&['state','events'].includes(match[2]);
  if(request.method!==(read?'GET':'POST'))return json({error:'Method not allowed'},405);
  if(daily?!env.DAILY:!env.ROOMS)return json({error:'游戏服务尚未配置'},503);
  const actor=await identity(request,env.FEEDBACK_SIGNING_KEY,!(match&&match[2]==='events'));
  const forward=(code,action)=>{
   const headers=new Headers(request.headers);headers.set('X-Game-Player',actor.id);headers.set('X-Game-Date',date);if(code)headers.set('X-Game-Code',code);
   const target=new URL(request.url);if(action)target.pathname='/api/rooms/'+code+'/'+action;
   return new Request(target,{method:request.method,headers,...(request.method==='POST'?{body:request.clone().body,duplex:'half'}:{})});
  };
  let response;
  if(daily)response=await env.DAILY.get(env.DAILY.idFromName(date)).fetch(forward());
  else if(create){for(let i=0;i<4;i++){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=new Uint8Array(6);crypto.getRandomValues(bytes);const code=[...bytes].map(v=>chars[v%chars.length]).join('');response=await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(forward(code,'create'));if(response.status!==409)break;}}
  else response=await env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(forward(match[1]));
  if(actor.cookie&&response.status!==101){const headers=new Headers(response.headers);headers.set('Set-Cookie',actor.cookie);return new Response(response.body,{status:response.status,headers});}
  return response;
 }catch(error){return json({error:error instanceof GameError?error.message:'游戏服务暂时不可用，请重试'},error.status||503);}
}
export default {async fetch(request,env,ctx) {
  const path = new URL(request.url).pathname;
  // Playback data is precomputed at build time. Gameplay never queries Google/Nico.
  if(path === '/api/views') return views(request,env);
  if(path === '/api/cover') return cover(request,env,ctx);
  if(path==='/api/daily'||path.startsWith('/api/daily/')||path==='/api/rooms'||path.startsWith('/api/rooms/')||path==='/api/leaderboard')return gameAPI(request,env);
  const feedbackEnv = {...env,PLAYBACK_REFRESH_TOKEN:env.FEEDBACK_SIGNING_KEY};
  if(path === '/api/feedback') return feedbackEndpoint(request,feedbackEnv,baseHeaders);
  if(path === '/api/feedback-ticket') {
    if(request.method !== 'GET') return json({error:'Method not allowed'},405);
    if(!sameOrigin(request)) return json({error:'Forbidden'},403);
    if(!allowPlaybackRequest(request)) return json({error:'请求较频繁，请稍后再试'},429);
    try {return json({ticket:await issueFeedbackTicket(request,feedbackEnv)});} catch {return json({error:'反馈暂时不可用，请稍后重试'},503);}
  }
  if(path === '/api/health') return json({...info,feedbackAvailable:Boolean(env.DB && env.FEEDBACK_SIGNING_KEY)});
  if(path.startsWith('/api/') && path !== '/api/library') return json({error:'Not found'},404);
  return env.ASSETS.fetch(request);
}};
