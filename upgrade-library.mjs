import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
mkdirSync('data',{recursive:true});
const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const original=read('dist/songs.json'),raw=read('D:/codex/reference-notes/vocadb-expanded.json');
const extras={610187:'催眠术|Mesmerizer',588814:'医学|Igaku',520007:'人类狂热|人狂|Human Mania',354989:'Phony|伪物',343363:'心跳不止|Kyu-kurarin',578318:'Override|覆写',197929:'少女幽灵|Shoujo Rei',185363:'摇滚|Roki',1323:'黑岩射手|Black Rock Shooter',2443:'Last Night Good Night',5364:'Freely Tomorrow',4083:'蔬菜汁|PoPiPo',2978:'熊猫英雄|Panda Hero',17189:'脑浆炸裂女孩',4979:'阳炎眩乱|Kagerou Daze',199209:'Venom|毒液',164074:'火花|Hibana',4129:'Melancholic|忧郁的心情',2356:'天之弱',185364:'失落的伞|Lost Umbrella',271917:'恶棍|Villain'};
const synths=new Set(['Vocaloid','UTAU','CeVIO','SynthesizerV','OtherVoiceSynth','Voiceroid']);
const names={'初音ミク':'初音未来','鏡音リン':'镜音铃','鏡音レン':'镜音连','巡音ルカ':'巡音流歌','歌愛ユキ':'歌爱雪','重音テト':'重音 Teto','可不':'可不','足立レイ':'足立 Rei','音街ウナ':'音街 Una'};
const singer=name=>name.includes('GUMI')?'GUMI':name.includes('flower')?'flower':name.includes('VY1')?'VY1':Object.entries(names).find(([key])=>name.includes(key))?.[1]||name.replace(/\s+(?:V\d|SV|AI|Append|NT).*$/i,'');
const songs=raw.items.filter(s=>s.lengthSeconds>0&&s.publishDate&&s.artists.some(a=>!a.isSupport&&a.categories.includes('Vocalist')&&synths.has(a.artist.artistType))).map(s=>{
 const old=original.songs.find(o=>o.id===String(s.id));
 const producers=s.artists.filter(a=>!a.isSupport&&a.categories.includes('Producer')),p=producers.find(a=>a.effectiveRoles.includes('Composer'))||producers[0];
 if(!p)throw new Error('Missing composer: '+s.id);
 const videos={};for(const [key,service] of [['bilibili','Bilibili'],['niconico','NicoNicoDouga'],['youtube','Youtube']]){
  const list=s.pvs.filter(pv=>pv.pvType==='Original'&&pv.service===service&&pv.pvId).sort((a,b)=>Number(a.disabled)-Number(b.disabled)||a.publishDate.localeCompare(b.publishDate));
  const pv=list.find(pv=>!/(?:- Topic$|Live\b|ライブ)/i.test(pv.author+' '+pv.name))||list[0];
  videos[key]=pv?{id:pv.pvId,url:pv.url.replace(/^http:/,'https:'),author:pv.author,title:pv.name,active:!pv.disabled,verification:'VocaDB Original PV',verifiedAt:'2026-10-02'}:null;
 }
 return{...old,id:String(s.id),title:s.defaultName,aliases:[...new Set([...(old?.aliases||[]),...s.names.map(n=>n.value),...(extras[s.id]||'').split('|').filter(Boolean)])],producer:old?.producer||p.artist.name,producerId:String(p.artist.id),producerAliases:[...new Set([...(old?.producerAliases||[]),p.artist.name,...(p.artist.additionalNames||'').split(',').map(v=>v.trim()).filter(Boolean)])],singers:[...new Set(s.artists.filter(a=>!a.isSupport&&a.categories.includes('Vocalist')&&synths.has(a.artist.artistType)).map(a=>singer(a.name)))].sort(),year:Number(s.publishDate.slice(0,4)),publishDate:s.publishDate.slice(0,10),duration:s.lengthSeconds,source:'https://vocadb.net/S/'+s.id,originalUrl:videos.niconico?.url||videos.youtube?.url||videos.bilibili?.url||'https://vocadb.net/S/'+s.id,videos,rankings:{billboard:{status:'pending',weeks:null,peak:null},weekly:{status:'partial',weeks:null,peak:null,knownWeeks:null,knownPeak:null}},availability:{bilibili:videos.bilibili?'official':'unconfirmed',niconico:videos.niconico?'official':'unconfirmed',youtube:videos.youtube?'official':'unconfirmed'}};
});
writeFileSync('data/song-metadata.json',JSON.stringify(songs,null,2));
writeFileSync('dist/songs.json',JSON.stringify({version:'2026-10-02-v2',retrievedAt:'2026-10-02',source:'https://vocadb.net/',scope:'泛 V 知名原创曲；VocaDB 评分前 100 条中的合成歌声曲目',charts:{billboard:{status:'pending'},weekly:{status:'partial',fromEpisode:1,legacyThrough:612,scope:'旧制 TOP30；第 613 期起仅总榜 TOP10；不含新曲榜、UTAU 榜、副榜'}},songs},null,2));
console.log('Expanded corpus:',songs.length,'voices:',[...new Set(songs.flatMap(s=>s.singers))].join(', '));
