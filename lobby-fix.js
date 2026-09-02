(()=>{
'use strict';
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function avatar(a){const x=a||'🐔';return String(x).startsWith('data:')?`<img src="${x}" style="width:42px;height:42px;border-radius:50%;object-fit:cover">`:esc(x)}
function drawLobby(list){
 const area=document.getElementById('lobbyPlayersArea'); if(!area||!Array.isArray(list))return;
 const me=window.myId;
 const others=list.filter(p=>p&&p.id&&p.id!==me);
 const count=document.getElementById('onlineCount');if(count)count.textContent=list.length;
 const empty=document.getElementById('lobbyEmptyMsg');if(empty)empty.style.display=others.length?'none':'block';
 area.innerHTML=others.map(p=>{
   const status={ready:'🟢 آماده بازی',requesting:'📨 در حال درخواست...',requested:'📩 آماده دریافت درخواست',playing:'🎮 در حال بازی',room:'🏠 داخل اتاق',watching:'👀 در حال تماشا'}[p.status]||'🟢 آنلاین';
   return `<div class="player" style="position:relative">
     <div class="player-name player-clickable" data-view-profile="${esc(p.id)}"><span>${avatar(p.avatar)} ${esc(p.name)}</span></div>
     <div style="font-size:.85rem;color:#7b3f00;margin-bottom:6px">${status}</div>
     <button class="action-btn morg-any-request" data-request-id="${esc(p.id)}" style="margin-top:8px;width:100%;background:#27ae60;color:#fff;box-shadow:0 4px 0 #1a6b3b">🎮 درخواست بازی</button>
   </div>`;
 }).join('');
}
function hook(){
 const s=window.__MORG_SOCKET__||window.socket;
 if(s&&!s.__morgLobbyFix){
   s.__morgLobbyFix=true;
   s.on('playerListUpdate',drawLobby);
   s.on('gameRequestError',d=>{if(d)alert(String(d))});
   s.on('gameRequestSent',d=>{if(d)typeof window.showBigMessage==='function'&&d.targetName)window.showBigMessage(`📨 درخواست برای ${d.targetName} ارسال شد`,false)});
 }
 const old=window.renderLobby;
 if(old&&!old.__morgFixed){
   const f=function(list){drawLobby(list);};f.__morgFixed=true;window.renderLobby=f;
 }
}
setInterval(hook,300);
hook();
document.addEventListener('click',e=>{
 const b=e.target.closest('.morg-any-request,[data-request-id]');
 if(!b)return;
 const id=b.dataset.requestId;if(!id)return;
 const s=window.__MORG_SOCKET__||window.socket;
 if(s){s.emit('requestGame',{targetId:id});b.disabled=true;b.textContent='📨 ارسال شد';setTimeout(()=>{b.disabled=false;b.textContent='🎮 درخواست بازی'},1500)}
},true);
})();
