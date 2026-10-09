const dialog=document.querySelector('#updates-dialog'),open=document.querySelector('[data-open-updates]'),list=document.querySelector('#updates-list');
let loaded=false,loading=false;
async function load(){
 if(loaded||loading)return;loading=true;list.textContent='正在读取更新公告…';
 try{
  const response=await fetch('/updates.json',{cache:'no-cache',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Updates unavailable');const notes=await response.json();
  if(!Array.isArray(notes)||!notes.length||notes.some(n=>typeof n.version!=='string'||typeof n.title!=='string'||typeof n.date!=='string'||!Array.isArray(n.changes)||n.changes.some(c=>typeof c!=='string')))throw Error('Invalid updates');
  const fragment=document.createDocumentFragment();
  for(const note of notes){const article=document.createElement('article');article.className='update-entry';const meta=document.createElement('p');meta.className='update-meta';meta.textContent='v'+note.version+' · '+note.date;const title=document.createElement('h3');title.textContent=note.title;const changes=document.createElement('ul');for(const text of note.changes){const li=document.createElement('li');li.textContent=text;changes.append(li);}article.append(meta,title,changes);fragment.append(article);}
  list.replaceChildren(fragment);loaded=true;
 }catch{list.textContent='公告暂时无法读取，请稍后重试。';const retry=document.createElement('button');retry.type='button';retry.className='text-button';retry.textContent='重新读取';retry.addEventListener('click',load);list.append(retry);}
 finally{loading=false;}
}
open.addEventListener('click',()=>{dialog.showModal();void load();});
dialog.querySelector('.dialog-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{const box=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))dialog.close();});
dialog.addEventListener('close',()=>open.focus());
