import {catalog,songData,makeRow,roundView,outcome,body,nickname,GameError,json,randomItem} from './game-data.mjs';
export class DailyChallenge {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.tail=Promise.resolve();}
 fetch(request){const task=this.tail.then(()=>this.handle(request));this.tail=task.catch(()=>{});return task.catch(e=>json({error:e instanceof GameError?e.message:'服务暂时不可用，请重试'},e.status||503));}
 async handle(request){
  const player=request.headers.get('X-Game-Player'),date=request.headers.get('X-Game-Date');
  if(!player||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw new GameError('无效会话',403);
  const path=new URL(request.url).pathname;
  let round=await this.ctx.storage.get('round');
  if(!round){const source=await catalog(this.env),pool=source.songs.filter(s=>s.collections.includes('legend')).map(s=>s.id);const data=await songData(randomItem(pool),source.revision,this.env);round={date,pool,revision:source.revision,version:source.version,answer:data.song,answerViews:data.views};await this.ctx.storage.put('round',round);await this.ctx.storage.setAlarm(Date.now()+3*86400000);}
  if(round.date!==date)throw new GameError('今日题目已更新，请刷新',409);
  let session=await this.ctx.storage.get('player:'+player)||{rows:[],version:0,published:false};
  const view=()=>({...roundView(round,session.rows,'daily|'+date),date,version:session.version,poolIds:round.pool,collection:'legend',published:session.published});
  if(path.endsWith('/guess')){
   if(request.method!=='POST')throw new GameError('Method not allowed',405);
   const input=await body(request);
   if(input.version!==session.version)throw new GameError('进度已更新，请同步后重试',409);
   if(outcome(session.rows)!=='playing')throw new GameError('今天的挑战已经结束',409);
   if(!round.pool.includes(input.songId))throw new GameError('每日挑战固定使用传说曲曲库');
   if(session.rows.some(r=>r.song.id===input.songId))throw new GameError('这首歌已经猜过了');
   const guess=await songData(input.songId,round.revision,this.env);
   session.rows.push(makeRow(guess,round.answer,round.answerViews));session.version++;
   await this.ctx.storage.put('player:'+player,session);
  }else if(path.endsWith('/score')){
   if(request.method!=='POST')throw new GameError('Method not allowed',405);
   const input=await body(request),name=nickname(input.nickname);
   if(outcome(session.rows)!=='won')throw new GameError('猜中今日歌曲后才能提交成绩');
   if(!this.env.DB)throw new GameError('排行榜暂时不可用',503);
   await this.env.DB.prepare('INSERT OR IGNORE INTO daily_scores (day,player_id,nickname,attempts,submitted_at) VALUES (?,?,?,?,?)').bind(date,player,name,session.rows.length,new Date().toISOString()).run();
   session.published=true;await this.ctx.storage.put('player:'+player,session);
  }else if(request.method!=='GET')throw new GameError('Method not allowed',405);
  return json(view());
 }
 async alarm(){await this.ctx.storage.deleteAll();}
}
export async function leaderboard(env,date){
 if(!env.DB)throw new GameError('排行榜暂时不可用',503);
 const result=await env.DB.prepare('SELECT nickname,attempts,submitted_at FROM daily_scores WHERE day=? ORDER BY attempts ASC, submitted_at ASC LIMIT 100').bind(date).all();
 let previous=null,rank=0;
 return{date,entries:result.results.map((s,i)=>{if(s.attempts!==previous){rank=i+1;previous=s.attempts;}return{rank,nickname:s.nickname,attempts:s.attempts};})};
}
