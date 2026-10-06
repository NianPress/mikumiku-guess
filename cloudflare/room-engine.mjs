import {normalizeFilters,filterLibrary,filterDescription} from '../dist/filters.js';
import {outcome,roundView,hint,GameError,nickname} from './game-data.mjs';
export function roomSettings(input={}){
 const mode=input.mode??'classic',bo=Number(input.bo??1),capacity=mode==='classic'?2:Number(input.capacity??4);
 if(!['classic','relay'].includes(mode)||![1,3,5].includes(bo)||!Number.isInteger(capacity)||capacity<2||capacity>8)throw new GameError('房间设置有误');
 return{mode,bo,capacity,filters:normalizeFilters(input.filters??{difficulty:'normal'})};
}
export function newRoom(code,player,input){return{code,host:player,players:[{id:player,nickname:nickname(input.nickname),ready:false,score:0}],settings:roomSettings(input),stage:'lobby',roundNumber:0,version:0,createdAt:Date.now(),touchedAt:Date.now()};}
export const member=(room,id)=>{const p=room?.players.find(p=>p.id===id);if(!p)throw new GameError('你尚未加入这个房间',403);return p;};
export function checkHost(room,id){member(room,id);if(room.host!==id)throw new GameError('只有房主可以操作',403);}
export function configure(room,id,input){checkHost(room,id);if(room.stage!=='lobby')throw new GameError('对局开始后不能更改设置',409);const settings=roomSettings(input);if(settings.capacity<room.players.length)throw new GameError('房间人数不能少于当前玩家数');room.settings=settings;room.players.forEach(p=>p.ready=false);}
export function poolFor(source,settings){return filterLibrary(source.songs,settings.filters).map(s=>s.id);}
export function nextTurn(room){return room.players[room.turnIndex%room.players.length].id;}
export function finishRound(room){
 const relay=room.settings.mode==='relay';
 let winner=null;
 if(relay){const last=room.rows.at(-1);if(last?.feedback.song==='exact')winner=last.actor;}
 else{const results=room.players.map(p=>({id:p.id,status:outcome(room.individual[p.id].rows,room.individual[p.id].gaveUp),count:room.individual[p.id].rows.length}));if(results.some(p=>p.status==='playing'))return false;const winners=results.filter(p=>p.status==='won').sort((a,b)=>a.count-b.count);if(winners.length===1||winners.length===2&&winners[0].count<winners[1].count)winner=winners[0].id;}
 if(winner)member(room,winner).score++;
 room.result={winner,draw:!winner,round:room.roundNumber};
 const target=(room.settings.bo+1)/2;
 room.stage=(relay?room.roundNumber>=room.settings.bo:room.players.some(p=>p.score>=target))?'finished':'between';
 return true;
}
export function applyRow(room,id,row,input){
 member(room,id);if(room.stage!=='playing')throw new GameError('当前回合已经结束',409);
 if(input.round!==room.roundNumber)throw new GameError('回合已更新，请同步后重试',409);
 const relay=room.settings.mode==='relay',state=relay?room:room.individual[id];
 if(relay&&nextTurn(room)!==id)throw new GameError('请等待其他玩家猜测',409);
 if(input.attempts!==state.rows.length)throw new GameError('猜测记录已更新，请同步后重试',409);
 if(outcome(state.rows,state.gaveUp)!=='playing')throw new GameError('你的本轮猜测已经结束',409);
 if(state.rows.some(r=>r.song.id===row.song.id))throw new GameError('这首歌已经猜过了');
 state.rows.push(row);
 if(relay){if(outcome(room.rows)!=='playing')finishRound(room);else room.turnIndex=(room.turnIndex+1)%room.players.length;}
 else finishRound(room);
}
export function giveUp(room,id){member(room,id);if(room.stage!=='playing'||room.settings.mode!=='classic'||outcome(room.individual[id].rows,room.individual[id].gaveUp)!=='playing')throw new GameError('当前不能放弃');room.individual[id].gaveUp=true;finishRound(room);}
export function projection(room,id,connected=[]){
 const me=member(room,id),relay=room.settings.mode==='relay',ended=['between','finished'].includes(room.stage),rows=relay?room.rows||[]:room.individual?.[id]?.rows||[];
 // In classic mode, the answer and full title remain hidden until both finish.
 const game=room.round?roundView(room.round,rows,'room|'+room.code+'|'+room.roundNumber,ended,relay?false:room.individual[id].gaveUp):null;
 if(game&&!ended){delete game.answer;delete game.answerViews;game.hints=hint(room.round.answer,rows,'room|'+room.code+'|'+room.roundNumber,false);}
 return{code:room.code,me:me.id,host:room.host,settings:room.settings,settingLabel:filterDescription(room.settings.filters),stage:room.stage,version:room.version,roundNumber:room.roundNumber,
 players:room.players.map(p=>({id:p.id,nickname:p.nickname,ready:p.ready,score:p.score,connected:connected.includes(p.id),...(ended&&!relay?{attempts:room.individual[p.id].rows.length,won:outcome(room.individual[p.id].rows,room.individual[p.id].gaveUp)==='won'}:{}),...(room.stage==='playing'&&!relay?{finished:outcome(room.individual[p.id].rows,room.individual[p.id].gaveUp)!=='playing'}:{})})),
 poolIds:room.pool||[],turn:relay&&room.stage==='playing'?nextTurn(room):null,result:ended?room.result:null,game};
}
