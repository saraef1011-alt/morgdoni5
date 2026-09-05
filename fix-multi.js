import { GameRoom as MultiGameRoom } from './worker-multi.js';

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

      // اگر گیرنده خودش داخل یک بازی است، همان رفتار قبلی حفظ می‌شود:
      // از او می‌پرسیم درخواست‌کننده وارد همان بازی شود یا تماشا کند.
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

      // اگر درخواست‌کننده از قبل داخل یک بازی است و گیرنده خارج از بازی است،
      // گیرنده باید بتواند مستقیماً به همان بازی چندنفره اضافه شود.
      if (requesterRoom?.role === 'player') {
        const r = requesterRoom.room;
        r.players ??= [];
        r.watchers ??= [];

        if (r.players.some(p => p.id === id)) {
          target.status = r.gameStarted ? 'playing' : 'room';
          this.send(id, 'joinExistingGame', {
            roomId: requesterRoom.roomId,
            room: r,
            mode: 'player'
          });
          await this.save();
          return;
        }

        if (r.players.length >= 50) {
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
          this.send(id, 'joinExistingGame', {
            roomId: requesterRoom.roomId,
            room: r,
            mode: 'player'
          });
        } else {
          r.players.push(np);
          target.status = 'room';
          this.send(id, 'roomJoined', {
            roomId: requesterRoom.roomId,
            playerCount: r.players.length,
            maxPlayers: 50
          });
        }

        this.roomBroadcast(r, 'roomUpdate', r);
        this.roomBroadcast(r, 'gameState', r);
        this.updateList();
        await this.save();
        return;
      }
    }

    return super.message(id, raw);
  }
}

export { default } from './worker-multi.js';
