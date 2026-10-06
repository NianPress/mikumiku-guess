import {GameError} from './game-data.mjs';
const encoder=new TextEncoder();
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
const hex=bytes=>[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('');
export async function identity(request,secret,create=true){
 if(!secret)throw new GameError('游戏服务尚未配置',503);
 const value=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('chu_player='))?.slice(11),pattern=/^([\da-f-]{36})\.([\da-f]{64})$/;
 const match=value?.match(pattern),signing=await key(secret);
 if(match){const signature=new Uint8Array(match[2].match(/../g).map(s=>parseInt(s,16)));if(await crypto.subtle.verify('HMAC',signing,signature,encoder.encode('game-player|'+match[1])))return{id:match[1],cookie:null};}
 if(!create)throw new GameError('请先加入房间',401);
 const id=crypto.randomUUID(),signature=hex(await crypto.subtle.sign('HMAC',signing,encoder.encode('game-player|'+id)));
 return{id,cookie:'chu_player='+id+'.'+signature+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000'+(new URL(request.url).protocol==='https:'?'; Secure':'')};
}
