import {evaluate,MAX_GUESSES} from '../dist/core.js';
import {titleHint} from '../dist/hints.js';
import {producersOf} from '../dist/people.js';
export class GameError extends Error {constructor(message,status=400){super(message);this.status=status;}}
export const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function nickname(value){const text=String(value||'').normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu,'').trim();if(!text||[...text].length>20)throw new GameError('昵称请填写 1—20 个字');return text;}
export async function body(request){
 if(Number(request.headers.get('Content-Length'))>4096)throw new GameError('内容过长',413);
 const reader=request.body?.getReader(),chunks=[];let length=0;
 if(reader)for(;;){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>4096){await reader.cancel();throw new GameError('内容过长',413);}chunks.push(part.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 try{const value=JSON.parse(new TextDecoder().decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw new GameError('请求格式有误');}
}
const encode=id=>btoa(String.fromCharCode(...new TextEncoder().encode(id))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export async function asset(path,env){const r=await env.ASSETS.fetch(new Request('https://assets.invalid'+path));if(!r.ok)throw new GameError('曲库暂时无法读取',503);return r.json();}
export const catalog=env=>asset('/_game/catalog.json',env);
export async function songData(id,revision,env){if(typeof id!=='string'||id.length>100)throw new GameError('请从曲库选择歌曲');const d=await asset('/_game/songs/'+encode(id)+'.json',env);if(d.song?.id!==id)throw new GameError('歌曲不存在');if(!d.records?.[revision])throw new GameError('本局播放量快照暂时无法读取，请稍后重试',503);return{song:d.song,views:d.records[revision]};}
export function hint(answer,rows,seed,ended=false){const h=titleHint(answer.title,rows.length,seed,ended);return{...h,...(h.producerUnlocked?{producers:producersOf(answer)}:{})};}
export function makeRow(guess,answer,answerViews,actor){return{song:guess.song,views:guess.views,feedback:evaluate(guess.song,answer,guess.views,answerViews),...(actor?{actor}:{} )};}
export function outcome(rows,gaveUp=false){return rows.some(r=>r.feedback.song==='exact')?'won':gaveUp||rows.length>=MAX_GUESSES?'lost':'playing';}
export function roundView(round,rows,seed,ended=false,gaveUp=false){const status=outcome(rows,gaveUp);return{status,rows,hints:hint(round.answer,rows,seed,ended||status!=='playing'),maxGuesses:MAX_GUESSES,revision:round.revision,...(ended||status!=='playing'?{answer:round.answer,answerViews:round.answerViews}:{})};}
export function randomItem(ids){if(!ids.length)throw new GameError('这个组合没有歌曲');const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);return ids[bytes[0]%ids.length];}
