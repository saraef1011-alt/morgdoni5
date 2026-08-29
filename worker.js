const ORIGIN = 'https://raw.githubusercontent.com/saraef1011-alt/index/main/';

const SOCKET_SHIM = `
class MorgdoniSocket {
  constructor() {
    this.events = {};
    this.id = crypto.randomUUID();

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(protocol + '//' + location.host + '/ws?room=lobby');

    this.ws.onopen = () => this.emitLocal('connect');

    this.ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }

      if (m && m.type) {
        this.emitLocal(m.type, m.data, m);
      }
    };

    this.ws.onclose = () => this.emitLocal('disconnect');

    this.ws.onerror = (e) => {
      this.emitLocal('connect_error', e);
    };
  }

  on(event, callback) {
    (this.events[event] ??= []).push(callback);
    return this;
  }

  emit(event, data) {
    const send = () => {
      if (this.ws.readyState === 1) {
        this.ws.send(JSON.stringify({
          type: event,
          data: data ?? null
        }));
      }
    };

    if (this.ws.readyState === 1) {
      send();
    } else {
      this.ws.addEventListener('open', send, { once: true });
    }
  }

  emitLocal(event, data, full) {
    for (const callback of this.events[event] || []) {
      try {
        callback(data !== undefined ? data : full);
      } catch (err) {
        console.error(err);
      }
    }
  }

  disconnect() {
    this.ws?.close();
  }
}

window.io = () => new MorgdoniSocket();
`;

export class GameRoom {

  constructor(state) {
    this.state = state;
    this.sessions = new Map();
    this.ready = this.load();
  }

  async load() {
    this.data =
      await this.state.storage.get('data') ||
      {
        rooms: {},
        online: {},
        profiles: {}
      };
  }

  async save() {
    await this.state.storage.put('data', this.data);
  }

