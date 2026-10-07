import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GameRoom} from '../cloudflare/rooms.mjs';
import {ROOM_WAIT_MS,CLASSIC_MS,RELAY_MS} from '../cloudflare/room-engine.mjs';
import {rowMarkup} from '../dist/clues.js';
const env={ASSETS:{async fetch(request){try{return new Response(await readFile('.cloudflare/assets'+new URL(request.url).pathname));}catch{return new Response('Not found',{status:404});}}}};
let now=Date.now(),randomIndex=0;
const originalNow=Date.now,originalRandom=crypto.getRandomValues;
Date.now=()=>now;crypto.getRandomValues=array=>{array[0]=randomIndex;return array;};
function instance(code){
 const data=new Map(),messages=[],socket={deserializeAttachment:()=>({id:'a'}),send:value=>messages.push(JSON.parse(value)),close(){}};
 const ctx={data,messages,alarmAt:null,storage:{async get(k){return structuredClone(data.get(k));},async put(k,v){data.set(k,structuredClone(v));},async setAlarm(at){ctx.alarmAt=at;},async deleteAll(){data.clear();ctx.alarmAt=null;}},getWebSockets:()=>[socket],blockConcurrencyWhile(fn){ctx.ready=fn();}};
 const object=new GameRoom(ctx,env);
 return{object,ctx,async call(action,id='a',input){await ctx.ready;const response=await object.fetch(new Request('https://room/'+action,{method:input===undefined?'GET':'POST',headers:{'X-Game-Player':id,'X-Game-Code':code,...(input===undefined?{}:{'Content-Type':'application/json'})},...(input===undefined?{}:{body:JSON.stringify(input)})}));return{status:response.status,data:await response.json()};}};
}
async function start(mode='classic',bo=1,capacity=2){const room=instance('ABCXYZ');await room.call('create','a',{nickname:'甲',mode,bo,capacity,filters:{difficulty:'easy'}});for(const [id,name] of [['b','乙'],['c','丙']].slice(0,capacity-1))await room.call('join',id,{nickname:name});for(const id of ['a','b','c'].slice(0,capacity))await room.call('ready',id,{ready:true});const result=await room.call('start','a',{});assert.equal(result.status,200);return room;}
try{
 const lobby=instance('ABCDEZ'),created=(await lobby.call('create','a',{nickname:'房主'})).data,expires=created.timer.deadlineAt;
 assert.equal(expires,now+ROOM_WAIT_MS);now+=120000;await lobby.call('join','b',{nickname:'朋友'});await lobby.call('ready','a',{ready:true});assert.equal(lobby.ctx.alarmAt,expires,'Joining and ready do not reset the lobby expiry');
 now=expires-1;await lobby.object.alarm();assert(lobby.object.room);now=expires;await lobby.object.alarm();assert.equal(lobby.object.room,null);assert.equal((await lobby.call('join','b',{nickname:'朋友'})).status,404);assert(lobby.ctx.messages.some(m=>m.type==='closed'));
 const empty=instance('EMPTYZ');await empty.call('create','a',{nickname:'退出检查'});await empty.call('leave','a',{});assert.equal(empty.object.room,null);assert.equal((await empty.call('join','b',{nickname:'检查'})).status,404);

 const classic=await start('classic',3);let view=(await classic.call('state')).data;const deadline=view.timer.deadlineAt;
 assert.equal(deadline,now+CLASSIC_MS);assert.equal(classic.ctx.alarmAt,deadline);now=deadline-1;assert.equal((await classic.call('state')).data.stage,'playing');
 now=deadline;await classic.object.alarm();view=(await classic.call('state')).data;assert.equal(view.stage,'between');assert(view.players.every(p=>p.score===0&&p.timedOut&&!p.won));assert(view.game.answer);assert.equal(classic.ctx.alarmAt,now+ROOM_WAIT_MS);
 const late=await classic.call('guess','a',{songId:view.game.answer.id,round:1,attempts:0});assert.equal(late.status,409);assert.equal(classic.object.room.individual.a.rows.length,0);
 await classic.object.alarm();assert.equal(classic.object.room.stage,'between','Early/stale alarm must not close or re-score the room');
 now=classic.ctx.alarmAt;await classic.object.alarm();assert.equal(classic.object.room,null,'Idle between rounds closes automatically');

 const singleWinner=await start();const answer=singleWinner.object.room.round.answer.id;await singleWinner.call('guess','a',{songId:answer,round:1,attempts:0});view=(await singleWinner.call('state')).data;assert.equal(view.stage,'playing');assert(!view.game.answer,'Correct guess does not leak classic answer early');now=view.timer.deadlineAt;
 await singleWinner.object.alarm();view=(await singleWinner.call('state')).data;assert.equal(view.stage,'finished');assert.equal(view.result.winner,'a');assert.equal(view.players.find(p=>p.id==='a').score,1);

 randomIndex=1;const relay=await start('relay',3,3);view=(await relay.call('state')).data;assert.equal(view.turn,'b','Random draw can choose a non-host');const firstDeadline=view.timer.deadlineAt;
 assert.equal(firstDeadline,now+RELAY_MS);now=firstDeadline;await relay.object.alarm();view=(await relay.call('state')).data;assert.equal(view.turn,'c');assert.equal(view.game.rows.length,1);assert.equal(view.game.rows[0].song,null);assert.equal(view.game.rows[0].actor,'b');assert.equal(view.game.rows[0].type,'timeout');
 const blank=rowMarkup(view.game.rows[0],0,['billboard','weekly'],view.players);assert(blank.includes('空白答案'));assert.equal((blank.match(/<td/g)||[]).length,10);assert(!blank.includes('song-entry'));
 await relay.object.alarm();assert.equal(relay.object.room.rows.length,1,'Duplicate alarm does not consume another chance');
 assert.equal((await relay.call('guess','b',{songId:relay.object.room.round.answer.id,round:1,attempts:0})).status,409,'Late old turn is rejected');
 const recovered=new GameRoom(relay.ctx,env);await relay.ctx.ready;assert.equal(recovered.room.turnDeadlineAt,relay.object.room.turnDeadlineAt,'Hibernation/restart preserves the deadline');
 for(let count=2;count<=9;count++){now=relay.object.room.turnDeadlineAt;await relay.object.alarm();view=(await relay.call('state')).data;assert.equal(view.game.rows.length,count);if(count===3)assert.equal(view.game.hints.revealedCount,1);if(count===6)assert.equal(view.game.hints.revealedCount,Math.min(4,view.game.hints.characterCount));if(count===9)assert(view.game.hints.producers?.length);}
 assert(view.game.rows.every(row=>row.type==='timeout'));const currentActor=view.turn;
 view=(await relay.call('guess',currentActor,{songId:relay.object.room.round.answer.id,round:1,attempts:9})).data;assert.equal(view.stage,'between');assert.equal(view.game.rows.length,10);assert.equal(view.result.winner,currentActor);assert.equal(view.game.status,'won');
 randomIndex=2;view=(await relay.call('next','a',{round:1})).data;assert.equal(view.turn,'c','Each new round draws its own first player');
 now=view.timer.deadlineAt+9*RELAY_MS;await relay.object.alarm();view=(await relay.call('state')).data;assert.equal(view.stage,'between');assert.equal(view.game.rows.length,10);assert.equal(view.result.winner,null);assert.equal(view.players.reduce((n,p)=>n+p.score,0),1,'Ten empty answers add no points');
 now+=1000;await relay.call('close-match','a',{});view=(await relay.call('rematch','a',{})).data;assert.equal(view.timer.deadlineAt,now+ROOM_WAIT_MS);assert.equal(view.roundNumber,0);

 const failed=await start('relay');now=failed.object.room.turnDeadlineAt;const put=failed.ctx.storage.put;failed.ctx.storage.put=async()=>{throw Error('storage unavailable');};await assert.rejects(failed.object.alarm());assert.equal(failed.object.room.rows.length,0,'Failed timeout transaction rolls back');failed.ctx.storage.put=put;await failed.object.alarm();assert.equal(failed.object.room.rows.length,1);
 const racing=await start('relay');now=racing.object.room.turnDeadlineAt;const lateActor=racing.object.room.players[racing.object.room.turnIndex].id;const result=await Promise.all([racing.object.alarm(),racing.call('guess',lateActor,{songId:racing.object.room.round.answer.id,round:1,attempts:0})]);assert.equal(result[1].status,409);assert.equal(racing.object.room.rows.length,1,'Alarm and late submission consume one blank chance, not two');
 console.log('Timers passed: fixed room expiry, classic 3-minute scoring, server alarms, serialized late guesses, random relay starters, 1-minute empty answers, 3/6/9 hints, ten-chance cap, restart and storage recovery');
}finally{Date.now=originalNow;crypto.getRandomValues=originalRandom;}
