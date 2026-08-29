// worker.js
// مرغ‌دونی — Cloudflare Worker + Durable Object
// تبدیل‌شده از server.js + db.js اصلی پروژه

const MAX_AVATAR_LENGTH = 300000;
const MAX_USERNAME_LENGTH = 20;

const SOCKET_SHIM = `
class MorgdoniSocket {
    constructor() {
        this.events = {};
        this.id = crypto.randomUUID();

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(
            protocol + '//' + location.host + '/ws?room=lobby'
        );

        this.ws.onopen = () => this.emitLocal('connect');

        this.ws.onmessage = (event) => {
            let msg;
            try {
                msg = JSON.parse(event.data);
            } catch {
                return;
            }

            if (msg && msg.type) {
                this.emitLocal(msg.type, msg.data);
            }
        };

        this.ws.onclose = () => this.emitLocal('disconnect');
        this.ws.onerror = (e) => this.emitLocal('connect_error', e);
    }

    on(event, callback) {
        (this.events[event] ??= []).push(callback);
        return this;
    }

    emit(event, data) {
        const send = () => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: event,
                    data: data ?? null
                }));
            }
        };

        if (this.ws.readyState === WebSocket.OPEN) {
            send();
        } else {
            this.ws.addEventListener('open', send, { once: true });
        }
    }

    emitLocal(event, data) {
        for (const callback of this.events[event] || []) {
            try {
                callback(data);
            } catch (err) {
                console.error(err);
            }
        }
    }

    disconnect() {
        this.ws?.close();
    }
}

window.io = function () {
    return new MorgdoniSocket();
};
`;