  send(ws, type, data) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type,
        data
      }));
    }
  }

  broadcastRoom(room, type, data) {
    for (const player of room.players) {
      const ws = this.sessions.get(player.socketId);

      if (ws) {
        this.send(ws, type, data);
      }
    }
  }

  broadcast(type, data) {
    for (const ws of this.sessions.values()) {
      this.send(ws, type, data);
    }
  }

  publicPlayers() {
    return Object.entries(this.data.online).map(([id, player]) => ({
      id,
      ...player
    }));
  }

  deck() {
    const cards = [];

    for (const [type, count] of [
      ['مرغ', 21],
      ['خروس', 21],
      ['لانه', 12],
      ['روباه', 7],
      ['تله', 3],
      ['مار', 2]
    ]) {
      for (let i = 0; i < count; i++) {
        cards.push(type);
      }
    }

    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }

    return cards;
  }

  profile(id, name = 'بازیکن', avatar = '🐔') {
    return this.data.profiles[id] ?? (
      this.data.profiles[id] = {
        accountId: id,
        username: name,
        avatar,
        gamesPlayed: 0,
        wins: 0,
        losses: 0
      }
    );
  }

  newRoom(players) {
    const roomId =
      Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();

    const room = {
      host: players[0].socketId,

      players: players.map(player => ({
        ...player,
        hand: [],
        eggs: 0,
        chicks: 0
      })),

      gameStarted: true,
      deck: this.deck(),
      eggTokens: 18,
      currentTurn: null,
      winner: null,
      discardPile: []
    };

    for (const player of room.players) {
      for (let i = 0; i < 4; i++) {
        if (room.deck.length) {
          player.hand.push(room.deck.pop());
        }
      }
    }

    room.currentTurn = room.players[0].socketId;

    this.data.rooms[roomId] = room;

    for (const player of room.players) {
      this.send(
        this.sessions.get(player.socketId),
        'gameStarted',
        { roomId }
      );
    }

    this.broadcastRoom(room, 'gameState', room);

    return roomId;
  }

  finish(room) {
    const winner =
      room.players.find(player => player.chicks >= 3);

    if (!winner || room.winner) return;

    room.winner = winner.socketId;

    const winnerProfile =
      this.data.profiles[winner.accountId];

    if (winnerProfile) {
      winnerProfile.wins++;
    }

    for (const player of room.players) {
      const profile =
        this.data.profiles[player.accountId];

      if (!profile) continue;

      profile.gamesPlayed++;

      if (player.socketId !== winner.socketId) {
        profile.losses++;
      }
    }
  }

  async fetch(request) {
    await this.ready;

    if (
      request.headers.get('Upgrade') !==
      'websocket'
    ) {
      return new Response(
        'WebSocket endpoint',
        { status: 426 }
      );
    }

    const pair = new WebSocketPair();

    const client = pair[0];
    const ws = pair[1];

    ws.accept();

    const sessionId = crypto.randomUUID();

    this.sessions.set(sessionId, ws);

    ws.addEventListener(
      'message',
      event => this.onMessage(
        sessionId,
        event.data
      )
    );

    ws.addEventListener(
      'close',
      () => this.onClose(sessionId)
    );

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async onMessage(sessionId, raw) {

    await this.ready;

    let message;

    try {
      message = JSON.parse(raw);
    } catch {
      return this.send(
        this.sessions.get(sessionId),
        'error',
        'درخواست نامعتبر'
      );
    }

    const data = message.data || {};
    const ws = this.sessions.get(sessionId);

    /* پروفایل */

    if (message.type === 'loadProfile') {

      this.send(ws, 'profileData', {
        profile:
          this.data.profiles[data.accountId] || null
      });

      return;
    }

    if (message.type === 'saveProfile') {

      if (
        !data.accountId ||
        !data.username ||
        String(data.username).trim().length < 2
      ) {
        return this.send(
          ws,
          'profileError',
          'نام کاربری معتبر نیست'
        );
      }

      const profile = this.profile(
        data.accountId,
        String(data.username).trim(),
        data.avatar || '🐔'
      );

      profile.username =
        String(data.username).trim();

      profile.avatar =
        data.avatar || profile.avatar;

      await this.save();

      this.send(ws, 'profileData', {
        profile
      });

      return;
    }

    /* ورود بازیکن */

    if (message.type === 'registerPlayer') {

      const profile = this.profile(
        data.accountId || sessionId,
        data.playerName || 'بازیکن',
        data.avatar || '🐔'
      );

      this.data.online[sessionId] = {
        name: profile.username,
        accountId: profile.accountId,
        avatar: profile.avatar,
        status: 'ready'
      };

      this.send(ws, 'registrationSuccess', {
        id: sessionId,
        name: profile.username
      });

      this.broadcast(
        'playerListUpdate',
        this.publicPlayers()
      );

      await this.save();

      return;
    }

    /* پروفایل بازیکن */

    if (message.type === 'getProfile') {

      const online =
        this.data.online[data.targetId];

      if (!online) {
        return this.send(
          ws,
          'profileInfoError',
          'بازیکن آنلاین نیست'
        );
      }

      const profile =
        this.profile(
          online.accountId,
          online.name,
          online.avatar
        );

      this.send(ws, 'profileInfo', {
        name: profile.username,
        avatar: profile.avatar,
        gamesPlayed: profile.gamesPlayed,
        wins: profile.wins,
        losses: profile.losses
      });

      return;
    }

    /* ساخت اتاق */

    if (message.type === 'createRoom') {

      const roomId =
        String(
          data.roomId ||
          Math.random()
            .toString(36)
            .slice(2, 8)
        ).toUpperCase();

      if (this.data.rooms[roomId]) {
        return this.send(
          ws,
          'roomError',
          'اتاق قبلاً وجود دارد'
        );
      }

      const online =
        this.data.online[sessionId] || {
          accountId: sessionId,
          name: data.playerName || 'بازیکن',
          avatar: '🐔'
        };

      this.data.rooms[roomId] = {
        host: sessionId,

        players: [{
          socketId: sessionId,
          id: sessionId,
          name: data.playerName || online.name,
          accountId: online.accountId,
          avatar: online.avatar,
          hand: [],
          eggs: 0,
          chicks: 0
        }],

        gameStarted: false,
        deck: this.deck(),
        eggTokens: 18,
        currentTurn: null,
        winner: null,
        discardPile: []
      };

      if (this.data.online[sessionId]) {
        this.data.online[sessionId].status = 'room';
      }

      await this.save();

      this.send(ws, 'roomCreated', {
        roomId
      });

      this.broadcastRoom(
        this.data.rooms[roomId],
        'roomUpdate',
        this.data.rooms[roomId]
      );

      this.broadcast(
        'playerListUpdate',
        this.publicPlayers()
      );

      return;
    }

    /* ورود به اتاق */

    if (message.type === 'joinRoom') {

      const room =
        this.data.rooms[
          String(data.roomId || '').toUpperCase()
        ];

      if (!room) {
        return this.send(
          ws,
          'roomError',
          'اتاق پیدا نشد'
        );
      }

      if (room.players.length >= 2) {
        return this.send(
          ws,
          'roomError',
          'اتاق پر است'
        );
      }

      const online =
        this.data.online[sessionId] || {
          accountId: sessionId,
          name: data.playerName || 'بازیکن',
          avatar: '🐔'
        };

      room.players.push({
        socketId: sessionId,
        id: sessionId,
        name: data.playerName || online.name,
        accountId: online.accountId,
        avatar: online.avatar,
        hand: [],
        eggs: 0,
        chicks: 0
      });

      if (this.data.online[sessionId]) {
        this.data.online[sessionId].status = 'room';
      }

      await this.save();

      this.broadcastRoom(
        room,
        'roomUpdate',
        room
      );

      return;
    }

    /* شروع بازی */

    if (message.type === 'startGame') {

      const room =
        this.data.rooms[
          String(data.roomId || '').toUpperCase()
        ];

      if (
        !room ||
        room.host !== sessionId ||
        room.players.length < 2
      ) return;

      room.gameStarted = true;
      room.deck = this.deck();

      room.players.forEach(player => {

        player.hand = [];
        player.eggs = 0;
        player.chicks = 0;

        for (let i = 0; i < 4; i++) {
          if (room.deck.length) {
            player.hand.push(
              room.deck.pop()
            );
          }
        }
      });

      room.currentTurn =
        room.players[0].socketId;

      await this.save();

      this.broadcastRoom(
        room,
        'gameState',
        room
      );

      return;
    }

    /* وضعیت بازی */

    if (message.type === 'getGameState') {

      const room =
        this.data.rooms[
          String(data.roomId || '').toUpperCase()
        ];

      if (room) {
        this.send(
          ws,
          'gameState',
          room
        );
      }

      return;
    }

    /* بازی سریع */

    if (message.type === 'quickGame') {

      const me =
        this.data.online[sessionId];

      const other =
        Object.entries(this.data.online)
          .find(
            ([id, player]) =>
              id !== sessionId &&
              player.status === 'ready'
          );

      if (!me) {
        return this.send(
          ws,
          'quickGameError',
          'ابتدا وارد لابی شو'
        );
      }

      if (!other) {
        return this.send(
          ws,
          'quickGameError',
          'منتظر بازیکن دیگری بمان...'
        );
      }

      this.newRoom([
        {
          socketId: sessionId,
          name: me.name,
          accountId: me.accountId,
          avatar: me.avatar
        },
        {
          socketId: other[0],
          name: other[1].name,
          accountId: other[1].accountId,
          avatar: other[1].avatar
        }
      ]);

      return;
    }

    /* عملیات بازی */

    if (message.type === 'gameAction') {

      const room =
        this.data.rooms[
          String(data.roomId || '').toUpperCase()
        ];

      if (
        !room ||
        !room.gameStarted ||
        room.winner
      ) return;

      const player =
        room.players.find(
          p => p.socketId === sessionId
        );

      if (
        !player ||
        room.currentTurn !== sessionId
      ) return;

      const opponent =
        room.players.find(
          p =>
            p.socketId === data.data?.target &&
            p.socketId !== sessionId
        ) ||
        room.players.find(
          p => p.socketId !== sessionId
        );

      let done = false;

      const action = data.action;

      /* تخم */

      if (action === 'lay') {

        const indexes = [
          'مرغ',
          'خروس',
          'لانه'
        ].map(
          card => player.hand.indexOf(card)
        );

        if (
          indexes.every(i => i >= 0) &&
          room.eggTokens
        ) {

          indexes
            .sort((a, b) => b - a)
            .forEach(
              i => player.hand.splice(i, 1)
            );

          player.eggs++;
          room.eggTokens--;

          done = true;
        }
      }

      /* جوجه */

      if (
        action === 'hatch' &&
        player.eggs > 0 &&
        player.hand.filter(
          x => x === 'مرغ'
        ).length >= 2
      ) {

        let removed = 0;

        for (
          let i = 0;
          i < player.hand.length &&
          removed < 2;
          i++
        ) {

          if (player.hand[i] === 'مرغ') {
            player.hand.splice(i, 1);
            i--;
            removed++;
          }
        }

        player.eggs--;
        player.chicks++;

        done = true;
      }

      /* برداشتن کارت */

      if (
        action === 'draw' &&
        room.deck.length
      ) {
        player.hand.push(
          room.deck.pop()
        );

        done = true;
      }

      /* دور انداختن */

      if (action === 'discard') {

        const index =
          player.hand.indexOf(
            data.data?.card
          );

        if (index >= 0) {

          room.discardPile.push(
            player.hand.splice(
              index,
              1
            )[0]
          );

          done = true;
        }
      }

      /* روباه */

      if (action === 'fox') {

        const index =
          player.hand.indexOf('روباه');

        if (
          index >= 0 &&
          opponent?.eggs > 0
        ) {

          player.hand.splice(index, 1);

          opponent.eggs--;
          player.eggs++;

          done = true;
        }
      }

      /* مار */

      if (action === 'snake') {

        const index =
          player.hand.indexOf('مار');

        const count =
          Math.min(
            2,
            Math.max(
              1,
              Number(data.data?.count) || 1
            )
          );

        if (
          index >= 0 &&
          opponent?.eggs > 0
        ) {

          player.hand.splice(index, 1);

          const stolen =
            Math.min(
              count,
              opponent.eggs
            );

          opponent.eggs -= stolen;
          room.eggTokens += stolen;

          done = true;
        }
      }

      /* تله */

      if (action === 'trap') {

        const trapIndex =
          player.hand.indexOf('تله');

        const targetIndex =
          opponent?.hand.indexOf(
            data.data?.card
          );

        if (
          trapIndex >= 0 &&
          targetIndex >= 0
        ) {

          player.hand.splice(
            trapIndex,
            1
          );

          opponent.hand.splice(
            targetIndex,
            1
          );

          done = true;
        }
      }

      /* پایان نوبت */

      if (action === 'endTurn') {
        done = true;
      }

      if (!done) return;

      while (
        player.hand.length < 4 &&
        room.deck.length
      ) {
        player.hand.push(
          room.deck.pop()
        );
      }

      this.finish(room);

      if (!room.winner) {

        const index =
          room.players.findIndex(
            p =>
              p.socketId ===
              room.currentTurn
          );

        room.currentTurn =
          room.players[
            (index + 1) %
            room.players.length
          ].socketId;
      }

      await this.save();

      this.broadcastRoom(
        room,
        'gameState',
        room
      );

      return;
    }

    /* چت */

    if (message.type === 'chatMessage') {

      const room =
        this.data.rooms[
          String(data.roomId || '').toUpperCase()
        ];

      const player =
        room?.players.find(
          p => p.socketId === sessionId
        );

      if (player) {

        this.broadcastRoom(
          room,
          'chatMessage',
          {
            sender: player.name,
            message: data.message,
            time: new Date()
              .toLocaleTimeString()
          }
        );
      }

      return;
    }

    /* خروج */

    if (message.type === 'leaveGame') {

      for (
        const [roomId, room]
        of Object.entries(this.data.rooms)
      ) {

        const index =
          room.players.findIndex(
            p => p.socketId === sessionId
          );

        if (index >= 0) {

          room.players.splice(
            index,
            1
          );

          if (!room.players.length) {

            delete this.data.rooms[roomId];

          } else {

            room.host =
              room.players[0].socketId;

            room.currentTurn =
              room.players[0].socketId;

            this.broadcastRoom(
              room,
              'roomUpdate',
              room
            );
          }
        }
      }

      if (this.data.online[sessionId]) {
        this.data.online[sessionId].status =
          'ready';
      }

      await this.save();

      this.broadcast(
        'playerListUpdate',
        this.publicPlayers()
      );

      return;
    }
  }

  async onClose(sessionId) {

    await this.ready;

    for (
      const [roomId, room]
      of Object.entries(this.data.rooms)
    ) {

      const index =
        room.players.findIndex(
          p => p.socketId === sessionId
        );

      if (index >= 0) {

        room.players.splice(
          index,
          1
        );

        if (!room.players.length) {

          delete this.data.rooms[roomId];

        } else {

          room.host =
            room.players[0].socketId;

          room.currentTurn =
            room.players[0].socketId;

          this.broadcastRoom(
            room,
            'roomUpdate',
            room
          );
        }
      }
    }

    delete this.data.online[sessionId];

    this.sessions.delete(sessionId);

    await this.save();

    this.broadcast(
      'playerListUpdate',
      this.publicPlayers()
    );
  }
}


