(()=>{
'use strict';
let lastPlayers=[];
function sock(){return window.__MORG_SOCKET__||window.socket||null}
function me(){const s=sock();return String(window.myId||s?.id||'')}
function request(id,b){const s=sock();if(!s||!id||String(id)===me())return;s.emit('requestGame',{targetId:String(id)});if(b){b.disabled=true;b.textContent='📨 ارسال شد';setTimeout(()=>{if(b.isConnected){b.disabled=false;b.textContent='🎮 درخواست بازی'}},1600)}}
function ensure(){
 const grid=document.getElementById('mrgPlayers');if(!grid)return;
 const others=lastPlayers.filter(p=>p?.id&&String(p.id)!==me());
 const rows=[...grid.querySelectorAll('.mlg-player')];
 rows.forEach((row,i)=>{
  const p=others[i];if(!p)return;
  row.dataset.requestTarget=String(p.id);
  let b=row.querySelector('.morg-force-request');
  if(!b){
   b=document.createElement('button');b.className='mlg-btn mlg-play morg-force-request';b.type='button';b.textContent='🎮 درخواست بازی';
   b.style.cssText='display:block!important;visibility:visible!important;opacity:1!important;min-width:140px;background:#27ae60;color:#fff;z-index:9999;position:relative';
   b.onclick=e=>{e.preventDefault();e.stopPropagation();request(row.dataset.requestTarget,b)};
   let actions=row.querySelector('.mlg-actions');
   if(!actions){actions=document.createElement('div');actions.className='mlg-actions';row.appendChild(actions)}
   actions.appendChild(b);
  }
 }
}
function hook(){
 const s=sock();
 if(s&&!s.__morgForceRequest){
  s.__morgForceRequest=true;
  s.on('playerListUpdate',l=>{lastPlayers=Array.isArray(l)?l:[];setTimeout(ensure,0);setTimeout(ensure,100);});
  s.on('connect',()=>{if(s.id)window.myId=s.id;setTimeout(ensure,100)});
  s.on('hello',d=>{if(d?.id)window.myId=d.id;setTimeout(ensure,100)});
 }
 if(s?.id)window.myId=s.id;
 ensure();
}
hook();setInterval(hook,250);
new MutationObserver(ensure).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{const b=e.target.closest('.morg-force-request');if(b){e.preventDefault();e.stopPropagation();request(b.closest('.mlg-player')?.dataset.requestTarget,b)}},true);
})();