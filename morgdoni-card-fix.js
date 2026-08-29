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

  const LABEL = {
    'مرغ': 'مرغ',
    'خروس': 'خروس',
    'لانه': 'لانه',
    'روباه': 'روباه',
    'تله': 'تله',
    'مار': 'مار'
  };

  const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

  function cardType(el) {
    const explicit = el.getAttribute('data-card') || el.dataset?.card || '';
    if (MAP[explicit]) return explicit;

    const text = norm(el.textContent);
    for (const k of Object.keys(MAP)) {
      if (text.includes(k)) return k;
    }
    return null;
  }

  function paint(el) {
    if (!(el instanceof HTMLElement) || el.classList.contains('card-back')) return;

    const type = cardType(el);
    if (!type) return;

    const src = MAP[type];
    let img = el.querySelector('img.morgdoni-card-image');

    // نوشته/ایموجی‌های قدیمی داخل کارت را حذف می‌کنیم.
    el.querySelectorAll('span').forEach(s => {
      s.style.display = 'none';
    });

    if (!img) {
      img = document.createElement('img');
      img.className = 'morgdoni-card-image';
      img.draggable = false;
      el.prepend(img);
    }

    img.alt = LABEL[type];
    img.src = src;
    img.setAttribute('aria-hidden', 'true');

    el.setAttribute('data-card', type);
    el.setAttribute('aria-label', LABEL[type]);
  }

  function scan(root = document) {
    root.querySelectorAll('.card').forEach(paint);
  }

  const style = document.createElement('style');
  style.textContent = `
    /* کارت واقعی: صاف، کامل و بدون بریدگی */
    .card {
      position: relative !important;
      overflow: hidden !important;
      transform: none !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      line-height: 0 !important;
    }

    /* مهم: contain باعث می‌شود هیچ بخشی از PNG بریده نشود */
    .card .morgdoni-card-image {
      display: block !important;
      width: 100% !important;
      height: 100% !important;
      max-width: 100% !important;
      max-height: 100% !important;
      object-fit: contain !important;
      object-position: center center !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      border-radius: inherit !important;
      transform: none !important;
      pointer-events: none !important;
      user-select: none !important;
    }

    /* نوشته‌های احتمالی قدیمی روی کارت */
    .card > span {
      display: none !important;
    }

    .card.selected .morgdoni-card-image {
      filter: brightness(1.08) !important;
    }
  `;
  document.head.appendChild(style);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scan(), { once: true });
  } else {
    scan();
  }

  new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches?.('.card')) paint(n);
        n.querySelectorAll?.('.card').forEach(paint);
      }
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true
  });

  window.MORG_DONI_CARD_IMAGES = MAP;
})();
