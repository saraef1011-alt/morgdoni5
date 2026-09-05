(() => {
  'use strict';
  const ROOT_ID='morg-quick-overlay';
  let selected=null, searching=false, boundDocuments=false;
  function socket(){return window.__MORG_SOCKET__||window.socket||null}
  function style(){
    if(document.getElementById('morg-quick-style'))return;
    const s=document.createElement('style');s.id='morg-quick-style';s.textContent=`
      #${ROOT_ID}{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;background:rgba(7,12,8,.9);backdrop-filter:blur(9px);direction:rtl}
      #${ROOT_ID} .mq-box{width:min(620px,92vw);background:linear-gradient(145deg,#fff8e9,#f2dfbf);border:4px solid #d47a2a;border-radius:38px;padding:28px;box-shadow:0 25px 90px #000b;text-align:center;color:#4a2815;animation:mqPop .35s ease-out}
      #${ROOT_ID} h2{margin:0 0 8px;color:#9b4c16;font-size:clamp(24px,5vw,38px)}
      #${ROOT_ID} p{margin:0 0 20px;font-weight:800;color:#6d513b}
      #${ROOT_ID} .mq-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
      #${ROOT_ID} button{border:0;border-radius:18px;padding:15px 8px;font-weight:1000;font-size:18px;cursor:pointer;background:#f5a623;color:#3a1e0b;box-shadow:0 5px 0 #b46a18}
      #${ROOT_ID} button:active{transform:translateY(3px);box-shadow:0 2px 0 #b46a18}
      #${ROOT_ID} .mq-cancel{margin-top:15px;width:100%;background:#7f8c8d;color:#fff;box-shadow:0 5px 0 #596566}
      #${ROOT_ID}.searching .mq-box{background:radial-gradient(circle,#fff8dc,#e9c98f)}
      #${ROOT_ID} .mq-lens{font-size:clamp(90px,20vw,170px);line-height:1;margin:12px 0 18px;display:inline-block;animation:mqSpin 1.05s linear infinite}
      #${ROOT_ID} .mq-search-title{font-size:clamp(26px,6vw,46px);font-weight:1000;color:#8b4616}
      #${ROOT_ID} .mq-dots{display:inline-block;width:54px;text-align:right}
      #${ROOT_ID} .mq-note{margin-top:10px;color:#80654e;font-size:14px}
      @keyframes mqPop{from{opacity:0;transform:scale(.75)}to{opacity:1;transform:scale(1)}}
      @keyframes mqSpin{from{transform:rotate(-25deg) scale(.92)}to{transform:rotate(335deg) scale(1.05)}}
      @media(max-width:520px){#${ROOT_ID} .mq-grid{grid-template-columns:repeat(3,1fr)}#${ROOT_ID} button{font-size:16px;padding:13px 5px}}
    `;document.head.appendChild(s)
  }
  function remove(){document.getElementById(ROOT_ID)?.remove();selected=null;searching=false}
  function showPicker(){
    if(document.getElementById(ROOT_ID))return;style();const root=document.createElement('div');root.id=ROOT_ID;
    const nums=[2,3,4,5,6,7,8,9,10,12,15,20];
    root.innerHTML=`<div class="mq-box"><h2>⚡ بازی سریع</h2><p>چند نفره بازی کنیم؟</p><div class="mq-grid">${nums.map(n=>`<button data-count="${n}">${n} نفره</button>`).join('')}</div><button class="mq-cancel" id="mqCancel">❌ لغو</button></div>`;
    document.body.appendChild(root);root.querySelectorAll('[data-count]').forEach(b=>b.onclick=()=>start(Number(b.dataset.count)));root.querySelector('#mqCancel').onclick=remove;
  }
  function start(count){
    selected=count;searching=true;const root=document.getElementById(ROOT_ID);if(!root)return;root.classList.add('searching');
    root.querySelector('.mq-box').innerHTML=`<div class="mq-lens">🔎</div><div class="mq-search-title">در حال جستجوی حریف<span class="mq-dots">...</span></div><div class="mq-note">منتظر ${count} بازیکن برای شروع بازی ${count} نفره هستیم.</div><button class="mq-cancel" id="mqCancel">❌ لغو جستجو</button>`;
    root.querySelector('#mqCancel').onclick=cancel;const s=socket();if(s)s.emit('quickGame',{playerCount:count});
  }
  function cancel(){const s=socket();if(s)s.emit('cancelQuickGame');remove()}
  function bind(){
    if(boundDocuments)return;boundDocuments=true;
    document.addEventListener('click',e=>{const el=e.target?.closest?.('button,a,[role="button"]');if(!el)return;const text=(el.textContent||'').replace(/\s+/g,' ').trim();if(!/بازی\s*سریع/.test(text))return;e.preventDefault();e.stopImmediatePropagation();showPicker()},true);
    const s=socket();if(s&&!s.__morgQuickEvents){s.__morgQuickEvents=true;s.on('quickGameQueued',d=>{if(searching){const n=d?.playerCount||selected;const note=document.querySelector(`#${ROOT_ID} .mq-note`);if(note)note.textContent=`در حال جستجوی حریف برای بازی ${n} نفره...`}});s.on('quickGameError',d=>{if(searching){alert(d||'خطا در بازی سریع');remove()}});s.on('quickGameCancelled',remove)}
  }
  bind();setInterval(()=>{if(!boundDocuments)bind()},1000);
})();