/* ============================= */
/* WORKER */
/* ============================= */

export default {

  async fetch(request, env) {

    const url = new URL(request.url);

    /* تست */

    if (url.pathname === '/healthz') {
      return new Response('ok');
    }

    /* Socket.IO جایگزین */

    if (
      url.pathname ===
      '/socket.io/socket.io.js'
    ) {

      return new Response(
        SOCKET_SHIM,
        {
          headers: {
            'content-type':
              'application/javascript; charset=utf-8',
            'cache-control':
              'no-store'
          }
        }
      );
    }

    /* WebSocket */

    if (url.pathname === '/ws') {

      return env.GAME_ROOM
        .get(
          env.GAME_ROOM.idFromName(
            'morgdoni-lobby'
          )
        )
        .fetch(request);
    }

    /*
      مهم:
      تمام فایل‌های پروژه اصلی
      از GitHub خوانده می‌شوند.
    */

    let path =
      url.pathname === '/'
        ? 'index.html'
        : url.pathname.slice(1);

    /*
      جلوگیری از مسیرهای خطرناک
    */

    path = path
      .replace(/^\/+/, '')
      .replace(/\.\./g, '');

    const target =
      ORIGIN +
      path;

    const response =
      await fetch(target);

    /*
      اگر فایل پیدا نشد
    */

    if (!response.ok) {

      if (url.pathname !== '/') {

        return new Response(
          'File not found: ' + path,
          {
            status: 404,
            headers: {
              'content-type':
                'text/plain; charset=utf-8'
            }
          }
        );
      }

      return new Response(
        'index.html not found',
        { status: 404 }
      );
    }

    /*
      index.html:
      فقط Socket.IO قدیمی را
      به نسخه Worker وصل می‌کنیم.
    */

    if (
      path.toLowerCase() ===
      'index.html'
    ) {

      let html =
        await response.text();

      html =
        html.replace(
          /<script[^>]+src=["']\/socket\.io\/socket\.io\.js["'][^>]*><\/script>/gi,
          '<script src="/socket.io/socket.io.js"></script>'
        );

      return new Response(
        html,
        {
          headers: {
            'content-type':
              'text/html; charset=utf-8',
            'cache-control':
              'no-store'
          }
        }
      );
    }

    /*
      بقیه فایل‌ها بدون تغییر
      از پروژه اصلی سرو می‌شوند:
      CSS
      JS
      تصاویر
      صداها
      فونت‌ها
      و ...
    */

    return new Response(
      response.body,
      {
        status: response.status,
        headers: response.headers
      }
    );
  }
};
