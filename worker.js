const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const db = require('./db');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { maxHttpBufferSize: 8 * 1024 * 1024 });

app.use(express.static('.'));

const rooms = {};
const onlinePlayers = {}; // { socketId: { id, name, status, socketId } }
const pendingRequests = {}; // { targetId: { fromId, fromName, timestamp } }
const quickQueue = new Set();

function createDeck() {
    let deck = [];
    for (let i = 0; i < 21; i++) deck.push('مرغ');
    for (let i = 0; i < 21; i++) deck.push('خروس');
    for (let i = 0; i < 12; i++) deck.push('لانه');
    for (let i = 0; i < 7; i++) deck.push('روباه');
    for (let i = 0; i < 3; i++) deck.push('تله');
    for (let i = 0; i < 2; i++) deck.push('مار');
    return shuffle(deck);
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function updatePlayerList() {
    const list = Object.values(onlinePlayers).map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        socketId: p.socketId,
        avatar: p.avatar || '🐔'
    }));
    io.emit('playerListUpdate', list);
}

function findAvailablePlayers() {
    return Object.values(onlinePlayers).filter(p => p.status === 'ready' && !quickQueue.has(p.socketId));
}

function getRoomForPlayer(playerId) {
    for (const [roomId, room] of Object.entries(rooms)) {
        if (room.players.some(p => p.id === playerId)) return { roomId, room, role: 'player' };
        if ((room.watchers || []).includes(playerId)) return { roomId, room, role: 'watcher' };
    }
    return null;
}

function broadcastRoom(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    io.to(roomId).emit('gameState', room);
    io.to(roomId).emit('roomUpdate', room);
}

function removeFromQuickQueue(playerId) {
    quickQueue.delete(playerId);
}

function playersShareRoom(idA, idB) {
    for (const rid in rooms) {
        const players = rooms[rid].players;
        if (players.some(p => p.id === idA) && players.some(p => p.id === idB)) {
            return true;
        }
    }
    return false;
}

