import multiWorker, { GameRoom as MultiGameRoom } from './worker-multi.js';

const MAX_PLAYERS = 50;
const SHOP_ITEMS = {
  frame_gold:{name:'قاب طلایی',price:500},
  back_chicken:{name:'پشت کارت مرغی',price:350},
  effect_fire:{name:'افکت برد آتشین',price:700},
  avatar_fox:{name:'آواتار روباه',price:250},
  avatar_rooster:{name:'آواتار خروس طلایی',price:400},
  emote_party:{name:'واکنش جشن',price:150}
};
function makeRoomId(rooms) { let rid; do rid=Math.random().toString(36).slice(2,8).toUpperCase(); while(rooms[rid]); return rid; }
function shopProfile(g,id,accountId){
  const online=g.data.online[id];
  if(!online || String(online.accountId)!==String(accountId)) return null;
  const a=g.account(String(accountId),online.name||'بازیکن',online.avatar||'🐔');
  a.coins=Number.isFinite(a.coins)?Math.max(0,a.coins):0;
  a.streak=Number.isFinite(a.streak)?Math.max(0,a.streak):0;
  a.inventory=Array.isArray(a.inventory)?a.inventory:[];
  return a;
}
function publicShop(a){return {coins:a.coins||0,streak:a.streak||0,lastDaily:a.lastDaily||'',inventory:a.inventory||[],today:new Date().toISOString().slice(0,10)};}

