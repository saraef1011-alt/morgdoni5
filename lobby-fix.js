(()=>{
'use strict';
let lastPlayers=[];
function sock(){return window.__MORG_SOCKET__||window.socket||null}
function me(){const s=sock();return String(window.myId||s?.id||'')}
function sendRequest(id,b){const s=sock();if(!s||!id||String(id)===me())return;s.emit('requestGame',{targetId:String(id)});if(b){b.disabled=true;b.textContent='📨 ارسال شد';setTimeout(()=>{if(b.isConnected){b.disabled=false;b.textContent='🎮 درخواست بازی'}},1400)}}
function panel(){
 let p=document.getElementById('morg-online-panel');
 if(p)return p;
 p=document.createElement('div');p.id='morg-online-panel';
 p.innerHTML='<div id="morg-online-head"><b>👥 بازیکنان آنلاین</b><button id="morg-online-close" type="button">×</button></div><div id="morg-online-list"></div>';
 const st=document.createElement('style');st.id='morg-online-style';st.textContent=`#morg-online-panel{position:fixed;right:12px;top:72px;width:min(330px,calc(100vw - 24px));max-height:70vh;overflow:hidden;background:rgba(20,20,28,.97);color:#fff;border:2px solid #d9a441;border-radius:16px;z-index:2147483000;box-shadow:0 12px 35px rgba(0,0,0,.5);font-family:inherit;direction:rtl}#morg-online-head{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;cursor:move;background:linear-gradient(135deg,#3a2a12,#6d4d19);user-select:none;touch-action:none}#morg-online-close{border:0;background:#b83232;color:#fff;font-size:25px;line-height:30px;width:34px;height:34px;border-radius:9px;cursor:pointer}#morg-online-list{padding:8px;overflow:auto;max-height:calc(70vh - 48px)}.morg-online-row{display:flex;align-items:center;gap:8px;padding:9px;margin:5px 0;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}.morg-online-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.morg-online-status{display:block;font-size:11px;opacity:.7;margin-top:2px}.morg-online-btn{border:0;border-radius:9px;padding:8px 9px;background:#27ae60;color:#fff;font-weight:700;cursor:pointer;white-space:nowrap}.morg-online-btn:disabled{opacity:.65}.morg-online-empty{text-align:center;opacity:.7;padding:18px}`;document.head.appendChild(st);document.body.appendChild(p);
 p.querySelector('#morg-online-close').onclick=()=>{p.style.display='none'};
 makeDrag(p,p.querySelector('#morg-online-head'));
 return p;
}
function makeDrag(el,handle){let sx=0,sy=0,ox=0,oy=0,drag=false;
 handle.addEventListener('pointerdown',e=>{drag=true;handle.setPointerCapture?.(e.pointerId);const r=el.getBoundingClientRect();sx=e.clientX;sy=e.clientY;ox=r.left;oy=r.top;e.preventDefault()});
 handle.addEventListener('pointermove',e=>{if(!drag)return;let x=Math.max(4,Math.min(innerWidth-el.offsetWidth-4,ox+e.clientX-sx));let y=Math.max(4,Math.min(innerHeight-50,oy+e.clientY-sy));el.style.left=x+'px';el.style.top=y+'px';el.style.right='auto';});
 handle.addEventListener('pointerup',()=>drag=false);handle.addEventListener('pointercancel',()=>drag=false);
}
function render(){const p=panel();const list=p.querySelector('#morg-online-list');const others=lastPlayers.filter(x=>x?.id&&String(x.id)!==me());list.innerHTML='';if(!others.length){list.innerHTML='<div class="morg-online-empty">بازیکن آنلاین دیگری نیست</div>';return}others.forEach(x=>{const row=document.createElement('div');row.className='morg-online-row';const av=document.createElement('span');av.textContent=x.avatar||'🐔';const info=document.createElement('div');info.className='morg-online-name';info.innerHTML='<b></b><span class="morg-online-status"></span>';info.querySelector('b').textContent=x.name||'بازیکن';info.querySelector('span').textContent=x.status==='playing'?'در حال بازی':x.status==='room'?'داخل اتاق':x.status==='watching'?'در حال تماشا':'آنلاین';const b=document.createElement('button');b.className='morg-online-btn';b.type='button';b.textContent='🎮 درخواست بازی';b.onclick=e=>{e.stopPropagation();sendRequest(x.id,b)};row.append(av,info,b);list.appendChild(row)})}
function hook(){const s=sock();if(!s)return;if(s.id)window.myId=s.id;if(!s.__morgOnlinePanel){s.__morgOnlinePanel=true;s.on('playerListUpdate',l=>{lastPlayers=Array.isArray(l)?l:[];render()});s.on('connect',()=>setTimeout(()=>{try{s.emit('getPlayerList')}catch(e){}render()},200));s.on('hello',d=>{if(d?.id)window.myId=d.id;render()});s.on('gameRequestSent',()=>render())}if(!document.body)return;render()}
hook();setInterval(hook,1000);window.addEventListener('load',hook);
})();