io.on('connection', (socket) => {
    console.log('✅ کاربر متصل:', socket.id);

    socket.on('registerPlayer', ({ playerName, accountId, avatar }) => {
        if (onlinePlayers[socket.id]) {
            onlinePlayers[socket.id].name = playerName;
            onlinePlayers[socket.id].status = 'ready';
            if (accountId) onlinePlayers[socket.id].accountId = accountId;
            if (avatar) onlinePlayers[socket.id].avatar = avatar;
            socket.emit('registrationSuccess', { id: socket.id, name: playerName });
            updatePlayerList();
            return;
        }
        const existing = Object.values(onlinePlayers).find(p => p.name === playerName && p.socketId !== socket.id);
        if (existing) {
            socket.emit('registrationError', 'این نام قبلاً توسط بازیکن دیگری استفاده می‌شود');
            return;
        }
        onlinePlayers[socket.id] = {
            id: socket.id,
            name: playerName,
            status: 'ready',
            socketId: socket.id,
            accountId: accountId || null,
            avatar: avatar || '🐔'
        };
        socket.emit('registrationSuccess', { id: socket.id, name: playerName });
        updatePlayerList();
        console.log(`👤 ${playerName} وارد لابی شد`);
    });

    socket.on('getPlayerList', () => {
        updatePlayerList();
    });

    // ===== حساب کاربری و پروفایل =====
    socket.on('loadProfile', ({ accountId }) => {
        const profile = db.getAccount(accountId);
        socket.emit('profileData', { profile });
    });

    socket.on('saveProfile', ({ accountId, username, avatar }) => {
        if (!accountId) {
            socket.emit('profileError', 'شناسه حساب نامعتبر است');
            return;
        }
        if (!db.isValidUsername(username)) {
            socket.emit('profileError', 'نام کاربری باید بین ۲ تا ۲۰ کاراکتر باشد');
            return;
        }
        if (avatar && !db.isValidAvatar(avatar)) {
            socket.emit('profileError', 'آواتار نامعتبر است یا حجم آن زیاد است');
            return;
        }
        if (db.usernameTaken(username, accountId)) {
            socket.emit('profileError', 'این نام کاربری قبلاً استفاده شده است');
            return;
        }
        const profile = db.createOrUpdateAccount(accountId, { username, avatar });
        socket.emit('profileData', { profile });

        // اگر این بازیکن هم‌اکنون در لابی حضور دارد، نام/آواتار او در لیست آنلاین هم به‌روز شود
        if (onlinePlayers[socket.id] && onlinePlayers[socket.id].accountId === accountId) {
            onlinePlayers[socket.id].name = profile.username;
            onlinePlayers[socket.id].avatar = profile.avatar;
            updatePlayerList();
        }
    });

    socket.on('getProfile', ({ targetId }) => {
        const target = onlinePlayers[targetId];
        if (!target) {
            socket.emit('profileInfoError', 'بازیکن یافت نشد');
            return;
        }
        const account = target.accountId ? db.getAccount(target.accountId) : null;
        socket.emit('profileInfo', {
            id: target.id,
            name: target.name,
            avatar: target.avatar || '🐔',
            gamesPlayed: account?.gamesPlayed || 0,
            wins: account?.wins || 0,
            losses: account?.losses || 0
        });
    });

    // ✅ اصلاح شده: اجازه درخواست بازی حتی اگر بازیکن در حال بازی باشد
    socket.on('requestGame', ({ targetId }) => {
        const player = onlinePlayers[socket.id];
        const target = onlinePlayers[targetId];

        if (!player || !target) {
            socket.emit('gameRequestError', 'بازیکن مورد نظر یافت نشد');
            return;
        }

        // دیگر وضعیت playing را چک نمی‌کنیم تا امکان درخواست حین بازی فراهم شود
        // فقط چک می‌کنیم که خود فرد بیکار باشد (یا در حال بازی نباشد اگر قانون سخت‌گیرانه است، اما طبق خواسته شما مجاز است)
        
        // ثبت درخواست
        if (!pendingRequests[targetId]) pendingRequests[targetId] = [];
        pendingRequests[targetId] = pendingRequests[targetId].filter(r => r.fromId !== socket.id);
        pendingRequests[targetId].push({
            fromId: socket.id,
            fromName: player.name,
            timestamp: Date.now()
        });

        removeFromQuickQueue(socket.id);
        if (player.status === 'ready') player.status = 'requesting';
        updatePlayerList();

        // ارسال درخواست به طرف مقابل (چه در لابی باشد چه در بازی)
        io.to(targetId).emit('gameRequest', {
            fromId: socket.id,
            fromName: player.name
        });
        
        console.log(`📨 ${player.name} درخواست بازی به ${target.name} فرستاد`);
    });

    socket.on('acceptGame', ({ fromId }) => {
        const player = onlinePlayers[socket.id];
        const requester = onlinePlayers[fromId];
        if (!player || !requester) {
            socket.emit('gameError', 'بازیکن یافت نشد');
            return;
        }
        pendingRequests[socket.id] = (pendingRequests[socket.id] || []).filter(r => r.fromId !== fromId);
        if (!pendingRequests[socket.id].length) delete pendingRequests[socket.id];
        removeFromQuickQueue(fromId);

        const current = getRoomForPlayer(socket.id);
        if (current && current.role === 'player') {
            socket.emit('busyGameChoice', {
                fromId,
                fromName: requester.name,
                roomId: current.roomId,
                message: `${requester.name} می‌خواهد وارد بازی شما شود`
            });
            return;
        }

        player.status = 'playing';
        requester.status = 'playing';
        updatePlayerList();
        createPrivateGameRoom(requester, player);
    });

    socket.on('chooseGameOption', ({ fromId, option }) => {
        const target = onlinePlayers[socket.id];
        const requester = onlinePlayers[fromId];
        if (!target || !requester || !['join', 'watch'].includes(option)) return;
        const current = getRoomForPlayer(socket.id);
        if (!current || current.role !== 'player') {
            socket.emit('gameError', 'بازی فعلی پیدا نشد');
            return;
        }
        const room = current.room;
        if (option === 'join') {
            const already = room.players.some(p => p.id === requester.id);
            if (!already) {
                const requesterRoom = getRoomForPlayer(requester.id);
                if (requesterRoom) {
                    if (requesterRoom.role === 'watcher') requesterRoom.room.watchers = requesterRoom.room.watchers.filter(id => id !== requester.id);
                    else {
                        socket.emit('gameError', 'این بازیکن خودش در یک بازی دیگر است');
                        return;
                    }
                }
                const newPlayer = { id: requester.id, name: requester.name, hand: [], eggs: 0, chicks: 0 };
                for (let i = 0; i < 4 && room.deck.length > 0; i++) newPlayer.hand.push(room.deck.pop());
                room.players.push(newPlayer);
            }
            requester.status = 'playing';
            requester.socketId = requester.id;
            io.sockets.sockets.get(requester.id)?.join(current.roomId);
            io.to(requester.id).emit('joinExistingGame', { roomId: current.roomId, room, mode: 'player' });
            broadcastRoom(current.roomId);
            io.to(current.roomId).emit('gameNotice', { message: `👥 ${requester.name} به بازی پیوست` });
        } else {
            room.watchers = room.watchers || [];
            if (!room.watchers.includes(requester.id)) room.watchers.push(requester.id);
            requester.status = 'watching';
            io.sockets.sockets.get(requester.id)?.join(current.roomId);
            io.to(requester.id).emit('joinExistingGame', { roomId: current.roomId, room, mode: 'watcher' });
            io.to(current.roomId).emit('gameNotice', { message: `👀 ${requester.name} وارد تماشا شد` });
        }
        updatePlayerList();
    });

    socket.on('rejectGame', ({ fromId }) => {
        const player = onlinePlayers[socket.id];
        const requester = onlinePlayers[fromId];
        
        // بازگرداندن وضعیت‌ها فقط اگر در حالت انتظار بودند
        if (player && player.status === 'requested') player.status = 'ready';
        if (requester && requester.status === 'requesting') requester.status = 'ready';

        if (pendingRequests[socket.id]) {
            pendingRequests[socket.id] = pendingRequests[socket.id].filter(r => r.fromId !== fromId);
            if (!pendingRequests[socket.id].length) delete pendingRequests[socket.id];
        }
        updatePlayerList();
        
        io.to(fromId).emit('gameRejected', { byName: player?.name || 'بازیکن' });
        console.log(`❌ درخواست بازی رد شد`);
    });

    socket.on('quickGame', () => {
        const player = onlinePlayers[socket.id];
        if (!player) return socket.emit('quickGameError', 'بازیکن یافت نشد');
        if (player.status !== 'ready') return socket.emit('quickGameError', 'ابتدا باید آماده باشید');

        quickQueue.add(socket.id);
        player.status = 'requesting';
        updatePlayerList();
        socket.emit('quickGameQueued');

        const waiting = [...quickQueue].map(id => onlinePlayers[id]).filter(Boolean).filter(p => p.status === 'requesting');
        while (waiting.length >= 2) {
            const a = waiting.shift();
            const b = waiting.shift();
            quickQueue.delete(a.id);
            quickQueue.delete(b.id);
            if (!onlinePlayers[a.id] || !onlinePlayers[b.id]) continue;
            a.status = 'playing';
            b.status = 'playing';
            createPrivateGameRoom(a, b);
        }
        updatePlayerList();
    });

    function createPrivateGameRoom(playerA, playerB) {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        const roomPlayers = [
            { id: playerA.id, name: playerA.name },
            { id: playerB.id, name: playerB.name }
        ];
        rooms[roomId] = {
            host: playerA.id,
            players: roomPlayers.map(p => ({
                id: p.id,
                name: p.name,
                hand: [],
                eggs: 0,
                chicks: 0
            })),
            gameStarted: false,
            deck: createDeck(),
            eggTokens: 18,
            currentTurn: null,
            winner: null,
            discardPile: [],
            watchers: []
        };

        io.sockets.sockets.get(playerA.id)?.join(roomId);
        io.sockets.sockets.get(playerB.id)?.join(roomId);

        playerA.status = 'playing';
        playerB.status = 'playing';
        updatePlayerList();

        startGameInRoom(roomId);

        io.to(roomId).emit('gameStarted', { roomId });
        io.to(roomId).emit('gameState', rooms[roomId]);
        console.log(`🎮 بازی بین ${playerA.name} و ${playerB.name} در اتاق ${roomId} شروع شد`);
        return roomId;
    }

    function startGameInRoom(roomId) {
        const room = rooms[roomId];
        if (!room) return;
        room.gameStarted = true;
        room.players.forEach(p => {
            for (let i = 0; i < 4; i++) {
                if (room.deck.length > 0) p.hand.push(room.deck.pop());
            }
        });
        room.currentTurn = room.players[0].id;
        io.to(roomId).emit('gameState', room);
    }

    socket.on('getGameState', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            socket.emit('gameState', room);
        }
    });

    socket.on('gameAction', ({ roomId, action, data }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player || room.currentTurn !== socket.id) return;

        let actionDone = false;

        switch (action) {
            case 'lay': {
                const henIdx = player.hand.indexOf('مرغ');
                const roosterIdx = player.hand.indexOf('خروس');
                const nestIdx = player.hand.indexOf('لانه');
                if (henIdx !== -1 && roosterIdx !== -1 && nestIdx !== -1 && room.eggTokens > 0) {
                    player.hand.splice(henIdx, 1);
                    player.hand.splice(roosterIdx, 1);
                    player.hand.splice(nestIdx, 1);
                    player.eggs++;
                    room.eggTokens--;
                    actionDone = true;
                }
                break;
            }
            case 'hatch': {
                const hens = player.hand.filter(c => c === 'مرغ').length;
                if (hens >= 2 && player.eggs > 0) {
                    let removed = 0;
                    for (let i = 0; i < player.hand.length && removed < 2; i++) {
                        if (player.hand[i] === 'مرغ') {
                            player.hand.splice(i, 1);
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
            case 'fox': {
                const foxIdx = player.hand.indexOf('روباه');
                if (foxIdx === -1) break;
                const opponent = room.players.find(p => p.id !== socket.id);
                if (!opponent || opponent.eggs === 0) break;
                player.hand.splice(foxIdx, 1);
                if (opponent.hand.filter(c => c === 'خروس').length >= 2) {
                    let removed = 0;
                    for (let i = 0; i < opponent.hand.length && removed < 2; i++) {
                        if (opponent.hand[i] === 'خروس') {
                            opponent.hand.splice(i, 1);
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
            case 'snake': {
                const snakeIdx = player.hand.indexOf('مار');
                if (snakeIdx === -1) break;
                const opponent = room.players.find(p => p.id !== socket.id);
                if (!opponent || opponent.eggs === 0) break;
                const count = data?.count || 1;
                player.hand.splice(snakeIdx, 1);
                const broken = Math.min(opponent.eggs, count);
                opponent.eggs -= broken;
                room.eggTokens += broken;
                actionDone = true;
                break;
            }
            case 'trap': {
                const trapIdx = player.hand.indexOf('تله');
                if (trapIdx === -1) break;
                const opponent = room.players.find(p => p.id !== socket.id);
                if (!opponent) break;
                const cardName = data?.card;
                if (!cardName || !opponent.hand.includes(cardName)) break;
                player.hand.splice(trapIdx, 1);
                const ridx = opponent.hand.indexOf(cardName);
                if (ridx !== -1) opponent.hand.splice(ridx, 1);
                actionDone = true;
                break;
            }
            case 'draw': {
                if (room.deck.length > 0) {
                    player.hand.push(room.deck.pop());
                    actionDone = true;
                }
                break;
            }
            case 'discard': {
                const cardToDiscard = data?.card;
                if (!cardToDiscard) break;
                const cardIndex = player.hand.indexOf(cardToDiscard);
                if (cardIndex === -1) break;
                const removed = player.hand.splice(cardIndex, 1)[0];
                if (!room.discardPile) room.discardPile = [];
                room.discardPile.push(removed);
                actionDone = true;
                console.log(`🗑️ ${player.name} کارت ${removed} را باطل کرد`);
                break;
            }
            case 'endTurn': {
                actionDone = true;
                break;
            }
        }

        if (actionDone) {
            while (player.hand.length < 4 && room.deck.length > 0) {
                player.hand.push(room.deck.pop());
            }
            if (room.deck.length === 0 && room.discardPile?.length > 0) {
                room.deck = shuffle([...room.discardPile]);
                room.discardPile = [];
            }
            for (let p of room.players) {
                if (p.chicks >= 3) {
                    room.winner = p.id;
                    break;
                }
            }
            if (!room.winner) {
                const currentIdx = room.players.findIndex(p => p.id === room.currentTurn);
                const nextIdx = (currentIdx + 1) % room.players.length;
                room.currentTurn = room.players[nextIdx].id;
            }
            io.to(roomId).emit('gameState', room);

            if (room.winner) {
                room.players.forEach(p => {
                    const onlinePlayer = onlinePlayers[p.id];
                    if (onlinePlayer && onlinePlayer.accountId) {
                        const updatedProfile = db.recordGameResult(onlinePlayer.accountId, p.id === room.winner);
                        if (updatedProfile) {
                            io.to(p.id).emit('profileData', { profile: updatedProfile });
                        }
                    }
                });
            }
        }
    });


    socket.on('chatMedia', ({ roomId, kind, content, name, mime, size }) => {
        const room = rooms[roomId];
        if (!room || !content) return;
        const player = room.players.find(p => p.id === socket.id);
        const watcher = (room.watchers || []).includes(socket.id);
        if (!player && !watcher) return;
        const senderName = player?.name || onlinePlayers[socket.id]?.name || 'تماشاگر';
        const text = String(content);
        const allowedKinds = ['file','gif','sticker'];
        if (!allowedKinds.includes(kind)) return;
        if (text.length > 7 * 1024 * 1024) return;
        if (kind === 'file') {
            const safe = String(name || 'file');
            if (/\.(exe|bat|cmd|com|scr|msi|ps1|vbs|js)$/i.test(safe)) return;
            if (Number(size || 0) > 5 * 1024 * 1024) return;
        }
        if (kind === 'gif' && mime && mime !== 'image/gif') return;
        io.to(roomId).emit('chatMedia', {
            sender: senderName, kind, content: text, name, mime, size,
            time: new Date().toLocaleTimeString()
        });
    });

    socket.on('chatMessage', ({ roomId, message }) => {
        const room = rooms[roomId];
        if (!room) return;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;
        io.to(roomId).emit('chatMessage', {
            sender: player.name,
            message: message,
            time: new Date().toLocaleTimeString()
        });
    });

    socket.on('leaveGame', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            room.watchers = (room.watchers || []).filter(id => id !== socket.id);
            socket.leave(roomId);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                broadcastRoom(roomId);
                io.to(roomId).emit('webrtc-peer-left', { peerId: socket.id });
            }
        }
        removeFromQuickQueue(socket.id);
        if (onlinePlayers[socket.id]) {
            onlinePlayers[socket.id].status = 'ready';
            updatePlayerList();
        }
    });

    // ================= WEBRTC SIGNALING =================
    // فقط بازیکنانی که در یک room مشترک هستند اجازه دارند سیگنال صوتی/تصویری برای هم بفرستند
    socket.on('webrtc-offer', ({ to, offer }) => {
        if (!playersShareRoom(socket.id, to)) return;
        io.to(to).emit('webrtc-offer', { from: socket.id, offer });
    });

    socket.on('webrtc-answer', ({ to, answer }) => {
        if (!playersShareRoom(socket.id, to)) return;
        io.to(to).emit('webrtc-answer', { from: socket.id, answer });
    });

    socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
        if (!playersShareRoom(socket.id, to)) return;
        io.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
    });
    // ================================================

    
    socket.on('rematchRequest', ({ roomId, targetId }) => {
        const target = onlinePlayers[targetId];
        const requester = onlinePlayers[socket.id];
        if (!target || !requester) return;
        io.to(targetId).emit('rematchRequest', {
            fromId: socket.id,
            fromName: requester.name,
            roomId: roomId || null
        });
    });


    socket.on('acceptRematch', ({ fromId }) => {
        const target = onlinePlayers[socket.id];
        const requester = onlinePlayers[fromId];
        if (!target || !requester) return;
        const oldA = getRoomForPlayer(socket.id);
        const oldB = getRoomForPlayer(fromId);
        if (oldA && oldA.roomId === (oldB && oldB.roomId)) {
            const rid = oldA.roomId;
            const oldRoom = rooms[rid];
            oldRoom.players = oldRoom.players.filter(p => p.id !== socket.id && p.id !== fromId);
            oldRoom.watchers = (oldRoom.watchers || []).filter(id => id !== socket.id && id !== fromId);
            if (oldRoom.players.length === 0) delete rooms[rid];
        }
        target.status='playing'; requester.status='playing';
        const newRoomId=createPrivateGameRoom(requester,target);
        io.to(fromId).emit('rematchAccepted',{roomId:newRoomId});
    });

    socket.on('rejectRematch', ({ fromId }) => {
        const player=onlinePlayers[socket.id];
        if(fromId) io.to(fromId).emit('rematchRejected',{byName:player?.name||'حریف'});
    });

socket.on('disconnect', () => {
        console.log('❌ کاربر قطع شد:', socket.id);
        const player = onlinePlayers[socket.id];
        if (player) {
            if (pendingRequests[socket.id]) {
                for (const req of pendingRequests[socket.id]) {
                    const requester = onlinePlayers[req.fromId];
                    if (requester && requester.status === 'requesting') requester.status = 'ready';
                    if (requester) io.to(req.fromId).emit('gameRequestCancelled', { reason: 'طرف مقابل قطع شد' });
                }
                delete pendingRequests[socket.id];
            }
            for (const targetId in pendingRequests) {
                const requests = pendingRequests[targetId] || [];
                const kept = requests.filter(req => req.fromId !== socket.id);
                if (kept.length !== requests.length) {
                    const target = onlinePlayers[targetId];
                    if (target) io.to(targetId).emit('gameRequestCancelled', { reason: 'طرف مقابل قطع شد' });
                    if (kept.length) pendingRequests[targetId] = kept;
                    else delete pendingRequests[targetId];
                }
            }
            removeFromQuickQueue(socket.id);
            delete onlinePlayers[socket.id];
            updatePlayerList();
        }
        for (let roomId in rooms) {
            const room = rooms[roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            room.watchers = (room.watchers || []).filter(id => id !== socket.id);
            if (room.players.length === 0) {
                delete rooms[roomId];
            } else {
                io.to(roomId).emit('gameState', room);
                io.to(roomId).emit('webrtc-peer-left', { peerId: socket.id });
                updatePlayerList();
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('🐔 سرور مرغ دونی روشن شد');
    console.log(`🌐 http://localhost:${PORT}`);
});
