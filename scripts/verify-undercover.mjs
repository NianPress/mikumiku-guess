import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker,{GameRoom} from '../cloudflare/worker.mjs';
import {newRoom,projection,deadlineFor,advanceClock} from '../cloudflare/room-engine.mjs';
import {undercoverBank,undercoverSettings,roleCounts,startUndercover,startVote,castVote,guessBlank,checkUndercoverWinner,VOTE_MS,BLANK_MS} from '../cloudflare/undercover-engine.mjs';
assert.equal(undercoverBank.questions.length,66);
assert.equal(new Set(undercoverBank.questions.map(q=>[q.civilian.songId,q.undercover.songId].sort().join('|'))).size,66);
for(const capacity of [2,11,3.5])assert.throws(()=>undercoverSettings({capacity}));
assert.equal(undercoverSettings().anonymousVoting,false);
assert.equal(undercoverSettings({anonymousVoting:true}).anonymousVoting,true);
for(const anonymousVoting of ['true',1,{}])assert.throws(()=>undercoverSettings({anonymousVoting}));
for(let n=3;n<=10;n++)for(const blank of [false,true]){const s=undercoverSettings({capacity:n,blank}),c=roleCounts(n,s);assert.equal(c.civilian+c.spy+c.blank,n);assert(c.civilian>=1);assert.equal(c.blank,Number(blank));}
assert.deepEqual(roleCounts(3,undercoverSettings({capacity:3,blank:true})),{civilian:1,spy:1,blank:1});
assert.throws(()=>roleCounts(3,undercoverSettings({spies:2})));assert.throws(()=>roleCounts(4,undercoverSettings({spies:2})));
function game(roles=['civilian','civilian','spy'],blank=roles.includes('blank')){
 const r=newRoom('ABC234','p0',{nickname:'玩家0',mode:'undercover',capacity:Math.max(3,roles.length),blank});
 r.players=roles.map((role,i)=>({id:'p'+i,nickname:'玩家'+i,score:0,ready:true}));startUndercover(r,1000);
 roles.forEach((role,i)=>r.undercover.members['p'+i]={role,alive:true});return r;
}
const payload=r=>({matchId:r.undercover.matchId,ballot:r.undercover.ballot});
function eliminate(r,target){startVote(r,payload(r),2000);for(const p of r.players.filter(p=>r.undercover.members[p.id].alive))castVote(r,p.id,{...payload(r),target:p.id===target?null:target},2001);}
for(const anonymousVoting of [false,true]){
 const room=game(['civilian','civilian','civilian','spy']);room.settings.anonymousVoting=anonymousVoting;
 startVote(room,payload(room),2000);castVote(room,'p0',{...payload(room),target:'p3'},2001);
 assert.deepEqual(projection(room,'p0').undercover.myVote,{target:'p3'});assert.equal(projection(room,'p1').undercover.myVote,null);
 for(const [id,target]of [['p1','p0'],['p2','p0'],['p3','p1']])castVote(room,id,{...payload(room),target},2001);
 assert.equal(room.stage,'playing');const internal=structuredClone(room.undercover.lastBallot);
 for(const stage of ['playing','finished','cancelled']){room.stage=stage;for(const p of room.players){const ballot=projection(room,p.id).undercover.lastBallot;assert.equal(ballot.anonymous,anonymousVoting);assert.equal('votes'in ballot,!anonymousVoting);assert.deepEqual(ballot.counts,internal.counts);}}
 assert.deepEqual(room.undercover.lastBallot,internal,'Projection must not modify stored ballots');
 const tied=game(['civilian','civilian','civilian','spy']);tied.settings.anonymousVoting=anonymousVoting;startVote(tied,payload(tied),2000);
 for(const [id,target]of [['p0','p1'],['p1','p0'],['p2','p0'],['p3','p1']])castVote(tied,id,{...payload(tied),target},2001);
 assert.equal(tied.undercover.phase,'runoff-discussion');assert.equal('votes'in projection(tied,'p0').undercover.lastBallot,!anonymousVoting);
}
for(let n=3;n<=10;n++)for(const blank of [false,true]){
 const roles=roleCounts(n,undercoverSettings({capacity:n,blank})),r=game(Array(n).fill('civilian'),blank);startUndercover(r,1000);
 for(const [role,count]of Object.entries(roles))assert.equal(Object.values(r.undercover.members).filter(p=>p.role===role).length,count);
 const secret=r.undercover.pair;
 for(const p of r.players){const v=projection(r,p.id),own=r.undercover.members[p.id].role,word=own==='blank'?null:secret[own==='spy'?'undercover':'civilian'].title;assert.equal(v.undercover.personal.word,word);assert(!v.players.some(p=>'role' in p||'word' in p));assert(!('words' in v.undercover));assert(!('pair' in v.undercover));assert(!JSON.stringify(v).includes('"aliases"'));}
 const old=r.lastUndercoverPairId;startUndercover(r,2000);assert.notEqual(r.lastUndercoverPairId,old);
}
let r=game();startVote(r,payload(r),2000);const firstBallot=r.undercover.ballot;
assert.throws(()=>castVote(r,'p0',{...payload(r),target:'p0'},2001));assert.throws(()=>castVote(r,'p0',{matchId:'stale',ballot:firstBallot,target:'p1'},2001));
castVote(r,'p0',{...payload(r),target:'p1'},2001);castVote(r,'p0',{...payload(r),target:'p2'},2002);
assert.equal(r.undercover.votes.p0,'p2');const privateVote=projection(r,'p1').undercover;assert(!('votes' in privateVote));assert.equal(privateVote.myVote,null);assert.deepEqual(privateVote.voted,['p0']);
castVote(r,'p1',{...payload(r),target:'p2'},2003);castVote(r,'p2',{...payload(r),target:'p1'},2004);
assert.equal(r.stage,'finished');assert.equal(r.undercover.result.winner,'civilian');assert(projection(r,'p0').players.every(p=>p.role&&'word'in p));assert.equal(r.players[0].score,1);
r=game();eliminate(r,'p0');assert.equal(r.undercover.result.winner,'spy');
r=game(['civilian','civilian','civilian','spy']);startVote(r,payload(r),2000);
for(const [id,target]of [['p0','p1'],['p1','p0'],['p2','p0'],['p3','p1']])castVote(r,id,{...payload(r),target},2001);
assert.equal(r.undercover.phase,'runoff-discussion');assert.deepEqual(r.undercover.candidates,['p0','p1']);startVote(r,payload(r),3000);
assert.throws(()=>castVote(r,'p0',{...payload(r),target:'p3'},3001));for(const [id,target]of [['p0','p1'],['p1','p0'],['p2','p0'],['p3','p1']])castVote(r,id,{...payload(r),target},3001);
assert.equal(r.undercover.phase,'discussion');assert(r.players.every(p=>r.undercover.members[p.id].alive));
r=game(['civilian','civilian','civilian','spy']);startVote(r,payload(r),2000);castVote(r,'p0',{...payload(r),target:'p3'},2001);assert.equal(deadlineFor(r),2000+VOTE_MS);assert(advanceClock(r,2000+VOTE_MS));assert.equal(r.undercover.result.winner,'civilian');assert.equal(r.undercover.lastBallot.abstained,3);
r=game();startVote(r,payload(r),2000);advanceClock(r,2000+VOTE_MS);assert.equal(r.stage,'playing');assert.equal(r.undercover.phase,'discussion');assert(r.players.every(p=>r.undercover.members[p.id].alive));
r=game(['civilian','spy','blank']);eliminate(r,'p2');assert.equal(r.stage,'playing');assert.equal(r.undercover.phase,'blank-guess');assert.throws(()=>guessBlank(r,'p0',{...payload(r),word:r.undercover.pair.civilian.title},2002));assert.throws(()=>guessBlank(r,'p2',{...payload(r),word:' '},2002));
const alias=r.undercover.pair.civilian.aliases.find(a=>a!==r.undercover.pair.civilian.title)||r.undercover.pair.civilian.title;
guessBlank(r,'p2',{...payload(r),word:alias},2002);assert.equal(r.undercover.result.winner,'blank');assert.deepEqual(r.undercover.result.winners,['p2']);assert.throws(()=>guessBlank(r,'p2',{...payload(r),word:alias},2003));
r=game(['civilian','spy','blank']);eliminate(r,'p2');guessBlank(r,'p2',{...payload(r),word:'错误答案完全不同'},2002);assert.equal(r.undercover.result.winner,'spy');
r=game(['civilian','spy','blank']);eliminate(r,'p2');advanceClock(r,2001+BLANK_MS);assert.equal(r.undercover.result.winner,'spy');assert.equal(r.undercover.blankGuess.timedOut,true);
r=game(['civilian','spy','blank']);eliminate(r,'p0');assert.equal(r.undercover.result.winner,'blank');assert.equal(r.undercover.result.reason,'survived');
r=game(['civilian','civilian','spy','blank']);r.undercover.members.p2.alive=false;r.undercover.members.p3.alive=false;assert(checkUndercoverWinner(r));assert.equal(r.undercover.result.winner,'civilian');

