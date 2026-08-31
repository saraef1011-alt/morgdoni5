(() => {
'use strict';

const CARD_IMAGES = {
  'مرغ': '/cards/Hen.png',
  'خروس': '/cards/Rooster.png',
  'لانه': '/cards/Nest.png',
  'روباه': '/cards/Fox.png',
  'تله': '/cards/Trap.png',
  'مار': '/cards/Snake.png'
};

function paintCards(root = document) {
  root.querySelectorAll?.('.card').forEach(el => {
    if (el.classList.contains('card-back')) return;
    const text = String(el.textContent || '');
    const type = Object.keys(CARD_IMAGES).find(k => text.includes(k) || el.dataset.card === k);
    if (!type) return;
    el.dataset.card = type;
    let img = el.querySelector('.morgdoni-card-image');
    if (!img) {
      el.querySelectorAll('span').forEach(x => x.style.display = 'none');
      img = document.createElement('img');
      img.className = 'morgdoni-card-image';
      el.prepend(img);
    }
    img.src = CARD_IMAGES[type] + '?v=2';
    img.alt = type;
    img.draggable = false;
    img.onerror = () => {
      img.style.display = 'none';
      el.classList.add('morgdoni-image-error');
    };
  });
}

const css = document.createElement('style');
css.textContent = `
.card{overflow:hidden!important;position:relative!important}
.card .morgdoni-card-image{width:100%!important;height:100%!important;object-fit:contain!important;display:block!important;pointer-events:none!important;border-radius:inherit!important}
.card.morgdoni-image-error::after{content:attr(data-card);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:bold;color:#2c1a0a;background:#f3b33d}
.morgdoni-request-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px}
.morgdoni-request-box{width:min(430px,94vw);max-height:90vh;overflow:auto;background:linear-gradient(145deg,#fff8e8,#fbe9ca);border:3px solid #d47a2a;border-radius:35px;padding:28px 22px;text-align:center;box-shadow:0 20px 70px rgba(0,0,0,.55);direction:rtl}
.morgdoni-request-box h2{margin:0 0 12px;color:#a65318;font-size:1.45rem}.morgdoni-request-box p{margin:8px 0 20px;color:#59320f;font-size:1rem}
.morgdoni-request-btn{border:0;border-radius:22px;padding:12px 18px;margin:5px;font-weight:bold;font-size:1rem;cursor:pointer;min-width:105px}.mrg-green{background:#27ae60;color:white}.mrg-blue{background:#3498db;color:white}.mrg-red{background:#c0392b;color:white}.mrg-gray{background:#7f8c8d;color:white}
.morg-online-list{display:grid;gap:7px;text-align:right}.morg-online-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid #ead5b0;border-radius:15px;background:#fffaf0}.morg-online-row button{border:0;border-radius:14px;padding:7px 10px;background:#27ae60;color:#fff;font-weight:bold;cursor:pointer}.morg-status{font-size:.75rem;color:#777}
`;
document.head.appendChild(css);

let socket = null;
let currentRequest = null;
let currentBusy = null;

function modal(title, text, buttons) {
  document.querySelector('.morgdoni-request-overlay')?.remove();
  const ov = document.createElement('div');
  ov.className = 'morgdoni-request-overlay';
  const box = document.createElement('div');
  box.className = 'morgdoni-request-box';
  box.innerHTML = `<h2>${title}</h2><p>${text}</p><div class="morgdoni-request-actions"></div>`;
  ov.appendChild(box);
  document.body.appendChild(ov);
  const area = box.querySelector('.morgdoni-request-actions');
  buttons.forEach(b => {
    const x = document.createElement('button');
    x.className = 'morgdoni-request-btn ' + (b.cls || '');
    x.textContent = b.text;
    x.onclick = () => { if (b.keep !== true) ov.remove(); b.click?.(); };
    area.appendChild(x);
  });
  return ov;
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function installSocket(s) {
  if (!s || socket === s) return;
  socket = s;
  s.on('gameRequest', d => {
    currentRequest = d || {};
    modal('📨 درخواست بازی', `${esc(currentRequest.fromName || 'یک بازیکن')} می‌خواهد با شما بازی کند.`, [
      {text:'🎮 قبول', cls:'mrg-green', click:()=>s.emit('acceptGame',{fromId:currentRequest.fromId})},
      {text:'❌ رد کردن', cls:'mrg-red', click:()=>s.emit('rejectGame',{fromId:currentRequest.fromId})}
    ]);
  });
  s.on('busyGameChoice', d => {
    currentBusy = d || {};
    modal('👥 ورود به بازی', `${esc(currentBusy.fromName || 'یک بازیکن')} می‌خواهد وارد بازی فعلی شما شود.`, [
      {text:'🎮 جوین', cls:'mrg-green', click:()=>s.emit('chooseGameOption',{fromId:currentBusy.fromId,option:'join'})},
      {text:'👀 تماشا', cls:'mrg-blue', click:()=>s.emit('chooseGameOption',{fromId:currentBusy.fromId,option:'watch'})},
      {text:'❌ رد کردن', cls:'mrg-red', click:()=>s.emit('rejectGame',{fromId:currentBusy.fromId})}
    ]);
  });
  s.on('gameRejected', d => modal('❌ درخواست رد شد', `${esc(d?.byName || 'بازیکن')} درخواست را رد کرد.`, [{text:'باشه',cls:'mrg-gray'}]));
  s.on('gameRequestError', d => modal('⚠️ خطا', String(d || 'درخواست ارسال نشد'), [{text:'باشه',cls:'mrg-gray'}]));
  s.on('playerListUpdate', list => renderOnline(list || []));
  s.on('registrationSuccess', () => setTimeout(() => s.emit('getPlayerList'), 100));
  s.emit('getPlayerList');
}

function renderOnline(list) {
  let panel = document.getElementById('morgOnlinePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'morgOnlinePanel';
    panel.className = 'morgdoni-request-box';
    panel.style.cssText = 'position:fixed;right:14px;bottom:14px;width:min(430px,94vw);z-index:99990;padding:16px;';
    document.body.appendChild(panel);
  }
  const me = socket?.id;
  const rows = (Array.isArray(list) ? list : []).filter(x => x.id && x.id !== me);
  panel.innerHTML = '<h2>👥 بازیکنان آنلاین</h2><div class="morg-online-list"></div>';
  const wrap = panel.querySelector('.morg-online-list');
  if (!rows.length) { wrap.innerHTML = '<div style="padding:10px;text-align:center">بازیکن دیگری آنلاین نیست</div>'; return; }
  rows.forEach(x => {
    const row = document.createElement('div'); row.className = 'morg-online-row';
    const info = document.createElement('span');
    info.innerHTML = `${esc(x.avatar || '🐔')} ${esc(x.name || 'بازیکن')} <span class="morg-status">(${esc(x.status || 'ready')})</span>`;
    const b = document.createElement('button'); b.textContent = '📨 درخواست بازی';
    b.onclick = () => { if (socket) socket.emit('requestGame', {targetId:x.id}); };
    row.append(info,b); wrap.appendChild(row);
  });
}

function watchSocket() {
  if (window.__MORG_SOCKET__) installSocket(window.__MORG_SOCKET__);
  if (typeof window.io === 'function' && !window.__MORG_IO_REQ_WRAP__) {
    window.__MORG_IO_REQ_WRAP__ = true;
    const old = window.io;
    window.io = function(...args) { const s = old.apply(this,args); window.__MORG_SOCKET__ = s; installSocket(s); return s; };
  }
}

watchSocket();
setInterval(watchSocket, 300);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => paintCards());
else paintCards();
new MutationObserver(mutations => {
  for (const m of mutations) for (const n of m.addedNodes) if (n.nodeType === 1) {
    if (n.matches?.('.card')) paintCards(n.parentNode || document);
    n.querySelectorAll?.('.card').forEach(() => paintCards(n));
  }
}).observe(document.documentElement, {childList:true, subtree:true});

window.MORG_DONI_CARD_IMAGES = CARD_IMAGES;
window.MORG_DONI_REQUEST_FIX = true;
})();
