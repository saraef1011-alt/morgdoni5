import multiWorker, { GameRoom as MultiGameRoom } from './worker-multi.js';

const MAX_PLAYERS = 50;
function makeRoomId(rooms) { let rid; do rid=Math.random().toString(36).slice(2,8).toUpperCase(); while(rooms[rid]); return rid; }

export class GameRoom extends MultiGameRoom {
  async message(id, raw) {
    let m; try { m=JSON.parse(raw); } catch { return this.send(id,'error','درخواست نامعتبر است'); }
    const t=m?.type,d=m?.data||{}; await this.ready;

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
          this.roomBroadcast(r,'quickGameFound',{roomId:rid,playerCount:count,players:r.players,vsSeconds:5});
          this.updateList(); await this.save();
          setTimeout(async()=>{try{await this.ready;if(!this.data.rooms[rid]||this.data.rooms[rid].gameStarted)return;this.startGame(rid);await this.save()}catch(e){console.error('quick VS start',e)}},8500);
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
        this.roomBroadcast(r,'friendGameFound',{roomId:rid,playerCount:2,players:r.players,vsSeconds:5});
        this.updateList(); await this.save();
        setTimeout(async()=>{try{await this.ready;if(!this.data.rooms[rid]||this.data.rooms[rid].gameStarted)return;this.startGame(rid);await this.save()}catch(e){console.error('friend VS start',e)}},5200);
        return;
      }
    }
    return super.message(id,raw);
  }
}