/* =========================================================
   DURABLE OBJECT
========================================================= */

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
                onlinePlayers: {},
                accounts: {},
                pendingRequests: {}
            };
    }


    async save() {
        await this.state.storage.put('data', this.data);
    }


    send(ws, type, data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type,
                data
            }));
        }
    }


    sendTo(socketId, type, data) {
        this.send(this.sessions.get(socketId), type, data);
    }


    broadcast(type, data) {
        for (const ws of this.sessions.values()) {
            this.send(ws, type, data);
        }
    }


    broadcastRoom(roomId, type, data) {
        const room = this.data.rooms[roomId];

        if (!room) return;

        const ids = new Set([
            ...(room.players || []).map(p => p.id),
            ...(room.watchers || [])
        ]);

        for (const id of ids) {
            this.sendTo(id, type, data);
        }
    }


    updatePlayerList() {
        const list = Object.values(this.data.onlinePlayers)
            .map(p => ({
                id: p.id,
                name: p.name,
                status: p.status,
                socketId: p.socketId,
                avatar: p.avatar || '🐔'
            }));

        this.broadcast('playerListUpdate', list);
    }


    createDeck() {

        const deck = [];

        for (let i = 0; i < 21; i++)
            deck.push('مرغ');

        for (let i = 0; i < 21; i++)
            deck.push('خروس');

        for (let i = 0; i < 12; i++)
            deck.push('لانه');

        for (let i = 0; i < 7; i++)
            deck.push('روباه');

        for (let i = 0; i < 3; i++)
            deck.push('تله');

        for (let i = 0; i < 2; i++)
            deck.push('مار');

        return this.shuffle(deck);
    }


    shuffle(arr) {

        for (let i = arr.length - 1; i > 0; i--) {

            const j = Math.floor(Math.random() * (i + 1));

            [arr[i], arr[j]] =
                [arr[j], arr[i]];
        }

        return arr;
    }


    getAccount(accountId) {

        if (!accountId) return null;

        return this.data.accounts[accountId] || null;
    }


    isValidUsername(username) {

        return typeof username === 'string' &&
            username.trim().length >= 2 &&
            username.trim().length <= MAX_USERNAME_LENGTH;
    }


    isValidAvatar(avatar) {

        if (typeof avatar !== 'string' ||
            avatar.length === 0) {
            return false;
        }

        if (avatar.length > MAX_AVATAR_LENGTH) {
            return false;
        }

        if (!avatar.startsWith('data:')) {
            return avatar.length <= 8;
        }

        return /^data:image\/(png|jpeg|jpg|webp|gif);base64,/.test(avatar);
    }


    usernameTaken(username, excludingAccountId) {

        const name = username.trim();

        return Object.values(this.data.accounts)
            .some(account =>
                account.username === name &&
                account.accountId !== excludingAccountId
            );
    }


    createOrUpdateAccount(accountId, username, avatar) {

        let account = this.data.accounts[accountId];

        if (account) {

            if (username) {
                account.username = username.trim();
            }

            if (avatar) {
                account.avatar = avatar;
            }

        } else {

            account = {
                accountId,
                username:
                    username ?
                        username.trim() :
                        'بازیکن',

                avatar:
                    avatar ||
                    '🐔',

                gamesPlayed: 0,
                wins: 0,
                losses: 0,
                createdAt: Date.now()
            };

            this.data.accounts[accountId] = account;
        }

        return account;
    }


    recordGameResult(accountId, didWin) {

        const account =
            this.data.accounts[accountId];

        if (!account) return null;

        account.gamesPlayed =
            (account.gamesPlayed || 0) + 1;

        if (didWin) {

            account.wins =
                (account.wins || 0) + 1;

        } else {

            account.losses =
                (account.losses || 0) + 1;
        }

        return account;
    }


    getRoomForPlayer(playerId) {

        for (const [roomId, room]
            of Object.entries(this.data.rooms)) {

            if (
                room.players?.some(
                    p => p.id === playerId
                )
            ) {

                return {
                    roomId,
                    room,
                    role: 'player'
                };
            }


            if (
                room.watchers?.includes(playerId)
            ) {

                return {
                    roomId,
                    room,
                    role: 'watcher'
                };
            }
        }

        return null;
    }


    playersShareRoom(idA, idB) {

        for (const room of Object.values(this.data.rooms)) {

            const hasA =
                room.players?.some(
                    p => p.id === idA
                );

            const hasB =
                room.players?.some(
                    p => p.id === idB
                );

            if (hasA && hasB) {
                return true;
            }
        }

        return false;
    }


    removeFromQuickQueue(playerId) {

        const player =
            this.data.onlinePlayers[playerId];

        if (player) {
            player.quickQueue = false;
        }
    }


    /* =====================================================
       ساخت اتاق
    ===================================================== */

    createPrivateGameRoom(playerA, playerB) {

        const roomId =
            Math.random()
                .toString(36)
                .substring(2, 8)
                .toUpperCase();


        const room = {

            host: playerA.id,

            players: [
                {
                    id: playerA.id,
                    name: playerA.name,
                    accountId: playerA.accountId || null,
                    avatar: playerA.avatar || '🐔',
                    hand: [],
                    eggs: 0,
                    chicks: 0
                },

                {
                    id: playerB.id,
                    name: playerB.name,
                    accountId: playerB.accountId || null,
                    avatar: playerB.avatar || '🐔',
                    hand: [],
                    eggs: 0,
                    chicks: 0
                }
            ],

            gameStarted: false,

            deck: this.createDeck(),

            eggTokens: 18,

            currentTurn: null,

            winner: null,

            discardPile: [],

            watchers: []
        };


        this.data.rooms[roomId] = room;


        playerA.status = 'playing';
        playerB.status = 'playing';


        this.startGameInRoom(roomId);


        return roomId;
    }


    startGameInRoom(roomId) {

        const room =
            this.data.rooms[roomId];

        if (!room) return;


        room.gameStarted = true;


        for (const player of room.players) {

            player.hand = [];

            player.eggs = 0;

            player.chicks = 0;

            for (let i = 0; i < 4; i++) {

                if (room.deck.length > 0) {

                    player.hand.push(
                        room.deck.pop()
                    );
                }
            }
        }


        room.currentTurn =
            room.players[0].id;


        this.broadcastRoom(
            roomId,
            'gameStarted',
            { roomId }
        );


        this.broadcastRoom(
            roomId,
            'gameState',
            room
        );
    }


    /* =====================================================
       پیام‌های WebSocket
    ===================================================== */

    async onMessage(sid, raw) {

        await this.ready;

        let message;

        try {
            message =
                JSON.parse(raw);

        } catch {

            this.sendTo(
                sid,
                'error',
                'درخواست نامعتبر است'
            );

            return;
        }


        const type =
            message.type;

        const d =
            message.data || {};


        /* ================================================
           PROFILE
        ================================================= */

        if (type === 'loadProfile') {

            const profile =
                this.getAccount(
                    d.accountId
                );

            this.sendTo(
                sid,
                'profileData',
                { profile }
            );

            return;
        }


        if (type === 'saveProfile') {

            if (!d.accountId) {

                this.sendTo(
                    sid,
                    'profileError',
                    'شناسه حساب نامعتبر است'
                );

                return;
            }


            if (!this.isValidUsername(d.username)) {

                this.sendTo(
                    sid,
                    'profileError',
                    'نام کاربری باید بین ۲ تا ۲۰ کاراکتر باشد'
                );

                return;
            }


            if (
                d.avatar &&
                !this.isValidAvatar(d.avatar)
            ) {

                this.sendTo(
                    sid,
                    'profileError',
                    'آواتار نامعتبر است یا حجم آن زیاد است'
                );

                return;
            }


            if (
                this.usernameTaken(
                    d.username,
                    d.accountId
                )
            ) {

                this.sendTo(
                    sid,
                    'profileError',
                    'این نام کاربری قبلاً استفاده شده است'
                );

                return;
            }


            const profile =
                this.createOrUpdateAccount(
                    d.accountId,
                    d.username,
                    d.avatar
                );


            const online =
                this.data.onlinePlayers[sid];


            if (
                online &&
                online.accountId === d.accountId
            ) {

                online.name =
                    profile.username;

                online.avatar =
                    profile.avatar;
            }


            await this.save();


            this.sendTo(
                sid,
                'profileData',
                { profile }
            );


            this.updatePlayerList();

            return;
        }


        if (type === 'getProfile') {

            const target =
                this.data.onlinePlayers[
                    d.targetId
                ];


            if (!target) {

                this.sendTo(
                    sid,
                    'profileInfoError',
                    'بازیکن یافت نشد'
                );

                return;
            }


            const account =
                target.accountId ?
                    this.getAccount(
                        target.accountId
                    ) :
                    null;


            this.sendTo(
                sid,
                'profileInfo',
                {

                    id: target.id,

                    name: target.name,

                    avatar:
                        target.avatar ||
                        '🐔',

                    gamesPlayed:
                        account?.gamesPlayed || 0,

                    wins:
                        account?.wins || 0,

                    losses:
                        account?.losses || 0
                }
            );

            return;
        }


        /* ================================================
           REGISTER
        ================================================= */

        if (type === 'registerPlayer') {

            const name =
                String(
                    d.playerName ||
                    'بازیکن'
                ).trim();


            const accountId =
                d.accountId ||
                sid;


            const existing =
                Object.values(
                    this.data.onlinePlayers
                ).find(
                    p =>
                        p.name === name &&
                        p.id !== sid
                );


            if (existing) {

                this.sendTo(
                    sid,
                    'registrationError',
                    'این نام قبلاً توسط بازیکن دیگری استفاده می‌شود'
                );

                return;
            }


            let account =
                this.getAccount(
                    accountId
                );


            if (!account) {

                account =
                    this.createOrUpdateAccount(
                        accountId,
                        name,
                        d.avatar || '🐔'
                    );
            }


            this.data.onlinePlayers[sid] = {

                id: sid,

                name:
                    account.username ||
                    name,

                status: 'ready',

                socketId: sid,

                accountId,

                avatar:
                    account.avatar ||
                    d.avatar ||
                    '🐔',

                quickQueue: false
            };


            await this.save();


            this.sendTo(
                sid,
                'registrationSuccess',
                {
                    id: sid,
                    name:
                        this.data.onlinePlayers[sid]
                            .name
                }
            );


            this.updatePlayerList();

            return;
        }


        if (type === 'getPlayerList') {

            this.updatePlayerList();

            return;
        }


        /* ================================================
           GAME REQUEST
        ================================================= */

        if (type === 'requestGame') {

            const player =
                this.data.onlinePlayers[sid];

            const target =
                this.data.onlinePlayers[
                    d.targetId
                ];


            if (!player || !target) {

                this.sendTo(
                    sid,
                    'gameRequestError',
                    'بازیکن مورد نظر یافت نشد'
                );

                return;
            }


            if (!this.data.pendingRequests[d.targetId]) {

                this.data.pendingRequests[d.targetId] = [];
            }


            this.data.pendingRequests[d.targetId] =
                this.data.pendingRequests[d.targetId]
                    .filter(
                        r => r.fromId !== sid
                    );


            this.data.pendingRequests[d.targetId]
                .push({

                    fromId: sid,

                    fromName: player.name,

                    timestamp: Date.now()
                });


            this.removeFromQuickQueue(sid);


            player.status =
                'requesting';


            await this.save();


            this.updatePlayerList();


            this.sendTo(
                d.targetId,
                'gameRequest',
                {
                    fromId: sid,
                    fromName: player.name
                }
            );

            return;
        }


        if (type === 'rejectGame') {

            const player =
                this.data.onlinePlayers[sid];

            const requester =
                this.data.onlinePlayers[d.fromId];


            if (
                this.data.pendingRequests[sid]
            ) {

                this.data.pendingRequests[sid] =
                    this.data.pendingRequests[sid]
                        .filter(
                            r =>
                                r.fromId !== d.fromId
                        );
            }


            if (
                player &&
                player.status === 'requested'
            ) {
                player.status = 'ready';
            }


            if (
                requester &&
                requester.status === 'requesting'
            ) {
                requester.status = 'ready';
            }


            await this.save();


            this.sendTo(
                d.fromId,
                'gameRejected',
                {
                    byName:
                        player?.name ||
                        'بازیکن'
                }
            );


            this.updatePlayerList();

            return;
        }


        /* ================================================
           ACCEPT GAME
        ================================================= */

        if (type === 'acceptGame') {

            const player =
                this.data.onlinePlayers[sid];

            const requester =
                this.data.onlinePlayers[d.fromId];


            if (!player || !requester) {

                this.sendTo(
                    sid,
                    'gameError',
                    'بازیکن یافت نشد'
                );

                return;
            }


            if (
                this.data.pendingRequests[sid]
            ) {

                this.data.pendingRequests[sid] =
                    this.data.pendingRequests[sid]
                        .filter(
                            r =>
                                r.fromId !== d.fromId
                        );
            }


            this.removeFromQuickQueue(
                d.fromId
            );


            const current =
                this.getRoomForPlayer(sid);


            if (
                current &&
                current.role === 'player'
            ) {

                this.sendTo(
                    sid,
                    'busyGameChoice',
                    {
                        fromId: d.fromId,

                        fromName:
                            requester.name,

                        roomId:
                            current.roomId,

                        message:
                            `${requester.name} می‌خواهد وارد بازی شما شود`
                    }
                );

                return;
            }


            player.status = 'playing';

            requester.status = 'playing';


            const roomId =
                this.createPrivateGameRoom(
                    requester,
                    player
                );


            await this.save();


            this.updatePlayerList();


            this.sendTo(
                requester.id,
                'gameStarted',
                { roomId }
            );


            this.sendTo(
                player.id,
                'gameStarted',
                { roomId }
            );

            return;
        }


        /* ================================================
           QUICK GAME
        ================================================= */

        if (type === 'quickGame') {

            const player =
                this.data.onlinePlayers[sid];


            if (!player) {

                this.sendTo(
                    sid,
                    'quickGameError',
                    'بازیکن یافت نشد'
                );

                return;
            }


            if (player.status !== 'ready') {

                this.sendTo(
                    sid,
                    'quickGameError',
                    'ابتدا باید آماده باشید'
                );

                return;
            }


            player.status =
                'requesting';

            player.quickQueue = true;


            const waiting =
                Object.values(
                    this.data.onlinePlayers
                )
                .filter(
                    p =>
                        p.status === 'requesting' &&
                        p.quickQueue
                );


            if (waiting.length >= 2) {

                const a = waiting[0];

                const b = waiting[1];


                a.quickQueue = false;

                b.quickQueue = false;

                a.status = 'playing';

                b.status = 'playing';


                const roomId =
                    this.createPrivateGameRoom(
                        a,
                        b
                    );


                await this.save();


                this.updatePlayerList();


                this.sendTo(
                    a.id,
                    'gameStarted',
                    { roomId }
                );

                this.sendTo(
                    b.id,
                    'gameStarted',
                    { roomId }
                );

            } else {

                this.sendTo(
                    sid,
                    'quickGameQueued'
                );

                await this.save();

                this.updatePlayerList();
            }

            return;
        }


        /* ================================================
           CREATE ROOM
        ================================================= */

        if (type === 'createRoom') {

            const roomId =
                String(
                    d.roomId ||
                    Math.random()
                        .toString(36)
                        .slice(2, 8)
                )
                .toUpperCase();


            if (this.data.rooms[roomId]) {

                this.sendTo(
                    sid,
                    'roomError',
                    'اتاق قبلاً وجود دارد'
                );

                return;
            }


            const online =
                this.data.onlinePlayers[sid];


            const room = {

                host: sid,

                players: [

                    {

                        id: sid,

                        name:
                            d.playerName ||
                            online?.name ||
                            'بازیکن',

                        accountId:
                            online?.accountId ||
                            sid,

                        avatar:
                            online?.avatar ||
                            '🐔',

                        hand: [],

                        eggs: 0,

                        chicks: 0
                    }
                ],

                gameStarted: false,

                deck: this.createDeck(),

                eggTokens: 18,

                currentTurn: null,

                winner: null,

                discardPile: [],

                watchers: []
            };


            this.data.rooms[roomId] =
                room;


            if (online) {
                online.status = 'room';
            }


            await this.save();


            this.sendTo(
                sid,
                'roomCreated',
                { roomId }
            );


            this.broadcastRoom(
                roomId,
                'roomUpdate',
                room
            );


            this.updatePlayerList();

            return;
        }


        /* ================================================
           JOIN ROOM
        ================================================= */

        if (type === 'joinRoom') {

            const roomId =
                String(
                    d.roomId || ''
                ).toUpperCase();


            const room =
                this.data.rooms[roomId];


            if (!room) {

                this.sendTo(
                    sid,
                    'roomError',
                    'اتاق پیدا نشد'
                );

                return;
            }


            if (room.players.length >= 2) {

                this.sendTo(
                    sid,
                    'roomError',
                    'اتاق پر است'
                );

                return;
            }


            const online =
                this.data.onlinePlayers[sid];


            room.players.push({

                id: sid,

                name:
                    d.playerName ||
                    online?.name ||
                    'بازیکن',

                accountId:
                    online?.accountId ||
                    sid,

                avatar:
                    online?.avatar ||
                    '🐔',

                hand: [],

                eggs: 0,

                chicks: 0
            });


            if (online) {
                online.status = 'room';
            }


            await this.save();


            this.broadcastRoom(
                roomId,
                'roomUpdate',
                room
            );

            return;
        }


        /* ================================================
           START GAME
        ================================================= */

        if (type === 'startGame') {

            const roomId =
                String(
                    d.roomId || ''
                ).toUpperCase();


            const room =
                this.data.rooms[roomId];


            if (
                !room ||
                room.host !== sid ||
                room.players.length < 2
            ) {
                return;
            }


            this.startGameInRoom(roomId);


            await this.save();

            return;
        }


        if (type === 'getGameState') {

            const room =
                this.data.rooms[
                    String(
                        d.roomId || ''
                    ).toUpperCase()
                ];


            if (room) {

                this.sendTo(
                    sid,
                    'gameState',
                    room
                );
            }

            return;
        }


        /* ================================================
           GAME ACTION
        ================================================= */

        if (type === 'gameAction') {

            const roomId =
                String(
                    d.roomId || ''
                ).toUpperCase();


            const room =
                this.data.rooms[roomId];


            if (
                !room ||
                !room.gameStarted ||
                room.winner
            ) {
                return;
            }


            const player =
                room.players.find(
                    p => p.id === sid
                );


            if (
                !player ||
                room.currentTurn !== sid
            ) {
                return;
            }


            let actionDone = false;


            switch (d.action) {


                /* =====================
                   LAY
                ===================== */

                case 'lay': {

                    const hen =
                        player.hand.indexOf(
                            'مرغ'
                        );

                    const rooster =
                        player.hand.indexOf(
                            'خروس'
                        );

                    const nest =
                        player.hand.indexOf(
                            'لانه'
                        );


                    if (
                        hen !== -1 &&
                        rooster !== -1 &&
                        nest !== -1 &&
                        room.eggTokens > 0
                    ) {

                        // حذف از بزرگ به کوچک
                        [
                            hen,
                            rooster,
                            nest
                        ]
                        .sort((a, b) => b - a)
                        .forEach(
                            index =>
                                player.hand.splice(
                                    index,
                                    1
                                )
                        );


                        player.eggs++;

                        room.eggTokens--;

                        actionDone = true;
                    }

                    break;
                }


                /* =====================
                   HATCH
                ===================== */

                case 'hatch': {

                    const hens =
                        player.hand.filter(
                            c => c === 'مرغ'
                        ).length;


                    if (
                        hens >= 2 &&
                        player.eggs > 0
                    ) {

                        let removed = 0;


                        for (
                            let i = 0;
                            i < player.hand.length &&
                            removed < 2;
                            i++
                        ) {

                            if (
                                player.hand[i] === 'مرغ'
                            ) {

                                player.hand.splice(
                                    i,
                                    1
                                );

                                i--;

                                removed++;
                            }
                        }


                        player.eggs--;

                        player.chicks++;

                        actionDone = true;
                    }

                    break;
                }


                /* =====================
                   FOX
                ===================== */

                case 'fox': {

                    const fox =
                        player.hand.indexOf(
                            'روباه'
                        );


                    if (fox === -1)
                        break;


                    const opponent =
                        room.players.find(
                            p => p.id !== sid
                        );


                    if (
                        !opponent ||
                        opponent.eggs <= 0
                    ) {
                        break;
                    }


                    player.hand.splice(
                        fox,
                        1
                    );


                    const roosters =
                        opponent.hand.filter(
                            c => c === 'خروس'
                        ).length;


                    if (roosters >= 2) {

                        let removed = 0;


                        for (
                            let i = 0;
                            i < opponent.hand.length &&
                            removed < 2;
                            i++
                        ) {

                            if (
                                opponent.hand[i] === 'خروس'
                            ) {

                                opponent.hand.splice(
                                    i,
                                    1
                                );

                                i--;

                                removed++;
                            }
                        }

                    } else {

                        opponent.eggs--;

                        player.eggs++;
                    }


                    actionDone = true;

                    break;
                }


                /* =====================
                   SNAKE
                ===================== */

                case 'snake': {

                    const snake =
                        player.hand.indexOf(
                            'مار'
                        );


                    if (snake === -1)
                        break;


                    const opponent =
                        room.players.find(
                            p => p.id !== sid
                        );


                    if (
                        !opponent ||
                        opponent.eggs <= 0
                    ) {
                        break;
                    }


                    const count =
                        Math.min(
                            2,
                            Math.max(
                                1,
                                Number(
                                    d.data?.count
                                ) || 1
                            )
                        );


                    player.hand.splice(
                        snake,
                        1
                    );


                    const broken =
                        Math.min(
                            opponent.eggs,
                            count
                        );


                    opponent.eggs -= broken;

                    room.eggTokens += broken;

                    actionDone = true;

                    break;
                }


                /* =====================
                   TRAP
                ===================== */

                case 'trap': {

                    const trap =
                        player.hand.indexOf(
                            'تله'
                        );


                    if (trap === -1)
                        break;


                    const opponent =
                        room.players.find(
                            p => p.id !== sid
                        );


                    if (!opponent)
                        break;


                    const card =
                        d.data?.card;


                    if (
                        !card ||
                        !opponent.hand.includes(card)
                    ) {
                        break;
                    }


                    player.hand.splice(
                        trap,
                        1
                    );


                    const targetIndex =
                        opponent.hand.indexOf(
                            card
                        );


                    if (targetIndex !== -1) {

                        opponent.hand.splice(
                            targetIndex,
                            1
                        );
                    }


                    actionDone = true;

                    break;
                }


                /* =====================
                   DRAW
                ===================== */

                case 'draw': {

                    if (
                        room.deck.length > 0
                    ) {

                        player.hand.push(
                            room.deck.pop()
                        );

                        actionDone = true;
                    }

                    break;
                }


                /* =====================
                   DISCARD
                ===================== */

                case 'discard': {

                    const card =
                        d.data?.card;


                    if (!card)
                        break;


                    const index =
                        player.hand.indexOf(
                            card
                        );


                    if (index === -1)
                        break;


                    const removed =
                        player.hand.splice(
                            index,
                            1
                        )[0];


                    room.discardPile.push(
                        removed
                    );


                    actionDone = true;

                    break;
                }


                /* =====================
                   END TURN
                ===================== */

                case 'endTurn': {

                    actionDone = true;

                    break;
                }
            }


            if (!actionDone)
                return;


            /* پر کردن دست تا ۴ کارت */

            while (
                player.hand.length < 4 &&
                room.deck.length > 0
            ) {

                player.hand.push(
                    room.deck.pop()
                );
            }


            /* اگر دسته تمام شد */
            if (
                room.deck.length === 0 &&
                room.discardPile.length > 0
            ) {

                room.deck =
                    this.shuffle(
                        [...room.discardPile]
                    );

                room.discardPile = [];
            }


            /* بررسی برنده */

            for (
                const p of room.players
            ) {

                if (p.chicks >= 3) {

                    room.winner = p.id;

                    break;
                }
            }


            /* تغییر نوبت */

            if (!room.winner) {

                const currentIndex =
                    room.players.findIndex(
                        p =>
                            p.id ===
                            room.currentTurn
                    );


                const nextIndex =
                    (
                        currentIndex + 1
                    ) %
                    room.players.length;


                room.currentTurn =
                    room.players[nextIndex].id;
            }


            /* ثبت نتیجه */

            if (room.winner) {

                for (
                    const p of room.players
                ) {

                    if (!p.accountId)
                        continue;


                    const profile =
                        this.recordGameResult(
                            p.accountId,
                            p.id === room.winner
                        );


                    if (profile) {

                        this.sendTo(
                            p.id,
                            'profileData',
                            { profile }
                        );
                    }
                }
            }


            await this.save();


            this.broadcastRoom(
                roomId,
                'gameState',
                room
            );

            return;
        }


        /* ================================================
           CHAT
        ================================================= */

        if (type === 'chatMessage') {

            const room =
                this.data.rooms[
                    String(
                        d.roomId || ''
                    ).toUpperCase()
                ];


            if (!room)
                return;


            const player =
                room.players.find(
                    p => p.id === sid
                );


            if (!player)
                return;


            this.broadcastRoom(
                String(d.roomId).toUpperCase(),
                'chatMessage',
                {

                    sender:
                        player.name,

                    message:
                        String(
                            d.message || ''
                        ).slice(0, 2000),

                    time:
                        new Date()
                            .toLocaleTimeString()
                }
            );

            return;
        }


        /* ================================================
           CHAT MEDIA
        ================================================= */

        if (type === 'chatMedia') {

            const room =
                this.data.rooms[
                    String(
                        d.roomId || ''
                    ).toUpperCase()
                ];


            if (!room ||
                !d.content)
                return;


            const player =
                room.players.find(
                    p => p.id === sid
                );


            const watcher =
                room.watchers?.includes(
                    sid
                );


            if (!player && !watcher)
                return;


            const kind =
                d.kind;


            if (
                !['file', 'gif', 'sticker']
                    .includes(kind)
            ) {
                return;
            }


            const content =
                String(d.content);


            if (
                content.length >
                7 * 1024 * 1024
            ) {
                return;
            }


            if (kind === 'file') {

                const name =
                    String(
                        d.name ||
                        'file'
                    );


                if (
                    /\.(exe|bat|cmd|com|scr|msi|ps1|vbs|js)$/i
                        .test(name)
                ) {
                    return;
                }


                if (
                    Number(d.size || 0) >
                    5 * 1024 * 1024
                ) {
                    return;
                }
            }


            if (
                kind === 'gif' &&
                d.mime &&
                d.mime !== 'image/gif'
            ) {
                return;
            }


            this.broadcastRoom(
                String(d.roomId).toUpperCase(),
                'chatMedia',
                {

                    sender:
                        player?.name ||
                        'تماشاگر',

                    kind,

                    content,

                    name: d.name,

                    mime: d.mime,

                    size: d.size,

                    time:
                        new Date()
                            .toLocaleTimeString()
                }
            );

            return;
        }


        /* ================================================
           LEAVE
        ================================================= */

        if (type === 'leaveGame') {

            const roomId =
                String(
                    d.roomId || ''
                ).toUpperCase();


            const room =
                this.data.rooms[roomId];


            if (room) {

                room.players =
                    room.players.filter(
                        p => p.id !== sid
                    );


                room.watchers =
                    (room.watchers || [])
                        .filter(
                            id => id !== sid
                        );


                if (
                    room.players.length === 0
                ) {

                    delete this.data.rooms[
                        roomId
                    ];

                } else {

                    room.host =
                        room.players[0].id;


                    room.currentTurn =
                        room.players[0].id;


                    this.broadcastRoom(
                        roomId,
                        'gameState',
                        room
                    );


                    this.broadcastRoom(
                        roomId,
                        'roomUpdate',
                        room
                    );


                    this.broadcastRoom(
                        roomId,
                        'webrtc-peer-left',
                        {
                            peerId: sid
                        }
                    );
                }
            }


            const online =
                this.data.onlinePlayers[sid];


            if (online) {

                online.status =
                    'ready';

                online.quickQueue =
                    false;
            }


            await this.save();

            this.updatePlayerList();

            return;
        }


        /* ================================================
           WEBRTC
        ================================================= */

        if (
            type === 'webrtc-offer' ||
            type === 'webrtc-answer' ||
            type === 'webrtc-ice-candidate'
        ) {

            const to =
                d.to;


            if (
                !to ||
                !this.playersShareRoom(
                    sid,
                    to
                )
            ) {
                return;
            }


            this.sendTo(
                to,
                type,
                {
                    from: sid,

                    offer:
                        d.offer,

                    answer:
                        d.answer,

                    candidate:
                        d.candidate
                }
            );

            return;
        }


        /* ================================================
           REMATCH
        ================================================= */

        if (type === 'rematchRequest') {

            const target =
                this.data.onlinePlayers[
                    d.targetId
                ];

            const requester =
                this.data.onlinePlayers[sid];


            if (!target || !requester)
                return;


            this.sendTo(
                target.id,
                'rematchRequest',
                {

                    fromId: sid,

                    fromName:
                        requester.name,

                    roomId:
                        d.roomId ||
                        null
                }
            );

            return;
        }


        if (type === 'acceptRematch') {

            const target =
                this.data.onlinePlayers[sid];

            const requester =
                this.data.onlinePlayers[
                    d.fromId
                ];


            if (!target || !requester)
                return;


            const oldA =
                this.getRoomForPlayer(
                    sid
                );

            const oldB =
                this.getRoomForPlayer(
                    d.fromId
                );


            if (
                oldA &&
                oldB &&
                oldA.roomId ===
                oldB.roomId
            ) {

                delete this.data.rooms[
                    oldA.roomId
                ];
            }


            target.status = 'playing';

            requester.status = 'playing';


            const roomId =
                this.createPrivateGameRoom(
                    requester,
                    target
                );


            await this.save();


            this.updatePlayerList();


            this.sendTo(
                d.fromId,
                'rematchAccepted',
                { roomId }
            );


            this.sendTo(
                sid,
                'gameStarted',
                { roomId }
            );

            return;
        }


        if (type === 'rejectRematch') {

            const player =
                this.data.onlinePlayers[sid];


            this.sendTo(
                d.fromId,
                'rematchRejected',
                {
                    byName:
                        player?.name ||
                        'حریف'
                }
            );

            return;
        }
    }


    async fetch(request) {

        await this.ready;


        if (
            request.headers.get(
                'Upgrade'
            ) !== 'websocket'
        ) {

            return new Response(
                'WebSocket endpoint',
                {
                    status: 426
                }
            );
        }


        const pair =
            new WebSocketPair();


        const client =
            pair[0];

        const server =
            pair[1];


        server.accept();


        const sid =
            crypto.randomUUID();


        this.sessions.set(
            sid,
            server
        );


        server.addEventListener(
            'message',
            event =>
                this.onMessage(
                    sid,
                    event.data
                )
        );


        server.addEventListener(
            'close',
            () =>
                this.onClose(sid)
        );


        server.addEventListener(
            'error',
            () =>
                this.onClose(sid)
        );


        return new Response(
            null,
            {
                status: 101,
                webSocket: client
            }
        );
    }


    async onClose(sid) {

        await this.ready;


        delete this.data.onlinePlayers[
            sid
        ];


        delete this.data.pendingRequests[
            sid
        ];


        for (
            const requests
            of Object.values(
                this.data.pendingRequests
            )
        ) {

            for (
                const request
                of requests
            ) {

                if (
                    request.fromId === sid
                ) {
                    request.cancelled = true;
                }
            }
        }


        for (
            const [roomId, room]
            of Object.entries(
                this.data.rooms
            )
        ) {

            const wasPlayer =
                room.players?.some(
                    p => p.id === sid
                );


            if (wasPlayer) {

                room.players =
                    room.players.filter(
                        p => p.id !== sid
                    );
            }


            room.watchers =
                (room.watchers || [])
                    .filter(
                        id => id !== sid
                    );


            if (
                room.players.length === 0
            ) {

                delete this.data.rooms[
                    roomId
                ];

            } else if (wasPlayer) {

                room.host =
                    room.players[0].id;


                room.currentTurn =
                    room.players[0].id;


                this.broadcastRoom(
                    roomId,
                    'gameState',
                    room
                );


                this.broadcastRoom(
                    roomId,
                    'webrtc-peer-left',
                    {
                        peerId: sid
                    }
                );
            }
        }


        this.sessions.delete(sid);


        await this.save();


        this.updatePlayerList();
    }
}


/* =========================================================
   WORKER
========================================================= */

export default {

    async fetch(request, env) {

        const url =
            new URL(request.url);


        /* سلامت */

        if (
            url.pathname ===
            '/healthz'
        ) {

            return new Response(
                'ok',
                {
                    headers: {
                        'content-type':
                            'text/plain; charset=utf-8'
                    }
                }
            );
        }


        /* Socket.IO shim */

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

        if (
            url.pathname === '/ws'
        ) {

            const id =
                env.GAME_ROOM.idFromName(
                    'morgdoni-global'
                );


            const room =
                env.GAME_ROOM.get(id);


            return room.fetch(
                request
            );
        }


        /*
           فایل‌های پروژه از Assets
        */

        let assetPath =
            url.pathname;


        if (
            assetPath === '/'
        ) {

            assetPath =
                '/index.html';
        }


        const assetRequest =
            new Request(
                new URL(
                    assetPath,
                    request.url
                ),
                request
            );


        return env.ASSETS.fetch(
            assetRequest
        );
    }
};
