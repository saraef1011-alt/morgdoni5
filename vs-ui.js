(() => {
  "use strict";
  const STYLE_ID = "morg-vs-style";
  const ROOT_ID = "morg-vs-overlay";
  const MUSIC_ID = "morg-vs-music";
  let active = false;
  let hideTimer = null;

  function esc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[c] || c));
  }
  function addStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement("style"); s.id = STYLE_ID;
    s.textContent = `
      #${ROOT_ID}{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(circle at 50% 35%,#6b3b1f 0,#28150c 52%,#0d0704 100%);color:#fff;direction:rtl}
      #${ROOT_ID}.show{display:flex;animation:mvsFadeIn .45s ease-out both}
      #${ROOT_ID} .mvs-wood{position:absolute;inset:0;opacity:.22;background:repeating-linear-gradient(8deg,transparent 0 22px,#d58b42 23px 25px,transparent 26px 49px)}
      #${ROOT_ID} .mvs-wrap{position:relative;width:min(1250px,94vw);max-height:94vh;text-align:center;z-index:1}
      #${ROOT_ID} .mvs-title{font-size:clamp(30px,5vw,66px);font-weight:1000;text-shadow:0 6px 0 #4b210d,0 12px 28px #000;margin-bottom:22px;animation:mvsDrop .65s cubic-bezier(.2,.8,.2,1) both}
      #${ROOT_ID} .mvs-players{display:flex;align-items:center;justify-content:center;gap:clamp(10px,3vw,42px);flex-wrap:wrap}
      #${ROOT_ID} .mvs-player{width:min(240px,27vw);min-width:150px;padding:16px 12px;border:4px solid #e5a43c;border-radius:28px;background:linear-gradient(145deg,#fff3d2,#c87929);color:#3a1908;box-shadow:0 18px 45px #0009,inset 0 2px #fff8;animation:mvsPlayer .65s cubic-bezier(.2,.8,.2,1) both}
      #${ROOT_ID} .mvs-player:nth-child(2){animation-delay:.08s}#${ROOT_ID} .mvs-player:nth-child(3){animation-delay:.16s}#${ROOT_ID} .mvs-player:nth-child(4){animation-delay:.24s}#${ROOT_ID} .mvs-player:nth-child(5){animation-delay:.32s}#${ROOT_ID} .mvs-player:nth-child(6){animation-delay:.40s}
      #${ROOT_ID} .mvs-avatar{width:clamp(95px,11vw,145px);height:clamp(95px,11vw,145px);margin:auto;border-radius:50%;display:grid;place-items:center;font-size:clamp(50px,7vw,78px);background:#f9d27a;border:6px solid #fff0ba;box-shadow:0 8px 18px #5b260c66}
      #${ROOT_ID} .mvs-name{font-size:clamp(18px,2.4vw,29px);font-weight:1000;margin-top:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${ROOT_ID} .mvs-badge{display:inline-block;margin-top:7px;padding:5px 12px;border-radius:20px;background:#6e3214;color:#ffe8b0;font-weight:900;font-size:13px}
      #${ROOT_ID} .mvs-vs{font-size:clamp(52px,9vw,110px);font-weight:1000;font-style:italic;color:#ffd23d;text-shadow:0 7px 0 #8c2b12,0 12px 28px #000;transform:rotate(-6deg);animation:mvsPulse 1.1s infinite alternate}
      #${ROOT_ID} .mvs-sub{margin-top:24px;font-size:clamp(16px,2vw,22px);color:#ffe4b0;font-weight:800}
      #${ROOT_ID} .mvs-count{display:inline-block;margin-right:8px;color:#ffd23d}
      #${ROOT_ID} .mvs-skip{margin-top:18px;border:0;border-radius:17px;padding:11px 24px;font-size:16px;font-weight:900;cursor:pointer;background:#27ae60;color:#fff;box-shadow:0 5px 0 #126331}
      #${ROOT_ID} .mvs-music{position:fixed;top:18px;left:18px;border:2px solid #f4c66b;border-radius:50%;width:50px;height:50px;background:#432310;color:#fff;font-size:21px;cursor:pointer;z-index:3}
      @keyframes mvsFadeIn{from{opacity:0}to{opacity:1}} @keyframes mvsDrop{from{opacity:0;transform:translateY(-35px) scale(.8)}to{opacity:1;transform:none}} @keyframes mvsPlayer{from{opacity:0;transform:translateY(40px) scale(.7)}to{opacity:1;transform:none}} @keyframes mvsPulse{to{transform:rotate(-6deg) scale(1.08)}}
      @media(max-width:700px){#${ROOT_ID} .mvs-player{width:42vw;min-width:135px;padding:10px 7px}#${ROOT_ID} .mvs-players{gap:8px;max-height:70vh;overflow:auto;padding:5px}.mvs-sub{margin-top:12px}}
    `; document.head.appendChild(s);
  }
  function getRoot(){
    addStyle(); let root=document.getElementById(ROOT_ID); if(root)return root;
    root=document.createElement("div");root.id=ROOT_ID;
    root.innerHTML=`<div class="mvs-wood"></div><div class="mvs-wrap"><div class="mvs-title">⚔️ آماده‌ی نبرد؟</div><div class="mvs-players" id="mvsPlayers"></div><div class="mvs-sub">نبرد مرغ‌دونی تا چند لحظه‌ی دیگر شروع می‌شود... <span class="mvs-count" id="mvsCount"></span></div><button class="mvs-skip" id="mvsSkip">🎮 ورود به بازی</button></div><button class="mvs-music" id="mvsMusicBtn">🔊</button>`;
    document.body.appendChild(root);
    const music=document.createElement("audio");music.id=MUSIC_ID;music.src="/audio/vs.mp3";music.preload="auto";music.loop=true;root.appendChild(music);
    root.querySelector("#mvsMusicBtn").onclick=()=>{if(music.paused){music.play().catch(()=>{});root.querySelector("#mvsMusicBtn").textContent="🔊"}else{music.pause();root.querySelector("#mvsMusicBtn").textContent="🔇"}};
    root.querySelector("#mvsSkip").onclick=hide; return root;
  }
  function normalizePlayers(state){const ps=state?.players||state?.room?.players||[];return Array.isArray(ps)?ps.filter(Boolean):[]}
  function show(state){
    const players=normalizePlayers(state);if(players.length<2)return;const root=getRoot(),list=root.querySelector("#mvsPlayers");list.innerHTML="";
    players.forEach((p,i)=>{const card=document.createElement("section");card.className="mvs-player";card.innerHTML=`<div class="mvs-avatar">${esc(p.avatar||"🐔")}</div><div class="mvs-name">${esc(p.name||"بازیکن")}</div><div class="mvs-badge">${i===0?"بازیکن اول":"بازیکن"}</div>`;list.appendChild(card);if(i<players.length-1&&players.length<=2){const vs=document.createElement("div");vs.className="mvs-vs";vs.textContent="VS";list.appendChild(vs)}});
    root.querySelector("#mvsCount").textContent=`(${players.length} نفره)`;root.classList.add("show");active=true;const music=root.querySelector("#"+MUSIC_ID);music.play().catch(()=>{});clearTimeout(hideTimer);hideTimer=setTimeout(hide,3600);
  }
  function hide(){clearTimeout(hideTimer);const root=document.getElementById(ROOT_ID);if(!root)return;root.classList.remove("show");active=false}
  function socket(){return window.__MORG_SOCKET__||window.socket||null}
  function bind(s){if(!s||s.__morgVsBound)return;s.__morgVsBound=true;s.on("gameStarted",d=>{if(d?.roomId)s.emit("getGameState",{roomId:d.roomId});setTimeout(()=>{if(!active&&d?.roomId)s.emit("getGameState",{roomId:d.roomId})},100)});s.on("gameState",d=>{if(!active)show(d)});s.on("joinExistingGame",d=>{if(d?.room&&d.mode!=="watcher")show(d.room)})}
  function watch(){const s=socket();if(s)bind(s)}watch();setInterval(watch,500);window.MorgdoniVS={show,hide};
})();
