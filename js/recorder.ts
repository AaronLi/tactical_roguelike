'use strict';
// Recording what the officers do, one file a level, so the suspects' AI can later be taught how people play (docs/recording.md).
// It runs with the simulation, on the host only (js/serverhost.ts drives it): the host sees every officer's state ('st', 20 a
// second) and every action they send, its own player's and the remote players' alike, so a host recording has the whole squad.
// Off unless the page asks (?rec in the URL, or localStorage.rec = '1': js/serverlink.ts puts rec in the 'init' message).
// A level's recording: its head (what level it was: G.Level.generate builds the same place from seed, level, theme and night),
// frames RATE a second (each officer's last state, each suspect's and civilian's), and events (the officers' messages, as sent).
// When the level's over it goes back to the page ({k:'rec', name, data}), which saves it.
interface RecFrame { t: number; o: any[]; s: any[] }
interface RecEvent { t: number; by: string; m: any }
interface RecFile {
  v: number; seed: number; level: number; theme: number | null; night: boolean; at: string; rate: number;
  officers: { id: string; name: string; gun: string | null }[];
  map: { W: number; H: number; TS: number; floors: number };
  frames: RecFrame[]; events: RecEvent[]; end?: string; dur?: number;
}
const G_Recorder = {
  RATE: 10,
  on: false,
  // the officers' state, as kept: js/player.ts state()'s keys (what they look like and what they're doing; not their kit, wounds or score)
  KEYS: ['p', 'yw', 'pt', 'cr', 'pr', 'ln', 'w', 'ad', 'sd', 'lr', 'rl', 'ld', 'nm', 'ra', 'in', 'mc', 'hp', 'mhp', 'ar', 'dn', 'dd', 'uc', 'bl',
    'hk', 'hc', 'hs', 'act', 'ap', 'zt', 'bt', 'pl', 'mv', 'sw', 'mn', 'se', 'cl', 'zp', 'bp', 'tl', 'ir'],
  // messages not kept as events: the state (in the frames already), and what's only for drawing
  SKIP: new Set(['st', 'rfx', 'rpath', 'npath', 'skin', 'skinReq', 'bores', 'eInfo', 'hello']),
  cur: null as RecFile | null,
  acc: 0,
  out: null as ((name: string, data: RecFile) => void) | null,

  tick(S: typeof G.Server, dt: number) {
    if (!this.on) { if (this.cur) this.end('stop'); return; }
    const playing = S.phase === 'level' && !!S.map;
    if (this.cur && (!playing || S.seed !== this.cur.seed)) this.end(S.phase === 'level' ? 'next' : S.phase);
    if (!playing) return;
    if (!this.cur) this.begin(S);
    if (typeof S.clock !== 'number') return; // (the level's not had its first tick)
    this.acc += dt;
    if (this.acc < 1 / this.RATE) return;
    this.acc = Math.min(this.acc - 1 / this.RATE, 1 / this.RATE); // (a long stall doesn't make a burst of frames)
    this.frame(S);
  },
  begin(S: typeof G.Server) {
    const m = S.map!;
    this.acc = 1 / this.RATE; // (the first frame at once)
    this.cur = {
      v: 1, seed: S.seed, level: S.level, theme: S.theme == null ? null : S.theme, night: !!S.night, at: new Date().toISOString(), rate: this.RATE,
      officers: [], map: { W: m.W, H: m.H, TS: G.Level.TS, floors: m.NF || 1 }, frames: [], events: [],
    };
    for (const p of S.players.values()) this.officer(p);
  },
  // an officer in the head (once: their gun as they start, once their game's said)
  officer(p: Player) {
    const c = this.cur!;
    let o = c.officers.find((q) => q.id === p.id);
    if (!o) c.officers.push((o = { id: p.id, name: p.name, gun: null }));
    if (o.gun == null && p.st && p.st.w) o.gun = String(p.st.w);
  },
  frame(S: typeof G.Server) {
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const o: any[] = [];
    for (const p of S.players.values()) {
      if (!p.st) continue;
      this.officer(p);
      const st = p.st, f: Record<string, any> = { id: p.id };
      for (const k of this.KEYS) if (st[k] !== undefined) f[k] = st[k];
      o.push(f);
    }
    const s: any[] = [];
    for (const e of S.enemies.values()) {
      const f: Record<string, any> = { id: e.id, type: e.type, p: [r2(e.x), r2(e.y), r2(e.z)], yaw: r2(e.yaw), hp: Math.round(e.hp * 10) / 10, state: e.state, alert: e.alert ? 1 : 0 };
      if (e.def.civ) f.civ = 1;
      if (e.crouch) f.crouch = 1;
      if (e.down) f.down = 1;
      if (e.leanOut) f.leanOut = r2(e.leanOut);
      if (e.canSee) f.canSee = 1;
      if (e.tgt) f.tgt = e.tgt;
      s.push(f);
    }
    this.cur!.frames.push({ t: r2(S.clock), o, s });
  },
  // an officer's message, as it comes in (before the simulation handles it)
  msg(S: typeof G.Server, m: any, from: string) {
    if (!this.on || !this.cur || !m || typeof m !== 'object' || this.SKIP.has(m.t)) return;
    this.cur.events.push({ t: typeof S.clock === 'number' ? Math.round(S.clock * 100) / 100 : 0, by: from, m });
  },
  // the level's over (why: 'shop' they got out, 'gameover', 'lobby', 'next' another level began, 'stop' the session ended)
  end(why: string) {
    const c = this.cur;
    this.cur = null;
    if (!c) return;
    c.end = why;
    c.dur = c.frames.length ? c.frames[c.frames.length - 1].t - c.frames[0].t : 0;
    if (!c.frames.length) return; // (nothing happened)
    const name = `${c.at.replace(/[:.]/g, '-')}_L${c.level}_${c.seed}`;
    if (this.out) this.out(name, c);
  },
};
G.Recorder = G_Recorder;
interface GameModules { Recorder: typeof G_Recorder; }
