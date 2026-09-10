(()=>{
'use strict';
const KEY='md_accountId';
function sock(){return window.__MORG_SOCKET__||window.socket||null}
function aid(){const s=sock();return String(localStorage.getItem(KEY)||s?.id||'')}
function say(t){const e=document.getElementById('md-msg');if(e)e.textContent=t||''}
function profile(){return window.__MORG_SHOP_PROFILE__||{coins:0,inventory:[]}}
function apply(p){p=p||profile();window.__MORG_SHOP_PROFILE__=p;try{localStorage.setItem('md_shop_inventory',JSON.stringify(p.inventory||[]));localStorage.setItem('md_shop_coins',String(p.coins||0))}catch{};const inv=p.inventory||[];document.documentElement.classList.toggle('md-owned-gold',inv.includes('frame_gold'));document.documentElement.classList.toggle('md-owned-cardback',inv.includes('back_chicken'));window.MorgdoniShopInventory=inv;window.dispatchEvent(new CustomEvent('morgdoni:inventory',{detail:p}));
let st=document.getElementById('md-shop-effects');if(!st){st=document.createElement('style');st.id='md-shop-effects';document.head.appendChild(st)}st.textContent='.md-owned-gold .avatar,.md-owned-gold [class*="avatar"]{filter:drop-shadow(0 0 5px #ffd24a);outline:3px solid #f5b642;border-radius:50%}.md-owned-cardback .game-card,.md-owned-cardback [data-card]{background-image:linear-gradient(135deg,#fff3b0,#e58b2b)!important}';}
function refresh(){const s=sock();if(!s){say('❌ اتصال به سرور برقرار نیست');return false}s.emit('shopGet',{accountId:aid()});return true}
function claim(e){e?.preventDefault();e?.stopImmediatePropagation();const s=sock();if(!s)return say('❌ اتصال به سرور برقرار نیست');s.emit('shopClaimDaily',{accountId:aid()});say('⏳ در حال دریافت جایزه...');return false}
function buy(id,e){e?.preventDefault();e?.stopImmediatePropagation();const s=sock();if(!s)return say('❌ اتصال به سرور برقرار نیست');s.emit('shopBuy',{accountId:aid(),itemId:String(id)});say('⏳ در حال خرید...');return false}
function render(p){if(!p)return;window.__MORG_SHOP_PROFILE__=p;apply(p);const c=document.getElementById('md-coins');if(c)c.textContent=Number(p.coins||0).toLocaleString('fa-IR');const today=p.today||new Date().toISOString().slice(0,10);const b=document.getElementById('md-claim');if(b){b.disabled=p.lastDaily===today;b.textContent=p.lastDaily===today?'✅ جایزه امروز دریافت شد':'🎁 دریافت ۱۰۰ سکه'}document.querySelectorAll('#md-items .buy').forEach(b=>{const own=(p.inventory||[]).includes(b.dataset.buy);b.disabled=own;b.textContent=own?'✅ خریداری شده':'خرید';});}
function bind(){const s=sock();if(!s)return false;if(s.__mdShopFix)return true;s.__mdShopFix=true;s.on('shopData',render);s.on('shopResult',d=>{render(d?.profile);say(d?.message||'');setTimeout(refresh,100)});s.on('shopError',e=>say('❌ '+(e||'خطا در فروشگاه')));s.on('connect',refresh);document.addEventListener('click',e=>{const claimBtn=e.target.closest('#md-claim');if(claimBtn){claim(e);return}const buyBtn=e.target.closest('#md-items [data-buy]');if(buyBtn){buy(buyBtn.dataset.buy,e);return}},true);refresh();return true}
function open(){const o=document.getElementById('md-shop');if(o)o.classList.add('on');bind();refresh()}
window.MorgShopFix={open,claim,buy,refresh,apply};
let n=0;const timer=setInterval(()=>{bind();if(++n>120)clearInterval(timer)},250);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bind();apply(profile())});else{bind();apply(profile())}
})();