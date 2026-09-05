(()=>{
'use strict';
let lastPlayers=[];
let boundSocket=null;
function sock(){return window.__MORG_SOCKET__||window.socket||null}
function me(){const s=sock();return String(window.myId||s?.id||'')}
function esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function statusText(s){return ({ready:'🟢 آماده',requesting:'📨 در انتظار پاسخ',requested:'📩 درخواست جدید',playing:'🎮 در حال بازی',room:'🏠 داخل اتاق',watching:'👀 در حال تماشا'}[s]||'🌐 آنلاین')}
function requestList(){const s=sock();if(!s)return;if(s.id)window.myId=s.id;try{s.emit('getPlayerList')}catch(e){}}
function requestGame(id,b){const s=sock();if(!s||!id||String(id)===me())return;s.emit('requestGame',{targetId:String(id)});if(b){b.disabled=true;b.textContent='📨 ارسال شد';setTimeout(()=>{if(b.isConnected){b.disabled=false;b.textContent='🎮 درخواست بازی'}},1600)}}
function renderLive(list){const panel=document.getElementById('liveOnlinePanel');const listEl=document.getElementById('liveOnlineList');const countEl=document.getElementById('liveOnlineCount');if(!panel||!listEl)return;const others=(Array.isArray(list)?list:[]).filter(p=>p?.id&&String(p.id)!==me());if(countEl)countEl.textContent=others.length;listEl.innerHTML=others.length?others.map(p=>`<div class="live-online-player"><div class="live-online-info"><span class="live-avatar">${esc(p.avatar||'🐔')}</span><div><b>${esc(p.name||'بازیکن')}</b><small>${esc(statusText(p.status))}</small></div></div><button class="live-request-btn" data-live-request="${esc(p.id)}">🎮 درخواست بازی</button></div>`).join(''):'<div class="live-empty">🐣 بازیکن دیگری آنلاین نیست</div>'}
function render(list){lastPlayers=Array.isArray(list)?list:[];window.__MORG_LAST_PLAYERS__=lastPlayers;try{if(typeof window.renderLobby==='function')window.renderLobby(lastPlayers)}catch(e){console.error('renderLobby:',e)}renderLive(lastPlayers)}
function bind(){const s=sock();if(!s)return;if(s!==boundSocket){boundSocket=s;s.on('hello',d=>{if(d?.id)window.myId=d.id;setTimeout(requestList,50)});s.on('connect',()=>{if(s.id)window.myId=s.id;setTimeout(requestList,50)});s.on('registrationSuccess',d=>{if(d?.id)window.myId=d.id;setTimeout(requestList,50)});s.on('playerListUpdate',render);s.on('disconnect',()=>render([]))}if(s.id)window.myId=s.id;requestList()}
function bindButtons(){document.querySelectorAll('[data-live-request]').forEach(b=>{if(b.dataset.liveBound)return;b.dataset.liveBound='1';b.addEventListener('click',()=>requestGame(b.dataset.liveRequest,b))})}
bind();setInterval(()=>{bind();bindButtons()},1000);
})();