import {peopleCell,personTags,producersOf,vocalistsOf} from './people.js';
import {coverMarkup} from './covers.js';
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const counts=n=>n>=1e8?(n/1e8).toFixed(2)+'亿':n>=1e4?(n/1e4).toFixed(1)+'万':n.toLocaleString('zh-CN');
function cell(value,result,kind='',title=''){
 const direction=result.direction==='up'?(kind==='year'?'更晚':kind==='peak'?'更靠前':'更多'):result.direction==='down'?(kind==='year'?'更早':kind==='peak'?'更靠后':'更少'):'';
 const note=result.status==='exact'?'✓ 匹配':result.status==='unknown'?'暂无判定':(result.status==='close'?'≈ 接近 · ':'')+(direction||'× 不匹配');
 return '<td class="'+result.status+'"'+(title?' title="'+esc(title)+'"':'')+' aria-label="'+esc(value+'，'+note+(title?'；'+title:''))+'">'+esc(value)+(result.direction?'<span class="direction" aria-hidden="true">'+(result.direction==='up'?'↑':'↓')+'</span>':'')+'<span class="cell-note">'+note+'</span></td>';
}
export function rowMarkup(row,index,charts,players=[]){
 if(row.type==='timeout'){
  const actor=players.find(p=>p.id===row.actor)?.nickname||'玩家';
  return '<tr class="timeout-row"><td class="wrong"><strong class="song-name">空白答案</strong><span class="cell-note">第 '+(index+1)+' 次 · '+esc(actor)+' · 超时</span></td>'+Array.from({length:5+charts.length*2},()=>'<td class="unknown"><span aria-label="空白答案，无线索">—</span></td>').join('')+'</tr>';
 }
 const s=row.song,f=row.feedback,actor=players.find(p=>p.id===row.actor)?.nickname;
 return '<tr><td class="'+f.song+'"><div class="song-entry">'+coverMarkup(s)+'<span class="song-name">'+esc(s.title)+'</span></div><span class="cell-note">'+(f.song==='exact'?'✓ 正是这首':'第 '+(index+1)+' 次猜测')+(actor?' · '+esc(actor):'')+'</span></td>'+peopleCell(f.producerDetails)+peopleCell(f.singerDetails)+cell(s.year,f.year,'year')+['niconico','youtube'].map(key=>{const v=row.views[key];return cell(['ok','stale'].includes(v?.status)?counts(v.count):v?.status==='unavailable'?'原投稿失效':'暂无数据',f.views[key],'views',Number.isFinite(v?.count)?v.count.toLocaleString('zh-CN')+' 次；'+new Date(v.snapshotAt||v.fetchedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（本局固定）':'不参与数值判定');}).join('')+charts.flatMap(key=>['weeks','peak'].map(metric=>{const rank=s.rankings[key];return cell(rank.status!=='complete'?'暂无数据':metric==='weeks'?rank.weeks+' 周':rank.peak===null?'未上榜':'第 '+rank.peak+' 名',f[key][metric],metric);})).join('')+'</tr>';
}
export function headerMarkup(charts){return '<tr class="column-groups"><th colspan="4">歌曲信息</th><th colspan="2">播放量</th>'+charts.map(c=>'<th colspan="2">'+(c==='billboard'?'周榜':'周刊总榜')+'</th>').join('')+'</tr><tr>'+['歌曲','P 主','歌姬','年份','niconico','YouTube',...charts.flatMap(()=>['在榜周数','最高名次'])].map(v=>'<th scope="col">'+v+'</th>').join('')+'</tr>';}
export function resultMarkup(song){const links=['niconico','youtube'].filter(p=>song.videos[p]?.active!==false&&song.videos[p]).map(p=>'<a href="'+esc(song.videos[p].url)+'" target="_blank" rel="noopener noreferrer">'+p+' 原投稿 ↗</a>').join('');return '<div class="result-song">'+coverMarkup(song,{variant:'result',lazy:false})+'<p><strong>'+esc(song.title)+'</strong><br>'+personTags(producersOf(song))+' feat. '+personTags(vocalistsOf(song))+'<br>'+song.year+' 年</p></div><div class="result-links">'+links+'</div>';}