const ASSETS={async fetch(req){try{return new Response(await readFile('.cloudflare/assets'+new URL(req.url).pathname));}catch{return new Response('Not found',{status:404});}}};
const env={ASSETS,FEEDBACK_SIGNING_KEY:'undercover-local-test-only'},objects=new Map();
env.ROOMS={idFromName:n=>n,get(n){if(!objects.has(n)){const data=new Map(),ctx={data,storage:{async get(k){return structuredClone(data.get(k));},async put(k,v){data.set(k,structuredClone(v));},async setAlarm(at){ctx.alarmAt=at;},async deleteAll(){data.clear();}},getWebSockets:()=>ctx.sockets||[],blockConcurrencyWhile(fn){ctx.ready=fn();}};objects.set(n,{ctx,object:new GameRoom(ctx,env)});}const x=objects.get(n);return{async fetch(req){await x.ctx.ready;return x.object.fetch(req);}};}};
function client(){let cookie='';return{async call(path,input){const response=await worker.fetch(new Request('https://local-test'+path,{method:input===undefined?'GET':'POST',headers:{Origin:'https://local-test',Cookie:cookie,...(input===undefined?{}:{'Content-Type':'application/json'})},...(input===undefined?{}:{body:JSON.stringify(input)})}),env);if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];return{status:response.status,data:await response.json()};}};}
const clients=Array.from({length:4},client);let state=(await clients[0].call('/api/rooms',{nickname:'甲',mode:'undercover',capacity:3,blank:true,anonymousVoting:true})).data;assert.equal(state.settings.blank,true);assert.equal(state.settings.anonymousVoting,true);const base='/api/rooms/'+state.code+'/',entry=objects.get(state.code);
for(let i=1;i<3;i++)assert.equal((await clients[i].call(base+'join',{nickname:'玩家'+i})).status,200);
assert.equal((await clients[3].call(base+'state')).status,403);assert.equal((await clients[3].call(base+'join',{nickname:'满房'})).status,409);assert.equal((await clients[1].call(base+'configure',{mode:'undercover'})).status,403);
const savedSettings=structuredClone(entry.object.room.settings);assert.equal((await clients[0].call(base+'configure',{mode:'undercover',capacity:2})).status,400);assert.deepEqual(entry.object.room.settings,savedSettings);
for(const c of clients.slice(0,3))await c.call(base+'ready',{ready:true});state=(await clients[0].call(base+'start',{})).data;assert.equal(state.stage,'playing');const started=structuredClone(entry.object.room),clientIds=state.players.map(p=>p.id),oldMatch=state.undercover.matchId;
assert.equal((await clients[1].call(base+'start-vote',payload(entry.object.room))).status,403);assert.equal((await clients[0].call(base+'guess',{songId:'any'})).status,400);
const messages=[];entry.ctx.sockets=clientIds.map(id=>({deserializeAttachment:()=>({id}),send:message=>messages.push({id,state:JSON.parse(message).state}),close(){}}));
state=(await clients[0].call(base+'start-vote',payload(entry.object.room))).data;assert.equal(state.undercover.phase,'voting');assert(messages.every(m=>!m.state.players.some(p=>'role'in p||'word'in p)));
const spy=clientIds.find(id=>entry.object.room.undercover.members[id].role==='spy');
for(let i=0;i<3;i++){const v=(await clients[i].call(base+'state')).data;assert.equal(v.undercover.personal.word,started.undercover.members[clientIds[i]].role==='blank'?null:started.undercover.pair[started.undercover.members[clientIds[i]].role==='spy'?'undercover':'civilian'].title);await clients[i].call(base+'vote',{...payload(entry.object.room),target:clientIds[i]===spy?null:spy});}
state=(await clients[0].call(base+'state')).data;assert.equal(state.undercover.result.winner,'blank');assert(state.players.every(p=>'role'in p&&'word'in p));
assert(!('votes'in state.undercover.lastBallot));assert.equal(state.undercover.lastBallot.anonymous,true);assert(messages.filter(m=>m.state.undercover?.lastBallot).every(m=>!('votes'in m.state.undercover.lastBallot)),'Realtime ballots must also be anonymous');
const restart=new GameRoom(entry.ctx,env);await entry.ctx.ready;entry.object=restart;assert.equal((await clients[1].call(base+'state')).data.stage,'finished');
await clients[0].call(base+'rematch',{});assert.equal((await clients[0].call(base+'state')).data.undercover,null);for(const c of clients.slice(0,3))await c.call(base+'ready',{ready:true});await clients[0].call(base+'start',{});assert.notEqual(entry.object.room.undercover.matchId,oldMatch);assert.equal((await clients[0].call(base+'start-vote',{matchId:oldMatch,ballot:0})).status,409);
const before=structuredClone(entry.object.room),put=entry.ctx.storage.put;entry.ctx.storage.put=async()=>{throw Error('unavailable');};assert.equal((await clients[0].call(base+'start-vote',payload(entry.object.room))).status,503);entry.ctx.storage.put=put;assert.equal(entry.object.room.undercover.phase,before.undercover.phase);
await clients[0].call(base+'start-vote',payload(entry.object.room));entry.object.room.undercover.deadlineAt=Date.now()-1;await entry.ctx.storage.put('room',entry.object.room);await entry.object.alarm();assert.equal(entry.object.room.undercover.phase,'discussion');assert.equal(entry.object.room.undercover.lastBallot.abstained,3);
await clients[0].call(base+'close-match',{});state=(await clients[1].call(base+'state')).data;assert.equal(state.stage,'cancelled');assert(state.undercover.words);
assert(!('votes'in state.undercover.lastBallot),'Cancelling must not reveal anonymous votes');
await clients[0].call(base+'rematch',{});await clients[0].call(base+'leave',{});state=(await clients[1].call(base+'state')).data;assert.equal(state.host,clientIds[1]);
assert(!(await ASSETS.fetch(new Request('https://local-test/undercover-bank.json'))).ok,'The private pair bank is not a static asset');
// Ten people sharing a network must not share a single player's minute budget.
const lanPlayers=Array.from({length:10},()=>({cookie:'',async call(path,input){const response=await worker.fetch(new Request('https://lan-test'+path,{method:input===undefined?'GET':'POST',headers:{Origin:'https://lan-test',Cookie:this.cookie,'CF-Connecting-IP':'shared-test-lan',...(input===undefined?{}:{'Content-Type':'application/json'})},...(input===undefined?{}:{body:JSON.stringify(input)})}),env);if(response.headers.has('Set-Cookie'))this.cookie=response.headers.get('Set-Cookie').split(';')[0];return{status:response.status,data:await response.json()};}}));
const lanRoom=(await lanPlayers[0].call('/api/rooms',{nickname:'同网络0',mode:'undercover',capacity:10,blank:true})).data,lanPath='/api/rooms/'+lanRoom.code+'/';
for(let i=1;i<10;i++)assert.equal((await lanPlayers[i].call(lanPath+'join',{nickname:'同网络'+i})).status,200);
for(const p of lanPlayers)assert.equal((await p.call(lanPath+'ready',{ready:true})).status,200);
assert.equal((await lanPlayers[0].call(lanPath+'start',{})).status,200);
for(let round=0;round<6;round++)for(const p of lanPlayers)assert.equal((await p.call(lanPath+'state')).status,200,'One LAN can serve all ten players without triggering a shared 60-request playback limit');
console.log('Undercover passed: 66 approved pairs; 3–10 players/optional whiteboard; private identities and votes; all win conditions; tie/revote/abstention; alias guess/one attempt; alarms; host permissions; storage rollback/restart; stale-match rejection and secret-free broadcasts.');
