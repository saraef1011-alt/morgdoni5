import multiWorker, { GameRoom as MultiGameRoom } from './worker-multi.js';

const MAX_PLAYERS = 50;

function makeRoomId(rooms) {
  let rid;
  do rid = Math.random().toString(36).slice(2, 8).toUpperCase(); while (rooms[rid]);
  return rid;
}

export class GameRoom extends MultiGameRoom {
  async message(id, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return this.send(id, 'error', 'درخواست نامعتبر است'); }
    const t = m?.type, d = m?.data || {};
    await this.ready;

    if (t === 'acceptGame') {
      const target = this.data.online[id];
      const req = this.data.online[d.fromId];
      if (!target || !req) return this.send(id, 'gameError', 'بازیکن یافت نشد');

      this.data.pending[id] = (this.data.pending[id] || []).filter(x => x.fromId !== d.fromId);

      const targetRoom = this.roomOf(id);
      const requesterRoom = this.roomOf(req.id);

      if (targetRoom?.role === 'player') {
        this.send(id, 'busyGameChoice', {
          fromId: req.id,
          fromName: req.name,
          roomId: targetRoom.roomId,
          message: `${req.name} می‌خواهد وارد بازی شما شود`
        });
        await this.save();
        return;
      }

      if (requesterRoom?.role === 'player') {
        const r = requesterRoom.room;
        r.players ??= [];
        r.watchers ??= [];

        if (r.players.some(p => p.id === id)) {
          target.status = r.gameStarted ? 'playing' : 'room';
          this.send(id, 'joinExistingGame', { roomId: requesterRoom.roomId, room: r, mode: 'player' });
          await this.save();
          return;
        }

        if (r.players.length >= MAX_PLAYERS) {
          this.send(id, 'gameError', 'ظرفیت بازی پر است');
          await this.save();
          return;
        }

        r.watchers = r.watchers.filter(x => x !== id);
        const np = this.player(target);

        if (r.gameStarted) {
          for (let i = 0; i < 4 && r.deck?.length; i++) np.hand.push(r.deck.pop());
          r.players.push(np);
          target.status = 'playing';
          this.send(id, 'joinExistingGame', { roomId: requesterRoom.roomId, room: r, mode: 'player' });
        } else {
          r.players.push(np);
          target.status = 'room';
          this.send(id, 'roomJoined', { roomId: requesterRoom.roomId, playerCount: r.players.length, maxPlayers: MAX_PLAYERS });
        }

        this.roomBroadcast(r, 'roomUpdate', r);
        this.roomBroadcast(r, 'gameState', r);
        this.updateList();
        await this.save();
        return;
      }
    }

    if (t === 'cancelQuickGame') {
      this.data.queue = (this.data.queue || []).filter(x => String(x) !== String(id));
      this.data.quickQueue = (this.data.quickQueue || []).filter(x => String(x?.id) !== String(id));
      const p = this.data.online[id];
      if (p && p.status === 'requesting') p.status = 'ready';
      this.send(id, 'quickGameCancelled');
      this.updateList();
      await this.save();
      return;
    }

    if (t === 'quickGame') {
      const p = this.data.online[id];
      if (!p) return this.send(id, 'quickGameError', 'بازیکن یافت نشد');
      if (p.status !== 'ready' && p.status !== 'requesting') return this.send(id, 'quickGameError', 'ابتدا باید آماده باشید');

      const requested = Math.floor(Number(d.playerCount || d.count || 2));
      const count = Math.max(2, Math.min(MAX_PLAYERS, requested || 2));
      this.data.quickQueue ??= [];
      this.data.quickQueue = this.data.quickQueue.filter(x => String(x?.id) !== String(id));
      this.data.queue = (this.data.queue || []).filter(x => String(x) !== String(id));
      this.data.quickQueue.push({ id, count, at: Date.now() });
      p.status = 'requesting';

      const candidates = this.data.quickQueue
        .filter(x => x.count === count && this.data.online[x.id]?.status === 'requesting')
        .sort((a, b) => a.at - b.at);

      if (candidates.length >= count) {
        const picked = candidates.slice(0, count);
        const pickedIds = new Set(picked.map(x => x.id));
        this.data.quickQueue = this.data.quickQueue.filter(x => !pickedIds.has(x.id));

        const people = picked.map(x => this.data.online[x.id]).filter(Boolean);
        if (people.length === count) {
          const rid = makeRoomId(this.data.rooms);
          const r = this.data.rooms[rid] = {
            host: people[0].id,
            players: people.map(x => this.player(x)),
            watchers: [],
            gameStarted: false,
            deck: [],
            eggTokens: 18,
            currentTurn: null,
            winner: null,
            discardPile: []
          };
          people.forEach(x => { x.status = 'playing'; });
          this.startGame(rid);
          this.roomBroadcast(r, 'quickGameFound', { roomId: rid, playerCount: count });
          this.updateList();
          await this.save();
          return;
        }
      }

      this.send(id, 'quickGameQueued', { playerCount: count, queued: candidates.length });
      this.updateList();
      await this.save();
      return;
    }

    return super.message(id, raw);
  }
}

export default {
  async fetch(request, env, ctx) {
    const response = await multiWorker.fetch(request, env, ctx);
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return response;

    let html = await response.text();
    if (!/quick-game-ui\.js/i.test(html)) {
      html = html.replace(/<\/body>/i,
        '<script src="/quick-game-ui.js?v=1"></script><script src="/vs-ui.js?v=1"></script></body>');
    }
    return new Response(html, {
      status: response.status,
      headers: new Headers(response.headers)
    });
  }
};