const INLINE_VS = String.raw`(()=>{
'use strict';
const ROOT='morg-vs-overlay',STYLE='morg-vs-css',AUDIO='morg-vs-audio';let active=false,timer=null,lastRoom=null,socketRef=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
function sock(){const s=window.__MORG_SOCKET__||window.socket||socketRef;if(s){socketRef=s;return s}return null}
function style(){if(document.getElementById(STYLE))return;const s=document.createElement('style');s.id=STYLE;s.textContent=\`#${ROOT}{position:fixed;inset:0;z-index:2147483646;display:none;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(circle at 50% 35%,#7b421f,#28150c 55%,#0d0704);color:#fff;direction:rtl;font-family:Tahoma,Arial,sans-serif}#${ROOT}.on{display:flex;animation:vsin .35s ease-out}#${ROOT} .wood{position:absolute;inset:0;opacity:.2;background:repeating-linear-gradient(8deg,transparent 0 22px,#d58b42 23px 25px,transparent 26px 49px)}#${ROOT} .wrap{position:relative;width:min(1350px,95vw);max-height:94vh;text-align:center;z-index:1}#${ROOT} .title{font-size:clamp(30px,5vw,66px);font-weight:1000;text-shadow:0 6px 0 #4b210d,0 12px 28px #000;margin-bottom:20px}#${ROOT} .players{display:flex;align-items:center;justify-content:center;gap:clamp(8px,2vw,30px);flex-wrap:wrap;max-height:67vh;overflow:auto;padding:8px}#${ROOT} .player{width:min(220px,25vw);min-width:140px;padding:14px 10px;border:4px solid #e5a43c;border-radius:25px;background:linear-gradient(145deg,#fff3d2,#c87929);color:#3a1908;box-shadow:0 18px 45px #0009;animation:vspop .55s ease both}#${ROOT} .avatar{width:clamp(90px,10vw,135px);height:clamp(90px,10vw,135px);margin:auto;border-radius:50%;display:grid;place-items:center;font-size:clamp(48px,6vw,72px);background:#f9d27a;border:6px solid #fff0ba}#${ROOT} .name{font-size:clamp(17px,2.2vw,28px);font-weight:1000;margin-top:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#${ROOT} .badge{display:inline-block;margin-top:6px;padding:5px 11px;border-radius:20px;background:#6e3214;color:#ffe8b0;font-weight:900;font-size:12px}#${ROOT} .vs{font-size:clamp(55px,9vw,115px);font-weight:1000;font-style:italic;color:#ffd23d;text-shadow:0 7px 0 #8c2b12,0 12px 28px #000;animation:vspulse 1s infinite alternate}#${ROOT} .sub{margin-top:18px;font-size:clamp(16px,2vw,22px);color:#ffe4b0;font-weight:900}#${ROOT} .count{display:inline-flex;margin-right:8px;min-width:46px;height:46px;border-radius:50%;align-items:center;justify-content:center;background:#ffd23d;color:#4b210d;font-size:22px;font-weight:1000;box-shadow:0 5px 0 #9b5b10}#${ROOT} .skip{margin-top:16px;border:0;border-radius:16px;padding:11px 25px;background:#27ae60;color:#fff;font-weight:900;font-size:16px;cursor:pointer;box-shadow:0 5px 0 #126331}#${ROOT} .music{position:fixed;top:16px;left:16px;width:48px;height:48px;border:2px solid #f4c66b;border-radius:50%;background:#432310;color:#fff;font-size:20px;cursor:pointer;z-index:3}@keyframes vsin{from{opacity:0}to{opacity:1}}@keyframes vspop{from{opacity:0;transform:translateY(35px) scale(.75)}to{opacity:1;transform:none}}@keyframes vspulse{to{transform:scale(1.08) rotate(-5deg)}}@media(max-width:650px){#${ROOT} .player{width:42vw;min-width:130px;padding:9px 6px}#${ROOT} .players{gap:7px;max-height:70vh}}\`;document.head.appendChild(s)}
function root(){style();let r=document.getElementById(ROOT);if(r)return r;r=document.createElement('div');r.id=ROOT;r.innerHTML='<div class="wood"></div><main class="wrap"><div class="title">⚔️ آماده‌ی نبرد!</div><div class="players" id="vsPlayers"></div><div class="sub">بازی تا چند لحظه‌ی دیگر شروع می‌شود <span class="count" id="vsCount">5</span></div><button class="skip" id="vsSkip">🎮 ورود به بازی</button></main><button class="music" id="vsMusic">🔊</button>';document.body.appendChild(r);const a=document.createElement('audio');a.id=AUDIO;a.src='/audio/vs.mp3';a.loop=true;a.preload='auto';r.appendChild(a);r.querySelector('#vsMusic').onclick=()=>{if(a.paused){a.play().catch(()=>{});r.querySelector('#vsMusic').textContent='🔊'}else{a.pause();r.querySelector('#vsMusic').textContent='🔇'}};r.querySelector('#vsSkip').onclick=finish;return r}
function playersOf(d){const p=d?.players||d?.room?.players||d?.data?.players;return Array.isArray(p)?p.filter(Boolean):[]}
function show(d){const ps=playersOf(d),count=Math.max(2,Number(d?.playerCount)||ps.length||2);lastRoom=d?.roomId||d?.room?.roomId||lastRoom;if(ps.length<2){if(count<2)return;return render(Array.from({length:count},(_,i)=>({name:'بازیکن '+(i+1),avatar:i===0?'🐔':'🐓'})),count)}render(ps,count)}
function render(ps,count){const r=root(),box=r.querySelector('#vsPlayers');box.innerHTML='';ps.forEach((p,i)=>{const c=document.createElement('section');c.className='player';c.style.animationDelay=(i*.07)+'s';c.innerHTML='<div class="avatar">'+esc(p.avatar||'🐔')+'</div><div class="name">'+esc(p.name||('بازیکن '+(i+1)))+'</div><div class="badge">'+(i===0?'بازیکن اول':'بازیکن')+'</div>';box.appendChild(c);if(i===0&&ps.length===2){const v=document.createElement('div');v.className='vs';v.textContent='VS';box.appendChild(v)}});r.querySelector('#vsCount').textContent='5';r.classList.add('on');active=true;const a=r.querySelector('#'+AUDIO);a.play().catch(()=>{});clearTimeout(timer);let n=5;const el=r.querySelector('#vsCount');const iv=setInterval(()=>{if(!active){clearInterval(iv);return}n--;el.textContent=Math.max(0,n);if(n<=0)clearInterval(iv)},1000);timer=setTimeout(finish,5200)}
function finish(){clearTimeout(timer);active=false;document.getElementById(ROOT)?.classList.remove('on');const s=sock();if(lastRoom){sessionStorage.setItem('morgdoniRoom',lastRoom);if(s)s.emit('getGameState',{roomId:lastRoom});const u=new URL(location.href);if(!u.searchParams.get('room')){u.searchParams.set('room',lastRoom);history.replaceState({},'',u)}}}
function bind(){const s=sock();if(!s||s.__morgVSBound)return;s.__morgVSBound=true;s.on('quickGameFound',d=>{lastRoom=d?.roomId||lastRoom;show(d);setTimeout(()=>{const x=sock();if(x&&lastRoom)x.emit('getGameState',{roomId:lastRoom})},80)});s.on('friendGameFound',d=>{lastRoom=d?.roomId||lastRoom;show(d);setTimeout(()=>{const x=sock();if(x&&lastRoom)x.emit('getGameState',{roomId:lastRoom})},80)});s.on('gameStarted',d=>{if(d?.roomId){lastRoom=d.roomId;const x=sock();if(x)x.emit('getGameState',{roomId:lastRoom})}});s.on('gameState',d=>{const rid=d?.roomId||d?.room?.roomId;if(rid&&(!active||rid===lastRoom))show(d)});s.on('joinExistingGame',d=>{if(d?.room){lastRoom=d.roomId||d.room.roomId;show(d.room)}})}
bind();setInterval(bind,350);window.MorgdoniVS={show,hide:finish};
})();`;

export default {async fetch(request,env,ctx){
  const response=await multiWorker.fetch(request,env,ctx),type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  let html=await response.text();
  html=html.replace(/<script[^>]+(?:quick-game-ui|vs-ui)\.js[^>]*><\/script>/gi,'');
  const inlineVS='<script id="morgdoni-inline-vs">'+INLINE_VS+'</script>';
  const bootstrap='<script src="/feature-bootstrap.js?v=1"></script>';
  html=html.replace(/<\/body>/i,inlineVS+bootstrap+'<script src="/quick-game-ui.js?v=fix8"></script><script src="/mega-features.js?v=3"></script></body>');
  return new Response(html,{status:response.status,headers:new Headers(response.headers)});
}};
