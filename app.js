const $ = selector => document.querySelector(selector);

// Captions go into markup so escape them before building the card
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}

// Keep the paths here so every heart uses the same shape
const ICONS = {home:'<path d="M3 11 12 3l9 8v10h-6v-7H9v7H3z"/>',search:'<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',inbox:'<path d="M3 3h18v15h-6l-3 4-3-4H3z"/><path d="M8 10h8"/>',person:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',heart:'<path d="M13 23.2C10.6 21.7 2 15.7 2 9.1 2 5.2 4.4 2.8 7.7 2.8c2.2 0 4.1 1.1 5.3 3 1.2-1.9 3.1-3 5.3-3C21.6 2.8 24 5.2 24 9.1c0 6.6-8.6 12.6-11 14.1Z"/>',comment:'<path fill-rule="evenodd" d="M13 2.6c-6.2 0-11 4.1-11 9.2S6.8 21 13 21h1.2v3c6.1-2.9 9.8-6.8 9.8-12.2 0-5.1-4.8-9.2-11-9.2ZM7.5 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm5.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm5.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>',share:'<path d="m14 2 10 9-10 8v-5C7 14 3 16 1 21c0-10 5-15 13-15z"/>'};
const icon = name => `<svg viewBox="0 0 26 26" aria-hidden="true">${ICONS[name]}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));

// Start with guest state then replace it when account loading finishes
let state={likes:[],following:[],scores:{},seen:[]};
try {state=Accounts.clean(JSON.parse(localStorage.getItem('tiktok2020')||'{}'));} catch {}

// Guest history stays on this device while account preferences go to the server
function save(){if(Accounts.signedIn){Accounts.persist(state);return;}try{localStorage.setItem('tiktok2020',JSON.stringify(state));}catch{toast('Browser storage unavailable. This session still works.');}}
function toast(text){$('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').style.display='none',3000);}
let mode='foryou',current=null,startedAt=0,activeSeconds=0,playing=false,serial=0,audioEnabled=false;
const failedVideos=new Set();

// Forget old embed failures since they do not prove a direct stream is unavailable
try{localStorage.removeItem('tiktok2020-unavailable');}catch{}
const feed=$('#feed'),sheet=$('#sheet');
function send(card,type,value){
if(!card)return;
const video=card.querySelector('video');

// Cancel the old play request too so a late promise cannot undo this pause
if(type==='pause'){card.playRequest++;clearTimeout(card.bufferTimer);delete card.dataset.buffering;video.pause();}
if(type==='mute'||type==='unMute')video.muted=type==='mute';
if(type==='seekTo')video.currentTime=value;
if(type==='play'){

 // A play request can fail after the user has already scrolled away
 // Ignore that result if a newer request has replaced it
 const request=++card.playRequest;
 video.play().catch(error=>{
  if(request!==card.playRequest||!playbackAllowed(card)||error.name==='AbortError')return;

  // The browser wants a tap here so show play rather than blaming the video
  if(error.name==='NotAllowedError'){clearTimeout(card.loadTimer);clearTimeout(card.errorTimer);clearTimeout(card.bufferTimer);delete card.dataset.buffering;delete card.dataset.recovering;card.dataset.userPaused='true';delete card.dataset.loading;handlePlaybackState(2);}
  else handlePlayerError(card,{errorCode:3001});
 });
}
}

// Pausing alone keeps the media connection alive
// Remove the source as well when a card leaves the small playback window
function releasePlayer(card){
card.playRequest++;clearTimeout(card.loadTimer);clearTimeout(card.errorTimer);clearTimeout(card.bufferTimer);delete card.dataset.buffering;
const video=card.querySelector('video');video.pause();video.removeAttribute('src');video.load();
}

// Only the current card can change playback state or show an error
function bindPlayer(card){
card.playRequest=0;
const video=card.querySelector('video');
for(const [event,state] of [['playing',1],['pause',2],['waiting',3],['ended',0]])video.addEventListener(event,()=>{
 if(card===current){
  if(state===3&&playbackAllowed(card)){

   // Wait a moment before showing loading so a tiny stall doesn't flash the indicator
   clearTimeout(card.bufferTimer);card.bufferTimer=setTimeout(()=>{if(playbackAllowed(card))card.dataset.buffering='true';},400);
   clearTimeout(card.loadTimer);// Give startup a deadline so a black frame can't sit there forever
card.loadTimer=setTimeout(()=>{if(playbackAllowed(card))handlePlayerError(card,{errorCode:0});},20000);
  }
  if(state===1||state===2){clearTimeout(card.bufferTimer);delete card.dataset.buffering;}
  handlePlaybackState(state);
 }

 // A neighbour can finish loading late but it still isn't allowed to play
 else if(state===1)video.pause();
});
video.addEventListener('error',()=>{if(video.hasAttribute('src')&&card===current)handlePlayerError(card,{errorCode:3001});});
}

// Bound each interest score so a long session doesn't make 1 topic dominate forever
function learn(weight){if(!current)return;const p=POSTS.find(p=>p.id===current.dataset.id);p.tags.forEach(tag=>state.scores[tag]=Math.max(-20,Math.min(100,(Number(state.scores[tag])||0)+weight)));save();}

// Count actual playing time rather than time spent paused or buffering
function finishWatch(){if(current){const seconds=activeSeconds+(playing?(performance.now()-startedAt)/1000:0);if(seconds>1)learn(Math.min(seconds,25)/10);if(!state.seen.includes(current.dataset.id)){state.seen.push(current.dataset.id);save();}}playing=false;activeSeconds=0;}
function choose(){

// Don't pick a video that's already waiting in the scroll queue
const queued=new Set([...feed.children].map(card=>card.dataset.id));
const pool=POSTS.filter(p=>(mode!=='following'||state.following.includes(p.creator))&&!failedVideos.has(p.id)&&!queued.has(p.id));

// Nothing valid left means stop adding cards instead of cycling through failures
if(!pool.length)return null;
const seen=new Set(state.seen),unseen=pool.filter(p=>!seen.has(p.id));

// Exhaust unseen videos before allowing repeats
const candidates=unseen.length?unseen:pool;

// Give the familiar trends a strong chance without making every pick identical
const curated=candidates.filter(p=>p.featured);
const fresh=curated.length&&Math.random()<.9?curated:candidates;

// Keep some exploration even after the feed has learned a preference
if(Math.random()<.2)return fresh[Math.floor(Math.random()*fresh.length)];
return fresh.map(p=>({p,rank:Math.random()*3+(p.featured?3:0)+Math.max(-1,Math.min(2,p.tags.reduce((n,t)=>n+(Number(state.scores[t])||0),0)/Math.max(p.tags.length,1)*.03))})).sort((a,b)=>b.rank-a.rank)[0].p;
}
function likePost(p,force=false){
if(!Accounts.signedIn){Panels.signup();return false;}

// Double taps only add a like while the heart button can remove one
const liked=state.likes.includes(p.id);if(force&&liked)return true;
state.likes=liked&&!force?state.likes.filter(id=>id!==p.id):[...state.likes,p.id];learn(liked?-3:3);save();refreshButtons();return true;
}
function videoMenu(p){
openSheet('Video','<button class="list-button" id="not-interested">Not interested</button><button class="list-button" id="video-share">Share</button>');
$('#not-interested').onclick=()=>{learn(-4);sheet.close();setTimeout(()=>stepFeed(1),0);};$('#video-share').onclick=()=>Panels.share(p);
}
function bindInteractions(card,p){
const tap=card.querySelector('.tap-area');let clickTimer,holdTimer,down,ignoreUntil=0;
function heart(){if(likePost(p,true)){card.classList.remove('heart-burst');void card.offsetWidth;card.classList.add('heart-burst');}}

// Delay a single pointer click so a double tap can like without also pausing
// Keyboard activation can toggle immediately
tap.onclick=event=>{if(performance.now()<ignoreUntil)return;if(event.detail>1){clearTimeout(clickTimer);heart();}else if(event.detail===0)togglePlayback(card);else{clearTimeout(clickTimer);clickTimer=setTimeout(()=>togglePlayback(card),220);}};

// Only the main touch can start a hold so extra fingers don't open the menu
tap.onpointerdown=event=>{if(event.button!==0||event.isPrimary===false)return;down={x:event.clientX,y:event.clientY};holdTimer=event.pointerType==='mouse'?undefined:setTimeout(()=>{if(card!==current||sheet.open)return;ignoreUntil=performance.now()+500;down=null;videoMenu(p);},500);};

// Movement cancels the hold so a normal swipe doesn't open the menu
tap.onpointermove=event=>{if(down&&(Math.abs(event.clientX-down.x)>10||Math.abs(event.clientY-down.y)>10))clearTimeout(holdTimer);};

// A left swipe opens the creator and ignores the click that follows it
tap.onpointerup=event=>{if(event.isPrimary===false)return;clearTimeout(holdTimer);if(down&&event.clientX-down.x < -65&&Math.abs(event.clientY-down.y)<45){clearTimeout(clickTimer);ignoreUntil=performance.now()+500;showCreator(p);}down=null;};

// Cancel the hold timer too or a menu could open after the gesture is gone
tap.onpointercancel=()=>{clearTimeout(holdTimer);down=null;};
tap.oncontextmenu=event=>{event.preventDefault();ignoreUntil=performance.now()+500;videoMenu(p);};
}
function addPost(p){if(!p||failedVideos.has(p.id))return;const card=document.createElement('article');card.className='video';card.dataset.id=p.id;card.dataset.serial=++serial;card.dataset.loading='true';
card.innerHTML=`<button class="enable-sound" aria-label="Unmute video" aria-pressed="false"><svg viewBox="0 0 26 26" aria-hidden="true"><path d="M3 10h4l6-5v16l-6-5H3z"/><path class="sound-on" d="M17 9a5 5 0 0 1 0 8M20 6a9 9 0 0 1 0 14" style="display:none"/><path class="sound-off" d="m18 10 5 6m0-6-5 6"/></svg></button><video class="player" playsinline muted loop preload="none" aria-hidden="true" tabindex="-1"></video><span class="player-loading" role="status" aria-label="Loading video"></span><button class="tap-area" aria-label="Play or pause video"><span class="pause-shield" hidden></span><span class="start" hidden></span></button><span class="heart-pop" aria-hidden="true">${icon('heart')}</span><div class="caption"><h2><button class="post-details" aria-label="Video details for ${escapeHTML(p.creator)}">@${escapeHTML(p.creator)}</button><time class="post-date" datetime="${p.date}" title="Date decoded from the original video ID, UTC">${p.date.replace(/-0/g,"-")}</time></h2><p>${escapeHTML(p.caption)}</p><button class="sound" aria-label="View sound">${escapeHTML(p.sound)}</button></div><div class="actions"><div class="creator-control"><button class="profile avatar" aria-label="View ${escapeHTML(p.creator)} profile">${escapeHTML(p.initial)}</button><button class="follow follow-marker" aria-label="Follow ${escapeHTML(p.creator)}">+</button></div><button class="action like" aria-label="Like video" aria-pressed="false">${icon('heart')}<span>Like</span></button><button class="action comments" aria-label="Read historical comments">${icon('comment')}<span>Comments</span></button><button class="action share" aria-label="Share original video">${icon('share')}<span>Share</span></button><button class="action audio" aria-label="View sound"><span class="record">♫</span></button></div>`;
bindPlayer(card);
card.querySelector('.enable-sound').onclick=toggleSound;
card.querySelector('.avatar').classList.add('avatar-'+POSTS.indexOf(p));
card.querySelector('.post-details').onclick=()=>Panels.details(p);
card.querySelector('.sound').onclick=()=>Panels.sound(p);
card.querySelector('.profile').onclick=()=>showCreator(p);
bindInteractions(card,p);
card.querySelector('.like').onclick=()=>likePost(p);
card.querySelector('.follow').onclick=()=>{if(!Accounts.signedIn){Panels.signup();return;}const followed=state.following.includes(p.creator);state.following=followed?state.following.filter(id=>id!==p.creator):[...state.following,p.creator];save();refreshButtons();};
card.querySelector('.comments').onclick=()=>showComments(p);
if(COMMENT_COUNTS[p.id])card.querySelector('.comments span').textContent=COMMENT_COUNTS[p.id].toLocaleString();
card.querySelector('.share').onclick=()=>Panels.share(p);
card.querySelector('.audio').onclick=()=>Panels.sound(p);

// New cards aren't interactive until the observer makes them current
card.inert=true;feed.append(card);observer.observe(card);refreshButtons();}
function refreshButtons(){refreshSoundButtons();feed.querySelectorAll('.video').forEach(card=>{const p=POSTS.find(p=>p.id===card.dataset.id),liked=state.likes.includes(p.id),followed=state.following.includes(p.creator);card.querySelector('.like').classList.toggle('liked',liked);card.querySelector('.like').setAttribute('aria-pressed',String(liked));card.querySelector('.like span').textContent=liked?'Liked':'Like';card.querySelector('.follow-marker').hidden=followed;card.querySelector('.follow').setAttribute('aria-label',(followed?'Unfollow ':'Follow ')+p.creator);});}
function showCreator(p,back){Panels.creator(p,back);}

// Comments and sharing can keep playing but full pages and hidden tabs cannot
function playbackAllowed(card){return card===current&&!document.hidden&&(!sheet.open||sheet.dataset.keepPlaying==='true')&&card.dataset.userPaused!=='true'&&!card.dataset.retry;}
function resumePlayback(){if(current&&playbackAllowed(current)&&!playing)loadPlayer(current);}
function togglePlayback(card){
if(card!==current)return;

// Clear retry state before asking for another stream request
if(card.dataset.retry){delete card.dataset.retry;delete card.dataset.recovering;delete card.dataset.userPaused;clearTimeout(card.errorTimer);card.querySelector('.tap-area').setAttribute('aria-label','Play or pause video');card.querySelector('.start').hidden=true;releasePlayer(card);loadPlayer(card);return;}
if(card.dataset.userPaused==='true'){delete card.dataset.userPaused;loadPlayer(card);}
else{card.dataset.userPaused='true';clearTimeout(card.loadTimer);clearTimeout(card.errorTimer);delete card.dataset.recovering;send(card,'pause');handlePlaybackState(2);}
}
function loadPlayer(card){
if(!playbackAllowed(card))return;
clearTimeout(card.loadTimer);
card.loadTimer=setTimeout(()=>{if(feed.contains(card)&&card===current)handlePlayerError(card,{errorCode:0});},20000);
const video=card.querySelector('video');
if(!video.hasAttribute('src')||video.error){
 card.dataset.loading='true';

 // Shortcut: the stream resolver can fail independently of the video, revisit hosting if it becomes unreliable
 if(!/^\d{19}$/.test(card.dataset.id)){showPlayerError(card,3001);return;}
 video.src=`https://offload.tnktok.com/generate/video/${card.dataset.id}`;
}

