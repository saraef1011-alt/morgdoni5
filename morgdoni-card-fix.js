(() => {
  'use strict';
  const MAP = {
    'مرغ': 'cards/Hen.png',
    'خروس': 'cards/Rooster.png',
    'لانه': 'cards/Nest.png',
    'روباه': 'cards/Fox.png',
    'تله': 'cards/Trap.png',
    'مار': 'cards/Snake.png'
  };
  const LABEL = { 'مرغ':'مرغ','خروس':'خروس','لانه':'لانه','روباه':'روباه','تله':'تله','مار':'مار' };
  const norm = s => String(s || '').replace(/\s+/g,' ').trim();
  function cardType(el) {
    const explicit = el.getAttribute('data-card') || el.dataset?.card || '';
    if (MAP[explicit]) return explicit;
    const text = norm(el.textContent);
    for (const k of Object.keys(MAP)) if (text.includes(k)) return k;
    return null;
  }
  function paint(el) {
    if (!(el instanceof HTMLElement) || el.classList.contains('card-back')) return;
    const type = cardType(el); if (!type) return;
    const src = MAP[type];
    let img = el.querySelector('img.morgdoni-card-image');
    if (!img) {
      el.querySelectorAll('span').forEach(s => { s.style.display='none'; });
      img = document.createElement('img');
      img.className='morgdoni-card-image';
      img.alt = LABEL[type];
      img.draggable = false;
      el.prepend(img);
    }
    if (img.getAttribute('src') !== src) img.src = src;
    el.setAttribute('data-card', type);
    el.setAttribute('aria-label', LABEL[type]);
  }
  function scan(root=document) {
    root.querySelectorAll('.card').forEach(paint);
  }
  const style = document.createElement('style');
  style.textContent = `
    .card { overflow:hidden !important; position:relative !important; }
    .card .morgdoni-card-image { width:100% !important; height:100% !important; object-fit:cover !important; display:block !important; pointer-events:none !important; border-radius:inherit !important; }
    .card.selected .morgdoni-card-image { filter:brightness(1.08) !important; }
  `;
  document.head.appendChild(style);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan()); else scan();
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches?.('.card')) paint(n);
      n.querySelectorAll?.('.card').forEach(paint);
    }
  }).observe(document.documentElement, {subtree:true, childList:true});
  window.MORG_DONI_CARD_IMAGES = MAP;
})();
