export const COLLECTION_OPTIONS=[
 {id:'all',label:'全部已收录曲库',description:'同时显示周榜与周刊线索。'},
 {id:'billboard',label:'周榜曲库',description:'所有曾进入 Billboard 主榜 TOP20 的歌曲，只显示周榜线索。'},
 {id:'weekly',label:'周刊曲库',description:'所有曾进入周刊总榜的歌曲，只显示周刊线索。'},
 {id:'legend',label:'传说曲',description:'niconico 官方原投稿达到 100 万再生，包含神话曲。'},
 {id:'myth',label:'神话曲',description:'niconico 官方原投稿达到 1000 万再生。'},
 {id:'youtube100',label:'YouTube 播放量 Top100',description:'已收录并核实的歌曲中，按最新每周快照排名。'},
 {id:'niconico100',label:'niconico 播放量 Top100',description:'已收录并核实的歌曲中，按最新每周快照排名。'}
];
export const RANGE_OPTIONS=COLLECTION_OPTIONS;
export const MIN_YEAR=2007,MAX_YEAR=2026;
export const DIFFICULTY_OPTIONS=[{id:'easy',label:'简单',count:50},{id:'normal',label:'普通',count:200},{id:'hard',label:'困难',count:500},{id:'custom',label:'自定义',count:null}];
export const difficultyOf=input=>DIFFICULTY_OPTIONS.some(o=>o.id===input?.difficulty)?input.difficulty:'custom';
export function collectionOf(input={}){
 if(COLLECTION_OPTIONS.some(o=>o.id===input.collection))return input.collection;
 if(['billboard','weekly'].includes(input.chart))return input.chart;
 return(Array.isArray(input.ranges)?input.ranges:[]).find(id=>COLLECTION_OPTIONS.some(o=>o.id===id))||'all';
}
export function normalizeFilters(input={}){
 if(['easy','normal','hard'].includes(input.difficulty))return{difficulty:input.difficulty,chart:'all',ranges:['all'],from:MIN_YEAR,to:MAX_YEAR};
 const collection=collectionOf(input),chart=['billboard','weekly'].includes(collection)?collection:'all';
 const year=(v,fallback)=>v===''||v===null||v===undefined?fallback:Number.isInteger(Number(v))&&Number(v)>=MIN_YEAR&&Number(v)<=MAX_YEAR?Number(v):fallback;
 return{...(input.difficulty==='custom'?{difficulty:'custom'}:{}),chart,ranges:[chart==='all'?collection:'all'],from:year(input.from,MIN_YEAR),to:year(input.to,MAX_YEAR)};
}
export function filterKey(input){return JSON.stringify(normalizeFilters(input));}
export function visibleCharts(input){const f=normalizeFilters(input);return f.chart==='billboard'?['billboard']:f.chart==='weekly'?['weekly']:['billboard','weekly'];}
export function filterLibrary(songs,input){const f=normalizeFilters(input),collection=collectionOf(f);if(f.from>f.to)return[];return songs.filter(s=>{
 if(['easy','normal','hard'].includes(f.difficulty))return(s.difficulties||[]).includes(f.difficulty);
 if(s.year<f.from||s.year>f.to)return false;
 if(['billboard','weekly'].includes(collection)){const r=s.rankings?.[collection];return(r?.weeks||r?.knownWeeks||0)>0;}
 return collection==='all'||(s.collections||[]).includes(collection);
});}
export function filterDescription(input){const f=normalizeFilters(input),d=DIFFICULTY_OPTIONS.find(o=>o.id===f.difficulty);return d?.count?d.label+' · 综合知名度 '+d.count+' 首':COLLECTION_OPTIONS.find(o=>o.id===collectionOf(f)).label+' · '+f.from+'—'+f.to+' 年';}