// Apply the saved sound choice before starting this card
send(card,audioEnabled?'unMute':'mute');send(card,'play');
}

// Buffer 1 video ahead only after the current video starts playing
// This helps the next swipe without loading the entire collection
function prepareNext(card){
if(card===feed.lastElementChild)addPost(choose());
const next=card.nextElementSibling;
if(!next||card!==current||!playing||document.hidden||!playbackAllowed(card))return;
const video=next.querySelector('video');
if(!video.hasAttribute('src')&&/^\d{19}$/.test(next.dataset.id)){
 video.preload='auto';video.muted=true;video.src=`https://offload.tnktok.com/generate/video/${next.dataset.id}`;video.load();
}
}
function activate(card){
if(!feed.contains(card)||current===card)return;

// Finish the old watch before switching current or the wrong video gets the score
finishWatch();send(current,'pause');current=card;delete card.dataset.userPaused;
const cards=[...feed.children],index=cards.indexOf(card);

// Keep nearby sources ready but release everything more than 1 card away
cards.forEach((item,i)=>{item.inert=item!==card;if(Math.abs(i-index)>1){releasePlayer(item);}});
loadPlayer(card);
prepareNext(card);
trimFeed();
}

// Wait until most of a card is visible before treating it as the active video
const observer=new IntersectionObserver(entries=>{entries.forEach(entry=>{if(entry.isIntersecting&&entry.intersectionRatio>=.7)activate(entry.target);});},{root:feed,threshold:.7});

