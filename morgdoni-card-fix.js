(() => {
'use strict';

/* =========================================================
   کارت‌های PNG — بدون بریدگی
========================================================= */
const CARD_IMAGES={
 'مرغ':'cards/Hen.png','خروس':'cards/Rooster.png','لانه':'cards/Nest.png',
 'روباه':'cards/Fox.png','تله':'cards/Trap.png','مار':'cards/Snake.png'
};
function paintCards(root=document){
 root.querySelectorAll('.card').forEach(el=>{
  if(el.classList.contains('card-back')) return;
  const text=String(el.textContent||'');
  const type=Object.keys(CARD_IMAGES).find(k=>text.includes(k)||el.dataset.card===k);
  if(!type)return;
  el.dataset.card=type;
  let img=el.querySelector('.morgdoni-card-image');
  if(!img){el.querySelectorAll('span').forEach(x=>x.style.display='none');img=document.createElement('img');img.className='morgdoni-card-image';el.prepend(img)}
  img.src=CARD_IMAGES[type];img.alt='';img.draggable=false;
 }
}
const css=document.createElement('style');css.textContent=`
.card{overflow:hidden!important;position:relative!important}
.card .morgdoni-card-image{width:100%!important;height:100%!important;object-fit:contain!important;display:block!important;pointer-events:none!important;border-radius:inherit!important}
.morgdoni-request-overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(5px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px}
.morgdoni-request-box{width:min(430px,94vw);background:linear-gradient(145deg,#fff8e8,#fbe9ca);border:3px solid #d47a2a;border-radius:35px;padding:28px 22px;text-align:center;box-shadow:0 20px 70px rgba(0,0,0,.55);direction:rtl}
.morgdoni-request-box h2{margin:0 0 12px;color:#a65318;font-size:1.45rem}.morgdoni-request-box p{margin:8px 0 20px;color:#59320f;font-size:1rem}
.morgdoni-request-btn{border:0;border-radius:22px;padding:12px 18px;margin:5px;font-weight:bold;font-size:1rem;cursor:pointer;min-width:105px}.mrg-green{background:#27ae60;color:white}.mrg-blue{background:#3498db;color:white}.mrg-red{background:#c0392b;color:white}.mrg-gray{background:#7f8c8d;color:white}
`;document.head.appendChild(css);

let socket=null,currentRequest=null,currentBusy=null;
function modal(title,text,buttons){
 document.querySelector('.morgdoni-request-overlay')?.remove();
 const ov=document.createElement('div');ov.className='morgdoni-request-overlay';
 const box=document.createElement('div');box.className='morgdoni-request-box';
 box.innerHTML=`<h2>${title}</h2><p>${text}</p><div class="morgdoni-request-actions"></div>`;ov.appendChild(box);document.body.appendChild(ov);
 const area=box.querySelector('.morgdoni-request-actions');
 buttons.forEach(b=>{const x=document.createElement('button');x.className='morgdoni-request-btn '+(b.cls||'');x.textContent=b.text;x.onclick=()=>{ov.remove();b.click?.()};area.appendChild(x)});
 return ov;
}
function getRoomId(){
 const ids=['roomCodeSpan','roomCodeTop','roomCode','currentRoomId'];
 for(const id of ids){const e=document.getElementById(id);const v=String(e?.textContent||e?.value||'').trim();if(v&&/[A-Z0-9]{4,}/i.test(v))return v.match(/[A-Z0-9]{4,}/i)?.[0]?.toUpperCase()||v.toUpperCase()}
 return window.currentRoomId||window.roomId||null;
}
function installSocket(s){
 if(!s||socket===s)return;
 socket=s;
 s.on('gameRequest',d=>{
   currentRequest=d||{};
   modal('📨 درخواست بازی',`${currentRequest.fromName||'یک بازیکن'} می‌خواهد با شما بازی کند.`,[
    {text:'🎮 بازی',cls:'mrg-green',click:()=>s.emit('acceptGame',{fromId:currentRequest.fromId})},
    {text:'❌ رد کردن',cls:'mrg-red',click:()=>s.emit('rejectGame',{fromId:currentRequest.fromId})}
   ]);
 });
 s.on('busyGameChoice',d=>{
   currentBusy=d||{};
   modal('👥 درخواست ورود به بازی',`${currentBusy.fromName||'یک بازیکن'} می‌خواهد وارد بازی فعلی شما شود.`,[
    {text:'🎮 جوین',cls:'mrg-green',click:()=>s.emit('chooseGameOption',{fromId:currentBusy.fromId,option:'join'})},
    {text:'👀 تماشا',cls:'mrg-blue',click:()=>s.emit('chooseGameOption',{fromId:currentBusy.fromId,option:'watch'})},
    {text:'❌ رد کردن',cls:'mrg-red',click:()=>s.emit('rejectGame',{fromId:currentBusy.fromId})}
   ]);
 });
 s.on('gameRejected',d=>modal('❌ درخواست رد شد',`${d?.byName||'بازیکن'} درخواست را رد کرد.`,[{text:'باشه',cls:'mrg-gray'}]));
 s.on('gameRequestError',d=>modal('⚠️ خطا',String(d||'درخواست ارسال نشد'),[{text:'باشه',cls:'mrg-gray'}]));
}

/* گرفتن همان socket برنامه، حتی اگر بعداً ساخته شود */
function watchSocket(){
 if(window.__MORG_SOCKET__)installSocket(window.__MORG_SOCKET__);
 if(typeof window.io==='function'&&!window.__MORG_IO_REQ_WRAP__){
  window.__MORG_IO_REQ_WRAP__=true;
  const old=window.io;
  window.io=function(...args){const s=old.apply(this,args);window.__MORG_SOCKET__=s;installSocket(s);return s};
 }
}
watchSocket();setInterval(watchSocket,300);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>paintCards());else paintCards();
new MutationObserver(m=>{for(const x of m)for(const n of x.addedNodes)if(n.nodeType===1){if(n.matches?.('.card'))paintCards(n.parentNode||document);n.querySelectorAll?.('.card').forEach(()=>paintCards(n))}}).observe(document.documentElement,{childList:true,subtree:true});
window.MORG_DONI_CARD_IMAGES=CARD_IMAGES;
window.MORG_DONI_REQUEST_FIX=true;
})();
