const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Only thumbnails bound to this song's verified original videos may be shown.
export function coverCandidates(song){
 return (song?.cover?.candidates||[]).filter(c=>{
  const video=song.videos?.[c.platform];
  if(!video||video.active===false||video.id!==c.videoId)return false;
  try{const u=new URL(c.url);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(c.platform==='niconico'?u.hostname==='nicovideo.cdn.nimg.jp'&&u.pathname.startsWith('/thumbnails/'+video.id.replace(/^(sm|nm|so)/,'')+'/'):c.platform==='youtube'?u.hostname==='i.ytimg.com'&&u.pathname.startsWith('/vi/'+video.id+'/'):false)}catch{return false}
 }).filter((c,i,all)=>all.findIndex(x=>x.url===c.url)===i);
}

export function coverMarkup(song,{variant='small',lazy=true}={}){
 const candidates=coverCandidates(song),first=candidates[0];
 return '<span class="song-cover '+(variant==='result'?'cover-result':variant==='selected'?'cover-selected':'cover-small')+(first?'':' cover-unavailable')+'" data-cover-id="'+escapeHtml(song.id)+'"><span class="cover-placeholder"'+(first?' aria-hidden="true"':' role="img" aria-label="暂无歌曲封面"')+'><span aria-hidden="true">♫</span><small>'+(first?'封面载入中':'暂无封面')+'</small></span>'+(first?'<img src="/api/cover?song='+escapeHtml(encodeURIComponent(song.id))+'&amp;candidate=0" alt="'+escapeHtml(song.title)+'的歌曲封面" title="'+(first.platform==='niconico'?'niconico':'YouTube')+' 官方投稿封面" width="320" height="180" loading="'+(lazy?'lazy':'eager')+'" decoding="async" referrerpolicy="no-referrer" data-cover-index="0">':'')+'</span>';
}

export function installCoverFallback(root,lookupSong){
 const onLoad=event=>{const image=event.target;if(image?.tagName==='IMG'&&image.closest('.song-cover'))image.closest('.song-cover').classList.add('cover-loaded')};
 const onError=event=>{
  const image=event.target;
  if(image?.tagName!=='IMG'||!image.closest('.song-cover'))return;
  const wrapper=image.closest('.song-cover'),candidates=coverCandidates(lookupSong(wrapper.dataset.coverId)),index=Number(image.dataset.coverIndex)+1,next=candidates[index];
  if(next){image.dataset.coverIndex=String(index);image.src='/api/cover?song='+encodeURIComponent(wrapper.dataset.coverId)+'&candidate='+index;image.title=(next.platform==='niconico'?'niconico':'YouTube')+' 官方投稿封面'}
  else{image.remove();wrapper.classList.add('cover-unavailable');const placeholder=wrapper.querySelector('.cover-placeholder');placeholder.removeAttribute('aria-hidden');placeholder.setAttribute('role','img');placeholder.setAttribute('aria-label','暂无歌曲封面');placeholder.querySelector('small').textContent='暂无封面'}
 };
 root.addEventListener('error',onError,true);
 root.addEventListener('load',onLoad,true);
 return ()=>{root.removeEventListener('error',onError,true);root.removeEventListener('load',onLoad,true)};
}