// Only confirmed unavailable videos belong here
// A slow request or server error should still be retryable
function removeUnavailable(card){
const id=card.dataset.id,wasCurrent=card===current,index=[...feed.children].indexOf(card);

// Remember the active position before removing anything above it
const top=current?.getBoundingClientRect().top;
if(wasCurrent){finishWatch();send(current,'pause');current=null;}
failedVideos.add(id);console.info('Removed unavailable video:',id);
try{localStorage.setItem('tiktok2020-unavailable',JSON.stringify([...failedVideos]));}catch{}
const postIndex=POSTS.findIndex(p=>p.id===id);if(postIndex>=0)POSTS.splice(postIndex,1);
[...feed.children].filter(item=>item.dataset.id===id).forEach(item=>{clearTimeout(item.loadTimer);clearTimeout(item.errorTimer);observer.unobserve(item);releasePlayer(item);item.remove();});
if(wasCurrent){
 if(!feed.children.length||index>=feed.children.length)addPost(choose());
 const next=feed.children[Math.min(index,feed.children.length-1)];
 if(next){feed.scrollTop+=next.getBoundingClientRect().top-feed.getBoundingClientRect().top;activate(next);}
 else{$('#empty').hidden=false;$('#empty h2').textContent='No videos available';$('#empty p').textContent='Try another feed.';}
}else if(current){feed.scrollTop+=current.getBoundingClientRect().top-top;prepareNext(current);}
}
function showPlayerError(card,code){
if(!feed.contains(card))return;
if(card===current){finishWatch();send(card,'pause');}

// Show 1 retry state instead of piling loading and error states together
delete card.dataset.loading;delete card.dataset.recovering;delete card.dataset.buffering;card.dataset.retry='true';
const title=code===2001?'Server error':code===3001?'Playback error':'Video timed out';
const start=card.querySelector('.start');start.hidden=false;start.innerHTML='<span class="player-error"><strong>'+title+'</strong><span class="retry-label">Retry</span></span>';
card.querySelector('.tap-area').setAttribute('aria-label','Retry video');
}
function handlePlayerError(card,value){
clearTimeout(card.loadTimer);

// Only a confirmed unavailable result should remove a video
if(value?.errorCode===1001){removeUnavailable(card);return;}
if(value?.errorCode===3002&&card===current){card.dataset.userPaused='true';delete card.dataset.loading;handlePlaybackState(2);return;}
if([0,2001,3001].includes(value?.errorCode)){
 card.dataset.recovering='true';clearTimeout(card.errorTimer);

 // Give short failures a chance to recover before showing an error over the video
 card.errorTimer=setTimeout(()=>showPlayerError(card,value.errorCode),1500);
}
}

