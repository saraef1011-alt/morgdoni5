export class GameRoom {
  constructor(state) { this.state = state; this.sessions = new Map(); }
  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket endpoint', {status:426});
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair); server.accept();
    const id = crypto.randomUUID(); this.sessions.set(id, server);
    server.send(JSON.stringify({type:'connected', id}));
    server.addEventListener('message', async e => { try { await this.onMessage(id, JSON.parse(e.data)); } catch (_) { this.send(server,{type:'error',text:'درخواست نامعتبر'}); } });
    server.addEventListener('close', () => { this.sessions.delete(id); });
    return new Response(null,{status:101,webSocket:client});
  }
  send(ws,obj){ if(ws.readyState===1) ws.send(JSON.stringify(obj)); }
  broadcast(obj){ for(const ws of this.sessions.values()) this.send(ws,obj); }
  async onMessage(id,m){
    let room = (await this.state.storage.get('room')) || {players:[],deck:[],hands:{},turn:0,started:false};
    const me = room.players.find(p=>p.id===id);
    if(m.type==='create'){
      if(room.players.length) return this.send(this.sessions.get(id),{type:'error',text:'این اتاق قبلاً ساخته شده'});
      room.players.push({id,name:String(m.name||'بازیکن').slice(0,30)}); room.hands[id]=[]; room.deck=deck();
      await this.state.storage.put('room',room); return this.sync(room);
    }
    if(m.type==='join'){
      if(room.players.length>=2) return this.send(this.sessions.get(id),{type:'error',text:'اتاق پر است'});
      room.players.push({id,name:String(m.name||'بازیکن').slice(0,30)}); room.hands[id]=[];
      if(room.players.length===2){room.started=true;room.turn=0;for(const p of room.players)for(let i=0;i<5;i++)room.hands[p.id].push(room.deck.pop());}
      await this.state.storage.put('room',room); return this.sync(room);
    }
    if(!me) return this.send(this.sessions.get(id),{type:'error',text:'ابتدا وارد اتاق شوید'});
    if(m.type==='action'){
      if(!room.started) return this.send(this.sessions.get(id),{type:'error',text:'منتظر بازیکن دوم باشید'});
      if(room.players[room.turn]?.id!==id) return this.send(this.sessions.get(id),{type:'error',text:'نوبت شما نیست'});
      if(m.action==='draw' && room.deck.length) room.hands[id].push(room.deck.pop());
      else if(m.action==='playCard'){const i=Number(m.index);if(Number.isInteger(i)&&i>=0&&i<room.hands[id].length){const c=room.hands[id].splice(i,1)[0];this.broadcast({type:'message',text:me.name+' کارت '+c+' را بازی کرد'});}}
      else if(m.action==='endTurn') room.turn=(room.turn+1)%room.players.length;
      await this.state.storage.put('room',room); return this.sync(room);
    }
  }
  sync(room){for(const [id,ws] of this.sessions){this.send(ws,{type:'state',state:{players:room.players,currentPlayer:room.players[room.turn]?.name||'',started:room.started,hand:room.hands[id]||[]}})}}
}
function deck(){const a=[];for(const [t,n] of [['chicken',21],['rooster',21],['nest',12],['fox',7],['trap',3],['snake',2]])for(let i=0;i<n;i++)a.push(t);for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/healthz')return new Response('ok');if(url.pathname==='/ws')return env.GAME_ROOM.get(env.GAME_ROOM.idFromName('main')).fetch(request);return env.ASSETS.fetch(request)}};
