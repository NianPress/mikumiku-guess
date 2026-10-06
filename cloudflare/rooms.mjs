import {catalog,songData,makeRow,body,nickname,GameError,json,randomItem} from './game-data.mjs';
import {newRoom,roomSettings,member,configure,checkHost,poolFor,projection,applyRow,giveUp,finishRound} from './room-engine.mjs';
const TTL=24*60*60*1000;
export class GameRoom {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.tail=Promise.resolve();ctx.blockConcurrencyWhile(async()=>{this.room=await ctx.storage.get('room');});}
 fetch(request){const task=this.tail.then(async()=>{const before=structuredClone(this.room);try{return await this.handle(request);}catch(error){try{this.room=await this.ctx.storage.get('room');}catch{this.room=before;}throw error;}});this.tail=task.catch(()=>{});return task.catch(e=>json({error:e instanceof GameError?e.message:'房间暂时无法读取，请重试'},e.status||503));}
 connected(){return[...new Set(this.ctx.getWebSockets().map(ws=>ws.deserializeAttachment()?.id).filter(Boolean))];}
 view(id){return projection(this.room,id,this.connected());}
 broadcast(){for(const ws of this.ctx.getWebSockets()){try{const id=ws.deserializeAttachment()?.id;ws.send(JSON.stringify({type:'state',state:this.view(id)}));}catch{try{ws.close(1008,'已离开房间');}catch{}}}}
 async persist(){this.room.version++;this.room.touchedAt=Date.now();await this.ctx.storage.put('room',this.room);await this.ctx.storage.setAlarm(this.room.touchedAt+TTL);this.broadcast();}
 async begin(){
  const r=this.room,source=await catalog(this.env),pool=r.pool||poolFor(source,r.settings),revision=r.revision||source.revision;
  let choices=pool.filter(id=>id!==r.round?.answer.id);if(!choices.length)choices=pool;
  const data=await songData(randomItem(choices),revision,this.env);
  r.pool=pool;r.revision=revision;r.round={answer:data.song,answerViews:data.views,revision};r.roundNumber++;r.rows=[];r.turnIndex=(r.roundNumber-1)%r.players.length;
  r.individual=Object.fromEntries(r.players.map(p=>[p.id,{rows:[],gaveUp:false}]));r.result=null;r.stage='playing';
 }
 async handle(request){
  const id=request.headers.get('X-Game-Player'),code=request.headers.get('X-Game-Code'),action=new URL(request.url).pathname.split('/').at(-1);
  if(!id)throw new GameError('无效会话',403);
  if(action==='create'){
   if(this.room&&Date.now()-this.room.touchedAt<TTL)throw new GameError('房间码已存在',409);
   const candidate=newRoom(code,id,await body(request)),source=await catalog(this.env);if(!poolFor(source,candidate.settings).length)throw new GameError('这个组合没有歌曲');this.room=candidate;
   await this.persist();return json(this.view(id));
  }
  if(!this.room||Date.now()-this.room.touchedAt>=TTL)throw new GameError('房间不存在或已经过期',404);
  if(action==='join'){
   const input=await body(request);if(!this.room.players.some(p=>p.id===id)){
    if(this.room.stage!=='lobby')throw new GameError('对局已经开始，暂不能加入新玩家',409);
    if(this.room.players.length>=this.room.settings.capacity)throw new GameError('房间已满',409);
    const name=nickname(input.nickname);if(this.room.players.some(p=>p.nickname===name))throw new GameError('昵称已被使用，请换一个');
    this.room.players.push({id,nickname:name,ready:false,score:0});await this.persist();
   }
   return json(this.view(id));
  }
  member(this.room,id);
  if(action==='events'){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')throw new GameError('WebSocket required',426);
   for(const old of this.ctx.getWebSockets())if(old.deserializeAttachment()?.id===id)old.close(1000,'新连接已接管');
   const [client,server]=Object.values(new WebSocketPair());this.ctx.acceptWebSocket(server);server.serializeAttachment({id});this.broadcast();
   return new Response(null,{status:101,webSocket:client});
  }
  if(action==='state'){if(request.method!=='GET')throw new GameError('Method not allowed',405);return json(this.view(id));}
  const input=await body(request),r=this.room;
  if(action==='configure'){const source=await catalog(this.env);if(!poolFor(source,roomSettings(input)).length)throw new GameError('这个组合没有歌曲');configure(r,id,input);}
  else if(action==='ready'){if(r.stage!=='lobby')throw new GameError('当前不能更改准备状态');member(r,id).ready=Boolean(input.ready);}
  else if(action==='start'){checkHost(r,id);if(r.stage!=='lobby'||r.players.length<2||r.players.some(p=>!p.ready))throw new GameError('需要至少两位玩家全部准备');await this.begin();}
  else if(action==='next'){checkHost(r,id);if(r.stage!=='between')throw new GameError('当前不能开始下一轮');if(input.round!==r.roundNumber)throw new GameError('回合已更新',409);await this.begin();}
  else if(action==='guess'){
   if(!r.pool?.includes(input.songId))throw new GameError('请在房间曲库中选择歌曲');
   const guess=await songData(input.songId,r.revision,this.env);applyRow(r,id,makeRow(guess,r.round.answer,r.round.answerViews,id),input);
  }
  else if(action==='give-up'){if(input.round!==r.roundNumber)throw new GameError('回合已更新',409);giveUp(r,id);}
  else if(action==='end-round'){checkHost(r,id);if(r.stage!=='playing'||r.settings.mode!=='relay'||input.round!==r.roundNumber)throw new GameError('当前不能结束回合');finishRound(r);}
  else if(action==='leave'){
   if(r.stage==='playing'||r.stage==='between')throw new GameError('对局中请保留房间，断线后可重新加入；房主可以结束对局');
   r.players=r.players.filter(p=>p.id!==id);if(r.host===id)r.host=r.players[0]?.id||null;
   for(const ws of this.ctx.getWebSockets())if(ws.deserializeAttachment()?.id===id)ws.close(1000,'已离开房间');
   await this.persist();return json({left:true});
  }
  else if(action==='close-match'){checkHost(r,id);if(!['playing','between'].includes(r.stage))throw new GameError('当前没有进行中的对局');r.stage='cancelled';r.result=null;}
  else if(action==='rematch'){checkHost(r,id);if(!['finished','cancelled'].includes(r.stage))throw new GameError('对局尚未结束');r.stage='lobby';r.round=null;r.roundNumber=0;r.pool=null;r.revision=null;r.players.forEach(p=>{p.ready=false;p.score=0;});}
  else throw new GameError('Not found',404);
  await this.persist();return json(this.view(id));
 }
 webSocketMessage(ws,message){if(typeof message==='string'&&message==='sync'){try{ws.send(JSON.stringify({type:'state',state:this.view(ws.deserializeAttachment()?.id)}));}catch{ws.close(1008,'房间已结束');}}else ws.close(1008,'无效消息');}
 webSocketClose(ws){try{ws.close(1000,'连接已关闭');}catch{}this.broadcast();}
 webSocketError(ws){ws.close(1011,'连接中断');}
 async alarm(){for(const ws of this.ctx.getWebSockets())ws.close(1000,'房间已过期');await this.ctx.storage.deleteAll();this.room=null;}
}
