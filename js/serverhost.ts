'use strict';
// This is the server thread's entry file (js/serverworker.ts imports it and nothing else). The simulation's files, as the worker's list
// used to load them (SERVER_SCRIPTS: the page's order, index.html): each runs once, before this file does. Most are imported by the
// files that need them anyway; they are named here so the thread loads all of them, and for the one nothing imports (residents
// registers itself and has no export). A file runs when it is first imported, so where one imports another that comes later in this
// list (level imports homes), that one runs first: what must hold is that a file that reads another while it loads comes after it,
// and tools/deps.mjs checks that (npm run deps:check). The order that results is in docs/modules-plan.md, phase 4 part c.
import './util.js';
import './medical.js';
import './materials.js';
import './data.js';
import './spacedata.js';
import './shipgen.js';
import './callsigns.js';
import './arsenal.js';
import './parts.js';
import './gear.js';
import './sim.js';
import './world.js';
import './ballistics.js';
import './leveldesc.js';
import './level.js';
import './furnspec.js';
import './furniture.js';
import './homes.js';
import './residents.js';
import './scars.js';
import './damage.js';
import './stickers.js';
import './route.js';
import './shop.js';
import './recorder.js';
import './server.js';
import './spaceserver.js';
import { LevelDesc } from './leveldesc.js';
import { Recorder } from './recorder.js';
import { Server } from './server.js';
import { Stickers } from './stickers.js';
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
export const ServerHost = {
  TICK_MS: 1000 / 60,
  ctl: null as MessagePort | null,
  cli: null as MessagePort | null,
  id: null as string | null, // (the host's own player: G.Server.net.myId)
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
    Server.net.broadcast = (m, x) => this.broadcast(m, x);
    Server.net.sendTo = (id, m) => this.sendTo(id, m);
    Recorder.out = (name, data) => this.ctl!.postMessage({ k: 'rec', name, data }); // (a level's recording: js/recorder.ts)
    ctl.postMessage({ k: 'ready' });
  },
  control(c: any) {
    if (!c || typeof c !== 'object') return;
    switch (c.k) {
      case 'init': Recorder.on = !!c.rec; this.start(c.id, c.cli); break;
      case 'stop': this.stop(); break;
      case 'in': if (this.on && c.m && typeof c.m === 'object') { Recorder.msg(Server, c.m, String(c.from)); Server.handle(c.m, String(c.from)); } break;
      case 'join': this.remotes.add(String(c.id)); break;
      case 'leave': if (this.remotes.delete(String(c.id)) && this.on) Server.onLeave(String(c.id)); break;
      case 'stickers': if (Array.isArray(c.names)) Stickers.names = c.names.filter((n: unknown) => typeof n === 'string'); break;
      case 'digest': { const parts: Record<string, string> = {}, m = Server.map; this.ctl!.postMessage({ k: 'digest', q: c.q, d: m ? this.digest(m, parts) : null, parts, json: c.json && m && m.desc ? JSON.stringify(m.desc) : null, seed: Server.seed, level: Server.level, th: Server.theme, night: Server.night }); break; }
      case 'stat': this.ctl!.postMessage({ k: 'stat', q: c.q, clock: Server.clock || 0, ticks: this.ticks, phase: Server.phase, level: Server.level, enemies: Server.enemies.size, players: Server.players.size }); break;
    }
  },
  // a session: the host's player (id) and their port; the simulation as it is when someone starts hosting (G.Server.reset)
  start(id: string, cli: MessagePort) {
    this.stop();
    this.id = Server.net.myId = id;
    this.cli = cli;
    cli.onmessage = (e: MessageEvent) => { if (this.on && e.data && typeof e.data === 'object') { Recorder.msg(Server, e.data, this.id!); Server.handle(e.data, this.id!); } };
    Server.reset();
    this.on = true;
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), this.TICK_MS);
    this.ctl!.postMessage({ k: 'on', id });
  },
  stop() {
    Recorder.end('stop');
    clearInterval(this.timer);
    if (this.cli) { this.cli.onmessage = null; this.cli.close(); }
    this.cli = null; this.on = false; this.remotes.clear();
    Server.reset();
  },
  tick() {
    if (!this.on) return;
    const now = performance.now(), dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    Server.update(dt);
    Recorder.tick(Server, dt);
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
  // The level the simulation built from its seed (its description: js/leveldesc.ts) and every screen built again from it must
  // be the same object (G.ServerLink.digest compares them): each part's fingerprint, and the whole of it as JSON (json: true).
  // (What a screen adds after, the helicopter on the pad, js/landing.ts, goes in its world, not in the description.)
  born(_map: LvMap) {},
  digest(map: LvMap, parts?: Record<string, string>) {
    if (!map || !map.desc) return null;
    const fp = LevelDesc.fingerprint(map.desc);
    if (parts) Object.assign(parts, fp.parts);
    return fp.hash;
  },
};
G.ServerHost = ServerHost;
declare global { interface GameModules { ServerHost: typeof ServerHost; } }
