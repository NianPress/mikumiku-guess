import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {filterLibrary} from '../dist/filters.js';
const origin=process.env.LOCAL_GAME_URL||'http://127.0.0.1:5174';
if(!['127.0.0.1','localhost','::1'].includes(new URL(origin).hostname))throw Error('This test runs against localhost only');
function player(){let cookie='';return{cookie:()=>cookie,async call(path,input){const response=await fetch(origin+path,{method:input===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,...(input===undefined?{}:{'Content-Type':'application/json'})},...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(10000)});if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];const data=await response.json();return{status:response.status,data};}};}
function connect(client,code){
 return new Promise((resolve,reject)=>{
  const request=http.request(origin+'/api/rooms/'+code+'/events',{headers:{Origin:origin,Cookie:client.cookie(),Upgrade:'websocket',Connection:'Upgrade','Sec-WebSocket-Key':randomBytes(16).toString('base64'),'Sec-WebSocket-Version':'13'}});
  request.on('error',reject);request.on('response',r=>reject(Error('WebSocket returned '+r.statusCode)));
  request.on('upgrade',(r,socket,head)=>{
   let buffer=Buffer.alloc(0);const events=[],waiters=[];
   const parse=chunk=>{buffer=Buffer.concat([buffer,chunk]);while(buffer.length>=2){const op=buffer[0]&15;let length=buffer[1]&127,offset=2;if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);offset=4;}else if(length===127){if(buffer.length<10)return;length=Number(buffer.readBigUInt64BE(2));offset=10;}if(buffer.length<offset+length)return;const payload=buffer.subarray(offset,offset+length);buffer=buffer.subarray(offset+length);if(op===1){const event=JSON.parse(payload.toString());events.push(event);for(const w of [...waiters])if(w.predicate(event)){waiters.splice(waiters.indexOf(w),1);clearTimeout(w.timer);w.resolve(event);}}}};
   socket.on('data',parse);socket.on('error',()=>{});parse(head);
   resolve({socket,events,wait(predicate,timeout=5000){const found=events.find(predicate);if(found)return Promise.resolve(found);return new Promise((resolve,reject)=>{const waiter={predicate,resolve};waiter.timer=setTimeout(()=>reject(Error('No realtime update received')),timeout);waiters.push(waiter);});}});
  });request.end();
 });
}
const sockets=[];
try{
 const a=player(),b=player(),outsider=player(),library=await(await fetch(origin+'/api/library')).json();
 let daily=(await a.call('/api/daily')).data;assert.equal(daily.collection,'legend');assert.equal(daily.status,'playing');assert(!daily.answer);const again=(await b.call('/api/daily')).data;assert.deepEqual(daily.hints,again.hints);assert.deepEqual(daily.poolIds,again.poolIds);assert.equal((await a.call('/api/daily/score',{nickname:'无效成绩',attempts:1})).status,400);assert.equal((await a.call('/api/leaderboard')).status,200);
 let filters,pool;
 outer:for(const collection of ['myth','youtube100','niconico100','billboard','weekly'])for(let year=2007;year<=2026;year++){const selected=filterLibrary(library.songs,{collection,from:year,to:year});if(selected.length===2){filters={difficulty:'custom',collection,from:year,to:year};pool=selected.map(s=>s.id);break outer;}}
 assert(filters,'Need a two-song public test pool');
 let room=(await a.call('/api/rooms',{nickname:'本地测试甲',mode:'classic',bo:1,filters})).data;assert(room.code);const code=room.code,path=action=>'/api/rooms/'+code+'/'+action;
 assert.equal((await outsider.call(path('state'))).status,403);assert.equal((await b.call(path('join'),{nickname:'本地测试乙'})).status,200);
 const wsA=await connect(a,code),wsB=await connect(b,code);sockets.push(wsA.socket,wsB.socket);await a.call(path('ready'),{ready:true});await b.call(path('ready'),{ready:true});room=(await a.call(path('start'),{})).data;assert.equal(room.stage,'playing');await wsB.wait(e=>e.state?.stage==='playing');
 room=(await a.call(path('guess'),{songId:pool[0],round:1,attempts:0})).data;
 const firstWon=room.game.status==='won',correct=firstWon?pool[0]:pool[1],wrong=firstWon?pool[1]:pool[0];
 if(!firstWon)await a.call(path('guess'),{songId:correct,round:1,attempts:1});
 const opponent=(await b.call(path('state'))).data;assert.equal(opponent.game.rows.length,0);assert(!opponent.game.answer);
 if(firstWon)await b.call(path('guess'),{songId:wrong,round:1,attempts:0});
 room=(await b.call(path('guess'),{songId:correct,round:1,attempts:firstWon?1:0})).data;assert.equal(room.stage,'finished');assert.equal(room.players.reduce((sum,p)=>sum+p.score,0),1);assert(room.game.answer);await wsA.wait(e=>e.state?.stage==='finished');
 wsA.socket.destroy();const restored=(await a.call(path('state'))).data;assert.equal(restored.roundNumber,1);const wsA2=await connect(a,code);sockets.push(wsA2.socket);await wsA2.wait(e=>e.state?.stage==='finished');
 await a.call(path('rematch'),{});await a.call(path('configure'),{mode:'relay',bo:3,capacity:2,filters});await a.call(path('ready'),{ready:true});await b.call(path('ready'),{ready:true});room=(await a.call(path('start'),{})).data;
 const idA=room.me,idB=room.players.find(p=>p.id!==idA).id,clients=new Map([[idA,a],[idB,b]]);
 assert.equal((await clients.get(room.turn===idA?idB:idA).call(path('guess'),{songId:pool[0],round:1,attempts:0})).status,409);
 for(let round=1;round<=3;round++){
  room=(await clients.get(room.turn).call(path('guess'),{songId:pool[0],round,attempts:0})).data;
  if(room.stage==='playing')room=(await clients.get(room.turn).call(path('guess'),{songId:pool[1],round,attempts:1})).data;
  assert.equal(room.stage,round===3?'finished':'between');
  if(round<3)room=(await a.call(path('next'),{round})).data;
 }
 assert.equal(room.players.reduce((sum,p)=>sum+p.score,0),3);await wsB.wait(e=>e.state?.stage==='finished'&&e.state.roundNumber===3);
 assert.equal((await a.call(path('configure'),{mode:'classic'})).status,409);
 const timerRooms=[];
 for(const mode of ['classic','relay']){
  const left=player(),right=player();let timed=(await left.call('/api/rooms',{nickname:'计时甲',mode,bo:3,capacity:2,filters:{difficulty:'easy'}})).data;
  const timedPath=action=>'/api/rooms/'+timed.code+'/'+action;await right.call(timedPath('join'),{nickname:'计时乙'});await left.call(timedPath('ready'),{ready:true});await right.call(timedPath('ready'),{ready:true});
  const ws=await connect(left,timed.code);sockets.push(ws.socket);timed=(await left.call(timedPath('start'),{})).data;
  const expected=mode==='classic'?180000:60000,remaining=timed.timer.deadlineAt-timed.timer.serverNow;assert(remaining<=expected&&remaining>expected-2000);
  timerRooms.push({mode,left,right,ws,timedPath,timed});
 }
 console.log('Checking real 1-minute relay and 3-minute classic alarms while browsers preview the UI…');
 await Promise.all(timerRooms.map(async test=>{
  const {mode,left,right,ws,timedPath,timed}=test;
  if(mode==='relay'){
   const event=await ws.wait(e=>e.state?.game?.rows.length===1,80000);assert.equal(event.state.game.rows[0].type,'timeout');assert.equal(event.state.game.rows[0].song,null);assert.notEqual(event.state.turn,timed.turn);assert.equal(event.state.timer.deadlineAt,timed.timer.deadlineAt+60000);
   const fresh=(await right.call(timedPath('state'))).data;assert.equal(fresh.game.rows.length,1);assert.equal(fresh.game.rows[0].actor,timed.turn);await left.call(timedPath('close-match'),{});
  }else{
   const event=await ws.wait(e=>e.state?.stage==='between',210000);assert(event.state.players.every(p=>p.score===0&&!p.won&&p.timedOut));assert(event.state.game.answer);assert.equal(event.state.result.reason,'timeout');await left.call(timedPath('close-match'),{});
  }
  await left.call(timedPath('rematch'),{});await left.call(timedPath('leave'),{});await right.call(timedPath('leave'),{});assert.equal((await right.call(timedPath('join'),{nickname:'过期房间检查'})).status,404);
 }));
 console.log('Actual local Workers runtime passed: D1 leaderboard schema, shared locked daily puzzle, signed sessions, private classic comparison, WebSocket pushes/reconnect, relay BO3, real 60-second empty-answer alarm and 180-second classic draw');
}finally{for(const socket of sockets)socket.destroy();}
