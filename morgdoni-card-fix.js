(() => {
  'use strict';

  /* ===================== کارت‌ها ===================== */
  const MAP = {
    'مرغ': 'cards/Hen.png',
    'خروس': 'cards/Rooster.png',
    'لانه': 'cards/Nest.png',
    'روباه': 'cards/Fox.png',
    'تله': 'cards/Trap.png',
    'مار': 'cards/Snake.png'
  };
  const LABEL = { 'مرغ':'مرغ','خروس':'خروس','لانه':'لانه','روباه':'روباه','تله':'تله','مار':'مار' };
  const norm = s => String(s || '').replace(/\s+/g,' ').trim();
  function cardType(el) {
    const explicit = el.getAttribute('data-card') || el.dataset?.card || '';
    if (MAP[explicit]) return explicit;
    const text = norm(el.textContent);
    for (const k of Object.keys(MAP)) if (text.includes(k)) return k;
    return null;
  }
  function paint(el) {
    if (!(el instanceof HTMLElement) || el.classList.contains('card-back')) return;
    const type = cardType(el); if (!type) return;
    const src = MAP[type];
    let img = el.querySelector('img.morgdoni-card-image');
    if (!img) {
      el.querySelectorAll('span').forEach(s => { s.style.display='none'; });
      img = document.createElement('img');
      img.className='morgdoni-card-image';
      img.alt = LABEL[type];
      img.draggable = false;
      el.prepend(img);
    }
    if (img.getAttribute('src') !== src) img.src = src;
    el.setAttribute('data-card', type);
    el.setAttribute('aria-label', LABEL[type]);
  }
  function scan(root=document) { root.querySelectorAll('.card').forEach(paint); }

  const style = document.createElement('style');
  style.textContent = `
    .card { overflow:hidden !important; position:relative !important; }
    .card .morgdoni-card-image { width:100% !important; height:100% !important; object-fit:contain !important; display:block !important; pointer-events:none !important; border-radius:inherit !important; }
    .card.selected .morgdoni-card-image { filter:brightness(1.08) !important; }
  `;
  document.head.appendChild(style);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => scan()); else scan();
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches?.('.card')) paint(n);
      n.querySelectorAll?.('.card').forEach(paint);
    }
  }).observe(document.documentElement, {subtree:true, childList:true});
  window.MORG_DONI_CARD_IMAGES = MAP;

  /* ===================== دوربین بازی دونفره =====================
     در نسخه Cloudflare، socket.id اولیه‌ی شیم با شناسه‌ی WebSocket سرور
     یکی نیست. این باعث می‌شد openCam مقدار otherPlayerId نداشته باشد.
     اینجا socket واقعی برنامه و gameState را قبل از اجرای کد اصلی ثبت می‌کنیم
     و دکمه دوربین را با همان WebSocket موجود بازی متصل می‌کنیم.
  ================================================================ */
  const originalIO = window.io;
  if (typeof originalIO === 'function' && !window.__MORG_IO_WRAPPED__) {
    window.__MORG_IO_WRAPPED__ = true;
    window.io = function(...args) {
      const s = originalIO.apply(this, args);
      window.__MORG_SOCKET__ = s;
      return s;
    };
  }

  let camSocket = null;
  let camState = null;
  let camMyId = null;
  let camRoomId = null;
  let camPc = null;
  let camStream = null;
  let camPendingIce = [];
  let camBusy = false;

  function getRoomIdFromPage() {
    const a = document.getElementById('roomCodeSpan');
    const b = document.getElementById('roomCodeTop');
    const v = String((a?.innerText || b?.innerText || '')).trim();
    return v && !v.includes('اتاق') ? v : null;
  }

  function findOpponent(state) {
    if (!state?.players || !Array.isArray(state.players) || state.players.length < 2) return null;
    const me = camMyId || window.__MORG_SOCKET__?.id;
    return state.players.find(p => String(p.id || p.socketId) !== String(me)) || state.players[1];
  }

  function ensureVideo(id, muted=false) {
    let v = document.getElementById(id);
    if (!v) {
      v = document.createElement('video');
      v.id = id;
      v.autoplay = true;
      v.playsInline = true;
      v.muted = muted;
      v.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:18px;display:block;';
      document.body.appendChild(v);
    }
    return v;
  }

  function showCameraPanel(on) {
    const panel = document.getElementById('cameraPanel');
    if (panel) panel.style.display = on ? 'block' : 'none';
    const btn = document.getElementById('cameraBtn');
    const off = document.getElementById('cameraOffBtn');
    if (btn) btn.style.display = on ? 'none' : '';
    if (off) off.style.display = on ? '' : 'none';
  }

  function getRemoteVideo() {
    let v = document.getElementById('remoteVideo');
    if (!v) {
      v = ensureVideo('remoteVideo');
      v.style.cssText = 'position:fixed;right:12px;bottom:12px;width:220px;height:165px;object-fit:cover;border-radius:18px;z-index:2999;display:none;background:#111;';
    }
    return v;
  }

  async function flushIce() {
    if (!camPc || !camPc.remoteDescription) return;
    const q = camPendingIce.splice(0);
    for (const c of q) {
      try { await camPc.addIceCandidate(c); } catch (e) { console.warn('ICE:', e); }
    }
  }

  function setupCamSocket() {
    const s = window.__MORG_SOCKET__;
    if (!s || camSocket === s) return;
    camSocket = s;
    camMyId = s.id;

    s.on('registrationSuccess', data => {
      if (data?.id) camMyId = data.id;
    });
    s.on('gameStarted', data => {
      if (data?.roomId) camRoomId = data.roomId;
    });
    s.on('roomUpdate', state => {
      if (state?.players?.length >= 2) camState = state;
    });
    s.on('gameState', state => {
      if (state?.players) {
        camState = state;
        if (state.roomId) camRoomId = state.roomId;
      }
    });

    s.on('webrtc-offer', async ({from, offer} = {}) => {
      if (!from || !offer) return;
      try {
        const pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]});
        camPc?.close();
        camPc = pc;
        pc.onicecandidate = e => { if (e.candidate) s.emit('webrtc-ice-candidate',{to:from,candidate:e.candidate}); };
        pc.ontrack = e => {
          const v = getRemoteVideo();
          v.srcObject = e.streams[0];
          v.style.display = 'block';
          v.play?.().catch(()=>{});
        };
        pc.addTransceiver('video',{direction:'recvonly'});
        await pc.setRemoteDescription(offer);
        await flushIce();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        s.emit('webrtc-answer',{to:from,answer:pc.localDescription});
      } catch (e) { console.error('Camera offer error:', e); }
    });

    s.on('webrtc-answer', async ({answer} = {}) => {
      if (!camPc || !answer) return;
      try { await camPc.setRemoteDescription(answer); await flushIce(); } catch (e) { console.warn('Camera answer:', e); }
    });

    s.on('webrtc-ice-candidate', async ({candidate} = {}) => {
      if (!candidate) return;
      if (!camPc || !camPc.remoteDescription) camPendingIce.push(candidate);
      else try { await camPc.addIceCandidate(candidate); } catch (e) { console.warn('Camera ICE:', e); }
    });
  }

  async function fixedOpenCam() {
    setupCamSocket();
    const socket = camSocket;
    if (!socket) { alert('اتصال بازی آماده نیست.'); return; }

    camRoomId = camRoomId || getRoomIdFromPage();
    if (!camState || !camState.players || camState.players.length < 2) {
      if (camRoomId) socket.emit('getGameState',{roomId:camRoomId});
      await new Promise(r=>setTimeout(r,250));
    }
    const opponent = findOpponent(camState);
    if (!camRoomId || !opponent) {
      alert('بازی دونفره هنوز آماده نشده است.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('مرورگر اجازه دسترسی به دوربین را در این آدرس نمی‌دهد.');
      return;
    }
    if (camBusy) return;
    camBusy = true;
    try {
      camStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
      const local = document.getElementById('cameraVideo');
      if (local) { local.srcObject = camStream; local.play?.().catch(()=>{}); }
      showCameraPanel(true);

      camPc?.close();
      camPendingIce = [];
      const pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.cloudflare.com:3478'}]});
      camPc = pc;
      pc.onicecandidate = e => { if (e.candidate) socket.emit('webrtc-ice-candidate',{to:opponent.id || opponent.socketId,candidate:e.candidate}); };
      pc.ontrack = e => {
        const v = getRemoteVideo();
        v.srcObject = e.streams[0];
        v.style.display = 'block';
        v.play?.().catch(()=>{});
      };
      camStream.getTracks().forEach(t=>pc.addTrack(t,camStream));
      await pc.setLocalDescription(await pc.createOffer());
      socket.emit('webrtc-offer',{to:opponent.id || opponent.socketId,offer:pc.localDescription});
    } catch (e) {
      console.error(e);
      if (camStream) camStream.getTracks().forEach(t=>t.stop());
      camStream = null;
      showCameraPanel(false);
      alert('اجازه دوربین داده نشد.');
    } finally { camBusy = false; }
  }

  function fixedCloseCam() {
    if (camStream) camStream.getTracks().forEach(t=>t.stop());
    camStream = null;
    if (camPc) { try { camPc.close(); } catch {} }
    camPc = null;
    camPendingIce = [];
    const local = document.getElementById('cameraVideo');
    if (local) local.srcObject = null;
    const remote = document.getElementById('remoteVideo');
    if (remote) { remote.srcObject = null; remote.style.display = 'none'; }
    showCameraPanel(false);
  }

  function installCameraFix() {
    setupCamSocket();
    const btn = document.getElementById('cameraBtn');
    const off = document.getElementById('cameraOffBtn');
    if (btn) btn.onclick = fixedOpenCam;
    if (off) off.onclick = fixedCloseCam;
  }

  function waitForCamera() {
    installCameraFix();
    let tries = 0;
    const timer = setInterval(() => {
      installCameraFix();
      if (++tries > 40) clearInterval(timer);
    },250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForCamera);
  else waitForCamera();
  window.MORG_DONI_CAMERA_FIX = true;
})();
