// A film of a flight, start to finish, with its sound: out of the hangar on foot, aboard, off the pad, out to a mission's
// anchor, the jump, the run in, and through the hull into the ship. Steps for tools/space_shot.mjs:
//   node tools/space_shot.mjs "mute&hangar" tools/space_film.mjs --out <dir> --gpu
// The ship is flown through her own controls (the stick, the keys) by a pilot written here, not moved by hand. The picture is the
// page's own frames as they're drawn (the DevTools screencast); the sound is rendered afterwards from how she flew
// (js/ambience.ts renderFlight: a headless page plays none), and ffmpeg puts the two together: <out>/flight.mp4.
// FILM_MS=<n>: the mission to take (the n-th on the board; default the first boarding).
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
export default async ({ ev, sleep, log, send, on, out }) => {
  const wait = async (js, secs = 30, ms = 100) => { for (let i = 0; i < secs * 1000 / ms; i++) { if (await ev(js)) return true; await sleep(ms); } log('  (gave up waiting for ' + js.slice(0, 70) + ')'); return false; };
  await wait(`!!(G.Game.hub && G.Space.S.on && G.Space.S.kind === 'hub' && G.Me.pos)`); await sleep(1500);

  // ---- in the page: the pilot, the walker, and what the sound is made from
  await ev(`(() => {
    const T = THREE, Sp = G.Space, S = Sp.S, SD = G.SpaceData, F = window.__film = { track: [], t0: performance.now(), wall0: Date.now(), leg: null, walk: null, note: '' };
    const keys = ['KeyW', 'KeyX', 'ShiftLeft', 'Space', 'KeyQ', 'KeyE', 'KeyJ', 'KeyC'];
    // the pilot: nose onto the point (the stick), wings level (Q, E), and a speed for how far there is to go (W, X)
    F.fly = (leg) => { F.leg = leg; };
    const step = () => {
      requestAnimationFrame(step);
      const m = G.Me, L = F.leg;
      if (F.walk) { // on foot: along a line, at a walk
        const w = F.walk, now = performance.now(); w.u = Math.min(1, (now - w.t0) / (w.secs * 1000));
        const e = w.u, i = Math.min(w.pts.length - 2, Math.floor(e * (w.pts.length - 1))), k = e * (w.pts.length - 1) - i, a = w.pts[i], b = w.pts[i + 1];
        m.pos.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k); if (m.vel) m.vel.set(0, 0, 0);
        m.yaw = w.yaw + (w.look ? Math.sin(e * Math.PI * 2) * w.look : 0); m.pitch = 0;
        if (w.u >= 1) F.walk = null;
      }
      if (!L || !S.on || !m.keys) return;
      for (const k of keys) m.keys[k] = false;
      if (S.docked || S.auto || S.ftl) return;
      const to = L.p.clone().sub(S.P), dist = to.length(), loc = to.clone().normalize().applyQuaternion(S.Q.clone().invert());
      const yaw = Math.atan2(-loc.x, -loc.z), pitch = Math.atan2(loc.y, Math.hypot(loc.x, loc.z)), off = Math.hypot(yaw, pitch);
      S.stick.set(G.U.clamp(yaw * 2.2, -1, 1), G.U.clamp(pitch * 2.2, -1, 1));
      const right = new T.Vector3(1, 0, 0).applyQuaternion(S.Q); if (right.y > 0.03) m.keys.KeyE = true; else if (right.y < -0.03) m.keys.KeyQ = true;
      const sp = S.V.length(), want = L.hold ? 0 : off > 0.5 ? Math.min(L.vmin || 10, 25) : G.U.clamp(dist * (L.k || 0.3), L.vmin || 10, L.vmax || S.def.speed);
      if (L.climb && S.P.y < L.climb) { m.keys.Space = true; return; }
      if (L.cruise && dist > L.cruise && off < 0.12) { m.keys.KeyW = true; m.keys.ShiftLeft = true; }
      else if (sp < want - 2 && off < 0.6) m.keys.KeyW = true;
      else if (sp > want + 4) m.keys.KeyX = true;
      else if (sp < want + 1) m.keys.KeyW = off < 0.6;
      if (L.j) m.keys.KeyJ = true;
      F.dist = dist; F.sp = sp; F.off = off;
    };
    requestAnimationFrame(step);
    // her sound's state, twenty times a second (whoever else asks for it, js/ambience.ts update, is listened in on)
    const f = Sp.sound; let calls = 0, seen = 0, last = null, evq = null;
    Sp.sound = (dt) => { const st = f(dt); calls++; last = st; if (st && st.ev) evq = st.ev; return st; };
    setInterval(() => {
      if (calls === seen) Sp.sound(0.05); seen = calls; // (nobody's asking: a page with no sound running)
      const map = G.Game.map, shut = G.Me.seat != null || Sp.sealed();
      F.track.push({ t: (performance.now() - F.t0) / 1000, st: last ? Object.assign({}, last, { ev: evq }) : null, place: map && map.theme ? map.theme.name : null, pk: shut ? 0 : Sp.aboard() ? 0.4 : 1 }); evq = null;
    }, 50);
    F.wav = async (given) => {
      const dt = 0.05, tr = given || F.track, n = Math.ceil(tr[tr.length - 1].t / dt), rows = []; let j = 0, ev = null;
      const quiet = { k: 0, muf: 0, thr: 0, cruise: 0, burn: 0, turn: 0, ftl: 0, ftlK: 0 };
      for (let i = 0; i < n; i++) { ev = null; while (j < tr.length - 1 && tr[j + 1].t <= i * dt) { j++; if (tr[j].st && tr[j].st.ev) ev = tr[j].st.ev; } const q = tr[j]; rows.push(Object.assign({}, q.st || quiet, { ev: ev || (q.st && q.st.ev && i === 0 ? q.st.ev : null), place: q.place, pk: q.pk })); }
      const buf = await G.Ambience.renderFlight(rows, dt), N = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1), b = new ArrayBuffer(44 + N * 4), v = new DataView(b);
      const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
      str(0, 'RIFF'); v.setUint32(4, 36 + N * 4, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, 44100, true); v.setUint32(28, 44100 * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, N * 4, true);
      let pk = 0, sq = 0;
      for (let i = 0; i < N; i++) { const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i])); v.setInt16(44 + i * 4, l * 32767, true); v.setInt16(46 + i * 4, r * 32767, true); pk = Math.max(pk, Math.abs(L[i])); sq += L[i] * L[i]; }
      const u8 = new Uint8Array(b); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      F.b64 = btoa(s); return JSON.stringify({ secs: N / 44100, peak: +pk.toFixed(3), rms: +Math.sqrt(sq / N).toFixed(4), chars: F.b64.length });
    };
  })()`);
  const info = () => ev(`(() => { const S = G.Space.S, F = window.__film; return JSON.stringify({ kind: S.kind, docked: S.docked, ftl: S.ftl && S.ftl.st, sp: Math.round(S.V.length()), dist: Math.round(F.dist || 0), hp: Math.round(S.hp), y: Math.round(S.P.y), ms: S.ms && S.ms.name }); })()`);

  // ---- the picture: every frame the page draws
  const frames = []; fs.mkdirSync(path.join(out, 'f'), { recursive: true });
  on('Page.screencastFrame', (p) => { const f = path.join(out, 'f', String(frames.length).padStart(5, '0') + '.jpg'); fs.writeFileSync(f, Buffer.from(p.data, 'base64')); frames.push({ f, t: p.metadata.timestamp }); send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {}); });
  await send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 });
  const wall0 = await ev(`window.__film.wall0 / 1000`); // (the sound's zero, on the clock the frames are stamped with)

  // 1. the hangar: across the floor to her ramp, up it, forward to the helm
  log('the hangar');
  await ev(`(() => { const S = G.Space.S, SD = G.SpaceData, d = S.def, b = S.berth, m = G.Me, P = (x, y, z) => { const w = SD.toWorld(b, x, 0, z); return [w.x, b.y + y, w.z]; }, seat = G.Space.seatPos(0);
    const pts = [P(5, 0, d.z1 + 17), P(1.5, 0, d.z1 + 9), P(0, 0, d.z1 + 4.2), P(0, SD.FLOOR, d.z1 - 0.6), P(0, SD.FLOOR, d.z1 - 3), [seat.x, seat.y, seat.z + 0], [seat.x, seat.y, seat.z]];
    m.seat = null; m.pos.set(...pts[0]); window.__film.walk = { pts, secs: 11, t0: performance.now(), yaw: seat.yaw, look: 0.12, u: 0 }; })()`);
  await wait(`!window.__film.walk`, 20);
  await ev(`(() => { const Sp = G.Space, m = G.Me, p = Sp.seatPos(0); m.fLatch = false; m.seat = 0; m.pos.set(p.x, p.y, p.z); m.yaw = p.yaw; m.pitch = 0; m.crouch = true; m.stowed = true; Sp.S.ctl = G.Net.myId; G.Net.toHost({ t: 'seat', s: 0 }); })()`);
  await sleep(1200);
  // 2. a mission off the board, and up off the pad
  const pick = await ev(`(() => { const S = G.Space.S, of = G.SpaceData.offers(S.board.seed, S.board.level), want = ${process.env.FILM_MS == null ? -1 : +process.env.FILM_MS}; const i = want >= 0 ? want : of.findIndex((m) => m.kind === 'board' && m.size !== 'capital' && m.size !== 'large'); G.Net.toHost({ t: 'mpick', i }); return JSON.stringify({ i, name: of[i].name, size: of[i].size, obj: of[i].obj, anchor: of[i].anchor.map(Math.round) }); })()`);
  log('the mission ' + pick); const pi = JSON.parse(pick).i;
  await wait(`G.Space.S.anchors.some((a) => a.i === ${pi})`, 10); await sleep(800);
  await ev(`G.Space.dbgLaunch()`); await wait(`!G.Space.S.docked && !G.Space.S.auto`, 15);
  // 3. out to the anchor, and the jump
  log('away ' + await info());
  await ev(`(() => { const S = G.Space.S, a = S.anchors.find((q) => q.i === ${pi}); window.__film.fly({ p: a.p, climb: 140, cruise: 2600, k: 0.22, vmin: 30 }); })()`);
  await wait(`!!G.Space.nearAnchor() && G.Space.S.P.distanceTo(G.Space.nearAnchor().p) < 330`, 90); log('at the anchor ' + await info());
  await ev(`window.__film.leg.hold = true`); await wait(`G.Space.S.V.length() < 60`, 15);
  await ev(`window.__film.leg.j = true`); await wait(`!!G.Space.S.ftl`, 8); await ev(`window.__film.leg = null`); log('spooling ' + await info());
  await wait(`G.Space.S.kind === 'board' && G.Space.S.on && !!G.Space.S.map`, 40); log('in transit ' + await info());
  await wait(`!G.Space.S.ftl && G.Game.phase === 'level' && !document.getElementById('veil').classList.contains('on')`, 30); log('out of the jump ' + await info());
  // 4. the run in: to a point off the marked stretch of her hull, then straight at it
  await ev(`(() => { const S = G.Space.S, b = S.map.sp.breach; window.__film.b = b; window.__film.fly({ p: new THREE.Vector3(b.x, 0, b.face + 110), k: 0.3, vmin: 22 }); })()`);
  await wait(`G.Space.S.P.distanceTo(window.__film.leg.p) < 30`, 60); log('lined up ' + await info());
  await ev(`(() => { const b = window.__film.b; window.__film.fly({ p: new THREE.Vector3(b.x, 0, b.face - 6), vmin: 24, vmax: 27, k: 1 }); })()`);
  await wait(`G.Space.S.docked`, 40); log('through ' + await info());
  await ev(`window.__film.leg = null`); await sleep(2600);
  // 5. up from the seat, forward through her nose and the hole, into the ship
  await ev(`(() => { const S = G.Space.S, SD = G.SpaceData, d = S.def, b = S.berth, m = G.Me, P = (y, z) => { const w = SD.toWorld(b, 0, 0, z); return [w.x, b.y + y, w.z]; };
    m.seat = null; m.crouch = false; m.stowed = false; G.Net.toHost({ t: 'seat', s: -1 });
    const pts = [P(SD.FLOOR, d.z0 + 2.5), P(SD.FLOOR, d.z0 - 1), P(SD.FLOOR * 0.5, d.z0 - d.nose + 0.2), P(0, d.z0 - d.nose - 2.2), P(0, d.z0 - d.nose - 3.6)];
    window.__film.walk = { pts, secs: 9, t0: performance.now(), yaw: b.yaw, look: 0.7, u: 0 }; })()`);
  await wait(`!window.__film.walk`, 20); await sleep(1500);
  await send('Page.stopScreencast'); await sleep(300);
  log(frames.length + ' frames over ' + (frames[frames.length - 1].t - frames[0].t).toFixed(1) + ' s');

  // ---- the sound, and the two together
  fs.writeFileSync(path.join(out, 'track.json'), await ev(`JSON.stringify(window.__film.track)`)); // (how she flew: the sound can be made again from it)
  log('sound ' + await ev(`window.__film.wav()`, 180000));
  let b64 = ''; for (let o = 0; ; o += 4000000) { const s = await ev(`window.__film.b64.slice(${o}, ${o + 4000000})`); if (!s) break; b64 += s; }
  const wav = path.join(out, 'flight.wav'); fs.writeFileSync(wav, Buffer.from(b64, 'base64'));
  const list = path.join(out, 'frames.txt');
  fs.writeFileSync(list, frames.map((q, i) => `file '${q.f.replace(/\\/g, '/')}'\nduration ${(i + 1 < frames.length ? Math.max(0.005, frames[i + 1].t - q.t) : 0.04).toFixed(4)}`).join('\n') + `\nfile '${frames[frames.length - 1].f.replace(/\\/g, '/')}'\n`);
  const lead = frames[0].t - wall0; // (how long the sound had been going when the first frame came)
  const mp4 = path.join(out, 'flight.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-ss', Math.max(0, lead).toFixed(3), '-i', wav, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '21', '-preset', 'medium', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', mp4], { encoding: 'utf8' });
  log(r.status === 0 ? 'film ' + mp4 + ' (' + (fs.statSync(mp4).size / 1e6).toFixed(1) + ' MB, sound from ' + lead.toFixed(2) + ' s in)' : 'ffmpeg failed: ' + (r.stderr || r.error));
};
