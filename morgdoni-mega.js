(()=>{
'use strict';
if(window.__MORGDONI_MEGA__)return;window.__MORGDONI_MEGA__=true;
const KEY='morgdoniMegaStats';
const get=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{"games":0,"wins":0,"ach":[]}')}catch{return {games:0,wins:0,ach:[]}}};
const save=x=>{try{localStorage.setItem(KEY,JSON.stringify(x))}catch{}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
function css(){if(document.getElementById('morg-mega-css'))return;const s=document.createElement('style');s.id='morg-mega-css';s.textContent=`
#morgMega{position:fixed;left:14px;bottom:14px;z-index:9998;font-family:Tahoma,Arial,sans-serif;direction:rtl}
#morgMega .mm-btn{border:0;border-radius:18px;padding:10px 13px;background:#2d2b1a;color:#ffe6a6;font-weight:900;cursor:pointer;box-shadow:0 4px 0 #111;font-size:14px}
#morgMegaPanel{display:none;position:absolute;left:0;bottom:54px;width:260px;background:#fff7e5;color:#5b2d0b;border:3px solid #d47a2a;border-radius:24px;padding:14px;box-shadow:0 18px 50px #0008}
#morgMegaPanel.open{display:block;animation:mmPop .18s ease-out}
#morgMegaPanel h3{margin:0 0 10px;color:#b85f16;text-align:center}
#morgMegaPanel button{width:100%;border:0;border-radius:14px;padding:10px;margin:4px 0;background:#ffa047;color:#2c1a0a;font-weight:900;cursor:pointer}
#morgMegaPanel .stats{background:#fff0d0;border-radius:14px;padding:9px;text-align:center;margin-bottom:8px}
#morgToast{position:fixed;top:18px;right:50%;transform:translateX(50%) translateY(-20px);z-index:10000;background:#21150d;color:#ffe7a5;border:2px solid #e0a03b;border-radius:18px;padding:12px 20px;font-weight:900;opacity:0;pointer-events:none;transition:.25s;direction:rtl;font-family:Tahoma,Arial,sans-serif}
#morgToast.show{opacity:1;transform:translateX(50%) translateY(0)}
#morgOffline{display:none;position:fixed;top:0;left:0;right:0;z-index:10001;background:#c0392b;color:white;text-align:center;padding:8px;font-weight:900;direction:rtl;font-family:Tahoma,Arial,sans-serif}
#morgOffline.on{display:block}
.morg-win-flash{animation:mmWin .7s ease-in-out 3!important}
@keyframes mmPop{from{opacity:0;transform:translateY(8px) scale(.9)}to{opacity:1;transform:none}}
@keyframes mmWin{50%{filter:brightness(1.5) drop-shadow(0 0 18px #ffd23d);transform:scale(1.025)}}
@media(max-width:600px){#morgMegaPanel{width:235px}}
` ;document.head.appendChild(s)}
function toast(msg){let x=document.getElementById('morgToast');if(!x){x=document.createElement('div');x.id='morgToast';document.body.appendChild(x)}x.textContent=msg;x.classList.add('show');clearTimeout(x._t);x._t=setTimeout(()=>x.classList.remove('show'),2400)}
function fullscreen(){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.()}
async function share(){const u=location.href;try{if(navigator.share)await navigator.share({title:'مرغ دونی',text:'بیا با من مرغ دونی بازی کن!',url:u});else{await navigator.clipboard.writeText(u);toast('🔗 لینک بازی کپی شد')}}catch{}}
function theme(){document.body.classList.toggle('morg-night');const on=document.body.classList.contains('morg-night');document.body.style.filter=on?'brightness(.82) saturate(.9)':'none';localStorage.setItem('morgNight',on?'1':'0');toast(on?'🌙 حالت شب فعال شد':'☀️ حالت روز فعال شد')}
function statsPanel(){const x=get();const a=x.ach?.length||0;return `<div class="stats">🎮 بازی‌ها: <b>${x.games||0}</b><br>🏆 بردها: <b>${x.wins||0}</b><br>🏅 دستاوردها: <b>${a}</b></div>`}
function build(){css();if(document.getElementById('morgMega'))return;const root=document.createElement('div');root.id='morgMega';root.innerHTML='<button class="mm-btn" id="morgMegaBtn">🐔 منوی مرغ</button><div id="morgMegaPanel"><h3>🐔 امکانات مرغ دونی</h3><div id="morgMegaStats"></div><button data-mm="full">⛶ تمام صفحه</button><button data-mm="share">🔗 دعوت با لینک</button><button data-mm="theme">🌙 حالت شب</button><button data-mm="sound">🔊 صدا</button><button data-mm="help">⌨️ میانبرها</button></div>';document.body.appendChild(root);const panel=root.querySelector('#morgMegaPanel');root.querySelector('#morgMegaBtn').onclick=()=>{panel.classList.toggle('open');root.querySelector('#morgMegaStats').innerHTML=statsPanel()};root.querySelectorAll('[data-mm]').forEach(b=>b.onclick=()=>{const k=b.dataset.mm;if(k==='full')fullscreen();if(k==='share')share();if(k==='theme')theme();if(k==='sound'){const a=document.querySelector('audio');if(a){a.muted=!a.muted;toast(a.muted?'🔇 صدا خاموش شد':'🔊 صدا روشن شد')}else toast('🎵 صدای بازی آماده است')};if(k==='help')toast('F تمام‌صفحه | S اشتراک‌گذاری | M صدا | Esc بستن منو')});
const off=document.createElement('div');off.id='morgOffline';off.textContent='📡 اتصال قطع شد؛ در حال تلاش برای اتصال دوباره...';document.body.appendChild(off);
window.addEventListener('offline',()=>off.classList.add('on'));window.addEventListener('online',()=>{off.classList.remove('on');toast('✅ اتصال دوباره برقرار شد')});
if(localStorage.getItem('morgNight')==='1')theme();
window.addEventListener('keydown',e=>{if(e.target?.matches?.('input,textarea'))return;if(e.key.toLowerCase()==='f')fullscreen();if(e.key.toLowerCase()==='s')share();if(e.key.toLowerCase()==='m'){const a=document.querySelector('audio');if(a){a.muted=!a.muted;toast(a.muted?'🔇 صدا خاموش':'🔊 صدا روشن')}}if(e.key==='Escape')panel.classList.remove('open')});
}
function achievement(id,title){const x=get();x.ach??=[];if(x.ach.includes(id))return;x.ach.push(id);save(x);toast('🏅 دستاورد جدید: '+title)}
function confetti(){for(let i=0;i<26;i++){const d=document.createElement('i');d.textContent=['🥚','🐔','🐣','⭐'][i%4];d.style.cssText=`position:fixed;left:${Math.random()*100}vw;top:-30px;z-index:10000;font-style:normal;font-size:${18+Math.random()*22}px;animation:mmFall ${1.3+Math.random()*1.5}s linear forwards;pointer-events:none`;document.body.appendChild(d);setTimeout(()=>d.remove(),3000)}if(!document.getElementById('morg-fall-css')){const s=document.createElement('style');s.id='morg-fall-css';s.textContent='@keyframes mmFall{to{transform:translateY(110vh) rotate(540deg);opacity:.1}}';document.head.appendChild(s)}}
function inspectState(d){if(!d||typeof d!=='object')return;const x=get();const rid=d.roomId||d.room?.roomId;if(rid&&!sessionStorage.getItem('morgSeen_'+rid)){sessionStorage.setItem('morgSeen_'+rid,'1');x.games=(x.games||0)+1;save(x);if(x.games===1)achievement('first','اولین بازی');if(x.games===5)achievement('five','۵ بازی');if(x.games===10)achievement('ten','۱۰ بازی');if(x.games>=25)achievement('veteran','بازیکن حرفه‌ای')}
const winner=d.winner||d.room?.winner;if(winner){const me=localStorage.getItem('playerName')||localStorage.getItem('morgPlayerName');if(me&&String(winner)===String(me)){x.wins=(x.wins||0)+1;save(x);confetti();achievement('win','اولین برد')}}}
function hook(){build();const s=window.__MORG_SOCKET__||window.socket;if(s&&!s.__morgMega){s.__morgMega=true;['gameState','gameStarted','quickGameFound','friendGameFound'].forEach(ev=>s.on?.(ev,inspectState));s.on?.('disconnect',()=>document.getElementById('morgOffline')?.classList.add('on'));s.on?.('connect',()=>{document.getElementById('morgOffline')?.classList.remove('on');toast('🟢 آنلاین شدی')})}}
hook();setInterval(hook,700);setTimeout(()=>toast('🐔 امکانات جدید مرغ دونی آماده است!'),1200);
})();