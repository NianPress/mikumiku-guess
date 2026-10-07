const celebrated=new Set();
export function celebrate(key,text='猜中了！'){
 if(celebrated.has(key))return;celebrated.add(key);
 const banner=document.createElement('div');banner.className='win-celebration';banner.setAttribute('role','status');
 const copy=document.createElement('strong');copy.textContent='♪ '+text;banner.append(copy);document.body.append(banner);
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
  const burst=document.createElement('div');burst.className='confetti-burst';burst.setAttribute('aria-hidden','true');
  for(let i=0;i<24;i++){const piece=document.createElement('i');piece.style.setProperty('--x',(i/23*90+5)+'vw');piece.style.setProperty('--delay',(i%6*35)+'ms');piece.style.setProperty('--spin',(i%2?1:-1)*(180+i*31)+'deg');piece.style.setProperty('--confetti-color',['var(--teal)','var(--gold)','#9caaf7'][i%3]);burst.append(piece);}
  document.body.append(burst);setTimeout(()=>burst.remove(),1800);
 }
 setTimeout(()=>banner.remove(),4000);
}