export class GameRoom extends MultiGameRoom {
  async message(id, raw) {
    let m; try { m=JSON.parse(raw); } catch { return this.send(id,'error','درخواست نامعتبر است'); }
    const t=m?.type,d=m?.data||{}; await this.ready;

    if(t==='shopGet'){
      const a=shopProfile(this,id,String(d.accountId||''));
      if(!a)return this.send(id,'shopError','حساب بازیکن پیدا نشد');
      return this.send(id,'shopData',publicShop(a));
    }
    if(t==='shopClaimDaily'){
      const a=shopProfile(this,id,String(d.accountId||''));
      if(!a)return this.send(id,'shopError','حساب بازیکن پیدا نشد');
      const today=new Date().toISOString().slice(0,10);
      if(a.lastDaily===today)return this.send(id,'shopResult',{profile:publicShop(a),message:'🎁 جایزه امروز را قبلاً گرفتی'});
      const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
      a.streak=a.lastDaily===yesterday?(a.streak||0)+1:1;
      const reward=100 + Math.min(100,(a.streak-1)*10);
      a.coins=(a.coins||0)+reward; a.lastDaily=today;
      await this.save();
      return this.send(id,'shopResult',{profile:publicShop(a),message:`🎉 ${reward} سکه گرفتی! روز پیاپی: ${a.streak}`});
    }
    if(t==='shopBuy'){
      const a=shopProfile(this,id,String(d.accountId||'')), item=SHOP_ITEMS[String(d.itemId||'')];
      if(!a)return this.send(id,'shopError','حساب بازیکن پیدا نشد');
      if(!item)return this.send(id,'shopError','آیتم پیدا نشد');
      if((a.inventory||[]).includes(String(d.itemId)))return this.send(id,'shopError','این آیتم را قبلاً خریده‌ای');
      if((a.coins||0)<item.price)return this.send(id,'shopError',`سکه کافی نیست؛ ${item.price} سکه لازم است`);
      a.coins-=item.price; a.inventory.push(String(d.itemId));
      await this.save();
      return this.send(id,'shopResult',{profile:publicShop(a),message:`✅ ${item.name} خریداری شد`});
    }

    if(t==='cancelQuickGame'){
      this.data.queue=(this.data.queue||[]).filter(x=>String(x)!==String(id));
      this.data.quickQueue=(this.data.quickQueue||[]).filter(x=>String(x?.id)!==String(id));
      const p=this.data.online[id]; if(p&&p.status==='requesting')p.status='ready';
      this.send(id,'quickGameCancelled'); this.updateList(); await this.save(); return;
    }

    if(t==='quickGame'){
      const p=this.data.online[id]; if(!p)return this.send(id,'quickGameError','بازیکن یافت نشد');
      if(p.status!=='ready'&&p.status!=='requesting')return this.send(id,'quickGameError','ابتدا باید آماده باشید');
      const requested=Math.floor(Number(d.playerCount||d.count||2));
      const count=Math.max(2,Math.min(MAX_PLAYERS,requested||2));
      this.data.quickQueue??=[];
      this.data.quickQueue=this.data.quickQueue.filter(x=>String(x?.id)!==String(id));
      this.data.quickQueue.push({id,count,at:Date.now()}); p.status='requesting';
      const candidates=this.data.quickQueue.filter(x=>x.count===count&&this.data.online[x.id]?.status==='requesting').sort((a,b)=>a.at-b.at);
      if(candidates.length>=count){
        const picked=candidates.slice(0,count), ids=new Set(picked.map(x=>x.id));
        this.data.quickQueue=this.data.quickQueue.filter(x=>!ids.has(x.id));
        const people=picked.map(x=>this.data.online[x.id]).filter(Boolean);
        if(people.length===count){
          const rid=makeRoomId(this.data.rooms);
          const r=this.data.rooms[rid]={host:people[0].id,players:people.map(x=>this.player(x)),watchers:[],gameStarted:false,deck:[],eggTokens:18,currentTurn:null,winner:null,discardPile:[]};
          people.forEach(x=>x.status='playing');
          this.roomBroadcast(r,'quickGameFound',{roomId:rid,playerCount:count,players:r.players,vsSeconds:3});
          this.updateList(); await this.save();
          setTimeout(async()=>{try{await this.ready;if(!this.data.rooms[rid]||this.data.rooms[rid].gameStarted)return;this.startGame(rid);await this.save()}catch(e){console.error('quick VS start',e)}},3000);
          return;
        }
      }
      this.send(id,'quickGameQueued',{playerCount:count,queued:candidates.length}); this.updateList(); await this.save(); return;
    }

    if(t==='acceptGame'){
      const target=this.data.online[id],req=this.data.online[d.fromId];
      if(!target||!req)return this.send(id,'gameError','بازیکن یافت نشد');
      this.data.pending[id]=(this.data.pending[id]||[]).filter(x=>x.fromId!==d.fromId);
      const targetRoom=this.roomOf(id),requesterRoom=this.roomOf(req.id);
      if(targetRoom?.role==='player'){this.send(id,'busyGameChoice',{fromId:req.id,fromName:req.name,roomId:targetRoom.roomId,message:`${req.name} می‌خواهد وارد بازی شما شود`});await this.save();return;}
      if(requesterRoom?.role==='player'){
        const r=requesterRoom.room;r.players??=[];r.watchers??=[];
        if(r.players.some(p=>p.id===id)){target.status=r.gameStarted?'playing':'room';this.send(id,'joinExistingGame',{roomId:requesterRoom.roomId,room:r,mode:'player'});await this.save();return;}
        if(r.players.length>=MAX_PLAYERS)return this.send(id,'gameError','ظرفیت بازی پر است');
        r.watchers=r.watchers.filter(x=>x!==id);const np=this.player(target);
        if(r.gameStarted){for(let i=0;i<4&&r.deck?.length;i++)np.hand.push(r.deck.pop());r.players.push(np);target.status='playing';this.send(id,'joinExistingGame',{roomId:requesterRoom.roomId,room:r,mode:'player'});}else{r.players.push(np);target.status='room';this.send(id,'roomJoined',{roomId:requesterRoom.roomId,playerCount:r.players.length,maxPlayers:MAX_PLAYERS});}
        this.roomBroadcast(r,'roomUpdate',r);this.roomBroadcast(r,'gameState',r);this.updateList();await this.save();return;
      }
      if(!targetRoom&&!requesterRoom){
        const rid=makeRoomId(this.data.rooms);
        const r=this.data.rooms[rid]={host:req.id,players:[this.player(req),this.player(target)],watchers:[],gameStarted:false,deck:[],eggTokens:18,currentTurn:null,winner:null,discardPile:[]};
        req.status='playing'; target.status='playing';
        this.roomBroadcast(r,'friendGameFound',{roomId:rid,playerCount:2,players:r.players,vsSeconds:3});
        this.updateList(); await this.save();
        setTimeout(async()=>{try{await this.ready;if(!this.data.rooms[rid]||this.data.rooms[rid].gameStarted)return;this.startGame(rid);await this.save()}catch(e){console.error('friend VS start',e)}},3000);
        return;
      }
    }
    return super.message(id,raw);
  }
}

