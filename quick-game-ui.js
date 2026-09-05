(() => {
  'use strict';
  const ROOT='morg-quick-overlay';
  let selected=2, searching=false, socketRef=null;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  function getSocket(){
    if(socketRef && socketRef.ws && socketRef.ws.readyState===3) socketRef=null;
    const s=window.__MORG_SOCKET__||window.socket||socketRef;
    if(s){socketRef=s;return s}
    if(typeof window.io==='function'){
      try{socketRef=window.io();window.__MORG_SOCKET__=socketRef;return socketRef}catch(e){}
    }
    return null;
  }
  function css(){
    if(document.getElementById('morg-quick-css'))return;
    const s=document.createElement('style');s.id='morg-quick-css';s.textContent=`
      #${ROOT}{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:rgba(8,12,7,.88);backdrop-filter:blur(10px);direction:rtl}
      #${ROOT} .qbox{width:min(650px,92vw);padding:30px;border:4px solid #d47a2a;border-radius:34px;background:linear-gradient(145deg,#fff9ea,#edd3a5);box-shadow:0 25px 90px #000c;text-align:center;color:#4a2815;animation:qpop .3s ease-out}
      #${ROOT} h2{margin:0 0 7px;font-size:clamp(27px,5vw,42px);color:#984b14}#${ROOT} p{font-weight:900;color:#6c5038;margin:0 0 20px}
      #${ROOT} .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}#${ROOT} button{border:0;border-radius:16px;padding:15px 7px;font-weight:1000;font-size:18px;cursor:pointer;background:#f5a623;color:#3a1e0b;box-shadow:0 5px 0 #b46a18}#${ROOT} button:active{transform:translateY(3px);box-shadow:0 2px 0 #b46a18}
      #${ROOT} .cancel{margin-top:16px;width:100%;background:#7f8c8d;color:#fff;box-shadow:0 5px 0 #596566}.lens{font-size:clamp(100px,22vw,190px);line-height:1;margin:8px 0 18px;display:inline-block;animation:qspin 1s linear infinite}.searchTitle{font-size:clamp(27px,6vw,48px);font-weight:1000;color:#8b4616}.note{margin-top:12px;font-weight:800;color:#80654e}.dots{display:inline-block;width:55px;text-align:right}
      @keyframes qpop{from{opacity:0;transform:scale(.75)}to{opacity:1;transform:scale(1)}}@keyframes qspin{from{transform:rotate(-25deg)}to{transform:rotate(335deg)}}
      @media(max-width:520px){#${ROOT} .grid{grid-template-columns:repeat(3,1fr)}#${ROOT} button{font-size:16px;padding:13px 4px}}
    `;document.head.appendChild(s);
  }
  function remove(){searching=false;document.getElementById(ROOT)?.remove()}
  function show(){
    if(document.getElementById(ROOT))return;css();
    const r=document.createElement('div');r.id=ROOT;r.innerHTML=`<div class="qbox"><h2>⚡ بازی سریع</h2><p>تعداد بازیکنان را انتخاب کن</p><div class="grid">${[2,3,4,5,6,7,8,9,10,12,15,20].map(n=>`<button data-n="${n}">${n} نفره</button>`).join('')}</div><button class="cancel">❌ لغو</button></div>`;
    document.body.appendChild(r);r.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>start(+b.dataset.n));r.querySelector('.cancel').onclick=remove;
  }
  function start(count){
    selected=count;searching=true;const r=document.getElementById(ROOT);if(!r)return;
    r.querySelector('.qbox').innerHTML=`<div class="lens">🔎</div><div class="searchTitle">در حال جستجوی حریف<span class="dots">...</span></div><div class="note">منتظر ${count} بازیکن هستیم تا بازی شروع شود.</div><button class="cancel">❌ لغو جستجو</button>`;
    r.querySelector('.cancel').onclick=cancel;
    const s=getSocket();
    if(s){s.emit('quickGame',{playerCount:count});}
    else{setTimeout(()=>{const x=getSocket();if(x)x.emit('quickGame',{playerCount:count});},500);}
  }
  function cancel(){const s=getSocket();if(s)s.emit('cancelQuickGame');remove()}
  function bind(){
    const s=getSocket();if(!s||s.__morgQuickBound)return;s.__morgQuickBound=true;socketRef=s;
    s.on('quickGameQueued',d=>{if(!searching)return;const n=d?.playerCount||selected;const note=document.querySelector(`#${ROOT} .note`);if(note)note.textContent=`در حال جستجوی حریف برای بازی ${n} نفره... ${d?.queued||1} نفر در صف هستند.`});
    s.on('quickGameError',d=>{if(searching){alert(d?.message||d||'خطا در بازی سریع');remove()}});
    s.on('quickGameCancelled',remove);
  }
  function bindButtons(){
    document.addEventListener('click',e=>{const el=e.target?.closest?.('button,a,[role="button"]');if(!el)return;const text=(el.textContent||'').replace(/\s+/g,' ').trim();if(!/(بازی\s*سریع|بازی\s*سریع⚡|⚡\s*بازی\s*سریع)/.test(text))return;e.preventDefault();e.stopImmediatePropagation();show()},true);
  }
  bindButtons();bind();setInterval(bind,400);
})();
