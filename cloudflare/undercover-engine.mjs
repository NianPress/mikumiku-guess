import bank from '../data/undercover-bank.json' with {type:'json'};
import {GameError,randomItem} from './game-data.mjs';
import {normalize} from '../dist/core.js';
export const VOTE_MS=60_000,BLANK_MS=60_000,DISCUSSION_IDLE_MS=2*60*60*1000;
export const undercoverBank=bank;
export const roleName=role=>({civilian:'平民',spy:'卧底',blank:'白板'}[role]);
export function undercoverSettings(input={}){
 const capacity=Number(input.capacity??6),spies=Number(input.spies??0),blank=input.blank??false,anonymousVoting=input.anonymousVoting??false;
 if(!Number.isInteger(capacity)||capacity<3||capacity>10||!Number.isInteger(spies)||spies<0||spies>3||typeof blank!=='boolean'||typeof anonymousVoting!=='boolean')throw new GameError('人数请设置为3—10人，卧底数量选择自动或1—3名；白板和匿名投票请使用勾选开关');
 const settings={mode:'undercover',capacity,spies,blank,anonymousVoting};roleCounts(capacity,settings);return settings;
}
export function roleCounts(count,settings){
 const spies=settings.spies||(count<=5?1:count<=8?2:3),blank=settings.blank?1:0,civilian=count-spies-blank;
 if(count<3||count>10||civilian<1||spies>=count-spies)throw new GameError('当前人数不适合这个身份组合：至少保留1名平民，卧底须少于其余玩家。请减少卧底或等待朋友加入');
 return {civilian,spy:spies,blank};
}
function shuffled(values){const result=[...values];for(let i=result.length-1;i>0;i--){const j=randomItem(Array.from({length:i+1},(_,k)=>k));[result[i],result[j]]=[result[j],result[i]];}return result;}
function alive(room){return room.players.filter(p=>room.undercover.members[p.id].alive);}
function assertMatch(room,input){if(room.stage!=='playing'||input.matchId!==room.undercover?.matchId)throw new GameError('对局已更新，请同步房间后重试',409);}
function assertBallot(room,input){assertMatch(room,input);if(input.ballot!==room.undercover.ballot)throw new GameError('投票轮次已更新，请重新选择',409);}
export function startUndercover(room,now=Date.now()){
 const counts=roleCounts(room.players.length,room.settings),choices=bank.questions.filter(q=>q.id!==room.lastUndercoverPairId),pair=structuredClone(randomItem(choices.length?choices:bank.questions));
 if(randomItem([false,true]))[pair.civilian,pair.undercover]=[pair.undercover,pair.civilian];
 const roles=shuffled([...Array(counts.spy).fill('spy'),...Array(counts.blank).fill('blank'),...Array(counts.civilian).fill('civilian')]);
 room.undercover={matchId:crypto.randomUUID(),bankVersion:bank.version,pair,phase:'discussion',round:1,ballot:0,runoff:false,candidates:[],votes:{},lastBallot:null,eliminations:[],blankPlayer:null,deadlineAt:null,result:null,
  order:shuffled(room.players.map(p=>p.id)),members:Object.fromEntries(room.players.map((p,i)=>[p.id,{role:roles[i],alive:true}]))};
 room.lastUndercoverPairId=pair.id;room.roundNumber++;room.stage='playing';room.waitDeadlineAt=null;room.touchedAt=now;
}
function finish(room,winner,reason,now,whitePlayer=null){
 const u=room.undercover;u.phase='finished';u.deadlineAt=null;room.stage='finished';room.waitDeadlineAt=now+10*60*1000;
 const winners=room.players.filter(p=>whitePlayer?p.id===whitePlayer:u.members[p.id].role===winner).map(p=>p.id);
 u.result={winner,winners,reason};for(const p of room.players)if(winners.includes(p.id))p.score++;
}
export function checkUndercoverWinner(room,now=Date.now()){
 const remaining=alive(room),u=room.undercover,spies=remaining.filter(p=>u.members[p.id].role==='spy'),whites=remaining.filter(p=>u.members[p.id].role==='blank');
 if(whites.length&&remaining.length<=2){finish(room,'blank','survived',now,whites[0].id);return true;}
 if(!spies.length&&!whites.length){finish(room,'civilian','eliminated',now);return true;}
 if(spies.length&&spies.length>=remaining.length-spies.length){finish(room,'spy','parity',now);return true;}
 return false;
}
function discussion(room){const u=room.undercover;u.phase='discussion';u.round++;u.votes={};u.candidates=[];u.runoff=false;u.blankPlayer=null;u.deadlineAt=null;}
export function startVote(room,input,now=Date.now()){
 assertBallot(room,input);const u=room.undercover;
 if(!['discussion','runoff-discussion'].includes(u.phase))throw new GameError('当前不能开始投票',409);
 u.runoff=u.phase==='runoff-discussion';u.phase='voting';u.ballot++;u.votes={};u.deadlineAt=now+VOTE_MS;
 if(!u.runoff)u.candidates=alive(room).map(p=>p.id);
}
export function resolveVote(room,now=Date.now()){
 const u=room.undercover;if(u.phase!=='voting')return false;
 const remaining=alive(room),counts=Object.fromEntries(u.candidates.map(id=>[id,0]));
 for(const target of Object.values(u.votes))if(target!==null&&Object.hasOwn(counts,target))counts[target]++;
 const max=Math.max(0,...Object.values(counts)),top=max?u.candidates.filter(id=>counts[id]===max):[];
 u.lastBallot={ballot:u.ballot,runoff:u.runoff,counts,votes:remaining.map(p=>({playerId:p.id,target:Object.hasOwn(u.votes,p.id)?u.votes[p.id]:null})),eliminated:null,tied:top.length>1,abstained:remaining.length-Object.values(u.votes).filter(v=>v!==null).length};u.deadlineAt=null;
 if(top.length>1&&!u.runoff){u.phase='runoff-discussion';u.candidates=top;u.votes={};return true;}
 if(top.length!==1){discussion(room);return true;}
 const eliminated=top[0],role=u.members[eliminated].role;u.members[eliminated].alive=false;u.lastBallot.eliminated=eliminated;u.eliminations.push({playerId:eliminated,role,round:u.round,ballot:u.ballot});
 if(role==='blank'){u.phase='blank-guess';u.blankPlayer=eliminated;u.deadlineAt=now+BLANK_MS;return true;}
 if(!checkUndercoverWinner(room,now))discussion(room);return true;
}
export function castVote(room,id,input,now=Date.now()){
 assertBallot(room,input);const u=room.undercover;
 if(u.phase!=='voting'||now>=u.deadlineAt)throw new GameError('投票已经结束',409);
 if(!u.members[id]?.alive)throw new GameError('淘汰后只能观战',403);
 const target=input.target;
 if(target!==null&&(typeof target!=='string'||target===id||!u.candidates.includes(target)||!u.members[target]?.alive))throw new GameError('请选择本轮候选玩家，不能投自己');
 u.votes[id]=target;if(alive(room).every(p=>Object.hasOwn(u.votes,p.id)))resolveVote(room,now);
}
export function guessBlank(room,id,input,now=Date.now()){
 assertMatch(room,input);const u=room.undercover;
 if(u.phase!=='blank-guess'||u.blankPlayer!==id)throw new GameError('只有刚被淘汰的白板可以猜词',403);
 if(now>=u.deadlineAt)throw new GameError('猜词时间已到',409);
 if(typeof input.word!=='string'||[...input.word].length>160||!normalize(input.word))throw new GameError('请输入完整的平民歌曲名或已收录别名');
 const correct=[u.pair.civilian.title,...u.pair.civilian.aliases].some(word=>normalize(word)===normalize(input.word));u.blankGuess={playerId:id,correct,timedOut:false};u.deadlineAt=null;
 if(correct)finish(room,'blank','guessed',now,id);else if(!checkUndercoverWinner(room,now))discussion(room);
}
export function advanceUndercoverClock(room,now=Date.now()){
 const u=room.undercover;if(room.stage!=='playing'||!u.deadlineAt||u.deadlineAt>now)return false;
 if(u.phase==='voting')return resolveVote(room,now);
 if(u.phase==='blank-guess'){u.blankGuess={playerId:u.blankPlayer,correct:false,timedOut:true};if(!checkUndercoverWinner(room,now))discussion(room);return true;}return false;
}
export function undercoverDeadline(room){return room.stage==='playing'?(room.undercover.deadlineAt||room.touchedAt+DISCUSSION_IDLE_MS):room.waitDeadlineAt;}
export function undercoverIdleExpired(room,now){return room.stage==='playing'&&['discussion','runoff-discussion'].includes(room.undercover.phase)&&undercoverDeadline(room)<=now;}
export function undercoverProjection(room,id,connected=[]){
 const ended=['finished','cancelled'].includes(room.stage),u=room.undercover,me=u?.members[id],active=u&&room.stage==='playing';
 const order=u?u.order.filter(pid=>u.members[pid].alive):[],shift=order.length?(u.round-1)%order.length:0,speakingOrder=[...order.slice(shift),...order.slice(0,shift)];
 // Anonymous rooms never send voter-to-target mappings, including after the game ends.
 let lastBallot=null;
 if(u?.lastBallot){const {votes,...totals}=u.lastBallot;lastBallot={...totals,anonymous:Boolean(room.settings.anonymousVoting),...(!room.settings.anonymousVoting?{votes}: {})};}
 return {code:room.code,me:id,host:room.host,settings:room.settings,stage:room.stage,version:room.version,roundNumber:room.roundNumber,timer:{kind:active?u.phase:'room',deadlineAt:undercoverDeadline(room),serverNow:Date.now()},
  players:room.players.map(p=>({id:p.id,nickname:p.nickname,ready:p.ready,score:p.score,connected:connected.includes(p.id),alive:u?u.members[p.id].alive:true,...(u&&(!u.members[p.id].alive||ended)?{role:u.members[p.id].role}:{}),...(ended&&u?{word:u.members[p.id].role==='blank'?null:u.pair[u.members[p.id].role==='spy'?'undercover':'civilian'].title}:{})})),
  undercover:u?{matchId:u.matchId,phase:u.phase,round:u.round,ballot:u.ballot,runoff:u.runoff,bankVersion:u.bankVersion,personal:{alive:me.alive,isBlank:me.role==='blank',word:me.role==='blank'?null:u.pair[me.role==='spy'?'undercover':'civilian'].title},speakingOrder,candidates:active&&u.phase==='voting'?u.candidates:[],voted:active&&u.phase==='voting'?Object.keys(u.votes):[],myVote:active&&Object.hasOwn(u.votes,id)?{target:u.votes[id]}:null,lastBallot,eliminations:u.eliminations,blankPlayer:u.blankPlayer,blankGuess:u.blankGuess?{...u.blankGuess}:null,...(ended?{words:{civilian:u.pair.civilian.title,spy:u.pair.undercover.title},result:u.result,pairId:u.pair.id}:{})}:null};
}
