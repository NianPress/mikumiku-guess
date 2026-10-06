const segmenter=new Intl.Segmenter('ja',{granularity:'grapheme'});
const whitespace=text=>/^\s+$/u.test(text);
export function titleCharacters(title){return [...segmenter.segment(title)].map(s=>s.segment);}
function characterKind(character){
 const c=character.normalize('NFKC');
 if(whitespace(c))return {kind:'space',priority:5,mask:character};
 if(/\p{Script=Han}/u.test(c))return {kind:'japanese',priority:0,mask:'〇'};
 if(/[\p{Script=Hiragana}\p{Script=Katakana}ー々〆]/u.test(c))return {kind:'japanese',priority:1,mask:'〇'};
 if(/[\p{Script=Latin}\p{Nd}]/u.test(c))return {kind:'alphanumeric',priority:/\p{Lu}/u.test(c)?2:3,mask:'_'};
 return {kind:'symbol',priority:4,mask:'◇'};
}
function positionHash(seed,index){let h=2166136261;for(const c of seed+'|'+index){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
// Only visible masks and unlocked characters leave this function; no hidden letters in tokens.
export function titleHint(title,attempts=0,seed='',ended=false){
 const characters=titleCharacters(title),kinds=characters.map(characterKind),count=kinds.filter(k=>k.kind!=='space').length;
 const revealLimit=ended?count:attempts>=6?4:attempts>=3?1:0;
 const positions=characters.map((_,i)=>i).filter(i=>kinds[i].kind!=='space').sort((a,b)=>kinds[a].priority-kinds[b].priority||positionHash(seed,a)-positionHash(seed,b)||a-b);
 const revealed=new Set(positions.slice(0,revealLimit));
 const tokens=characters.map((c,i)=>({text:revealed.has(i)?c:kinds[i].mask,kind:kinds[i].kind,revealed:revealed.has(i)}));
 return {characterCount:count,maskedTitle:tokens.map(t=>t.text).join(''),tokens,revealedCount:revealed.size,producerUnlocked:ended||attempts>=9};
}
