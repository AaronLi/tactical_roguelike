'use strict';
// After-action highlights: the level just played, as a sports broadcast on the TVs in Vex's hangar.
//
// RECORDING (in a level): ten times a second every suspect, civilian and officer is written down as they are (where,
// facing, aiming, crouched, down, dead, hands up...), with every round fired and every door opened or kicked, in a
// rolling buffer of the last few seconds. When something worth showing happens (a suspect killed, a foul: a civilian
// or someone who'd surrendered, an officer downed) the buffer becomes a clip: the seconds before, and the few after,
// of everyone near it. Clips are bounded (the most watchable are kept), and the host's kill message says what made a
// kill special: a headshot, a breach (the killer kicked a door in just before), a suspect taken by surprise, one who'd
// have given up if anyone had asked, and the organs the rounds went through (js/ballistics.js).
//
// PLAYBACK (in the hangar): the level's geometry is kept (js/render.js detachLevel) and the clips are acted out again
// in it by fresh bodies, filmed from the angles a sports director would cut between: wide in the room, the killer's
// helmet camera, a camera on his gun, over his shoulder, and the same from the other side (the suspect's), the moment
// itself in super slow motion. Each suspect kill gets a breakdown: the body x-rayed, the organs lit by what the
// rounds did to them. Between them: a cold open with the squad's starting line-up, sponsored segments, fake adverts,
// presenters reacting like a game show's, motion graphics everywhere and a scoreboard at the end. Near a TV you hear it:
// the crowd (cheers, a laugh track, a sad "aww"), stingers, the presenters' excited babble, the gunfire.
G.Highlights = (() => {
  const T = THREE, HZ = 10, PRE = 5, POST = 3, MAX = 36, NEAR = 34, W = 960, H = 540, KEEP = 7; // (KEEP: what the ring holds, s)

  // ================================================================ recording
  // (fired: each officer's rounds by gun code, { n, am: { load: n } }; kgun: their kills by gun, { kills, hs, d };
  // streaks: each officer's run of kills, for the kill-sequence clips)
  const R = { t: 0, acc: 0, ring: [], shots: [], doors: [], clips: [], open: [], surs: new Map(), actors: new Map(), downs: new Map(), lastHit: new Map(), stats: new Map(), fired: new Map(), kgun: new Map(), streaks: new Map(), killN: 0, level: 0 };
  function reset() {
    R.t = 0; R.acc = 0; R.ring = []; R.shots = []; R.doors = []; R.clips = []; R.open = []; R.surs.clear(); R.actors.clear(); R.downs.clear(); R.lastHit.clear(); R.stats.clear(); R.fired.clear(); R.kgun.clear(); R.streaks.clear(); R.killN = 0;
    R.level = G.Game.level || 0; R.theme = G.Game.map && G.Game.map.theme ? G.Game.map.theme.name : '';
  }
  const myKey = () => 'p' + G.Net.myId;
  const stat = (k) => { let s = R.stats.get(k); if (!s) R.stats.set(k, (s = { kills: 0, hs: 0, fouls: 0, downs: 0, breach: 0, arrests: 0 })); return s; };
  function officerInfo(id, pv) {
    const me = id === G.Net.myId, g = G.Game, ro = (g.roster || {})[id] || {};
    return { kind: 'p', id, name: me ? g.myName : (pv && pv.name) || ro.name || 'Officer', color: me ? g.myColor : (pv && pv.color) != null ? pv.color : ro.color, animal: me ? g.myAnimal : (pv && pv.animal) || ro.animal,
      look: me ? g.myLook : (pv && pv.look) || ro.look, kt: me ? G.Me.kitLook() : pv && pv.st ? pv.st.kt : null, gun: me ? G.Me.cur().def.code : pv && pv.st ? pv.st.w : null };
  }
  // one frame: every actor as they are now ([x, y, z, yaw, pitch, flags, lean, zip, ...]; flags: crouch 1, prone 2,
  // alert 4, down 8, dead 16, hands up 32, cuffed 64, cowering 128). zip: how far through being zip-tied (a suspect;
  // -1 not) and then whether they've still a gun in hand (0 dropped, 1 slung, 2 in hand); for an officer how far
  // through zip-tying someone (-1 not), then whose ('e' id) and whether pulling them up. [10]: how far through a
  // reload (-1 not), everyone's
  const zipOf = (a) => (a && a.kind === 'zip' ? [Math.min(1, a.t / a.dur), a.target, a.pull ? 1 : 0] : [-1, -1, 0]);
  function frame() {
    const a = {};
    for (const ev of G.Views.enemies.values()) {
      const k = 'e' + ev.id;
      if (!R.actors.has(k)) R.actors.set(k, { kind: 'e', id: ev.id, type: ev.type, wpn: ev.def.wpn, vest: ev.def.vest, helmet: ev.def.helmet, face: ev.def.face || 0, civ: !!ev.def.civ, scale: ev.def.scale || 1, boss: !!ev.def.boss, style: ev.def.style });
      // (where their body is drawn, which is what rounds hit: out at the lean point leaning round a corner, slid back
      // from a wall lying prone, js/views.js; and crouched as drawn, weakened ones too)
      const at = ev.rig && ev.rig.root ? ev.rig.root.position : ev.pos, cr = ev.crouch || (ev.str != null && ev.str < 0.4);
      const fl = (cr ? 1 : 0) | (ev.alert ? 4 : 0) | (ev.down ? 8 : 0) | (ev.alive ? 0 : 16) | (ev.scode === 1 ? 32 : 0) | (ev.scode === 2 || ev.arrested ? 64 : 0) | (ev.scode === 3 ? 128 : 0);
      const rl = ev.reloadAt && ev.reloading && ev.alive ? (performance.now() - ev.reloadAt) / ev.reloadDur : -1; // (as js/views.js has it)
      a[k] = [at.x, at.y, at.z, ev.yaw, ev.recPitch || 0, fl, ev.lean || 0, ev.recTk == null ? -1 : ev.recTk, ev.armed == null ? 2 : ev.armed, 0, rl >= 0 && rl < 1 ? rl : -1];
    }
    for (const pv of G.Views.players.values()) {
      if (!pv.st) continue;
      const st = pv.st, k = 'p' + pv.id;
      R.actors.set(k, Object.assign(R.actors.get(k) || {}, officerInfo(pv.id, pv)));
      a[k] = [pv.pos.x, pv.pos.y, pv.pos.z, pv.yaw, pv.pitch, (st.cr ? 1 : 0) | (st.pr ? 2 : 0) | (st.lr ? 0 : 4) | (st.dn ? 8 : 0) | (st.dd ? 16 : 0), st.ln || 0,
        st.act === 'z' ? st.ap || 0 : -1, st.act === 'z' ? st.zt : -1, st.pl ? 1 : 0, st.rl == null ? -1 : st.rl];
    }
    const me = G.Me, k = myKey();
    if (me && me.pos) {
      R.actors.set(k, Object.assign(R.actors.get(k) || {}, officerInfo(G.Net.myId)));
      a[k] = [me.pos.x, me.pos.y, me.pos.z, me.yaw, me.pitch, (me.crouch ? 1 : 0) | (me.prone ? 2 : 0) | (me.lowReady ? 0 : 4) | (me.down ? 8 : 0) | (me.dead ? 16 : 0), me.lean || 0, ...zipOf(me.action),
        me.reloading && me.reloadTotal ? G.U.clamp(1 - me.reloadT / me.reloadTotal, 0, 1) : -1];
    }
    return { t: R.t, a };
  }
  function tick(dt) {
    const g = G.Game;
    if (g.phase !== 'level' || g.hub || !g.map) return;
    if (R.level !== g.level) reset();
    R.t += dt; R.acc += dt;
    // officers going down
    const downNow = new Map();
    if (G.Me && G.Me.pos) downNow.set(G.Net.myId, !!(G.Me.down || G.Me.dead));
    for (const pv of G.Views.players.values()) if (pv.st) downNow.set(pv.id, !!(pv.st.dn || pv.st.dd));
    for (const [id, d] of downNow) {
      if (d && !R.downs.get(id)) {
        // (their armour stopping rounds a moment ago wasn't the save it looked like)
        const gone = (x) => x.kind === 'saved' && x.v === 'p' + id && R.t - x.t < 4;
        R.clips = R.clips.filter((x) => !gone(x)); R.open = R.open.filter((x) => !gone(x));
        clip('down', R.lastHit.get(id) || null, 'p' + id, {});
      }
      R.downs.set(id, d);
    }
    if (R.acc < 1 / HZ) return;
    R.acc = 0;
    const f = frame();
    R.ring.push(f);
    while (R.ring.length && R.ring[0].t < R.t - KEEP) R.ring.shift();
    while (R.shots.length && R.shots[0].t < R.t - KEEP) R.shots.shift();
    while (R.doors.length && R.doors[0].t < R.t - KEEP) R.doors.shift();
    for (const c of R.open) c.frames.push(keep(f, c.keys));
    R.open = R.open.filter((c) => { if (R.t < c.end) return true; closed(c); return false; });
    // a suspect putting their hands up (again, after a ruse: the latest): kept for when they're cuffed
    const prev = R.ring[R.ring.length - 2];
    for (const [k, v] of Object.entries(f.a)) if (k[0] === 'e' && v[5] & 32 && !(prev && prev.a[k] && prev.a[k][5] & 32)) handsUp(k);
  }
  // A surrender: the seconds before it and a couple after, kept (not a clip of its own) for the arrest's clip to open
  // with, if the cuffs go on long enough after that the arrest's own seconds don't show it. Every officer's in it (whoever
  // cuffs them may have been across the map), and whoever else was near.
  function handsUp(k) {
    const c0 = posOf(k), keys = new Set([k]), from = R.t - PRE - 0.3;
    for (const [j, p] of Object.entries(R.ring[R.ring.length - 1].a)) if (j[0] === 'p' || Math.hypot(p[0] - c0.x, p[2] - c0.z) < NEAR) keys.add(j);
    const s = { kind: 'arrest', hands: true, t: R.t, a: null, v: k, fl: {}, keys, frames: R.ring.filter((f) => f.t >= from).map((f) => keep(f, keys)), shots: R.shots.filter((x) => x.t >= from && near(x, c0)), doors: R.doors.filter((d) => d.t >= from), end: R.t + 2.5, at: c0, n: 0, guns: {}, kits: {} };
    s.doorInit = doorsThen(s.frames.length ? s.frames[0].t : R.t);
    for (const j of keys) { const A = R.actors.get(j); if (A && A.kind === 'p') { s.guns[j] = A.gun; s.kits[j] = A.kt ? Object.assign({}, A.kt) : null; } }
    R.surs.set(k, s); R.open.push(s);
  }
  // a clip's last frames are in: what only its rounds show (a spray-down: the killer held the trigger on them, six or
  // more rounds back to back, each within 0.16 s of the last, the run ending on the kill)
  function closed(c) {
    if (c.kind !== 'kill' || !c.a || c.done) return;
    c.done = true;
    const sh = c.shots.filter((s) => s.a === c.a && s.t <= c.t + 0.15 && s.t >= c.t - 4).sort((x, y) => x.t - y.t);
    // what it was done with: the killer's last round before it (or what they were holding)
    const last = sh[sh.length - 1];
    c.gun = (last && last.code) || (c.guns && c.guns[c.a]) || null; c.am = last ? last.am : null; c.killShot = c.fl.bo ? null : last || null;
    if (last && last.tos && c.killShot) { // (a shotgun: the pellet that ends nearest the middle of them)
      let fr = c.frames[0]; for (const x of c.frames) if (Math.abs(x.t - c.t) < Math.abs(fr.t - c.t)) fr = x;
      const v = fr && fr.a[c.v];
      if (v) { let best = null, bd = 1e9; for (const p of pelletsOf(last)) { const dd = nearBody(p.f, p.to, new T.Vector3(v[0], v[1], v[2])).dist; if (dd < bd) { bd = dd; best = p; } } c.killShot = best; }
    }
    if (c.killShot) { // (cut short where it met them, a few centimetres in)
      let fr = c.frames[0]; for (const x of c.frames) if (Math.abs(x.t - c.t) < Math.abs(fr.t - c.t)) fr = x;
      const v = fr && fr.a[c.v], ks = c.killShot;
      if (v) {
        const nb = nearBody(ks.f, ks.to, new T.Vector3(v[0], v[1], v[2])), F0 = new T.Vector3(...ks.f), d = new T.Vector3(...ks.to).sub(F0), len = d.length();
        if (nb.dist < 0.6 && nb.x < len - 0.2) { const e = F0.addScaledVector(d.divideScalar(len), nb.x + 0.05); c.killShot = Object.assign({}, ks, { to: [e.x, e.y, e.z], fl: undefined, _pel: undefined, cut: ks }); }
      }
    }
    // a long shot: LONG m or more (the host's measure, killer to victim, on the ground)
    if ((c.fl.d || 0) >= LONG && !c.fl.why && !c.fl.bo) { c.fl.long = 1; c.score += 0.6 + c.fl.d / 40; }
    if (c.gun && c.a[0] === 'p' && !c.fl.why) {
      let m = R.kgun.get(c.a); if (!m) R.kgun.set(c.a, (m = new Map()));
      const e = m.get(c.gun) || { kills: 0, hs: 0, d: 0 }; e.kills++; if (c.fl.hs) e.hs++; e.d = Math.max(e.d, c.fl.d || 0); m.set(c.gun, e);
    }
    let run = 0, best = null;
    for (let i = 0; i < sh.length; i++) {
      run = i && sh[i].t - sh[i - 1].t <= 0.16 ? run + 1 : 1;
      if (run >= 6 && c.t - sh[i].t < 0.45) best = { n: run, t0: sh[i - run + 1].t };
    }
    if (best && !c.fl.why && !c.fl.bo) { c.fl.spray = best.n; c.fl.sprayT = best.t0; c.score += 0.8 + best.n / 30; }
  }
  const keep = (f, keys) => { const a = {}; for (const k of keys) if (f.a[k]) a[k] = f.a[k].slice(); return { t: f.t, a }; };
  const posOf = (k) => { const f = R.ring[R.ring.length - 1], p = f && f.a[k]; return p ? new T.Vector3(p[0], p[1], p[2]) : null; };
  // (a 0..1 tiebreak from a string: the same on every machine, unlike Math.random)
  const jitter = (str) => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
  // something worth showing: the seconds before it (and the next few) of everyone near it become a clip
  function clip(kind, a, v, fl) {
    const g = G.Game;
    if (g.phase !== 'level' || g.hub) return;
    const c0 = posOf(v) || posOf(a) || new T.Vector3();
    const keys = new Set([a, v].filter(Boolean));
    const last = R.ring[R.ring.length - 1];
    if (last) for (const [k, p] of Object.entries(last.a)) if (Math.hypot(p[0] - c0.x, p[2] - c0.z) < NEAR) keys.add(k);
    // (the 5 s before; a breach, from just before the door went in: up to 5 s before the kill, and its kick)
    const kick = fl.br ? R.doors.filter((d) => d.kicked && d.t <= R.t).pop() : null, from = Math.min(R.t - PRE, kick ? kick.t - 1.5 : Infinity) - 0.3;
    const c = { kind, t: R.t, a, v, fl, keys, frames: R.ring.filter((f) => f.t >= from).map((f) => keep(f, keys)), shots: R.shots.filter((s) => s.t >= from && near(s, c0)), doors: R.doors.filter((d) => d.t >= from), end: R.t + POST, at: c0, n: 0 };
    c.doorInit = doorsThen(c.frames.length ? c.frames[0].t : R.t);
    // the officers' guns and kit as they are now (a replay shows what they had then, not what they carry later)
    c.guns = {}; c.kits = {};
    for (const k of keys) { const A = R.actors.get(k); if (A && A.kind === 'p') { c.guns[k] = A.gun; c.kits[k] = A.kt ? Object.assign({}, A.kt) : null; } }
    c.score = (kind === 'kill' ? 1 : kind === 'arrest' ? 1.4 : kind === 'saved' ? 1.2 + 0.3 * (fl.n || 1) : 1.6) + (fl.hs ? 1 : 0) + (fl.ap ? 0.8 : 0) + (fl.br ? 1.2 : 0) + (fl.sur ? 0.5 : 0) + (fl.ws ? 0.6 : 0) + (fl.why ? 1.5 : 0) + jitter(kind + a + v) * 0.3;
    if (kind === 'kill') counted(c);
    if (kind === 'down') stat(v).downs++;
    if (kind === 'arrest') stat(a).arrests++;
    R.clips.push(c); R.open.push(c);
    if (R.clips.length > MAX) { const drop = R.clips.filter((x) => !R.open.includes(x) && !x.inSeq).sort((x, y) => x.score - y.score)[0]; if (drop) R.clips.splice(R.clips.indexOf(drop), 1); }
    return c;
  }
  // A kill sequence: an officer's kills each within STREAK s of the last become one clip as well (from the first kill's
  // clip, its frames carried on from the ring), the kills in it shown in it rather than on their own
  const STREAK = 6, LONG = 25; // (a long shot: 25 m or more, which the open levels give, the festival's most of all)
  function streak(c) {
    const k = c.a, s = R.streaks.get(k);
    if (!s || R.t - s.last > STREAK) { R.streaks.set(k, { kills: [c], last: R.t, seq: null }); return; }
    s.kills.push(c); s.last = R.t;
    let q = s.seq;
    if (!q) {
      const c1 = s.kills[0];
      q = s.seq = { kind: 'seq', t: c1.t, a: k, v: c1.v, fl: { multi: 0 }, kills: [], keys: new Set(c1.keys), frames: c1.frames.slice(), shots: c1.shots.slice(), doors: c1.doors.slice(), doorInit: c1.doorInit, end: 0, at: c1.at, n: 0, guns: Object.assign({}, c1.guns), kits: Object.assign({}, c1.kits), score: 0 };
      q.kills.push({ v: c1.v, t: c1.t, fl: c1.fl, clip: c1 }); c1.inSeq = q;
      R.clips.push(q);
    }
    q.kills.push({ v: c.v, t: c.t, fl: c.fl, clip: c }); c.inSeq = q;
    for (const key of c.keys) q.keys.add(key);
    // the frames since it last recorded (it may have closed: kills up to six seconds apart, clips run three after),
    // and the rounds and doors it hasn't got
    const lastT = q.frames.length ? q.frames[q.frames.length - 1].t : -1;
    for (const f of R.ring) if (f.t > lastT) q.frames.push(keep(f, q.keys));
    const has = new Set(q.shots); for (const x of c.shots) if (!has.has(x)) q.shots.push(x); q.shots.sort((x, y) => x.t - y.t);
    const hd = new Set(q.doors); for (const x of c.doors) if (!hd.has(x)) q.doors.push(x); q.doors.sort((x, y) => x.t - y.t);
    q.fl.multi = q.kills.length; q.at = c.at; q.end = R.t + POST; q.v = c.v; q.score = 3 + q.kills.length;
    if (!R.open.includes(q)) R.open.push(q);
  }
  // every door's state at clip time t0: as they are now, with the door events since then undone (a door's first event
  // after t0 says what it became, so before it, it was the other way)
  function doorsThen(t0) {
    const map = G.Game.map, out = {};
    if (!map || !map.doors) return out;
    map.doors.forEach((d, i) => { out[i] = !!d.open; });
    for (let j = R.doors.length - 1; j >= 0 && R.doors[j].t >= t0; j--) out[R.doors[j].i] = !R.doors[j].open;
    return out;
  }
  const near = (s, c) => Math.hypot(s.f[0] - c.x, s.f[2] - c.z) < NEAR + 10 || Math.hypot(s.to[0] - c.x, s.to[2] - c.z) < NEAR;
  // a round fired (by an actor key): where from, where to, the gun; a shotgun's, every pellet's end (tos: [[x, y, z]],
  // from the shooter; a suspect's, the host sends only one, so the rest are spread round it by the gun's choke)
  function shot(a, f, to, code, am, tos) {
    if (G.Game.phase !== 'level' || G.Game.hub) return;
    const s = { t: R.t, a, f: [f.x, f.y, f.z], to: [to.x, to.y, to.z], code, am };
    if (Array.isArray(tos) && tos.length > 1) s.tos = tos.map((p) => (Array.isArray(p) ? p.slice(0, 3) : [p.x, p.y, p.z]));
    else { const def = defOf(code); if (def && def.pellets > 1) s.tos = spread(s.f, s.to, def.pellets, def.choke || 3); }
    R.shots.push(s);
    if (a[0] === 'p' && code) { // (an officer's rounds, by gun and load: for the gear room)
      let m = R.fired.get(a); if (!m) R.fired.set(a, (m = new Map()));
      const e = m.get(code) || { n: 0, am: {} }; e.n++; if (am) e.am[am] = (e.am[am] || 0) + 1; m.set(code, e);
    }
    for (const c of R.open) if (near(s, c.at)) c.shots.push(s);
  }
  // pellets round one end: a cone of the choke's half-angle (degrees), denser in the middle, as the guns throw them
  function spread(f, to, n, choke) {
    const F0 = new T.Vector3(...f), d = new T.Vector3(...to).sub(F0), len = d.length(); d.divideScalar(len || 1);
    const a = Math.abs(d.y) < 0.9 ? new T.Vector3(0, 1, 0) : new T.Vector3(1, 0, 0), r = new T.Vector3().crossVectors(d, a).normalize(), u = new T.Vector3().crossVectors(r, d), k = Math.tan(choke * Math.PI / 180), out = [to.slice()];
    for (let i = 1; i < n; i++) { const th = Math.random() * Math.PI * 2, rr = k * Math.min(1.6, Math.sqrt(-2 * Math.log(1 - Math.random())) * 0.6), e = d.clone().addScaledVector(r, Math.cos(th) * rr).addScaledVector(u, Math.sin(th) * rr).normalize().multiplyScalar(len).add(F0); out.push([e.x, e.y, e.z]); }
    return out;
  }
  // How near a round's path (f to to) comes to someone standing at pos (the line up their middle, shin to crown): the
  // distance, and how far along the path that is (metres). Its recorded end is where the walls would stop it, worked
  // out as it was fired, so a round that hit someone runs on past them: this finds where it met them.
  function nearBody(f, to, pos) {
    const F0 = new T.Vector3(...f), d = new T.Vector3(...to).sub(F0), len = d.length(); d.divideScalar(len || 1);
    let best = { dist: 1e9, x: len };
    const n = Math.min(1500, Math.ceil(len / 0.03));
    for (let i = 0; i <= n; i++) {
      const x = len * i / n, p = F0.clone().addScaledVector(d, x), y = G.U.clamp(p.y, pos.y + 0.15, pos.y + 1.75), dist = Math.hypot(p.x - pos.x, p.y - y, p.z - pos.z);
      if (dist < best.dist) best = { dist, x };
    }
    return best;
  }
  // a shot's projectiles: its pellets (each a shot of its own, sharing its time, shooter, gun and muzzle), or just it
  function pelletsOf(sh) {
    if (!sh.tos) return [sh];
    if (!sh._pel) sh._pel = sh.tos.map((to) => ({ t: sh.t, a: sh.a, f: sh.f, to, code: sh.code, am: sh.am, of: sh }));
    return sh._pel;
  }
  function door(i, open, kicked) {
    if (G.Game.phase !== 'level' || G.Game.hub) return;
    const d = { t: R.t, i, open: !!open, kicked: !!kicked };
    R.doors.push(d);
    for (const c of R.open) c.doors.push(d);
  }
  // a suspect's round hit an officer (who's down next is who did it)
  function hitBy(tg, e) { R.lastHit.set(tg, 'e' + e); }
  // a kill's number and the killer's tallies
  function counted(c) { c.n = ++R.killN; const s = stat(c.a), fl = c.fl; if (fl.why) s.fouls++; else { s.kills++; if (fl.hs) s.hs++; if (fl.br) s.breach++; } }
  // A suspect incapacitated counts there and then, the same as a kill (js/server.js incapacitate), and its clip is cut
  // then: down for good, the round that put them down; down from the blood loss, long after the last round (bo), the
  // bleed-out camera, on them going down. Whatever comes after (dying, finished off, cuffed where they lie) is neither
  // counted again nor shown. A suspect who bleeds to death on their feet is incapacitated by it: the bleed-out camera.
  const tally = (by, m) => { if (!by || G.Game.phase !== 'level' || G.Game.hub) return; const s = stat(by); if (m.why) s.fouls++; else { s.kills++; if (m.h) s.hs++; if (m.br) s.breach++; } };
  const clipOf = (e) => R.clips.find((x) => x.kind === 'kill' && x.v === 'e' + e);
  function suspectDown(m) {
    const c = clip('kill', 'p' + m.by, 'e' + m.e, { hs: !!m.h, why: m.why || null, sur: !!m.sur, ws: !!m.ws, br: !!m.br, o: m.o || null, ty: m.ty, d: m.d || 0, bo: !!m.bo, bt: m.bt || 0, hd: m.hd > 0, ap: !!m.ap });
    if (c && m.hd > 0) c.t -= Math.min(4, m.hd);
    if (c && !c.fl.why && !c.fl.bo) streak(c);
  }
  // An officer's armour stopped rounds and they stayed up (js/player.js takeHits, through the host): a clip of the save,
  // the suspect who fired it to them; rounds in quick succession are the one save (n: how many it stopped). Their
  // going down a moment later takes it back (tick).
  function saved(m) {
    const k = 'p' + m.id, n = Math.max(1, m.n | 0), c = R.open.find((x) => x.kind === 'saved' && x.v === k && R.t - x.t < 3);
    if (c) { c.fl.n += n; c.score += 0.3 * n; c.end = R.t + POST; c.t = R.t; return; }
    clip('saved', R.lastHit.get(m.id) || null, k, { n });
  }
  // (incapacitated with no round to show, more than 4 s after the last hit: the tally only)
  function incap(m) { if (!clipOf(m.e)) tally(m.by && 'p' + m.by, m); }
  function kill(m) {
    if (m.inc) return; // (down already: counted, and shown, then)
    const c = clip('kill', 'p' + m.by, 'e' + m.e, { hs: !!m.h, why: m.why || null, sur: !!m.sur, ws: !!m.ws, br: !!m.br, o: m.o || null, ty: m.ty, d: m.d || 0, bo: !!m.bo, bt: m.bt || 0, hd: !!m.hd, ap: !!m.ap });
    if (c && m.hd > 0) c.t -= Math.min(4, m.hd); // (through the heart: down at the round, dead a moment later)
    if (c && !c.fl.why && !c.fl.bo) streak(c);
  }
  // an officer cuffed a suspect, alive: a clip of it (the feel-good segment). (Cuffed where they lay, down: already
  // counted, incapacitated, with the round that put them down: nothing more.)
  function arrest(m) {
    if (m.dn) return;
    const c = clip('arrest', 'p' + m.by, 'e' + m.e, { ty: m.ty }), s = R.surs.get('e' + m.e);
    if (c && s && c.t - s.t > 4) { s.a = c.a; s.n = c.n; c.sur = s; } // (their hands went up a while before: that first)
  }
  // a weapon's definition from its code (a build's code, or a plain weapon id), or null
  function defOf(code) { if (!code) return null; try { return G.WEAPONS[code] || G.Gunsmith.fromCode(code); } catch (e) { return null; } }

  // ================================================================ the kept level
  const P = { map: null, level: null, tvs: [], seg: -1, st: 0, prog: [], rigs: new Map(), fx: [], drops: [], marks: [], rt: null, cv: null, g: null, ov: null, scene: null, cam: null, xs: null, frameT: 0, ready: false, au: null };
  // the level just left: its map (for sight lines) and its meshes, taken out of the scene before the hangar's go in
  function take(map, nodes) {
    drop();
    for (const c of R.open) closed(c); R.open = []; // (clips cut short by the level ending)
    if (!map || !nodes || !nodes.length || !R.clips.length && !R.stats.size) { disposeNodes(nodes); return; }
    P.map = map; P.level = new T.Group(); for (const n of nodes) P.level.add(n);
    P.gen = { seed: map.seed, level: map.level, th: G.THEMES.indexOf(map.theme) }; // (to build it again: js/exportworker.js)
    P.clips = R.clips.slice().sort((a, b) => a.t - b.t); P.stats = new Map(R.stats); P.actors = new Map(R.actors); P.levelN = R.level; P.theme = R.theme;
    P.fired = new Map(R.fired); P.kgun = new Map(R.kgun);
  }
  function disposeNodes(nodes) { for (const n of nodes || []) n.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); }); }
  function drop() {
    if (P.level) { disposeNodes(P.level.children.slice()); P.level = null; }
    P.map = null; P.clips = []; P.video = null; clearRigs();
  }

  // ================================================================ the TVs
  // Mounted on the hangar's walls (hall coordinates: js/hangar.js), each a bezel, a glowing screen and a little shelf
  // of LEDs: the same picture on all of them.
  const TVS = [
    [49.94, 2.45, 20, -Math.PI / 2, 4.4], // the lounge's big screen: on the east wall, facing the sofas (js/hangar.js LOUNGE)
    // the range: the yard side of the hall's north wall behind the rifle firing line (east of the IPSC course's board and
    // spectator screens, x 11..22: js/course.js), the yard's east wall, and its west wall by the course
    [25.2, 2.7, -0.06, Math.PI, 2.6], [31.4, 2.7, -0.06, Math.PI, 2.6], [35.94, 2.6, -3, -Math.PI / 2, 2.2], [2.06, 2.5, -3, Math.PI / 2, 2.0],
  ];
  function mount(root, helpers) {
    unmount();
    if (!P.level) return;
    const R2 = G.R.renderer;
    P.rt = new T.WebGLRenderTarget(640, 360, { samples: 2 });
    P.cv = document.createElement('canvas'); P.cv.width = W; P.cv.height = H; P.g = P.cv.getContext('2d');
    P.ov = new T.CanvasTexture(P.cv); P.ov.minFilter = T.LinearFilter;
    const mat = new T.ShaderMaterial({ toneMapped: false, uniforms: { sc: { value: P.rt.texture }, ov: { value: P.ov }, live: { value: 0 }, time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: G.R.TONE + `uniform sampler2D sc; uniform sampler2D ov; uniform float live; uniform float time; varying vec2 vUv;
        void main(){ vec3 c = bpTone(texture2D(sc, vUv).rgb) * live; vec4 o = texture2D(ov, vUv); c = mix(c, o.rgb, o.a);
          c *= 0.93 + 0.07 * sin(vUv.y * 900.0 + time * 3.0); vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.6; gl_FragColor = linearToOutputTexel(vec4(c * 1.08, 1.0)); }` });
    P.mat = mat;
    const dark = new T.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.4, metalness: 0.3 }), steel = new T.MeshStandardMaterial({ color: 0x3a3e44, roughness: 0.5, metalness: 0.6 });
    for (const [x, y, z, ry, w] of TVS) {
      // tipped forward to face the eyes (1.6 m up) of someone standing about one and a third of its widths out, where it's
      // best watched: hinged at its bottom edge against the wall, its top held out by a strut
      const h = w * 9 / 16, tilt = Math.atan2(y - 1.6, w * 1.33), g = new T.Group(), out = (h + 0.1) * Math.sin(tilt), top = y - h / 2 - 0.05 + (h + 0.1) * Math.cos(tilt);
      g.position.set(x, y - h / 2 - 0.05, z); g.rotation.set(tilt, ry, 0, 'YXZ'); root.add(g);
      const brk = new T.Mesh(new T.BoxGeometry(w * 0.5, 0.05, out + 0.02), steel); brk.position.set(x, top - 0.08, z); brk.rotation.y = ry; brk.translateZ((out + 0.02) / 2); root.add(brk);
      const body = new T.Group(); body.position.y = h / 2 + 0.05; g.add(body);
      const bez = new T.Mesh(new T.BoxGeometry(w + 0.1, h + 0.1, 0.07), dark); bez.position.z = 0.035; body.add(bez);
      const scr = new T.Mesh(new T.PlaneGeometry(w, h), mat); scr.position.z = 0.072; body.add(scr);
      const led = new T.Mesh(new T.BoxGeometry(0.05, 0.02, 0.01), new T.MeshBasicMaterial({ color: 0xff2020 })); led.position.set(w / 2 - 0.08, -h / 2 - 0.035, 0.075); body.add(led);
      P.tvs.push({ g, brk, scr, w, h, led });
      // F at it: the broadcast as a video file, rendered there and then (js/highlights.js exportVideo; the box round the
      // screen, in the hall's coordinates, for js/hangar.js aim)
      if (helpers && helpers.addTarget) {
        const ax = Math.abs(Math.cos(ry)) > 0.5, hw = w / 2 + 0.1, fz = Math.cos(ry) * 0.5, fx = Math.sin(ry) * 0.5;
        helpers.addTarget({ id: 'tv' + P.tvs.length, kind: 'pos', reach: 7, label: 'the highlights',
          box: ax ? [x - hw, y - h / 2 - 0.1, Math.min(z, z + fz), x + hw, y + h / 2 + 0.1, Math.max(z, z + fz)] : [Math.min(x, x + fx), y - h / 2 - 0.1, z - hw, Math.max(x, x + fx), y + h / 2 + 0.1, z + hw],
          run: () => exportVideo(),
          get runText() { return P.exporting && !P.video ? `download the highlights video (making it: ${Math.round(P.exporting.p * 100)}%)` : 'download the highlights video'; } });
      }
    }
    stage();
    P.prog = program(); P.seg = -1; P.st = 0; P.ready = true; P.time = 0; P.video = null; P.wantSave = false;
    audio(true);
    next();
    // the video, made ahead in the background (a moment after arriving: the hangar's own loading first)
    if (canWorker()) setTimeout(() => { if (P.ready && !P.exporting && !P.video) makeVideo(true); }, 1500);
  }
  // the replay set: the old level, lit like a TV studio would (its own lamps' light grid is the hangar's now)
  function stage() {
    P.scene = new T.Scene(); P.scene.background = new T.Color(0x1a2028);
    P.scene.add(P.level);
    P.scene.add(new T.HemisphereLight(0xe8f0ff, 0x4a4038, 1.05));
    const dl = new T.DirectionalLight(0xffffff, 0.55); dl.position.set(0.4, 1, 0.3); P.scene.add(dl);
    P.cam = new T.PerspectiveCamera(60, 16 / 9, 0.05, 200);
    P.scene.add(P.fxRoot = new T.Group());
    buildXray();
  }
  function unmount() {
    if (P.exporting) { P.exporting.cancel = true; if (P.exporting.abort) P.exporting.abort(); } // (left mid-export: it stops)
    for (const tv of P.tvs) { if (tv.g.parent) tv.g.parent.remove(tv.g); if (tv.brk.parent) tv.brk.parent.remove(tv.brk); }
    P.tvs = []; P.ready = false; clearRigs();
    if (P.scene && P.level) P.scene.remove(P.level);
    if (P.rt) { P.rt.dispose(); P.rt = null; }
    audio(false);
  }

  // ================================================================ the video
  // F at a TV: the whole broadcast as a video file, made there and then rather than filmed: every frame rendered off
  // screen as fast as the machine goes (30 frames a second of video; a minute of broadcast in a few seconds), encoded
  // by the browser's own encoder (WebCodecs), the studio audience rendered offline beside it (an OfflineAudioContext,
  // the same sounds at the same moments) and encoded as Opus, the two put in a WebM (writeWebm). The TVs show it from
  // the top again when it's done.
  const FPS = 30;
  const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); }); // (not throttled in a background tab, as a timer is)
  async function videoCodec() {
    // (VP8 first, in its realtime mode: about 3.5 ms a frame here; VP9 left to take its time, 300)
    for (const [id, codec] of [['V_VP8', 'vp8'], ['V_VP9', 'vp09.00.31.08']]) {
      const cfg = { codec, width: W, height: H, bitrate: 2.5e6, framerate: FPS, latencyMode: 'realtime' }; // (plenty at 960x540)
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return { id, cfg }; } catch (e) { /* not this one */ }
    }
    return null;
  }
  // The export: in a worker when the browser can (js/exportworker.js: its own renderer on an OffscreenCanvas, the level
  // built again from its seed, the recording sent over as data), so the game doesn't stop while it's made and the TVs
  // play on; on this thread, a few frames at a time, when it can't (or the worker fails). Either way the sounds come
  // back as events (what, and when) and are mixed here (mixAudio): Web Audio isn't in workers.
  // The video's made ahead: in a worker (js/exportworker.js) once you're in the hangar (makeVideo, from mount), paced so
  // the game keeps its frames, and kept; F at a TV saves it there and then, or as soon as it's done. Without a worker it
  // waits to be asked, and is made here (the game stutters while it is).
  const canWorker = () => !!(window.Worker && window.OffscreenCanvas && window.VideoEncoder && window.VideoFrame) && !P.noWorker;
  const say = (t) => { if (G.HUD) G.HUD.toast('HIGHLIGHTS', t, 3); };
  function exportVideo() {
    const v = P.video;
    if (v && v.blob) { save(v); return; }
    if (P.exporting) { P.wantSave = true; say(`Finishing the video (${Math.round(P.exporting.p * 100)}%): it'll save when it's done`); return; }
    P.wantSave = true;
    makeVideo(false);
  }
  function save(v) {
    const url = URL.createObjectURL(v.blob), a = document.createElement('a');
    a.href = url; a.download = v.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    say(`Saved ${v.name} (${(v.blob.size / 1048576).toFixed(1)} MB, ${Math.round(v.dur)} s)`);
    P.wantSave = false;
  }
  // auto: made on arriving in the hangar (only in a worker, and quietly)
  async function makeVideo(auto) {
    if (P.exporting || !P.ready || !P.prog.length) return;
    if (!window.VideoEncoder || !window.VideoFrame) { if (!auto) say('This browser can\'t make video files (no WebCodecs)'); return; }
    if (auto && !canWorker()) return;
    const X = P.exporting = { p: 0, cancel: false, auto };
    const vc = await videoCodec();
    if (!vc) { P.exporting = null; if (!auto) say('No video encoder available'); return; }
    const t0 = performance.now();
    if (!auto) say('Making the highlights video...');
    let r = null;
    if (canWorker()) {
      try { r = await viaWorker(X, vc); X.how = 'worker'; } catch (e) { if (!X.cancel) console.warn('highlights: the export worker failed' + (P.wantSave ? ', making it here instead' : ''), e); }
    }
    if (!r && !X.cancel && P.wantSave) { X.here = true; X.how = 'main'; try { r = await viaMain(X, vc); } catch (e) { r = { err: e }; } }
    const done = () => { if (X.here) { clearRigs(); P.seg = -1; P.st = 0; P.time = 0; next(); } if (P.exporting === X) P.exporting = null; }; // (the TVs: from the top)
    if (X.cancel || !r || r.err || !(r.n > 0)) { done(); if (!X.cancel && P.wantSave) { P.wantSave = false; say('The video couldn\'t be made' + (r && r.err ? ': ' + (r.err.message || r.err) : '')); } return; }
    const dur = r.n / FPS;
    X.p = 0.92; X.stage = 'audio';
    const au = await mixAudio(r.events, dur, X);
    if (X.cancel) { done(); return; }
    X.p = 0.97;
    // the file: put together in the worker, where the video is (its 100 MB never come here), or here
    let blob = null;
    try { blob = r.mux ? await r.mux(au, dur, vc.id) : writeWebm({ codec: vc.id, video: r.video, audio: au.audio, head: au.head, dur }); } catch (e) { r.err = e; }
    if (!blob) { done(); if (!X.cancel && P.wantSave) { P.wantSave = false; say('The video couldn\'t be made' + (r.err ?': ' + (r.err.message || r.err) : '')); } return; }
    P.video = { blob, name: `breach-protocol-level-${P.levelN}-highlights.webm`, dur };
    P.lastVideo = { name: P.video.name, size: blob.size, dur, ms: performance.now() - t0, audio: au.audio.length > 0, frames: r.frames || r.video.length, how: X.how };
    done();
    if (P.wantSave) save(P.video);
  }
  // the encoder's output: each chunk's bytes, its time (ms) and whether it's a key frame
  const chunkOf = (ch) => { const b = new Uint8Array(ch.byteLength); ch.copyTo(b); return { t: ch.timestamp / 1000, key: ch.type === 'key', b, tr: 1 }; };
  // In a worker: everything it needs as plain data (structured clone: no functions, no meshes; vectors marked to be made
  // vectors again), the chunks back as they're made, the sounds' events at the end
  async function viaWorker(X, vc) {
    const prog = [];
    for (const s of P.prog) {
      if (s.kind === 'ad' && s.store) { // (the store's own: its picture as a bitmap, its stock as it is now)
        const st = s.store, im = st.pic && st.pic.im;
        let pic = null; try { if (im && im.complete && im.naturalWidth) pic = { im: await createImageBitmap(im), w: st.pic.w, h: st.pic.h }; } catch (e) { /* no picture */ }
        prog.push(Object.assign({}, s, { store: Object.assign({}, st, { pic, left: st.left ? st.left() : 1 }) }));
      } else if (s.kind === 'gear') prog.push({ kind: 'gear', k: s.k, code: s.code, dur: s.dur }); // (worked out again there)
      else prog.push(s);
    }
    const data = plain({ gen: P.gen, clips: P.clips, stats: P.stats, actors: P.actors, fired: P.fired, kgun: P.kgun, levelN: P.levelN, theme: P.theme, prog });
    // (the video stays in the worker: when it's done the sounds come back, are mixed here, and go to it with mux(), which
    // gives back the file)
    return new Promise((ok, fail) => {
      const w = new Worker('js/exportworker.js');
      let file = null;
      X.worker = w;
      const end = () => { w.terminate(); X.abort = null; X.worker = null; };
      const bad = (e) => { end(); if (file) file.fail(e); else fail(e); };
      X.abort = () => bad(new Error('cancelled'));
      const mux = (au, dur, codec) => new Promise((ok2, fail2) => {
        file = { ok: ok2, fail: fail2 };
        w.postMessage({ t: 'mux', audio: au.audio, head: au.head, dur, codec }, au.audio.map((a) => a.b.buffer));
      });
      w.onmessage = (e) => {
        const m = e.data;
        if (m.t === 'p') X.p = m.p * 0.9;
        else if (m.t === 'done') ok({ events: m.events, n: m.n, frames: m.frames, mux });
        else if (m.t === 'file') { end(); file.ok(m.blob); }
        else if (m.t === 'err') bad(new Error(m.err));
      };
      w.onerror = (e) => { e.preventDefault(); bad(new Error(e.message || 'worker error')); };
      w.postMessage({ t: 'go', data, cfg: vc.cfg });
    });
  }
  // data for the worker: a deep copy without what can't be sent (functions, meshes, materials, DOM nodes, and objects
  // that carry functions of their own, which are caches it works out again), vectors as {x, y, z, _v3}
  function plain(v, memo = new Map()) {
    if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
    if (memo.has(v)) return memo.get(v);
    if (v.isVector3) { const o = { x: v.x, y: v.y, z: v.z, _v3: 1 }; memo.set(v, o); return o; }
    if ((typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap) || ArrayBuffer.isView(v)) return v;
    if (v.isObject3D || v.isMaterial || v.isTexture || v.isBufferGeometry || (typeof Node !== 'undefined' && v instanceof Node)) return undefined;
    let o;
    if (Array.isArray(v)) { o = []; memo.set(v, o); for (const x of v) o.push(plain(x, memo)); return o; }
    if (v instanceof Map) { o = new Map(); memo.set(v, o); for (const [k, x] of v) { const y = plain(x, memo); if (y !== undefined) o.set(k, y); } return o; }
    if (v instanceof Set) { o = new Set(); memo.set(v, o); for (const x of v) o.add(plain(x, memo)); return o; }
    if (Object.values(v).some((x) => typeof x === 'function')) return undefined;
    o = {}; memo.set(v, o);
    for (const k of Object.keys(v)) { const x = plain(v[k], memo); if (x !== undefined) o[k] = x; }
    return o;
  }
  function revive(v, memo = new Set()) {
    if (v === null || typeof v !== 'object' || memo.has(v)) return v;
    memo.add(v);
    const fix = (x) => (x && x._v3 ? new T.Vector3(x.x, x.y, x.z) : revive(x, memo));
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = fix(v[i]); }
    else if (v instanceof Map) { for (const [k, x] of v) v.set(k, fix(x)); }
    else if (!(v instanceof Set) && !ArrayBuffer.isView(v) && !(typeof ImageBitmap !== 'undefined' && v instanceof ImageBitmap)) for (const k of Object.keys(v)) v[k] = fix(v[k]);
    return v;
  }
  // In the worker (js/exportworker.js): the level built again, the broadcast acted out from the top on this renderer, each
  // frame the picture and its graphics put together on the canvas (as the TVs do, less the screen's lines) and encoded
  // straight from it. post(message, transfer) talks to the page.
  // The worker's pace: it renders a frame only on a credit, and the page gives it PACE of them with each frame of its own
  // (js/highlights.js update), so the GPU's never so busy with the video that the game's frames wait; with no word from
  // the page for a quarter of a second (a hidden tab: no frames to keep), it goes on by itself
  const PACE = 2;
  let credits = 0, wake = null;
  function credit(n) { credits = Math.min(credits + n, PACE * 3); if (wake) { const w = wake; wake = null; w(); } }
  const creditOne = () => (credits > 0 ? (credits--, Promise.resolve()) : new Promise((r) => {
    const go = () => { if (wake === go) wake = null; credits = Math.max(0, credits - 1); r(); };
    wake = go; setTimeout(() => { if (wake === go) { credits++; go(); } }, 250);
  }));
  async function exportHere(m, post) {
    const d = revive(m.data);
    const map = G.Level.generate(d.gen.seed, d.gen.level, d.gen.th);
    G.Game.map = map;
    P.map = map; P.level = new T.Group(); P.level.add(G.Level.buildMesh(map));
    Object.assign(P, { clips: d.clips, stats: d.stats, actors: d.actors, fired: d.fired, kgun: d.kgun, levelN: d.levelN, theme: d.theme });
    P.prog = [];
    for (const s of d.prog) {
      if (s.kind === 'gear') { const gs = gearFor(s.k); if (gs) P.prog.push(gs); continue; }
      if (s.kind === 'ad' && s.store && typeof s.store.left === 'number') { const n = s.store.left; s.store.left = () => n; }
      P.prog.push(s);
    }
    const cv = new OffscreenCanvas(W, H), R2 = new T.WebGLRenderer({ canvas: cv, antialias: false, preserveDrawingBuffer: false });
    G.R.renderer = R2;
    P.rt = new T.WebGLRenderTarget(W, H, { samples: 2 });
    P.cv = new OffscreenCanvas(W, H); P.g = P.cv.getContext('2d');
    P.ov = new T.CanvasTexture(P.cv); P.ov.minFilter = T.LinearFilter;
    P.mat = new T.ShaderMaterial({ toneMapped: false, depthTest: false, uniforms: { sc: { value: P.rt.texture }, ov: { value: P.ov }, live: { value: 0 }, time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: G.R.TONE + ' uniform sampler2D sc; uniform sampler2D ov; uniform float live; varying vec2 vUv; void main(){ vec3 c = bpTone(texture2D(sc, vUv).rgb) * live; vec4 o = texture2D(ov, vUv); gl_FragColor = linearToOutputTexel(vec4(mix(c, o.rgb, o.a), 1.0)); }' });
    const quad = new T.Mesh(new T.PlaneGeometry(2, 2), P.mat), qs = new T.Scene(), qc = new T.Camera(); quad.frustumCulled = false; qs.add(quad);
    stage();
    P.ready = true; P.vol = 1;
    let err = null;
    const out = P.outVideo = [];
    const enc = new VideoEncoder({ output: (ch) => out.push(chunkOf(ch)), error: (e) => { err = e; } });
    enc.configure(m.cfg);
    const total = P.prog.reduce((a, s) => a + s.dur, 0), nF = Math.ceil(total * FPS);
    AT.rec = [];
    clearRigs(); P.seg = -1; P.time = 0; next();
    let n = 0;
    for (; n < nF && !err; n++) {
      await creditOne();
      AT.t = n / FPS;
      if (n && step(1 / FPS) && P.seg === 0) break;
      draw();
      R2.setRenderTarget(null); R2.render(qs, qc);
      const fr = new VideoFrame(cv, { timestamp: Math.round(n * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(fr, { keyFrame: n % (FPS * 2) === 0 }); fr.close();
      if (n % 15 === 0) post({ t: 'p', p: n / nF });
      while (enc.encodeQueueSize > 8) await yieldNow();
    }
    if (err) throw err;
    await enc.flush(); enc.close();
    const events = AT.rec; AT.rec = null;
    post({ t: 'done', events, n, frames: out.length });
  }
  // (in the worker) the file: its video and the page's sound (js/highlights.js mixAudio), as a WebM
  function muxHere(m, post) {
    const blob = writeWebm({ codec: m.codec, video: P.outVideo || [], audio: m.audio, head: m.head, dur: m.dur });
    P.outVideo = null;
    post({ t: 'file', blob });
  }
  // Here, on this thread: a few frames at a time (the game stutters while it's made, and the TVs stop)
  async function viaMain(X, vc) {
    const total = P.prog.reduce((a, s) => a + s.dur, 0), nF = Math.ceil(total * FPS);
    const video = []; let err = null;
    const venc = new VideoEncoder({ output: (ch) => video.push(chunkOf(ch)), error: (e) => { err = e; } });
    venc.configure(vc.cfg);
    // each frame: the picture (read back from the render target, the right way up) under the graphics, as the TVs show it,
    // on canvases kept in memory (not on the GPU) and handed to the encoder as plain pixels: a frame made from a GPU canvas
    // costs the encoder a read back of its own, 30 to 100 times what it costs to encode
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
    const tmp = document.createElement('canvas'); tmp.width = P.rt.width; tmp.height = P.rt.height;
    const tg = tmp.getContext('2d', { willReadFrequently: true }), img = tg.createImageData(tmp.width, tmp.height), px = new Uint8Array(tmp.width * tmp.height * 4), rw = tmp.width * 4;
    let n = 0, events = null;
    AT.rec = [];
    try {
      clearRigs(); P.seg = -1; P.time = 0; next(); // (from the top: the opening's sounds at 0)
      for (; n < nF && !X.cancel && !err; n++) {
        AT.t = n / FPS;
        if (n && step(1 / FPS) && P.seg === 0) break; // (round to the start again: that's all of it)
        if (draw()) {
          G.R.renderer.readRenderTargetPixels(P.rt, 0, 0, tmp.width, tmp.height, px);
          for (let y = 0; y < tmp.height; y++) img.data.set(px.subarray((tmp.height - 1 - y) * rw, (tmp.height - y) * rw), y * rw);
          tg.putImageData(img, 0, 0); g.drawImage(tmp, 0, 0, W, H);
        } else { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
        g.drawImage(P.cv, 0, 0);
        const fr = new VideoFrame(g.getImageData(0, 0, W, H).data, { format: 'RGBA', codedWidth: W, codedHeight: H, timestamp: Math.round(n * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
        venc.encode(fr, { keyFrame: n % (FPS * 2) === 0 }); fr.close();
        X.p = 0.9 * n / nF;
        if (n % 8 === 0) await yieldNow();
        while (venc.encodeQueueSize > 10) await yieldNow();
      }
      if (!err) await venc.flush();
    } finally { events = AT.rec; AT.rec = null; }
    try { venc.close(); } catch (e) { /* closed */ }
    return err ? { err } : { video, events, n };
  }
  // The audience, offline: the murmur under it all, and every sound the broadcast made (its events: [time, 's' a sound
  // effect and its arguments | 'g' a round's report]) at its moment; then into Opus in 20 ms packets (if this browser
  // can: otherwise the video goes without)
  async function mixAudio(events, dur, X = {}) {
    const audio = []; let head = null;
    if (!P.au || !G.Audio.ctx || !window.OfflineAudioContext || !window.AudioEncoder) return { audio, head };
    try {
      const off = new OfflineAudioContext(2, Math.ceil(48000 * (dur + 0.5)), 48000);
      const dest = off.createGain(); dest.connect(off.destination);
      const bed = G.Audio.samples.crowd_bed;
      if (bed) { const b = off.createBufferSource(), g = off.createGain(); b.buffer = bed; b.loop = true; g.gain.value = 0.12; b.connect(g); g.connect(dest); b.start(0); }
      Object.assign(AT, { ctx: off, dest, t: 0, d: 0 });
      try {
        for (const [t, kind, x, y] of events || []) {
          if (t > dur) continue;
          AT.t = t; AT.d = 0;
          try { if (kind === 's') SFX[x](...(y || [])); else if (kind === 'g') tvShot(x, y); } catch (e) { /* that one's lost */ }
        }
      } finally { Object.assign(AT, { ctx: null, dest: null, t: 0, d: 0 }); }
      X.stage = 'mix'; const buf = await off.startRendering(), acfg = { codec: 'opus', sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 };
      if (!(await AudioEncoder.isConfigSupported(acfg)).supported) return { audio, head };
      const aenc = new AudioEncoder({ output: (ch, meta) => {
        const d = meta && meta.decoderConfig && meta.decoderConfig.description;
        if (d && !head) head = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
        const b = new Uint8Array(ch.byteLength); ch.copyTo(b); audio.push({ t: ch.timestamp / 1000, b, tr: 2 });
      }, error: () => { audio.length = 0; } });
      aenc.configure(acfg); X.stage = 'opus';
      const L = buf.getChannelData(0), Rt = buf.getChannelData(1), len = Math.min(buf.length, Math.round(dur * 48000)), N = 960;
      for (let o = 0; o < len; o += N) {
        const k = Math.min(N, len - o), d = new Float32Array(k * 2); d.set(L.subarray(o, o + k)); d.set(Rt.subarray(o, o + k), k);
        const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: k, numberOfChannels: 2, timestamp: Math.round(o * 1e6 / 48000), data: d });
        aenc.encode(ad); ad.close();
        if ((o / N) % 250 === 0) await yieldNow();
      }
      X.stage = 'flush'; await Promise.race([aenc.flush(), new Promise((r) => setTimeout(r, 15000))]); try { aenc.close(); } catch (e) { /* closed */ } // (an encoder that never finishes doesn't hold the video up)
    } catch (e) { audio.length = 0; X.audioErr = e; }
    // (Opus's identification header, if the encoder didn't give one: version 1, two channels, 312 samples of pre-skip, 48 kHz)
    if (audio.length && !head) head = new Uint8Array([79, 112, 117, 115, 72, 101, 97, 100, 1, 2, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0]);
    return { audio, head };
  }
  // A WebM (Matroska) file: the EBML header, then a segment of its info, its tracks (the video; the Opus audio) and
  // clusters of blocks in time order, a new cluster at each video key frame (every 2 s). Times in milliseconds.
  function writeWebm(o) {
    const te = new TextEncoder();
    const cat = (parts) => { let len = 0; for (const p of parts) len += p.length; const out = new Uint8Array(len); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
    const bytes = (v) => { const b = []; do { b.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0); return new Uint8Array(b); };
    const size = (n) => { for (let l = 1; l <= 8; l++) if (n < Math.pow(2, 7 * l) - 1) { const b = new Uint8Array(l); let v = n; for (let i = l - 1; i >= 0; i--) { b[i] = v % 256; v = Math.floor(v / 256); } b[0] |= 1 << (8 - l); return b; } throw new Error('too big'); };
    const el = (id, data) => cat([bytes(id), size(data.length), data]);
    const uint = (id, v) => el(id, bytes(v)), str = (id, v) => el(id, te.encode(v)), m = (id, ...kids) => el(id, cat(kids));
    const flt = (id, v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return el(id, b); };
    const ebml = m(0x1A45DFA3, uint(0x4286, 1), uint(0x42F7, 1), uint(0x42F2, 4), uint(0x42F3, 8), str(0x4282, 'webm'), uint(0x4287, 4), uint(0x4285, 2));
    const info = m(0x1549A966, uint(0x2AD7B1, 1000000), str(0x4D80, 'Breach Protocol'), str(0x5741, 'Breach Protocol highlights'), flt(0x4489, o.dur * 1000));
    const tracks = [m(0xAE, uint(0xD7, 1), uint(0x73C5, 1), uint(0x83, 1), str(0x86, o.codec), uint(0x23E383, Math.round(1e9 / FPS)), m(0xE0, uint(0xB0, W), uint(0xBA, H)))];
    if (o.audio.length) {
      const skip = o.head[10] | (o.head[11] << 8); // (the pre-skip, in samples at 48 kHz: the codec delay)
      tracks.push(m(0xAE, uint(0xD7, 2), uint(0x73C5, 2), uint(0x83, 2), str(0x86, 'A_OPUS'), el(0x63A2, o.head), uint(0x56AA, Math.round(skip / 48000 * 1e9)), uint(0x56BB, 80000000), m(0xE1, flt(0xB5, 48000), uint(0x9F, 2))));
    }
    const blocks = o.video.concat(o.audio).sort((a, b) => a.t - b.t || a.tr - b.tr), clusters = [];
    let cur = null, ct = 0;
    for (const k of blocks) {
      if (!cur || (k.tr === 1 && k.key) || k.t - ct > 30000) { if (cur) clusters.push(m(0x1F43B675, ...cur)); ct = Math.floor(k.t); cur = [uint(0xE7, ct)]; }
      const rel = Math.round(k.t - ct), hd = new Uint8Array([0x80 | k.tr, (rel >> 8) & 255, rel & 255, k.tr === 2 || k.key ? 0x80 : 0]);
      cur.push(el(0xA3, cat([hd, k.b])));
    }
    if (cur) clusters.push(m(0x1F43B675, ...cur));
    return new Blob([ebml, m(0x18538067, info, m(0x1654AE6B, ...tracks), ...clusters)], { type: 'video/webm' });
  }

  // ================================================================ the running order
  const ADS = [
    { brand: 'CRUNCH-O\'S', line: 'The cereal that crunches back.', sub: 'Part of a balanced breach.', col: ['#ffcf2e', '#e2381c'], art: 'box' },
    { brand: 'BRUH! ENERGY', line: '400 mg of caffeine. Doctors hate it.', sub: 'Not for children, pets or officers on probation.', col: ['#1aff8c', '#101418'], art: 'can' },
    { brand: 'SUNSET ACRES', line: 'Retire somewhere nobody\'s kicking doors in.', sub: 'Gated. Very gated.', col: ['#ffb27a', '#5a3a8a'], art: 'house' },
    { brand: 'LAWNKING 3000', line: 'Mow with authority.', sub: 'Now with a breaching blade.', col: ['#8fe04a', '#1d4a20'], art: 'mower' },
    { brand: 'DR. PEBBLE\'S', line: 'Tooth gel for a hero\'s smile.', sub: '9 out of 10 SWAT dentists recommend.', col: ['#7ad7ff', '#ffffff'], art: 'tube' },
    { brand: 'IRONVALE ARMS', line: 'AR550 steel. Because your sternum is worth it.', sub: 'Level III. Level heads.', col: ['#ff9a2e', '#15171a'], art: 'plate' },
    { brand: 'HALCYON LABS', line: 'The IFAK. Bleed responsibly.', sub: 'Tourniquet sold separately. Arms sold separately.', col: ['#e83a3a', '#f4f4f0'], art: 'kit' },
    { brand: 'VEX', line: 'No weapons. No refunds. No questions.', sub: 'Open whenever you survive.', col: ['#ff9a2e', '#1d1c18'], art: 'vex' },
    { brand: 'MERIDIAN ARMOR', line: 'Stops what your feelings can\'t.', sub: 'UHMWPE. Pronounced "uhm, wow".', col: ['#58b8ff', '#0e1a26'], art: 'plate' },
    { brand: 'KESTREL GUM', line: 'Chew. Breach. Repeat.', sub: 'Tactical spearmint.', col: ['#b8ff3a', '#26301a'], art: 'gum' },
  ];
  const SPONSOR = {
    hs: ['KESTREL GUM', '"NO HESITATION" HEADSHOT OF THE NIGHT'], br: ['IRONVALE ARMS', 'BREACH CAM'], foul: ['GRAYWATER SUPPLY', '"WHOOPSIE" CORNER'],
    down: ['HALCYON LABS', '"GET UP, HERO!" MOMENT'], saved: ['MERIDIAN ARMOR', '"STOPS WHAT YOUR FEELINGS CAN\'T" SAVE OF THE NIGHT'], ap: ['REDLINE FIREARMS', '"WHAT VEST?" ROUND OF THE NIGHT'], sur: ['SABLE RIDGE', 'SURPRISE PARTY OF THE WEEK'],
    spray: ['BRUH! ENERGY', 'FULL-AUTO FRENZY'], arrest: ['SUNSET ACRES', '"EVERYBODY GOES HOME" MOMENT'], bo: ['HALCYON LABS', '"SHOULD\'VE PACKED AN IFAK" MOMENT'], long: ['VANTAGE INDUSTRIES', 'LONG-DISTANCE RELATIONSHIP OF THE NIGHT'], multi: ['CRUNCH-O\'S', 'COMBO BREAKFAST OF CHAMPIONS'],
  };
  // What Vex has in this visit (js/shop.js offers), as ads: each with its icon (js/icons.js), price, a line and how many
  // are left (read live: one bought while the ad's on shows SOLD OUT)
  const PITCH = {
    helmet: 'Your skull called. It wants an upgrade.', carrier: 'Wear your confidence. Stop rounds with it.', plate: 'Tested on volunteers. Mostly.',
    face: 'Keep your good looks. Keep your teeth.', belt: 'Holds up your trousers AND your morale.', pack: 'Carry more. Regret less.',
    ammo: 'Loaded with bad news.', part: 'Bolt it on. Feel better instantly.', mag: 'More rounds between awkward pauses.', pouch: 'A place for everything. Everything in its place.',
  };
  function storeProducts() {
    const S = G.Shop, O = S && S.offers, out = [];
    if (!O) return out;
    const pic = (it) => { try { const [w, h] = G.Gear.size(it), im = new Image(); im.src = G.Icons.of(it, w, h, false); return { im, w, h }; } catch (e) { return null; } };
    const add = (o) => { try { out.push(o); } catch (e) { /* skip it */ } };
    for (const id of O.gear || []) { const d = G.Gear.DEFS[id]; if (d) add({ kind: d.kind, name: d.name, brand: d.brand, price: S.gearPrice(id), pic: pic(G.Gear.gearItem(id)), left: () => S.count('gear:' + id) }); }
    for (const o of O.ammo || []) { const A = G.AMMO[o.am], C = G.CALIBERS[o.cal], it = G.Gear.boxItem(o.cal, o.am, o.n); if (A && C) add({ kind: 'ammo', name: `${C.name} ${A.name}`, brand: 'VEX\'S AMMO BIN', price: G.Gear.price(it), pic: pic(it), left: () => S.count('ammo:' + o.cal) * o.n, unit: 'rounds' }); }
    for (const id of S.partStock || []) { const p = G.Gunsmith.PARTS[id]; if (p) add({ kind: 'part', name: p.name, brand: p.brand || 'VEX', price: p.price, pic: null, slot: (G.Gunsmith.SLOT_LABEL[p.slot] || p.slot || '').toUpperCase(), left: () => S.count('part:' + id) }); }
    for (const o of O.mags || []) { const [wid, vid] = o.id.split('|'), def = G.WEAPONS[wid]; if (!def) continue; const it = G.Gear.ammoItem(def, 0, null, vid); add({ kind: 'mag', name: G.Gear.magName(it), brand: def.name.toUpperCase() + ' FAMILY', price: G.Gear.price(it), pic: pic(it), left: () => S.count('mag:' + o.id) }); }
    for (const o of O.pouches || []) { const P0 = G.Gear.POUCHES[o.id], it = G.Gear.pouchItem(o.id); if (P0) add({ kind: 'pouch', name: P0.name, brand: P0.brand, price: G.Gear.price(it), pic: pic(it), left: () => S.count('pouch:' + o.id) }); }
    return G.U.shuffle(P.rnd, out);
  }
  // The gear room: an officer's main gun (the one they fired most) turning on a stand, what it's built from and fed with,
  // what it did (rounds, kills, rounds a kill, headshots, longest), their other guns, their kit, and the pundits' verdict
  function gearFor(k) {
    const m = P.fired.get(k);
    if (!m || !m.size) return null;
    const guns = [...m.entries()].sort((a, b) => b[1].n - a[1].n), [code, e] = guns[0], def = defOf(code);
    if (!def) return null;
    const kg = P.kgun.get(k) || new Map(), kx = kg.get(code) || { kills: 0, hs: 0, d: 0 }, am = Object.entries(e.am).sort((a, b) => b[1] - a[1])[0];
    const A = P.actors.get(k) || {}, kt = A.kt || {};
    const parts = Object.entries(def.build || {}).map(([slot, id]) => [slot, G.Gunsmith.PARTS[id]]).filter(([slot, p]) => p && !p.factory && ['optic', 'riserdot', 'magnifier', 'muzzle', 'barrel', 'stock', 'buttstock', 'handguard', 'fg', 'tac', 'tacL', 'mag', 'grip'].includes(slot))
      .map(([slot, p]) => [(G.Gunsmith.SLOT_LABEL[slot] || slot).replace(/ \(.*\)/, '').toUpperCase(), p.name]);
    const kit = [['HELMET', kt.helmet], ['FACE', kt.face], ['CARRIER', kt.carrier], ['BELT', kt.belt], ['PACK', kt.pack]].filter(([, id]) => id && G.Gear.DEFS[id]).map(([n, id]) => [n, G.Gear.DEFS[id].name + (n === 'CARRIER' && kt.plate ? ' + plate' : '')]);
    // the verdicts: what the numbers say about them (two of them, the strongest first)
    const rpk = kx.kills ? e.n / kx.kills : Infinity, v = [];
    if (kx.kills && rpk <= 2) v.push(['SURGICAL', 'One round, one problem solved.']);
    if (kx.kills && rpk >= 12) v.push(['SPRAY & PRAY', `${Math.round(rpk)} rounds a kill. The ammo budget weeps.`]);
    if (kx.hs && kx.hs / Math.max(1, kx.kills) >= 0.5) v.push(['HEADHUNTER', `${kx.hs} of ${kx.kills} through the head.`]);
    if (def.sup) v.push(['QUIET PROFESSIONAL', 'Suppressed. The neighbours thank you.']);
    if (am && am[0] !== 'ball' && G.AMMO[am[0]]) v.push(['SPECIAL SAUCE', `Running ${G.AMMO[am[0]].name}. Fancy.`]);
    if (!kt.carrier) v.push(['BRAVE OR STUPID?', 'No body armour. Bold.']);
    else if (kt.plate) v.push(['WALKING TANK', 'Plated up and proud of it.']);
    if (!kx.kills) v.push(['ALL BARK', `${e.n} rounds fired. Zero kills. Suppressive fire, we're told.`]);
    if (kx.d >= 25) v.push(['LONG ARM OF THE LAW', `A kill at ${kx.d} m.`]);
    if (!v.length) v.push(['SOLID PICK', 'Nothing fancy. Gets it done.']);
    return { kind: 'gear', k, code, def, rounds: e.n, kills: kx.kills, hs: kx.hs, far: kx.d, am: am ? am[0] : null, parts, kit, verdicts: v.slice(0, 2),
      others: guns.slice(1, 3).map(([c, x]) => ({ def: defOf(c), n: x.n, kills: (kg.get(c) || {}).kills || 0 })).filter((o) => o.def), dur: 9 };
  }
  function program() {
    // (the edit's dice: seeded from the level, so the host and every client cut the same broadcast)
    P.rnd = G.U.rng(((P.gen ? P.gen.seed : 0) ^ 0xb40adca5 ^ (P.levelN | 0) * 2654435761) >>> 0);
    const segs = [{ kind: 'open', dur: 7 }], clips = (P.clips || []).filter((c) => !c.inSeq); // (kills in a sequence: shown in it)
    if (!clips.length) segs.push({ kind: 'quiet', dur: 6 });
    let best = null; for (const c of clips) if (c.kind === 'kill' && c.fl.hs && !c.fl.why && (!best || c.score > best.score)) best = c;
    // the ad breaks: mostly what Vex has in this visit (js/shop.js), shuffled, now and then someone else's
    const store = storeProducts(), fake = G.U.shuffle(P.rnd, ADS.slice());
    let adI = 0, stI = 0;
    const ad = () => (store.length && (P.rnd() < 0.65 || !fake.length) ? { kind: 'ad', store: store[stI++ % store.length], dur: 6 } : { kind: 'ad', ad: fake[adI++ % fake.length], dur: 6 });
    clips.forEach((c, i) => {
      if (i && i % 3 === 0) segs.push(ad());
      const sp = c.kind === 'arrest' ? 'arrest' : c.kind === 'seq' ? 'multi' : c === best ? 'hs' : c.fl.why ? 'foul' : c.fl.bo ? 'bo' : c.kind === 'down' ? 'down' : c.kind === 'saved' ? 'saved' : c.fl.br ? 'br' : c.fl.ap ? 'ap' : c.fl.long ? 'long' : c.fl.spray ? 'spray' : c.fl.sur && P.rnd() < 0.6 ? 'sur' : null;
      if (sp) segs.push({ kind: 'sponsor', sp: SPONSOR[sp], tone: sp === 'foul' || sp === 'down' ? 'sad' : sp === 'arrest' ? 'love' : 'up', dur: 3.2 });
      // a suspect's kill with wounds to show: either the breakdown after it, or (about half the time) the slow-motion
      // angle becomes the x-ray cam, the organs lighting up in the replay as the rounds reach them
      const organs = c.kind === 'kill' && !c.fl.why && c.fl.o && Object.keys(c.fl.o).length, xr = organs && P.rnd() < 0.5;
      for (const part of shotsFor(c, xr)) segs.push(Object.assign({ kind: 'clip', clip: c }, part));
      if (organs && !xr) segs.push({ kind: 'xray', clip: c, dur: 6 });
    });
    // the gear room: each officer who fired, their gun and kit picked apart (before the standings)
    for (const k of (P.fired ? [...P.fired.keys()] : []).slice(0, 4)) { const gs = gearFor(k); if (gs) segs.push(gs); }
    segs.push({ kind: 'table', dur: 8 }, ad());
    for (const sg of segs) sg.seed = Math.floor(P.rnd() * 4294967296);
    return segs;
  }
  // the camera plan for a clip: wide in real time, then the shooter's angle in super slow motion, then the other side's
  function shotsFor(c, xr) {
    const t = c.t, start = c.frames.length ? c.frames[0].t : t - PRE;
    // a kill sequence: the whole run live (from just before the first, a little after the last), then over the shooter's
    // shoulder or from their helmet at half speed
    if (c.kind === 'seq') {
      const tl = c.kills[c.kills.length - 1].t, t0 = Math.max(start, t - 2.2), cams = ['ots', 'helmet'];
      const out = [{ cam: 'wide', who: c.a, at: c.kills[0].v, t0, t1: tl + 1.2, rate: 1, label: 'LIVE', seq: true },
        { cam: cams[Math.floor(P.rnd() * 2)], who: c.a, at: c.kills[0].v, t0: Math.max(start, t - 0.7), t1: tl + 0.6, rate: 0.5, label: 'SLOW-MO', slow: true, seq: true }];
      for (const s of out) s.dur = (s.t1 - s.t0) / s.rate;
      return out;
    }
    if (c.kind === 'arrest') {
      // (hands up a while before: the seconds before it, live, then a card across the time between, then the cuffs)
      const pre = [];
      if (c.sur) { const s = c.sur, s0 = s.frames.length ? s.frames[0].t : s.t - PRE; pre.push({ clip: s, cam: 'wide', who: c.a, at: c.v, t0: Math.max(s0, s.t - 3.5), t1: s.t + 2.0, rate: 1, label: 'LIVE', dur: s.t + 2.0 - Math.max(s0, s.t - 3.5) }, { kind: 'card', gap: c.t - s.t, dur: 1.6 }); }
      const out = [{ cam: 'wide', who: c.a, at: c.v, t0: Math.max(start, t - 3.2), t1: t + 2.2, rate: 1, label: 'LIVE' },
        { cam: 'cuff', who: c.a, at: c.v, t0: Math.max(start, t - 2.4), t1: t + 1.2, rate: 0.6, label: 'SLOW-MO', slow: true }]; // (from the shove down: the tie takes 2.2 s)
      for (const x of out) x.dur = (x.t1 - x.t0) / x.rate;
      return pre.concat(out);
    }
    if (c.fl.bo) { // (bled out: no shot to show; them going down, from across the room and through their own eyes)
      const out = [{ cam: 'wide', who: c.v, at: c.v, t0: Math.max(start, t - 2.5), t1: t + 1.6, rate: 1, label: 'LIVE' },
        { cam: 'helmet', who: c.v, at: c.a || c.v, t0: Math.max(start, t - 1.2), t1: t + 1.6, rate: 0.4, label: 'SUSPECT CAM', slow: true }];
      for (const x of out) x.dur = (x.t1 - x.t0) / x.rate;
      return out;
    }
    let t0 = Math.max(start, t - 3.4);
    const brk = c.fl.br ? c.doors.filter((d) => d.kicked && d.t < t).pop() : null;
    if (brk) t0 = Math.max(start, brk.t - 1.2);
    if (c.fl.spray) t0 = Math.max(start, Math.min(t0, c.fl.sprayT - 0.8));
    const officerShoots = c.kind === 'kill', A = officerShoots ? c.a : c.a, V = c.v;
    const shooterCams = ['helmet', 'gun', 'ots'], pick = (l) => l[Math.floor(P.rnd() * l.length)];
    const ks = c.kind === 'kill' && c.killShot, imp = ks ? ks.t + flightOf(ks).tof : t; // (when the killing round arrives)
    const out = [{ cam: 'wide', who: A, at: V, t0, t1: Math.max(t, imp) + 2.0, rate: 1, label: 'LIVE' }]; // (2 s after: them going down, then the tagline)
    // the slow motion: from the first round of a spray-down (a little quicker, it's longer), else the last second
    const s0 = c.fl.spray ? Math.max(start, t - 2.4, c.fl.sprayT - 0.3) : t - 1.1, sr = c.fl.spray ? 0.4 : 0.28;
    // (an angle that slows right down for the killing round's flight, `fly` seconds of it on screen, then lets the body
    // fall at a third of real time: rates, each until a clip time)
    const flying = (fly, after) => [[ks.t - 0.03, sr], [imp + 0.02, (imp + 0.05 - ks.t) / fly], [imp + after, 0.32]];
    // (the door going in: through the kicker's eyes at half speed, from the boot to the room opening up, then on to the
    // kill, up to 5 s later: real time across the gap, slowing again for the killing round)
    if (A && brk) {
      const kt = ks ? ks.t : t, door = brk.t + 1.0;
      const rates = kt - 0.4 > door ? [[door, 0.5], [kt - 0.4, 1], [Math.max(t, imp) + 0.8, 0.35]] : [[Math.max(t, imp) + 0.8, 0.5]];
      out.push({ cam: 'helmet', who: A, at: V, t0: Math.max(start, brk.t - 0.6), t1: Math.max(brk.t + 1.4, Math.max(t, imp) + 0.8), rates, label: 'BREACH CAM', slow: true });
    }
    if (A && ks && c.fl.long) out.push({ cam: 'bullet', who: A, at: V, t0: Math.max(start, ks.t - 0.35), t1: imp + 1.4, rates: flying(3.0, 1.4), label: 'BULLET CAM', slow: true });
    else if (A && xr && ks) out.push({ cam: 'xr', who: V, at: A, t0: Math.max(start, c.fl.spray ? s0 : ks.t - 0.5), t1: imp + 1.5, rates: flying(1.8, 1.5), label: 'X-RAY CAM', slow: true, xr: true });
    else if (A) out.push({ cam: pick(shooterCams), who: A, at: V, t0: s0, t1: t + 0.6, rate: sr, label: 'SUPER SLO-MO', slow: true });
    if (V && A) out.push({ cam: pick(['helmet', 'ots']), who: V, at: A, t0: t - 1.0, t1: Math.max(t, imp) + 0.5, rate: 0.4, label: officerShoots ? 'SUSPECT CAM' : 'OFFICER CAM', slow: true });
    for (const s of out) s.dur = durOf(s);
    return out;
  }
  // how fast a segment plays clip time: its rate, or (rates: [until, rate] pairs) the one for that stretch
  function rateAt(s, tau) { if (!s.rates) return s.rate; for (const [u, r] of s.rates) if (tau < u) return r; return s.rates[s.rates.length - 1][1]; }
  function durOf(s) {
    if (!s.rates) return (s.t1 - s.t0) / s.rate;
    let d = 0, t = s.t0;
    for (const [u, r] of s.rates) { const e = Math.min(u, s.t1); if (e > t) { d += (e - t) / r; t = e; } }
    if (s.t1 > t) d += (s.t1 - t) / s.rates[s.rates.length - 1][1];
    return d;
  }
  function next() {
    clearRigs();
    P.seg = (P.seg + 1) % P.prog.length; P.st = 0;
    const s = P.prog[P.seg];
    s.react = null; s.fired = false; s.kn = 0; s.mSt = null; s.snapDoors = true; s.prevTau = null; s.xp = null; s.frz = null; s.frzCand = null; s.look = null; s.lookT = null; s.fq = null; s.fp = null; if (s.cam === 'wide') s.pos = null; s.cp = null; if (s.rates) s.rate = s.rates[0][1];
    if (s.kind === 'clip') { buildRigs(s.clip); s.tau = s.t0; if (s.xr) overlayFor(s); }
    if (s.kind === 'xray') xrayFor(s.clip, s);
    if (s.kind === 'gear') gearStage(s);
    sfxFor(s, 'start');
  }

  // ================================================================ acting the clips out
  function clearRigs() {
    for (const r of P.rigs.values()) { if (r.rig.root.parent) r.rig.root.parent.remove(r.rig.root); if (r.rig.dropped && r.rig.dropped.g.parent) r.rig.dropped.g.parent.remove(r.rig.dropped.g); r.rig.dispose && r.rig.dispose(); }
    P.rigs.clear();
    for (const f of P.fx) { if (f.obj.parent) f.obj.parent.remove(f.obj); if (!f.noGeo) f.obj.geometry && f.obj.geometry.dispose(); }
    P.fx = [];
    for (const b of P.bullets || []) { for (const o of [b.mesh, b.glow, b.trail]) if (o.parent) o.parent.remove(o); b.trail.geometry.dispose(); b.trail.material.dispose(); }
    P.bullets = [];
    for (const d of P.drops) if (d.m.parent) d.m.parent.remove(d.m);
    for (const m of P.marks) if (m.parent) m.parent.remove(m);
    P.drops = []; P.marks = [];
    if (P.xo) { for (const m of P.xo.all) { m.geometry.dispose(); m.material.dispose(); } P.xo = null; }
  }
  function rigFor(k, c) {
    const A0 = P.actors.get(k);
    if (!A0) return null;
    // (an officer as they were in this clip: the gun they fired in it, else held when it began; their kit then)
    const sh = c && c.shots.find((s) => s.a === k && s.code), A = A0.kind === 'p' && c ? Object.assign({}, A0, { gun: (sh && sh.code) || (c.guns && c.guns[k]) || A0.gun, kt: (c.kits && c.kits[k]) || A0.kt }) : A0;
    let rig;
    if (A.kind === 'e') {
      const def = G.ENEMIES[A.type] || {};
      rig = G.Rig.create({ style: A.style || def.style, scale: A.scale, boss: A.boss, seed: A.id * 7919 + 13, dressed: true });
      if (!A.civ) rig.setKit(G.Rig.armourKit(A.vest, A.helmet, (A.style || def.style) === 'armored', A.face));
      if (A.wpn && !A.civ) rig.setGun(A.wpn);
    } else {
      rig = G.Rig.create({ style: 'tactical', color: A.color, animal: A.animal, callName: A.name, seed: String(A.id).length * 977, bare: true, look: A.look });
      if (A.kt) rig.setKit(A.kt);
      if (A.gun) rig.setGun(A.gun);
    }
    P.scene.add(rig.root);
    return rig;
  }
  function buildRigs(c) {
    for (const k of c.keys) { const rig = rigFor(k, c); if (rig) P.rigs.set(k, { rig, died: false, k }); }
  }
  // where an actor is at clip time tau: between the two frames either side
  function stateAt(c, k, tau) {
    const F = c.frames;
    let i = 0; while (i < F.length - 1 && F[i + 1].t <= tau) i++;
    const a = F[i] && F[i].a[k], b = F[i + 1] && F[i + 1].a[k];
    if (!a) return b ? b.slice() : null;
    if (!b) return a.slice();
    const u = G.U.clamp((tau - F[i].t) / Math.max(1e-3, F[i + 1].t - F[i].t), 0, 1), o = a.slice();
    for (const j of [0, 1, 2, 4, 6]) o[j] = a[j] + (b[j] - a[j]) * u;
    o[3] = a[3] + G.U.angDiff(a[3], b[3]) * u;
    if (a[7] >= 0 && b[7] >= 0) o[7] = a[7] + (b[7] - a[7]) * u;
    if (a[10] >= 0 && b[10] >= a[10]) o[10] = a[10] + (b[10] - a[10]) * u; // (one reload going on: not one ending and the next starting)
    return o;
  }
  // when someone in a clip is killed in it (its victim; a kill sequence's, each of them), or null
  function deathT(c, k) {
    if (c.kind === 'kill') return k === c.v ? (c.killShot ? Math.max(c.t, c.killShot.t + flightOf(c.killShot).tof) : c.t) : null;
    if (c.kind === 'seq') { const x = c.kills.find((q) => q.v === k); return x ? x.t : null; }
    return null;
  }
  // the moment a clip is about: its victim falling (when the round gets there), or its officer going down
  const momentT = (c) => (c.kind === 'kill' ? deathT(c, c.v) : c.t);
  function act(s, dt) {
    const c = s.clip, prev = s.tau;
    s.rate = rateAt(s, s.tau);
    s.tau += dt * s.rate;
    // (the bodies fall onto the replayed level's floors and furniture: js/rig.js collides with the game's map, the
    // hangar's while this plays, so it's this level's for the moment)
    const gm = G.Game.map; G.Game.map = P.map;
    try { actRigs(s, c, dt); } finally { G.Game.map = gm; }
    // the rounds fired in that stretch, and (slowed down) those in the air
    for (const sh of c.shots) if (sh.t > prev && sh.t <= s.tau) fire(sh, s);
    flyBullets(s);
    // doors: as they were then
    doorsAt(c, s.tau, s.snapDoors); s.snapDoors = false;
    // the x-ray cam: every wounded organ is lit by the killing moment; the lit ones flare and settle
    if (s.xr && P.xo) {
      if (s.tau >= deathT(c, c.v) + 0.01) for (const o of P.xo.hit) lightOrgan(o);
      for (const o of P.xo.hit) if (o.lit) { o.pop = Math.max(0, o.pop - dt * 2.5); o.mesh.scale.copy(o.base).multiplyScalar(1 + 0.7 * o.pop + 0.06 * Math.sin(P.time * 9)); }
    }
    // the effects fading (on clip time)
    for (const f of P.fx) {
      f.life -= dt * s.rate; f.obj.material.opacity = Math.max(0, f.life / f.max) * (f.op || 1);
      if (f.mist) f.obj.scale.setScalar(f.obj.userData.grow * (1 - 0.66 * Math.max(0, f.life / f.max)));
    }
    P.fx = P.fx.filter((f) => { if (f.life > 0) return true; if (f.obj.parent) f.obj.parent.remove(f.obj); if (!f.noGeo) f.obj.geometry && f.obj.geometry.dispose(); if (f.mist) f.obj.material.dispose(); return false; });
    bloodStep(dt * s.rate);
  }
  function actRigs(s, c, dt) {
    const order = [...P.rigs].sort((x, y) => (x[0][0] === 'e' ? 0 : 1) - (y[0][0] === 'e' ? 0 : 1)); // (the officers' hands go where the suspects are)
    for (const [k, r] of order) {
      const p = stateAt(c, k, s.tau);
      if (!p) { r.rig.root.visible = false; continue; }
      r.rig.root.visible = true;
      const dt0 = deathT(c, k), fl = p[5], dead = (dt0 != null && s.tau >= dt0) || (fl & 16);
      if (dead && !r.died) {
        r.died = true;
        const kp = c.a && stateAt(c, c.a, s.tau), dir = kp ? new T.Vector3(p[0] - kp[0], 0, p[2] - kp[2]).normalize() : new T.Vector3(0, 0, 1);
        r.rig.die(dir);
        pool(r);
      }
      let pose = fl & 32 ? 'handsup' : fl & 64 ? 'cuffed' : fl & 128 ? 'cower' : null, tk = -1, act = null, crouch = !!(fl & 1);
      const zt = p[7] == null ? -1 : p[7];
      if (k[0] === 'e') {
        // being taken down and zip-tied (as js/views.js has it): shoved down, then the wrists; the gun as it was
        const tied = !!(fl & 64);
        if (!r.died && !tied && zt >= 0) { pose = 'takedown'; tk = zt; r.rig.zip(zt > 0.8); }
        else if (!r.died && r.rig.zipped !== tied) r.rig.zip(tied);
        if (p[8] === 0 && r.rig.gun && !r.died) r.rig.dropGun();
        else if (r.rig.gun) r.rig.holster(p[8] === 1);
      } else if (zt >= 0) {
        // an officer zip-tying someone: weapon away, down on a knee, hands on them (js/rig.js zipPoint)
        const tr = P.rigs.get('e' + p[8]);
        act = { kind: 'zip', t: zt, hand: 'R', pull: !!p[9] };
        if (tr && tr.rig.root.visible) act.pt = G.Rig.zipPoint(tr.rig, zt, !tr.died);
        crouch = crouch || zt > 0.3;
        r.rig.holster(true); r.zipping = true;
      } else if (r.zipping) { r.zipping = false; r.rig.holster(false); }
      if (k[0] === 'e' && fl & 8 && !r.died) { r.rig.goLimp(); pool(r); } // (a suspect down for good: limp, bleeding out)
      const reload = !r.died && !act && p[10] != null && p[10] >= 0 && p[10] < 1 ? p[10] : -1; // (a magazine change, as it was played)
      r.rig.update(Math.max(0.001, dt * s.rate), { pos: new T.Vector3(p[0], p[1], p[2]), yaw: p[3], pitch: p[4], crouch, prone: !!(fl & 2), alert: !!(fl & 4) && !act && reload < 0, lean: p[6], pose, tk, act, reload, state: r.died ? 'dead' : fl & 8 ? 'down' : 'alive' });
    }
  }
  const tracerMat = (col) => new T.LineBasicMaterial({ color: col, transparent: true, opacity: 1, blending: T.AdditiveBlending, depthWrite: false });
  function fire(sh, s) {
    const f = new T.Vector3(...sh.f), to = new T.Vector3(...sh.to), r = sh.a && P.rigs.get(sh.a);
    if (r && r.rig.recoil) r.rig.recoil();
    for (const p of pelletsOf(sh)) {
      if (s.slow) bullet(p);
      else {
        for (const h of hitsOf(p)) bleed(h.p, h.dir, h.through); const line = new T.Line(new T.BufferGeometry().setFromPoints([f, new T.Vector3(...p.to)]), tracerMat(0xffd27a)); line.material.opacity = sh.tos ? 0.6 : 1; P.fxRoot.add(line); P.fx.push({ obj: line, life: 0.12, max: 0.12, op: line.material.opacity }); }
    }
    const fl = new T.Mesh(new T.SphereGeometry(0.09, 8, 6), new T.MeshBasicMaterial({ color: 0xffc060, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); fl.position.copy(f); P.fxRoot.add(fl);
    P.fx.push({ obj: fl, life: 0.06, max: 0.06 });
    // the gunfire, from the TV (in a video too)
    if (P.vol > 0.05 || AT.ctx || AT.rec) tvShot(sh, s);
  }
  // A round's flight, from its gun and load (the game's own speed downrange: G.roundSpeed): from f to to (where it hit),
  // its speed and time at each step of the way, and how far gravity's pulled it below the bore line by then (cached on
  // the shot). xAt(t): how far it's gone t seconds after leaving the muzzle.
  function flightOf(sh) {
    if (sh.fl) return sh.fl;
    const f = new T.Vector3(...sh.f), to = new T.Vector3(...sh.to), len = Math.max(0.1, f.distanceTo(to)), def = defOf(sh.code);
    let am = sh.am; try { if (!am && def) am = G.ballFor(G.calOf(def)); } catch (e) { /* no caliber */ }
    const vAt = (x) => { let v = 0; try { v = def ? G.roundSpeed(def, am || 'ball', x) : 0; } catch (e) { /* no speed */ } return v > 30 ? v : 380; };
    const N = 24, pts = [{ x: 0, t: 0, v: vAt(0), drop: 0 }];
    for (let i = 1; i <= N; i++) { const x = len * i / N, v = vAt(x), t = pts[i - 1].t + (len / N) / ((v + pts[i - 1].v) / 2); pts.push({ x, t, v, drop: 0.5 * 9.81 * t * t }); }
    const tof = pts[N].t;
    let m = 0; try { m = def ? G.Ballistics.projectile(def, am || 'ball').m : 0; } catch (e) { /* no projectile */ }
    const along = (k, v) => { for (let i = 1; i <= N; i++) if (pts[i][k] >= v) { const a = pts[i - 1], b = pts[i], u = (v - a[k]) / Math.max(1e-9, b[k] - a[k]); return { x: a.x + (b.x - a.x) * u, t: a.t + (b.t - a.t) * u, v: a.v + (b.v - a.v) * u, drop: a.drop + (b.drop - a.drop) * u }; } return pts[N]; };
    return (sh.fl = { f, to, len, dir: to.clone().sub(f).divideScalar(len), def, am, m, pts, tof, v0: pts[0].v, vEnd: pts[N].v, at: (t) => along('t', t), atX: (x) => along('x', x), xAt: (t) => along('t', Math.min(t, tof)).x });
  }
  // A round in the air, slowed down: the bullet (a small brass slug, glowing), a trail behind it, a spark where it lands.
  // (In the x-ray cam, the killer's carries on 45 cm into the body, through what it hit inside.)
  const bulletGeo = new T.CylinderGeometry(0.0045, 0.0055, 0.032, 8), bulletMat = new T.MeshBasicMaterial({ color: 0xffc46a });
  const glowGeo = new T.SphereGeometry(0.011, 10, 8), glowMat = new T.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false });
  function bullet(sh) {
    const fl = flightOf(sh), s = P.prog[P.seg], mesh = new T.Mesh(bulletGeo, bulletMat), glow = new T.Mesh(glowGeo, glowMat);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), fl.dir);
    const tg = new T.BufferGeometry(); tg.setAttribute('position', new T.Float32BufferAttribute(6, 3));
    const trail = new T.Line(tg, tracerMat(0xffe0a0));
    P.fxRoot.add(mesh, glow, trail);
    const ext = s && s.xr && sh.a === s.clip.a ? 0.45 : 0;
    P.bullets.push({ sh, fl, mesh, glow, trail, ext, extT: ext / fl.vEnd, prev: fl.f.clone(), done: false, hits: hitsOf(sh) });
  }
  function flyBullets(s) {
    const c = s.clip, w = new T.Vector3(), q = new T.Vector3(), seg = new T.Line3();
    P.bullets = P.bullets.filter((b) => {
      const el = s.tau - b.sh.t, fl = b.fl, end = fl.tof + b.extT;
      if (el > end + 0.35) { for (const o of [b.mesh, b.glow, b.trail]) if (o.parent) o.parent.remove(o); b.trail.geometry.dispose(); b.trail.material.dispose(); return false; }
      const x = el <= fl.tof ? fl.xAt(Math.max(0, el)) : fl.len + Math.min(b.ext, (el - fl.tof) * fl.vEnd), p = fl.f.clone().addScaledVector(fl.dir, x), gone = el >= end;
      b.mesh.visible = b.glow.visible = !gone; b.mesh.position.copy(p); b.glow.position.copy(p);
      for (const h of b.hits) if (!h.done && x >= h.x) { h.done = true; bleed(h.p, h.dir, h.through); } // (as it gets to them)
      // its trail: the way behind it (a metre and a half at most), fading once it's done
      const tail = fl.f.clone().addScaledVector(fl.dir, Math.max(0, x - 1.5)), pa = b.trail.geometry.attributes.position;
      pa.setXYZ(0, tail.x, tail.y, tail.z); pa.setXYZ(1, p.x, p.y, p.z); pa.needsUpdate = true; b.trail.geometry.computeBoundingSphere();
      b.trail.material.opacity = gone ? Math.max(0, 1 - (el - end) / 0.35) : 0.85;
      // (the x-ray cam: a wounded organ it passes within 22 cm of lights as it gets there)
      if (s.xr && P.xo && b.sh.a === c.a && el >= 0) { seg.set(b.prev, p); for (const o of P.xo.hit) if (!o.lit && seg.closestPointToPoint(o.mesh.getWorldPosition(w), true, q).distanceTo(w) < 0.22) lightOrgan(o); }
      if (el >= fl.tof && !b.hit) { // (where it lands: a spark)
        b.hit = true;
        const sp = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), new T.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); sp.position.copy(fl.to); P.fxRoot.add(sp);
        P.fx.push({ obj: sp, life: 0.05, max: 0.05 });
      }
      b.prev.copy(p);
      return true;
    });
  }
  function hipsOf(k) { const r = P.rigs.get(k); return r && r.rig.hips ? r.rig.hips.getWorldPosition(new T.Vector3()) : null; }
  // A round's report on the TV: the game's own synthesised gunshot (js/gunaudio.js: its dry render, no room), quiet,
  // through the TV's speaker (a low-pass), slower and deeper in slow motion, quieter still suppressed; the plain
  // synthesised crack while that render's being made (asked for, for next time). Into the TV's mix: what you hear
  // near a screen, and what a video has.
  function tvShot(sh, s) {
    if (AT.rec) { AT.rec.push([AT.t + AT.d, 'g', { code: sh.code, am: sh.am }, { slow: !!s.slow, rate: s.rate }]); return; }
    const def = defOf(sh.code);
    if (!def || !P.au) return;
    const c = actx(), t = anow(), GA = G.GunAudio, rate = s.slow ? G.U.clamp(0.45 + s.rate * 0.5, 0.45, 1) : 1;
    let key = null; try { key = G.Gunsmith.roundSoundKey(def, sh.am || G.ballFor(G.calOf(def))); } catch (e) { /* no key */ }
    const spec = key && GA && GA.spec(key), buf = key && GA && GA.dry.get(key);
    if (!buf && spec && GA.available()) GA.buildDry(key);
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = s.slow ? 2200 : 4500; g.gain.value = 0.22 * QUIET; // (a suppressed render is quieter in itself: js/gunshot-synth.js suppression)
    lp.connect(g); g.connect(adest());
    if (buf) { const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate * (0.97 + Math.random() * 0.06); src.connect(lp); src.start(t); src.stop(t + buf.duration / rate + 0.05); }
    else if (def.snd) { const sn = c.createBufferSource(); sn.buffer = P.au.buf; const gn = c.createGain(); gn.gain.setValueAtTime(def.snd.vol * 2, t); gn.gain.exponentialRampToValueAtTime(0.001, t + Math.min(0.5, def.snd.len) / rate); sn.playbackRate.value = rate; sn.connect(gn); gn.connect(lp); sn.start(t, Math.random()); sn.stop(t + 0.6 / rate); }
    P.tvShots = (P.tvShots || 0) + 1;
  }
  // ---------------------------------------------------------------- blood
  // The replay keeps where rounds went, not what they hit, so it's worked out here: a round whose path passes through
  // someone in the replay (standing: a capsule from the shins to the neck; lying: round the hips) bleeds there. A puff
  // back out of the entry wound, and (through and through) a spray out of the far side, on with the round, that lands
  // as drops on the floor, and spatter on a wall close behind. Under anyone who dies or goes down, a pool spreads.
  // All on clip time (slowed with the replay), in the replay's own scene, cleared with each segment.
  const dropGeo = new T.SphereGeometry(1, 5, 4), dropMat = new T.MeshBasicMaterial({ color: 0x6e0505 });
  const mistMat = new T.MeshBasicMaterial({ color: 0x8a0a0a, transparent: true, opacity: 0.5, depthWrite: false }), markGeo = new T.PlaneGeometry(1, 1);
  // who a round from f along dir (len m) passes through: [{ x: how far along, p: where, k }], nearest first
  function bodiesOn(f, dir, len, shooter) {
    const out = [], q = new T.Vector3(), c = new T.Vector3(), w = new T.Vector3();
    for (const [k, r] of P.rigs) {
      if (k === shooter || !r.rig.root.visible) continue;
      const base = r.rig.root.position;
      let x = 0, d;
      if (r.died || r.rig.limp) {
        if (r.rig.hips) r.rig.hips.getWorldPosition(c); else c.copy(base);
        x = G.U.clamp(w.copy(c).sub(f).dot(dir), 0, len); q.copy(f).addScaledVector(dir, x); d = q.distanceTo(c) - 0.3;
      } else {
        c.set(base.x, base.y + 1.0, base.z);
        for (let i = 0; i < 3; i++) { x = G.U.clamp(w.copy(c).sub(f).dot(dir), 0, len); q.copy(f).addScaledVector(dir, x); c.y = G.U.clamp(q.y, base.y + 0.3, base.y + 1.6); }
        d = q.distanceTo(c) - 0.2;
      }
      if (d < 0) out.push({ x, p: q.clone(), k });
    }
    return out.sort((a, b) => a.x - b.x);
  }
  function mark(kind, p, size, n) {
    const m = new T.Mesh(markGeo, G.R.bloodMaterials()[kind]); m.renderOrder = 1;
    if (n) { m.position.set(p.x + n[0] * 0.012, p.y + n[1] * 0.012, p.z + n[2] * 0.012); m.lookAt(p.x + n[0], p.y + n[1], p.z + n[2]); m.rotation.z = Math.random() * 6.28; }
    else { m.position.set(p.x, p.y + 0.004, p.z); m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28); }
    m.scale.set(size * (0.8 + Math.random() * 0.5), size * (0.8 + Math.random() * 0.5), 1);
    P.fxRoot.add(m); P.marks.push(m);
    if (P.marks.length > 160) { const o = P.marks.shift(); if (o.parent) o.parent.remove(o); }
    return m;
  }
  const floorAt = (x, z, y) => G.Level.groundAt(P.map, x, z, 0.01, y);
  function bleed(p, dir, through) {
    const rnd = (a) => (Math.random() - 0.5) * a;
    const n = through ? 18 : 7;
    for (let i = 0; i < n; i++) {
      const back = !through || i < 5;
      const v = dir.clone().multiplyScalar(back ? -(0.5 + Math.random()) : 2 + Math.random() * 3.5).add(new T.Vector3(rnd(1.6), Math.random() * 1.2, rnd(1.6)));
      const m = new T.Mesh(dropGeo, dropMat); m.scale.setScalar(0.007 + Math.random() * 0.014);
      m.position.copy(p).addScaledVector(dir, back ? -0.03 : 0.22); P.fxRoot.add(m);
      P.drops.push({ m, v, life: 1.6 });
    }
    // the mist: a burst that spreads and fades, at each wound
    for (const [o, sz] of through ? [[-0.03, 0.12], [0.24, 0.2]] : [[-0.03, 0.12]]) {
      const mist = new T.Mesh(dropGeo, mistMat.clone()); mist.position.copy(p).addScaledVector(dir, o); mist.scale.setScalar(sz); mist.userData.grow = sz * 3; P.fxRoot.add(mist);
      P.fx.push({ obj: mist, life: 0.3, max: 0.3, op: 0.5, mist: true, noGeo: true });
    }
    if (through && P.map) { // (spatter on a wall close behind them)
      const o = p.clone().addScaledVector(dir, 0.3), hit = G.Level.raycast(P.map, o.x, o.y, o.z, dir.x, dir.y, dir.z, 2.2);
      if (hit && hit.t < 2.2 && hit.n) mark('spatter', o.addScaledVector(dir, hit.t), 0.3 + Math.random() * 0.25 * (1 - hit.t / 2.2), Array.isArray(hit.n) ? hit.n : [hit.n.x, hit.n.y, hit.n.z]);
    }
  }
  // the blood in the air falling (clip time), and the pools spreading
  function bloodStep(h) {
    P.drops = P.drops.filter((d) => {
      d.v.y -= 9.8 * h; d.m.position.addScaledVector(d.v, h); d.life -= h;
      const q = d.m.position, g = floorAt(q.x, q.z, q.y + 0.05);
      if (q.y <= g) { const sp = Math.hypot(d.v.x, d.v.z); mark('drop', new T.Vector3(q.x, g, q.z), 0.035 + d.m.scale.x * 2 + Math.min(0.05, sp * 0.012)); d.life = 0; }
      if (d.life > 0) return true;
      if (d.m.parent) d.m.parent.remove(d.m);
      return false;
    });
    for (const r of P.rigs.values()) if (r.pool) {
      r.poolT += h;
      const c = r.rig.hips ? r.rig.hips.getWorldPosition(new T.Vector3()) : r.rig.root.position;
      if (r.poolT < 1.5) r.pool.position.set(c.x, floorAt(c.x, c.z, c.y + 0.3) + 0.003, c.z); // (under them as they settle)
      const s = Math.min(0.75, 0.06 + 0.14 * r.poolT); r.pool.scale.set(s, s, 1);
    }
  }
  function pool(r) { if (r.pool) return; r.poolT = 0; r.pool = mark('pool', r.rig.root.position.clone(), 0.06); r.pool.scale.set(0.06, 0.06, 1); }
  // a round fired in the replay: whoever's in its way bleeds (after `delay` clip seconds, scaled by how far along they are)
  function hitsOf(sh) {
    const f = new T.Vector3(...sh.f), to = new T.Vector3(...sh.to), len = f.distanceTo(to);
    if (len < 0.05) return [];
    const dir = to.clone().sub(f).divideScalar(len), hits = bodiesOn(f, dir, len + 0.15, sh.a);
    return hits.map((h, i) => Object.assign(h, { dir, through: i < hits.length - 1 || len - h.x > 0.35 }));
  }
  // The doors as they were: every one from its state when the clip's frames began (c.doorInit), then as the clip's own
  // door events have them, swinging (snapped at a segment's first frame, not swung over from the last clip's). The
  // replayed level's door solids follow (js/world.js door), so the cameras' sight lines and the falling bodies see them.
  function doorsAt(c, tau, snap) {
    const map = P.map, dm = map && map.doorMeshes;
    if (!dm) return;
    if (!c._byDoor) { c._byDoor = new Map(); for (const d of c.doors) { let l = c._byDoor.get(d.i); if (!l) c._byDoor.set(d.i, (l = [])); l.push(d); } }
    const init = c.doorInit || {}, n = Math.max(dm.length, 0);
    for (let i = 0; i < n; i++) {
      const piv = dm[i], l = c._byDoor.get(i);
      if (!piv || (init[i] == null && !l)) continue;
      let before = null; if (l) for (const d of l) if (d.t <= tau) before = d;
      const open = before ? before.open : init[i] != null ? init[i] : !l[0].open, kicked = before && before.kicked && tau - before.t < 0.3;
      const u = piv.userData, tgt = open ? 1 : 0;
      u.rAng = snap || u.rAng == null ? tgt : u.rAng + (tgt - u.rAng) * Math.min(1, (kicked ? 0.6 : 0.12));
      piv.rotation.y = u.base + u.rAng * Math.PI / 2 * 0.95 * (u.sign || 1);
      const d = map.doors && map.doors[i];
      if (d && !!d.open !== open && map.world) { d.open = open; try { G.World.door(map.world, map, d); } catch (e) { /* no solid for it */ } }
    }
  }

  // ================================================================ the cameras
  const _a = new T.Vector3(), _b = new T.Vector3();
  // a mesh the lens is inside (or within the near plane of): its box in its own frame, grown by 6 cm
  const _inv = new T.Matrix4(), _lp = new T.Vector3(), _bx = new T.Box3(), _sc = new T.Vector3();
  function blocking(p) {
    const out = [];
    for (const r of P.rigs.values()) {
      if (!r.rig.root.visible) continue;
      r.rig.root.updateMatrixWorld(true);
      r.rig.root.traverse((o) => {
        if (!o.isMesh || !o.visible || !o.geometry || P.hide.includes(o)) return;
        for (let q = o.parent; q; q = q.parent) if (!q.visible || P.hide.includes(q)) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        _lp.copy(p).applyMatrix4(_inv.copy(o.matrixWorld).invert());
        _sc.setFromMatrixScale(o.matrixWorld); const m = 0.06 / Math.max(1e-3, Math.min(_sc.x, _sc.y, _sc.z));
        if (_bx.copy(o.geometry.boundingBox).expandByScalar(m).containsPoint(_lp)) out.push(o);
      });
    }
    return out;
  }
  // keep the lens out of walls and bodies: pulled back toward the head if a wall's between, then nudged out (P.esc)
  // up to 30 cm while it's inside someone; whatever it's still inside isn't drawn for that frame
  function clearance(s, safe) {
    const cam = P.cam, p = cam.position, map = P.map, d = _a.copy(p).sub(safe), len = d.length();
    const wall = (q) => { const v = q.clone().sub(safe), l = v.length(); if (l < 1e-3) return l; v.divideScalar(l); return Math.min(l, G.Level.raycast(map, safe.x, safe.y, safe.z, v.x, v.y, v.z, l + 0.15).t - 0.15); };
    if (len > 1e-3) { const t = wall(p); if (t < len) p.copy(safe).addScaledVector(d.normalize(), Math.max(0, t)); }
    // (and off any wall, floor or ceiling beside it, which the line from the head doesn't see)
    for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const t = G.Level.raycast(map, p.x, p.y, p.z, x, y, z, 0.12).t; if (t < 0.12) p.set(p.x - x * (0.12 - t), p.y - y * (0.12 - t), p.z - z * (0.12 - t)); }
    for (let i = 0; i < 15 && blocking(p).length; i++) {
      const q = p.clone().addScaledVector(P.esc, 0.02);
      if (wall(q) < q.distanceTo(safe) - 1e-3) break;
      p.copy(q);
    }
    for (const o of blocking(p)) P.hide.push(o);
  }
  // how far a following camera closes on its target this frame: by the time since it last looked (so it settles the same
  // however often it's drawn), about a sixth of a second to get most of the way
  function ease2(s) { const t = P.time, k = s.lookT == null ? 1 : 1 - Math.exp(-Math.max(0, t - s.lookT) * 6); s.lookT = t; return k; }
  // The wide angle's camera: somewhere it has both of them (who and at) in the picture, with a clear line to each, all
  // through the clip (checked at five moments of it, people move), side-on to the line between them rather than
  // behind one, as far back as they're far apart, in the room (pulled in short of a wall, under the ceiling); the lens
  // as wide as it must be to fit them both (58 to 80 degrees). 40 places tried; the one with them both in shot most.
  const _pc = new T.PerspectiveCamera(58, 16 / 9, 0.05, 200);
  function pickWide(s, c, W0, A0) {
    const map = P.map, pts = [];
    for (let i = 0; i < 5; i++) {
      const tau = s.t0 + (s.t1 - s.t0) * (i + 0.5) / 5, a = s.who && stateAt(c, s.who, tau), b = s.at && stateAt(c, s.at, tau);
      if (a && b) pts.push([new T.Vector3(a[0], a[1] + 1.35, a[2]), new T.Vector3(b[0], b[1] + 1.2, b[2]), a, b]);
    }
    if (!pts.length) pts.push([W0.clone(), A0.clone()]);
    const mid = new T.Vector3(); let sep = 0;
    for (const [a, b] of pts) { mid.add(a).add(b); sep = Math.max(sep, a.distanceTo(b)); }
    mid.divideScalar(pts.length * 2);
    const line = pts[0][1].clone().sub(pts[0][0]).setY(0); if (line.lengthSq() < 1e-4) line.set(1, 0, 0); line.normalize();
    // how much of someone the camera sees: knees to head and either side of the chest (lower crouched, along the floor
    // prone), the share of those with a clear line (a rack's gaps let one line through where its cartons hide the rest)
    const seen = (p, st) => {
      if (!st) return 1;
      const fl = st[5] || 0, k = fl & 2 ? 0.2 : fl & 1 ? 0.7 : 1, f = new T.Vector3(st[0], st[1], st[2]), sd = _b.set(p.z - f.z, 0, f.x - p.x).normalize().multiplyScalar(0.18);
      const q = [0.45, 0.85, 1.2, 1.55].map((y) => f.clone().setY(f.y + Math.max(0.15, y * k)));
      q.push(q[2].clone().add(sd), q[2].clone().sub(sd));
      let n = 0; for (const x of q) if (G.Level.los(map, p.x, p.y, p.z, x.x, x.y, x.z)) n++;
      return n / q.length;
    };
    const inFrame = (p, q, fov) => { _pc.fov = fov; _pc.updateProjectionMatrix(); _pc.position.copy(p); _pc.lookAt(mid); _pc.updateMatrixWorld(); const v = q.clone().project(_pc); return v.z < 1 && Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.8; };
    let best = null;
    const rr = G.U.rng(s.seed >>> 0); // (the segment's own dice: the same tries, so the same angle, everywhere)
    for (let i = 0; i < 40; i++) {
      // round the side of the line between them (either side), up to 50 degrees off square; back as far as they're apart
      const ang = (i % 2 ? 1 : -1) * Math.PI / 2 + (rr() - 0.5) * 1.75, od = line.clone().applyAxisAngle(new T.Vector3(0, 1, 0), ang);
      let r = Math.max(2.8, sep * 0.7 + 1.6) * (0.85 + rr() * 0.45);
      const h = 0.5 + rr() * 0.9;
      const dir = od.clone().add(new T.Vector3(0, h / r, 0)).normalize(), wall = G.Level.raycast(map, mid.x, mid.y, mid.z, dir.x, dir.y, dir.z, r + 0.4).t;
      if (wall < r + 0.3) { if (wall < 1.6) continue; r = wall - 0.35; } // (in the room: short of the wall behind it)
      const p = mid.clone().addScaledVector(dir, r);
      for (const [x, y, z] of [[0, 1, 0], [0, -1, 0]]) { const t = G.Level.raycast(map, p.x, p.y, p.z, x, y, z, 0.3).t; if (t < 0.3) p.y -= y * (0.3 - t); } // (under the ceiling, off the floor)
      let sc = 0, fovNeed = 58;
      for (const [a, b, sa, sb] of pts) {
        const va = seen(p, sa), vb = seen(p, sb), la = va >= 0.67, lb = vb >= 0.67;
        let fa = inFrame(p, a, 58), fb = inFrame(p, b, 58);
        if ((!fa || !fb) && la && lb && inFrame(p, a, 80) && inFrame(p, b, 80)) { fa = fb = true; fovNeed = 80; }
        sc += (fa ? va : 0) + (fb ? vb : 0) + (la && fa && lb && fb ? 1.5 : 0);
      }
      sc -= Math.abs(Math.cos(ang)) * 0.4; // (a little against standing behind one of them)
      if (!best || sc > best.sc) best = { p, sc, fov: fovNeed };
    }
    s.pos = best ? best.p : mid.clone().add(new T.Vector3(0, 1.2, 0)).addScaledVector(line.clone().applyAxisAngle(new T.Vector3(0, 1, 0), Math.PI / 2), 3);
    s.fov = best ? best.fov : 70; s.wideScore = best ? best.sc / (pts.length * 3.5) : 0;
  }
  function headOf(k) { const r = P.rigs.get(k); return r && r.rig.head ? r.rig.head.getWorldPosition(new T.Vector3()) : null; }
  function camFor(s) {
    const c = s.clip, cam = P.cam;
    // (a kill sequence: looking at whoever's next, the fixed camera picked again when that changes)
    if (c.kind === 'seq') { const nx = (c.kills.find((q) => q.t >= s.tau - 0.4) || c.kills[c.kills.length - 1]).v; if (nx !== s.at) { s.at = nx; s.pos = null; } }
    const who = s.who && stateAt(c, s.who, s.tau), at = s.at && stateAt(c, s.at, s.tau);
    P.hide = []; P.esc = P.esc || new T.Vector3(); P.esc.set(0, 1, 0);
    const W0 = who ? new T.Vector3(who[0], who[1] + 1.5, who[2]) : c.at.clone().setY(1.5), A0 = at ? new T.Vector3(at[0], at[1] + 1.2, at[2]) : c.at.clone().setY(1.2);
    let fov = 60;
    if (s.cam === 'wide') {
      // a fixed camera in the room that keeps them both in the picture (picked once: js/highlights.js pickWide)
      if (!s.pos) pickWide(s, c, W0, A0);
      cam.position.copy(s.pos); cam.lookAt(W0.clone().add(A0).multiplyScalar(0.5)); fov = s.fov || 58;
    } else if (s.cam === 'helmet') {
      // at the brow, a little to the side, looking where they look: their own head (and helmet) left out of the picture,
      // so what shows is their gun and hands, and what they're shooting at
      const h = headOf(s.who) || W0, d = A0.clone().sub(h).normalize(), side = new T.Vector3(-d.z, 0, d.x).normalize();
      cam.position.copy(h).addScaledVector(d, 0.06).addScaledVector(side, 0.07).add(new T.Vector3(0, 0.07, 0)); cam.lookAt(A0); fov = 92;
      const r = P.rigs.get(s.who); if (r && r.rig.head) P.hide.push(r.rig.head);
      if (r && r.rig.hairMesh) P.hide.push(r.rig.hairMesh);
      P.esc.copy(d);
    } else if (s.cam === 'gun') {
      // clamped to the right of the handguard, ahead of the hands (forward is -z; its length from its own meshes)
      const r = P.rigs.get(s.who), g = r && r.rig.gun;
      if (g) {
        g.updateWorldMatrix(true, true);
        if (!r.gunBox) { const inv = new T.Matrix4().copy(g.matrixWorld).invert(), b = new T.Box3(); g.traverse((o) => { if (o.isMesh && o.geometry) { if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); b.union(o.geometry.boundingBox.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld))); } }); r.gunBox = b; }
        const b = r.gunBox, z = b.min.z * 0.55, p = g.localToWorld(_a.set(b.max.x + 0.09, b.max.y + 0.04, z)), f = g.localToWorld(_b.set(0, 0, -3));
        cam.position.copy(p); cam.lookAt(f);
        P.esc.copy(g.localToWorld(new T.Vector3(1, 0, z))).sub(g.localToWorld(new T.Vector3(0, 0, z))).normalize(); // (out to the side)
      }
      else { cam.position.copy(W0); cam.lookAt(A0); }
      fov = 74;
    } else if (s.cam === 'xr') {
      // the x-ray cam: close on the suspect's chest from a little to the side of the shooter's line, so the rounds come in
      // across the picture (who: the suspect, at: the shooter). Set up once, where they stand, and left there: it turns
      // to follow them down when they fall (their body, not their head, which ends up on the floor)
      if (!s.xp) {
        const ch = W0.clone().setY(W0.y - 0.25), d = A0.clone().sub(ch).setY(0).normalize(), side = new T.Vector3(-d.z, 0, d.x);
        if (!s.shoulder) s.shoulder = s.seed & 1 ? 1 : -1;
        cam.position.copy(ch).addScaledVector(d, 1.75).addScaledVector(side, 1.05 * s.shoulder).add(new T.Vector3(0, 0.1, 0));
        P.esc.copy(side).multiplyScalar(s.shoulder); clearance(s, ch);
        s.xp = cam.position.clone(); s.xc = ch.clone().addScaledVector(d, 0.35).add(new T.Vector3(0, 0.1, 0)); s.look = s.xc.clone();
      }
      let tgt = s.xc;
      if (P.xo && P.xo.hit.length) { const m = new T.Vector3(); for (const o of P.xo.hit) m.add(o.mesh.getWorldPosition(_b)); tgt = m.divideScalar(P.xo.hit.length); }
      s.look.lerp(tgt, ease2(s)); cam.position.copy(s.xp); cam.lookAt(s.look); fov = 50;
      P.hide = blocking(cam.position);
    } else if (s.cam === 'bullet') {
      // the bullet cam: behind the muzzle until it fires, then just behind the round all the way (a hair to the side and
      // above, so it's in the picture), then held back along its line watching them go down
      const fl = flightOf(c.killShot), el = s.tau - c.killShot.t, up = new T.Vector3(0, 1, 0), side = new T.Vector3(-fl.dir.z, 0, fl.dir.x).normalize();
      let safe;
      if (el < 0) { cam.position.copy(fl.f).addScaledVector(fl.dir, -0.55).addScaledVector(side, 0.2).addScaledVector(up, 0.07); cam.lookAt(fl.f.clone().addScaledVector(fl.dir, 4)); safe = fl.f; fov = 55; }
      else if (el < fl.tof) {
        const bp = fl.f.clone().addScaledVector(fl.dir, fl.xAt(el));
        cam.position.copy(bp).addScaledVector(fl.dir, -0.3).addScaledVector(side, 0.08).addScaledVector(up, 0.045); cam.lookAt(bp.clone().addScaledVector(fl.dir, 2)); safe = bp; fov = 46;
      } else {
        const tgt = hipsOf(c.v) || fl.to; s.look = (s.look || fl.to.clone()).lerp(tgt, ease2(s));
        cam.position.copy(fl.to).addScaledVector(fl.dir, -1.7).addScaledVector(side, 0.35).addScaledVector(up, 0.25); cam.lookAt(s.look); safe = fl.to.clone().addScaledVector(fl.dir, -0.3); fov = 50;
      }
      P.esc.copy(side); clearance(s, safe);
    } else if (s.cam === 'cuff') {
      // the arrest close-up: low beside them, square to the suspect (who goes down face first, along where they faced,
      // the officer kneeling over them), on whichever side has the room; set once, watching the hands go to the wrists
      if (!s.cp) {
        const q = stateAt(c, s.at, c.t) || [W0.x, W0.y, W0.z, 0], fwd = new T.Vector3(-Math.sin(q[3]), 0, -Math.cos(q[3])), side = new T.Vector3(-fwd.z, 0, fwd.x);
        const mid = new T.Vector3(q[0], q[1] + 0.35, q[2]).addScaledVector(fwd, 0.8);
        const room = (sg) => { const v = side.clone().multiplyScalar(sg).addScaledVector(fwd, -0.25).add(new T.Vector3(0, 0.55, 0)).normalize(); return { v, t: Math.min(2.5, G.Level.raycast(P.map, mid.x, mid.y, mid.z, v.x, v.y, v.z, 2.7).t - 0.2) }; };
        const a = room(1), b = room(-1), best = a.t >= b.t ? a : b;
        s.cp = mid.clone().addScaledVector(best.v, Math.max(0.6, best.t)); s.cmid = mid; s.look = mid.clone();
        P.esc.copy(best.v);
      }
      const r = P.rigs.get(s.at), tgt = r && r.rig.armL && r.rig.armL.tie ? r.rig.armL.tie.getWorldPosition(new T.Vector3()).lerp(s.cmid, 0.35) : s.cmid;
      s.look.lerp(tgt, ease2(s)); cam.position.copy(s.cp); cam.lookAt(s.look.x, s.look.y + 0.15, s.look.z); fov = 60; // (a little above the wrists: the officer's in it too)
      P.hide = blocking(cam.position);
    } else { // over the shoulder
      // (the right shoulder, or the left if a wall's in the way of the right: picked once a shot, so it doesn't jump)
      const h = headOf(s.who) || W0, d = A0.clone().sub(h).setY(0).normalize(), side = new T.Vector3(-d.z, 0, d.x);
      const spot = (sg) => h.clone().addScaledVector(d, -0.75).addScaledVector(side, 0.42 * sg).add(new T.Vector3(0, 0.18, 0));
      const room = (q) => { const v = q.clone().sub(h), l = v.length(); v.divideScalar(l); return Math.min(l, G.Level.raycast(P.map, h.x, h.y, h.z, v.x, v.y, v.z, l + 0.15).t - 0.15) / l; };
      if (!s.shoulder) s.shoulder = room(spot(1)) >= 0.98 || room(spot(1)) >= room(spot(-1)) ? 1 : -1;
      cam.position.copy(spot(s.shoulder)); cam.lookAt(A0); fov = 55;
      P.esc.copy(side).multiplyScalar(s.shoulder);
    }
    if (s.cam !== 'wide' && s.cam !== 'xr' && s.cam !== 'bullet' && s.cam !== 'cuff') clearance(s, headOf(s.who) || W0);
    // (someone's own camera once they're dead: it stays where it was when they fell, not on the floor with their head)
    if (s.cam === 'helmet' || s.cam === 'gun' || s.cam === 'ots') {
      const r = P.rigs.get(s.who);
      if (r && r.died && s.cam === 'helmet' && r.rig.head) {
        // (through their eyes as they go down: the head's own facing, a few centimetres in front of it, eased so the
        // fall reads without shaking, kept off the floor and out of the walls)
        const hd = r.rig.head; hd.updateWorldMatrix(true, false);
        const q = hd.getWorldQuaternion(new T.Quaternion()), hp = hd.getWorldPosition(new T.Vector3()), fwd = new T.Vector3(0, 0, -1).applyQuaternion(q);
        const k = ease2(s), tp = hp.clone().addScaledVector(fwd, 0.08).add(new T.Vector3(0, 0.04, 0));
        if (!s.fq) { s.fq = cam.quaternion.clone(); s.fp = cam.position.clone(); }
        s.fq.slerp(q, k); s.fp.lerp(tp, k); cam.position.copy(s.fp); cam.quaternion.copy(s.fq);
        P.hide = [hd]; if (r.rig.hairMesh) P.hide.push(r.rig.hairMesh); P.esc.copy(fwd); clearance(s, hp);
      }
      else if (r && r.died && s.frzCand) { if (!s.frz) s.frz = s.frzCand; cam.position.copy(s.frz.p); cam.quaternion.copy(s.frz.q); P.hide = blocking(cam.position); }
      else s.frzCand = { p: cam.position.clone(), q: cam.quaternion.clone() };
    }
    // a little handheld drift, more for the action cameras
    const sh = s.cam === 'wide' ? 0.004 : s.cam === 'bullet' ? 0 : 0.012; cam.rotation.x += Math.sin(P.time * 1.7) * sh; cam.rotation.y += Math.sin(P.time * 1.3 + 1) * sh;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  // ================================================================ the x-ray breakdown
  function buildXray() {
    P.xs = new T.Scene(); P.xs.background = new T.Color(0x03101c);
    const grid = new T.GridHelper(6, 24, 0x1d6a8a, 0x0c3044); P.xs.add(grid);
    P.xs.add(new T.HemisphereLight(0xcfe8ff, 0x10202a, 1.2));
    P.xcam = new T.PerspectiveCamera(36, 16 / 9, 0.05, 50);
  }
  // the gear room's stand: a turntable under studio lights, the gun on it (its model shared: js/gunmodels.js world)
  function gearStage(s) {
    if (!P.gs) {
      P.gs = new T.Scene(); P.gs.background = new T.Color(0x0b1220);
      P.gs.add(new T.HemisphereLight(0xdfe8ff, 0x1a1410, 1.1));
      const key = new T.DirectionalLight(0xffffff, 1.0); key.position.set(1, 2, 1.5); P.gs.add(key);
      const rim = new T.DirectionalLight(0xff9a40, 0.7); rim.position.set(-2, 1, -1.5); P.gs.add(rim);
      const disc = new T.Mesh(new T.CylinderGeometry(0.75, 0.8, 0.06, 40), new T.MeshStandardMaterial({ color: 0x1a2230, roughness: 0.4, metalness: 0.6 })); disc.position.y = -0.3; P.gs.add(disc);
      const ring = new T.Mesh(new T.TorusGeometry(0.78, 0.012, 8, 60), new T.MeshBasicMaterial({ color: 0xffb21a })); ring.rotation.x = Math.PI / 2; ring.position.y = -0.27; P.gs.add(ring);
      P.gpiv = new T.Group(); P.gs.add(P.gpiv);
      P.gcam = new T.PerspectiveCamera(30, 16 / 9, 0.05, 50);
    }
    while (P.gpiv.children.length) P.gpiv.remove(P.gpiv.children[0]);
    let g = null; try { g = G.GunModels.world(s.code); } catch (e) { /* no model */ }
    if (!g) return;
    const b = new T.Box3().setFromObject(g), c = b.getCenter(new T.Vector3()), len = Math.max(0.2, b.getSize(new T.Vector3()).length());
    g.position.sub(c); P.gpiv.add(g);
    P.gcam.position.set(0, len * 0.3, len * 2.5); P.gcam.lookAt(0, -0.03, 0);
    P.gcam.setViewOffset(W, H, W * 0.26, -H * 0.04, W, H); // (the gun on the left: the read-out's on the right)
  }
  // The rounds that hit them, run through the x-ray body again (js/ballistics.js through, traced): each one taken into
  // their frame as they were when it hit (where they were, which way they faced, crouched or not, hands up...: the body
  // posed so, js/highlights.js xrayPose), against their armour, and its track
  // kept: the line in, the crushed channel, the temporary cavity's reach around it, its fragments, where it came out or
  // stopped. (A round that misses the body as it's posed here, standing, they having been crouched or turning, goes
  // through the middle of the chest the same way instead.)
  function xrayTracks(c, rig, A) {
    const B = G.Ballistics, out = [], up = new T.Vector3(0, 1, 0), dT = deathT(c, c.v) + 0.05;
    rig.root.updateMatrixWorld(true);
    let g = -1;
    out.groups = []; out.gt = []; // (each shot's: how they were when it hit them, and when, in clip time)
    for (const sh0 of c.shots) {
      if (!sh0.a || sh0.a[0] !== 'p' || sh0.t > dT || out.length >= 18) continue;
      const st0 = stateAt(c, c.v, sh0.t); if (st0) xrayPose(rig, st0);
      let gotOne = false;
      for (const sh of pelletsOf(sh0)) {
      if (out.length >= 18) break;
      const st = stateAt(c, c.v, sh.t); if (!st) continue;
      const fl = flightOf(sh), pos = new T.Vector3(st[0], st[1], st[2]), nb = nearBody(sh.f, sh.to, pos);
      if (nb.dist > 0.3) continue; // (it didn't pass through them)
      if (!gotOne) { gotOne = true; g++; out.groups[g] = st0 || st; out.gt[g] = sh0.t + (fl.tof || 0) * Math.min(1, nb.x / Math.max(0.1, fl.len)); } // (a shot's pellets go in together: its group)
      const u = fl.dir.clone().applyAxisAngle(up, -st[3]).normalize(), o = fl.f.clone().addScaledVector(fl.dir, Math.max(0, nb.x - 1.0)).sub(pos).applyAxisAngle(up, -st[3]);
      let p0; try { p0 = B.projectile(fl.def || {}, fl.am || 'ball'); } catch (e) { continue; }
      const vIn = fl.atX(Math.min(nb.x, fl.len)).v; // (its speed where it met them)
      const armour = () => (A && A.kind === 'e' && !A.civ ? B.suspectArmour({ def: { vest: A.vest, helmet: A.helmet, face: A.face } }) : []);
      let trace = [], r = B.through(rig, o, u, vIn, Object.assign({}, p0), armour(), 3, trace);
      if (!r || (!trace.length && !r.stopped)) {
        const ch = new T.Vector3(0, 1.25, 0), w = ch.sub(o); o.add(w.sub(u.clone().multiplyScalar(w.dot(u))));
        trace = []; r = B.through(rig, o, u, vIn, Object.assign({}, p0), armour(), 3, trace);
      }
      if (!r) continue;
      out.push({ sh, g, n: sh0.tos ? sh0.tos.length : 1, vIn, o, u, r, trace, frags: trace.frags || [], p: r.p || p0, fl, entryT: r.entryT == null ? 1 : r.entryT, endT: trace.length ? trace[trace.length - 1].t : (r.entryT || 1) });
      }
    }
    return out;
  }
  // its pieces in the x-ray scene, each with where along the round's way it appears (t) so they show as it goes in
  const trackMat = (col, op, add) => new T.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: add ? T.AdditiveBlending : T.NormalBlending });
  function xrayTrackMeshes(k) {
    const grp = new T.Group(), parts = [], at = (t) => k.o.clone().addScaledVector(k.u, t), Y = new T.Vector3(0, 1, 0);
    const seg = (a, b, r, mat) => { const len = a.distanceTo(b); if (len < 1e-4) return null; const m = new T.Mesh(new T.CylinderGeometry(r, r, len, 8), mat); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize()); grp.add(m); return m; };
    const line = (a, b, col, op) => { const l = new T.Line(new T.BufferGeometry().setFromPoints([a, b]), new T.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })); grp.add(l); return l; };
    // the way in, and (through and through) the way out
    parts.push({ obj: line(at(0), at(k.entryT), 0xffe0a0, 0.8), t: 0, kind: 'in' });
    const exit = k.r.exitV > 0 && k.trace.length;
    if (exit) parts.push({ obj: line(at(k.endT), at(k.endT + 0.7), 0xffe0a0, 0.5), t: k.endT, kind: 'out' });
    // the crushed channel (drawn three times its width, to be seen) and the temporary cavity around it, every 2 cm
    const chan = trackMat(0xff2a2a, 0.95, false), cav = trackMat(0xffa030, 0.3, true);
    for (let i = 0; i + 5 < k.trace.length; i += 5) {
      const a = k.trace[i], b = k.trace[i + 5], m = seg(at(a.t), at(b.t), Math.max(0.004, a.rP * 3), chan);
      if (m) parts.push({ obj: m, t: a.t, kind: 'chan' });
      if (i % 10 === 0 && a.rT > 0.006) { const sp = new T.Mesh(new T.SphereGeometry(1, 12, 8), cav.clone()); sp.scale.setScalar(Math.min(0.09, a.rT)); sp.position.copy(at(a.t)); grp.add(sp); parts.push({ obj: sp, t: a.t, kind: 'cav', r: Math.min(0.09, a.rT) }); }
    }
    // the fragments: thin red streaks from where each broke off
    for (const f of k.frags) { const a = at(f.t), b = a.clone().addScaledVector(f.dir, Math.max(0.02, f.len)); parts.push({ obj: line(a, b, 0xff5a3a, 0.9), t: f.t, kind: 'frag' }); }
    // stopped in them: the round where it came to rest; stopped by armour: a flash where it struck
    if (!exit && k.trace.length) { const m = new T.Mesh(bulletGeo, bulletMat); m.position.copy(at(k.endT)); m.quaternion.setFromUnitVectors(Y, k.u); m.scale.setScalar(1.6); grp.add(m); parts.push({ obj: m, t: k.endT, kind: 'rest' }); }
    if (k.r.stopped && !k.trace.length) { const d = new T.Mesh(new T.CircleGeometry(0.07, 20), trackMat(0x9fe8ff, 0.8, true)); d.position.copy(at(k.entryT)); d.lookAt(at(k.entryT - 1)); grp.add(d); parts.push({ obj: d, t: k.entryT, kind: 'armour' }); }
    // the round itself, flying it
    const b = new T.Mesh(bulletGeo, bulletMat); b.quaternion.setFromUnitVectors(Y, k.u); b.scale.setScalar(1.6); grp.add(b);
    const glow = new T.Mesh(glowGeo, glowMat); glow.scale.setScalar(2); grp.add(glow);
    for (const p of parts) p.obj.visible = false;
    return { grp, parts, b, glow, end: exit ? k.endT + 0.7 : Math.max(k.endT, k.entryT) };
  }
  // playing them: shot g goes in at XT0 + g·XT s into the segment (a shotgun's pellets all together), taking 1 s from a
  // metre out to where it ends
  const XT0 = 1.0, XT = 1.5;
  function xrayPlay(st) {
    xrayBody(st);
    (P.xtracks || []).forEach((k) => {
      const m = k.m, u = G.U.clamp((st - XT0 - k.g * XT) / 1.0, 0, 1), t = m.end * u, live = u > 0 && u < 1;
      m.b.visible = m.glow.visible = live; m.b.position.copy(k.o).addScaledVector(k.u, t); m.glow.position.copy(m.b.position);
      for (const p of m.parts) {
        p.obj.visible = u > 0 && t >= p.t;
        if (p.kind === 'cav' && p.obj.visible) { // (it flares as the round passes, and falls back to a ghost of itself)
          if (p.at == null) p.at = st;
          const a = st - p.at, f = a < 0.12 ? 0.3 + 0.7 * a / 0.12 : Math.max(0.35, 1 - (a - 0.12) * 1.6);
          p.obj.scale.setScalar(p.r * f); p.obj.material.opacity = 0.2 + 0.3 * (f - 0.35) / 0.65;
        } else if (p.kind === 'cav') p.at = null;
      }
    });
  }
  // the x-ray body posed as someone was in a frame (st: [x, y, z, yaw, pitch, flags, lean]), at the origin facing
  // its own way (the rounds are taken into that frame), settled (a crouch takes a moment to get down into)
  function xrayPose(rig, st) {
    const fl = st[5] || 0, key = [fl & (1 | 2 | 4 | 32 | 64 | 128), (+st[4] || 0).toFixed(2), (+st[6] || 0).toFixed(2)].join();
    if (rig.xkey === key) return;
    rig.xkey = key;
    const pose = fl & 32 ? 'handsup' : fl & 64 ? 'cuffed' : fl & 128 ? 'cower' : null;
    for (let i = 0; i < 24; i++) rig.update(0.05, { pos: new T.Vector3(), yaw: 0, pitch: +st[4] || 0, crouch: !!(fl & 1), prone: !!(fl & 2), alert: !!(fl & 4), lean: +st[6] || 0, pose, state: 'alive' });
    rig.root.updateMatrixWorld(true);
  }
  // The body through the sequence (P.xtl): as they were in the replay, moving, turning, crouching, at each round's
  // moment as that round goes in (round g at XT0 + g·XT s), the clip's time between them taken at the pace that keeps
  // that, from half a second before the first; left as they were at the kill after the last. Placed in the kill's frame
  // (the scene's), its pose eased frame to frame as the replay's bodies are.
  // After the last round, on at XR_AFTER of real time: them going down as the replay has it (dead at the killing round,
  // or when the recording says), falling the way it pushed them, onto the ground they stood on (nothing else here).
  const XR_AFTER = 0.45;
  function xrayBody(st) {
    const L = P.xtl, rig = P.xrig;
    if (!L || !rig) return;
    const K = L.keys; let tau;
    if (!K.length || st <= K[0][0]) tau = K.length ? K[0][1] - Math.min(0.5, (K[0][0] - st) * 0.5) : L.tk;
    else if (st >= K[K.length - 1][0]) tau = K[K.length - 1][1] + (st - K[K.length - 1][0]) * XR_AFTER;
    else { let i = 0; while (K[i + 1][0] < st) i++; const [s0, t0] = K[i], [s1, t1] = K[i + 1]; tau = t0 + (t1 - t0) * (st - s0) / Math.max(1e-3, s1 - s0); }
    const dT = deathT(L.c, L.c.v);
    // (once they're dead, where they went down: the body falls from there, it doesn't follow the recording on)
    const p = L.fallP || stateAt(L.c, L.c.v, tau) || L.kst, fl = p[5] || 0;
    const dead = (dT != null && tau >= dT) || !!(fl & 16) || !!(fl & 8); // (down for good: limp from there, as dead)
    if (dead && !L.fallP) {
      L.fallP = p;
      L.holder.position.copy(L.place(p)); L.holder.rotation.y = G.U.angDiff(L.kst[3], p[3]);
      const ks = L.c.killShot, Y = new T.Vector3(0, 1, 0);
      const dir = ks ? new T.Vector3(ks.to[0] - ks.f[0], 0, ks.to[2] - ks.f[2]).normalize().applyAxisAngle(Y, -L.kst[3]).applyAxisAngle(Y, -L.holder.rotation.y) : null;
      rig.die(dir);
    }
    if (!L.fallP) { L.holder.position.copy(L.place(p)); L.holder.rotation.y = G.U.angDiff(L.kst[3], p[3]); }
    const dt = L.fallP ? G.U.clamp(tau - (L.lastTau == null ? tau : L.lastTau), 0.001, 0.05) : L.lastSt == null ? 0.05 : G.U.clamp(st - L.lastSt, 0.001, 0.1);
    L.lastSt = st; L.lastTau = tau;
    // (no level here to land on: the ground they stood on, at the floor of the picture)
    const gm = G.Game.map; G.Game.map = null;
    try {
      rig.update(dt, { pos: new T.Vector3(), yaw: 0, pitch: +p[4] || 0, crouch: !!(fl & 1), prone: !!(fl & 2), alert: !!(fl & 4) && !dead, lean: +p[6] || 0, pose: fl & 32 ? 'handsup' : fl & 64 ? 'cuffed' : fl & 128 ? 'cower' : null, state: dead ? 'dead' : fl & 8 ? 'down' : 'alive' });
    } finally { G.Game.map = gm; }
    rig.xkey = null;
  }
  function xrayFor(c, s) {
    if (P.xrig) { if (P.xtl && P.xtl.holder.parent) P.xs.remove(P.xtl.holder); P.xrig = null; }
    for (const h of (P.xtl && P.xtl.holders) || []) if (h.parent) P.xs.remove(h);
    P.xtl = null; P.xview = null;
    for (const k of P.xtracks || []) { if (k.m.grp.parent) k.m.grp.parent.remove(k.m.grp); k.m.grp.traverse((o) => { if (o.geometry && o.geometry !== bulletGeo && o.geometry !== glowGeo) o.geometry.dispose(); if (o.material && o.material !== bulletMat && o.material !== glowMat) o.material.dispose(); }); }
    P.xtracks = [];
    const A = P.actors.get(c.v); if (!A) return;
    const rig = G.Rig.create({ style: A.style || (G.ENEMIES[A.type] || {}).style, scale: A.scale, boss: A.boss, seed: A.id * 7919 + 13, dressed: true });
    const ghost = new T.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.14, depthWrite: false, blending: T.AdditiveBlending });
    rig.root.traverse((o) => { if (o.isMesh) o.material = ghost; });
    // (posed as they were at the killing round: crouched, hands up, cowering...)
    const kst = stateAt(c, c.v, c.killShot ? c.killShot.t : c.t) || [0, 0, 0, 0, 0, 0, 0];
    xrayPose(rig, kst);
    P.xorg = organsOn(rig, c.fl.o || {}, false).hit;
    P.xrig = rig;
    // the rounds that did it, each shown going in, one after another (the segment long enough for them all), each run
    // through the body as it was posed when that round hit; then it's left as it was at the kill
    try { P.xtracks = xrayTracks(c, rig, A); } catch (e) { P.xtracks = []; }
    xrayPose(rig, kst);
    // Each round's track where it went, in the kill's frame (the scene's): taken into the frame they were in when it hit,
    // which is where the body will be as it goes in (js/highlights.js xrayBody)
    const Y = new T.Vector3(0, 1, 0), kp = new T.Vector3(kst[0], kst[1], kst[2]);
    const place = (p) => new T.Vector3(p[0] - kp.x, p[1] - kp.y, p[2] - kp.z).applyAxisAngle(Y, -kst[3]);
    const holders = (P.xtracks.groups || []).map((st) => { const h = new T.Group(); if (st) { h.position.copy(place(st)); h.rotation.y = G.U.angDiff(kst[3], st[3]); } P.xs.add(h); return h; });
    for (const k of P.xtracks) { k.m = xrayTrackMeshes(k); (holders[k.g] || P.xs).add(k.m.grp); }
    const holder = new T.Group(); holder.add(rig.root); P.xs.add(holder);
    // (when each round meets the body on screen: its second of flight, as far in as its track reaches the skin)
    const keys = (P.xtracks.gt || []).map((t, g) => { const k = P.xtracks.find((q) => q.g === g); return [XT0 + g * XT + (k ? G.U.clamp(k.entryT / Math.max(1e-3, k.m.end), 0, 1) : 0.5), t]; }).filter(([, t]) => t != null);
    P.xtl = { c, kst, tk: c.killShot ? c.killShot.t + flightOf(c.killShot).tof : c.t, keys, holder, holders, place, lastSt: null };
    if (keys.length) { const p0 = stateAt(c, c.v, keys[0][1] - 0.5) || kst; xrayPose(rig, p0); }
    xrayBody(0);
    // (the camera frames where they went: the middle of it, and far enough out)
    const pts = [new T.Vector3(), ...holders.map((h) => h.position)], mid = pts.reduce((a, p) => a.add(p), new T.Vector3()).divideScalar(pts.length);
    P.xview = { mid, r: 2.7 + Math.max(0, ...pts.map((p) => p.distanceTo(mid))) * 1.2 };
    if (s) s.dur = Math.max(6, XT0 + (P.xtracks.length ? P.xtracks[P.xtracks.length - 1].g + 1 : 0) * XT + 4.2); // (and their fall after)
  }
  // the organs, in the bones of a body (js/ballistics.js), coloured by what was done to them; over a replay (overlay)
  // they're drawn through the body, the hit ones dim until the round that hit them arrives (js/highlights.js lightOrgan)
  function organsOn(rig, O, overlay) {
    const B = G.Ballistics, ORG = B.ORG, all = [], hit = [];
    const bone = (n) => n.startsWith('up') || n.startsWith('lo') ? (n.endsWith('L') ? rig.armL : rig.armR)[n.slice(0, 2)] : n.startsWith('th') || n.startsWith('sh') ? (n.endsWith('L') ? rig.legL : rig.legR)[n.slice(0, 2)] : rig[n];
    for (const s of B.segs()) {
      const b = bone(s.bone); if (!b) continue;
      for (const [id, sh] of s.organs || []) {
        const pct = O[id] || 0, col = pct >= 100 ? 0xff2a2a : pct > 0 ? 0xffb02a : ORG[id] && ORG[id].bone ? 0xe8e2c8 : 0x6fd08c;
        const m = overlay ? new T.MeshBasicMaterial({ color: pct > 0 ? 0x6fd08c : col, transparent: true, opacity: pct > 0 ? 0.4 : 0.22, depthTest: false, depthWrite: false })
          : new T.MeshBasicMaterial({ color: col, transparent: true, opacity: pct > 0 ? 0.95 : 0.28, depthWrite: pct > 0 });
        let mesh;
        if (sh[0] === 'ell') { mesh = new T.Mesh(new T.SphereGeometry(1, 14, 10), m); mesh.scale.set(sh[2][0], sh[2][1], sh[2][2]); mesh.position.set(...sh[1]); }
        else {
          const a = new T.Vector3(...sh[1]), bb = new T.Vector3(...sh[2]), len = a.distanceTo(bb);
          mesh = new T.Mesh(new T.CylinderGeometry(sh[3], sh[3], Math.max(0.001, len), 8), m); mesh.position.copy(a).add(bb).multiplyScalar(0.5);
          mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), bb.clone().sub(a).normalize());
        }
        if (overlay) mesh.renderOrder = 20 + (pct > 0 ? 1 : 0);
        b.add(mesh); all.push(mesh);
        if (pct > 0) hit.push({ mesh, pct, id, col, base: mesh.scale.clone(), lit: false, pop: 0 });
      }
    }
    return { all, hit };
  }
  // the x-ray cam: the suspect's body turned to glass, their organs inside it
  function overlayFor(s) {
    const r = P.rigs.get(s.clip.v); if (!r) return;
    r.rig.root.traverse((o) => {
      if (!o.isMesh) return;
      const ms = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => { const g = m.clone(); g.transparent = true; g.opacity = 0.28; g.depthWrite = false; return g; });
      o.material = Array.isArray(o.material) ? ms : ms[0];
    });
    const { all, hit } = organsOn(r.rig, s.clip.fl.o || {}, true);
    P.xo = { all, hit, lit: [] };
  }
  // a round reached an organ: it flares, takes its wound's colour, and joins the read-out
  function lightOrgan(o) {
    if (o.lit) return;
    o.lit = true; o.pop = 1; o.mesh.material.color.setHex(o.col); o.mesh.material.opacity = 1;
    if (!P.xo.lit.some((l) => l.o.id === o.id)) P.xo.lit.push({ o, t: P.st }); // (an organ in several pieces: listed once)
    if (P.vol > 0.02) sfx('ding');
  }

  // ================================================================ every frame (from the hangar)
  function update(dt) {
    if (!P.ready || !P.prog.length) return;
    if (P.exporting && P.exporting.worker) P.exporting.worker.postMessage({ t: 'tick', n: PACE }); // (the worker's frames: js/highlights.js credit)
    if (P.exporting && P.exporting.here) { audioLevel(0); return; } // (an export on this thread is playing it, off screen)
    // whether any screen is in view (for the picture), and the sound: only where you'd stand to watch one (in front of it,
    // within about one and a half of its widths at full and three at none, the screen not edge-on, nothing in between)
    const cam = G.R.camera, cp = cam.position; let seen = false, vol = 0;
    P.losT = (P.losT || 0) - dt;
    for (const tv of P.tvs) {
      const p = tv.scr.getWorldPosition(_a), d = p.distanceTo(cp);
      if (d < 45) { const f = _b.set(0, 0, -1).applyQuaternion(cam.quaternion); if (f.dot(p.clone().sub(cp).normalize()) > 0.2) seen = true; }
      const n = _b.set(0, 0, 1).applyQuaternion(tv.scr.getWorldQuaternion(new T.Quaternion())), v = cp.clone().sub(p), front = v.dot(n) / Math.max(1e-3, d);
      let k = G.U.clamp((tv.w * 3 - d) / (tv.w * 1.5), 0, 1) * G.U.clamp((front - 0.25) / 0.35, 0, 1);
      if (k > 0) {
        if (P.losT <= 0 || tv.los == null) tv.los = G.Level.los(G.Game.map, cp.x, cp.y, cp.z, p.x + n.x * 0.3, p.y, p.z + n.z * 0.3); // (a few times a second)
        if (!tv.los) k = 0;
      }
      vol = Math.max(vol, k);
    }
    if (P.losT <= 0) P.losT = 0.25;
    P.vol = vol * vol * (3 - 2 * vol); // (eased)
    audioLevel(P.vol);
    if (step(dt)) return;
    // the picture, twenty times a second while someone can see it
    P.frameT -= dt;
    if (!seen || P.frameT > 0) return;
    P.frameT = 0.05;
    draw();
  }
  // the broadcast moving on by dt: the clip acting, its moments, the next segment when it's done (true when it moved on)
  function step(dt) {
    P.time += dt; P.st += dt;
    const s = P.prog[P.seg];
    if (s.kind === 'clip') {
      act(s, dt);
      // the kill moment: the crowd goes off (once a clip; a kill sequence's, at each kill, louder each time)
      if (s.clip.kind === 'seq') { while ((s.kn || 0) < s.clip.kills.length && s.tau >= s.clip.kills[s.kn || 0].t) { s.kn = (s.kn || 0) + 1; sfxFor(s, 'moment'); } }
      else if (!s.fired && s.tau >= momentT(s.clip)) { s.fired = true; sfxFor(s, 'moment'); }
    }
    if (P.st >= s.dur) { sfxFor(s, 'end'); next(); return true; }
    return false;
  }
  // a frame of it: the picture into the render target, the graphics over it (true when there's a picture under them)
  function draw() {
    const s = P.prog[P.seg], R2 = G.R.renderer, U = G.LightGrid && G.LightGrid.U, gridW = U ? U.lgGrid.value.w : 0;
    let live = 0;
    if (s.kind === 'clip') {
      camFor(s);
      if (U) U.lgGrid.value.w = 0;
      const hid = P.hide.filter((o) => o.visible); for (const o of hid) o.visible = false; // (what the lens is inside: js/highlights.js clearance)
      R2.setRenderTarget(P.rt); R2.clear(); R2.render(P.scene, P.cam); R2.setRenderTarget(null);
      for (const o of hid) o.visible = true;
      if (U) U.lgGrid.value.w = gridW;
      live = 1;
    } else if (s.kind === 'gear' && P.gpiv && P.gpiv.children.length) {
      P.gpiv.rotation.y = Math.PI / 2 + Math.sin(P.st * 0.55) * 0.75; // (swinging through its three-quarter views, never end-on)
      if (U) U.lgGrid.value.w = 0;
      R2.setRenderTarget(P.rt); R2.clear(); R2.render(P.gs, P.gcam); R2.setRenderTarget(null);
      if (U) U.lgGrid.value.w = gridW;
      live = 1;
    } else if (s.kind === 'xray' && P.xrig) {
      // (round them slowly, a little closer while the rounds go in)
      xrayPlay(P.st);
      // (and down with them as they fall: looking at where the body is, from a little lower)
      const a = 0.4 + P.st * 0.45, V = P.xview || { mid: new T.Vector3(), r: 2.7 }, rr = V.r, cx = P.xcam;
      const fallen = P.xtl && P.xtl.fallP, hp = fallen ? P.xrig.hips.getWorldPosition(new T.Vector3()) : null;
      const want = hp ? new T.Vector3(hp.x, Math.max(0.35, hp.y + 0.15), hp.z) : new T.Vector3(V.mid.x, 1.05, V.mid.z);
      if (!P.xlook || P.st < 0.1) P.xlook = want; else P.xlook.lerp(want, 0.08);
      cx.position.set(V.mid.x + Math.sin(a) * rr, 1.3 + (rr - 2.7) * 0.25 - (1.05 - P.xlook.y) * 0.6, V.mid.z + Math.cos(a) * rr); cx.lookAt(P.xlook);
      cx.setViewOffset(W, H, -W * 0.06, 0, W, H); // (the body a little right of centre: the read-out's on the left)
      for (const o of P.xorg || []) o.mesh.material.opacity = 0.6 + 0.4 * Math.abs(Math.sin(P.time * 5 + o.pct));
      if (U) U.lgGrid.value.w = 0;
      R2.setRenderTarget(P.rt); R2.clear(); R2.render(P.xs, P.xcam); R2.setRenderTarget(null);
      if (U) U.lgGrid.value.w = gridW;
      live = 1;
    }
    paint(s);
    P.ov.needsUpdate = true;
    P.mat.uniforms.live.value = live; P.mat.uniforms.time.value = P.time;
    return live;
  }

  // ================================================================ motion graphics
  const ease = (x) => 1 - Math.pow(1 - G.U.clamp(x, 0, 1), 3);
  const nameOf = (k) => { const A = k && P.actors.get(k); return !A ? 'UNKNOWN' : A.kind === 'p' ? (A.name || 'OFFICER') : (G.ENEMIES[A.type] || {}).name || 'SUSPECT'; };
  const colOf = (k) => { const A = k && P.actors.get(k); return A && A.kind === 'p' && A.color != null ? G.U.hex(A.color) : '#ff4a3a'; };
  const HYPE = ['THE DOOR-KICKING', 'THE UNSTOPPABLE', 'THE MAGNIFICENT', 'THE BUTCHER OF BLOCK C', 'THE HALLWAY HURRICANE', 'THE CERTIFIED', 'THE STAIRWELL STALLION', 'THE LEGAL', 'THE ABSOLUTELY JUSTIFIED'];
  const hype = (k) => { const A = P.actors.get(k), n = (A && A.name) || ''; let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const an = A && A.animal ? G.Callsigns.of(A.animal).name.toUpperCase() : 'OFFICER'; return `${HYPE[h % HYPE.length]} ${an}`; };
  function text(g, s, x, y, size, col, align = 'left', weight = '900', stroke = null) {
    g.font = `${weight} ${size}px "Arial Black", Impact, sans-serif`; g.textAlign = align; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = size * 0.14; g.strokeStyle = stroke; g.strokeText(s, x, y); }
    g.fillStyle = col; g.fillText(s, x, y);
  }
  function bug(g) {
    g.fillStyle = 'rgba(10,14,22,0.82)'; g.fillRect(18, 16, 330, 44);
    g.fillStyle = '#e8202a'; g.fillRect(18, 16, 64, 44);
    text(g, 'BPS', 50, 38, 22, '#fff', 'center');
    g.fillStyle = Math.sin(P.time * 6) > 0 ? '#ff3a3a' : '#7a1010'; g.beginPath(); g.arc(98, 38, 6, 0, 7); g.fill();
    text(g, `LIVE · LEVEL ${P.levelN} RECAP`, 112, 32, 15, '#fff'); text(g, (P.theme || '').toUpperCase(), 112, 49, 11, '#9fb6cc', 'left', '700');
    // the score: the squad's kills against the house's fouls
    let k = 0, f = 0; for (const s of P.stats.values()) { k += s.kills; f += s.fouls; }
    g.fillStyle = 'rgba(10,14,22,0.82)'; g.fillRect(W - 230, 16, 212, 44);
    text(g, `SQUAD ${k}`, W - 210, 38, 18, '#7dff9a'); text(g, `FOULS ${f}`, W - 34, 38, 18, '#ff6a4a', 'right');
  }
  function ticker(g, msg) {
    g.fillStyle = 'rgba(232,32,42,0.92)'; g.fillRect(0, H - 30, W, 30);
    g.fillStyle = '#0a0e16'; g.fillRect(0, H - 30, 120, 30); text(g, 'BREAKING', 60, H - 15, 14, '#fff', 'center');
    g.save(); g.beginPath(); g.rect(120, H - 30, W - 120, 30); g.clip();
    const x = W - ((P.time * 110) % (W + g.measureText(msg).width + 400));
    text(g, msg, x, H - 15, 15, '#fff', 'left', '800'); g.restore();
  }
  function burst(g, x, y, r, col, t) {
    g.save(); g.translate(x, y); g.rotate(t * 0.8); g.fillStyle = col; g.beginPath();
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, rr = i % 2 ? r * 0.55 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill(); g.restore();
  }
  // How long the big tagline waits after the moment, on screen, so the kill itself is seen before it's covered: up to
  // 1.2 s, less if the shot ends sooner (it keeps 1.3 s for itself), never under 0.3
  const tagWait = (s) => G.U.clamp(s.dur - (s.mSt || 0) - 1.3, 0.3, 1.2);
  function bigText(g, s, col, t, y = H * 0.42, x = W / 2, size = 74) {
    const k = ease(t * 3), sc = 0.4 + 0.6 * k + Math.sin(t * 14) * 0.03 * (1 - Math.min(1, t));
    g.save(); g.translate(x, y); g.scale(sc, sc); g.rotate(-0.06);
    burst(g, 0, 0, size * 3.1, 'rgba(255,210,40,0.85)', t);
    text(g, s, 0, 0, size, col, 'center', '900', '#14080a');
    g.restore();
  }
  function lowerThird(g, k, title, sub, t, col) {
    const x = -520 + ease(t * 2.5) * 538;
    g.fillStyle = col || colOf(k); g.fillRect(x, H - 150, 500, 8);
    g.fillStyle = 'rgba(8,12,20,0.88)'; g.fillRect(x, H - 142, 500, 84);
    const A = P.actors.get(k);
    if (A && A.kind === 'p' && A.animal) { g.save(); g.translate(x + 14, H - 134); G.Callsigns.draw(g, A.animal, 68, A.color); g.restore(); }
    fit(g, title, x + 94, H - 118, 396, 26, '#fff'); fit(g, sub, x + 94, H - 84, 396, 15, '#cfe2ff', 'left', '700');
  }
  // the presenters, in their box: two hosts, reacting like a game show's
  const LINES = { up: ['SUGOI!!', 'BEAUTIFUL!!', 'TEXTBOOK!!', 'OH MY GOD!!', 'INCREDIBLE!!', 'YATTA!!'], shock: ['YABAI!!', 'NANI?!', 'NO WAY!!', 'WHAAAT?!'], sad: ['NOOOO...', 'SO SAD...', 'OH NO NO NO', 'TERRIBLE...'], laugh: ['HAHAHA!', 'CLASSIC!', 'HE DIDN\'T SEE IT!'], spray: ['BRRRRRT!!', 'DAKKA DAKKA!!', 'MAG DUMP!!', 'SEND IT!!'], love: ['SO WHOLESOME!!', 'PEACE & LOVE!', 'KAWAII!!', 'MY HEART!!'], bleed: ['SLOW BURN!!', 'CLOCK RAN OUT!', 'DRAMATIC EXIT!', 'TOOK THEIR TIME!'] };
  function presenters(g, mood, t, line) {
    const bx = W - 300, by = H - 210, bw = 280, bh = 170;
    g.fillStyle = 'rgba(8,10,18,0.9)'; g.fillRect(bx, by, bw, bh);
    const sky = g.createLinearGradient(0, by, 0, by + bh); sky.addColorStop(0, '#ff5ac8'); sky.addColorStop(1, '#5a2aff'); g.fillStyle = sky; g.fillRect(bx + 4, by + 4, bw - 8, bh - 8);
    for (let i = 0; i < 2; i++) {
      const cx = bx + 75 + i * 130, cy = by + 100 + Math.sin(t * (mood === 'up' ? 18 : 6) + i * 2) * (mood === 'up' ? 6 : 2), skin = i ? '#f2c9a0' : '#e0b08a';
      g.fillStyle = i ? '#ff3a8a' : '#2a2adf'; g.fillRect(cx - 40, cy + 30, 80, 50); // the jacket
      g.fillStyle = skin; g.beginPath(); g.arc(cx, cy, 36, 0, 7); g.fill();
      g.fillStyle = i ? '#1a1018' : '#f4e04a'; g.beginPath(); g.arc(cx, cy - 18, 34, Math.PI, 0); g.fill(); // hair
      if (i) { g.beginPath(); g.arc(cx + 30, cy - 10, 12, 0, 7); g.fill(); g.beginPath(); g.arc(cx - 30, cy - 10, 12, 0, 7); g.fill(); }
      // eyes and mouth by mood
      g.fillStyle = '#fff'; g.strokeStyle = '#120a10'; g.lineWidth = 3;
      if (mood === 'shock') { for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 13, cy - 2, 11, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#120a10'; g.beginPath(); g.arc(cx + s * 13, cy - 2, 3, 0, 7); g.fill(); g.fillStyle = '#fff'; } g.fillStyle = '#5a0a14'; g.beginPath(); g.ellipse(cx, cy + 20, 9, 13, 0, 0, 7); g.fill(); }
      else if (mood === 'sad') { for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 13, cy, 7, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.fillStyle = '#5ac8ff'; g.fillRect(cx + s * 13 - 2, cy + 2, 4, 14 + (t * 40) % 20); } g.beginPath(); g.arc(cx, cy + 26, 10, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); }
      else { for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 13, cy, 7, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); } g.fillStyle = '#5a0a14'; g.beginPath(); g.arc(cx, cy + 12, 14, 0, Math.PI); g.fill(); g.fillStyle = '#fff'; g.fillRect(cx - 10, cy + 12, 20, 4); }
      if (mood === 'shock') { g.fillStyle = '#7ad8ff'; g.beginPath(); g.ellipse(cx + 34, cy - 20, 5, 9, 0.3, 0, 7); g.fill(); } // a sweat drop
    }
    text(g, 'DJ BANZAI & MIMI', bx + bw / 2, by + 16, 12, '#fff', 'center', '800');
    if (line) {
      const k = ease(t * 4), sc = 0.6 + 0.4 * k;
      g.save(); g.translate(bx + bw / 2, by - 34); g.scale(sc, sc); g.rotate(Math.sin(t * 10) * 0.05);
      g.fillStyle = '#fff'; g.strokeStyle = '#120a10'; g.lineWidth = 4; g.beginPath(); g.ellipse(0, 0, 130, 30, 0, 0, 7); g.fill(); g.stroke();
      text(g, line, 0, 2, 26, mood === 'sad' ? '#3a5aa8' : '#e8202a', 'center');
      g.restore();
    }
  }
  function slowmo(g) {
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(W - 240, 72, 222, 34);
    text(g, '◀◀ SUPER SLO-MO', W - 129, 89, 17, '#e8202a', 'center');
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const y = (i * 37 + P.time * 300) % H; g.beginPath(); g.moveTo(0, y); g.lineTo(80, y); g.moveTo(W - 80, (y * 1.7) % H); g.lineTo(W, (y * 1.7) % H); g.stroke(); }
  }
  // a wipe between angles: the team colour sweeping across with the logo
  function wipe(g, k, col) {
    if (k <= 0 || k >= 1) return;
    const x = -W * 0.3 + k * W * 1.6;
    g.save(); g.fillStyle = col; g.beginPath(); g.moveTo(x - 260, 0); g.lineTo(x + 120, 0); g.lineTo(x - 20, H); g.lineTo(x - 400, H); g.closePath(); g.fill();
    text(g, 'BPS', x - 140, H / 2, 70, '#fff', 'center'); g.restore();
  }
  function paint(s) {
    const g = P.g, t = P.st;
    g.clearRect(0, 0, W, H);
    if (s.kind === 'open') {
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#0a1a3a'); gr.addColorStop(1, '#3a0a2a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(255,255,255,${0.04 + 0.03 * Math.sin(P.time * 3 + i)})`; g.fillRect((i * 97 + P.time * 120) % W, 0, 30, H); }
      g.save(); g.translate(W / 2, 110); g.scale(ease(t * 1.5), ease(t * 1.5)); text(g, 'BREACH PROTOCOL', 0, 0, 60, '#fff', 'center', '900', '#e8202a'); g.restore();
      text(g, `POST-RAID LIVE · LEVEL ${P.levelN}`, W / 2, 168, 22, '#ffd24a', 'center');
      text(g, 'TONIGHT\'S STARTING LINEUP', W / 2, 212, 18, '#9fdcff', 'center', '800');
      const offs = [...P.actors.entries()].filter(([, A]) => A.kind === 'p');
      offs.forEach(([k, A], i) => {
        const n = offs.length, cw = Math.min(210, (W - 80) / Math.max(1, n)), x = W / 2 - (n * cw) / 2 + i * cw + cw / 2, y = 340 + (1 - ease(t * 2 - i * 0.25)) * 300;
        g.fillStyle = 'rgba(8,12,24,0.85)'; g.fillRect(x - cw / 2 + 8, y - 90, cw - 16, 190); g.fillStyle = colOf(k); g.fillRect(x - cw / 2 + 8, y - 90, cw - 16, 8);
        if (A.animal) { g.save(); g.translate(x - 40, y - 74); G.Callsigns.draw(g, A.animal, 80, A.color); g.restore(); }
        text(g, (A.name || '').toUpperCase(), x, y + 26, 20, '#fff', 'center');
        text(g, hype(k), x, y + 50, 10, '#ffd24a', 'center', '800');
        const st = P.stats.get(k) || {}; text(g, `${st.kills || 0} KILLS · ${st.hs || 0} HS`, x, y + 76, 13, '#9fdcff', 'center', '800');
      });
      ticker(g, 'HEROES OF THE CITY · ALL FORCE USED TONIGHT WAS, IN OUR OPINION, COMPLETELY FINE · STAY TUNED FOR HIGHLIGHTS · ');
      return;
    }
    if (s.kind === 'card') { // between a surrender and its arrest: the time skipped, on a sweep of pink
      const k = ease(t * 3), out = G.U.clamp((t - s.dur + 0.35) / 0.35, 0, 1), x = -W + (k - out) * W;
      const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#ff9ad2'); gr.addColorStop(1, '#9a7aff');
      g.save(); g.translate(x, 0); g.fillStyle = gr; g.fillRect(0, 0, W, H); hearts(g, t, 8);
      text(g, 'MOMENTS LATER...', W / 2, H / 2 - 16, 58, '#fff', 'center', '900', '#3a1030');
      text(g, `${Math.round(s.gap)} SECONDS OF COMPLIANCE`, W / 2, H / 2 + 40, 20, '#3a1030', 'center', '800');
      g.restore(); return;
    }
    if (s.kind === 'quiet') { g.fillStyle = '#0a1420'; g.fillRect(0, 0, W, H); text(g, 'A QUIET NIGHT IN THE CITY', W / 2, H / 2, 40, '#fff', 'center'); text(g, 'Nobody died. Ratings are down 94%.', W / 2, H / 2 + 46, 18, '#9fb6cc', 'center', '700'); bug(g); return; }
    if (s.kind === 'ad') { if (s.store) storeAd(g, s.store, t, s.dur); else advert(g, s.ad, t, s.dur); return; }
    if (s.kind === 'gear') { gearRoom(g, s, t); return; }
    if (s.kind === 'sponsor') {
      const love = s.tone === 'love', gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, s.tone === 'sad' ? '#1a2a4a' : love ? '#ff9ad2' : '#ffb21a'); gr.addColorStop(1, s.tone === 'sad' ? '#3a4a6a' : love ? '#9a7aff' : '#e8202a'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      if (love) hearts(g, t, 14);
      burst(g, W / 2, H / 2, 420 * ease(t * 2), s.tone === 'sad' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.18)', P.time);
      text(g, 'BROUGHT TO YOU BY', W / 2, H / 2 - 90, 18, '#fff', 'center', '800');
      g.save(); g.translate(W / 2, H / 2 - 30); const k = ease(t * 2.5); g.scale(k, k); text(g, s.sp[0], 0, 0, 58, '#fff', 'center', '900', '#14080a'); g.restore();
      text(g, s.sp[1], W / 2, H / 2 + 50, 30, s.tone === 'sad' ? '#bcd6ff' : '#14080a', 'center');
      return;
    }
    if (s.kind === 'table') {
      g.fillStyle = '#0a1426'; g.fillRect(0, 0, W, H);
      text(g, 'FINAL STANDINGS', W / 2, 70, 44, '#fff', 'center', '900', '#e8202a');
      const rank = (st) => st.kills + (st.arrests || 0) - st.fouls * 2, rows = [...P.stats.entries()].filter(([k]) => k[0] === 'p').sort((a, b) => rank(b[1]) - rank(a[1]));
      text(g, 'OFFICER', 150, 130, 14, '#9fb6cc'); for (const [x, h] of [[470, 'KILLS'], [550, 'HS'], [630, 'BREACH'], [710, 'CUFFS'], [790, 'FOULS'], [870, 'DOWNED']]) text(g, h, x, 130, 14, '#9fb6cc', 'center');
      rows.forEach(([k, st], i) => {
        const y = 175 + i * 64, x0 = -900 + ease(t * 2 - i * 0.2) * 900;
        g.save(); g.translate(x0, 0);
        g.fillStyle = i === 0 ? 'rgba(255,210,40,0.25)' : 'rgba(255,255,255,0.06)'; g.fillRect(90, y - 26, 820, 54); g.fillStyle = colOf(k); g.fillRect(90, y - 26, 8, 54);
        const A = P.actors.get(k); if (A && A.animal) { g.save(); g.translate(108, y - 22); G.Callsigns.draw(g, A.animal, 44, A.color); g.restore(); }
        text(g, (nameOf(k)).toUpperCase() + (i === 0 ? '  ★ MVP' : ''), 160, y, 22, '#fff');
        for (const [x, v] of [[470, st.kills], [550, st.hs], [630, st.breach], [710, st.arrests], [790, st.fouls], [870, st.downs]]) text(g, String(v || 0), x, y, 24, '#fff', 'center');
        g.restore();
      });
      ticker(g, 'THAT\'S ALL FROM THE HANGAR · SEE YOU AFTER THE NEXT RAID · BREACH PROTOCOL SPORTS IS NOT RESPONSIBLE FOR ANY OF THIS · ');
      return;
    }
    const c = s.clip;
    if (s.kind === 'xray') {
      const A = P.actors.get(c.v), O = c.fl.o || {}, ORG = G.Ballistics.ORG, list = Object.entries(O).sort((a, b) => b[1] - a[1]);
      g.fillStyle = 'rgba(0,0,0,0)'; bug(g);
      g.fillStyle = 'rgba(4,16,30,0.85)'; g.fillRect(24, 90, 330, 60 + list.length * 34);
      text(g, 'KILL BREAKDOWN', 40, 112, 22, '#5ad8ff'); text(g, `${nameOf(c.v).toUpperCase()} · ${c.fl.d ? c.fl.d + ' M' : ''}`, 40, 136, 13, '#cfe2ff', 'left', '700');
      list.forEach(([id, pct], i) => {
        const y = 170 + i * 34, k = ease(t * 2 - i * 0.15), lab = ORG[id] ? ORG[id].label.toUpperCase() : id;
        text(g, lab, 40, y, 15, '#fff', 'left', '800');
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(200, y - 8, 140, 16); g.fillStyle = pct >= 100 ? '#ff2a2a' : '#ffb02a'; g.fillRect(200, y - 8, 140 * Math.min(1, pct / 100) * k, 16);
        text(g, pct >= 100 ? 'DESTROYED' : pct + '%', 336, y, 11, '#fff', 'right', '800');
      });
      // and the rounds: what each did, as it goes in
      const ry = 170 + list.length * 34 + 6;
      const groups = []; for (const k of P.xtracks || []) (groups[k.g] = groups[k.g] || []).push(k);
      groups.slice(0, 4).forEach((ks, i) => {
        const shown = t >= XT0 + i * XT + 0.5; if (!shown || !ks) return;
        const k = ks[0], r = k.r, tr = ks.flatMap((q) => q.trace), yawed = tr.some((q) => q.yawed), exp = tr.some((q) => q.expanded), am = k.fl.am && G.AMMO[k.fl.am] ? G.AMMO[k.fl.am].name : 'round', frags = ks.reduce((a, q) => a + q.frags.length, 0);
        const thru = ks.filter((q) => q.r.exitV > 0).length, armd = ks.filter((q) => q.r.stopped && !q.trace.length).length;
        const what = k.n > 1 ? `${k.n} PELLETS · ${ks.length} IN THEM · ${thru} THROUGH${armd ? ` · ${armd} ON ARMOUR` : ''}`
          : r.stopped && !k.trace.length ? 'STOPPED BY ARMOUR' : r.exitV > 0 ? `THROUGH, ${Math.round(r.exitV)} m/s out` : `STOPPED ${Math.round((k.endT - k.entryT) * 100)} cm in`;
        const how = [exp ? 'EXPANDED' : null, yawed ? 'TUMBLED' : null, frags ? `${frags} FRAGMENTS` : null].filter(Boolean).join(' · ');
        g.fillStyle = 'rgba(4,16,30,0.85)'; g.fillRect(24, ry + i * 38 - 4, 330, 36);
        fit(g, `ROUND ${i + 1} · ${am} · ${Math.round(k.vIn)} m/s in`, 40, ry + i * 38 + 8, 300, 14, '#fff', 'left', '900');
        fit(g, what + (how ? ' · ' + how : ''), 40, ry + i * 38 + 24, 300, 12, how ? '#ffb02a' : '#9fdcff', 'left', '800');
      });
      const dead = list.filter(([, p]) => p >= 100).length;
      bigText(g, dead >= 2 ? `${dead} ORGANS DESTROYED!!` : dead ? 'ORGAN DESTROYED!' : 'FATAL BLEEDING', '#fff', t - 0.6, H * 0.84, W * 0.36, 40);
      presenters(g, 'up', t, t > 1 ? LINES.up[(c.n || 0) % LINES.up.length] : null);
      return;
    }
    // a clip: the live picture with its graphics
    bug(g);
    const k0 = c.a, kills = c.kind === 'kill', foul = kills && c.fl.why, killer = k0 && P.actors.get(k0);
    const w = defOf(c.gun || (c.guns && c.guns[k0]) || (killer && killer.gun));
    if (c.kind === 'seq') { seqGraphics(g, s, c, w); return; }
    if (s.slow) slowmo(g);
    else { g.fillStyle = 'rgba(232,32,42,0.9)'; g.fillRect(18, 72, 90, 26); text(g, s.label, 63, 85, 14, '#fff', 'center'); }
    if (s.cam !== 'wide') { g.fillStyle = s.xr ? 'rgba(20,90,140,0.8)' : 'rgba(0,0,0,0.6)'; g.fillRect(18, 104, 200, 24); text(g, s.xr ? 'X-RAY CAM' : ({ helmet: 'HELMET CAM', gun: 'GUN CAM', ots: 'OVER THE SHOULDER', bullet: 'BULLET CAM', cuff: 'CUFF CAM' })[s.cam] + (s.who && s.who[0] === 'e' ? ' (SUSPECT)' : ''), 28, 116, 12, '#fff', 'left', '800'); }
    if (s.cam === 'bullet' && c.killShot) bulletGraphics(g, s, c);
    // the x-ray cam's read-out: each organ as a round reaches it, sliding in on the right (under the slow-motion tag,
    // above the presenters: four rows, then how many more)
    if (s.xr && P.xo && P.xo.lit.length) {
      const ORG = G.Ballistics.ORG, rows = P.xo.lit.slice(0, 4), more = P.xo.lit.length - rows.length;
      if (more > 0) { g.fillStyle = 'rgba(4,16,30,0.85)'; g.fillRect(W - 268, 118 + 4 * 30, 250, 20); text(g, `+${more} MORE`, W - 28, 128 + 4 * 30, 12, '#ffd27a', 'right', '900'); }
      rows.forEach(({ o, t: lt }, i) => {
        const y = 118 + i * 30, k = ease((P.st - lt) * 4), x = W - 18 - 250 * k;
        g.fillStyle = 'rgba(4,16,30,0.85)'; g.fillRect(x, y, 250, 26); g.fillStyle = o.pct >= 100 ? '#ff2a2a' : '#ffb02a'; g.fillRect(x, y, 6, 26);
        text(g, ORG[o.id] ? ORG[o.id].label.toUpperCase() : o.id, x + 16, y + 13, 14, '#fff', 'left', '800');
        text(g, o.pct >= 100 ? 'DESTROYED' : o.pct + '%', x + 240, y + 13, 13, o.pct >= 100 ? '#ff6a5a' : '#ffd27a', 'right', '900');
      });
    }
    // (the moment: when the round got there; the graphics count from it in time on screen, the clip's rate not being fixed)
    const moment = s.tau >= momentT(c);
    if (moment && s.mSt == null) s.mSt = P.st;
    if (kills) {
      lowerThird(g, k0, foul ? `${nameOf(k0).toUpperCase()}` : `${nameOf(k0).toUpperCase()} · KILL #${c.n}`, c.fl.bo ? `${hype(k0)} · BLED OUT${c.fl.bt ? ' ' + c.fl.bt + ' S LATER' : ''}` : `${hype(k0)}${w ? ' · ' + w.name : ''}${c.fl.d ? ' · ' + c.fl.d + ' M' : ''}`, P.st);
      if (moment && c.fl.bo && !foul) { const tt = P.st - s.mSt; flatline(g, tt, c.fl.bt); presenters(g, 'shock', tt, LINES.bleed[(c.n + P.seg) % LINES.bleed.length]); }
      else if (moment) {
        const tags = foul ? [c.fl.why === 'civ' ? 'FOUL! CIVILIAN!' : 'FOUL! HE SURRENDERED!'] : [c.fl.br ? 'BREACH & CLEAR!' : null, c.fl.hs ? 'HEADSHOT!!' : null, c.fl.ap ? 'STRAIGHT THROUGH THE ARMOUR!' : null, c.fl.long ? `LONG SHOT! ${c.fl.d} M` : null, c.fl.spray ? `${c.fl.spray}-ROUND HOSE-DOWN!` : null, c.fl.sur ? 'SURPRISE PARTY!' : null, c.fl.ws ? 'TAP-OUT DENIED!' : null].filter(Boolean);
        const tt = P.st - s.mSt, tg = tt - tagWait(s); // (the tagline once they've been seen to go down)
        // (smaller and to the left on the x-ray cam, off the body)
        if (tags.length && tg >= 0) bigText(g, tags[Math.min(tags.length - 1, Math.floor(tg / 1.1))], foul ? '#ffe23a' : '#fff', tg % 1.1, s.xr ? H * 0.62 : H * 0.42, s.xr ? W * 0.27 : W / 2, s.xr ? 40 : 74);
        const mood = foul ? 'sad' : c.fl.spray ? 'up' : c.fl.sur ? 'laugh' : c.fl.hs || c.fl.br || c.fl.long || c.fl.ap ? 'shock' : 'up', lines = c.fl.spray && !foul ? LINES.spray : LINES[mood];
        presenters(g, mood, tt, lines[(c.n + P.seg) % lines.length]);
      }
    } else if (c.kind === 'arrest' && c.hands) { // the surrender before an arrest: hands up
      lowerThird(g, k0, `${nameOf(k0).toUpperCase()} · TALKED DOWN`, `${hype(k0)} · NOT A SHOT FIRED`, P.st, '#ff7ac8');
      if (moment) {
        const tt = P.st - s.mSt;
        bigText(g, tt < 1.2 ? 'HANDS UP!' : 'DON\'T MOVE!', '#fff', tt % 1.2, H * 0.42, W / 2, 66);
        presenters(g, 'shock', tt, LINES.shock[(c.n + P.seg) % LINES.shock.length]);
      }
      return;
    } else if (c.kind === 'arrest') { // an arrest: hearts, peace and love
      lowerThird(g, k0, `${nameOf(k0).toUpperCase()} · ARREST`, `${hype(k0)} · NOBODY GOT HURT`, P.st, '#ff7ac8');
      if (moment) {
        const tt = P.st - s.mSt;
        hearts(g, tt, 18);
        bigText(g, tt < 1.6 ? 'CUFFED, NOT STUFFED!' : 'PEACE & LOVE!', '#ff5ab4', tt % 1.6, H * 0.42, W / 2, 62);
        if (tt > 0.6) text(g, '♥  PEACE · LOVE · DUE PROCESS  ♥', W / 2, H * 0.42 + 78, 20, '#fff', 'center', '900', 'rgba(120,20,80,0.6)');
        presenters(g, 'up', tt, LINES.love[(c.n + P.seg) % LINES.love.length]);
      }
      ticker(g, 'NOBODY HAD TO DIE TODAY · THE SYSTEM WORKS · SOMETIMES · BROUGHT TO YOU BY SUNSET ACRES: GATED. VERY GATED. · ');
      wipe(g, P.st / 0.45, '#ff7ac8');
      return;
    } else if (c.kind === 'saved') { // an officer's armour stopping rounds: they're still up
      const n = c.fl.n || 1;
      lowerThird(g, c.v, `${nameOf(c.v).toUpperCase()} · SAVED BY THE ARMOUR`, `${n > 1 ? n + ' rounds' : 'a round'} from a ${nameOf(c.a).toLowerCase()} · stopped cold`, P.st, '#58b8ff');
      if (moment) { const tt = P.st - s.mSt; bigText(g, tt < 1.3 ? (n > 1 ? `${n} ROUNDS STOPPED!` : 'STOPPED COLD!') : 'NOT TODAY!', '#9fe8ff', tt % 1.3); presenters(g, 'shock', tt, LINES.shock[(P.seg + n) % LINES.shock.length]); }
      ticker(g, 'BROUGHT TO YOU BY MERIDIAN ARMOR: STOPS WHAT YOUR FEELINGS CAN\'T · LEVEL III. LEVEL HEADS. · ');
      wipe(g, P.st / 0.45, '#58b8ff');
      return;
    } else { // an officer down
      lowerThird(g, c.v, `${nameOf(c.v).toUpperCase()} IS DOWN`, `taken out by a ${nameOf(c.a).toLowerCase()} · the crowd falls silent`, P.st, '#5a8aff');
      if (moment) { const tt = P.st - s.mSt; bigText(g, 'MAN DOWN!', '#bcd6ff', tt); presenters(g, 'sad', tt, LINES.sad[P.seg % 4]); }
    }
    ticker(g, kills ? (foul ? 'THE LEAGUE WILL REVIEW THIS INCIDENT · THE LEAGUE HAS REVIEWED THIS INCIDENT · NO FURTHER ACTION · ' : `${nameOf(k0).toUpperCase()} IS ON FIRE · ${(P.stats.get(k0) || {}).kills || 0} TONIGHT · `) : 'OUR THOUGHTS ARE WITH THE OFFICER\'S KNEECAPS · ');
    wipe(g, P.st / 0.45, colOf(k0));
  }
  // A bleed-out's moment: a heart monitor across the middle, its trace beating slower and weaker to a thready pulse, and
  // BLED OUT stamped over it (down from it: incapacitated), with how long after the last round they went down
  function flatline(g, t, bt) {
    const x0 = W * 0.18, w = W * 0.64, y0 = H * 0.36, h = 110, k = ease(t * 3);
    g.save(); g.globalAlpha = k;
    g.fillStyle = 'rgba(2,14,10,0.88)'; g.fillRect(x0, y0 - h / 2, w, h); g.strokeStyle = '#1d5a3a'; g.lineWidth = 1;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(x0 + w * i / 8, y0 - h / 2); g.lineTo(x0 + w * i / 8, y0 + h / 2); g.stroke(); }
    // the trace, drawn up to now (sweeping across in 1.6 s): beats further apart and smaller, down to a thready pulse
    // (they're down, not dead: incapacitated by the blood loss)
    const sweep = Math.min(1, t / 1.6), beats = [0.06, 0.24, 0.45, 0.7, 0.96], amp = [1, 0.62, 0.38, 0.24, 0.16];
    g.strokeStyle = '#3aff8a'; g.lineWidth = 3; g.shadowColor = '#3aff8a'; g.shadowBlur = 10; g.beginPath();
    for (let i = 0; i <= 200 * sweep; i++) {
      const u = i / 200; let y = 0;
      beats.forEach((b, j) => { const d = (u - b) / 0.02; if (Math.abs(d) < 2) y += (d < 0 ? -1 : 1) * Math.exp(-d * d) * 40 * amp[j] * (Math.abs(d) < 0.6 ? -1.6 : 0.5); });
      const px = x0 + 12 + (w - 24) * u, py = y0 + y; if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.stroke(); g.shadowBlur = 0;
    if (sweep >= 1) { g.fillStyle = '#3aff8a'; text(g, '34 BPM · WEAK', x0 + w - 16, y0 - h / 2 + 18, 14, '#3aff8a', 'right', '900'); }
    g.restore();
    if (t > 1.4) {
      const k2 = ease((t - 1.4) * 3);
      g.save(); g.translate(W / 2, y0 + 4); g.rotate(-0.05); g.scale(0.6 + 0.4 * k2, 0.6 + 0.4 * k2);
      text(g, 'BLED OUT', 0, 0, 64, '#ff3a3a', 'center', '900', '#14080a'); g.restore();
      if (bt) text(g, `DOWN ${bt} S AFTER THE LAST ROUND`, W / 2, y0 + h / 2 + 22, 18, '#fff', 'center', '900', 'rgba(0,0,0,0.6)');
    }
  }
  // hearts drifting up the screen (n of them, each its own speed and sway)
  function heart(g, x, y, r, col) {
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y + r * 0.9);
    g.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.7, y - r * 1.3, x, y - r * 0.45);
    g.bezierCurveTo(x + r * 0.7, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9); g.fill();
  }
  function hearts(g, t, n) {
    for (let i = 0; i < n; i++) {
      const sp = 60 + (i * 37) % 70, x = (i * 151 + 40) % W + Math.sin(t * 2 + i) * 18, y = H + 40 - ((t * sp + i * 83) % (H + 80)), r = 10 + (i * 7) % 14;
      heart(g, x, y, r, ['rgba(255,90,180,0.8)', 'rgba(255,150,210,0.75)', 'rgba(255,60,120,0.7)'][i % 3]);
    }
  }
  // a kill sequence's graphics: the count so far in a badge, and at each kill its name (and what made it special)
  const MULTI = ['', 'FIRST BLOOD!', 'DOUBLE KILL!', 'TRIPLE KILL!', 'QUAD KILL!', 'RAMPAGE!!', 'UNSTOPPABLE!!', 'GODLIKE!!!'];
  function seqGraphics(g, s, c, w) {
    const k0 = c.a, n = c.kills.filter((q) => q.t <= s.tau).length, lastK = c.kills[n - 1];
    if (s.slow) slowmo(g); else { g.fillStyle = 'rgba(232,32,42,0.9)'; g.fillRect(18, 72, 90, 26); text(g, s.label, 63, 85, 14, '#fff', 'center'); }
    if (s.cam !== 'wide') { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(18, 104, 200, 24); text(g, ({ helmet: 'HELMET CAM', gun: 'GUN CAM', ots: 'OVER THE SHOULDER', cuff: 'CUFF CAM' })[s.cam], 28, 116, 12, '#fff', 'left', '800'); }
    lowerThird(g, k0, `${nameOf(k0).toUpperCase()} · KILL STREAK`, `${hype(k0)}${w ? ' · ' + w.name : ''} · ${c.kills.length} IN ${Math.max(1, Math.round(c.kills[c.kills.length - 1].t - c.t))} SECONDS`, P.st);
    // the counter: one pip a kill, lit as they fall
    const bx = 30, by = 150;
    g.fillStyle = 'rgba(8,12,20,0.85)'; g.fillRect(bx - 12, by - 12, 34 + c.kills.length * 30, 60);
    text(g, `×${n}`, bx, by + 18, 34, n >= 2 ? '#ffd24a' : '#fff', 'left', '900', '#14080a');
    c.kills.forEach((q, i) => { g.fillStyle = i < n ? (q.fl.hs ? '#ff3a3a' : '#7dff9a') : 'rgba(255,255,255,0.2)'; g.beginPath(); g.arc(bx + 70 + i * 26, by + 18, 9, 0, 7); g.fill(); });
    if (lastK) {
      const tt = (s.tau - lastK.t) / s.rate;
      const tg = tt - 0.6; // (each kill seen before its tagline covers it: they can come quick, so a shorter wait)
      if (tg >= 0 && tg < 1.4) {
        const extra = [lastK.fl.hs ? 'HEADSHOT' : null, lastK.fl.br ? 'BREACH' : null, lastK.fl.sur ? 'SURPRISE' : null].filter(Boolean).join(' + ');
        bigText(g, MULTI[Math.min(MULTI.length - 1, n)], n >= 3 ? '#ffd24a' : '#fff', tg, H * 0.42, W / 2, n >= 2 ? 74 : 56);
        if (extra) text(g, '+ ' + extra, W / 2, H * 0.42 + 70, 22, '#fff', 'center', '900', '#14080a');
      }
      if (n >= 2) presenters(g, n >= 3 ? 'shock' : 'up', tt, (n >= 3 ? LINES.shock : LINES.up)[(n + P.seg) % 4]);
    }
    ticker(g, `${nameOf(k0).toUpperCase()} IS ON A TEAR · ${c.kills.length} DOWN IN ONE BREATH · SOMEBODY CHECK THAT HEART RATE ·`);
    wipe(g, P.st / 0.45, colOf(k0));
  }
  // The bullet cam's graphics: where the round is (metres out, its speed, the time since it left the muzzle) big across the
  // top, and the trajectory, drawn: its drop below the bore line (gravity, over its time of flight) and its speed bleeding
  // off, the whole way to where it hit, a dot moving along it; under it what it was carrying when it got there
  function bulletGraphics(g, s, c) {
    const fl = flightOf(c.killShot), el = G.U.clamp(s.tau - c.killShot.t, 0, fl.tof), now = fl.at(el), x = el >= fl.tof ? fl.len : now.x;
    // (top right, under the slow-motion tag, compact enough to end above the presenters' speech bubble: the left and the
    // middle are the bullet's)
    const bx = W - 300, by = 112, bw = 282, bh = 156;
    g.fillStyle = 'rgba(4,12,24,0.86)'; g.fillRect(bx, by, bw, bh); g.fillStyle = '#ffb21a'; g.fillRect(bx, by, bw, 4);
    text(g, `TRAJECTORY ANALYSIS · ${fl.len.toFixed(1)} M`, bx + 10, by + 16, 12, '#fff', 'left', '900');
    g.fillStyle = '#ffb21a'; g.fillRect(bx + 10, by + 27, 5, 10); text(g, 'powered by SABLE RIDGE BALLISTICS', bx + 20, by + 32, 9, '#ffd24a', 'left', '800'); // (its sponsor)
    const px0 = bx + 38, py0 = by + 46, pw = bw - 50, ph = 54, maxDrop = Math.max(10, Math.ceil(fl.pts[fl.pts.length - 1].drop * 100 * 1.25 / 10) * 10), vTop = fl.v0 * 1.1;
    // the axes: distance along; the drop down the left (cm), the speed (m/s) in blue, from nothing
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.strokeRect(px0, py0, pw, ph);
    text(g, '0', px0 - 5, py0 + 4, 9, '#9fb6cc', 'right', '700'); text(g, `${maxDrop} cm`, px0 - 5, py0 + ph, 9, '#9fb6cc', 'right', '700');
    text(g, `${fl.len.toFixed(0)} m`, px0 + pw, py0 + ph + 9, 9, '#9fb6cc', 'right', '700');
    g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.moveTo(px0, py0); g.lineTo(px0 + pw, py0); g.stroke(); g.setLineDash([]);
    const X = (d) => px0 + pw * d / fl.len, Yd = (dr) => py0 + ph * Math.min(1, dr * 100 / maxDrop), Yv = (v) => py0 + ph * (1 - v / vTop);
    g.strokeStyle = 'rgba(90,184,255,0.8)'; g.lineWidth = 2; g.beginPath(); fl.pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Yv(p.v)) : g.moveTo(X(p.x), Yv(p.v)))); g.stroke();
    g.strokeStyle = '#ffd24a'; g.lineWidth = 3; g.beginPath(); fl.pts.forEach((p, i) => (i ? g.lineTo(X(p.x), Yd(p.drop)) : g.moveTo(X(p.x), Yd(p.drop)))); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(x), Yd(now.drop), 4, 0, 7); g.fill();
    if (el >= fl.tof) { g.fillStyle = '#ff3a3a'; g.beginPath(); g.arc(X(fl.len), Yd(fl.pts[fl.pts.length - 1].drop), 6, 0, 7); g.fill(); }
    text(g, 'DROP', px0 + 4, py0 + ph - 7, 8, '#ffd24a', 'left', '900'); text(g, 'SPEED', px0 + pw - 4, Yv(fl.v0) + 9, 8, '#5ab8ff', 'right', '900');
    // what it carried there
    const end = fl.pts[fl.pts.length - 1], J = 0.5 * fl.m * end.v * end.v, am = fl.am && G.AMMO[fl.am] ? G.AMMO[fl.am].name : '';
    fit(g, `${fl.def ? fl.def.name : ''}${am ? ' · ' + am : ''}${J > 0 ? ' · ' + G.U.fmt(Math.round(J)) + ' J on arrival' : ''}`, bx + 10, by + bh - 28, bw - 20, 11, '#ffd24a', 'left', '800');
    fit(g, `${Math.round(fl.v0)} → ${Math.round(end.v)} m/s · ${(fl.tof * 1000).toFixed(0)} ms · drop ${(end.drop * 100).toFixed(1)} cm`, bx + 10, by + bh - 11, bw - 20, 11, '#fff', 'left', '800');
    // where it is, big
    if (s.tau >= c.killShot.t - 0.02) {
      const live = el >= fl.tof ? 'IMPACT' : `${x.toFixed(1)} M  ·  ${Math.round(now.v)} M/S  ·  +${(el * 1000).toFixed(1)} MS`;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(W / 2 - 230, 72, 460, 40);
      text(g, live, W / 2, 92, el >= fl.tof ? 26 : 22, el >= fl.tof ? '#ff3a3a' : '#fff', 'center', '900');
    }
  }
  // text shrunk to fit a width
  function fit(g, s, x, y, maxW, size, col, align = 'left', weight = '900', stroke = null) {
    g.font = `${weight} ${size}px "Arial Black", Impact, sans-serif`;
    const w = g.measureText(s).width; text(g, s, x, y, w > maxW ? Math.floor(size * maxW / w) : size, col, align, weight, stroke);
  }
  // the gear room: the gun turning on the left (the picture), its file on the right
  function gearRoom(g, s, t) {
    const k = s.k, def = s.def, A = P.actors.get(k) || {}, x0 = W * 0.55, slide = (1 - ease(t * 2)) * 460; // (the file slides in)
    bug(g);
    g.fillStyle = 'rgba(232,32,42,0.92)'; g.fillRect(18, 72, 210, 28); text(g, 'THE GEAR ROOM', 123, 86, 15, '#fff', 'center');
    text(g, 'presented by IRONVALE ARMS', 22, 112, 11, '#ffd24a', 'left', '800');
    g.save(); g.translate(slide, 0);
    g.fillStyle = 'rgba(6,10,18,0.88)'; g.fillRect(x0, 70, W - x0 - 18, H - 140); g.fillStyle = colOf(k); g.fillRect(x0, 70, W - x0 - 18, 6);
    if (A.animal) { g.save(); g.translate(x0 + 12, 86); G.Callsigns.draw(g, A.animal, 44, A.color); g.restore(); }
    fit(g, nameOf(k).toUpperCase() + '\'S LOADOUT', x0 + 64, 108, W - x0 - 100, 20, '#fff');
    fit(g, def.name.toUpperCase(), x0 + 16, 150, W - x0 - 50, 28, '#ffd24a', 'left', '900', '#14080a');
    const cal = G.calOf(def), amN = s.am && G.AMMO[s.am] ? G.AMMO[s.am].name : null;
    text(g, `${cal || ''}${amN ? ' · ' + amN : ''}${def.rpm ? ' · ' + def.rpm + ' RPM' : ''}${def.weight ? ' · ' + def.weight.toFixed(1) + ' KG' : ''}`, x0 + 16, 176, 12, '#9fdcff', 'left', '800');
    // the numbers, counting up
    const cnt = (v) => Math.round(v * ease(t * 1.2 - 0.3));
    const nums = [['ROUNDS', cnt(s.rounds)], ['KILLS', cnt(s.kills)], ['PER KILL', s.kills ? (s.rounds / s.kills).toFixed(1) : '—'], ['HS', cnt(s.hs)]];
    nums.forEach(([lab, v], i) => { const x = x0 + 16 + i * ((W - x0 - 50) / 4); text(g, String(v), x, 212, 26, '#fff'); text(g, lab, x, 236, 10, '#9fb6cc', 'left', '800'); });
    // its build, then the kit
    let y = 266;
    const rows = s.parts.slice(0, 4).concat(s.kit.slice(0, 3));
    if (!s.parts.length) { text(g, 'FACTORY SPEC · NO MODS', x0 + 16, y, 12, '#9fb6cc', 'left', '800'); y += 20; }
    rows.forEach(([lab, val], i) => { const k2 = ease(t * 2.5 - 0.6 - i * 0.12); if (k2 <= 0) return; g.globalAlpha = k2; text(g, lab, x0 + 16, y, 10, i < s.parts.slice(0, 4).length ? '#ffb21a' : '#7dff9a', 'left', '800'); fit(g, val, x0 + 110, y, W - x0 - 140, 13, '#fff', 'left', '800'); g.globalAlpha = 1; y += 19; });
    if (s.others.length) { y += 4; fit(g, 'ALSO: ' + s.others.map((o) => `${o.def.name} (${o.n} rds, ${o.kills} kills)`).join(' · '), x0 + 16, y, W - x0 - 50, 11, '#9fb6cc', 'left', '700'); }
    g.restore();
    // the verdict stamps, one after the other
    const vi = Math.min(s.verdicts.length - 1, Math.floor(Math.max(0, t - 2.5) / 3)), vt = t - 2.5 - vi * 3;
    if (t > 2.5) {
      const [head, line] = s.verdicts[vi], k2 = ease(vt * 3);
      g.save(); g.translate(W * 0.27, H * 0.73); g.rotate(-0.08); g.scale(0.6 + 0.4 * k2, 0.6 + 0.4 * k2);
      g.fillStyle = '#ffd24a'; g.fillRect(-200, -34, 400, 68); g.strokeStyle = '#14080a'; g.lineWidth = 5; g.strokeRect(-200, -34, 400, 68);
      fit(g, head, 0, 2, 370, 38, '#e8202a', 'center'); g.restore();
      text(g, line, W * 0.27, H * 0.73 + 56, 15, '#fff', 'center', '800', 'rgba(0,0,0,0.6)');
    }
    ticker(g, `THE GEAR ROOM · ${def.name.toUpperCase()} · ${s.rounds} ROUNDS DOWNRANGE TONIGHT · ALL THIS AND MORE AT VEX'S · `);
  }
  // an ad for something Vex is selling this visit: its icon big, what it is and costs, a line, how many are left
  function storeAd(g, p, t, dur) {
    const gr = g.createRadialGradient(W * 0.3, H / 2, 40, W / 2, H / 2, W * 0.75); gr.addColorStop(0, '#ff9a2e'); gr.addColorStop(1, '#1d1c18'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    burst(g, W * 0.27, H * 0.52, 250, 'rgba(255,255,255,0.13)', P.time * 0.4);
    // the product
    g.save(); g.translate(W * 0.27, H * 0.52 + Math.sin(t * 2.6) * 8); g.rotate(Math.sin(t * 1.3) * 0.07); const k = ease(t * 2.2); g.scale(k, k);
    const pc = p.pic;
    const iw = pc && pc.im && pc.im.complete !== false ? pc.im.naturalWidth || pc.im.width : 0, ih = iw ? pc.im.naturalHeight || pc.im.height : 0;
    if (iw) {
      const sc = Math.min(300 / iw, 300 / ih);
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 24; g.drawImage(pc.im, -iw * sc / 2, -ih * sc / 2, iw * sc, ih * sc); g.shadowBlur = 0;
    } else { // (a gun part: no icon: its slot on a tag)
      g.fillStyle = '#15171a'; g.fillRect(-150, -70, 300, 140); g.strokeStyle = '#ffb21a'; g.lineWidth = 6; g.strokeRect(-150, -70, 300, 140);
      fit(g, p.slot || 'PART', 0, 0, 270, 40, '#ffb21a', 'center');
    }
    g.restore();
    // what it is
    const tx = W * 0.72, k2 = ease(t * 2 - 0.3);
    text(g, 'NOW AT VEX\'S', tx, 92, 18, '#ffd24a', 'center', '900', '#14080a');
    text(g, (p.brand || '').toUpperCase(), tx, 130, 15, 'rgba(255,255,255,0.85)', 'center', '800');
    g.save(); g.translate(tx, 178); g.scale(k2, k2); fit(g, p.name.toUpperCase(), 0, 0, 470, 40, '#fff', 'center', '900', '#14080a'); g.restore();
    fit(g, PITCH[p.kind] || 'You need this. Probably.', tx, 232, 470, 19, '#fff', 'center', '800', 'rgba(0,0,0,0.5)');
    // the price, and then how many are left (live)
    g.save(); g.translate(tx - 90, 330); g.rotate(-0.1); g.scale(ease(t * 2 - 0.7), ease(t * 2 - 0.7));
    burst(g, 0, 0, 92, '#ffd24a', P.time * 0.8); text(g, '¢' + G.U.fmt(p.price), 0, 2, 30, '#e8202a', 'center', '900'); g.restore();
    if (t > dur * 0.4) {
      const left = p.left(), k3 = ease((t - dur * 0.4) * 3);
      g.save(); g.translate(tx + 110, 330); g.rotate(left ? 0.06 : -0.18); g.scale(k3, k3);
      if (!left) { g.strokeStyle = '#e8202a'; g.lineWidth = 8; g.strokeRect(-130, -36, 260, 72); text(g, 'SOLD OUT', 0, 2, 40, '#e8202a', 'center'); }
      else { g.fillStyle = '#e8202a'; g.fillRect(-130, -30, 260, 60); text(g, left === 1 ? 'ONLY ONE LEFT!' : left >= 99 ? 'IN STOCK NOW' : `${left} ${p.unit || 'LEFT'}!`.toUpperCase(), 0, 2, 22, '#fff', 'center'); }
      g.restore();
    }
    text(g, 'Available at Vex\'s, the hangar\'s finest (and only) quartermaster. No refunds. No questions. No weapons pointed at the counter.', W / 2, H - 20, 11, 'rgba(255,255,255,0.75)', 'center', '700');
    text(g, 'ADVERTISEMENT', W - 16, 18, 10, 'rgba(255,255,255,0.6)', 'right', '700');
  }
  // a fake advert: its colours, its product drawn big and turning, its line, small print
  function advert(g, a, t, dur) {
    const gr = g.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7); gr.addColorStop(0, a.col[0]); gr.addColorStop(1, a.col[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    burst(g, W * 0.3, H * 0.5, 260, 'rgba(255,255,255,0.12)', P.time * 0.5);
    g.save(); g.translate(W * 0.3, H * 0.52 + Math.sin(t * 3) * 10); g.rotate(Math.sin(t * 1.4) * 0.12); g.scale(ease(t * 2), ease(t * 2));
    product(g, a.art, a.col); g.restore();
    g.save(); g.translate(W * 0.68, H * 0.36); const k = ease(t * 2 - 0.3); g.scale(k, k); text(g, a.brand, 0, 0, 52, '#fff', 'center', '900', '#14080a'); g.restore();
    text(g, a.line, W * 0.68, H * 0.52, 20, '#fff', 'center', '800', 'rgba(0,0,0,0.5)');
    if (t > dur * 0.5) { const k2 = ease((t - dur * 0.5) * 3); g.save(); g.translate(W * 0.68, H * 0.68); g.scale(k2, k2); g.rotate(-0.08); g.fillStyle = '#ffe23a'; g.fillRect(-120, -26, 240, 52); text(g, 'BUY NOW!', 0, 0, 30, '#e8202a', 'center'); g.restore(); }
    text(g, a.sub, W / 2, H - 20, 11, 'rgba(255,255,255,0.75)', 'center', '700');
    text(g, 'ADVERTISEMENT', W - 16, 18, 10, 'rgba(255,255,255,0.6)', 'right', '700');
  }
  function product(g, art, col) {
    g.lineWidth = 5; g.strokeStyle = '#14080a';
    const rr = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); };
    if (art === 'box') { rr(-70, -110, 140, 200, col[1]); rr(-60, -90, 120, 60, '#fff'); text(g, 'CRUNCH', 0, -60, 24, col[1], 'center'); for (let i = 0; i < 6; i++) { g.fillStyle = col[0]; g.beginPath(); g.arc(-30 + (i % 3) * 30, 20 + Math.floor(i / 3) * 30, 11, 0, 7); g.fill(); } }
    else if (art === 'can') { rr(-50, -110, 100, 210, '#101418'); g.fillStyle = col[0]; g.fillRect(-50, -40, 100, 40); text(g, 'BRUH!', 0, -20, 30, '#101418', 'center'); g.fillStyle = '#aab'; g.fillRect(-46, -116, 92, 10); }
    else if (art === 'house') { rr(-90, -20, 180, 110, '#f4e8d8'); g.fillStyle = col[1]; g.beginPath(); g.moveTo(-110, -20); g.lineTo(0, -110); g.lineTo(110, -20); g.closePath(); g.fill(); g.stroke(); rr(-20, 30, 40, 60, '#6a4a2a'); }
    else if (art === 'mower') { rr(-90, -20, 180, 60, col[0]); for (const x of [-60, 60]) { g.fillStyle = '#14080a'; g.beginPath(); g.arc(x, 50, 24, 0, 7); g.fill(); } g.beginPath(); g.moveTo(70, -20); g.lineTo(120, -120); g.stroke(); }
    else if (art === 'tube') { g.save(); g.rotate(-0.4); rr(-110, -30, 200, 60, '#fff'); g.fillStyle = col[0]; g.fillRect(-90, -30, 60, 60); rr(90, -16, 30, 32, '#aaa'); g.restore(); }
    else if (art === 'plate') { g.fillStyle = col[0]; g.beginPath(); g.moveTo(-80, -100); g.lineTo(80, -100); g.lineTo(90, 90); g.lineTo(0, 120); g.lineTo(-90, 90); g.closePath(); g.fill(); g.stroke(); text(g, 'III', 0, 0, 60, col[1], 'center'); }
    else if (art === 'kit') { rr(-90, -70, 180, 140, col[0]); g.fillStyle = '#fff'; g.fillRect(-14, -40, 28, 80); g.fillRect(-40, -14, 80, 28); }
    else if (art === 'gum') { for (let i = 0; i < 5; i++) rr(-100 + i * 40, -60 + (i % 2) * 20, 36, 110, i % 2 ? col[0] : '#fff'); }
    else { g.fillStyle = '#1d1c18'; g.beginPath(); g.arc(0, -20, 80, 0, 7); g.fill(); g.fillStyle = '#101010'; g.fillRect(-60, -40, 120, 30); for (const x of [-25, 25]) { g.fillStyle = '#ff9a2e'; g.beginPath(); g.arc(x, -25, 9, 0, 7); g.fill(); } }
  }

  // ================================================================ sound: the crowd, the stingers, the presenters
  function audio(on) {
    const A = G.Audio, c = A.ctx;
    if (!on) { if (P.au) { try { P.au.bed.stop(); } catch (e) { /* stopped */ } P.au.out.disconnect(); P.au.mix.disconnect(); P.au = null; } return; }
    if (!c || P.au) return;
    const out = c.createGain(); out.gain.value = 0; out.connect(A.master);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; // (for the whoosh and the drum roll)
    // (everything plays into mix: what a recording takes, at full; out is mix at how near a screen you are)
    const mix = c.createGain(); mix.connect(out);
    P.au = { out, mix, bed: null, buf };
    bedOn();
  }
  // under it all, a stadium's murmur on a loop (a recording: js/audio.js crowd_bed), once it's loaded
  function bedOn() {
    const A = G.Audio, buf = A.samples.crowd_bed;
    if (!P.au || P.au.bed || !buf) return;
    const bed = A.ctx.createBufferSource(), g = A.ctx.createGain(); bed.buffer = buf; bed.loop = true; g.gain.value = 0.12;
    bed.connect(g); g.connect(P.au.mix); bed.start(0, Math.random() * buf.duration);
    P.au.bed = bed;
  }
  function audioLevel(v) { if (P.au) { bedOn(); P.au.out.gain.setTargetAtTime(v * 0.9, G.Audio.ctx.currentTime, 0.25); } }
  // Where a sound goes: live, into the TVs' mix now; or, while a video's being made, into its offline context at the
  // export's clock (AT.t; AT.d: how far ahead, for the reactions that come a moment later)
  const AT = { ctx: null, dest: null, t: 0, d: 0 };
  const actx = () => AT.ctx || G.Audio.ctx, anow = () => (AT.ctx ? AT.t : G.Audio.ctx.currentTime) + AT.d, adest = () => AT.dest || P.au.mix;
  function later(d, f) { if (AT.ctx || AT.rec) { AT.d += d; try { f(); } finally { AT.d -= d; } } else setTimeout(f, d * 1000); }
  // a recorded crowd sound (js/audio.js samples), into the TVs' sound; rate glides to rateEnd over the clip if given.
  // False when it isn't loaded (the synthesised one stands in)
  // (kept quiet and short for now: everything at QUIET, a recording faded out over its second half-second, no more than
  // `len` seconds of it; a synthesised sound no longer than SHORT)
  const QUIET = 0.35, SHORT = 0.8;
  function rec(name, gain = 1, rate = 1, rateEnd = null, delay = 0, len = 1.2) {
    const A = G.Audio, buf = A.samples[name];
    if (!buf || !P.au) return false;
    const c = actx(), t = anow() + delay, s = c.createBufferSource(), g = c.createGain(), end = Math.min(len, buf.duration);
    s.buffer = buf; s.playbackRate.setValueAtTime(rate * (0.97 + Math.random() * 0.06), t);
    if (rateEnd) s.playbackRate.linearRampToValueAtTime(rateEnd, t + end);
    g.gain.setValueAtTime(gain * QUIET, t); g.gain.setValueAtTime(gain * QUIET, t + Math.max(0.05, end - 0.5)); g.gain.linearRampToValueAtTime(0, t + end);
    s.connect(g); g.connect(adest()); s.start(t); s.stop(t + end + 0.05);
    return true;
  }
  function noiseBurst(t, dur, f, q, gain, type = 'bandpass', fEnd) {
    dur = Math.min(dur, SHORT); gain *= QUIET;
    const c = actx(), s = c.createBufferSource(); s.buffer = P.au.buf;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur); fl.Q.value = q;
    const gn = c.createGain(); gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.25, dur * 0.3)); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(gn); gn.connect(adest()); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function tone(t, dur, f, type, gain, fEnd, filt) {
    dur = Math.min(dur, SHORT); gain *= QUIET;
    const c = actx(), o = c.createOscillator(), gn = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(gain, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o; if (filt) { const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = filt; fl.Q.value = 1.5; o.connect(fl); n = fl; }
    n.connect(gn); gn.connect(adest()); o.start(t); o.stop(t + dur + 0.05);
  }
  const SFX = {
    // the crowd: recordings when they're loaded (a big moment gets the stadium going up on top)
    cheer(k = 1) {
      if (rec('crowd_cheer', 0.7 * k, 1, null, 0, 0.9 + 0.3 * k)) return;
      SFX.cheerSynth(k);
    },
    aww() { if (!rec('crowd_ooh', 0.85, 0.9, 0.68)) SFX.awwSynth(); }, // ("ohhh", sliding down: the sad one)
    awww() { if (rec('crowd_awww', 0.8, 1, null, 0, 2)) rec('crowd_awww', 0.55, 1.07, null, 0.07, 2); }, // (two of it, a touch apart: a crowd)
    wow() { rec('crowd_wow', 0.9, 1.0, 1.07, 0, 1.9); }, // ("OOOH!", rising: the impressed one, for the big moments)
    laugh(long = false) { if (!rec(long ? 'crowd_laugh_long' : 'crowd_laugh', 0.8, 1, null, 0, long ? 1.8 : 1.2)) SFX.laughSynth(); },
    cheerSynth(k = 1) { const t = anow(); noiseBurst(t, 3.2, 1400, 0.5, 0.35 * k); noiseBurst(t + 0.1, 2.6, 2600, 0.8, 0.12 * k); for (let i = 0; i < 6; i++) tone(t + Math.random() * 0.4, 0.9, 500 + Math.random() * 300, 'triangle', 0.025 * k, 900 + Math.random() * 400); },
    awwSynth() { const t = anow(); for (let i = 0; i < 9; i++) { const f = 170 + Math.random() * 120; tone(t + Math.random() * 0.15, 1.5, f, 'sawtooth', 0.03, f * 0.72, 800); } },
    laughSynth() { const t = anow(); for (let v = 0; v < 5; v++) { const f = 200 + Math.random() * 140, o = Math.random() * 0.3; for (let i = 0; i < 7; i++) { tone(t + o + i * 0.17, 0.11, f * (1 - i * 0.02), 'sawtooth', 0.03, null, 1000); noiseBurst(t + o + i * 0.17, 0.09, 1300, 2, 0.04); } } },
    horn() { const t = anow(); for (const f of [440, 554, 659]) tone(t, 0.75, f, 'sawtooth', 0.05, f * 0.97, 1600); },
    ding() { const t = anow(); tone(t, 0.5, 1568, 'sine', 0.12); tone(t + 0.14, 0.7, 2093, 'sine', 0.12); },
    boing() { const t = anow(); tone(t, 0.6, 180, 'sine', 0.15, 620); },
    whoosh() { noiseBurst(anow(), 0.45, 400, 1.2, 0.18, 'bandpass', 3500); },
    roll() { const t = anow(); for (let i = 0; i < 12; i++) noiseBurst(t + i * 0.04, 0.05, 2200, 1, 0.03 + i * 0.006); noiseBurst(t + 0.5, 0.4, 6000, 0.5, 0.12, 'highpass'); },
    trombone() { const t = anow(); [392, 370, 349, 330].forEach((f, i) => tone(t + i * 0.42, i === 3 ? 1.2 : 0.4, f, 'sawtooth', 0.06, i === 3 ? f * 0.94 : null, 900)); },
    jingle() { const t = anow(); [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(t + i * 0.13, 0.22, f, 'square', 0.035)); },
    beep() { tone(anow(), 0.7, 988, 'sine', 0.06); }, // (the flatline's)
    chatter(up = true) { const t = anow(); let f0 = up ? 300 : 210; for (let i = 0; i < 8; i++) { const d = 0.08 + Math.random() * 0.06; f0 *= up ? 1.03 : 0.98; tone(t + i * 0.13, d, f0 * (0.9 + Math.random() * 0.25), 'sawtooth', 0.04, null, [700, 1100, 1500, 900][i % 4]); } },
  };
  // (an export hears it all, wherever you are)
  function sfx(name, ...a) { if (AT.rec) { AT.rec.push([AT.t + AT.d, 's', name, a]); return; } if (!P.au || (P.vol < 0.05 && !AT.ctx)) return; try { SFX[name](...a); } catch (e) { /* the context was suspended */ } }
  function sfxFor(s, at) {
    if (s.kind === 'ad' && at === 'start') sfx('jingle');
    if (s.kind === 'sponsor' && at === 'start') { sfx('whoosh'); if (s.tone === 'sad') sfx('trombone'); else if (s.tone === 'love') sfx('jingle'); else sfx('ding'); }
    if (s.kind === 'open' && at === 'start') { sfx('horn'); sfx('cheer', 1.2); }
    if (s.kind === 'table' && at === 'start') { sfx('roll'); later(1.1, () => sfx('cheer', 1.3)); }
    if (s.kind === 'gear' && at === 'start') { sfx('whoosh'); later(0.7, () => sfx('chatter', true)); later(2.6, () => sfx('horn')); }
    if (s.kind === 'xray' && at === 'start') { sfx('whoosh'); later(0.6, () => sfx('ding')); later(0.9, () => sfx('chatter', true)); }
    if (s.kind === 'card' && at === 'start') sfx('whoosh');
    if (s.kind !== 'clip') return;
    const c = s.clip;
    if (at === 'start') { sfx('whoosh'); if (c.fl.br && s.cam === 'wide') sfx('roll'); }
    if (at === 'moment' && c.kind === 'seq') {
      const n = s.kn || 1, q = c.kills[n - 1];
      sfx('cheer', Math.min(1.6, 0.8 + n * 0.25)); if (n >= 2) { sfx('horn'); sfx('chatter', true); } if (q && q.fl.hs) sfx('ding'); if (n >= 3) sfx('wow');
      return;
    }
    if (at === 'moment' && c.kind === 'arrest' && c.hands) { sfx('wow'); sfx('chatter', true); return; }
    if (at === 'moment' && c.kind === 'arrest') { sfx('awww'); sfx('chatter', true); return; }
    if (at === 'moment' && c.fl.bo && !c.fl.why) { sfx('beep'); sfx('cheer', 0.7); return; }
    if (at === 'moment') {
      if (c.kind === 'down') { sfx('aww'); sfx('chatter', false); return; }
      if (c.kind === 'saved') { sfx('ding'); sfx('wow'); sfx('cheer', 0.9); sfx('chatter', true); return; }
      if (c.fl.why) { sfx('aww'); sfx('trombone'); sfx('chatter', false); return; }
      sfx('cheer', s.slow || c.fl.spray || c.fl.br ? 1.3 : 1); sfx('chatter', true);
      if (c.fl.hs) sfx('ding'); if (c.fl.hs || c.fl.long || c.fl.ap) sfx('wow'); if (c.fl.br) sfx('horn'); if (c.fl.spray) sfx('roll');
      if (c.fl.sur || c.fl.ws) later(0.5, () => sfx('laugh', !!c.fl.ws)); if (c.fl.ws) sfx('boing');
    }
  }

  return { tick, shot, door, hitBy, kill, suspectDown, saved, incap, arrest, take, drop, mount, unmount, update, reset, exportVideo, exportHere, muxHere, credit, R, P };
})();
