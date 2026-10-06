import {readFileSync,writeFileSync} from 'node:fs';
import {applyWeekly} from './weekly-data.mjs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const library=read('dist/songs.json'),billboard=read('data/billboard-records.json'),weekly=read('data/weekly-main-records.json');
const idCorrections=read('data/billboard-id-corrections.json').corrections;
for(const fix of idCorrections){const row=billboard.charts.find(c=>c.date===fix.date)?.rows.find(r=>r.title===fix.title&&r.artist===fix.artist);if(row?.id===fix.fromId){row.officialOutboundVideoId=row.id;row.id=fix.toId;row.identityMethod=fix.reason;}}
// Some official archive weeks omit outbound links. Resolve only an exact title
// and artist pair with a single consistent linked ID in other official weeks.
const chartKey=r=>r.title+'|'+r.artist,knownIds=new Map();
for(const c of billboard.charts)for(const r of c.rows)if(r.id){const set=knownIds.get(chartKey(r))||new Set();set.add(r.id);knownIds.set(chartKey(r),set)}
for(const c of billboard.charts)for(const r of c.rows)if(!r.id&&knownIds.get(chartKey(r))?.size===1){r.id=[...knownIds.get(chartKey(r))][0];r.identityMethod='exact title + artist in official linked chart history'}
const report=[];
for(const s of library.songs){
 const id=s.videos.niconico?.id,ids=new Set([id,...(s.audit?.alternateOriginalVideos?.niconico||[]).map(u=>u.match(/\/(sm\d+|nm\d+|so\d+)/)?.[1])].filter(Boolean)),rows=billboard.charts.flatMap(c=>{const ranks=c.rows.filter(r=>r.id&&ids.has(r.id));return ranks.length?[{date:c.date,rank:Math.min(...ranks.map(r=>r.rank)),url:c.url}]:[]});
 s.rankings.billboard=id?{status:'complete',weeks:rows.length,peak:rows.length?Math.min(...rows.map(r=>r.rank)):null,from:billboard.from,through:billboard.through,history:rows}:{status:'unavailable',weeks:null,peak:null,reason:'original_unconfirmed'};
 const latest=billboard.charts[0].rows.find(r=>r.id===id);if(ids.size===1&&latest&&latest.cumulative!==rows.length)report.push({song:s.title,computed:rows.length,official:latest.cumulative});
}
applyWeekly(library,weekly);
library.charts.billboard={status:'complete',from:billboard.from,through:billboard.through,periods:billboard.charts.length,scope:'主榜 TOP20，仅原投稿视频 ID 匹配，不合并重制或转载',source:'https://www.billboard-japan.com/charts/detail/?a=niconico'};
writeFileSync('dist/songs.json',JSON.stringify(library,null,2));
writeFileSync('data/verification-report.json',JSON.stringify({retrievedAt:library.retrievedAt,billboardPeriods:billboard.charts.length,cumulativeMismatches:report,weeklyErrors:weekly.coverage.missingPeriods,idCorrections,resolvedLinklessRows:billboard.charts.flatMap(c=>c.rows.filter(r=>r.identityMethod).map(r=>({date:c.date,...r})))},null,2));
const q=v=>'"'+String(v??'').replaceAll('"','""')+'"';
const headers=['歌曲ID','原曲标题','P主','歌姬','投稿日期','niconico官方链接','YouTube官方链接','周榜累计周数','周榜最高名次','周榜截止日期','周刊累计周数','周刊最高名次','周刊统计状态','官方链接核对备注'];
writeFileSync('曲库整理模板.csv','\uFEFF'+[headers,...library.songs.map(s=>[s.id,s.title,s.producer,s.singers.join('|'),s.publishDate,...['niconico','youtube'].map(p=>s.videos[p]?.url||''),s.rankings.billboard.weeks,s.rankings.billboard.peak,billboard.through,s.rankings.weekly.weeks,s.rankings.weekly.peak,s.rankings.weekly.status==='complete'?'已汇总第1–'+weekly.coverage.toEpisode+'期':'官方原投稿待核实','链接未收录不等于没有官方投稿'])].map(r=>r.map(q).join(',')).join('\r\n'));
writeFileSync('周刊总榜补录模板.csv','\uFEFF'+[['期数','榜单类型','名次','niconico原投稿ID','原视频或可靠档案链接','核对备注'],[613,'overall',1,'','', '仅总榜TOP10，不填新曲榜或UTAU榜']].map(r=>r.map(q).join(',')).join('\r\n'));
console.log(JSON.stringify({corpus:library.songs.length,periods:billboard.charts.length,through:billboard.through,mismatches:report,weeklyErrors:weekly.coverage.missingPeriods}));
