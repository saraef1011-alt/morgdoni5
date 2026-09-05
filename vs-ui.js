(() => {
  'use strict';
  const ROOT='morg-vs-overlay', STYLE='morg-vs-css', AUDIO='morg-vs-audio';
  let active=false, timer=null, socketRef=null, lastRoom=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  function sock(){
    const s=window.__MORG_SOCKET__||window.socket||socketRef;
    if(s){socketRef=s;return s}
    if(typeof window.io==='function'){try{socketRef=window.io();window.__MORG_SOCKET__=socketRef;return socketRef}catch(e){}}
    return null;
  }
  function style(){if(document.getElementById(STYLE))return;const s=document.createElement('style');s.id=STYLE;s.textContent=`
    #${ROOT}{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(circle at 50% 35%,#7b421f,#28150c 55%,#0d0704);color:#fff;direction:rtl;font-family:Tahoma,Arial,sans-serif}#${ROOT}.on{display:flex;animation:vsin .35s ease-out}
    #${ROOT} .wood{position:absolute;inset:0;opacity:.2;background:repeating-linear-gradient(8deg,transparent 0 22px,#d58b42 23px 25px,transparent 26px 49px)}#${ROOT} .wrap{position:relative;width:min(1350px,95vw);max-height:94vh;text-align:center;z-index:1}
    #${ROOT} .title{font-size:clamp(30px,5vw,66px);font-weight:1000;text-shadow:0 6px 0 #4b210d,0 12px 28px #000;margin-bottom:20px}#${ROOT} .players{display:flex;align-items:center;justify-content:center;gap:clamp(8px,2vw,30px);flex-wrap:wrap;max-height:67vh;overflow:auto;padding:8px}
    #${ROOT} .player{width:min(220px,25vw);min-width:140px;padding:14px 10px;border:4px solid #e5a43c;border-radius:25px;background:linear-gradient(145deg,#fff3d2,#c87929);color:#3a1908;box-shadow:0 18px 45px #0009;animation:vspop .55s ease both}#${ROOT} .avatar{width:clamp(90px,10vw,135px);height:clamp(90px,10vw,135px);margin:auto;border-radius:50%;display:grid;place-items:center;font-size:clamp(48px,6vw,72px);background:#f9d27a;border:6px solid #fff0ba}
    #${ROOT} .name{font-size:clamp(17px,2.2vw,28px);font-weight:1000;margin-top:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#${ROOT} .badge{display:inline-block;margin-top:6px;padding:5px 11px;border-radius:20px;background:#6e3214;color:#ffe8b0;font-weight:900;font-size:12px}#${ROOT} .vs{font-size:clamp(55px,9vw,115px);font-weight:1000;font-style:italic;color:#ffd23d;text-shadow:0 7px 0 #8c2b12,0 12px 28px #000;animation:vspulse 1s infinite alternate}
    #${ROOT} .sub{margin-top:18px;font-size:clamp(16px,2vw,22px);color:#ffe4b0;font-weight:900}#${ROOT} .count{display:inline-flex;margin-right:8px;min-width:46px;height:46px;border-radius:50%;align-items:center;justify-content:center;background:#ffd23d;color:#4b210d;font-size:22px;font-weight:1000;box-shadow:0 5px 0 #9b5b10}#${ROOT} .skip{margin-top:16px;border:0;border-radius:16px;padding:11px 25px;background:#27ae60;color:#fff;font-weight:900;font-size:16px;cursor:pointer;box-shadow:0 5px 0 #126331}
    #${ROOT} .music{position:fixed;top:16px;left:16px;width:48px;height:48px;border:2px solid #f4c66b;border-radius:50%;background:#432310;color:#fff;font-size:20px;cursor:pointer;z-index:3}@keyframes vsin{from{opacity:0}to{opacity:1}}@keyframes vspop{from{opacity:0;transform:translateY(35px) scale(.75)}to{opacity:1;transform:none}}@keyframes vspulse{to{transform:scale(1.08) rotate(-5deg)}}
    @media(max-width:650px){#${ROOT} .player{width:42vw;min-width:130px;padding:9px 6px}#${ROOT} .players{gap:7px;max-height:70vh}}
  `;document.head.appendChild(s)}
  function root(){style();let r=document.getElementById(ROOT);if(r)return r;r=document.createElement('div');r.id=ROOT;r.innerHTML=`<div class="wood"></div><main class="wrap"><div class="title">⚔️ آماده‌ی نبرد!</div><div class="players" id="vsPlayers"></div><div class="sub">بازی تا چند لحظه‌ی دیگر شروع می‌شود <span class="count" id="vsCount">5</span></div><button class="skip" id="vsSkip">🎮 ورود به بازی</button></main><button class="music" id="vsMusic">🔊</button>`;document.body.appendChild(r);const a=document.createElement('audio');a.id=AUDIO;a.src='/audio/vs.mp3';a.loop=true;a.preload='auto';r.appendChild(a);r.querySelector('#vsMusic').onclick=()=>{if(a.paused){a.play().catch(()=>{});r.querySelector('#vsMusic').textContent='🔊'}else{a.pause();r.querySelector('#vsMusic').textContent='🔇'}};r.querySelector('#vsSkip').onclick=finish;return r}
  function playersOf(d){let p=d?.players||d?.room?.players||d?.data?.players;return Array.isArray(p)?p.filter(Boolean):[]}
  function show(d){
    const ps=playersOf(d), count=Math.max(2,Number(d?.playerCount)||ps.length||2);lastRoom=d?.roomId||d?.room?.roomId||lastRoom;
    if(ps.length<2){if(count<2)return;return showPlaceholders(count)}
    render(ps,count);
  }
  function showPlaceholders(count){const ps=Array.from({length:count},(_,i)=>({name:`بازیکن ${i+1}`,avatar:i===0?'🐔':'🐓'}));render(ps,count)}
  function render(ps,count){const r=root(),box=r.querySelector('#vsPlayers');box.innerHTML='';ps.forEach((p,i)=>{const c=document.createElement('section');c.className='player';c.style.animationDelay=(i*.07)+'s';c.innerHTML=`<div class="avatar">${esc(p.avatar||'🐔')}</div><div class="name">${esc(p.name||'بازیکن '+(i+1))}</div><div class="badge">${i===0?'بازیکن اول':'بازیکن'}</div>`;box.appendChild(c);if(i===0&&ps.length===2){const v=document.createElement('div');v.className='vs';v.textContent='VS';box.appendChild(v)}});r.querySelector('#vsCount').textContent='5';r.classList.add('on');active=true;const a=r.querySelector('#'+AUDIO);a.play().catch(()=>{});clearTimeout(timer);let n=5;const el=r.querySelector('#vsCount');const iv=setInterval(()=>{if(!active){clearInterval(iv);return}n--;el.textContent=Math.max(0,n);if(n<=0)clearInterval(iv)},1000);timer=setTimeout(finish,5200)}
  function finish(){clearTimeout(timer);active=false;document.getElementById(ROOT)?.classList.remove('on');const s=sock();if(lastRoom){sessionStorage.setItem('morgdoniRoom',lastRoom);if(s)s.emit('getGameState',{roomId:lastRoom});const current=new URL(location.href);if(!current.searchParams.get('room')){current.searchParams.set('room',lastRoom);history.replaceState({},'',current)}}}
  function bind(){const s=sock();if(!s||s.__morgVSBound)return;s.__morgVSBound=true;s.on('quickGameFound',d=>{lastRoom=d?.roomId||lastRoom;show(d);setTimeout(()=>{const x=sock();if(x&&lastRoom)x.emit('getGameState',{roomId:lastRoom})},80)});s.on('gameStarted',d=>{if(d?.roomId){lastRoom=d.roomId;const x=sock();if(x)x.emit('getGameState',{roomId:lastRoom})}});s.on('gameState',d=>{const rid=d?.roomId||d?.room?.roomId;if(rid&&(!active||rid===lastRoom))show(d)});s.on('joinExistingGame',d=>{if(d?.room){lastRoom=d.roomId||d.room.roomId;show(d.room)}})}
  bind();setInterval(bind,350);window.MorgdoniVS={show,hide:finish};
})();