const INLINE_VS = String.raw`(()=>{const ROOT='morg-vs-overlay';function style(){if(document.getElementById('morg-vs-css'))return;const s=document.createElement('style');s.id='morg-vs-css';s.textContent='#'+ROOT+'{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 35%,#7b421f,#28150c 55%,#0d0704);color:#fff;direction:rtl;font-family:Tahoma,Arial,sans-serif}#'+ROOT+'.on{display:flex}#'+ROOT+' .wrap{text-align:center;width:95vw}#'+ROOT+' .title{font-size:clamp(30px,5vw,66px);font-weight:1000}#'+ROOT+' .players{display:flex;align-items:center;justify-content:center;gap:20px;flex-wrap:wrap;margin:25px}#'+ROOT+' .player{width:min(220px,25vw);min-width:140px;padding:14px;border:4px solid #e5a43c;border-radius:25px;background:linear-gradient(145deg,#fff3d2,#c87929);color:#3a1908}#'+ROOT+' .avatar{font-size:70px}#'+ROOT+' .name{font-size:24px;font-weight:1000}#'+ROOT+' .vs{font-size:90px;font-weight:1000;color:#ffd23d}#'+ROOT+' .sub{font-size:20px;color:#ffe4b0}.count{display:inline-flex;min-width:46px;height:46px;border-radius:50%;align-items:center;justify-content:center;background:#ffd23d;color:#4b210d}';document.head.appendChild(s)}function sock(){return window.__MORG_SOCKET__||window.socket||null}function show(d){style();let r=document.getElementById(ROOT);if(!r){r=document.createElement('div');r.id=ROOT;r.innerHTML='<main class="wrap"><div class="title">⚔️ آماده‌ی نبرد!</div><div class="players" id="vsPlayers"></div><div class="sub">بازی تا چند لحظه‌ی دیگر شروع می‌شود <span class="count" id="vsCount">3</span></div></main>';document.body.appendChild(r)}const ps=d?.players||d?.room?.players||[];r.querySelector('#vsPlayers').innerHTML=ps.map((p,i)=>'<section class="player"><div class="avatar">'+(p.avatar||'🐔')+'</div><div class="name">'+(p.name||('بازیکن '+(i+1)))+'</div></section>'+(i===0&&ps.length===2?'<div class="vs">VS</div>':'')).join('');r.classList.add('on');let n=3;r.querySelector('#vsCount').textContent=n;clearTimeout(r._t);r._t=setInterval(()=>{n--;r.querySelector('#vsCount').textContent=Math.max(0,n);if(n<=0){clearInterval(r._t);r.classList.remove('on');const s=sock();const rid=d?.roomId||d?.room?.roomId;if(s&&rid)s.emit('getGameState',{roomId:rid})}},1000)}function bind(){const s=sock();if(!s||s.__morgVSBound)return;s.__morgVSBound=true;s.on('quickGameFound',show);s.on('friendGameFound',show)}bind();setInterval(bind,500);window.MorgdoniVS={show}})();`;

export default {async fetch(request,env,ctx){const response=await multiWorker.fetch(request,env,ctx),type=response.headers.get('content-type')||'';if(!type.includes('text/html'))return response;let html=await response.text();html=html.replace(/<script[^>]+(?:quick-game-ui|vs-ui)\.js[^>]*><\/script>/gi,'');const inlineVS='<script id="morgdoni-inline-vs">'+INLINE_VS+'</script>';const bootstrap='<script src="/feature-bootstrap.js?v=2"></script>';const shop='<script src="/daily-shop.js?v=2"></script>';html=html.replace(/<\/body>/i,inlineVS+bootstrap+'<script src="/quick-game-ui.js?v=fix9"></script><script src="/mega-features.js?v=5"></script>'+shop+'</body>');return new Response(html,{status:response.status,headers:new Headers(response.headers)})}};