// Drop old cards to keep memory bounded then compensate for the removed height
// The active video should stay in the same place on screen
function trimFeed(){
if(feed.children.length<=9)return;
const cards=[...feed.children],removeCount=cards.indexOf(current)-3;
if(removeCount<=0)return;
const top=current.getBoundingClientRect().top;
cards.slice(0,removeCount).forEach(card=>{clearTimeout(card.loadTimer);clearTimeout(card.errorTimer);observer.unobserve(card);releasePlayer(card);card.remove();});
feed.scrollTop+=current.getBoundingClientRect().top-top;
}
function handlePlaybackState(value){
if(!current||![-1,0,1,2,3].includes(value))return;
const next=value===1;
if(next&&!playbackAllowed(current)){send(current,'pause');return;}
if(current.dataset?.retry){if(value===1)send(current,'pause');return;}
if(value===1){clearTimeout(current.loadTimer);clearTimeout(current.errorTimer);delete current.dataset.recovering;}
if(next&&current.dataset){delete current.dataset.loading;delete current.dataset.retry;current.querySelector('.tap-area').setAttribute('aria-label','Play or pause video');}

// Stop the clock during pause and buffering rather than counting wall time
if(playing&&!next)activeSeconds+=(performance.now()-startedAt)/1000;
if(!playing&&next)startedAt=performance.now();
playing=next;
if(next)prepareNext(current);
const start=current.querySelector('.start');
start.hidden=current.dataset.userPaused!=='true';
start.innerHTML=start.hidden?'':'<svg viewBox="0 0 50 58" aria-hidden="true"><path d="M9 5 43 29 9 53Z"/></svg>';
current.querySelector('.record').classList.toggle('playing',next);

// Loop the same video unless the user paused it or left the feed
if(value===0&&playbackAllowed(current)){send(current,'seekTo',0);send(current,'play');}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(current?.loadTimer);send(current,'pause');finishWatch();}else resumePlayback();});
function setMode(next){finishWatch();send(current,'pause');current=null;observer.disconnect();mode=next;[...feed.children].forEach(releasePlayer);feed.replaceChildren();$('#following').classList.toggle('active',mode==='following');$('#foryou').classList.toggle('active',mode==='foryou');const p=choose();$('#empty').hidden=!!p;if(!p){$('#empty h2').textContent=mode==='following'?'No videos from followed creators':'No videos available';$('#empty p').textContent=mode==='following'?'Find a creator in Discover and follow them to see their videos here.':'Try again later.';}addPost(p);feed.scrollTop=0;}
function openSheet(title,html,keepPlaying=false){if(sheet.dataset.page==='true'&&sheet.open)sheet.close();sheet.dataset.page='false';sheet.dataset.keepPlaying=String(keepPlaying);if(!keepPlaying){clearTimeout(current?.loadTimer);send(current,'pause');if(current)handlePlaybackState(2);}sheet.classList.remove('signup-sheet','page-sheet','comments-sheet','discover-page','searching','auth-page','signup-page');while($('#close').nextElementSibling)$('#close').nextElementSibling.remove();$('#close').innerHTML='×';$('#close').ariaLabel='Close';$('#close').onclick=()=>sheet.close();$('#sheet-title').textContent=title;$('#sheet-body').className='';$('#sheet-body').innerHTML=html;if(!sheet.open)sheet.showModal();}
$('#close').onclick=()=>sheet.close();sheet.addEventListener('close',()=>{if(!sheet.open)document.querySelector('.phone').inert=false;resumePlayback();});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&sheet.open&&sheet.dataset.page==='true'){event.preventDefault();$('#close').onclick();}});sheet.addEventListener('click',event=>{if(event.target===sheet)sheet.close();});

