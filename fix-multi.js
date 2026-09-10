import multiWorker, { GameRoom as MultiGameRoom } from './worker-multi.js';

const MAX_PLAYERS = 50;
const SHOP_ITEMS = { frame_gold:{name:'قاب طلایی',price:500}, back_chicken:{name:'پشت کارت مرغی',price:350}, effect_fire:{name:'افکت برد آتشین',price:700}, avatar_fox:{name:'آواتار روباه',price:250}, avatar_rooster:{name:'آواتار خروس طلایی',price:400}, emote_party:{name:'واکنش جشن',price:150} };
function makeRoomId(rooms) { let rid; do rid=Math.random().toString(36).slice(2,8).toUpperCase(); while(rooms[rid]); return rid; }

// Shop identity fix: the browser may not have md_accountId yet. Always bind the
// shop to the authenticated WebSocket player first, then use the supplied id only
// when it matches that player's account.
function shopProfile(g,id,requestedAccountId){
  const online=g.data.online[id];
  if(!online) return null;
  const ownId=String(online.accountId||id);
  const wanted=String(requestedAccountId||ownId);
  if(wanted!==ownId && wanted!==String(id)) return null;
  const a=g.account(ownId,online.name||'بازیکن',online.avatar||'🐔');
  a.coins=Number.isFinite(Number(a.coins))?Math.max(0,Number(a.coins)):0;
  a.streak=Number.isFinite(Number(a.streak))?Math.max(0,Number(a.streak)):0;
  a.inventory=Array.isArray(a.inventory)?a.inventory:[];
  return a;
}
function publicShop(a){return {coins:a.coins||0,streak:a.streak||0,lastDaily:a.lastDaily||'',inventory:a.inventory||[],today:new Date().toISOString().slice(0,10)};}

export class GameRoom extends MultiGameRoom {
  async message(id,raw){
    let m;try{m=JSON.parse(raw)}catch{return this.send(id,'error','درخواست نامعتبر است')}
    const t=m?.type,d=m?.data||{};await this.ready;
    if(t==='shopGet'){
      const a=shopProfile(this,id,d.accountId);
      if(!a)return this.send(id,'shopError','حساب بازیکن پیدا نشد؛ دوباره وارد بازی شو');
      return this.send(id,'shopData',publicShop(a));
    }
    if(t==='shopClaimDaily'){
      const a=shopProfile(this,id,d.accountId);
      if(!a)return this.send(id,'shopError','حساب بازیکن پیدا نشد؛ دوباره وارد بازی شو');
      const today=new Date().toISOString().slice(0,10);
      if(a.lastDaily===today)return this.send(id,'shopResult',{profile:publicShop(a),message:'🎁 جایزه امروز را قبلاً گرفتی'});
      const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
      a.streak=a.lastDaily===yesterday?(a.streak||0)+1:1;
      const reward=100+Math.min(100,(a.streak-1)*10);
      a.coins=(Number(a.coins)||0)+reward;
      a.lastDaily=today;
      await this.save();
      return this.send(id,'shopResult',{profile:publicShop(a),message:`🎉 ${reward} سکه گرفتی! روز پیاپی: ${a.streak}`});
    }
    if(t==='shopBuy'){
      const a=shopProfile(this,id,d.accountId),item=SHOP_ITEMS[String(d.itemId||'')];
      if(!a)return this.send(id,'shopError','حساب بازیکن پیدا نشد؛ دوباره وارد بازی شو');
      if(!item)return this.send(id,'shopError','آیتم پیدا نشد');
      if((a.inventory||[]).includes(String(d.itemId)))return this.send(id,'shopError','این آیتم را قبلاً خریده‌ای');
      if((Number(a.coins)||0)<item.price)return this.send(id,'shopError',`سکه کافی نیست؛ ${item.price} سکه لازم است`);
      a.coins=(Number(a.coins)||0)-item.price;
      a.inventory.push(String(d.itemId));
      await this.save();
      return this.send(id,'shopResult',{profile:publicShop(a),message:`✅ ${item.name} خریداری شد`});
    }
    return super.message(id,raw);
  }
}

