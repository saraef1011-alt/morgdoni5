import { GameRoom as BaseGameRoom } from './worker.js';

export class GameRoom extends BaseGameRoom {
  async message(id, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return this.send(id, 'error', 'درخواست نامعتبر است'); }
    const t = m?.type, d = m?.data || {};
    if (t === 'joinRoom') {
      await this.ready;
      const rid = String(d.roomId || '').toUpperCase();
      const r = this.data.rooms[rid];
      if (!r) return this.send(id, 'roomError', 'اتاق پیدا نشد');
      const online = this.data.online;
      const existing = this.roomOf(id);
      if (existing) {
        if (existing.roomId === rid) return this.send(id, 'joinExistingGame', { roomId: rid, room: r, mode: existing.role === 'watcher' ? 'watcher' : 'player' });
        return this.send(id, 'roomError', 'ابتدا از اتاق فعلی خارج شوید');
      }
      const p = online[id] || { id, name: String(d.playerName || 'بازیکن').slice(0, 20), accountId: id, avatar: '🐔' };
      online[id] ??= p;
      const np = this.player(p);
      if (r.gameStarted) {
        for (let i = 0; i < 4 && r.deck.length; i++) np.hand.push(r.deck.pop());
        r.players.push(np); online[id].status = 'playing';
        this.send(id, 'joinExistingGame', { roomId: rid, room: r, mode: 'player' });
      } else {
        r.players.push(np); online[id].status = 'room';
        this.send(id, 'roomJoined', { roomId: rid });
      }
      this.roomBroadcast(r, 'roomUpdate', r);
      this.roomBroadcast(r, 'gameState', r);
      this.updateList();
      await this.save();
      return;
    }
    return super.message(id, raw);
  }
}

const SOCKET_SHIM = `class MorgdoniSocket{constructor(){this.events={};this.id=null;this.queue=[];const p=location.protocol==='https:'?'wss:':'ws:';this.ws=new WebSocket(p+'//'+location.host+'/ws');this.ws.onopen=()=>{this.id=this.ws.url;this.emitLocal('connect');for(const m of this.queue)this.ws.send(m);this.queue=[]};this.ws.onmessage=e=>{try{const m=JSON.parse(e.data);if(m?.type)this.emitLocal(m.type,m.data)}catch(x){console.error(x)}};this.ws.onclose=()=>this.emitLocal('disconnect');this.ws.onerror=e=>this.emitLocal('connect_error',e)}on(e,c){(this.events[e]??=[]).push(c);return this}once(e,c){const f=d=>{this.off(e,f);c(d)};return this.on(e,f)}off(e,c){this.events[e]=(this.events[e]||[]).filter(x=>x!==c);return this}emit(e,d){const m=JSON.stringify({type:e,data:d??null});if(this.ws.readyState===1)this.ws.send(m);else this.queue.push(m);return this}emitLocal(e,d){for(const c of this.events[e]||[])try{c(d)}catch(x){console.error(x)}}disconnect(){this.ws?.close()}}window.io=window.io||function(){const s=new MorgdoniSocket();window.__MORG_SOCKET__=s;return s};`;

export default {
  async fetch(request, env) {
    const u = new URL(request.url);
    if (u.pathname === '/healthz') return new Response('ok');
    if (u.pathname === '/socket.io/socket.io.js') return new Response(SOCKET_SHIM, { headers: { 'content-type': 'application/javascript;charset=utf-8', 'cache-control': 'no-store' } });
    if (u.pathname === '/ws') return env.GAME_ROOM.get(env.GAME_ROOM.idFromName('morgdoni-lobby')).fetch(request);
    const response = await env.ASSETS.fetch(request);
    if (response.status === 404) return new Response('Not Found', { status: 404 });
    const type = response.headers.get('content-type') || '';
    if (u.pathname === '/' || u.pathname === '/index.html' || type.includes('text/html')) {
      let html = await response.text();
      if (!/morgdoni-card-fix\.js/i.test(html)) html = html.replace(/<\/body>/i, '<script src="/morgdoni-card-fix.js?v=final"></script></body>');
      if (!/socket\.io\/socket\.io\.js/i.test(html)) html = html.replace(/<\/head>/i, '<script src="/socket.io/socket.io.js"></script></head>');
      if (!/request-ui\.js/i.test(html)) html = html.replace(/<\/body>/i, '<script src="/request-ui.js?v=1"></script></body>');
      return new Response(html, { status: response.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return response;
  }
};