// Each comments opening gets an ID so late responses cannot fill a different panel
let commentRequest=0;

// Treat archive JSON as input that still needs checking before rendering
function parseCommentPage(value){
if(!value||!Array.isArray(value.comments)||value.comments.length>50||typeof value.hasMore!=='boolean')throw new Error('Invalid comment page');
for(const comment of value.comments){
if(!comment||typeof comment.name!=='string'||comment.name.length>100||typeof comment.text!=='string'||comment.text.length>5000||typeof comment.createdAt!=='string'||!Number.isFinite(Date.parse(comment.createdAt)))throw new Error('Invalid comment');
}
return {comments:value.comments.filter(comment=>beforeCutoff(comment)&&comment.createdAt.startsWith('2020-')),hasMore:value.hasMore};
}
function showComments(p){

// Opening another panel makes every older comments request stale
const request=++commentRequest;
openSheet(COMMENT_COUNTS[p.id]?COMMENT_COUNTS[p.id]+' comments':'Comments','',true);
sheet.classList.add('comments-sheet');

// No archived rows means don't fetch a file that isn't there
if(!COMMENT_COUNTS[p.id]){$('#sheet-body').innerHTML='<div class="empty-comments"><h3>No comments available</h3><p>No eligible comments were returned.</p></div>';return;}
const status=document.createElement('p'),list=document.createElement('div'),retry=document.createElement('button'),sentinel=document.createElement('div');
status.className='panel-note';status.setAttribute('role','status');retry.className='text-button';retry.textContent='Try again';retry.hidden=true;
sentinel.className='comment-sentinel';sentinel.hidden=true;
$('#sheet-body').append(status,list,retry,sentinel);
const composer=document.createElement('div');composer.className='comment-composer';const input=document.createElement('input');input.placeholder='Comments are read-only';input.disabled=true;input.setAttribute('aria-label','Archived comments are read-only');composer.append(input);$('#sheet-body').append(composer);
let page=0,loading=false,hasMore=true;

// The request still belongs here only while this exact panel remains open
const active=()=>sheet.open&&request===commentRequest&&status.isConnected;

// Start the next page just before the reader reaches the bottom
const paging=new IntersectionObserver(entries=>{
 if(!active()){paging.disconnect();return;}
 if(entries.some(entry=>entry.isIntersecting)&&!loading&&hasMore)load();
},{root:sheet,rootMargin:'0px 0px 160px 0px'});
paging.observe(sentinel);sheet.addEventListener('close',()=>paging.disconnect(),{once:true});
async function load(){

// The observer might fire again before the current request finishes
if(loading||!hasMore||!active())return;
loading=true;retry.hidden=true;sentinel.hidden=true;status.textContent='Loading comments…';
try{
const response=await fetch('comments/'+p.id+'-'+page+'.json');
if(!response.ok)throw new Error('Comments unavailable');
const result=parseCommentPage(await response.json());
if(!active())return;

// Advance only after a successful response so retry asks for the same failed page
result.comments.forEach(comment=>appendComment(comment,list));page++;hasMore=result.hasMore;

// The last local page still doesn't mean we recovered every original comment
status.textContent='Partial archive';sentinel.hidden=!hasMore;
if(!hasMore)paging.disconnect();
}catch{if(active()){status.textContent='Could not load comments.';retry.hidden=false;}}
finally{loading=false;}
}

// Retry keeps the failed page number while the first call starts page 0 immediately
retry.onclick=load;load();
}

// Use text nodes for archived names and comments so markup stays literal
