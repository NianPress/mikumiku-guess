import{validateLibrary}from'./core.js';
import{COLLECTION_OPTIONS,DIFFICULTY_OPTIONS,difficultyOf,MIN_YEAR,MAX_YEAR,normalizeFilters,collectionOf,filterLibrary}from'./filters.js';
const $=s=>document.querySelector(s),esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let libraryPromise,library,busy=false,settingsLoading=false,feedbackBusy=false,submissionId=crypto.randomUUID();
let roomContext=null;
export function setRoomSettingsContext(filters,locked=false){roomContext=filters?{filters,locked}:null;if($('#settings-dialog')?.open)previewFilters();}
export function getLibrary(){return libraryPromise??=(fetch('/api/library').then(async r=>{if(!r.ok)throw Error('曲库暂时无法载入');return library=validateLibrary(await r.json());}).catch(error=>{libraryPromise=null;throw error;}));}
export function readFilters(){try{const saved=localStorage.getItem('chu-yiba:filters');return saved?normalizeFilters({...JSON.parse(saved),difficulty:JSON.parse(saved).difficulty||'custom'}):normalizeFilters({difficulty:'normal'});}catch{return normalizeFilters({difficulty:'normal'});}}
export function setSettingsBusy(value){busy=value;previewFilters();}
document.body.insertAdjacentHTML('beforeend',`
<dialog id="settings-dialog" aria-labelledby="settings-title">
 <div class="dialog-head"><h2 id="settings-title">设置</h2><button type="button" class="dialog-close" aria-label="关闭设置">×</button></div>
 <form id="library-filters">
  <p class="daily-settings-lock" ${document.body.dataset.mode==='daily'?'':'hidden'}>每日挑战固定使用传说曲曲库，所有玩家每天猜同一首歌。</p>
  <fieldset id="difficulty-section" class="settings-section" ${document.body.dataset.mode==='daily'?'hidden':''}><legend>难度</legend><div class="difficulty-grid">${DIFFICULTY_OPTIONS.map(o=>`<label class="collection-choice"><input type="radio" name="difficulty" value="${o.id}"><span><strong>${o.label}</strong><small>${o.count?o.count+' 首 · 经典＋近年':'自行选择曲库与年份'}</small></span></label>`).join('')}</div><p class="settings-note">三个难度逐级包含，综合参考两个平台播放量和主榜成绩，并保留经典曲与近年热歌的名额。</p></fieldset>
  <div id="custom-settings" ${document.body.dataset.mode==='daily'?'hidden':''}>
  <fieldset class="settings-section"><legend>曲库</legend><div class="collection-grid">${COLLECTION_OPTIONS.map(o=>`<label class="collection-choice"><input type="radio" name="collection" value="${o.id}" ${o.id==='all'?'checked':''}><span>${esc(o.label)}</span></label>`).join('')}</div><p id="filter-description" class="filter-description"></p></fieldset>
  <fieldset class="settings-section"><legend>歌曲年份</legend><div class="year-grid"><label class="filter-field year-field">起始年份<select id="year-from"><option value="">默认 ${MIN_YEAR} 年</option>${Array.from({length:MAX_YEAR-MIN_YEAR+1},(_,i)=>`<option value="${MIN_YEAR+i}">${MIN_YEAR+i} 年</option>`).join('')}</select></label><span class="year-divider" aria-hidden="true">—</span><label class="filter-field year-field">终止年份<select id="year-to"><option value="">默认 ${MAX_YEAR} 年</option>${Array.from({length:MAX_YEAR-MIN_YEAR+1},(_,i)=>`<option value="${MAX_YEAR-i}">${MAX_YEAR-i} 年</option>`).join('')}</select></label></div></fieldset>
  </div><fieldset class="settings-section"><legend>外观</legend><div class="theme-options">${[['system','跟随系统'],['light','浅色'],['dark','深色']].map(([id,label])=>`<label class="collection-choice"><input type="radio" name="theme" value="${id}"><span>${label}</span></label>`).join('')}</div></fieldset>
  <p class="settings-note">难度与自定义条件用于单人模式和新房间，每日挑战固定传说曲。设置保存在本机。播放量每周一 07:00（北京时间）统一更新，本局线索保持固定。</p>
  <p class="settings-note" id="settings-snapshot"></p><p id="filter-error" class="filter-error" role="status"></p>
  <div class="modal-actions"><button type="button" id="restore-settings" class="text-button">恢复默认</button><span id="filtered-count" class="pool-count" aria-live="polite">载入曲库…</span><button type="submit" id="apply-filters" class="primary-button" disabled>保存设置</button></div>
 </form>
</dialog>
<dialog id="feedback-dialog" aria-labelledby="feedback-title">
 <div class="dialog-head"><h2 id="feedback-title">意见反馈</h2><button type="button" class="dialog-close" aria-label="关闭意见反馈">×</button></div>
 <form id="feedback-form">
  <p class="feedback-intro">这次玩得怎么样？</p>
  <fieldset class="rating-field"><legend class="sr-only">游玩体验评分，1 到 5 分，必选</legend><div class="rating-options">${[1,2,3,4,5].map(n=>`<label class="rating-choice"><input type="radio" name="rating" value="${n}" required><span aria-hidden="true">★</span><small>${n} 分</small></label>`).join('')}</div><p id="rating-label" class="rating-label">请选择评分</p></fieldset>
  <label class="feedback-label" for="feedback-text">改动建议 <span>选填</span></label>
  <textarea id="feedback-text" maxlength="2000" rows="5" placeholder="遇到了什么问题，或希望增加什么功能？"></textarea><div class="comment-count"><span id="comment-count">0</span> / 2000</div>
  <label class="feedback-honeypot" aria-hidden="true">Website<input id="feedback-website" type="text" tabindex="-1" autocomplete="off"></label>
  <p class="settings-note">匿名提交，仅维护者可查看。请不要填写密码或密钥。</p>
  <p id="feedback-status" class="feedback-status" role="status" aria-live="polite"></p>
  <div class="modal-actions"><button type="button" class="secondary-button dialog-close-action">取消</button><button type="submit" id="feedback-submit" class="primary-button">提交反馈</button></div>
 </form>
</dialog>`);
export function draftFilters(){return normalizeFilters({difficulty:$('input[name="difficulty"]:checked')?.value,collection:$('input[name="collection"]:checked')?.value,from:$('#year-from').value,to:$('#year-to').value});}
function fillSettings(filters=roomContext?.filters||readFilters()){
 $(`input[name="difficulty"][value="${difficultyOf(filters)}"]`).checked=true;
 const collection=collectionOf(filters);$(`input[name="collection"][value="${collection}"]`).checked=true;
 $('#year-from').value=filters.from===MIN_YEAR?'':String(filters.from);$('#year-to').value=filters.to===MAX_YEAR?'':String(filters.to);
 $(`input[name="theme"][value="${window.ChuTheme.get()}"]`).checked=true;previewFilters();
}
function previewFilters(){
 const fixed=document.body.dataset.mode==='daily'||roomContext?.locked,custom=difficultyOf(draftFilters())==='custom';
 $('#difficulty-section').hidden=Boolean(fixed);$('#custom-settings').hidden=!custom||fixed;$('#custom-settings').querySelectorAll('input,select').forEach(el=>el.disabled=!custom||fixed);
 $('.daily-settings-lock').hidden=!fixed;$('.daily-settings-lock').textContent=document.body.dataset.mode==='daily'?'每日挑战固定使用传说曲曲库，所有玩家每天猜同一首歌。':'房间曲库由房主在等待页设置；对局开始后固定。此处可调整外观。';$('#apply-filters').textContent=fixed?'保存外观':'保存设置';
 const draft=document.body.dataset.mode==='daily'?normalizeFilters({collection:'legend'}):draftFilters(),option=COLLECTION_OPTIONS.find(o=>o.id===collectionOf(draft));$('#filter-description').textContent=option.description;
 const count=library?filterLibrary(library.songs,draft).length:null,reversed=draft.from>draft.to;
 $('#filtered-count').textContent=count===null?'载入曲库…':count+' 首';$('#filter-error').textContent=reversed?'起始年份不能晚于终止年份。':count===0?'这个组合没有歌曲，请放宽条件。':busy?'正在读取线索，请稍候再保存。':'';
 $('#apply-filters').disabled=busy||settingsLoading||!count||reversed;
}
async function openSettings(){
 fillSettings();$('#settings-dialog').showModal();settingsLoading=true;previewFilters();
 try{await getLibrary();const t=library.playbackUpdate?.updatedAt||library.collectionSources?.playbackRanking?.youtubeSnapshotAt;$('#settings-snapshot').textContent=t?'最近播放量更新：'+new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'';}
 catch{$('#filter-error').textContent='曲库暂时无法载入，请关闭后重试。外观仍可切换。';}
 finally{settingsLoading=false;if(library)previewFilters();}
}
$('#library-filters').addEventListener('change',e=>{if(e.target.name==='theme')window.ChuTheme.set(e.target.value);previewFilters();});
$('#library-filters').addEventListener('submit',e=>{e.preventDefault();if($('#apply-filters').disabled)return;if(document.body.dataset.mode==='daily'||roomContext?.locked){$('#settings-dialog').close();return;}const filters=draftFilters();try{localStorage.setItem('chu-yiba:filters',JSON.stringify(filters));}catch{$('#filter-error').textContent='浏览器未允许保存设置，本次仍可使用。';}window.dispatchEvent(new CustomEvent('chu-settings-change',{detail:filters}));$('#settings-dialog').close();});
$('#restore-settings').addEventListener('click',()=>{if(busy)return;window.ChuTheme.set('system');fillSettings(normalizeFilters({difficulty:'normal'}));});
document.addEventListener('click',e=>{if(e.target.closest('[data-open-settings]'))void openSettings();if(e.target.closest('[data-open-feedback]')){$('#feedback-dialog').showModal();}});
document.querySelectorAll('dialog').forEach(d=>{d.querySelectorAll('.dialog-close,.dialog-close-action').forEach(b=>b.addEventListener('click',()=>d.close()));d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();});});
function feedbackEdited(){if(feedbackBusy)return;submissionId=crypto.randomUUID();$('#feedback-status').textContent='';const rating=Number($('input[name="rating"]:checked')?.value||0);$('#rating-label').textContent=['请选择评分','需要改进','不太满意','还不错','很喜欢','非常喜欢'][rating];document.querySelectorAll('.rating-choice').forEach((el,i)=>el.classList.toggle('filled',i<rating));$('#comment-count').textContent=$('#feedback-text').value.length;}
$('#feedback-form').addEventListener('input',feedbackEdited);
$('#feedback-form').addEventListener('submit',async e=>{
 e.preventDefault();if(feedbackBusy)return;const rating=Number($('input[name="rating"]:checked')?.value);if(!Number.isInteger(rating)||rating<1||rating>5)return;
 feedbackBusy=true;const controls=[...$('#feedback-form').elements];controls.forEach(el=>el.disabled=true);$('#feedback-submit').textContent='提交中…';$('#feedback-status').textContent='';
 try{
  const ticketResponse=await fetch('/api/feedback-ticket',{signal:AbortSignal.timeout(10000)}),ticket=await ticketResponse.json();if(!ticketResponse.ok)throw Error(ticket.error||'暂时无法提交，请稍后重试。');
  const response=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json','X-Feedback-Submission':'1','X-Feedback-Ticket':ticket.ticket},body:JSON.stringify({id:submissionId,rating,message:$('#feedback-text').value.trim(),page:['/daily','/single','/multi'].includes(location.pathname)?location.pathname:'/',website:$('#feedback-website').value}),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw Error(data.error||'提交失败，请稍后重试。');
  $('#feedback-form').reset();submissionId=crypto.randomUUID();$('#feedback-status').textContent='已收到，感谢你的反馈！';$('#feedback-status').classList.add('success');$('#comment-count').textContent='0';$('#rating-label').textContent='请选择评分';document.querySelectorAll('.rating-choice').forEach(el=>el.classList.remove('filled'));
 }catch(error){$('#feedback-status').classList.remove('success');$('#feedback-status').textContent=(error.name==='TimeoutError'?'网络超时，请重试。':error.message)+' 内容已保留。';}
 finally{feedbackBusy=false;controls.forEach(el=>el.disabled=false);$('#feedback-submit').textContent='提交反馈';}
});
fillSettings();
