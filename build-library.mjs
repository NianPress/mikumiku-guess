import {readFileSync,writeFileSync} from 'node:fs';
const raw=JSON.parse(readFileSync('D:/codex/reference-notes/vocadb-top.json','utf8').replace(/^\uFEFF/,''));
const selected=[1501,3022,368,19094,20,8394,1320,1032,63276,288238,164107,1326,555,1322,1508,15662,49755,13351,1435,68814,112085,1381,5166,1500,11219,13260,157860,2982,25667,35603,192291,42676,1363,1357,354245,60953,4980,3129,668055,8735,44190,3387,42111];
const names={1501:'Rolling Girl|翻滚女孩',3022:'炉心融解',368:'俄罗斯套娃|Matryoshka',19094:'Lost One 的号哭|失落之人的号哭',20:'世末舞厅|World’s End Dancehall',8394:'千本樱',1320:'恋爱战争|Love Is War',1032:'罗密欧与灰姑娘',63276:'HIBIKASE|让其响彻',288238:'延误列车|Lagtrain',164107:'Unknown Mother Goose|不为人知的鹅妈妈童谣',1326:'世界第一的公主殿下|World Is Mine',555:'东京泰迪熊',1322:'Melt|熔化',1508:'里表情人|裏表情人|Two-Faced Lovers',15662:'Odds and Ends',49755:'Luvoratory',13351:'常见的世界征服',1435:'Luka Luka Night Fever|巡音巡音夜狂热',68814:'回声',112085:'幽灵法则|Ghost Rule',1381:'马赛克卷|Mozaik Role',5166:'磁铁',1500:'不幸的重播|Unhappy Refrain',11219:'六兆年与一夜物语',13260:'这里是幸福安心委员会',157860:'砂之行星|沙之行星|DUNE',2982:'结起又解开的罗刹与骸',25667:'爱我爱我爱我|Love Me Love Me Love Me',35603:'Viva Happy',192291:'劣等上等|BRING IT ON',42676:'甜甜圈洞|Donut Hole',1363:'活动小丑|机关小丑|Karakuri Pierrot',1357:'心|Kokoro',354245:'像神一样|神似|God-ish',60953:'Drop Pop Candy',4980:'蕾娅',3129:'双重回转|Double Lariat',668055:'监控|Monitoring',8735:'深海少女|Deep Sea Girl',44190:'孩子气的战争|幼稚战争',3387:'遥控器|Remote Controller',42111:'少女A|Young Girl A'};
const producerNames={'ハチ':'Hachi','黒うさP':'黑兔P','ピノキオピー':'匹诺曹P','湊貴大':'minato','うたたP':'UtataP','きくお':'Kikuo','稲葉曇':'稻叶昙','トラボルタ':'トラボルタP','ゆうゆ':'ゆうゆP','アゴアニキ':'アゴアニキP','椎名もた':'椎名もた','じーざすP':'じーざすP'};
function vocalist(name){if(name.includes('初音'))return'初音未来';if(name.includes('鏡音リン'))return'镜音铃';if(name.includes('鏡音レン'))return'镜音连';if(name.includes('巡音'))return'巡音流歌';if(name.includes('GUMI'))return'GUMI';if(name.includes('歌愛ユキ'))return'歌爱雪';return name.split(' ')[0];}
const songs=selected.map(id=>{
const s=raw.items.find(s=>s.id===id);if(!s)throw new Error('Missing song '+id);
const vocalists=[...new Set(s.artists.filter(a=>a.categories.includes('Vocalist')&&!a.isSupport).map(a=>vocalist(a.name)))].sort();
const producers=s.artists.filter(a=>a.categories.includes('Producer')&&!a.isSupport);
const composer=producers.find(a=>a.effectiveRoles.includes('Composer'))||producers[0];if(!composer)throw new Error('Missing producer '+id);
const p=producerNames[composer.artist.name]||composer.artist.name;
const originalPVs=s.pvs.filter(p=>p.pvType==='Original'&&!p.disabled);
const pv=originalPVs.find(p=>p.service==='NicoNicoDouga')||originalPVs[0];
return{id:String(id),title:s.defaultName,aliases:[...new Set([...s.names.map(n=>n.value),...(names[id]||'').split('|')])],producer:p,producerId:String(composer.artist.id),producerAliases:[composer.artist.name,...(composer.artist.additionalNames||'').split(',').map(x=>x.trim())],singers:vocalists,year:Number(s.publishDate.slice(0,4)),duration:s.lengthSeconds,publishDate:s.publishDate.slice(0,10),source:'https://vocadb.net/S/'+id,originalUrl:pv?.url.replace(/^http:/,'https:')||'https://vocadb.net/S/'+id};
});
writeFileSync('dist/songs.json',JSON.stringify({version:'2026-10-02-v1',source:'https://vocadb.net/',retrievedAt:'2026-10-02',songs},null,2));
const q=v=>'"'+String(v).replaceAll('"','""')+'"';
const header=['id','原曲标题','搜索别名','主作曲者','演唱者','原曲投稿日期','曲库时长秒','VocaDB来源','原投稿链接','素材授权备注'];
const csv=[header.map(q).join(','),...songs.map(s=>[s.id,s.title,s.aliases.join('|'),s.producer,s.singers.join('|'),s.publishDate,s.duration,s.source,s.originalUrl,'元数据模式，无音频或图片素材'].map(q).join(','))].join('\r\n');
writeFileSync('曲库整理模板.csv','\uFEFF'+csv);
console.log(JSON.stringify({songs:songs.length,miku:songs.filter(s=>s.singers.includes('初音未来')).length}));
