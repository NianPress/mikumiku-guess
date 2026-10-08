import {normalizeFilters,filterLibrary,filterDescription} from '../dist/filters.js';
import {outcome,roundView,hint,GameError,nickname} from './game-data.mjs';
import {undercoverSettings,undercoverProjection,undercoverDeadline,advanceUndercoverClock} from './undercover-engine.mjs';
export const ROOM_WAIT_MS=10*60*1000,CLASSIC_MS=3*60*1000,RELAY_MS=60*1000;
const stateOutcome=state=>outcome(state.rows,state.gaveUp||state.timedOut);
export function waitForGame(room,now=Date.now()){room.waitDeadlineAt=now+ROOM_WAIT_MS;room.roundDeadlineAt=null;room.turnDeadlineAt=null;}
export function beginTiming(room,startIndex,now=Date.now()){
 room.waitDeadlineAt=null;room.roundStartedAt=now;room.turnIndex=startIndex;
 room.roundDeadlineAt=room.settings.mode==='classic'?now+CLASSIC_MS:null;
 room.turnDeadlineAt=room.settings.mode==='relay'?now+RELAY_MS:null;
}
export function ensureTiming(room,now=Date.now()){
 if(room.settings.mode==='undercover'&&room.stage==='playing')return false;
 if(room.stage==='playing'&&!Number.isFinite(room.settings.mode==='classic'?room.roundDeadlineAt:room.turnDeadlineAt)){beginTiming(room,room.turnIndex||0,now);return true;}
 if(room.stage!=='playing'&&!Number.isFinite(room.waitDeadlineAt)){waitForGame(room,now);return true;}
 return false;
}
export const deadlineFor=room=>room.settings.mode==='undercover'?undercoverDeadline(room):room.stage==='playing'?(room.settings.mode==='classic'?room.roundDeadlineAt:room.turnDeadlineAt):room.waitDeadlineAt;
export function timeoutRow(actor,at){
 const unknown=()=>({status:'unknown'});
 return{type:'timeout',actor,at,song:null,views:{},feedback:{song:'wrong',producer:'unknown',singers:'unknown',year:unknown(),views:{niconico:unknown(),youtube:unknown()},billboard:{weeks:unknown(),peak:unknown()},weekly:{weeks:unknown(),peak:unknown()}}};
}
export function advanceClock(room,now=Date.now()){
 if(room.settings.mode==='undercover')return advanceUndercoverClock(room,now);
 if(room.stage!=='playing')return false;
 if(room.settings.mode==='classic'){
  if(room.roundDeadlineAt>now)return false;
  for(const state of Object.values(room.individual))if(stateOutcome(state)==='playing')state.timedOut=true;
  finishRound(room,now);room.result.reason='timeout';return true;
 }
 let changed=false;
 while(room.stage==='playing'&&room.turnDeadlineAt<=now){
  const deadline=room.turnDeadlineAt;room.rows.push(timeoutRow(nextTurn(room),deadline));changed=true;
  if(outcome(room.rows)!=='playing'){finishRound(room,now);room.result.reason='timeout';}
  else{room.turnIndex=(room.turnIndex+1)%room.players.length;room.turnDeadlineAt=deadline+RELAY_MS;}
 }
 return changed;
}
export function roomSettings(input={}){
 if(input.mode==='undercover')return undercoverSettings(input);
 const mode=input.mode??'classic',bo=Number(input.bo??1),capacity=mode==='classic'?2:Number(input.capacity??4);
 if(!['classic','relay'].includes(mode)||![1,3,5].includes(bo)||!Number.isInteger(capacity)||capacity<2||capacity>8)throw new GameError('房间设置有误');
 return{mode,bo,capacity,filters:normalizeFilters(input.filters??{difficulty:'normal'})};
}
export function newRoom(code,player,input){const now=Date.now();return{code,host:player,players:[{id:player,nickname:nickname(input.nickname),ready:false,score:0}],settings:roomSettings(input),stage:'lobby',roundNumber:0,version:0,createdAt:now,touchedAt:now,waitDeadlineAt:now+ROOM_WAIT_MS};}
export const member=(room,id)=>{const p=room?.players.find(p=>p.id===id);if(!p)throw new GameError('你尚未加入这个房间',403);return p;};
export function checkHost(room,id){member(room,id);if(room.host!==id)throw new GameError('只有房主可以操作',403);}
export function configure(room,id,input){checkHost(room,id);if(room.stage!=='lobby')throw new GameError('对局开始后不能更改设置',409);const settings=roomSettings(input);if((room.settings.mode==='undercover')!==(settings.mode==='undercover'))throw new GameError('请从对应游戏入口创建新的房间');if(settings.capacity<room.players.length)throw new GameError('房间人数不能少于当前玩家数');room.settings=settings;room.players.forEach(p=>p.ready=false);}
export function poolFor(source,settings){return filterLibrary(source.songs,settings.filters).map(s=>s.id);}
export function nextTurn(room){return room.players[room.turnIndex%room.players.length].id;}
export function finishRound(room,now=Date.now()){
 const relay=room.settings.mode==='relay';
 let winner=null;
 if(relay){const last=room.rows.at(-1);if(last?.feedback.song==='exact')winner=last.actor;}
 else{const results=room.players.map(p=>({id:p.id,status:stateOutcome(room.individual[p.id]),count:room.individual[p.id].rows.length}));if(results.some(p=>p.status==='playing'))return false;const winners=results.filter(p=>p.status==='won').sort((a,b)=>a.count-b.count);if(winners.length===1||winners.length===2&&winners[0].count<winners[1].count)winner=winners[0].id;}
 if(winner)member(room,winner).score++;
 room.result={winner,draw:!winner,round:room.roundNumber};
 const target=(room.settings.bo+1)/2;
 room.stage=(relay?room.roundNumber>=room.settings.bo:room.players.some(p=>p.score>=target))?'finished':'between';
 waitForGame(room,now);
 return true;
}
export function applyRow(room,id,row,input){
 member(room,id);if(room.stage!=='playing')throw new GameError('当前回合已经结束',409);
 if(input.round!==room.roundNumber)throw new GameError('回合已更新，请同步后重试',409);
 const relay=room.settings.mode==='relay',state=relay?room:room.individual[id];
 if(relay&&nextTurn(room)!==id)throw new GameError('请等待其他玩家猜测',409);
 if(input.attempts!==state.rows.length)throw new GameError('猜测记录已更新，请同步后重试',409);
 if(stateOutcome(state)!=='playing')throw new GameError('你的本轮猜测已经结束',409);
 if(state.rows.some(r=>r.song?.id===row.song.id))throw new GameError('这首歌已经猜过了');
 state.rows.push(row);
 if(relay){if(outcome(room.rows)!=='playing')finishRound(room);else{room.turnIndex=(room.turnIndex+1)%room.players.length;room.turnDeadlineAt=Date.now()+RELAY_MS;}}
 else finishRound(room);
}
export function giveUp(room,id){member(room,id);if(room.stage!=='playing'||room.settings.mode!=='classic'||stateOutcome(room.individual[id])!=='playing')throw new GameError('当前不能放弃');room.individual[id].gaveUp=true;finishRound(room);}
export function projection(room,id,connected=[]){
 if(room.settings.mode==='undercover'){member(room,id);return undercoverProjection(room,id,connected);}
 const me=member(room,id),relay=room.settings.mode==='relay',ended=['between','finished'].includes(room.stage),rows=relay?room.rows||[]:room.individual?.[id]?.rows||[];
 // In classic mode, the answer and full title remain hidden until both finish.
 const game=room.round?roundView(room.round,rows,'room|'+room.code+'|'+room.roundNumber,ended,relay?false:room.individual[id].gaveUp||room.individual[id].timedOut):null;
 if(game&&!ended){delete game.answer;delete game.answerViews;game.hints=hint(room.round.answer,rows,'room|'+room.code+'|'+room.roundNumber,false);}
 return{code:room.code,me:me.id,host:room.host,settings:room.settings,settingLabel:filterDescription(room.settings.filters),stage:room.stage,version:room.version,roundNumber:room.roundNumber,
 timer:{kind:room.stage==='playing'?room.settings.mode:'room',deadlineAt:deadlineFor(room),serverNow:Date.now()},
 players:room.players.map(p=>({id:p.id,nickname:p.nickname,ready:p.ready,score:p.score,connected:connected.includes(p.id),...(ended&&!relay?{attempts:room.individual[p.id].rows.length,won:stateOutcome(room.individual[p.id])==='won',timedOut:Boolean(room.individual[p.id].timedOut)}:{}),...(room.stage==='playing'&&!relay?{finished:stateOutcome(room.individual[p.id])!=='playing'}:{})})),
 poolIds:room.pool||[],turn:relay&&room.stage==='playing'?nextTurn(room):null,result:ended?room.result:null,game};
}
