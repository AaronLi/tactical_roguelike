'use strict';
// The host's simulation (G.Server, js/server.ts) on a thread: what feeds it, ticks it and carries its word out. The same code
// in both places it can run (docs/threads.md): the server's own thread (js/serverworker.ts loads it there) or, as a fallback,
// the page's (js/serverlink.ts starts it there when a worker can't be had, or with ?serverthread=0). Either way it's reached
// only through two MessagePorts, so it can't tell which:
//   ctl, the page's control port (for as long as this thread runs): {k:'init', id, solo, cli, rec} a session starts (cli: the host's
//     own player's port; rec: record the levels, js/recorder.ts), {k:'stop'} it's over, {k:'in', from, m} a message from a remote player (relayed off the page's PeerJS
//     connection), {k:'join' | 'leave', id} a remote player's connection opened or dropped, {k:'stickers', names} the stickers
//     there are (js/stickers.ts load, on the page), {k:'digest'} / {k:'stat'} questions (for tests and desync hunting).
//     Back on it: {k:'ready'} once, {k:'on'} a session's started, {k:'bc', m, x} for every remote player but x, {k:'to', id, m}
//     for one of them, {k:'rec', name, data} a level's recording, the answers, and {k:'prof'} each second (how long the ticks took).
//   cli, the host's own player's port (a new one each session): the same messages any player's game sends and gets over the
//     network, both ways.
// It ticks on its own timer, TICK_MS apart (as fast as the frames used to come), dt the time since the last (at most 0.1 s),
// whether or not the page is drawing.
const G_ServerHost = {
  TICK_MS: 1000 / 60,
  ctl: null as MessagePort | null,
  cli: null as MessagePort | null,
  id: null as string | null, // (the host's own player: SvNet.myId)
  on: false,
  remotes: new Set<string>(), // (remote players whose connections are open)
  timer: 0 as unknown as ReturnType<typeof setInterval>,
  last: 0,
  ticks: 0,
  prof: { n: 0, ms: 0, max: 0, at: 0 },
  warned: new Set<string>(),

  attach(ctl: MessagePort) {
    this.ctl = ctl;
    ctl.onmessage = (e: MessageEvent) => this.control(e.data);
    SvNet.broadcast = (m, x) => this.broadcast(m, x);
    SvNet.sendTo = (id, m) => this.sendTo(id, m);
    G.Recorder.out = (name, data) => this.ctl!.postMessage({ k: 'rec', name, data }); // (a level's recording: js/recorder.ts)
    ctl.postMessage({ k: 'ready' });
  },
  control(c: any) {
    if (!c || typeof c !== 'object') return;
    switch (c.k) {
      case 'init': G.Recorder.on = !!c.rec; this.start(c.id, c.cli); break;
      case 'stop': this.stop(); break;
      case 'in': if (this.on && c.m && typeof c.m === 'object') { G.Recorder.msg(G.Server, c.m, String(c.from)); G.Server.handle(c.m, String(c.from)); } break;
      case 'join': this.remotes.add(String(c.id)); break;
      case 'leave': if (this.remotes.delete(String(c.id)) && this.on) G.Server.onLeave(String(c.id)); break;
      case 'stickers': if (Array.isArray(c.names)) G.Stickers.names = c.names.filter((n: unknown) => typeof n === 'string'); break;
      case 'digest': { const parts: Record<string, string> = {}; this.ctl!.postMessage({ k: 'digest', q: c.q, d: G.Server.map ? this.digest(G.Server.map, parts) : null, parts, seed: G.Server.seed, level: G.Server.level, th: G.Server.theme, night: G.Server.night }); break; }
      case 'stat': this.ctl!.postMessage({ k: 'stat', q: c.q, clock: G.Server.clock || 0, ticks: this.ticks, phase: G.Server.phase, level: G.Server.level, enemies: G.Server.enemies.size, players: G.Server.players.size }); break;
    }
  },
  // a session: the host's player (id) and their port; the simulation as it is when someone starts hosting (G.Server.reset)
  start(id: string, cli: MessagePort) {
    this.stop();
    this.id = SvNet.myId = id;
    this.cli = cli;
    cli.onmessage = (e: MessageEvent) => { if (this.on && e.data && typeof e.data === 'object') { G.Recorder.msg(G.Server, e.data, this.id!); G.Server.handle(e.data, this.id!); } };
    G.Server.reset();
    this.on = true;
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), this.TICK_MS);
    this.ctl!.postMessage({ k: 'on', id });
  },
  stop() {
    G.Recorder.end('stop');
    clearInterval(this.timer);
    if (this.cli) { this.cli.onmessage = null; this.cli.close(); }
    this.cli = null; this.on = false; this.remotes.clear();
    G.Server.reset();
  },
  tick() {
    if (!this.on) return;
    const now = performance.now(), dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    G.Server.update(dt);
    G.Recorder.tick(G.Server, dt);
    const P = this.prof, took = performance.now() - now;
    this.ticks++; P.n++; P.ms += took; if (took > P.max) P.max = took;
    if (now - P.at > 1000) { if (P.at) this.ctl!.postMessage({ k: 'prof', n: P.n, ms: P.ms, max: P.max }); P.n = 0; P.ms = 0; P.max = 0; P.at = now; }
  },

  // ---------------------------------------------------------------- the simulation's word, out (SvNet)
  broadcast(m: any, exceptId?: string | null) {
    if (exceptId !== this.id && this.cli) this.post(this.cli, m);
    for (const id of this.remotes) if (id !== exceptId) { this.post(this.ctl!, { k: 'bc', m, x: exceptId == null ? null : exceptId }); break; }
  },
  sendTo(id: string, m: any) {
    if (id === this.id) { if (this.cli) this.post(this.cli, m); }
    else if (this.remotes.has(id)) this.post(this.ctl!, { k: 'to', id, m });
  },
  // A message is copied across (structured clone). One that can't be (a function in it, say) goes as the network has it, through
  // JSON: what a remote player would get. (Said once a kind, so it can be put right.)
  post(port: MessagePort, m: any) {
    try { port.postMessage(m); } catch (e) {
      const t = String((m && (m.t || (m.m && m.m.t))) || '?');
      if (!this.warned.has(t)) { this.warned.add(t); console.warn(`server thread: '${t}' couldn't be copied as it is; sent as JSON`, e); }
      port.postMessage(JSON.parse(JSON.stringify(m)));
    }
  },

  // ---------------------------------------------------------------- is it the same place?
  // A hash of what a level is made of (its tiles, doors, windows, rooms, spots and solids): the host's simulation builds the level
  // from its seed and every screen builds it again, so these must agree (G.ServerLink.digest compares them). The solids are those
  // it was built with (born: how many; a screen adds its own after, the helicopter on the pad: js/landing.ts).
  // (parts: each piece's own hash too, to find which differs)
  built: new WeakMap<object, number>(),
  born(map: LvMap) { if (map && map.world) this.built.set(map, map.world.solids.length); },
  digest(map: LvMap, parts?: Record<string, string>) {
    let h = 2166136261, p = 2166136261;
    const num = (v: number) => { const x = Math.round((+v || 0) * 1000); for (const s of [x & 0xffff, x >>> 16]) { h ^= s; h = Math.imul(h, 16777619); p ^= s; p = Math.imul(p, 16777619); } };
    const part = (k: string, f: () => void) => { p = 2166136261; f(); if (parts) parts[k] = (p >>> 0).toString(36); };
    const arr = (a: ArrayLike<number> | null | undefined) => { if (!a) { num(-1); return; } num(a.length); for (let i = 0; i < a.length; i++) num(a[i]); };
    const pts = (a: any[] | null | undefined, keys: string[]) => { if (!a) { num(-1); return; } num(a.length); for (const q of a) for (const k of keys) num(Array.isArray(q) ? q[+k] : q && q[k]); };
    const one = (m: LvMap, f: number) => {
      part(f + ':tiles', () => { num(m.W); num(m.H); arr(m.t); arr(m.out); });
      part(f + ':doors', () => pts(m.doors, ['x', 'z', 'w', 'fy', 'open']));
      part(f + ':windows', () => pts(m.windows, ['x', 'z', 'fy']));
      part(f + ':rooms', () => pts(m.rooms, ['x', 'z', 'w', 'h', 'fl']));
      part(f + ':spots', () => { pts(m.enemySpots, ['0', '1', '2']); pts(m.cover, ['x', 'z']); });
      part(f + ':lights', () => pts(m.lights, ['x', 'z']));
    };
    one(map, 0);
    (map.floors || []).forEach((f, i) => { if (f !== map) one(f, i); });
    part('places', () => { num(map.NF || 1); num(map.spawn ? map.spawn.x : 0); num(map.spawn ? map.spawn.z : 0); num(map.extract ? map.extract.x : 0); num(map.extract ? map.extract.z : 0); });
    const S0 = map.world ? map.world.solids : [], S = S0.slice(0, this.built.has(map) ? this.built.get(map) : S0.length);
    part('solids', () => { num(S.length); for (const s of S) if (s) { arr(s.min); arr(s.max); } });
    return (h >>> 0).toString(36);
  },
};
G.ServerHost = G_ServerHost;
interface GameModules { ServerHost: typeof G_ServerHost; }
