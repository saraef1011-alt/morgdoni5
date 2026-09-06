(() => {
'use strict';
const ROOT='morg-quick-overlay';
let selected=2,searching=false,socketRef=null;
const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]||c));
function getSocket(){
  const s=window.__MORG_SOCKET__||window.socket||socketRef;
  if(s){socketRef=s;return s}
  if(typeof window.io==='function'){try{socketRef=window.io();window.__MORG_SOCKET__=socketRef;return socketRef}catch(e){}}
  return null;
}
function sound(type='pop'){
  try{const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const a=new A(),o=a.createOscillator(),g=a.createGain();o.type=type==='win'?'triangle':'sine';o.frequency.value=type==='win'?740:type==='click'?330:520;g.gain.setValueAtTime(.0001,a.currentTime);g.gain.exponentialRampToValueAtTime(.09,a.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+.18);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+.2)}catch(e){}
}
function css(){
 if(document.getElementById('morg-quick-css'))return;
 const s=document.createElement('style');s.id='morg-quick-css';s.textContent=`
 #${ROOT}{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 15%,#4d2a13,#120b06 72%);backdrop-filter:blur(12px);direction:rtl;overflow:auto}
 #${ROOT} *{box-sizing:border-box}#${ROOT} .qbox{width:min(850px,94vw);padding:28px;border:4px solid #e4a13b;border-radius:38px;background:linear-gradient(145deg,#fff9ea,#e8c58d);box-shadow:0 30px 120px #000d;text-align:center;color:#45220d;animation:qpop .35s ease-out;position:relative;overflow:hidden}
 #${ROOT} .qbox:before{content:'🐔 🥚 🐓 🪺 🦊 🐍';position:absolute;inset:auto -30px -18px;opacity:.08;font-size:70px;letter-spacing:16px;white-space:nowrap;transform:rotate(-4deg)}
 #${ROOT} h2{margin:0 0 6px;font-size:clamp(30px,6vw,50px);color:#9b4c13;text-shadow:0 3px #f7d99c}#${ROOT} p{font-weight:900;color:#6c5038;margin:0 0 18px}
 #${ROOT} .grid{display:grid;grid-template-columns:repeat(7,1fr);gap:9px;position:relative;z-index:2}#${ROOT} button{border:0;border-radius:15px;padding:13px 5px;font-weight:1000;font-size:17px;cursor:pointer;background:linear-gradient(145deg,#ffc45c,#e98a20);color:#3a1e0b;box-shadow:0 5px 0 #a95d13;transition:.12s;position:relative}#${ROOT} button:hover{transform:translateY(-3px) scale(1.03);filter:brightness(1.08)}#${ROOT} button:active{transform:translateY(3px);box-shadow:0 2px 0 #a95d13}
 #${ROOT} .featured{background:linear-gradient(145deg,#ffe16d,#ff9f1c)!important;outline:3px solid #fff1ad}.featured:after{content:'🔥';position:absolute;top:-11px;left:-6px;font-size:20px}
 #${ROOT} .cancel{margin-top:18px;width:100%;background:#7f8c8d!important;color:#fff!important;box-shadow:0 5px 0 #596566!important;z-index:3}.lens{font-size:clamp(100px,22vw,190px);line-height:1;display:inline-block;animation:qspin 1s linear infinite;filter:drop-shadow(0 12px 20px #0008)}
 #${ROOT} .searchTitle{font-size:clamp(28px,6vw,52px);font-weight:1000;color:#8b4616}.note{margin-top:12px;font-weight:800;color:#80654e}.dots{display:inline-block;width:55px;text-align:right}
 #${ROOT} .mini-stats{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin:16px 0}.pill{padding:8px 13px;border-radius:30px;background:#fff0c7;border:2px solid #e2aa54;font-weight:900}
 #morg-direct-vs .vs-particle{position:fixed;pointer-events:none;animation:fall 2.3s linear forwards;font-size:25px}
 @keyframes qpop{from{opacity:0;transform:scale(.72) rotate(-2deg)}to{opacity:1;transform:scale(1)}}@keyframes qspin{from{transform:rotate(-25deg)}to{transform:rotate(335deg)}}@keyframes fall{from{transform:translateY(-10vh) rotate(0);opacity:1}to{transform:translateY(110vh) rotate(600deg);opacity:0}}
 @media(max-width:720px){#${ROOT} .grid{grid-template-columns:repeat(5,1fr)}#${ROOT} button{font-size:15px;padding:12px 3px}}@media(max-width:430px){#${ROOT} .grid{grid-template-columns:repeat(4,1fr)}}`;
 document.head.appendChild(s);
}
function remove(){searching=false;document.getElementById(ROOT)?.remove()}
function show(){
 if(document.getElementById(ROOT))return;css();sound('click');
 const nums=Array.from({length:49},(_,i)=>i+2);
 const r=document.createElement('div');r.id=ROOT;r.innerHTML=`<div class="qbox"><h2>⚡ بازی سریع</h2><p>تعداد بازیکنان را انتخاب کن — از ۲ تا ۵۰ نفر!</p><div class="mini-stats"><span class="pill">🌎 آنلاین</span><span class="pill">⚡ شروع خودکار</span><span class="pill">🏆 رقابت واقعی</span></div><div class="grid">${nums.map(n=>`<button data-n="${n}" class="${[2,4,6,8,10,20,30,40,50].includes(n)?'featured':''}">${n} نفره</button>`).join('')}</div><button class="cancel">❌ لغو</button></div>`;
 document.body.appendChild(r);r.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>start(+b.dataset.n));r.querySelector('.cancel').onclick=remove;
}
function start(count){
 selected=Math.max(2,Math.min(50,count));searching=true;sound('click');const r=document.getElementById(ROOT);if(!r)return;
 r.querySelector('.qbox').innerHTML=`<div class="lens">🔎</div><div class="searchTitle">در حال جستجوی حریف<span class="dots">...</span></div><div class="mini-stats"><span class="pill">👥 ${selected} نفر</span><span class="pill">⚡ تطبیق هوشمند</span></div><div class="note">منتظر ${selected} بازیکن هستیم تا بازی شروع شود.</div><button class="cancel">❌ لغو جستجو</button>`;
 r.querySelector('.cancel').onclick=cancel;
 const s=getSocket();if(s)s.emit('quickGame',{playerCount:selected});else setTimeout(()=>{const x=getSocket();if(x)x.emit('quickGame',{playerCount:selected})},500);
}
function cancel(){const s=getSocket();if(s)s.emit('cancelQuickGame');remove();sound('click')}
function confetti(){
 const root=document.getElementById('morg-direct-vs');if(!root)return;const icons=['🥚','🐔','🐓','✨','🏆','🪺','⭐'];
 for(let i=0;i<55;i++){const p=document.createElement('div');p.className='vs-particle';p.textContent=icons[i%icons.length];p.style.left=Math.random()*100+'vw';p.style.top=(-10-Math.random()*30)+'vh';p.style.animationDelay=(Math.random()*.8)+'s';root.appendChild(p)}
}
function openVS(d){
 if(!d?.roomId)return;try{sessionStorage.setItem('morgdoniRoom',d.roomId);sessionStorage.setItem('morgdoniVS',JSON.stringify(d))}catch{}
 remove();const old=document.getElementById('morg-direct-vs');if(old)old.remove();sound('win');
 const ps=Array.isArray(d.players)?d.players:[],count=Math.max(2,Number(d.playerCount)||ps.length||2);
 const v=document.createElement('div');v.id='morg-direct-vs';v.style.cssText='position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;overflow:auto;background:radial-gradient(circle at 50% 30%,#7b421f,#28150c 55%,#090503);color:#fff;direction:rtl;font-family:Tahoma,Arial,sans-serif;';
 const people=ps.length>=2?ps:Array.from({length:count},(_,i)=>({name:'بازیکن '+(i+1),avatar:i?'🐓':'🐔'}));
 const cards=people.map((p,i)=>`<div style="width:min(220px,25vw);min-width:125px;padding:14px 9px;border:4px solid #e5a43c;border-radius:25px;background:linear-gradient(145deg,#fff3d2,#c87929);color:#3a1908;box-shadow:0 18px 45px #0009;text-align:center;animation:vsCard .5s ${i*.06}s both"><div style="width:clamp(78px,10vw,130px);height:clamp(78px,10vw,130px);margin:auto;border-radius:50%;display:grid;place-items:center;font-size:58px;background:#f9d27a;border:6px solid #fff0ba">${esc(p.avatar||'🐔')}</div><div style="font-size:clamp(16px,2.2vw,27px);font-weight:1000;margin-top:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(p.name||p.username||'بازیکن '+(i+1))}</div><div style="display:inline-block;margin-top:6px;padding:5px 11px;border-radius:20px;background:#6e3214;color:#ffe8b0;font-weight:900;font-size:12px">${i===0?'👑 بازیکن اول':'🎮 بازیکن '+(i+1)}</div></div>`).join('<div style="font-size:clamp(45px,8vw,110px);font-weight:1000;font-style:italic;color:#ffd23d;text-shadow:0 7px 0 #8c2b12,0 12px 28px #000;margin:0 5px;animation:vsPulse .8s infinite alternate">VS</div>');
 v.innerHTML=`<style>@keyframes vsCard{from{opacity:0;transform:scale(.45) translateY(40px)}to{opacity:1;transform:none}}@keyframes vsPulse{to{transform:scale(1.12) rotate(-3deg)}}@keyframes vsGlow{to{box-shadow:0 0 70px #ffd23d88}}</style><div style="width:min(1450px,95vw);text-align:center"><div style="font-size:clamp(30px,5vw,66px);font-weight:1000;text-shadow:0 6px 0 #4b210d,0 12px 28px #000;margin-bottom:10px">⚔️ آماده‌ی نبرد!</div><div style="font-size:clamp(15px,2vw,22px);color:#ffd98b;font-weight:900;margin-bottom:18px">🔥 ${count} بازیکن وارد میدان شدند!</div><div style="display:flex;align-items:center;justify-content:center;gap:clamp(6px,1.6vw,22px);flex-wrap:wrap;max-height:65vh;overflow:auto;padding:10px">${cards}</div><div style="margin-top:18px;font-size:clamp(16px,2vw,22px);color:#ffe4b0;font-weight:900">بازی تا چند لحظه‌ی دیگر شروع می‌شود <span id="morg-vs-count" style="display:inline-flex;margin-right:8px;min-width:52px;height:52px;border-radius:50%;align-items:center;justify-content:center;background:#ffd23d;color:#4b210d;font-size:25px;font-weight:1000;animation:vsGlow .7s infinite alternate">5</span></div></div>`;
 document.body.appendChild(v);confetti();
 let n=5;const ce=v.querySelector('#morg-vs-count');const iv=setInterval(()=>{n--;if(ce){ce.textContent=Math.max(0,n);if(n>0)sound('pop')}if(n<=0)clearInterval(iv)},1000);
 setTimeout(()=>{clearInterval(iv);v.remove();const s=getSocket();if(s)s.emit('getGameState',{roomId:d.roomId})},5200);
}
function bind(){
 const s=getSocket();if(!s||s.__morgQuickBound)return;s.__morgQuickBound=true;socketRef=s;
 s.on('quickGameQueued',d=>{if(!searching)return;const n=d?.playerCount||selected;const note=document.querySelector(`#${ROOT} .note`);if(note)note.textContent=`در حال جستجوی حریف برای بازی ${n} نفره... ${d?.queued||1} نفر در صف هستند.`});
 s.on('quickGameFound',openVS);
 s.on('quickGameError',d=>{if(searching){alert(d?.message||d||'خطا در بازی سریع');remove()}});
 s.on('quickGameCancelled',remove);
}
function bindButtons(){document.addEventListener('click',e=>{const el=e.target?.closest?.('button,a,[role="button"]');if(!el)return;const text=(el.textContent||'').replace(/\s+/g,' ').trim();if(!/(بازی\s*سریع|بازی\s*سریع⚡|⚡\s*بازی\s*سریع)/.test(text))return;e.preventDefault();e.stopImmediatePropagation();show()},true)}
bindButtons();bind();setInterval(bind,500);
window.morgQuickShow=show;
})();