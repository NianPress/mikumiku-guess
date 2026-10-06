import {readFile,writeFile} from 'node:fs/promises';
import {normalize} from '../dist/core.js';
const library=JSON.parse(await readFile('dist/songs.json','utf8'));
const snapshot=JSON.parse(await readFile('data/playback-latest.json','utf8'));
const anchors=['メルト','ワールドイズマイン','みくみくにしてあげる♪','千本桜','ロミオとシンデレラ','裏表ラバーズ','ローリンガール','ワールズエンド・ダンスホール','マトリョシカ','パンダヒーロー','モザイクロール','天ノ弱','六兆年と一夜物語','カゲロウデイズ','ロストワンの号哭','脳漿炸裂ガール','アスノヨゾラ哨戒班','ゴーストルール','砂の惑星','ヒバナ','ロキ','乙女解剖','ベノム','シャルル','命に嫌われている。','テレキャスタービーボーイ','ヴィラン','KING','ラグトレイン','フォニイ','ヴァンパイア','神っぽいな','少女レイ','酔いどれ知らず','強風オールバック','ラビットホール','メズマライザー','オーバーライド','混沌ブギ','人マニア','テトリス','モニタリング','ビビデバ','愛言葉','ラブカ？'];
const cohort=s=>s.year<=2016?'classic':s.year<=2021?'middle':'recent';
const rows=library.songs.map(s=>{
 const counts=Object.fromEntries(['niconico','youtube'].map(p=>[p,snapshot[p].records[s.videos[p]?.id]?.count??null]));
 const values=Object.values(counts).filter(Number.isFinite).map(n=>Math.min(1,Math.log10(1+n)/8)).sort((a,b)=>b-a);
 const charts=Object.values(s.rankings||{}).filter(r=>r.status==='complete');
 const weeks=Math.max(0,...charts.map(r=>r.weeks||0)),peak=Math.min(100,...charts.map(r=>r.peak||100));
 const chartScore=Math.min(1,Math.log10(1+weeks)/2.5)*.7+(peak<=10?(11-peak)/10*.3:0);
 const score=.65*(values[0]||0)+.2*(values[1]??values[0]??0)+.15*chartScore;
 return {id:s.id,title:s.title,producer:s.producer,year:s.year,cohort:cohort(s),counts,weeks,peak:peak===100?null:peak,score:Number(score.toFixed(6)),anchor:anchors.some(a=>normalize(a)===normalize(s.title))};
});
const presets={},audit=new Map(),quota={easy:{classic:20,middle:12,recent:18},normal:{classic:80,middle:50,recent:70},hard:{classic:200,middle:125,recent:175}};
let selected=[];
for(const level of ['easy','normal','hard']){
 for(const group of ['classic','middle','recent']){
  const prior=selected.filter(r=>r.cohort===group).length;
  const choices=rows.filter(r=>r.cohort===group&&!audit.has(r.id)).sort((a,b)=>Number(b.anchor)-Number(a.anchor)||b.score-a.score||a.id.localeCompare(b.id));
  if(choices.length<quota[level][group]-prior)throw Error('年代候选不足：'+group);
  for(const row of choices.slice(0,quota[level][group]-prior)){audit.set(row.id,{...row,firstDifficulty:level,reason:row.anchor?'熟知作品锚点＋年代名额':'综合播放量／主榜成绩＋年代名额'});selected.push(row);}
 }
 presets[level]=selected.map(s=>s.id);
}
const output={version:'popularity-v1',libraryVersion:library.version,snapshotAt:snapshot.updatedAt,scope:'在已收录且核实的歌曲中综合选曲，并非全平台客观播放量总榜。曲单人工可审核、固定发布；每周播放量更新不会自动换曲。',formula:'65% 最高平台对数播放量 + 20% 第二平台对数播放量（单平台使用该平台）+ 15% 主榜周数与名次；熟知作品锚点优先；每档保留经典／中期／近年名额。',cohorts:{classic:'2007—2016',middle:'2017—2021',recent:'2022—2026'},quota,presets,songs:[...audit.values()]};
await writeFile('data/difficulties.json',JSON.stringify(output,null,2)+'\n');
console.log('Fixed difficulty lists:',Object.fromEntries(Object.entries(presets).map(([k,v])=>[k,v.length])));
