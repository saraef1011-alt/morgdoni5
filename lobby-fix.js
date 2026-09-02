(()=>{
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function sock(){return window.__MORG_SOCKET__||window.socket||null}
function myId(){const s=sock();return window.myId||s?.id||null}
function sendRequest(id,btn){
 const s=sock(); if(!s||!id)return;
 if(String(id)===String(myId()))return;
 s.emit('requestGame',{targetId:String(id)});
 if(btn){btn.disabled=true;btn.textContent='📨 ارسال شد';setTimeout(()=>{if(btn.isConnected){btn.disabled=false;btn.textContent='🎮 درخواست بازی'}},1600)}
}
function makeButton(id){
 const b=document.createElement('button');
 b.className='action-btn morg-any-request';
 b.dataset.requestId=String(id);
 b.type='button';
 b.textContent='🎮 درخواست بازی';
 b.style.cssText='margin-top:8px;width:100%;background:#27ae60;color:#fff;box-shadow:0 4px 0 #1a6b3b;display:block!important;visibility:visible!important;opacity:1!important;position:relative;z-index:20;';
 b.onclick=e=>{e.preventDefault();e.stopPropagation();sendRequest(id,b)};
 return b;
}
function addButtonToPlayer(el){
 if(!el||el.nodeType!==1)return;
 if(el.classList.contains('morg-any-request')||el.querySelector('.morg-any-request'))return;
 let id=el.getAttribute('data-player-id')||el.getAttribute('data-id');
 const profile=el.querySelector('[data-view-profile]');
 if(!id&&profile)id=profile.getAttribute('data-view-profile');
 if(!id)return;
 if(String(id)===String(myId()))return;
 const b=makeButton(id);
 el.appendChild(b);
}
function scanPlayers(){
 document.querySelectorAll('.player').forEach(addButtonToPlayer);
 const area=document.getElementById('lobbyPlayersArea');
 if(area){
  area.querySelectorAll('[data-view-profile],.player').forEach(x=>addButtonToPlayer(x.closest('.player')||x));
 }
}
function drawLobby(list){
 if(!Array.isArray(list))return;
 const me=myId();
 const others=list.filter(p=>p&&p.id&&String(p.id)!==String(me));
 const count=document.getElementById('onlineCount');if(count)count.textContent=list.length;
 const empty=document.getElementById('lobbyEmptyMsg');if(empty)empty.style.display=others.length?'none':'block';
 const area=document.getElementById('lobbyPlayersArea');
 if(area){
  area.innerHTML=others.map(p=>`<div class="player" data-player-id="${esc(p.id)}" style="position:relative"><div class="player-name"><span>${esc(p.avatar||'🐔')} ${esc(p.name||'بازیکن')}</span></div><div style="font-size:.85rem;color:#7b3f00;margin-bottom:6px">🟢 آنلاین</div></div>`).join('');
  scanPlayers();
 }
}
function hookSocket(){
 const s=sock();
 if(!s||s.__morgRequestFix)return;
 s.__morgRequestFix=true;
 s.on('playerListUpdate',drawLobby);
 s.on('hello',d=>{if(d?.id)window.myId=d.id;scanPlayers()});
 s.on('connect',()=>{if(s.id)window.myId=s.id;scanPlayers()});
 s.on('gameRequestError',d=>{if(d)alert(String(d))});
 s.on('gameRequestSent',d=>{if(d&&typeof window.showBigMessage==='function'&&d.targetName)window.showBigMessage(`📨 درخواست برای ${d.targetName} ارسال شد`,false)});
}
function hook(){
 const s=sock();
 if(s?.id)window.myId=s.id;
 hookSocket();
 scanPlayers();
}
setInterval(hook,300);
hook();
const mo=new MutationObserver(()=>scanPlayers());
mo.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{
 const b=e.target.closest('.morg-any-request,[data-request-id]');
 if(!b)return;
 const id=b.dataset.requestId;
 if(id){e.preventDefault();e.stopPropagation();sendRequest(id,b)}
},true);
})();