const INLINE_VS=String.raw`(()=>{const ROOT='morg-vs-overlay';function style(){if(document.getElementById('morg-vs-css'))return;const s=document.createElement('style');s.id='morg-vs-css';s.textContent='#'+ROOT+'{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 35%,#7b421f,#28150c 55%,#0d0704);color:#fff;direction:rtl;font-family:Tahoma,Arial,sans-serif}#'+ROOT+'.on{display:flex}#'+ROOT+' .wrap{text-align:center;width:95vw}#'+ROOT+' .title{font-size:clamp(30px,5vw,66px);font-weight:1000}#'+ROOT+' .players{display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;margin:25px}#'+ROOT+' .player{width:min(220px,25vw);min-width:140px;padding:14px;border:4px solid #e5a43c;border-radius:25px;background:linear-gradient(145deg,#fff3d2,#c87929);color:#3a1908}#'+ROOT+' .avatar{font-size:70px}#'+ROOT+' .name{font-size:24px;font-weight:1000}#'+ROOT+' .vs{font-size:90px;font-weight:1000;color:#ffd23d}#'+ROOT+' .sub{font-size:20px;color:#ffe4b0}.count{display:inline-flex;min-width:46px;height:46px;border-radius:50%;align-items:center;justify-content:center;background:#ffd23d;color:#4b210d}';document.head.appendChild(s)}function sock(){return window.__MORG_SOCKET__||window.socket||null}function show(d){style();let r=document.getElementById(ROOT);if(!r){r=document.createElement('div');r.id=ROOT;r.innerHTML='<main class="wrap"><div class="title">⚔️ آماده‌ی نبرد!</div><div class="players" id="vsPlayers"></div><div class="sub">بازی تا چند لحظه‌ی دیگر شروع می‌شود <span class="count" id="vsCount">3</span></div></main>';document.body.appendChild(r)}const ps=d?.players||d?.room?.players||[];r.querySelector('#vsPlayers').innerHTML=ps.map((p,i)=>'<section class="player"><div class="avatar">'+(p.avatar||'🐔')+'</div><div class="name">'+(p.name||('بازیکن '+(i+1)))+'</div></section>'+(i===0&&ps.length===2?'<div class="vs">VS</div>':'')).join('');r.classList.add('on');let n=3;r.querySelector('#vsCount').textContent=n;clearTimeout(r._t);r._t=setInterval(()=>{n--;r.querySelector('#vsCount').textContent=Math.max(0,n);if(n<=0){clearInterval(r._t);r.classList.remove('on');const s=sock();const rid=d?.roomId||d?.room?.roomId;if(s&&rid)s.emit('getGameState',{roomId:rid})}},1000)}function bind(){const s=sock();if(!s||s.__morgVSBound)return;s.__morgVSBound=true;s.on('quickGameFound',show);s.on('friendGameFound',show)}bind();setInterval(bind,500);window.MorgdoniVS={show}})();`;
export default {async fetch(request,env,ctx){const response=await multiWorker.fetch(request,env,ctx),type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=await response.text();html=html.replace(/<script[^>]+(?:quick-game-ui|vs-ui)\.js[^>]*><\/script>/gi,'');const inlineVS='<script id="morgdoni-inline-vs">'+INLINE_VS+'</script>';const bootstrap='<script src="/feature-bootstrap.js?v=2"></script>';html=html.replace(/<\/body>/i,inlineVS+bootstrap+'<script src="/quick-game-ui.js?v=fix9"></script><script src="/mega-features.js?v=7"></script><script src="/daily-shop.js?v=6"></script><script src="/shop-fix.js?v=2"></script></body>');return new Response(html,{status:response.status,headers:new Headers(response.headers)})}};