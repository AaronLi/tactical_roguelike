'use strict';
import { Arsenal } from './arsenal.js';
import { Callsigns } from './callsigns.js';
import { Damage } from './damage.js';
import { AMMO, ammoOk, ballFor, calOf, capOf, cartOf, chambered, dragOf, ENEMIES, ENEMY_GEAR, gearTier, GRAVITY, loadFor, obtainable, rollAmmo, roundOf, roundSpeed, SHIELDS, THEMES, WEAPON_LIST, WEAPONS } from './data.js';
import { Gear } from './gear.js';
import { Level } from './level.js';
import { Med } from './medical.js';
import { Gunsmith } from './parts.js';
import { Route } from './route.js';
import { ShipGen } from './shipgen.js';
import { Shop } from './shop.js';
import { Sim } from './sim.js';
import { SpaceData } from './spacedata.js';
import { Stickers } from './stickers.js';
import { U as G_U } from './util.js';
import { World } from './world.js';
import { ServerHost } from './serverhost.js';
import { SpaceSv } from './spaceserver.js';
// Host-authoritative simulation: lobby/phase flow, suspect + civilian AI, doors, compliance and arrests,
// damage resolution, objectives and the vote to leave.
// Only runs on the hosting peer, in a thread of its own (js/serverworker.ts; or on the page's, js/serverhost.ts: docs/threads.md).
// It talks to everyone, the host's own screen too, exclusively through SvNet (below), and reads nothing of what's on a screen.
const STATE_CODE: Partial<Record<EnemyState, number>> = { normal: 0, flee: 0, surrender: 1, cuffed: 2, cower: 3 };
interface Loose { [k: string]: any }
// The kinds of message the host's handle() switches on (what an officer's game sends it with Net.toHost: the `t` field)
type NetMsgKind = 'stk' | 'hello' | 'st' | 'rfx' | 'bstk' | 'hole' | 'dhit' | 'rpath' | 'npath' | 'skin' | 'skinReq' | 'hit' | 'saved' | 'shot' | 'nade' | 'flash' | 'glass' | 'crack' | 'boom' | 'revive' | 'course' | 'crun' | 'treat' | 'applying' | 'vote' | 'ready' | 'arm' | 'pick' | 'chat' | 'ff' | 'ping' | 'drop' | 'take' | 'useDoor' | 'kickDoor' | 'shout' | 'openCase' | 'openAbox' | 'takeAbox' | 'openSbox' | 'teamEdit' | 'openCab' | 'cabEdit' | 'turn' | 'drag' | 'cuff' | 'stake' | 'sgive' | 'secure' | 'startRun' | 'toLobby' | 'toShop' | 'noFoes' | 'eboom' | 'bores' | 'eInfo' | 'acct';
// A message off the wire: its kind, and whatever else that kind carries (dynamic: checked where it's read)
interface NetMsg { t: NetMsgKind; [k: string]: any }
type DamageMap = Parameters<typeof Damage.apply>[0]; // (what js/damage.ts takes for a map)
type FlPt = LvPt & { fl?: number }; // (a cover or wall spot, and the floor it's on)
type CabLayout = any[][] & { left?: [string, number][] }; // (a cabinet's items, and what didn't fit)
type MapCivSpots = LvMap & { civSpots?: { x: number; z: number; yaw: number }[] | null };
type SvWin = LvWin & { cracked?: number; fy?: number }; // (a window, and how many rounds have fractured it, and the floor's height)
type SvRoom = LvRoom & { out?: boolean };
type ArmourKind = 'vest' | 'helmet' | 'face' | 'shoulder' | 'groin' | 'legs'; // (ENEMY_GEAR.odds' keys)
type ServerPhase = 'lobby' | 'route' | 'level' | 'shop' | 'gameover';
interface Evidence { i: number; wpn: string; x: number; y: number; z: number; owner: number; secured: boolean; taken: boolean }
interface Loot { id: number; x: number; y: number; z: number; item: any; yaw: number; fit?: number }
interface Cab { open: boolean; ver: number; items: any[][] }
interface EnemyBody { id: number; type: EnemyKind; def: EnemyDef; x: number; y: number; z: number; yaw: number; civ: boolean; secured: boolean; rec: Enemy; pre?: boolean } // (the dead, until secured)
interface ServerReport { incap: number; bleedouts: number; bleedBy: Record<string, number>; arrests: number; rescued: number; civKilled: number; unauth: number; evidence: number; bodies: number; allRescued?: boolean; stronghold?: boolean }
interface ServerRoute { seed: number; act: number; path: number[]; votes: Record<string, number> }
interface TeamLocker { ver: number; items: any[][] }
interface WeaponCase { code: string; mag: number; reserve: number; am: any; rl?: string; alt?: { rl: string; n: number; am: string } }
interface AttachBox { open: boolean; uses: Record<string, { items: string[]; taken: string | null }> }
interface StickerBox { s: string; by: string | null }
interface SoundCache { map: LvMap; cache: Map<string, Float32Array> }

// The simulation's way out (js/serverhost.ts wires it): to everyone (but exceptId), or to one of them. myId: the host's own
// player, whose screen is in the same browser (its messages come and go on a port of their own; everyone else's by way of
// the page's PeerJS connections).
const SvNet = {
  myId: null as string | null,
  broadcast: ((_msg: any, _exceptId?: string | null) => {}) as (msg: any, exceptId?: string | null) => void,
  sendTo: ((_id: string, _msg: any) => {}) as (id: string, msg: any) => void,
};

// (a level context: the server's per-level fields and the space mission's (js/spaceserver.ts ctxSave))
export interface LvCtx { sv: Record<string, unknown>; sp: unknown }
export const Server = {
  net: SvNet,
  players: new Map<string, Player>(),
  phase: 'lobby' as ServerPhase,
  level: 0,
  seed: 0,
  night: false, // (the level being played is a night level: isNight, as it starts)
  shopSeed: 0,
  map: null as LvMap | null,
  enemies: new Map<number | string, Enemy>(), // (by id: a number; js/hud.ts looks them up by an id that may be a string)
  cleared: new Map<number, number>(), // (rooms a stack has breached and cleared, by index in map.rooms, and when: a blind ship searches on from them, js/spaceserver.ts)
  nextEid: 1,
  extract: { active: false, votes: new Set<string>() }, // active: order restored (the required objective); votes: who's voted to leave
  flow: null as ReturnType<typeof Level.flow> | null,
  flowT: 0,
  snapT: 0,
  wipeT: 0,
  summons: 0,
  accMult: 1,
  forceLeader: false, // (a debug start: ?leader, js/debugstart.ts)
  dbgSeed: null as number | null,
  dbgNext: null as { th?: number; lvl?: number; seed?: number; leader?: boolean; stronghold?: boolean; night?: boolean; classic?: boolean; fleet?: unknown } | null, // (and the rest of what it asks of the next level)
  bores: new Map<number, number[]>(), // each suspect's gun as the host's screen last drew it: [muzzle x, y, z, bore x, y, z] (handle 'bores', onTarget)
  dmgMult: 1,
  skins: new Map<string, any>(), // the squad's guns' sticker lists by hash (js/stickers.ts share): kept for whoever joins
  // made as the run and the level go on (undefined until then)
  clock: undefined as unknown as number, // the level's time, in seconds (set by the level's first tick)
  route: undefined as ServerRoute | null | undefined,
  routeMap: undefined as ReturnType<typeof Route.gen> | null | undefined,
  theme: undefined as number | null | undefined,
  leaving: undefined as object | null | undefined, // (set while the screens go black for the next place: overBlack)
  arms: undefined as Record<string, string> | undefined,
  stock: undefined as unknown as ShopStock,
  liftT: undefined as number | null | undefined, // the helicopter's spin-up countdown
  report: undefined as unknown as ServerReport,
  evidence: undefined as unknown as Evidence[],
  loot: undefined as unknown as Map<number, Loot>,
  lootId: undefined as number | undefined,
  bodies: undefined as unknown as Map<number | string, EnemyBody>,
  glassBroken: undefined as unknown as Set<number>,
  glassCracked: undefined as unknown as [number, number[]][],
  holes: undefined as any[] | undefined,
  fallen: undefined as any[] | undefined,
  wcase: undefined as WeaponCase | null | undefined,
  caseOpen: undefined as boolean | undefined,
  cabs: undefined as Cab[] | undefined,
  abox: undefined as AttachBox | null | undefined,
  sbox: undefined as StickerBox | null | undefined,
  unitsSeen: undefined as unknown as Set<number>, // apartments an officer has been inside
  kickAt: undefined as Record<string, number> | undefined, // when each officer last kicked a door in
  nadeT: undefined as unknown as number, // the next time a suspect may throw one (the level's)
  noiseT: undefined as number | undefined,
  teamT: undefined as number | undefined, // (till the fireteams are next looked over: teamForm)
  eSid: undefined as number | undefined, // the suspects' shots' ids
  _sound: undefined as SoundCache | undefined,

  // A LEVEL CONTEXT (docs/zone-levels.md): everything the server holds that's one ship's interior and what's going on in it, kept
  // as a record so several can be held and each swapped in to be stepped (ctxSave, ctxLoad). The run's (players, the route, the
  // shop, the squad's guns' stickers) stays the server's own.
  // (the ids it gives (nextEid, lootId, eSid) aren't in it: the server's own, so no two contexts' ids are the same)
  LVL_KEYS: ['map', 'seed', 'level', 'theme', 'night', 'enemies', 'cleared', 'extract', 'flow', 'flowT', 'snapT', 'wipeT', 'summons',
    'nadeT', 'noiseT', 'teamT', 'live', 'windT', 'windSend', 'clock', 'report', 'evidence', 'loot', 'bodies', 'glassBroken',
    'glassCracked', 'holes', 'fallen', 'wcase', 'caseOpen', 'cabs', 'abox', 'sbox', 'unitsSeen', 'kickAt', 'aiProp', 'bores', 'team', 'topId',
    'proxies', 'pirFlow', 'civT', 'liftT'] as const,
  // The other levels live beside the one loaded (ctxs: by the zone ship each is; the loaded one's own is SpaceSv's active), each
  // stepped in its turn (update), and the messages of whoever's aboard one handled with it loaded (handle). While one's loaded,
  // the players are only those aboard it (lvOf: a player's level, the loaded one's if not set), so its crew sees no one from
  // another, in another's frame. What's sent while it's loaded says which it is (L: js/serverhost.ts broadcast), but for what's
  // everyone's (GLOBAL_T: the space side, the run's; but the squad's ship's pose (spose), which is in its level's frame).
  ctxs: new Map<number, LvCtx>(),
  allPlayers: null as Map<string, Player> | null,
  GLOBAL_T: new Set(['seats', 'mdone', 'fleet', 'sdock', 'sxpdr', 'strk', 'ssec', 'srcue', 'smis', 'shit', 'shatch', 'sfire', 'schaff', 'sboom', 'newrun', 'chat', 'phase', 'board', 'ship', 'lobby', 'hello', 'welcome', 'join', 'left', 'ready', 'route', 'shop', 'prof', 'skins', 'stickers']),
  curK() { return SpaceSv.ctxSave().active; },
  lvOf(p: Player) { return (p as any).lv == null ? this.curK() : (p as any).lv; },
  // (the players aboard the loaded level only, while fn runs)
  scoped(fn: () => void) {
    if (this.allPlayers) { fn(); return; }
    const all = this.players, k = this.curK(), mine = new Map<string, Player>(); for (const [id, p] of all) if (this.lvOf(p) === k) mine.set(id, p);
    this.allPlayers = all; this.players = mine; try { fn(); } finally { this.players = all; this.allPlayers = null; }
  },
  // fn with level k loaded (and its players), then the one that was loaded back
  inCtx(k: number, fn: () => void) {
    if (k === this.curK()) { this.scoped(fn); return; }
    const c = this.ctxs.get(k); if (!c) return;
    const home = this.ctxSave(); this.ctxLoad(c);
    try { this.scoped(fn); } finally { if (this.ctxs.has(k)) this.ctxs.set(k, this.ctxSave()); this.ctxLoad(home); } // (unless it was put away meanwhile)
  },
  ctxSave(): LvCtx { const sv: Record<string, unknown> = {}, me = this as unknown as Record<string, unknown>; for (const k of this.LVL_KEYS) sv[k] = me[k]; return { sv, sp: SpaceSv.ctxSave() }; },
  ctxLoad(c: LvCtx) { const me = this as unknown as Record<string, unknown>; for (const k of this.LVL_KEYS) me[k] = c.sv[k]; SpaceSv.ctxLoad(c.sp); },
  reset() {
    this.players.clear(); this.enemies.clear(); this.ctxs.clear(); this.allPlayers = null;
    this.phase = 'lobby'; this.level = 0; this.map = null; this.leaving = null;
  },
  roster() {
    const r: Record<string, any> = {};
    for (const [id, p] of this.players) r[id] = { name: p.name, color: p.color, animal: p.animal, look: p.look, ready: p.ready, host: id === SvNet.myId, ...(p.anon ? { anon: 1 } : {}) };
    return r;
  },
  sendRoster() { SvNet.broadcast({ t: 'roster', roster: this.roster() }); },

  handle(m: NetMsg, from: string) {
    { const q = (this.allPlayers || this.players).get(from); if (!this.allPlayers && q && this.lvOf(q) !== this.curK() && this.ctxs.has(this.lvOf(q))) { this.inCtx(this.lvOf(q), () => this.handle(m, from)); return; } } // (someone aboard another level: theirs loaded)
    const p = this.players.get(from) || (this.allPlayers ? this.allPlayers.get(from) : undefined); // (whoever sent it, even while their level isn't the one loaded)
    switch (m.t) {
      case 'hello': {
        const name = String(m.name || 'Operator').slice(0, 16);
        // their animal (one of each to a squad): the highest-ranked free one of their preference (prefs: known animals, no repeats, at most
        // as many as there are; a client before them sends only animal), else the first one free
        const CS = Callsigns, taken = new Set([...this.players.values()].filter((q) => q.id !== from).map((q) => q.animal));
        const prefs: string[] = [];
        for (const a of Array.isArray(m.prefs) ? m.prefs.slice(0, CS.LIST.length) : [m.animal]) if (typeof a === 'string' && CS.valid(a) && !prefs.includes(a)) prefs.push(a);
        let animal: string | null = prefs.find((a) => !taken.has(a)) || null;
        if (!animal) animal = (CS.LIST.find((a) => !taken.has(a.id)) || CS.of(prefs[0] || CS.LIST[0].id)).id;
        const color = CS.of(animal).color;
        // anon: signed in to the cloud saves as a guest (js/cloud.ts; optional: an older client sends nothing, and shows nothing)
        (this.allPlayers || this.players).set(from, { id: from, name, color, animal, look: Sim.cleanLook(m.look), ready: false, st: null, anon: m.anon === 1 ? 1 : 0 });
        SvNet.sendTo(from, {
          t: 'welcome', id: from, roster: this.roster(), phase: this.phase, level: this.level,
          sp: !SpaceData.ON ? undefined : this.phase === 'shop' ? SpaceSv.shopMsg() : this.phase === 'level' ? SpaceSv.levelMsg() : undefined, // (the game in space: js/spaceserver.ts)
          seed: this.seed, shopSeed: this.shopSeed, th: this.theme, night: this.night ? 1 : 0, route: this.routeMsg(), stock: this.phase === 'shop' ? this.stock : null,
          doors: this.map && this.phase === 'level' ? this.map.doors.map((d: Door) => (d.open ? 1 : 0)) : null,
          holes: this.phase === 'level' ? this.holes || null : null, fallen: this.phase === 'level' ? this.fallen || null : null,
          evidence: this.phase === 'level' && this.evidence ? this.evidence.filter((v: Evidence) => !v.taken).map((v: Evidence) => [v.i, v.wpn, v.x, v.z, v.secured ? 1 : 0, v.y || 0]) : null,
          bodies: this.phase === 'level' && this.bodies ? [...this.bodies.values()].map((b) => [b.id, b.type, b.x, b.z, b.yaw, b.secured ? 1 : 0, b.y || 0, (b.rec && b.rec.title) || 0]) : null,
          wcase: this.phase === 'level' ? this.caseMsg() : null, wc: this.phase === 'level' ? this.caseGun() : null, cabs: this.phase === 'level' ? this.cabMsg() : null, abox: this.phase === 'level' ? this.aboxMsg() : null,
          loot: this.phase === 'level' && this.loot ? [...this.loot.values()].map((l) => this.lootMsg(l)) : null,
          glass: this.phase === 'level' && this.glassBroken ? [...this.glassBroken] : null, cracked: this.phase === 'level' ? this.glassCracked || null : null,
          skins: [...this.skins], sbox: this.phase === 'level' ? this.sboxMsg() : null,
        });
        if (this.phase === 'shop') SvNet.sendTo(from, this.teamMsg());
        this.sendRoster();
        if (from !== SvNet.myId) SvNet.broadcast({ t: 'chat', id: null, m: name + ' joined the squad.' });
        break;
      }
      case 'acct': if (p && (p.anon ? 1 : 0) !== (m.anon === 1 ? 1 : 0)) { p.anon = m.anon === 1 ? 1 : 0; this.sendRoster(); } break; // (signed in or out of the cloud saves since their hello: the guest mark)
      case 'st': if (p) p.st = m.s; break;
      case 'rfx': if (p && Array.isArray(m.a)) SvNet.broadcast({ t: 'rfx', a: m.a.slice(0, 32) }, from); break; // (the marks a round left on what it went through or off)
      case 'bstk': if (p) SvNet.broadcast(m, from); break; // (a bolt that stuck: js/bolts.ts)
      case 'hole': // (what it took out of them, js/damage.ts: kept for whoever joins, and here for the suspects' eyes and rounds)
        if (p && Array.isArray(m.a) && this.map && this.phase === 'level') {
          const a = m.a.slice(0, 32); (this.holes = this.holes || []).push(...a);
          for (const h of a) Damage.apply(this.map as unknown as DamageMap, h);
          SvNet.broadcast({ t: 'hole', a }, from);
        }
        break;
      case 'dhit': { const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null; if (d && p) this.doorHit(d, m.pt, m.J, m.dir); break; }
      case 'rpath': if (p && Array.isArray(m.ps)) SvNet.broadcast({ t: 'rpath', k: m.e ? 'e' + m.e : 'p' + from, sid: m.sid, ps: m.ps.slice(0, 32) }, from); break; // (where it went: for everyone's replays)
      case 'npath': if (p && Array.isArray(m.ps) && Number.isFinite(m.s)) SvNet.broadcast({ t: 'npath', s: m.s, ps: m.ps.slice(0, 48) }, from); break; // (a grenade's chips that hit someone: the same)
      // a gun's stickers (js/stickers.ts): kept and passed on; asked for by someone who's seen its hash and not it
      case 'skin': {
        if (!p || typeof m.h !== 'string' || m.h.length > 24 || this.skins.has(m.h)) break;
        if (this.skins.size > 300) this.skins.delete(this.skins.keys().next().value);
        this.skins.set(m.h, Stickers.clean(m.l));
        SvNet.broadcast({ t: 'skin', h: m.h, l: this.skins.get(m.h) });
        break;
      }
      case 'skinReq': if (this.skins.has(m.h)) SvNet.sendTo(from, { t: 'skin', h: m.h, l: this.skins.get(m.h) }); break;
      case 'hit': this.applyHit(m, from); break;
      // an officer's armour stopped rounds and they're still up: everyone's highlights (js/highlights.ts saved)
      case 'saved': if (p && this.phase === 'level') SvNet.broadcast({ t: 'saved', id: from, n: Math.max(1, Math.min(9, m.n | 0)) }); break;
      case 'shot':
        if (p && p.st && this.phase === 'level') this.hear(p.st.p[0], p.st.p[2], m.sil === 2 ? 2 : m.sil ? 6 : 28, p.st.p[1]); // (not at the range)
        // (the muzzle flash lights them up: officerLux; fl, how much flash its muzzle makes: js/player.ts flashOf)
        if (p && this.phase === 'level' && m.sil !== 2) { p.firedAt = this.clock; p.flashK = Number.isFinite(m.fl) ? G_U.clamp(m.fl, 0, 1.5) : m.sil ? 0.1 : 1; }
        if (m.f && m.to && this.phase === 'level') this.suppress(m.f, m.to, Gunsmith.fromCode(m.w), (AMMO as Tbl)[m.am] ? m.am : undefined);
        SvNet.broadcast({ t: 'shot', id: from, sid: m.sid, f: m.f, to: m.to, w: m.w, sil: m.sil, bm: Number.isFinite(m.bm) ? m.bm : undefined, rl: typeof m.rl === 'string' && m.rl.length < 12 ? m.rl : undefined, am: (AMMO as Tbl)[m.am] ? m.am : undefined, vi: Number.isInteger(m.vi) && m.vi >= 0 && m.vi < 16 ? m.vi : undefined, vn: Number.isInteger(m.vn) && m.vn > 0 && m.vn <= 16 ? m.vn : undefined, // (a volley's rounds: js/player.ts shoot)
          tos: Array.isArray(m.tos) && m.tos.length <= 24 && m.tos.every((p: unknown) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)) ? m.tos : undefined }, from); // (a shotgun's pellets: for the highlights)
        break;
      case 'nade': {
        const k = m.k === 'flash' ? 'flash' : m.k === 'tb' ? 'tb' : m.k === 'sticky' ? 'sticky' : 'frag', nid = Number.isInteger(m.nid) ? m.nid : undefined;
        SvNet.broadcast({ t: 'nade', id: from, p: m.p, v: m.v, fuse: m.fuse, k, s: [0, 1, 2].includes(m.s) ? m.s : 2, nid }, from);
        if (this.phase === 'level' && Array.isArray(m.p) && Array.isArray(m.v) && m.p.length === 3 && m.v.length === 3 && [...m.p, ...m.v].every(Number.isFinite) && Number.isFinite(m.fuse)) this.liveNade(m.p, m.v, Math.min(6, m.fuse), k, nid, from);
        break;
      }
      case 'stk': { // (where an officer's sticky grenade held: passed on, and the suspects' idea of it put right: dodgeTick)
        if (!Number.isInteger(m.nid) || (m.at && !(Array.isArray(m.at) && m.at.length === 3 && m.at.every(Number.isFinite))) || (m.l && !(Array.isArray(m.l) && m.l.length === 3 && m.l.every(Number.isFinite)))) break;
        SvNet.broadcast({ t: 'stk', id: from, nid: m.nid, at: m.at, e: Number.isInteger(m.e) ? m.e : undefined, pl: typeof m.pl === 'string' ? m.pl : undefined, b: typeof m.b === 'string' ? m.b.slice(0, 24) : undefined, l: m.l }, from);
        if (this.phase === 'level') this.stuckNade(m.nid, from, m.at || null, Number.isInteger(m.e) ? m.e : null);
        break;
      }
      case 'flash': if (this.phase === 'level' && Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) this.flashbang(m.p, p && p.st ? p.st.p : null, from); break;
      // an officer's round went through these windows
      case 'glass': if (this.phase === 'level' && Array.isArray(m.ids)) this.breakGlass(m.ids, m.p); break;
      case 'crack': { // (a round through a pane that doesn't bring it down: it's fractured (more), and it's heard)
        const w = this.phase === 'level' && this.map && this.map.windows && (this.map.windows as SvWin[])[m.id];
        if (!w || w.broken || w.armor || (w.cracked || 0) >= Level.crackCap(w) || !Array.isArray(m.p)) break;
        w.cracked = (w.cracked || 0) + 1; this.glassCracked.push([m.id, m.p]); this.hear(w.x, w.z, 10, w.fy || 0);
        SvNet.broadcast({ t: 'crack', id: m.id, p: m.p }, from);
        break;
      }
      case 'boom':
        if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) break;
        this.hear(m.p[0], m.p[2], 35, m.p[1] || 0);
        if (this.phase === 'level' && this.map) this.blastDaze(m.p, m.tb ? 'tb' : m.fr ? 'frag' : null, p && p.st ? p.st.p : null);
        // the blast takes out the windows round it
        if (this.map && this.map.windows && Array.isArray(m.p)) this.breakGlass(this.map.windows.filter((w: SvWin) => !w.broken && Math.hypot(w.x - m.p[0], w.z - m.p[2]) < (+m.r || 4) * 1.3 && Math.abs((w.fy || 0) + 1.3 - (m.p[1] || 0)) < 2.5).map((w: SvWin) => w.id), m.p);
        SvNet.broadcast({ t: 'boom', id: from, p: m.p, r: m.r, d: m.d, fr: m.fr ? 1 : undefined, tb: m.tb ? 1 : undefined, sk: m.sk ? 1 : undefined, s: m.fr || m.tb ? m.s : undefined }); // (fr, s: a frag grenade, and its burst's seed: the pocks it leaves are the same on every screen; tb: a thermobaric's, the same fireball everywhere)
        break;
      case 'revive': SvNet.broadcast({ t: 'revive', tg: m.tg, by: from, hp: m.hp }); break;
      // the range's IPSC course: a new stage laid (its seed), and a run as it happens (passed on to the others)
      case 'course': if (+m.seed > 0) SvNet.broadcast({ t: 'course', seed: Math.floor(+m.seed) }, from); break;
      case 'crun': if (m.s && typeof m.s === 'object') SvNet.broadcast({ t: 'crun', s: m.s, by: from }, from); break;
      // one officer's medical item on another: passed on to them (they apply it)
      case 'treat': if ((Med.ITEMS as Tbl)[m.mt] && (Med.NAME as Tbl)[m.part]) SvNet.broadcast({ t: 'treat', tg: m.tg, by: from, part: m.part, mt: m.mt, th: m.th ? 1 : 0 }); break;
      // an officer has started (or stopped) putting a medical item on another: only the one it's going on hears of it
      case 'applying': if (p && (Med.ITEMS as Tbl)[m.mt] && (Med.NAME as Tbl)[m.part] && this.players.has(m.tg)) SvNet.sendTo(m.tg, { t: 'applying', by: from, part: m.part, mt: m.mt, dur: G_U.clamp(+m.dur || 0, 0, 30), off: m.off ? 1 : 0 }); break;
      // a vote to leave (or taking it back), once order's restored
      case 'vote':
        if (this.phase === 'level' && this.extract.active && p) { if (m.v) this.extract.votes.add(from); else this.extract.votes.delete(from); }
        break;
      case 'ready':
        if (p) { p.ready = !!m.r; this.sendRoster(); this.checkReady(); }
        break;
      // a vote on the route map for where to go next
      case 'arm': // a player's own sidearm for the run (not a vote: everyone's told who took what)
        if (p && Arsenal.has(m.id)) { this.arms = this.arms || {}; this.arms[from] = m.id; SvNet.broadcast({ t: 'arms', a: this.arms }); this.checkArms(); }
        break;
      case 'pick':
        if (p && this.phase === 'route' && this.route && this.routeMap && Route.options(this.routeMap!, this.route!.path[this.route!.path.length - 1]).includes(m.n)) {
          this.route!.votes[from] = m.n;
          SvNet.broadcast({ t: 'rvotes', v: this.route!.votes });
          this.checkPicks();
        }
        break;
      case 'chat': if (p) SvNet.broadcast({ t: 'chat', id: from, m: String(m.m).slice(0, 120) }); break;
      // friendly fire: one officer's rounds in another (the shooter traced them; the one hit takes the wounds)
      case 'ff': if (p && this.phase === 'level' && this.players.has(m.tg) && Array.isArray(m.ws)) SvNet.broadcast({ t: 'ffhit', by: from, tg: m.tg, ws: m.ws.slice(0, 24), rang: m.rang, stopped: m.stopped, wear: m.wear, at: m.at, f: m.f, e: m.e, fc: Array.isArray(m.fc) ? m.fc.slice(0, 12) : undefined, hd: Array.isArray(m.hd) ? m.hd.slice(0, 12) : undefined }); break; // (what someone's round did to an officer, as they worked it out; e: a suspect's)
      case 'ping': if (p && Array.isArray(m.p) && m.p.length === 3) SvNet.broadcast({ t: 'ping', id: from, p: m.p.map(Number) }); break;
      // something put down (dropped from an inventory), or picked up: the first to ask gets it
      case 'drop': {
        // (never refused once it's off them: an item can't be lost. Their position, when we have it, keeps it
        // at their feet)
        if (this.phase !== 'level' || !p || !m.item || typeof m.item !== 'object') break;
        let x = +m.x, z = +m.z;
        if (!isFinite(x) || !isFinite(z)) { if (!p.st) break; x = p.st.p[0]; z = p.st.p[2]; }
        if (p.st && Math.hypot(x - p.st.p[0], z - p.st.p[2]) > 2.5) { x = p.st.p[0]; z = p.st.p[2]; }
        // (at: back where something else lay, a gun swapped for one in the weapon case, or what you'd no room for: its height, yaw and fit)
        const back = Array.isArray(m.at) && x === +m.x && z === +m.z ? m.at : null;
        const l = this.lootAdd(x, back ? +back[0] || 0 : Level.groundAt(this.map!, x, z, 0.05, ((p.st && p.st.p[1]) || 0) + 1.2), z, m.item, back ? +back[1] || 0 : Math.random() * Math.PI * 2, back ? back[2] : undefined);
        SvNet.broadcast({ t: 'loot', a: [this.lootMsg(l)], by: from });
        break;
      }
      case 'take': {
        const l = this.loot && this.loot.get(m.id);
        if (this.phase !== 'level' || !l || !p || !p.st || Math.hypot(l.x - p.st.p[0], l.z - p.st.p[2]) > 2.5) break;
        this.loot.delete(l.id);
        SvNet.broadcast({ t: 'lootRm', id: l.id });
        SvNet.sendTo(from, { t: 'lootGot', item: l.item, x: l.x, z: l.z, at: [l.y, l.yaw, l.fit] });
        break;
      }
      case 'useDoor': {
        const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null;
        if (d && p && p.st && Math.hypot(p.st.p[0] - d.x, p.st.p[2] - d.z) < 2.8 && Math.abs(p.st.p[1] - (d.fy || 0)) < 2 && SpaceSv.mayOpen(d, from)) {
          this.setDoor(d.id, !d.open);
          if (d.kind === 'vault' || Level.slides(d)) { // both leaves together
            const partner = d.mirror ? this.map!.doors[d.id - 1] : this.map!.doors[d.id + 1] && this.map!.doors[d.id + 1].mirror ? this.map!.doors[d.id + 1] : null;
            if (partner) this.setDoor(partner.id, d.open);
          }
          const field = this.soundField(d.x, d.z, d.fy || 0);
          for (const e of this.enemies.values()) if (this.heardAt(field, e.x, e.z, e.y) < 7) { this.suspect(e, d.x, d.z); if (!e.def.civ && e.state === 'normal') this.noted(e, d.x, d.fy || 0, d.z); } // a door is heard
        }
        break;
      }
      case 'kickDoor': {
        const d = this.map && this.phase === 'level' ? this.map.doors[m.i] : null;
        if (d && !d.open) { this.kickAt = this.kickAt || {}; this.kickAt[from] = this.clock || 0; } // (a kill soon after: a breach, for the highlights)
        if (d && !d.open && !Level.sturdy(d) && p && p.st && Math.hypot(p.st.p[0] - d.x, p.st.p[2] - d.z) < 2.8 && Math.abs(p.st.p[1] - (d.fy || 0)) < 2) this.kickDoor(d);
        break;
      }
      case 'shout': if (p && p.st && this.phase === 'level') this.shout(p as LivePlayer, from); break;
      // open the weapon case (once, for everyone)
      case 'openCase': {
        const c = this.map && this.map.case;
        if (this.phase !== 'level' || !c || this.caseOpen || !p || !p.st || Math.hypot(c.x - p.st.p[0], c.z - p.st.p[2]) > 2.4 || Math.abs(p.st.p[1] - (c.fy || 0)) > 1.5) break; // (on the ground floor: this one and the two boxes)
        this.caseOpen = true;
        SvNet.broadcast({ t: 'wcase', c: this.caseMsg() });
        this.casePut();
        break;
      }
      // the attachments box: one use each. Your first look rolls your three (for the weapon in your hands: its code);
      // then you take one of them, fitted to your weapon or carried
      case 'openAbox': case 'takeAbox': {
        const b = this.map && this.map.abox, a = this.abox;
        if (this.phase !== 'level' || !b || !a || !p || !p.st || Math.hypot(b.x - p.st.p[0], b.z - p.st.p[2]) > 2.4 || Math.abs(p.st.p[1] - (b.fy || 0)) > 1.5) break;
        const mine = a.uses[from];
        if (m.t === 'openAbox') {
          if (mine) break;
          a.open = true; a.uses[from] = { items: this.rollAbox(typeof m.code === 'string' ? m.code : ''), taken: null };
          SvNet.broadcast({ t: 'abox', a: this.aboxMsg(), opened: from });
        } else {
          const pid = mine && !mine.taken ? mine.items[m.i | 0] : null;
          if (!pid) break;
          mine.taken = pid;
          SvNet.broadcast({ t: 'abox', a: this.aboxMsg(), by: from, got: pid, fit: !!m.fit });
        }
        break;
      }
      // the sticker box: the sticker goes to whoever opens it first
      case 'openSbox': {
        const b = this.map && this.map.sbox, s = this.sbox;
        if (this.phase !== 'level' || !b || !s || s.by || !p || !p.st || Math.hypot(b.x - p.st.p[0], b.z - p.st.p[2]) > 2.4 || Math.abs(p.st.p[1] - (b.fy || 0)) > 1.5) break;
        s.by = from;
        SvNet.broadcast({ t: 'sbox', s: this.sboxMsg() });
        break;
      }
      // first aid cabinets: opened (once, for everyone), and officers' edits (what they took and put in)
      case 'teamEdit': {
        if (this.phase !== 'shop' || !p) break;
        const r = this.teamEdit(m);
        SvNet.broadcast(Object.assign(this.teamMsg(), { by: from, deny: r.deny, ret: r.ret }));
        break;
      }
      case 'openCab': case 'cabEdit': {
        const c = this.map && this.map.cabinets && this.map.cabinets[m.i], cab = this.cabs && this.cabs[m.i];
        if (this.phase !== 'level' || !c || !cab || !p || !p.st || Math.hypot(c.x - p.st.p[0], c.z - p.st.p[2]) > 2.6) break;
        let r = null;
        if (m.t === 'openCab') { if (cab.open) break; cab.open = true; }
        else { if (!cab.open) break; r = this.cabEdit(cab, m); }
        SvNet.broadcast({ t: 'cab', i: m.i, c: [cab.open ? 1 : 0, cab.items, cab.ver], by: r ? from : null, took: r && r.took, deny: r && r.deny, ret: r && r.ret });
        break;
      }
      // "Turn around!": a kneeling suspect (or cowering civilian) turns to face away from the officer
      case 'turn': {
        const e = this.enemies.get(m.e);
        if (!e || !p || !p.st || !this.obedient(e) || Math.hypot(e.x - p.st.p[0], e.z - p.st.p[2]) > 3.5) break;
        e.turnYaw = Math.atan2(-(e.x - p.st.p[0]), -(e.z - p.st.p[2])); // facing straight away from them
        e.ordered = true;
        SvNet.broadcast({ t: 'order', id: from, e: e.id });
        break;
      }
      // pulled back from a wall so there's room to lay them down
      case 'drag': {
        const e = this.enemies.get(m.e);
        if (!e || !p || !p.st || !this.obedient(e) || Math.hypot(e.x - p.st.p[0], e.z - p.st.p[2]) > 2.6) break;
        if (Math.hypot(m.x - e.x, m.z - e.z) > 1.6) break;
        e.dragTo = { x: m.x, z: m.z };
        break;
      }
      case 'cuff': if (p && p.st && this.phase === 'level') this.cuff(m.e, p as LivePlayer, from, m.at); break;
      // the store's shared stock (js/shop.ts take): one off the shelf if there's one left; put back if it couldn't be paid for
      case 'stake': {
        const ok = p && this.phase === 'shop' && this.stock && this.stock[m.k] > 0;
        if (ok) { this.stock[m.k]--; SvNet.broadcast({ t: 'stock', s: this.stock }); }
        SvNet.sendTo(from, { t: 'took', q: m.q, ok: ok ? 1 : 0 });
        break;
      }
      case 'sgive': if (p && this.phase === 'shop' && this.stock && m.k in this.stock) { this.stock[m.k]++; SvNet.broadcast({ t: 'stock', s: this.stock }); } break;
      case 'secure': if (p && p.st && this.phase === 'level') this.secure(m.i, p as LivePlayer, from); break;
      // ---- the host's own word, from its own screen (never anyone else's: from is who the message came from)
      // the lobby's Deploy (and a debug start's, js/debugstart.ts: dbg, what it wants of the first level), the game over table's New Run
      case 'startRun': if (from === SvNet.myId) { this.dbgNext = m.dbg && typeof m.dbg === 'object' ? m.dbg : null; this.startRun(); } break;
      case 'toLobby': if (from === SvNet.myId) this.toLobby(); break;
      // a debug start's: straight to the hangar (?hangar), nobody in the level (?nofoes, and js/demo.ts)
      case 'toShop': if (from === SvNet.myId) this.overBlack(() => this.toShop()); break;
      case 'noFoes': if (from === SvNet.myId) this.enemies.clear(); break;
      // a suspect's grenade went off on the host's screen (js/views.ts): there
      case 'eboom': if (from === SvNet.myId && this.phase === 'level' && this.map && Array.isArray(m.p) && m.p.length === 3 && m.p.every(Number.isFinite)) this.enemyBoom({ x: m.p[0], y: m.p[1], z: m.p[2] }); break;
      // the suspects' guns as the host's screen drew them (js/views.ts boresOut): [id, muzzle x, y, z, bore x, y, z, ...]
      case 'bores': {
        if (from !== SvNet.myId || !Array.isArray(m.a)) break;
        const b = new Map<number, number[]>();
        for (let i = 0; i + 6 < m.a.length; i += 7) b.set(m.a[i], m.a.slice(i + 1, i + 7));
        this.bores = b;
        break;
      }
      // the F9 readout's look at a suspect (js/hud.ts): their record as it is here
      case 'eInfo': if (from === SvNet.myId) SvNet.sendTo(from, { t: 'eInfo', id: m.id, e: this.eInfo(m.id) }); break;
      default: SpaceSv.handle(m, from, p); // (the missions board, the ship, a mission's own things: js/spaceserver.ts)
    }
  },
  // A suspect's record (or the dead one's, as they died) for the F9 readout: what it shows, as plain data
  eInfo(id: number) {
    const bd = this.bodies && this.bodies.get(id), e = this.enemies.get(id) || (bd && bd.rec);
    if (!e) return null;
    const o = e.order;
    return { state: e.state, hp: e.hp, maxHp: e.maxHp, str: e.str, bleedH: e.bleedH, bleedL: e.bleedL, clotT: e.clotT, bleedK: this.BLEED_K, cardiac: e.cardiac, out: e.out, spine: e.spine, lung: e.lung, broke: e.broke, collapsed: e.collapsed, down: e.down,
      organs: e.organs, calls: e.calls, radioT: e.radioT, callLog: e.callLog, morale: e.morale, broken: e.broken, alert: e.alert, canSee: e.canSee, surprisedT: e.surprisedT, suppressT: e.suppressT,
      armed: e.armed, drawn: e.drawn, mag: e.mag, magMax: e.magMax, reloadT: e.reloadT, tb: e.tb, tbRate: this.tbRate(e), // (tb: a thermobaric's burns and blast, and what they drain a second)
      order: o ? { own: o.own, by: o.by, role: o.cordon ? 'cordon:' + o.cordon : o.role, phase: o.phase, entry: { kind: o.entry.kind, x: o.entry.x, z: o.entry.z }, x: o.x, z: o.z, left: o.until - (this.clock || 0) } : null };
  },
  onLeave(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id); if (this.allPlayers) this.allPlayers.delete(id); // (and from the whole squad, a level being stepped or not)
    SvNet.broadcast({ t: 'left', id });
    SvNet.broadcast({ t: 'chat', id: null, m: p.name + ' left the squad.' });
    this.sendRoster();
    this.checkReady();
    SpaceSv.left(id);
    if (this.route) { delete this.route.votes[id]; this.checkPicks(); }
    this.checkArms();
  },

  // --------------------------------------------------------------- phases
  startRun() {
    // (the game in space: the hangar first, missions off its board, js/spaceserver.ts; a debug start's ?play still goes the old way)
    if (SpaceData.ON && !(this.dbgNext && this.dbgNext.classic)) { const dbg = !!this.dbgNext, f = this.dbgNext && this.dbgNext.fleet; this.dbgNext = null; SpaceSv.startRun(f, dbg); return; } // (a debug start: no sidearm picker, js/debugstart.ts)
    this.level = 1;
    this.team = { ver: 0, items: [] };
    this.arms = {}; // (the sidearms picked: each player's own)
    SvNet.broadcast({ t: 'newrun' });
    this.toRoute();
  },
  // ---------------------------------------------------------------- the route map
  // Before each level the squad picks where to go on the act's map (a new map every ten levels, the last
  // the boss). Everyone votes; when all have, the most votes wins (a tie is settled at random).
  toRoute() {
    const act = Route.actOf(this.level);
    if (!this.route || this.route.act !== act) {
      this.route = { seed: (Math.random() * 2 ** 31) | 0, act, path: [], votes: {} };
      this.routeMap = Route.gen(this.route.seed, act);
    }
    this.route.votes = {};
    this.phase = 'route';
    for (const p of this.players.values()) p.ready = false;
    SvNet.broadcast({ t: 'phase', phase: 'route', level: this.level, route: this.routeMsg() });
    this.sendRoster();
  },
  routeMsg() { return this.route ? { seed: this.route.seed, act: this.route.act, path: this.route.path, votes: this.route.votes } : null; },
  // The game in space: a run starts on the sidearm picker alone (js/spaceserver.ts startRun), and goes to the base once all the
  // squad have picked theirs.
  checkArms() {
    if (!SpaceData.ON || this.phase !== 'route' || this.route || !this.players.size || this.leaving) return;
    for (const id of this.players.keys()) if (!(this.arms && this.arms[id])) return;
    this.overBlack(() => this.toShop());
  },
  checkPicks() {
    if (this.phase !== 'route' || !this.players.size || this.leaving) return;
    for (const id of this.players.keys()) if (this.route!.votes[id] == null) return;
    const tally: Record<string, number> = {};
    for (const n of Object.values(this.route!.votes)) tally[n] = (tally[n] || 0) + 1;
    const top = Math.max(...Object.values(tally)), best = Object.keys(tally).filter((n) => tally[n] === top);
    const n = +best[Math.floor(Math.random() * best.length)];
    this.route!.path.push(n);
    this.theme = this.routeMap!.nodes.get(n)!.th;
    this.overBlack(() => this.startLevel());
  },
  // Building the next place stalls the host, and it's built before anyone's told: so everyone's screen goes black first
  // (js/game.ts veil), and go runs once it has, if the phase is still the one it was asked from. Only one at a time.
  overBlack(go: () => void, kind?: string) { // (kind 'ftl': a jump, not a black panel: js/space.ts)
    if (this.leaving) return;
    const run = this.leaving = {}, from = this.phase;
    SvNet.broadcast({ t: 'veil', k: kind });
    setTimeout(() => {
      if (this.leaving !== run) return; // (gone back to the menu)
      this.leaving = null;
      if (this.phase === from) go();
    }, Sim.VEIL_MS + 40);
  },
  // is the level being played a stronghold (a flag on its route node: js/route.ts)
  isStronghold() {
    const at = this.route && this.route.path[this.route.path.length - 1], n = this.routeMap && at != null ? this.routeMap.nodes.get(at) : null;
    return !!(n && n.stronghold);
  },
  // and a night level (its lights out: js/level.ts nightify)
  isNight() {
    const at = this.route && this.route.path[this.route.path.length - 1], n = this.routeMap && at != null ? this.routeMap.nodes.get(at) : null;
    return !!(n && n.night);
  },
  startLevel(ms?: SpMission) { // (ms: a mission's level, js/spaceserver.ts begin: its seed, place and how hard it is are the mission's)
    if (this.dbgNext) { // (a debug start's: js/debugstart.ts, 'startRun')
      const d = this.dbgNext, n = this.routeMap && this.route ? this.routeMap.nodes.get(this.route.path[this.route.path.length - 1]) : null;
      this.dbgNext = null;
      if (typeof d.th === 'number' && Number.isInteger(d.th) && THEMES[d.th]) this.theme = d.th;
      if (typeof d.lvl === 'number' && Number.isInteger(d.lvl) && d.lvl >= 1) this.level = d.lvl;
      if (d.leader) this.forceLeader = true;
      if (n && d.stronghold) n.stronghold = true;
      if (n && d.night) n.night = true;
      if (typeof d.seed === 'number' && Number.isInteger(d.seed)) this.dbgSeed = d.seed;
    }
    this.bores = new Map();
    this.phase = 'level';
    const want = this.dbgSeed; this.dbgSeed = null; // (a debug start's ?seed=: that level again)
    this.seed = ms ? ms.seed : want != null ? want : (Math.random() * 2 ** 31) | 0;
    if (ms) { this.level = ms.diff; this.theme = ms.th; }
    this.night = ms ? ms.night : this.isNight();
    this.map = Level.generate(this.seed, this.level, this.theme as number, this.night, ms ? SpaceSv.genOf(ms) : null);
    ServerHost.born(this.map); // (what it was built with: ServerLink.digest)
    this.aiMask(this.map);
    this.enemies = new Map(); this.cleared = new Map(); // (new, not cleared: a level context kept holds the one it had, js/server.ts ctxSave)
    this.extract = { active: false, votes: new Set() };
    this.flow = null; this.flowT = 0; this.wipeT = 0; this.summons = 0; this.nadeT = 8; this.live = [];
    this.windT = 0; this.windSend = 0; // (the wind's own clock, from the level's start: windTick)
    this.report = { incap: 0, bleedouts: 0, bleedBy: {}, arrests: 0, rescued: 0, civKilled: 0, unauth: 0, evidence: 0, bodies: 0, stronghold: this.isStronghold() };
    this.evidence = []; // weapons on the floor: { i, wpn, x, z, owner, secured, taken }
    this.loot = new Map(); // things officers have put down: id -> { id, x, y, z, item (packed), yaw }
    this.glassBroken = new Set(); this.glassCracked = []; // windows broken (map.windows ids), and fractured ([id, where])
    this.holes = []; this.fallen = []; // (what's been shot out of the place: js/damage.ts)
    this.bodies = new Map(); // the dead, until secured: id -> { id, type, x, z, yaw, civ, secured }
    for (const p of this.players.values()) { p.ready = false; p.st = null; }
    // (a ship has her own complement, by her class: js/spaceserver.ts crew)
    if (ms && this.map.sp) SpaceSv.crew(); else this.spawnEnemies();
    if (ms) SpaceSv.populate();
    this.wcase = this.map.case ? this.rollCase() : null;
    this.cabs = (this.map.cabinets || []).map(() => ({ open: false, ver: 0, items: this.layCab(this.rollCab()) }));
    this.caseOpen = false;
    this.abox = this.map.abox ? { open: false, uses: {} } : null; // uses: player id -> { items, taken }
    // the sticker box's sticker: one of the host's (js/stickers.ts names; none, and the box isn't there)
    const sn = Stickers.names;
    this.sbox = this.map.sbox && sn.length ? { s: sn[Math.floor(Math.random() * sn.length)], by: null } : null;
    // (a ship of the zone's come back to: as she was left, js/spaceserver.ts restore; and everyone's told all of it, as whoever joins is)
    const kept = !!ms && SpaceSv.restore();
    this.toLevel(this.phaseMsg(!!ms, kept)); // (to those in the loaded level: whoever's aboard another of the zone's ships stays there)
  },
  // the level as it is, for a screen coming into it: everything if it's been played (kept: come back to, or live), else its start
  phaseMsg(space: boolean, kept: boolean) {
    const was = kept ? { doors: this.map!.doors.map((d: Door) => (d.open ? 1 : 0)), holes: this.holes, fallen: this.fallen, evidence: this.evidence.filter((v: Evidence) => !v.taken).map((v: Evidence) => [v.i, v.wpn, v.x, v.z, v.secured ? 1 : 0, v.y || 0]),
      loot: [...this.loot.values()].map((l) => this.lootMsg(l)), glass: [...this.glassBroken], cracked: this.glassCracked } : {};
    return { t: 'phase', phase: 'level', level: this.level, seed: this.seed, th: this.theme, night: this.night ? 1 : 0, route: this.routeMsg(), wcase: this.caseMsg(), wc: this.caseGun(), cabs: this.cabMsg(), abox: this.aboxMsg(), sbox: this.sboxMsg(), sp: space ? SpaceSv.levelMsg() : undefined, ...was,
      bodies: this.bodies.size ? [...this.bodies.values()].map((b) => [b.id, b.type, b.x, b.z, b.yaw, b.secured ? 1 : 0, b.y || 0, (b.rec && b.rec.title) || 0]) : undefined }; // (the dead she's come back to with: js/spaceserver.ts populate)
  },
  // a message to everyone in the loaded level (all of them, but those aboard another of the zone's levels)
  toLevel(m: any) { const k = this.curK(); for (const [id, p] of this.allPlayers || this.players) if (this.lvOf(p) === k) this.net.sendTo(id, m); },
  // The level's weapon case: a weapon in its standard build, fully loaded, picked by rarity. Each tier has a
  // share (CASE_RARITY), split evenly between that tier's weapons so a tier with many weapons isn't more
  // likely; deeper levels shift the odds toward rarer tiers, and legendaries only turn up from level 3.
  // All long guns (the sidearms are earned on the sidearm web, js/arsenal.ts), and mostly ones worth building on from the start (the second tier the likeliest at the first level,
  // the first tier a quarter or so of them, and fading). (Tier 0, the starter pistol, turns up too, rarely.)
  CASE_RARITY: { 0: 5, 1: 25, 2: 45, 3: 15, 4: 3 } as Record<string, number>,
  caseOdds(level: number, slot: string) {
    const byTier: Record<string, any[]> = {};
    for (const w of WEAPON_LIST) if (w.slot === slot && obtainable(w) && this.CASE_RARITY[w.tier] && !(w.tier === 4 && level < 3)) (byTier[w.tier] = byTier[w.tier] || []).push(w);
    const out: [any, number][] = [];
    for (const [tier, list] of Object.entries(byTier)) {
      const share = this.CASE_RARITY[tier] * Math.pow(1 + 0.25 * (level - 1), +tier - 1);
      for (const w of list) out.push([w, share / list.length]);
    }
    return out;
  },
  // The weapon case's gun, magazines and rounds: drawn from the level's seed (salted, so it isn't the map's own draws), so a seed
  // gives the same case every time it's played. Server.rollCase(seed, level) in the console says what a seed's case holds.
  rollCase(seed?: number, level?: number) {
    if (seed == null) seed = this.seed; if (level == null) level = this.level;
    const r = G_U.rng((seed ^ 0x5ca5e) >>> 0);
    r(); const odds = this.caseOdds(level, 'p'); // (long guns only: the sidearms are earned on the sidearm web, js/arsenal.ts. The draw that picked the slot is still made, so a seed's later draws stay put)
    let x = r() * odds.reduce((a: number, [, wt]: [any, number]) => a + wt, 0), w = odds[0][0];
    for (const [cand, wt] of odds) { x -= wt; if (x <= 0) { w = cand; break; } }
    // loaded, with two full spare magazines (or that many rounds; a full box, for a gun that only holds a round or two), all of one type: mostly ball, now and then
    // something better
    // A gun that takes other receiver groups (js/parts.ts RCV) now and then turns up built on one of them: an AUG
    // with the 9mm kit in it, an AK with the RPK's, fitted and working (its barrel and all), magazines and
    // rounds to match.
    const kits = Gunsmith.kitsFor(w.id).filter((k) => obtainable(WEAPONS[Gunsmith.PARTS[k].becomes]));
    if (kits.length && r() < 0.35) w = WEAPONS[Gunsmith.PARTS[kits[Math.floor(r() * kits.length)]].becomes] || w;
    if (w.barrels) { // a gun of several barrels (its round types are different lengths of round, roundOf): loaded with one, a spare block of the other, and a spare of the first: both turn up
      const keys = Object.keys(w.barrels.rounds), rl = keys[Math.floor(r() * keys.length)], other = keys.filter((k) => k !== rl)[0], cap = (k: string) => w.barrels.n * w.barrels.rounds[k].per;
      return { code: Gunsmith.defaultCode(w.id), mag: cap(rl), reserve: cap(rl), rl, am: rollAmmo(w.barrels.rounds[rl].cal, r), alt: other ? { rl: other, n: cap(other), am: rollAmmo(w.barrels.rounds[other].cal, r) } : undefined };
    }
    return { code: Gunsmith.defaultCode(w.id), mag: w.mag, reserve: w.mag > 2 ? w.mag * 2 : Gear.boxCap(calOf(w)), am: w.am ? loadFor(w) : rollAmmo(calOf(w), r) }; // (a gun with its own load comes with it: the MP5SD's subsonic)
  },
  // Something lying in the world (Loot), and how it's sent
  lootAdd(x: number, y: number, z: number, item: any, yaw: number, fit?: number) {
    const l = { id: (this.lootId = (this.lootId || 0) + 1), x, y, z, item, yaw, fit };
    this.loot.set(l.id, l);
    if (this.loot.size > 80) { const old = this.loot.keys().next().value; this.loot.delete(old); SvNet.broadcast({ t: 'lootRm', id: old }); }
    return l;
  },
  lootMsg(l: Loot) { return [l.id, l.x, l.y, l.z, l.item, l.yaw, l.fit]; },
  // The case, opened: what's in it is loose in the foam, to be picked up like anything else lying about. The gun along
  // the back with its grip to the front, and its spares in a row along the front, by the muzzle.
  casePut() {
    const c = this.map!.case, got = this.wcase, def = got && Gunsmith.fromCode(got.code);
    if (!def) return;
    this.wcase = null;
    const Gr = Gear, w = Sim.makeWeapon(def.id, def.build), ch = chambered(def) && got.mag > 0; // (the count is everything in it: one of them's in the chamber)
    if (def.barrels && got.rl) w.rl = roundOf(def, got.rl)!.rl;
    w.ammo = ammoOk(cartOf(w), got.am);
    w.mag = Math.min(got.mag - (ch ? 1 : 0), capOf(w));
    if (w.tube) w.tube = Array(w.mag).fill(w.ammo);
    w.chamber = ch ? w.ammo : null;
    // (on the foam: the case's own floor, which on ground that rolls is the ground under it, as js/level.ts draws it, not the map's zero)
    const cos = Math.cos(c.yaw), sin = Math.sin(c.yaw), FOAM = (this.map!.terrain ? c.fy || 0 : 0) + 0.032;
    const put = (it: any, lx: number, lz: number, turn: number, fit?: number) => this.lootMsg(this.lootAdd(c.x + lx * cos + lz * sin, FOAM, c.z - lx * sin + lz * cos, Gr.pack(it), c.yaw + turn, fit));
    SvNet.broadcast({ t: 'loot', a: [put(Gr.gunItem(w), 0, -0.03, -Math.PI / 2, 1.28), ...Gr.spares(def, got.reserve, w.ammo, w.rl).concat(got.alt ? [Gr.ammoItem(def, got.alt.n, ammoOk(roundOf(def, got.alt.rl)!.cal, got.alt.am), undefined, got.alt.rl)] : []).map((it, i) => put(it, 0.55 - i * 0.2, 0.13, 0))] });
  },
  // A first aid cabinet's contents: one to three things, mostly bandages and painkillers, now and then a
  // tourniquet, gauze, a chest seal or a splint. [[mt, n], ...], like kinds stacked together.
  CAB_ODDS: [['bandage', 30], ['pills', 16], ['tourniquet', 18], ['gauze', 14], ['seal', 12], ['splint', 10], ['bloodbag', 5]] as [string, number][],
  rollCab() {
    const n = Math.random() < 0.45 ? 1 : Math.random() < 0.73 ? 2 : 3, out: [string, number][] = [], total = this.CAB_ODDS.reduce((a: number, [, w]: [string, number]) => a + w, 0);
    for (let i = 0; i < n; i++) {
      let x = Math.random() * total, mt = 'bandage';
      for (const [k, w] of this.CAB_ODDS) { x -= w; if (x <= 0) { mt = k; break; } }
      const k = (mt === 'bandage' || mt === 'pills') && Math.random() < 0.4 ? 2 : 1, have = out.find((o) => o[0] === mt);
      if (have && have[1] + k <= ((Med.ITEMS as Tbl)[mt].stack || 1)) have[1] += k; else out.push([mt, k]);
    }
    return out;
  },
  // A cabinet is a CAB_W x CAB_H grid (medical gear only): items [[mt, n, x, y, rot], ...]. ver counts changes,
  // so an edit made against an older state is checked rather than taken as it is.
  CAB_W: Sim.CAB_W, CAB_H: Sim.CAB_H, // (js/sim.ts: the screens draw them so)
  cabGrid(items: any[][]) {
    const Gr = Gear, g = Gr.grid(this.CAB_W, this.CAB_H, ['med']);
    for (const [mt, n, x, y, r] of items) Gr.put(g, Gr.medItem(mt, n), x, y, r);
    return g;
  },
  cabItems(g: { items: Loose[] }) { return g.items.map((p: Loose) => [p.it.mt, p.it.n || 1, p.x, p.y, p.r ? 1 : 0]); },
  // [[mt, n]] laid into the grid (stacks first); returns the items, and what didn't fit in .left
  layCab(list: [string, number][], items: any[][] = []) {
    const Gr = Gear, g = this.cabGrid(items), left: [string, number][] = [];
    for (const [mt, n] of list) {
      const it = Gr.medItem(mt, n);
      for (const p of g.items) if (it.n > 0) Gr.mergeMed(it, p.it);
      if (it.n > 0) { const s = Gr.findSpot(g, it); if (s) Gr.put(g, it, s.x, s.y, s.rot); else left.push([mt, it.n]); }
    }
    const out: CabLayout = this.cabItems(g);
    out.left = left;
    return out;
  },
  cabCounts(items: any[][]) { return Sim.cabCounts(items); },
  // an officer's edit: what they took out and put in, and how they left it laid out
  cabEdit(cab: Cab, m: any) {
    const Gr = Gear, clean = (o: any): Record<string, number> => { const r: Record<string, number> = {}; for (const [k, v] of Object.entries(o || {})) if ((Med.ITEMS as Tbl)[k] && v > 0) r[k] = Math.min(20, Math.floor(+v) || 0); return r; };
    const take = clean(m.take), put = clean(m.put), have = this.cabCounts(cab.items), took: Record<string, number> = {}, deny: Record<string, number> = {};
    for (const [mt, n] of Object.entries(take)) { took[mt] = Math.min(n, have[mt] || 0); if (took[mt] < n) deny[mt] = n - took[mt]; }
    // the layout as they left it, if nothing changed under them and it adds up
    let lay: CabLayout | null = null;
    if (m.ver === cab.ver && !Object.keys(deny).length && Array.isArray(m.lay) && m.lay.length <= this.CAB_W * this.CAB_H) {
      const g = Gr.grid(this.CAB_W, this.CAB_H, ['med']), want = Object.assign({}, have);
      for (const [mt, n] of Object.entries(took)) want[mt] -= n;
      for (const [mt, n] of Object.entries(put)) want[mt] = (want[mt] || 0) + n;
      let ok = true;
      for (const e of m.lay) {
        const [mt, n, x, y, r] = Array.isArray(e) ? e : [];
        const it = (Med.ITEMS as Tbl)[mt] && Gr.medItem(mt, Math.floor(+n));
        if (!it || !(it.n >= 1 && it.n <= Gr.medStack(it)) || !Gr.fits(g, it, x | 0, y | 0, r ? 1 : 0)) { ok = false; break; }
        Gr.put(g, it, x | 0, y | 0, r ? 1 : 0); want[mt] -= it.n;
      }
      if (ok && Object.values(want).every((v) => v === 0)) lay = this.cabItems(g);
    }
    let ret: [string, number][] = [];
    if (!lay) { // re-laid here: what they took comes off the stacks, what they put in goes on (what doesn't fit goes back)
      const items = cab.items.map((e: any[]) => e.slice());
      for (const [mt, n0] of Object.entries(took)) { let n = n0; for (const e of items) if (e[0] === mt && n > 0) { const k = Math.min(n, e[1]); e[1] -= k; n -= k; } }
      lay = this.layCab(Object.entries(put), items.filter((e: any[]) => e[1] > 0));
      ret = lay.left!;
    }
    cab.items = lay; cab.ver++;
    return { took, deny, ret };
  },
  cabMsg() { return (this.cabs || []).map((c: Cab) => [c.open ? 1 : 0, c.items, c.ver]); },
  // The team locker: a TEAM_W x TEAM_H grid at the quartermaster's that the whole squad shares for the run.
  // items: [[tid, x, y, rot, packed item], ...]; ver counts changes. An officer sends how they left it: take
  // (the tids they took out), keep (where the rest now sit), put (what they put in, and where). Made against
  // the state as it is, it's taken as it is; against an older one, their takes and puts are merged into
  // what's there now (taking something already gone is denied, a put with no room left comes back).
  TEAM_W: Sim.TEAM_W, TEAM_H: Sim.TEAM_H,
  team: null as TeamLocker | null,
  teamMsg() { const t = this.team || { ver: 0, items: [] }; return { t: 'team', ver: t.ver, items: t.items }; },
  teamGrid() { const g = Gear.grid(this.TEAM_W, this.TEAM_H, null, 'Team locker'); g.locker = true; return g; },
  teamEdit(m: any) {
    const Gr = Gear, t = this.team || (this.team = { ver: 0, items: [] }), have = new Map<any, any[]>(t.items.map((e: any[]): [any, any[]] => [e[0], e]));
    const arr = (a: any) => (Array.isArray(a) ? a.slice(0, this.TEAM_W * this.TEAM_H) : []);
    const take = arr(m.take).map(String), keep = arr(m.keep).filter(Array.isArray), put = [];
    for (const e of arr(m.put)) { if (!Array.isArray(e)) continue; try { const it = Gr.unpack(e[4]); put.push([String(e[0]), e[1] | 0, e[2] | 0, e[3] ? 1 : 0, Gr.pack(it), it]); } catch (err) { /* not an item */ } }
    const deny = take.filter((tid) => !have.has(tid)), unpack = (e: any[]) => Gr.unpack(e[4]);
    let items = null;
    const ret = [];
    if (m.ver === t.ver && !deny.length && keep.length + take.length === have.size && keep.every((e: any[]) => have.has(String(e[0])))) {
      const g = this.teamGrid(), out: any[][] = [];
      let ok = true;
      for (const [tid, x, y, r] of keep) { const e = have.get(String(tid))!, it = unpack(e); if (!Gr.fits(g, it, x | 0, y | 0, r ? 1 : 0)) { ok = false; break; } Gr.put(g, it, x | 0, y | 0, r); out.push([e[0], x | 0, y | 0, r ? 1 : 0, e[4]]); }
      for (const [tid, x, y, r, pk, it] of ok ? put : []) { if (have.has(tid) || !Gr.fits(g, it, x, y, r)) { ok = false; break; } Gr.put(g, it, x, y, r); out.push([tid, x, y, r, pk]); }
      if (ok) items = out;
    }
    if (!items) { // merged into what's there now
      const g = this.teamGrid(), gone = new Set(take);
      items = t.items.filter((e: any[]) => !gone.has(e[0]));
      for (const e of items) Gr.put(g, unpack(e), e[1], e[2], e[3]);
      for (const [tid0, , , , pk, it] of put) {
        const s = Gr.findSpot(g, it), tid = have.has(tid0) ? tid0 + '+' : tid0;
        if (s) { Gr.put(g, it, s.x, s.y, s.rot); items.push([tid, s.x, s.y, s.rot ? 1 : 0, pk]); } else ret.push(pk);
      }
    }
    t.items = items; t.ver++;
    return { deny, ret };
  },
  // An attachments box's three, rolled when it's opened: attachments that go straight onto the weapon in the opener's
  // hands as it's built (Gunsmith.attachOptions), the lower tiers likelier; if that's fewer than three (or they had
  // nothing in their hands), the rest are attachments for anything, to carry
  rollAbox(code: string) {
    const GS = Gunsmith, def = code ? GS.fromCode(code) : null, out: string[] = [];
    const draw = (pool: Loose[]) => {
      while (out.length < 3 && pool.length) {
        let r = Math.random() * pool.reduce((a: number, p: Loose) => a + 1 / (p.tier || 1), 0), at = 0;
        for (; at < pool.length - 1; at++) { r -= 1 / (pool[at].tier || 1); if (r <= 0) break; }
        out.push(pool[at].id); pool = pool.filter((_: unknown, i: number) => i !== at);
      }
    };
    draw(def ? GS.attachOptions(def.id, def.build) : []);
    // (the rest, to carry, are never what would fit the gun as it left the factory but doesn't as it's built: a pistol in a carbine
    // chassis isn't offered its own slide's red dots or its frame light, which look meant for it and don't go on it)
    const near = new Set<string>(def ? GS.attachOptions(def.id, GS.defaultBuild(def.id)).map((p: Loose) => p.id) : []);
    draw(GS.LIST.filter((p: Loose) => !p.factory && !p.variant && !p.retired && !p.alt && !p.becomes && (p.tier || 1) <= 2 && !out.includes(p.id) && !near.has(p.id) && ['muzzle', 'fg', 'tac', 'optic', 'magnifier', 'stock'].includes(p.slot)));
    return out;
  },
  // [open, { player id: [their three part ids, the one they took (or null)] }] or null when the level has no box
  sboxMsg() { return this.map && this.map.sbox && this.sbox ? [this.sbox.s, this.sbox.by || 0] : null; }, // [the sticker, who took it]
  aboxMsg() {
    if (!this.map || !this.map.abox || !this.abox) return null;
    const u: Record<string, any> = {};
    for (const [id, e] of Object.entries(this.abox.uses)) u[id] = [e.items, e.taken];
    return [this.abox.open ? 1 : 0, u];
  },
  // [code (null when empty), mag, reserve, open, ammo type] or null when the level has no case
  caseMsg() { return !!this.caseOpen; },
  // the gun in the case, while it's still in it (its code: the screens get its model ready as the level starts), or null
  caseGun() { return this.wcase ? this.wcase.code : null; },
  toShop() {
    this.phase = 'shop';
    this.shopSeed = (Math.random() * 2 ** 31) | 0;
    this.stock = Shop.scaleStock(Shop.baseStock(this.level, this.shopSeed), this.players.size); // (as many of each as there are of you)
    this.liftT = null; this.snapT = 0;
    for (const p of this.players.values()) p.ready = false;
    SvNet.broadcast({ t: 'phase', phase: 'shop', level: this.level, shopSeed: this.shopSeed, report: SpaceData.ON ? null : this.report, stock: this.stock, sp: SpaceData.ON ? SpaceSv.shopMsg() : undefined });
    SvNet.broadcast(this.teamMsg());
    this.sendRoster();
  },
  // Everyone in the helicopter: it takes a few seconds to spin up (anyone who gets out stops it), then it's off to the map
  checkReady(go?: boolean) {
    if (this.phase !== 'shop' || this.players.size === 0) return;
    for (const p of this.players.values()) if (!p.ready) { this.liftT = null; return; }
    if (!go) { if (this.liftT == null) this.liftT = 3; return; }
    this.level++;
    this.toRoute(); // where next: the map
  },
  gameOver() {
    this.phase = 'gameover';
    const stats: Record<string, any> = {};
    for (const [id, p] of this.players) stats[id] = { name: p.name, color: p.color, animal: p.animal, sx: p.st ? p.st.sx : null };
    SvNet.broadcast({ t: 'phase', phase: 'gameover', level: this.level, stats });
  },
  toLobby() {
    this.phase = 'lobby';
    this.route = null; this.routeMap = null; this.theme = null;
    this.enemies.clear();
    for (const p of this.players.values()) p.ready = false;
    SvNet.broadcast({ t: 'phase', phase: 'lobby' });
    this.sendRoster();
  },

  // --------------------------------------------------------------- enemies
  spawnEnemies() {
    const L = this.level, np = Math.max(1, this.players.size), U = G_U;
    const big = this.map!.theme.big || 1, hold = this.report.stronghold, count = Math.min(Math.round((4 + Math.floor(L * 1.5) + (np - 1) * 2) * (this.map!.theme.foes || 1) * (hold ? 1.5 : 1)), (hold ? 44 : 32) * big); // (a bigger map: more of them, and room for more)
    const hpMult = 1 + 0.04 * (L - 1) + 0.1 * (np - 1);
    this.accMult = Math.min(1 + 0.03 * (L - 1), 1.5);
    this.dmgMult = 1 + 0.07 * (L - 1);
    const weights: [EnemyKind, number][] = [['suspect', 4], ['grunt', 2.5 + L * 0.2], ['rusher', 1 + L * 0.2], ['marksman', L >= 2 ? (0.8 + L * 0.15) * (this.map!.theme.lookouts || 1) : this.map!.theme.lookouts ? 0.6 : 0], ['heavy', L >= 3 ? 0.4 + L * 0.2 : 0]];
    const total = weights.reduce((a, w) => a + w[1], 0);
    // (a spot: [tx, tz] on the fine grid, and in a building of several floors its floor)
    let spots = U.shuffle(Math.random, this.map!.enemySpots.slice());
    const W = this.map!.W, unitOf = (sp: number[]) => { const ua = Level.floorMap(this.map!, sp[2] || 0).unitAt; return ua ? ua[sp[1] * W + sp[0]] : -1; };
    if (this.map!.unitAt) { // apartments: a spot in each one goes to the front of the list
      const first: number[][] = [], seen = new Set();
      for (const sp of spots) { const u = unitOf(sp); if (u >= 0 && !seen.has(u)) { seen.add(u); first.push(sp); } }
      spots = first.concat(spots.filter((sp) => !first.includes(sp)));
    } else if (this.map!.NF > 1 || this.map!.theme.starter) { // houses (and the corner store): a spot in every room indoors, on every floor (the basements and upstairs too), first
      const OUT = new Set(['yard', 'alley', 'lawn', 'road', 'lot', 'carpark']), rooms = this.map!.rooms;
      const roomOf = (sp: number[]) => rooms.findIndex((r: LvRoom) => (r.fl || 0) === (sp[2] || 0) && sp[0] >= r.x && sp[0] < r.x + r.w && sp[1] >= r.z && sp[1] < r.z + r.h);
      const first: number[][] = [], seen = new Set();
      for (const sp of spots) { const ri = roomOf(sp); if (ri >= 0 && !OUT.has(rooms[ri].type) && !seen.has(ri)) { seen.add(ri); first.push(sp); } }
      spots = first.concat(spots.filter((sp) => !first.includes(sp)));
    }
    this.unitsSeen = new Set(); // apartments an officer has been inside
    const used: number[][] = [], fy = (f?: number) => Level.floorMap(this.map!, f || 0).fy || 0;
    const close = (tx: number, tz: number, f?: number) => used.some(([ux, uz, uf]) => (uf || 0) === (f || 0) && Math.abs(ux - tx) + Math.abs(uz - tz) < 2 * Level.K);
    for (const [tx, tz, tf] of spots) {
      if (used.length >= count) break;
      if (close(tx, tz, tf)) continue;
      used.push([tx, tz, tf]);
      let roll = Math.random() * total, type: EnemyKind = 'grunt';
      for (const [ty, w] of weights) { if (roll < w) { type = ty; break; } roll -= w; }
      const se = this.addEnemy(type, (tx + 0.5) * Level.TS, (tz + 0.5) * Level.TS, hpMult, fy(tf));
      if (hold) se.drawn = true; // (a stronghold's suspects have their weapons out already, not holstered)
    }
    // a leader, one at most, from level 2: more likely the bigger the map and in a stronghold. He takes the place of the suspect furthest from the
    // helicopter (he stays back), so the count is the same.
    const lead = this.forceLeader || (L >= 2 && Math.random() < Math.min(0.9, (0.22 + 0.06 * L) * big * (hold ? 1.8 : 1)));
    if (lead) {
      const sp = this.map!.spawn || { x: 0, z: 0 };
      let far: Enemy | null = null, fd = -1;
      for (const o of this.enemies.values()) { const d = Math.hypot(o.x - sp.x, o.z - sp.z); if (!o.def.civ && !o.def.boss && d > fd) { fd = d; far = o; } }
      if (far) { this.enemies.delete(far.id); const le = this.addEnemy('leader', far.x, far.z, hpMult, far.y || 0); le.drawn = true; }
    }
    // civilians caught up in it (more at a festival: some of them hiding behind the stalls' counters; the other
    // stalls were left as they ran)
    const crowd = this.map!.theme.crowd || 1, civs = hold ? 0 : Math.min(Math.round((2 + Math.floor(L / 2)) * crowd), 8 * big), TS = Level.TS;
    let placed = 0;
    for (const s of hold ? [] : U.shuffle(Math.random, ((this.map as MapCivSpots).civSpots || []).slice())) {
      if (placed >= Math.ceil(civs * 0.6)) break;
      const tx = Math.floor(s.x / TS), tz = Math.floor(s.z / TS);
      if (this.map!.t[tz * this.map!.W + tx] !== 0 || close(tx, tz, 0)) continue;
      used.push([tx, tz]);
      const c = this.addEnemy('civ', s.x, s.z, 1);
      c.state = 'hide'; c.hide = { x: s.x, z: s.z, lean: 0 }; c.crouch = true; c.yaw = s.yaw; c.peekT = 1 + Math.random() * 3;
      placed++;
    }
    // the rest anywhere a suspect could be or in sight of the pad (js/level.ts landing), one in each room indoors first:
    // wherever it is, there's someone caught up in it
    let civAt = U.shuffle(Math.random, spots.concat(this.map!.lzSpots || []));
    if (this.map!.rooms) {
      const OUT = new Set(['yard', 'alley', 'lawn', 'road', 'lot', 'carpark']), rooms = this.map!.rooms;
      const roomOf = (sp: number[]) => rooms.findIndex((r: LvRoom) => (r.fl || 0) === (sp[2] || 0) && sp[0] >= r.x && sp[0] < r.x + r.w && sp[1] >= r.z && sp[1] < r.z + r.h);
      const first: number[][] = [], seen = new Set();
      for (const sp of civAt) { const ri = roomOf(sp); if (ri >= 0 && !(rooms[ri] as SvRoom).out && !OUT.has(rooms[ri].type) && !seen.has(ri)) { seen.add(ri); first.push(sp); } }
      civAt = first.concat(civAt.filter((sp) => !first.includes(sp)));
    }
    for (const [tx, tz, tf] of civAt) {
      if (placed >= civs) break;
      if (close(tx, tz, tf)) continue;
      used.push([tx, tz, tf]);
      this.addEnemy('civ', (tx + 0.5) * Level.TS, (tz + 0.5) * Level.TS, 1, fy(tf));
      placed++;
    }
    if (Route.isBoss(L) && !SpaceSv.st.M) {
      const ex = this.map!.extract;
      const b = this.addEnemy('warden', ex.x, ex.z, (1 + 0.5 * (Route.actOf(L) - 1)) * (1 + 0.35 * (np - 1)));
      b.guard = true;
    }
  },
  // The chance of each of a kind of armour (ENEMY_GEAR.odds) on someone dressed for level L, and one of them rolled (0: none)
  armourRoll(kind: ArmourKind, L: number) {
    const G2 = ENEMY_GEAR, at = G2.at, o = (G2.odds as Tbl)[kind];
    let i = 0; while (i < at.length - 2 && L >= at[i + 1]) i++;
    const f = G_U.clamp((L - at[i]) / (at[i + 1] - at[i]), 0, 1);
    let x = Math.random();
    for (let k = 0; k < o.ids.length; k++) { x -= o.by[i][k] + (o.by[i + 1][k] - o.by[i][k]) * f; if (x < 0) return o.ids[k]; }
    return 0;
  },
  // A suspect's kit for this level: a weapon from its type's pool and armour, at a gear tier around the level's.
  // The def is the type's, with the kit laid over it (weapon, its damage, pellets and rate of fire, armour).
  equip(type: EnemyKind) {
    const base = (ENEMIES as Tbl)[type], G2 = ENEMY_GEAR;
    if (base.civ || !(G2.weapons as Tbl)[type]) return base;
    // their grade: how strong they are within the level's tier (0-1). A low one is a tier down, a high one a tier up, and their armour's
    // as for a level or two back or on, by it (a smooth line, not just the tier's step); it ranks them too (addEnemy, teamForm)
    const g = Math.random(), tier = base.boss ? gearTier(this.level) : G_U.clamp(gearTier(this.level) + (g < 0.2 ? -1 : g > 0.88 ? 1 : 0), 1, 4);
    const pool = (G2.weapons as Tbl)[type][tier - 1], wpn = pool[Math.floor(Math.random() * pool.length)], w = WEAPONS[wpn];
    const kitL = Math.max(1, this.level + (base.boss ? 0 : (g - 0.54) * 5)); // (the weakest are dressed a couple of levels back, the strongest a couple on)
    const fixed = base.armor && (G2.fixed as Tbl)[base.armor];
    const d = Object.create(base);
    d.wpn = wpn; d.gear = tier; d.grade = g; d.pellets = w.pellets; d.snd = w.cls;
    d.vest = fixed ? fixed.vest[tier - 1] : this.armourRoll('vest', kitL) || 'none';
    d.helmet = fixed ? fixed.helmet[tier - 1] : this.armourRoll('helmet', kitL) || 'nohelm';
    // a mandible or a face shield on the helmet's mount (a helmet with a visor has its own; no helmet, nowhere to put one)
    d.face = d.helmet === 'ach' || d.helmet === 'riflehelm' ? (fixed && fixed.face ? fixed.face[tier - 1] || 0 : this.armourRoll('face', kitL)) : 0;
    // shoulder, pelvis and leg armour, on what a plate carrier can take
    d.ex = fixed ? (fixed.ex || [])[tier - 1] || [] : d.vest === 'steel' || d.vest === 'ceramic' ? (['shoulder', 'groin', 'legs'] as ArmourKind[]).map((k) => this.armourRoll(k, kitL)).filter(Boolean) : [];
    // a light and a laser on the gun, more often the better equipped they are (flags as an officer's: js/player.ts tacFlags).
    // No light on a night level: they see by the level's own light, and find you by sound and what gives you away (NIGHT)
    const tl = G2.tac, light = !this.night && this.level >= tl.lightFrom && (base.boss || Math.random() < tl.light[tier - 1]), laser = this.level >= tl.laserFrom && (base.boss || Math.random() < tl.laser[tier - 1]);
    d.tac = (light ? 1 | (tier >= 4 ? 8 : 0) : 0) | (laser ? 2 | (Math.random() < 0.35 ? 4 : 0) : 0);
    // automatic weapons fire at their own rate in the type's bursts; others as fast as the type works them
    // an Enforcer early on is less of a machine gunner: shorter bursts and a looser aim at the first two gear tiers (the guns too: ENEMY_GEAR)
    if (type === 'heavy' && tier <= 2) { d.burst = tier === 1 ? [3, 5] : [4, 8]; d.acc = base.acc * (tier === 1 ? 0.8 : 0.9); }
    if (base.rof) {
      if (w.mode === 'auto') d.rof = 60 / w.rpm;
      else { d.rof = Math.max(base.rof, 60 / w.rpm); d.burst = [1, w.shell || w.cls === 'SNP' ? 1 : 2]; }
    }
    return d;
  },
  // e's team's point man (giveShield), able and on e's floor; null if they've none (or e is him)
  pointOf(e: Enemy) {
    if (e.point || e.def.civ || e.team == null) return null;
    for (const o of this.enemies.values()) if (o !== e && o.point && o.team === e.team && this.able(o) && o.def.shield && Math.abs((o.y || 0) - (e.y || 0)) < 1.5) return o;
    return null;
  },
  // e's place behind their point man pm (k: their turn among those with him), on the line from the danger at (tx, tz) through him: the
  // first just behind his right shoulder, the next his left, the rest further back. Pulled in to him where a wall's in the way.
  behind(e: Enemy, pm: Enemy, tx: number, tz: number, k: number) {
    let ux = pm.x - tx, uz = pm.z - tz; const ud = Math.hypot(ux, uz) || 1; ux /= ud; uz /= ud;
    const back = k < 2 ? 0.75 : 1.25 + 0.5 * (k - 2), side = k === 0 ? 0.32 : k === 1 ? -0.32 : 0;
    let x = pm.x + ux * back - uz * side, z = pm.z + uz * back + ux * side;
    const y = (pm.y || 0) + 1.0, L = Level, map = this.map!;
    if (!L.los(map, pm.x, y, pm.z, x, y, z)) { x = pm.x + ux * 0.6; z = pm.z + uz * 0.6; }
    return { x, z };
  },
  // A shield man near e (not their own team's), in a fight, that e could get in behind when there's no cover for them: on their floor,
  // within 8 m and in sight, no nearer the police than e is by much, and with no more than two others in behind him already. Nearest.
  shieldNear(e: Enemy, st: PState) {
    const L = Level, map = this.map!, ey = (e.y || 0) + 1;
    let best: Enemy | null = null, bd = 8;
    const de = Math.hypot(e.x - st.p[0], e.z - st.p[2]);
    for (const o of this.enemies.values()) {
      if (o === e || !o.def.shield || (e.team != null && o.team === e.team) || !this.able(o) || !this.engaged(o) || Math.abs((o.y || 0) - (e.y || 0)) > 1.5) continue;
      const d = Math.hypot(o.x - e.x, o.z - e.z);
      if (d >= bd || Math.hypot(o.x - st.p[0], o.z - st.p[2]) < Math.min(4, de - 2)) continue;
      let n = 0; for (const b of this.enemies.values()) if (b !== e && b.shieldBy === o.id && this.able(b)) n++;
      if (n >= 2 || !L.los(map, e.x, ey, e.z, o.x, (o.y || 0) + 1, o.z)) continue;
      if (SpaceData.ON && SpaceSv.offLimits(e, o.x, o.z)) continue;
      best = o; bd = d;
    }
    return best;
  },
  // the shield man e has got in behind (shieldNear), while he's still fit, has a shield and is in the fight on their floor; else null
  lentShield(e: Enemy) {
    const o = e.shieldBy != null ? this.enemies.get(e.shieldBy) : undefined;
    return o && o.def.shield && this.able(o) && this.engaged(o) && Math.abs((o.y || 0) - (e.y || 0)) < 1.5 ? o : null;
  },
  // e's turn behind a shield man pm they've borrowed: after his own team (pointIdx), then the others in behind him, by id
  lentIdx(e: Enemy, pm: Enemy) {
    let k = 0;
    for (const o of this.enemies.values()) if (o !== e && o !== pm && this.able(o) && ((pm.team != null && o.team === pm.team) || (o.shieldBy === pm.id && o.id < e.id))) k++;
    return k;
  },
  // their turn among their point man's team (by id: steady from tick to tick)
  pointIdx(e: Enemy, pm: Enemy) { let k = 0; for (const o of this.enemies.values()) if (o !== e && o !== pm && o.team === pm.team && this.able(o) && o.id < e.id) k++; return k; },
  // A handheld shield (js/data.ts SHIELDS) for e, their team's designated point man: on the left arm, a pistol in the right (a long gun
  // swapped for one), slowed by its weight. He's first in his team's stack (dispatchGroup), leads them on the move with the rest in file
  // behind him (orderStep: follow), and in a fight they get in behind him (think: behindShield) and shoot over him as he kneels.
  giveShield(e: Enemy, id: string) {
    const sd = SHIELDS[id]; if (!sd || e.def.civ) return;
    const d = e.def;
    if (!WEAPONS[d.wpn] || WEAPONS[d.wpn].slot !== 's') { const w = WEAPONS.g19 ? 'g19' : 'p9'; d.wpn = w; d.snd = WEAPONS[w].cls; d.pellets = WEAPONS[w].pellets; d.rof = ENEMIES.suspect.rof; d.burst = ENEMIES.suspect.burst; } // (a pistol's cadence, the armed suspect's: d is over the archetype, so an undefined here would hide its own, not fall back to it)
    d.shield = id; d.speed = d.speed * sd.speed; e.point = true;
    if (e.wear === 'navy') d.tac = (d.tac || 0) | 2 | 4; // (a navy's: a green laser on the pistol)
  },
  addEnemy(type: EnemyKind, x: number, z: number, hpMult: number, y = 0) {
    if (this.map && this.map.terrain) y = Level.groundHeight(this.map, x, z); // (on the ground where it rolls, high or low: the Sandia Crest's)
    const def = this.equip(type);
    const e: Enemy = {
      id: this.nextEid++, type, def, x, z, yaw: Math.random() * Math.PI * 2,
      hp: def.hp * hpMult, maxHp: def.hp * hpMult, alert: false, spot: 0, tgt: null, tgtD: 99, canSee: false,
      percT: Math.random() * 0.3, cool: 1, burstLeft: 0, aiming: false, aimT: 0, strafe: 0, strafeT: 0,
      idleT: Math.random() * 3, idleYaw: 0, pendingAlert: -1, lostT: 0, lastHit: null,
      cover: null, inCover: false, peek: false, peekT: 0, coverT: Math.random(), coverStuck: 0, crouch: false,
      nadeT: 4 + Math.random() * 6, lastSeen: null,
      morale: def.morale != null ? def.morale : 0.5, broken: false, noise: null, holding: false,
      bold: !def.civ && !def.boss && !def.aimTime && !def.timid && type !== 'rusher' && Math.random() < 0.2 + (def.morale || 0) * 0.5, // (goes and looks: doorPeek)
      // the magazine in their gun (a part-used one, sometimes), and injuries (see injure)
      mag: 0, magMax: 0, reloadT: 0, bleedH: 0, bleedL: 0, clotT: 0, legs: 0, arms: 0, lung: false,
      // unaware suspects carry their weapon holstered/slung; drawing it takes def.draw seconds
      drawn: !def.civ && !!def.ready, drawT: 0, surprisedT: 0, suspicious: false, calmT: 0,
      state: 'normal', armed: !def.civ, shouts: 0, complyCd: 0, suppressT: 0, doorWait: 0, leanOut: 0,
      runner: !!def.civ && Math.random() < 0.3, home: { x, y, z }, walkTo: null, fleeT: 0, fake: false, fakeT: 0,
      y, // the floor under their feet (on the stairs: the step they're on)
    };
    if (!def.civ) { e.grade = def.grade != null ? def.grade : 0.5; e.rank = e.grade! + (def.leader ? 1 : 0); }
    const w = !def.civ && WEAPONS[def.wpn];
    if (w && w.mag > 0 && !w.explosive) { e.magMax = w.mag; e.mag = Math.random() < 0.25 ? Math.max(1, Math.ceil(w.mag * (0.3 + Math.random() * 0.6))) : w.mag; }
    if (this.map) Level.resolve(this.map, e, 0.38 * def.scale, y, World.STEP); // (spots are cell centres: clear of the walls beside them)
    if (this.map) e.yaw = this.openYaw(e, e.yaw); // (facing into the room, not the wall: a gun at the ready would go through it)
    this.enemies.set(e.id, e);
    return e;
  },
  // How far someone can go straight ahead facing `yaw` (to the first thing in the way at the knee or the chest),
  // up to max.
  roomAhead(e: Enemy, yaw: number, max: number) {
    const w = this.map && this.map.world;
    if (!w) return max;
    const dx = -Math.sin(yaw), dz = -Math.cos(yaw), y = e.y || 0;
    return Math.min(World.raycast(w, e.x, y + 0.5, e.z, dx, 0, dz, max, { move: true }).t, World.raycast(w, e.x, y + 1.3, e.z, dx, 0, dz, max, { move: true }).t);
  },
  // A way to face with room in front (not nose to a wall, a gun held out through it): yaw itself if it has, else
  // the roomiest of a few tries within spread of it.
  openYaw(e: Enemy, yaw: number, spread = Math.PI * 2) {
    let best = yaw, room = -1;
    for (let k = 0; k < 6; k++) {
      const a = k ? yaw + (Math.random() - 0.5) * spread : yaw, d = this.roomAhead(e, a, 1.5);
      if (d >= 1.5) return a;
      if (d > room) { room = d; best = a; }
    }
    return best;
  },
  // Somewhere to amble to, near where they started: a few steps along a way with room to walk it (not toward a
  // point behind a wall, to stand pressed against the wall till they give up), or null to stay put.
  // On the way to a spot (by a flow field to it, its own or one shared by everyone going to the same room): a step, true; there, false
  // nothing solid between someone's middle and a place at the same height (a wall, a shut door)
  clearTo(e: Enemy, g: { x: number; y?: number; z: number }) { return Level.los(this.map!, e.x, (e.y || 0) + 1.0, e.z, g.x, (g.y || 0) + 1.0, g.z); },
  travel(e: Enemy, g: { x: number; y: number; z: number; flow?: Int16Array }, speed: number, dt: number) {
    const L = Level, U = G_U, map = this.map!, d = Math.hypot(g.x - e.x, g.z - e.z);
    if (d < 0.4) return false;
    if (!g.flow) g.flow = L.flow(map, [L.src(map, g.x, g.y, g.z)]);
    // (straight there once it's near and nothing's in the way; else the way round: a post just through a wall from them is no nearer)
    const step = d > 3 || !this.clearTo(e, g) ? L.flowStep(map, g.flow, e.x, e.z, e.y) : null, tx = step ? step.x : g.x, tz = step ? step.z : g.z, dx = tx - e.x, dz = tz - e.z, dd = Math.hypot(dx, dz) || 1;
    e.idleYaw = Math.atan2(-dx, -dz); e.yaw += U.angDiff(e.yaw, e.idleYaw) * Math.min(1, dt * 6);
    // (no nearer in a second and a half: someone's in the way, say in a doorway they both want through: a step aside, and on again)
    const c = this.clock, tp = e.trv && e.trv.g === g ? e.trv : (e.trv = { g, best: d, at: c, side: 0, sx: 0, sz: 0 });
    if (d < tp.best - 0.3) { tp.best = d; tp.at = c; }
    else if (c - tp.at > 1.5) { const k = Math.random() < 0.5 ? 1 : -1; tp.sx = -dz / dd * k; tp.sz = dx / dd * k; tp.side = c + 0.7; tp.at = c; tp.best = d; }
    if (tp.side > c) { this.moveEntity(e, tp.sx, tp.sz, speed * 0.7, dt); return true; }
    this.moveEntity(e, dx / dd, dz / dd, speed, dt);
    return true;
  },
  amble(e: Enemy) {
    for (let k = 0; k < 4; k++) {
      const a = Math.random() * Math.PI * 2, want = 0.6 + Math.random() * 1.9;
      const r = Math.min(want, this.roomAhead(e, a, want + 0.8) - 0.8);
      if (r < 0.5) continue;
      const x = e.x - Math.sin(a) * r, z = e.z - Math.cos(a) * r;
      if (Math.hypot(x - e.home.x, z - e.home.z) <= 2.5) return { x, z };
    }
    return null;
  },
  draw(e: Enemy) {
    if (e.def.civ || !e.armed || e.drawn) return;
    e.drawn = true;
    e.drawT = e.def.draw || 0.8;
  },
  alertEnemy(e: Enemy, spread: boolean, heardOnly?: boolean) {
    const was = e.alert;
    if (heardOnly && !e.alert && !e.def.ready && !e.def.boss && !e.post && Math.random() < 0.55) e.lurk = true; // hides first, draws when it sees you (not someone posted: they hold their post)
    else { e.lurk = false; this.draw(e); }
    if (!e.alert) {
      e.alert = true;
      e.cool = Math.max(e.cool, 0.8 + Math.random() * 0.9); // hesitate before the first shot
    }
    if (spread) {
      const field = this.soundField(e.x, e.z, e.y);
      for (const o of this.enemies.values()) {
        if (!o.alert && !o.def.civ && o.pendingAlert < 0 && this.heardAt(field, o.x, o.z, o.y) < 12) o.pendingAlert = 0.4 + Math.random() * 0.6;
      }
    }
    // a leader who's been brought into it (seen them, been shot at) calls it in, on where he knows they are (or the nearest of them)
    if (this.leads(e) && !was && !e.down) {
      const at = e.lastSeen || e.noise || this.nearestOfficer(e);
      if (at) this.callIn(e, at.x, (at as { y?: number }).y || e.y || 0, at.z, 'spotted police');
    }
  },
  // Sound travels through the building, not through walls: distance in metres along walkable tiles from
  // the source, where a closed door adds 10 m (muffled) and walls stop it. In a building of several floors it
  // goes up and down the stairs, straight up or down through a drop (a stairwell, a loft's living room), and
  // through a floor, heavily muffled (another 15 m: a shot overhead is heard, footsteps aren't). Cached per
  // source cell (and floor) + door state. y: the source's height.
  soundField(x: number, z: number, y = 0) {
    const map = this.map!, L = Level, TS = L.TS, W = map.W, H = map.H, WH = W * H, floors = map.floors || [map], NF = floors.length;
    const sx = G_U.clamp(Math.floor(x / TS), 0, W - 1), sz = G_U.clamp(Math.floor(z / TS), 0, H - 1), f0 = L.floorAt(map, x, y, z);
    const key = f0 * WH + sz * W + sx + '|' + (map.doorVer || 0);
    if (!this._sound || this._sound.map !== map) this._sound = { map, cache: new Map() };
    const hit = this._sound.cache.get(key);
    if (hit) return hit;
    // distances counted in cells (whole numbers, for the bucket queue), returned in metres by heardAt
    const MAXD = Math.round(60 / TS), DOOR = Math.round(10 / TS), SLAB = Math.round(15 / TS), dist = new Float32Array(NF * WH).fill(Infinity), buckets: number[][] = [];
    const links = map.floors ? L.nav(map).links : null;
    const push = (n: number, d: number) => { if (d < dist[n] && d <= MAXD) { dist[n] = d; (buckets[d] || (buckets[d] = [])).push(n); } };
    push(f0 * WH + sz * W + sx, 0);
    for (let d = 0; d <= MAXD; d++) {
      const b: number[] = buckets[d];
      if (!b) continue;
      for (const n of b) {
        if (dist[n] !== d) continue;
        const f = (n / WH) | 0, i = n - f * WH, fm = floors[f], t = fm.t, tx = i % W, tz = (i / W) | 0;
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = tx + ox, nz = tz + oz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
          const j = nz * W + nx, v = t[j];
          if (v === 1) continue; // walls stop it (crates don't)
          let cost = 1;
          if (v === 3) { const dd = fm.doorAt.get(j); if (dd && !dd.open) cost += DOOR; }
          push(f * WH + j, d + cost);
        }
        if (NF === 1 || t[i] === 1) continue;
        for (const m of (links && links.get(n)) || []) push(m, d + 1); // up or down a flight
        // straight up or down: through a drop, or (muffled) through the floor
        if (f + 1 < NF) { const u = floors[f + 1].t[i]; if (u !== 1) push(n + WH, d + (u === 5 ? 1 : SLAB)); }
        if (f > 0 && floors[f - 1].t[i] !== 1) push(n - WH, d + (t[i] === 5 ? 1 : SLAB));
      }
    }
    if (this._sound.cache.size > 48) this._sound.cache.clear();
    this._sound.cache.set(key, dist);
    return dist;
  },
  // how far (metres, through the building) a sound is from (x, y, z), from its field
  heardAt(field: Float32Array, x: number, z: number, y = 0) {
    const L = Level, TS = L.TS, map = this.map!, f = map.floors ? L.floorAt(map, x, y, z) : 0;
    return field[f * map.W * map.H + G_U.clamp(Math.floor(z / TS), 0, map.H - 1) * map.W + G_U.clamp(Math.floor(x / TS), 0, map.W - 1)] * TS;
  },
  hear(x: number, z: number, radius: number, y = 0) {
    const field = this.soundField(x, z, y);
    for (const e of this.enemies.values()) {
      if (this.heardAt(field, e.x, e.z, e.y) > radius) continue;
      if (e.def.civ) { this.panic(e, { x, z }); continue; }
      if (e.state === 'normal') { e.noise = { x, z }; e.noiseAt = this.clock; this.noted(e, x, y, z); }
      // (searching in the dark on their own: a new noise somewhere else is where they look now)
      const o = e.order;
      if (o && o.own && e.state === 'normal' && this.clock - o.rt > this.NIGHT.RT_GAP && Math.hypot(x - o.x, z - o.z) > this.NIGHT.RETARGET) { this.retarget(e, { x, y, z }); o.ring = 0; o.until = Math.max(o.until, this.clock + this.NIGHT.SEARCH_T * 0.5); }
      if (this.leads(e) && e.state === 'normal' && !e.down) this.callIn(e, x, y, z, 'heard a noise');
      if (!e.alert && e.state === 'normal') e.pendingAlert = e.pendingAlert >= 0 ? e.pendingAlert : 0.2 + Math.random() * 0.5;
    }
  },
  // Rounds passing close by, or smacking into things next to them: suspects flinch into cover and shoot
  // worse. Suppression (e.sup, 0..1) builds with every round, more the closer it comes (a round past the ear
  // counts for a lot, one a couple of metres off for little), so sustained close fire pins them; it wears off
  // over a few seconds. It costs them up to 60% of their accuracy.
  // It reaches them when the round does, or its report if that's first (a subsonic round's), and then it takes a person
  // a moment to react, 100 to 200 ms, mostly about 150, a startle's time: nothing changes in them till then, so a
  // shot they're taking still goes. What the shooter fired is told here, and each suspect it passes close to gets it
  // from e.supQ ([when, how close]) in their own time: nearMiss.
  SOUND: 343, REACT: [0.1, 0.2],
  suppress(f: number[], to: number[], def: any, am?: string) {
    const ax = f[0], ay = f[1], az = f[2], bx = to[0] - ax, by = to[1] - ay, bz = to[2] - az, len2 = bx * bx + by * by + bz * bz || 1;
    const v0 = def ? roundSpeed(def, am) : 0;
    for (const e of this.enemies.values()) {
      if (e.def.civ || e.state !== 'normal') continue;
      const ey = (e.y || 0) + 1.2 * e.def.scale, t = G_U.clamp(((e.x - ax) * bx + (ey - ay) * by + (e.z - az) * bz) / len2, 0, 1);
      const miss = Math.hypot(ax + bx * t - e.x, ay + by * t - ey, az + bz * t - e.z);
      if (miss >= 2.2) continue;
      const d = t * Math.sqrt(len2), v = def ? (v0 + roundSpeed(def, am, d)) / 2 : 0; // (its average speed over the way there)
      const react = this.REACT[0] + (this.REACT[1] - this.REACT[0]) * (Math.random() + Math.random()) / 2;
      (e.supQ = e.supQ || []).push([(this.clock || 0) + d / Math.max(this.SOUND, v) + react, miss]);
    }
  },
  // A round's gone past. Close enough to feel it, they get down where they stand, out of a peek, for a moment. Then they
  // have a moment up before the next can do it: fire keeps them rattled, but no one gun holds anyone down for good. A
  // boss and a rusher, who never take cover, take it on their feet.
  FLINCH: { R: 1.5, T: 0.35, SUP: 0.4, UP: 0.5 },
  // coming out of cover to shoot: how long before they can fire (their body's still coming out: js/views.ts), and the
  // least they stay out, from when they start, whether or not the shot's done
  PEEK: { UP: 0.7, MIN: 1.5 },
  nearMiss(e: Enemy, miss: number) {
    const F = this.FLINCH;
    e.sup = Math.min(1, (e.sup || 0) + 0.12 + 0.3 * (1 - miss / 2.2));
    e.suppressT = Math.max(e.suppressT, 1.2 + 2 * e.sup);
    // a burst is frightening, but not once per round: at most one morale hit every 0.35 s
    if (this.clock - (e.supAt || -9) > 0.35) { e.morale -= 0.06 * (e.def.steady || 1); e.supAt = this.clock; }
    this.alertEnemy(e, false);
    if (miss < F.R && !e.def.boss && e.type !== 'rusher' && this.clock >= (e.flinchOk || 0)) {
      e.flinchT = F.T + F.SUP * e.sup; e.flinchOk = this.clock + e.flinchT + F.UP;
      e.peek = false; e.aiming = false;
    }
  },
  suspect(e: Enemy, x: number, z: number) {
    if (e.def.civ || e.alert || e.state !== 'normal') return;
    e.suspicious = true;
    e.calmT = 20;
    e.noise = { x, z };
    this.draw(e);
  },
  // Footsteps: louder the faster you move (lowered weapon > walk > steadied), quieter crouched; they
  // carry along the building (around corners, muffled by shut doors) rather than through walls. Unaware suspects who hear you get suspicious instead of being caught off guard.
  footsteps(alive: LivePlayer[]) {
    for (const p of alive) {
      const mv = p.st.mv || 0;
      // by how you're moving, not raw speed (kit weight changes speed, not how carefully you place your feet)
      let r = mv < 0.4 ? 0 : p.st.lr ? 9 : p.st.sd ? 2 : 5;
      if (p.st.cr) r *= 0.6;
      if (!r) continue;
      const [px, py, pz] = p.st.p;
      const field = this.soundField(px, pz, py);
      for (const e of this.enemies.values()) {
        if (e.def.civ || e.state !== 'normal') continue;
        const hd = this.heardAt(field, e.x, e.z, e.y);
        if (hd <= r * (e.bold ? this.DOORPEEK.LISTEN : 1) && !p.st.sd) this.noted(e, px, py, pz); // (a bold one's listening: a shut door doesn't hide a walk, a crouched step still gets past)
        if (hd <= r) this.suspect(e, px, pz);
      }
    }
  },
  panic(e: Enemy, src?: { x: number; z: number }) {
    if (e.state !== 'normal') return;
    e.threat = src || this.nearestOfficer(e);
    // many duck behind something and peek out, exactly like a suspect in cover; the rest run or freeze
    const r = Math.random();
    if (r < (e.runner ? 0.3 : 0.5) && this.seekHide(e)) { e.state = 'hide'; return; }
    e.state = e.runner || r > 0.75 ? 'flee' : 'cower';
    e.fleeT = 3 + Math.random() * 3;
  },
  nearestOfficer(e: Enemy) {
    let best = null;
    for (const p of this.players.values()) {
      if (!p.st || p.st.dn || p.st.dd) continue;
      const d = Math.hypot(p.st.p[0] - e.x, p.st.p[2] - e.z);
      if (!best || d < best.d) best = { x: p.st.p[0], z: p.st.p[2], d };
    }
    return best;
  },

  // ---------------------------------------------------------------- hiding (civilians and suspects alike)
  // A spot out of sight of the danger: crouched behind furniture, or standing round a wall edge where
  // leaning out gives a look. Nobody shares a spot.
  findHide(e: Enemy, from: { x: number; y?: number; z: number }) {
    const L = Level, map = this.map!, TS = L.TS;
    let best: HideSpot | null = null, bs = 1e9;
    const taken = (x: number, z: number) => { for (const o of this.enemies.values()) if (o !== e && ((o.hide && Math.hypot(o.hide.x - x, o.hide.z - z) < 1.1) || (o.cover && Math.hypot(o.cover.x - x, o.cover.z - z) < 1.1))) return true; return false; };
    const ey = e.y || 0, fy = from.y || 0, here = (q: { x: number; y?: number; z: number }) => Math.abs((q.y || 0) - ey) < 1.5 && !(SpaceData.ON && SpaceSv.offLimits(e, q.x, q.z)); // (a spot on their own floor; not in the room a ship's people are sheltering in, unless they're one of them: js/spaceserver.ts)
    for (const c of map.cover as FlPt[]) {
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      if (d > 14 || !here(c)) continue;
      const score = d - Math.hypot(c.x - from.x, c.z - from.z) * 0.35, cy = c.y || 0;
      if (score >= bs || L.los(map, from.x, fy + 1.5, from.z, c.x, cy + 0.75, c.z) || taken(c.x, c.z)) continue;
      best = { x: c.x, y: cy, z: c.z, lean: 0, fl: c.fl || 0 }; bs = score;
    }
    let tried = 0;
    for (const w of map.wallSpots as FlPt[]) {
      const d = Math.hypot(w.x - e.x, w.z - e.z);
      if (d > 12 || tried > 40 || !here(w)) continue;
      const fd = Math.hypot(w.x - from.x, w.z - from.z) || 1, score = d - fd * 0.35 + 1, wy = w.y || 0;
      if (score >= bs) continue;
      tried++;
      if (L.los(map, from.x, fy + 1.5, from.z, w.x, wy + 1.4, w.z) || taken(w.x, w.z)) continue;
      const nx = -(from.z - w.z) / fd, nz = (from.x - w.x) / fd;
      for (const side of [1, -1]) {
        const px = w.x + nx * side * 0.55, pz = w.z + nz * side * 0.55;
        if (L.tile(L.floorMap(map, w.fl || 0), Math.floor(px / TS), Math.floor(pz / TS)) !== 0 || !this.leanClear(w.x, w.z, px, pz, 1.5, wy) || !L.los(map, px, wy + 1.5, pz, from.x, fy + 1.4, from.z)) continue;
        best = { x: w.x, y: wy, z: w.z, lean: side, fl: w.fl || 0 }; bs = score;
        break;
      }
    }
    return best;
  },
  seekHide(e: Enemy) {
    const from = e.threat || this.nearestOfficer(e);
    const spot = from && this.findHide(e, from);
    e.hide = spot || null;
    e.peeking = false; e.peekT = 1 + Math.random() * 2;
    return !!spot;
  },
  // Run to the spot; once there, stay down and every few seconds pop up (or lean out round the edge) to
  // look toward the danger, now and then moving somewhere else. Returns false if they can't get there.
  hideStep(e: Enemy, dt: number, speed: number) {
    const h = e.hide!, U = G_U, L = Level;
    const d = Math.hypot(h.x - e.x, h.z - e.z);
    if (d > 0.3) {
      if (!h.flow) h.flow = L.flow(this.map!, [L.src(this.map!, h.x, h.y!, h.z)]);
      const step = d > 1.6 ? L.flowStep(this.map!, h.flow, e.x, e.z, e.y) : null;
      const tx = step ? step.x : h.x, tz = step ? step.z : h.z, dx = tx - e.x, dz = tz - e.z, dd = Math.hypot(dx, dz) || 1;
      e.yaw += U.angDiff(e.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
      e.crouch = d < 2.5; e.leanOut = 0; // ducks as they get there
      const ox = e.x, oz = e.z;
      this.moveEntity(e, dx / dd, dz / dd, speed * (e.crouch ? 0.7 : 1), dt);
      h.stuck = Math.hypot(e.x - ox, e.z - oz) < speed * dt * 0.2 ? (h.stuck || 0) + dt : 0;
      if (h.stuck > 2) { e.hide = null; return false; }
      return true;
    }
    e.peekT -= dt;
    if (e.peekT <= 0) {
      e.peeking = !e.peeking;
      e.peekT = e.peeking ? this.PEEK.MIN + Math.random() * 1.1 : 2 + Math.random() * 3.5;
      if (!e.peeking && Math.random() < 0.15) e.relocate = true;
    }
    const look = e.threat;
    if (look) e.yaw += U.angDiff(e.yaw, Math.atan2(-(look.x - e.x), -(look.z - e.z))) * Math.min(1, dt * 4);
    e.crouch = h.lean ? false : !e.peeking;
    e.leanOut = e.peeking && h.lean ? h.lean : 0;
    return true;
  },
  // A round struck what holds a door. Its handle gone, the latch lets go and it swings open; all its hinges gone, nothing's holding
  // it up, and it falls (js/damage.ts: the same fall for everyone, from what's said here).
  doorHit(d: Door, pt: string | number, J: any, dir: any) {
    if (d.fallen || Level.sturdy(d) || !(pt === 'h' || pt === 0 || pt === 1 || pt === 2) || !Array.isArray(dir)) return;
    const hp = d.hp || (d.hp = { h: Damage.PARTS.handle, 0: Damage.PARTS.hinge, 1: Damage.PARTS.hinge, 2: Damage.PARTS.hinge });
    if (hp[pt] <= 0) return;
    hp[pt] -= Math.max(0, +J || 0);
    if (hp[pt] > 0) return;
    SvNet.broadcast({ t: 'dpart', i: d.id, pt });
    if (pt === 'h' && !d.open) this.setDoor(d.id, true, true);
    if (hp[0] <= 0 && hp[1] <= 0 && hp[2] <= 0) {
      const fall: [number, number[], number] = [d.open ? 1 : 0, [dir[0], dir[1]], (Math.random() * 1e9) | 0];
      (this.fallen = this.fallen || []).push([d.id, ...fall]);
      Damage.fall(this.map as unknown as DamageMap, d as any, ...fall); // (server's door record: the same object damage.ts types as its Door)
      SvNet.broadcast({ t: 'dfall', i: d.id, f: fall });
    }
  },
  setDoor(id: number, open: boolean, kicked?: boolean) {
    const d = this.map && this.map.doors[id];
    if (!d || d.open === open || d.fallen) return;
    d.open = open;
    World.door(this.map!.world, this.map, d);
    this.map!.doorVer = (this.map!.doorVer || 0) + 1; // sound paths change
    SvNet.broadcast({ t: 'door', i: id, o: open ? 1 : 0, k: kicked ? 1 : 0 });
  },
  // the level clears when every living person — suspect or civilian — is restrained (the dead count as resolved)
  // Dynamic entry: the door slams open, loud. Unaware suspects right behind it are startled; those already
  // alert lose a beat; everyone in earshot is alerted; civilians panic.
  kickDoor(d: Door) {
    this.setDoor(d.id, true, true);
    // a double door: both leaves go (the second leaf is the one flagged mirror, right after its partner)
    const partner = d.mirror ? this.map!.doors[d.id - 1] : this.map!.doors[d.id + 1] && this.map!.doors[d.id + 1].mirror ? this.map!.doors[d.id + 1] : null;
    if (partner) this.setDoor(partner.id, true, true);
    const field = this.soundField(d.x, d.z, d.fy || 0);
    for (const e of this.enemies.values()) {
      const hd = this.heardAt(field, e.x, e.z, e.y);
      if (hd > 16) continue;
      if (e.def.civ) { this.panic(e, { x: d.x, z: d.z }); continue; }
      if (e.state !== 'normal') continue;
      if (hd <= 6) {
        if (!e.alert) { this.alertEnemy(e, false); e.surprisedT = 1.2 + Math.random() * 0.6; }
        else e.cool = Math.max(e.cool, 0.6);
      } else if (!e.alert) e.pendingAlert = e.pendingAlert >= 0 ? e.pendingAlert : 0.3 + Math.random() * 0.5;
    }
  },
  // (a suspect down and bleeding out is dealt with: they never get up again. A civilian down still needs rescuing.)
  remaining(civ: boolean | null = null) { let n = 0; for (const e of this.enemies.values()) if (e.state !== 'cuffed' && !(e.down && !e.def.civ) && (civ === null || !!e.def.civ === civ) && !(e.ally && civ === false)) n++; return n; }, // (ally: armed, and on the squad's side: not one of the hostiles left)
  openBodies() { let n = 0; for (const b of this.bodies.values()) if (!b.secured) n++; return n; },
  openEvidence() { let n = 0; for (const v of this.evidence) if (!v.secured && !v.taken) n++; return n; },
  // Objectives. "Bring Order to Chaos" (required): every suspect zip-tied, down or dead. "Rescue All of the
  // Civilians" (optional, a bonus): every civilian secured alive. Bodies and evidence pay too. Once order is
  // restored the squad can vote to leave (Y); the level ends when every officer still alive has voted.
  checkClear() {
    const left = this.remaining(false);
    if (SpaceSv.st.M) return; // (a mission isn't left by a vote: the ship leaves, js/spaceserver.ts)
    if (left === 0 && !this.extract.active) { this.extract.active = true; SvNet.broadcast({ t: 'clear' }); }
  },
  // every civilian secured, none killed
  allRescued() { return !this.report.stronghold && this.remaining(true) === 0 && !this.report.civKilled; }, // (a stronghold has none to rescue: no bonus for it)

  // "POLICE! SHOW ME YOUR HANDS!" Everyone in earshot and sight rolls to comply.
  shout(p: LivePlayer, from: string) {
    const [px, py, pz] = p.st.p, ey = py + (p.st.pr ? 0.36 : p.st.cr ? 1.0 : 1.6), map = this.map!, L = Level;
    const officers = [...this.players.values()].filter((q: Player) => q.st && !q.st.dn && !q.st.dd) as LivePlayer[];
    let complied = 0;
    for (const e of this.enemies.values()) {
      if (!(e.state === 'normal' || e.state === 'cower' || e.state === 'flee' || e.state === 'hide') || e.ally) continue; // (ally: on the squad's side, not theirs to order about)
      const d = Math.hypot(e.x - px, e.z - pz);
      const eh = (e.y || 0) + 1.4 * e.def.scale;
      if (d > 16 || e.complyCd > 0 || !L.los(map, px, ey, pz, e.x, eh, e.z)) continue;
      e.complyCd = 1.0;
      let chance;
      if (e.def.civ) chance = e.runner ? 0.35 : 0.9;
      else {
        // Caught off guard with the weapon still holstered: very likely to give up. Gun already up and
        // feeling brave: unlikely. Hurt, pinned down, outnumbered, broken or yelled at repeatedly all help.
        const seen = officers.filter((q: LivePlayer) => L.los(map, q.st.p[0], q.st.p[1] + 1.5, q.st.p[2], e.x, eh, e.z)).length;
        const surprised = e.surprisedT > 0 || !e.alert;
        chance = e.def.comply
          + (surprised ? 0.4 : 0)
          + (!e.drawn ? 0.3 : e.drawT > 0 ? 0.05 : -0.15) // holstered / still drawing / gun up
          + 0.5 * (1 - (e.str == null ? 1 : e.str)) + (e.collapsed ? 0.3 : 0) + (e.suppressT > 0 ? 0.15 : 0) + (e.broken ? 0.3 : 0) // weakened: losing the will to fight
          + 0.08 * Math.min(3, e.shouts) + 0.08 * Math.max(0, seen - 1) - (d > 10 ? 0.1 : 0) + (e.flashT! > 0 ? 0.35 : e.flashRec! > 0 ? 0.2 : 0) // (dazed by a flashbang: in no state to argue)
          - Math.max(0, e.morale - 0.5) * 0.8 - (e.def.hunt && e.drawn ? 0.15 : 0)
          + (this.clock - (e.noLead || -99) < 60 ? 0.15 : 0); // (their leader's down: no one's telling them what to do)
        chance = e.def.comply ? G_U.clamp(chance, 0, e.collapsed ? 0.97 : 0.92) : 0; // never a sure thing
        // Braver together: with armed friends around who can see them, almost nobody gives up. And anyone
        // who's already been shooting at you, or who faked a surrender and went back for a weapon, is past
        // being talked down (unless they're breaking or badly weakened). Bleeding out on the floor, friends
        // count for little.
        const weak = e.collapsed ? 1 : G_U.clamp(1 - (e.str == null ? 1 : e.str) / 0.6, 0, 1);
        chance *= G_U.lerp([1, 0.3, 0.08, 0.03][Math.min(3, this.allies(e))], 1, weak * 0.85);
        const shaken = e.broken || e.collapsed || (e.str != null && e.str < 0.5) || e.flashT! > 0 || e.flashRec! > 0;
        if (!shaken && (this.clock - (e.firedAt || -99) < 30 || e.emboldened)) chance *= 0.1;
        e.shouts++;
      }
      if (!e.def.civ && e.flashT! > 0 && e.def.comply != null && !e.def.boss) chance = Math.max(chance, this.FLASH.SHOUT); // (blind and deaf, and told to put their hands up: they do)
      if (Math.random() < chance) { this.surrender(e); complied++; }
      else if (!e.def.civ) {
        // refuses: snaps out of it, gets the weapon up and fights
        e.morale -= 0.08 * (e.def.steady || 1);
        e.surprisedT = 0;
        if (e.flashT! > 0) e.alert = true; // (blind and deaf there's nothing they can do about it: the gun comes up when they can see)
        else { this.alertEnemy(e, false); e.cool = Math.min(e.cool, e.broken ? 1 : 0.5); }
      }
    }
    this.hear(px, pz, 14, py); // anyone else nearby now knows police are inside
    SvNet.broadcast({ t: 'shout', id: from, n: complied });
  },
  // windows broken (by a round or a blast): for everyone, and heard round about
  breakGlass(ids: number[], p: number[]) {
    const ws = this.map && (this.map.windows as SvWin[]);
    if (!ws) return;
    const fresh = ids.filter((id: number) => Number.isInteger(id) && ws[id] && !ws[id].broken && !ws[id].armor && Level.paneBreaks(ws[id])).slice(0, 20); // (bulletproof glass doesn't break, nor a ship's)
    if (!fresh.length) return;
    for (const id of fresh) { ws[id].broken = true; World.windowSolids(this.map!.world, this.map, ws[id]); this.glassBroken.add(id); this.hear(ws[id].x, ws[id].z, 16, ws[id].fy || 0); }
    SvNet.broadcast({ t: 'glass', ids: fresh });
    SpaceSv.glass(fresh); // (a ship's hull window: the air goes)
  },
  // A weapon light in their eyes (the player they're shooting at has one on and pointed at them, close enough):
  // they can hardly see to aim. Returns a multiplier on their hit chance.
  dazzle(e: Enemy, st: PState) {
    if (!st || !(st.tl & 1)) return 1;
    const dx = e.x - st.p[0], dz = e.z - st.p[2], d = Math.hypot(dx, dz);
    if (d < 0.3 || d > (st.tl & 8 ? 22 : 15)) return 1;
    const c = (dx * -Math.sin(st.yw) + dz * -Math.cos(st.yw)) / d;
    return c > 0.97 ? 0.55 : c > 0.93 ? 0.8 : 1;
  },
  // ---- seeing by the light there is (every level: in a lit room it makes no difference, in the dark all the difference)
  // HALF: the light (on the light grid's scale: js/level.ts lux) that makes someone half as easy to pick out as all the
  // light there could be; LIT: a room under its lamp, the light counted as full; a suspect only picks out an officer
  // within REACH0 + REACH * k metres (k: lightK; twice that once they're alert); CLOSE: nearer than that, a shape in the
  // dark, a breath, a step, gives you away whatever the light; FLASH: a muzzle flash's light, for FLASH_T after a shot;
  // SPILL: what an officer's own weapon light, on but pointed elsewhere, throws back on them off what it lights;
  // SUS: a suspect's own weapon light, on someone in its beam (up to SUS_R metres)
  SIGHT: { HALF: 0.05, LIT: 0.3, REACH0: 6, REACH: 69, CLOSE: 5, FLASH: 0.6, FLASH_T: 0.5, SPILL: 0.12, SUS: 0.8, SUS_R: 20 },
  // ---- a night level (this.night: the power's off, and nobody has a light or night vision but the police)
  // Seeing (lightK, perception): REACH0, CLOSE as SIGHT's but nearer (a shape in the dark is made out at a few metres), and
  // ALERT for how much further an alert suspect looks than an unaware one (SIGHT: twice). A visible laser that's on: LASER
  // (its dot and its beam in the air give you away, a little light where you are). A muzzle flash: SIGHT.FLASH times the
  // muzzle's flash (flashK: 1 bare, 1.2 a brake, 0.3 a flash hider, 0.1 a suppressor; js/player.ts flashOf) squared, for
  // FLASH_T times it (at most once): a hider's flash is dim and gone in a moment, a can's next to nothing.
  // Aim (fire): their hit chance times AIM + (1 - AIM) * sqrt(k) (k: lightK over LITK, at most 1: how well they see you, the level's
  // light on you, your own light or laser, a flash, or close by; from LITK on, a weapon light's spill on you or a bare muzzle's
  // flash, as well as by day); and where they aim is a guess, GUESS * (1 - k)² metres off (none at k = 1),
  // a new guess every GUESS_T seconds. Picking you up again after losing you: ACQ seconds more before the first shot at
  // k = 0 (a marksman's aim time AIMT times longer).
  // Search (nightSearch, orderStep): having lost you (or only heard you), after HOLD seconds (HOLD_B for those who'd push on
  // anyway) they go and look for themselves, as a leader's order would send them: to where you were seen or heard, then
  // spot to spot outward from it, at CREEP of their walk, stopping a while at each (REST seconds, more by chance) to listen and
  // look round, till SEARCH_T seconds have gone or they've looked as far as RING metres out from it. A new noise sends it
  // there (RETARGET metres off, at most every RT_GAP seconds).
  NIGHT: { REACH0: 3, CLOSE: 4, ALERT: 1.4, LASER: 0.04, AIM: 0.3, LITK: 0.6, GUESS: 1.2, GUESS_T: 1.1, ACQ: 1.0, AIMT: 1, HOLD: 2.5, HOLD_B: 0.8, CREEP: 0.5, REST: 2.2, SEARCH_T: 60, RING: 21, RETARGET: 3, RT_GAP: 2 },
  // The light where an officer stands: the level's (Level.luxAt), and a muzzle flash for a moment after they fire.
  // Kept for the tick: every suspect looking their way asks.
  officerLux(p: LivePlayer) {
    if (p.luxAt === this.clock) return p.lux!;
    const S = this.SIGHT, st = p.st;
    let v = Level.luxAt(this.map!, st.p[0], st.p[1], st.p[2]);
    const since = this.clock - (p.firedAt == null ? -99 : p.firedAt);
    if (!this.night) { if (since < S.FLASH_T) v += S.FLASH; }
    else { const fk = p.flashK == null ? 1 : p.flashK; if (since < S.FLASH_T * Math.min(1, fk)) v += S.FLASH * fk * fk; } // (night: by the muzzle's flash, NIGHT)
    if (this.night && (st.tl & 2) && !st.sw) v += this.NIGHT.LASER; // (a visible laser on: its dot and beam in the dark)
    p.luxAt = this.clock; p.lux = v;
    return v;
  },
  // Is officer st's weapon light on suspect e (d metres off, along the ground)? 1 in its beam (the spot light's cone: 0.3 rad
  // round where they aim, js/render.ts tacLight), fading to 0 by 0.45 rad, and none past its reach (24 m, a bright one 34).
  beamAt(e: Enemy, st: PState, d: number) {
    if (!st || !(st.tl & 1) || st.sw || d > (st.tl & 8 ? 34 : 24)) return 0;
    const cp = Math.cos(st.pt || 0), fx = -Math.sin(st.yw) * cp, fy = Math.sin(st.pt || 0), fz = -Math.cos(st.yw) * cp;
    const dx = e.x - st.p[0], dy = (e.y || 0) + 1.3 * e.def.scale - st.p[1] - 1.5, dz = e.z - st.p[2], dd = Math.hypot(dx, dy, dz) || 1;
    const c = (dx * fx + dy * fy + dz * fz) / dd;
    return G_U.clamp((c - 0.9) / (0.955 - 0.9), 0, 1);
  },
  // How well suspect e can make out officer p, d metres off, by the light on them: 0 (pitch dark) to 1 (a lit room, or better).
  //   L = the light where they stand (officerLux: the level's lamps, sky and bounce, and a muzzle flash)
  //     + the suspect's own weapon light, if it's on them (theirs on, the gun out, within ~18 deg of where they face):
  //       SUS * (1 - d / SUS_R)^1.6
  //     + the officer's weapon light, on but pointed elsewhere: SPILL (twice that, a bright one)
  //   k = ((L / (L + HALF)) / (LIT / (LIT + HALF)))^2, at most 1: a lit room 1; a corridor between its lamps (0.1) about 0.6;
  //       outdoors under a level's evening sky (0.08) about 0.5; moonlight (0.03) about 0.2; a night level's dark rooms
  //       (under 0.01) under 0.05
  //   and the officer's light pointed at them (beamAt) is the brightest thing in sight: k up to 1; close up (CLOSE),
  //   at least 0.8 * (1 - d / CLOSE).
  lightK(e: Enemy, p: LivePlayer, d: number) {
    const S = this.SIGHT, st = p.st;
    let L = this.officerLux(p);
    if ((e.def.tac & 1) && e.armed && e.drawn && d < S.SUS_R) {
      const c = ((st.p[0] - e.x) * -Math.sin(e.yaw) + (st.p[2] - e.z) * -Math.cos(e.yaw)) / (d || 1);
      if (c > 0.95) L += S.SUS * Math.pow(1 - d / S.SUS_R, 1.6);
    }
    const bm = this.beamAt(e, st, d);
    if ((st.tl & 1) && !st.sw) L += S.SPILL * (st.tl & 8 ? 2 : 1);
    const k = Math.min(1, ((L / (L + S.HALF)) / (S.LIT / (S.LIT + S.HALF))) ** 2);
    return Math.max(k, bm, 0.8 * (1 - d / (this.night ? this.NIGHT.CLOSE : S.CLOSE)));
  },
  // How much of officer st suspect e can see from (ax, ay, az): 0 .. 1. Sight lines to six points on them, each counting
  // its share of a body (head 0.25, chest 0.2, either shoulder 0.12, hips 0.16, knees 0.15) by how clear its line is
  // (Level.see: through glass less). Behind a crate to the waist, about half; a head round a corner, a quarter.
  // Shoulders: either side of them across the line of sight; lying down, the body runs back from the head along the ground.
  bodySeen(st: PState, ax: number, ay: number, az: number) {
    const L = Level, map = this.map!, [px, py, pz] = st.p, [hx, hz] = this.headXZ(st);
    const sx = px - ax, sz = pz - az, sd = Math.hypot(sx, sz) || 1, qx = -sz / sd * 0.22, qz = sx / sd * 0.22; // (across the line, a shoulder's width)
    const pts: number[][] = []; // [x, y, z, share]
    if (st.pr) {
      const bx = Math.sin(st.yw), bz = Math.cos(st.yw); // (back along the body: behind where they face)
      pts.push([hx, py + 0.3, hz, 0.25], [px + bx * 0.35, py + 0.25, pz + bz * 0.35, 0.2], [px + bx * 0.35 + qx, py + 0.22, pz + bz * 0.35 + qz, 0.12], [px + bx * 0.35 - qx, py + 0.22, pz + bz * 0.35 - qz, 0.12],
        [px + bx * 0.8, py + 0.2, pz + bz * 0.8, 0.16], [px + bx * 1.2, py + 0.15, pz + bz * 1.2, 0.15]);
    } else {
      const c = st.cr ? 0.63 : 1, mx = (hx + px) / 2, mz = (hz + pz) / 2; // (crouched: everything lower; the chest leans with the head)
      pts.push([hx, py + (st.cr ? 0.95 : 1.5), hz, 0.25], [mx, py + 1.2 * c, mz, 0.2], [mx + qx, py + 1.3 * c, mz + qz, 0.12], [mx - qx, py + 1.3 * c, mz - qz, 0.12], [px, py + 0.9 * c, pz, 0.16], [px, py + 0.45 * c, pz, 0.15]);
    }
    let v = 0;
    for (const [x, y, z, w] of pts) v += w * L.see(map, ax, ay, az, x, y, z);
    return v;
  },
  // armed suspects still in the fight near this one (within 9 m) who can see them
  allies(e: Enemy) {
    let n = 0;
    const eh = (e.y || 0) + 1.4 * e.def.scale;
    for (const o of this.enemies.values()) {
      if (o === e || o.def.civ || !o.armed || o.state !== 'normal' || Math.hypot(o.x - e.x, o.z - e.z) > 9) continue;
      if (Level.los(this.map!, o.x, (o.y || 0) + 1.4 * o.def.scale, o.z, e.x, eh, e.z)) n++;
    }
    return n;
  },
  surrender(e: Enemy) {
    e.state = 'surrender';
    e.aiming = false; e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.crouch = false; e.hide = null; e.lurk = false; e.dp = null;
    if (!e.def.civ) {
      this.dropEvidence(e);
      e.armed = false; e.drawn = false;
      e.fake = Math.random() < (e.def.fake || 0); e.fakeT = 5 + Math.random() * 8;
    }
  },
  // A suspect's weapon hits the floor (surrendering or dead) and becomes evidence to secure.
  dropEvidence(e: Enemy) {
    if (e.def.civ || !e.armed || !e.def.wpn) return;
    const a = Math.random() * Math.PI * 2;
    const v = { i: this.evidence.length, wpn: e.def.wpn, x: e.x + Math.cos(a) * 0.5, y: e.y || 0, z: e.z + Math.sin(a) * 0.5, owner: e.id, secured: false, taken: false };
    Level.resolve(this.map!, v, 0.15, v.y, World.STEP);
    v.y = Level.groundAt(this.map!, v.x, v.z, 0.05, v.y + 0.3, 0.05); // (on the floor where they were: upstairs or down)
    this.evidence.push(v);
    SvNet.broadcast({ t: 'evid', i: v.i, wpn: v.wpn, x: Math.round(v.x * 100) / 100, z: Math.round(v.z * 100) / 100, y: Math.round(v.y * 100) / 100 });
  },
  evidenceValue(wpn: string) { return 60 + Math.round((WEAPONS[wpn] ? WEAPONS[wpn].price : 500) * 0.04) + 10 * this.level; },
  // A weapon's worth is split: half for bagging it, half for securing whoever carried it (arrest or body).
  carrierShare(def: any) { return def && !def.civ && def.wpn ? Math.round(this.evidenceValue(def.wpn) / 2) : 0; },
  secure(i: number, p: LivePlayer, from: string) {
    const v = this.evidence[i];
    if (!v || v.secured || v.taken || Math.hypot(v.x - p.st.p[0], v.z - p.st.p[2]) > 2.4) return;
    v.secured = true;
    this.report.evidence++;
    // a secured weapon can't be grabbed back by a faking suspect
    const owner = this.enemies.get(v.owner);
    if (owner) owner.fake = false;
    SvNet.broadcast({ t: 'evsec', i, by: from, cr: this.pay(Math.round(this.evidenceValue(v.wpn) / 2)), wpn: v.wpn });
    this.checkClear();
  },
  // at: where the officer saw the body lying, its ragdoll (it can slide or fall a way from where they went down):
  // in reach of that is in reach, if it's within 4 m of where the host has them
  cuff(eid: number, p: LivePlayer, from: string, at: any) {
    const e = this.enemies.get(eid);
    const reach = (x: number, z: number) => {
      const ok = Array.isArray(at) && Number.isFinite(+at[0]) && Number.isFinite(+at[1]) && Math.hypot(at[0] - x, at[1] - z) < 4;
      return Math.min(Math.hypot(x - p.st.p[0], z - p.st.p[2]), ok ? Math.hypot(at[0] - p.st.p[0], at[1] - p.st.p[2]) : Infinity);
    };
    if (!e) {
      const b = this.bodies.get(eid);
      if (!b || b.secured || reach(b.x, b.z) > 2.6) return;
      b.secured = true;
      this.report.bodies++;
      SvNet.broadcast({ t: 'cuffed', e: eid, by: from, cr: b.civ ? 0 : this.pay(this.carrierShare(b.def || (ENEMIES as Tbl)[b.type])), civ: b.civ, ty: b.type, body: true, nm: b.rec && b.rec.title });
      this.checkClear();
      return;
    }
    if (!e || !(e.state === 'surrender' || e.collapsed || (!e.def.civ && e.flashT! > 0) || (e.def.civ && (e.state === 'cower' || e.state === 'flee')))) return; // (down: no giving up, just cuffed where they lie)
    if ((e.collapsed ? reach(e.x, e.z) : Math.hypot(e.x - p.st.p[0], e.z - p.st.p[2])) > 2.6) return;
    const dn = !!e.collapsed; // (cuffed where they lay, bleeding: a living arrest, but no arrest to show in the highlights)
    e.state = 'cuffed'; e.armed = false; e.fake = false;
    const civ = !!e.def.civ;
    // (a suspect cuffed where they lay is already counted, incapacitated: securing them pays like securing a body)
    const cr = civ ? 200 + 40 * this.level : dn ? this.carrierShare(e.def) : Math.round(e.def.cr * 2.5 * (1 + 0.08 * (this.level - 1))) + this.carrierShare(e.def);
    if (civ) this.report.rescued++; else if (!dn) this.report.arrests++;
    SvNet.broadcast({ t: 'cuffed', e: e.id, by: from, cr: this.pay(cr), civ, ty: e.type, dn: dn ? 1 : 0, nm: this.titleOf(e) });
    this.checkClear();
  },
  // ---------------------------------------------------------------- suspects' injuries
  // The same wounds as an officer's (js/ballistics.ts works out what each round did, on the shooter's machine), kept
  // more simply: bleeding (heavy: a standard person gone in ~50 s; massive, from the heart, aorta or an iliac artery:
  // in ~8 s; light, which clots in half a minute), a broken arm (their aim goes) or leg (they limp), a collapsed lung
  // (both), a gut wound (a slow bleed), a spine (they go down and stay down) or a heart wrecked (they black out).
  // Bleeding drains their health and their nerve, and can kill them (credited to whoever shot them). Restraining
  // someone stops it: you treat them as you cuff them. organs: what was hit, kept for the record (id:% of it gone).
  injure(e: Enemy, part: string, effs: string, side: any, organs: string) {
    if (!Med.NAME[part]) return;
    const person = e.maxHp * (100 / e.def.hp), E = new Set(effs.split(',').filter(Boolean));
    if (E.has('massive')) e.bleedH = (e.bleedH || 0) + person * 0.12;
    if (E.has('heavy')) e.bleedH = (e.bleedH || 0) + person * 0.02;
    if (E.has('light') || E.has('gut')) { e.bleedL = (e.bleedL || 0) + person * (E.has('gut') ? 0.006 : 0.004); e.clotT = 0; }
    // (a moderate or worse bleed also shows as a stream on the body, js/views.ts woundStreams: a wound is the part's index,
    // + 8 for an artery (it spurts), + 16 for a massive one; the last four kept)
    if (E.has('heavy') || E.has('massive') || E.has('cardiac')) {
      const pi = Med.PARTS.findIndex((q: any) => q[0] === part);
      if (pi >= 0) { const w = e.wnd || (e.wnd = []); w.push(pi | (/carotid|brachial|femoral|iliac|aorta|heart/.test(organs || '') ? 8 : 0) | (E.has('massive') || E.has('cardiac') ? 16 : 0)); if (w.length > 4) w.shift(); }
    }
    if (E.has('frac')) {
      // which limb (the pelvis: the leg on its side, from the organs), kept for the record (e.broke: the F9 readout)
      const pl = /pelvis([LR])/.exec(organs || ''), limb = part.startsWith('arm') || part.startsWith('leg') ? part : 'leg' + (pl ? pl[1] : side === 'L' ? 'L' : 'R');
      e.broke = e.broke || {};
      if (!e.broke[limb]) { e.broke[limb] = 1; if (limb.startsWith('arm')) e.arms = (e.arms || 0) + 1; else e.legs = (e.legs || 0) + 1; }
    }
    if (E.has('lung')) e.lung = true;
    if (E.has('spine')) e.spine = true;
    if (E.has('out')) e.out = true;
    if (E.has('cardiac')) { e.cardiac = true; e.bleedH = (e.bleedH || 0) + person * 0.35; } // (a wrecked heart: gone in a second or two)
    if (organs) { e.organs = e.organs || {}; for (const o of organs.split(',')) { const [id, pct] = o.split(':'); if (id) e.organs[id] = Math.max(e.organs[id] || 0, +pct || 0); } }
  },
  // Would they have given up, told to now (roughly the odds a shout has: js/server.ts shout)? For the highlights.
  wouldYield(e: Enemy) {
    if (!e.def.comply || e.state === 'cuffed') return false;
    const unaware = !e.alert || (e.surprisedT || 0) > 0;
    let c = e.def.comply + (unaware ? 0.4 : 0) + (!e.drawn ? 0.3 : -0.15) + 0.5 * (1 - (e.str == null ? 1 : e.str)) + (e.collapsed ? 0.3 : 0) + (e.broken ? 0.3 : 0) - Math.max(0, (e.morale || 0) - 0.5) * 0.8;
    c *= [1, 0.3, 0.08, 0.03][Math.min(3, this.allies ? this.allies(e) : 0)];
    return c >= 0.55;
  },
  // bleeding, every tick; true when it killed them. (BLEED_K: everyone bleeds at this share of the wounds' rates, as
  // officers do: js/medical.ts)
  BLEED_K: 0.5,
  // A thermobaric's injuries (e.tb: its burns and its blast, each a share of a life, js/player.ts tbDose), each a kind of harm of its own
  // that goes on after the fireball, as a bleed does, nothing clots, and only zip-tying them stops (they're out of harm's way then):
  //   burns: burn shock, the fluid the burned skin weeps away, faster the more of them is burned (BURN_K a second, of a person, for
  //     each share of a life the burns did)
  //   blast lung: the air sacs torn by the pressure, filling: less and less air, faster the harder the blast (LUNG_K likewise)
  // So anyone caught in the fireball itself and still alive (its burns alone near half a life) goes in under a minute; at its edge
  // the harm's slow enough to outlast a level. A death of it is the thrower's (a civilian's counted as killed), of burns or the
  // blast, whichever drained more (cz).
  TB_HARM: { BURN_K: 0.004, LUNG_K: 0.004 },
  tbRate(e: Enemy) { if (!e.tb) return 0; const H = this.TB_HARM, person = e.maxHp * (100 / e.def.hp); return (e.tb.burn * H.BURN_K + e.tb.blast * H.LUNG_K) * person; },
  injuryTick(e: Enemy, dt: number) {
    if (e.state === 'cuffed') { e.bleedH = e.bleedL = 0; e.wnd = undefined; return false; } // (zip-tied: out of harm's way, applyHit)
    const tr = this.tbRate(e);
    if (tr > 0 && e.hp > 0) {
      e.hp -= tr * dt;
      if (!e.def.civ && e.morale != null) e.morale = Math.max(0, e.morale - dt * 0.6 * tr / e.maxHp);
      if (e.hp <= 0) { e.hp = 0.01; this.applyHit({ e: e.id, d: 1, bo: 1, cz: e.tb!.burn * this.TB_HARM.BURN_K >= e.tb!.blast * this.TB_HARM.LUNG_K ? 'burns' : 'blast' }, e.lastHit); return true; }
    }
    if (e.bleedL) { e.clotT = (e.clotT || 0) + dt; if (e.clotT > 30) { e.bleedL = 0; e.clotT = 0; } }
    const b = ((e.bleedH || 0) + (e.bleedL || 0)) * this.BLEED_K;
    if (!b) return false;
    e.hp -= b * dt;
    if (!e.def.civ && e.morale != null) e.morale = Math.max(0, e.morale - dt * 0.6 * b / e.maxHp); // weakening: closer to giving up
    if (e.hp <= 0) { e.hp = 0.01; this.applyHit({ e: e.id, d: 1, bo: 1 }, e.lastHit); return true; }
    return false;
  },
  // what wounds leave of their pace and aim
  injSpeed(e: Enemy) { return (e.legs ? (e.legs > 1 ? 0.45 : 0.65) : 1) * (e.lung ? 0.85 : 1); },
  injAim(e: Enemy) { return (e.arms ? (e.arms > 1 ? 0.45 : 0.7) : 1) * (e.lung ? 0.8 : 1) * (0.6 + 0.4 * (e.str == null ? 1 : e.str)); },
  // Strength (0..1): what blood loss (their health) and broken legs leave them to hold themselves up with. Full
  // above 70% health, falling steadily to nothing at 15%. Weak, they slow and stagger (their body is physically
  // simulated on every screen, held up by muscles this strong: js/rig.ts). Below TWO_HAND they can't get the
  // other hand on the gun any more (it props them up instead) and shoot one-handed; below COLLAPSE (about 31%
  // health) their legs give out and they go down, still alive, until they bleed out. The weaker they are, the
  // more readily they give up.
  COLLAPSE: 0.3, TWO_HAND: Sim.TWO_HAND,
  // A shot kicks the gun off target (degrees of muzzle rise: the weapon's recoil, worse one-handed and weak),
  // and the arms bring it back, faster with two hands and strength. They fire again once it's back on.
  kickOf(e: Enemy, w: any) { return Sim.kickOf(e.str, w); }, // (js/sim.ts: every screen kicks the rig's gun as much)
  kickBack(e: Enemy) { const s = e.str == null ? 1 : e.str; return (s >= this.TWO_HAND ? 7 : 4) * (0.4 + 0.6 * G_U.clamp(s / 0.6, 0, 1)); },
  // Is their gun on the target? Facing it, with the kick of the last shot settled (what sags off it from
  // weakness is allowed for: they can't do better). On the host's own screen the suspect's body is simulated
  // (js/rig.ts powerStep), so where that gun's bore actually points has to agree too (the screen tells it: 'bores', the
  // muzzle and the bore's way as last drawn). Kept waiting too long, they snap a shot off anyway.
  // A civilian between them and where they'd shoot (on their floor, past them and short of it, within SCREEN_R of the line): they won't
  // fire through one. That civilian, or null.
  SCREEN_R: 0.45,
  screenedBy(e: Enemy, tx: number, tz: number, ty: number): Enemy | null {
    const dx = tx - e.x, dz = tz - e.z, L2 = dx * dx + dz * dz; if (L2 < 0.25) return null;
    const L = Math.sqrt(L2);
    for (const c of this.enemies.values()) {
      if (c === e || !c.def.civ || c.down || Math.abs((c.y || 0) - (e.y || 0)) > 1.5 || Math.abs((c.y || 0) - ty) > 2) continue;
      const ox = c.x - e.x, oz = c.z - e.z, t = (ox * dx + oz * dz) / L2;
      if (t <= 0 || t >= 1) continue;
      if (Math.abs(ox * dz - oz * dx) / L < this.SCREEN_R) return c;
    }
    return null;
  },
  onTarget(e: Enemy, st: PState, dt: number) {
    const tx = st.p[0], ty = st.p[1] + (st.pr ? 0.25 : st.cr ? 0.75 : 1.2), tz = st.p[2], s = e.str == null ? 1 : e.str;
    const sag = (1 - G_U.clamp(s / 0.6, 0, 1)) * 45;
    let on = Math.abs(G_U.angDiff(e.yaw, Math.atan2(-(tx - e.x), -(tz - e.z)))) < 0.16 && (e.kick || 0) < 2.5;
    const b = on && this.bores.get(e.id);
    if (b) {
      const to = new THREE.Vector3(tx - b[0], ty - b[1], tz - b[2]).normalize();
      on = Math.acos(G_U.clamp(b[3] * to.x + b[4] * to.y + b[5] * to.z, -1, 1)) * 180 / Math.PI < 6 + sag * 1.1;
    }
    e.onWait = on ? 0 : (e.onWait || 0) + (dt || 0);
    return on || e.onWait > 0.8;
  },
  strength(e: Enemy) {
    const f = e.hp / e.maxHp;
    return G_U.clamp((f - 0.15) / 0.55, 0, 1) * (e.legs ? (e.legs > 1 ? 0.6 : 0.85) : 1);
  },

  // ---------------------------------------------------------------- suspects' reloads
  // Each carries its gun's magazine. Empty, they reload (the gun's reload time; pump and lever guns shell by
  // shell, firing again from a part-loaded tube when they have to); with nobody in sight and the magazine
  // half spent, they top up. They duck while they do it if they're in cover, and it can be heard.
  startReload(e: Enemy) {
    const w = WEAPONS[e.def.wpn];
    if (!w || e.reloadT > 0) return;
    e.reloadT = w.shell ? w.reload : w.reload * (1 + Math.random() * 0.3);
    SvNet.broadcast({ t: 'ereload', e: e.id, n: w.shell ? Math.min(8, e.magMax - e.mag) : 0, dur: Math.round(e.reloadT * 100) / 100 });
  },
  reloadTick(e: Enemy, dt: number) {
    const w = WEAPONS[e.def.wpn];
    if (!w || !e.magMax) return;
    if (e.reloadT > 0) {
      e.reloadT -= dt;
      if (e.reloadT <= 0) {
        e.reloadT = 0;
        if (w.shell) { e.mag++; if (e.mag < e.magMax && !(e.canSee && e.mag >= 2)) e.reloadT = w.reload; }
        else e.mag = e.magMax;
      }
    } else if (e.alert && !e.canSee && e.mag < e.magMax * 0.5) this.startReload(e);
  },
  applyHit(m: any, from: string | null) {
    if (this.phase !== 'level') return;
    const e = this.enemies.get(m.e);
    if (!e) return;
    if (e.state === 'cuffed') return; // zip-tied: nothing hurts them any more (no round, chip, blast or fire, and no wound goes on: injuryTick)
    // the wounds, for injuries: the part, what the round did there (js/ballistics.ts effects), the side, the organs
    if (Array.isArray(m.w)) for (const w of m.w.slice(0, 12)) if (Array.isArray(w)) this.injure(e, String(w[0]), String(w[1] || ''), w[2], String(w[3] || ''));
    // wounds are a share of a standard person's life (tougher types have proportionally more), so lethality
    // doesn't fall as health scales up with the level and the squad; an unarmoured headshot kills outright
    const person = e.maxHp * (100 / e.def.hp);
    const d = m.k ? e.hp + 1 : Math.min(5000, (+m.d || 0) + Math.min(5, Math.max(0, +m.f || 0)) * person);
    if (!(d > 0)) return;
    e.hp -= d;
    if (!m.bo) { e.lastHit = from; e.lastHitN = from ? null : m.byn || null; e.lastHitAt = this.clock || 0; e.lastH = !!m.h; e.lastAp = !!m.ap; e.hitState = e.state; e.hitUnaware = !e.alert || (e.surprisedT || 0) > 0; e.hitYield = this.wouldYield(e);
      if (Array.isArray(m.tb) && m.tb.length === 2 && m.tb.every(Number.isFinite)) { const t = e.tb || (e.tb = { burn: 0, blast: 0, n: 0 }); t.burn += G_U.clamp(m.tb[0], 0, 2); t.blast += G_U.clamp(m.tb[1], 0, 2); t.n++; } // (a thermobaric's burns and blast: injuries of their own, injuryTick; and for F9, js/hud.ts)
      e.lastGr = Number.isFinite(m.gr) ? m.gr : 0; e.lastFb = e.flashT! > 0 ? e.flashId || 0 : 0; } // bleeding out is judged by what they were doing when shot (and for the highlights: a frag grenade's, gr its seed; blind from a flashbang, which)
    // Shock: being hit wrecks your aim for a moment (most of it, for a hard hit), throws off the shot you were
    // about to take, and starts your aim over from the body. It fades over a couple of seconds.
    if (!m.bo) {
      e.shock = Math.min(1.5, (e.shock || 0) + 0.5 + 0.7 * Math.min(1, d / person));
      e.sup = Math.min(1, (e.sup || 0) + 0.3);
      e.engAt = this.clock; e.headDelay = 0.3 + Math.random() * 0.2;
      e.cool = Math.max(e.cool || 0, 0.25 + Math.random() * 0.35);
    }
    e.hitAt = this.clock;
    if (!e.def.civ) e.morale -= (0.2 + 0.6 * Math.min(1, d / e.maxHp)) * (e.def.steady || 1);
    if (e.def.civ) this.panic(e);
    else if (e.state === 'normal') this.alertEnemy(e, true);
    if (e.def.boss) {
      const frac = e.hp / e.maxHp;
      if ((this.summons === 0 && frac < 0.66) || (this.summons === 1 && frac < 0.33)) {
        this.summons++;
        for (let i = 0; i < 3 + this.players.size; i++) {
          const a = Math.random() * Math.PI * 2;
          const n = this.addEnemy('grunt', e.x + Math.cos(a) * 2.5, e.z + Math.sin(a) * 2.5, 1 + 0.1 * this.level, e.y || 0);
          this.settle(n, 0.4);
          this.alertEnemy(n, false);
        }
        SvNet.broadcast({ t: 'chat', id: null, m: 'The Kingpin is calling for backup!' });
      }
    }
    if (e.hp <= 0) {
      this.dropEvidence(e);
      this.enemies.delete(e.id);
      this.bodies.set(e.id, { id: e.id, type: e.type, def: e.def, x: e.x, y: e.y || 0, z: e.z, yaw: e.yaw, civ: !!e.def.civ, secured: false, rec: e }); // (rec: their record as they died: every wound, for the F9 readout, js/hud.ts)
      // watching a friend go down rattles everyone nearby
      for (const o of this.enemies.values()) if (!o.def.civ && o.state === 'normal' && Math.hypot(o.x - e.x, o.z - e.z) < 15) o.morale -= 0.2 * (o.def.steady || 1);
      let cr = 0, why = null;
      const inc = !e.def.civ && !!e.incap; // (counted already: incapacitated when they went down)
      if (e.def.civ) { why = 'civ'; this.report.civKilled++; } // (no credits off for it: what a civilian's death costs is reputation, to come; counted here for it)
      else if (inc) { if (m.bo) { this.report.bleedouts++; const by = e.incap!.by; if (by) this.report.bleedBy[by] = (this.report.bleedBy[by] || 0) + 1; } } // (bled out: kept, by who put them down)
      else ({ cr, why } = this.incapacitate(e, from, m.bo ? e.hitState || e.state : e.state));
      // and what makes it one for the highlights (js/highlights.ts): taken by surprise, would have given up if told to,
      // just after the killer kicked a door in, how far, what the rounds did inside
      const kp = from && this.players.get(from), kpos = kp && kp.st && kp.st.p;
      const hl: any = { sur: e.hitUnaware && !e.def.civ ? 1 : 0, ws: e.hitYield && !e.def.civ ? 1 : 0, br: from && this.kickAt && this.clock - (this.kickAt[from] == null ? -99 : this.kickAt[from]) < 5 ? 1 : 0,
        d: kpos ? Math.round(Math.hypot(kpos[0] - e.x, kpos[2] - e.z)) : 0, o: e.organs || undefined,
        // (bled out: not this round but the wounds, bt seconds after the last one. Within 3 s of it, or through the
        // heart, it's the round that killed them: a shot kill, hd seconds before they died)
        ...(() => {
          const since = m.bo && e.lastHitAt != null ? (this.clock || 0) - e.lastHitAt : null, shot = since != null && (e.cardiac || since < 3);
          return { bo: m.bo && !shot ? 1 : 0, bt: m.bo && !shot && since != null ? Math.round(since) : 0, hd: shot ? Math.round(since * 100) / 100 : 0 };
        })() };
      if (e.lastAp && !hl.bo) hl.ap = 1; // (the round that did it went through their armour)
      if (!hl.bo && e.lastGr) hl.gr = e.lastGr; // (a frag grenade did it: which)
      if (!hl.bo && e.lastFb) hl.fb = e.lastFb; // (blind from a flashbang when it was done: which)
      if (m.cz === 'burns' || m.cz === 'blast') { hl.cz = m.cz; if (e.lastGr) hl.gr = e.lastGr; } // (died of a thermobaric's burns or blast lung: injuryTick; the grenade's)
      SvNet.broadcast(Object.assign({ t: 'kill', e: e.id, by: from, bn: from ? undefined : m.byn || e.lastHitN || undefined, cr: this.pay(cr), h: !!m.h, ty: e.type, nm: e.title || this.titleOf(e), ld: this.leadsMen(e) ? 1 : undefined, why, inc: inc ? 1 : 0, wd: e.wnd && e.wnd.length ? e.wnd : undefined }, hl));
      this.checkClear();
    }
  },

  // A suspect incapacitated: down for good, or dead outright, whichever comes first. It's counted once, then and
  // there, the same as a kill: the officer's credit and tally, and whether it was authorised (st: what they were
  // doing when shot). Lethal force pays least. If they bleed out afterwards, that's kept (report.bleedouts, and
  // bleedBy: by the officer who put them down), not counted again.
  // what's paid on the spot: nothing on a mission (its fee is paid when it's done, js/spaceserver.ts); what a wrong costs still is
  pay(cr: number) { return SpaceSv.st.M && cr > 0 ? 0 : cr; },
  incapacitate(e: Enemy, by: string | null, st: string) {
    e.incap = { by: by || null, t: this.clock || 0 };
    if (st !== 'normal') { this.report.unauth++; return { cr: -Math.round(e.def.cr * 2), why: 'unauth' }; }
    this.report.incap++;
    return { cr: Math.round(e.def.cr * 0.25 * (1 + 0.08 * (this.level - 1))), why: null };
  },
  // A suspect down for good: incapacitated, counted now (incapacitate), told to everyone
  incapMsg(e: Enemy) {
    if (e.def.civ || e.incap) return; // (a civilian down still needs rescuing)
    const { cr, why } = this.incapacitate(e, e.lastHit, e.hitState || e.state);
    SvNet.broadcast({ t: 'incap', e: e.id, by: e.lastHit || null, bn: e.lastHit ? undefined : e.lastHitN || undefined, cr: this.pay(cr), h: !!e.lastH, ty: e.type, nm: e.title || this.titleOf(e), ld: this.leadsMen(e) ? 1 : undefined, why, sur: e.hitUnaware ? 1 : 0, gr: e.lastGr || undefined }); // (gr: a grenade put them down, frag or thermobaric: not the gun's, js/arsenal.ts kill)
  },
  // A suspect down for good, for the highlights (js/highlights.ts suspectDown): incapacitated, their clip. The round
  // that put them down, with what a kill of it would carry; or, more than 4 s after a round last hit them, a bleed-out
  // (bo: down from the blood loss, bt seconds after the last round: no round to show). None for a civilian.
  downMsg(e: Enemy) {
    const from = e.lastHit, since = e.lastHitAt != null ? (this.clock || 0) - e.lastHitAt : null;
    if (!from || e.def.civ) return;
    const bo = since == null || since > 4;
    const kp = this.players.get(from), kpos = kp && kp.st && kp.st.p, kick = this.kickAt && this.kickAt[from];
    SvNet.broadcast({ t: 'edown', e: e.id, by: from, h: !!e.lastH, ty: e.type, nm: e.title || this.titleOf(e), why: (e.hitState || e.state) !== 'normal' ? 'unauth' : null,
      sur: e.hitUnaware ? 1 : 0, ws: e.hitYield ? 1 : 0, br: kick != null && e.lastHitAt! - kick < 5 ? 1 : 0,
      d: kpos ? Math.round(Math.hypot(kpos[0] - e.x, kpos[2] - e.z)) : 0, o: e.organs || undefined, hd: bo ? 0 : Math.round(since * 100) / 100, bo: bo ? 1 : 0, bt: bo && since != null ? Math.round(since) : 0,
      ap: e.lastAp && !bo ? 1 : undefined, gr: !bo && e.lastGr ? e.lastGr : undefined, fb: !bo && e.lastFb ? e.lastFb : undefined });
  },

  // Apartments cleared: an officer has been inside, and no suspect in it is still a threat (armed and free).
  unitsCleared() {
    const ua = this.map && this.map.unitAt;
    if (!ua) return 0;
    const L = Level, TS = L.TS, W = this.map!.W, at = (x: number, y: number, z: number) => { const a = L.floorMap(this.map!, L.floorAt(this.map!, x, y, z)).unitAt; return a ? a[Math.floor(z / TS) * W + Math.floor(x / TS)] : -1; };
    for (const p of this.players.values()) if (p.st && !p.st.dd) { const u = at(p.st.p[0], p.st.p[1], p.st.p[2]); if (u >= 0) this.unitsSeen.add(u); }
    const hot = new Set();
    for (const e of this.enemies.values()) if (!e.def.civ && e.state !== 'cuffed' && e.state !== 'surrender' && !e.down) { const u = at(e.x, e.y || 0, e.z); if (u >= 0) hot.add(u); }
    let n = 0;
    for (const u of this.unitsSeen) if (!hot.has(u)) n++;
    return n;
  },
  // The level's wind (js/sim.ts windAt: from the seed and the theme's mean speed, on windT, the level's own clock). The
  // host owns it: every SEND seconds it tells everyone, its own screen too, where it is now and where it'll be SEND on
  // ('wind': w [x, z, x1, z1], m/s), and each screen eases from what it shows to the second over the next SEND (js/wind.ts),
  // so a round anyone fires, a flag, a scope's marker all go by the same wind, within a message. None on a calm map.
  windT: 0, windSend: 0,
  windMean() { const th = this.map && this.map.theme; return th && th.wind > 0 ? +th.wind : 0; },
  windNow() { const m = this.windMean(); return m ? Sim.windAt(this.seed, m, this.windT) : null; },
  windTick(dt: number) {
    const m = this.windMean();
    if (!m) return;
    this.windT += dt; this.windSend -= dt;
    if (this.windSend > 0) return;
    this.windSend = Sim.WIND.SEND;
    const a = Sim.windAt(this.seed, m, this.windT), b = Sim.windAt(this.seed, m, this.windT + Sim.WIND.SEND), r3 = (v: number) => Math.round(v * 1000) / 1000;
    SvNet.broadcast({ t: 'wind', w: [r3(a.x), r3(a.z), r3(b.x), r3(b.z)] });
  },
  update(dt: number) {
    if (this.phase === 'shop') return this.updateHub(dt);
    if (!this.allPlayers) { // (each level stepped, the loaded one first, with only its own players)
      this.scoped(() => this.update(dt));
      for (const k of [...this.ctxs.keys()]) this.inCtx(k, () => { const c = this.ctxs; this.ctxs = new Map(); try { this.update(dt); } finally { this.ctxs = c; } });
      // (a level kept live that nobody's in any more: put away as it is (dormant, js/spaceserver.ts keepOf), to come back to)
      for (const k of [...this.ctxs.keys()]) { let n = 0; for (const p of this.players.values()) if (this.lvOf(p) === k) n++; if (!n) this.inCtx(k, () => SpaceSv.putAway()); }
      return;
    }
    if (this.phase !== 'level' || !this.map) return;
    this.clock = (this.clock || 0) + dt;
    SpaceSv.tick(dt);
    if (this.phase !== 'level') return;
    this.windTick(dt);
    const map = this.map!, L = Level;
    const all = [...this.players.values()].filter((p) => p.st) as LivePlayer[];
    const alive = all.filter((p) => !p.st.dn && !p.st.dd);

    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.5;
      this.flow = alive.length ? L.flow(map, alive.map((p) => L.src(map, p.st.p[0], p.st.p[1], p.st.p[2]))) : null;
    }

    this.nadeT -= dt;
    if (this.live.length) this.dodgeTick();
    this.noiseT = (this.noiseT || 0) - dt;
    if (this.noiseT <= 0) { this.noiseT = 0.25; this.footsteps(alive); }
    const onFoot = alive.filter((p) => !p.st.se); // (se: still in the helicopter that brought them: nobody's to aim at yet, js/landing.ts)
    this.teamCheck();
    this.teamT = (this.teamT || 0) - dt; if (this.teamT <= 0) { this.teamT = this.TEAM.T; this.teamForm(); this.pointSwap(); }
    // (pirates aboard with anyone they'd fight: each of them has the other's people to pick out and shoot as well as the squad, npcFoes)
    const foes = this.npcFoes();
    if (foes) this.civFlee(dt);
    for (const e of this.enemies.values()) this.think(e, dt, foes ? this.foesOf(e, onFoot, foes) : e.ally ? this.NOBODY : onFoot);

    // keep enemies from stacking
    const es = [...this.enemies.values()];
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
      const a = es[i], b = es[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = 0.45 * (a.def.scale + b.def.scale);
      if (d < min && d > 1e-4 && Math.abs((a.y || 0) - (b.y || 0)) < 1.5) { // (one upstairs and one down don't get in each other's way)
        const push = (min - d) / 2;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push; b.x += (dx / d) * push; b.z += (dz / d) * push;
        this.settle(a, 0.38 * a.def.scale); this.settle(b, 0.38 * b.def.scale); // (never into a wall or a door's frame: crowded in a doorway, someone could be shoved off the floor and have no way on)
      }
    }

    // the vote to leave: everyone still alive (downed officers vote too)
    const living = all.filter((p) => !p.st.dd);
    for (const id of [...this.extract.votes]) if (!living.some((p) => p.id === id)) this.extract.votes.delete(id);
    if (this.extract.active && living.length && living.every((p) => this.extract.votes.has(p.id))) {
      this.report.allRescued = this.allRescued();
      this.overBlack(() => this.toShop());
      return;
    }

    // squad wipe
    if (all.length && alive.length === 0) {
      this.wipeT += dt;
      if (this.wipeT > 5) { this.gameOver(); return; }
    } else this.wipeT = 0;

    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.05;
      const r2 = (v: number) => Math.round(v * 100) / 100;
      const e = [];
      for (const en of this.enemies.values()) {
        e.push([en.id, en.type, r2(en.x), r2(en.z), r2(en.yaw), Math.max(1, Math.round((en.hp / en.maxHp) * 100)), en.aiming ? en.tgt : 0, en.alert && !en.lowRun ? 1 : 0, en.crouch ? 1 : 0, en.leanOut || 0, en.armed ? (en.drawn ? 2 : 1) : 0, STATE_CODE[en.state] || 0, en.surprisedT > 0 ? 1 : 0, en.doorWait > 0 ? 1 : 0, en.def.civ ? 0 : `${en.def.wpn}|${en.def.vest}|${en.def.helmet}|${en.def.face || ''}|${en.def.tac || 0}|${(en.def.ex || []).join(',')}|${en.wear ? this.titleOf(en) : ''}|${en.def.shield || ''}`, ((en.bleedH || en.bleedL) ? 1 : 0) | (en.legs ? 2 : 0) | (en.reloadT > 0 ? 4 : 0) | (en.down ? 8 : 0), Math.round(Math.min(en.down ? 0.25 : 1, en.str == null ? 1 : en.str) * 100), r2(en.y || 0), en.wnd && en.wnd.length ? en.wnd : 0, en.flashT! > 0 ? 1 : en.flashRec! > 0 ? 2 : 0, en.radioT! > 0 ? 1 : 0]); // (wounds for the bleeding streams, then the flash state, then on the radio)
      }
      const p: Record<string, any> = {};
      for (const pl of all) p[pl.id] = pl.st;
      SvNet.broadcast({ t: 'snap', e, p, x: [this.extract.active ? 1 : 0, this.extract.votes.size, all.filter((q) => !q.st.dd).length, this.report.civKilled || 0, all.filter((q) => this.extract.votes.has(q.id)).map((q) => q.id), this.unitsCleared()], n: this.remaining(false), c: this.remaining(true), b: this.openBodies(), w: this.openEvidence() });
    }
  },

  // The hangar: no enemies, nothing to win; where everyone is, as the squad sees it, and the helicopter leaving once
  // everyone's in it.
  updateHub(dt: number) {
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.05;
      const p: Record<string, any> = {};
      for (const pl of this.players.values()) if (pl.st) p[pl.id] = pl.st;
      SvNet.broadcast({ t: 'snap', e: [], p, x: [0, 0, this.players.size, 0, [], 0], n: 0, c: 0, b: 0, w: 0 });
    }
    if (this.liftT != null && (this.liftT -= dt) <= 0) { this.liftT = null; this.checkReady(true); }
  },

  think(e: Enemy, dt: number, alive: LivePlayer[]) {
    const def = e.def, map = this.map!, L = Level, U = G_U, s = def.scale;
    if (e.flashT! > 0) { e.flashT! -= dt; if (e.flashT! <= 0) { e.flashT = 0; this.flashEnd(e); } } else if (e.flashRec! > 0) e.flashRec! -= dt;
    e.complyCd = Math.max(0, e.complyCd - dt);
    e.suppressT = Math.max(0, e.suppressT - dt);
    e.flinchT = Math.max(0, (e.flinchT || 0) - dt);
    e.sup = Math.max(0, (e.sup || 0) - dt * 0.3); e.shock = Math.max(0, (e.shock || 0) - dt * 0.35); // (rattled, and getting over it)
    if (e.kick) e.kick *= Math.exp(-this.kickBack(e) * dt); // bringing the gun back down
    if (this.injuryTick(e, dt)) return; // bled out
    e.str = this.strength(e);
    // Down (too weak to stand, a spine, a heart that's stopped): down for good. From there it's only bleeding out (or
    // being cuffed: it stops it): no more aiming, shooting, turning, moving or giving up.
    if ((e.str < this.COLLAPSE || e.spine || e.out) && e.state !== 'cuffed' && !e.down) { e.down = true; this.dropEvidence(e); e.armed = false; e.drawn = false; this.downMsg(e); this.incapMsg(e); this.checkClear(); } // (the gun falls from their hand)
    e.collapsed = !!e.down && e.state !== 'cuffed';
    if (e.collapsed) { e.aiming = false; e.leanOut = 0; e.cover = null; e.crouch = false; e.dp = null; return; }
    if (this.obedient(e) && this.obey(e, dt)) return;
    if (def.civ) return this.thinkCiv(e, dt);
    if (e.state === 'cuffed') return;
    if (e.state === 'surrender') return this.thinkSurrendered(e, dt, alive);
    if (e.flashT! > 0) { this.thinkFlashed(e, dt); return; } // (blind and deaf: out of the fight)
    if (e.dodge && this.dodgeStep(e, dt)) return; // (getting away from a grenade)
    this.reloadTick(e, dt);
    if ((e.radioT || 0) > 0 && this.leaderTick(e, dt)) return; // (on the radio: their team's leader, or was)
    if (e.pendingAlert >= 0) { e.pendingAlert -= dt; if (e.pendingAlert < 0) this.alertEnemy(e, false, true); }
    if (e.supQ && e.supQ.length) e.supQ = e.supQ.filter((q: number[]) => { if (q[0] > this.clock) return true; if (e.state === 'normal') this.nearMiss(e, q[1]); return false; });
    if (e.suppressT > 0 && !e.cover) e.coverT = Math.min(e.coverT, 0); // get behind something
    // nerve recovers slowly while nobody is shooting at them, and drains while they're pinned
    if (e.suppressT > 0) e.morale -= dt * 0.04 * (def.steady || 1); else e.morale = Math.min(def.morale, e.morale + dt * 0.01);
    e.morale = Math.max(0, e.morale);
    // In an active gunfight nobody breaks off: fear keeps building, but they only crack once the fight
    // lulls. Engaged = saw the target in the last 4 s (ducking into cover between shots still counts)
    // and traded fire in the last 3 s.
    const now = this.clock, lastAction = Math.max(e.firedAt || -99, e.hitAt || -99, e.supAt || -99);
    if (e.canSee) e.sawAt = now;
    if (now - (e.sawAt || -99) < 4 && now - lastAction < 3) e.engagedAt = now;
    const engaged = now - (e.engagedAt || -99) < 1.5;
    // (friends around hold them together: each one nearby lowers the point where they break)
    if ((e.allyT = (e.allyT || 0) - dt) <= 0) { e.allyT = 1; e.allyN = this.allies(e); }
    if (!e.broken && !engaged && e.alert && e.morale < 0.3 - 0.08 * Math.min(3, e.allyN || 0) && !def.boss) {
      e.broken = true; e.fleeT = 3 + Math.random() * 3; e.order = null;
      e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.aiming = false;
    }

    // --- perception (throttled)
    e.percT -= dt;
    if (e.percT <= 0) {
      e.percT = 0.12 + Math.random() * 0.1;
      let best = null, bs = 1e9, bvis = false, bd = 99;
      e.proof = false;
      if (e.flashRec! > 0) alive = alive.filter((q: LivePlayer) => Math.hypot(q.st.p[0] - e.x, q.st.p[2] - e.z) < this.FLASH.SEE_R); // (coming round from a flashbang: sees a few metres)
      const ey = (e.y || 0) + Math.min(1.6 * s, 2.4), SG = this.SIGHT;
      const lp = e.dp ? (e.leanOut ? e.dp : null) : e.cover && e.cover.lean ? e.cover : null, lx = lp ? lp.px! : e.x, lz = lp ? lp.pz! : e.z;
      let bk = 1;
      for (const p of alive) {
        const [px, py, pz] = p.st.p;
        const d = Math.hypot(px - e.x, pz - e.z);
        // (outdoors at night they can't pick you out past `night` metres, unless your light or laser gives you away)
        if (d > (map.theme.night && !(p.st.tl & 3) ? map.theme.night : 75)) continue;
        // nor, anywhere, much past what the light on you shows (lightK): in the dark, a few metres
        const lk = this.lightK(e, p, d);
        if (d > (this.night ? (this.NIGHT.REACH0 + SG.REACH * lk) * (e.alert ? this.NIGHT.ALERT : 1) : (SG.REACH0 + SG.REACH * lk) * (e.alert ? 2 : 1))) continue;
        const [hx, hz] = this.headXZ(p.st);
        const hy = py + (p.st.pr ? 0.35 : p.st.cr ? 0.95 : 1.5), k = L.see(map, lx, ey, lz, hx, hy, hz);
        // (through a window: k < 1; through bulletproof glass, seen but not to be shot: no round gets through it)
        let proof = false;
        if (k > 0 && k < 1) { const dx = hx - lx, dy = hy - ey, dz = hz - lz, dd = Math.hypot(dx, dy, dz) || 1; proof = L.raycast(map, lx, ey, lz, dx / dd, dy / dd, dz / dd, dd, { glass: true }).t < dd - 0.1; }
        const vis = k > 0 && !proof, score = d + (vis ? 0 : proof ? 30 : 40) + (k < 1 && vis ? 8 : 0) + ((p as any).npc && (p as any).npc.def.civ ? 6 : 0); // (someone unarmed: after anyone with a gun as near)
        if (score < bs) { bs = score; best = p; bvis = vis; bd = d; bk = lk; e.proof = proof; }
      }
      e.tgt = best ? best.id : null; e.canSee = bvis; e.tgtD = bd; e.visK = best && bvis ? bk : 0;
      // how easily they'd pick out the one they've a sight of, unaware: the light on them, times how much of them shows
      // (only worked out for a suspect who's still to spot anyone: a few more sight lines, a few times a second)
      e.seeVis = best && bvis && !e.alert ? bk * this.bodySeen(best.st, lx, ey, lz) : 1;
      // seen behind bulletproof glass: they know where you are (and that shooting's no use): they come round for you
      if (best && e.proof) { e.alert = true; e.lostT = G_U.clamp(e.lostT || 0, 0.01, 1); e.blind = false; e.lastSeen = { x: best.st.p[0], y: best.st.p[1], z: best.st.p[2] }; }
    }
    const p = e.tgt ? this.players.get(e.tgt) || (this.proxies && this.proxies.get(e.tgt)) || null : null; // (an officer, or someone of another side's: npcFoes)
    const st = p && p.st && !p.st.dn && !p.st.dd ? p.st : null;
    if (!st) { e.canSee = false; e.aiming = false; }

    if (e.broken) return this.thinkBroken(e, dt, p as LivePlayer, st as PState);

    // --- unaware: idle and try to spot
    if (!e.alert) {
      if (st && e.canSee) {
        const toYaw = Math.atan2(-(st.p[0] - e.x), -(st.p[2] - e.z));
        // (a weapon light shone on them, or swept over them: they notice it whichever way they're facing, and twice as fast)
        const bm = this.beamAt(e, st, e.tgtD);
        const inFov = Math.abs(U.angDiff(e.yaw, toYaw)) < 1.2 || e.tgtD < 5 || bm > 0.5;
        if (inFov && e.tgtD < def.range * 1.4) {
          // slower through glass, in the dark, and the less of you shows (seeVis: lightK times bodySeen); quicker looking for you
          const rate = (1.7 - e.tgtD / (def.range * 1.4)) * (st.pr ? 0.5 : st.cr ? 0.7 : 1) * 1.3 * (e.suspicious ? 1.8 : 1) * (e.dp ? 2.5 : 1) * (e.seeVis == null ? 1 : e.seeVis) * (1 + bm);
          e.spot += dt * rate;
          if (e.spot >= 1) {
            // caught off guard: police appear close by while they weren't expecting anyone
            const surprised = !e.suspicious && e.tgtD < 10;
            this.alertEnemy(e, true);
            if (surprised) e.surprisedT = 1.5 + Math.random() * 0.8;
          }
        }
      } else e.spot = Math.max(0, e.spot - dt * 0.3);
      if ((e.dp || e.suspicious || e.heard) && this.doorPeek(e, dt)) return;
      if (e.suspicious) {
        // weapon out, watching where the noise came from; settles back down if nothing else happens
        if (e.noise) e.idleYaw = Math.atan2(-(e.noise.x - e.x), -(e.noise.z - e.z));
        e.calmT -= dt;
        if (e.calmT <= 0) { e.suspicious = false; e.noise = null; if (!def.ready) e.drawn = false; }
      } else if (e.post) {
        // posted (a ship's response: a doorway of the room her people are in): there, and watching the way in
        e.drawn = true;
        if (!this.travel(e, e.post, Math.min(2.6, def.speed * 0.8), dt)) e.idleYaw = e.post.yaw;
      } else {
        // pottering about like anyone else in the building
        e.idleT -= dt;
        if (e.idleT <= 0) {
          e.idleT = 2 + Math.random() * 4; e.idleYaw = this.openYaw(e, e.yaw + (Math.random() - 0.5) * 2.6, 2.6);
          e.walkTo = Math.random() < 0.45 ? this.amble(e) : null;
        }
        if (e.walkTo) {
          const dx = e.walkTo.x - e.x, dz = e.walkTo.z - e.z, d = Math.hypot(dx, dz);
          if (d < 0.3) e.walkTo = null;
          else { e.idleYaw = Math.atan2(-dx, -dz); this.moveEntity(e, dx / d, dz / d, Math.min(1.4, def.speed * 0.5), dt); }
        }
      }
      e.yaw += U.angDiff(e.yaw, e.idleYaw) * Math.min(1, dt * (e.suspicious ? 4 : e.walkTo ? 5 : 2));
      return;
    }

    // --- surprised: frozen for a moment, staring at the police, weapon not yet up
    e.drawT = Math.max(0, e.drawT - dt);
    if (e.surprisedT > 0) {
      e.surprisedT -= dt;
      e.cool -= dt; // the initial hesitation runs out during the freeze, not after it
      if (st) e.yaw += U.angDiff(e.yaw, Math.atan2(-(st.p[0] - e.x), -(st.p[2] - e.z))) * Math.min(1, dt * 3);
      e.crouch = e.flinchT > 0; e.aiming = false;
      return;
    }

    // --- alert: fight or hunt
    let mx = 0, mz = 0, sp = 1, faceTo: number | null = null; // (faceTo: where they look as they go, if not the way they're going: sideways along a wall)
    const towards = (tx: number, tz: number) => { const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1; mx = dx / d; mz = dz / d; };
    const huntStep = () => {
      if (!this.flow) return;
      const step = L.flowStep(map, this.flow, e.x, e.z, e.y);
      if (step) towards(step.x, step.z);
      else if (st) towards(st.p[0], st.p[2]);
    };
    e.coverT -= dt;
    e.nadeT -= dt;
    const usesCover = !def.boss && e.type !== 'rusher';
    if (st && e.canSee) { if (e.dp) this.doorShot(e); } else if (this.doorPeek(e, dt)) return;
    // lurking: heard the police but hasn't seen them, so it hides and peeks like anyone else would, gun still
    // away. The moment it sees an officer it draws.
    if (e.lurk) {
      if (st && e.canSee) { e.lurk = false; e.hide = null; e.leanOut = 0; this.draw(e); }
      else {
        if (!e.hide) { e.threat = e.noise || this.nearestOfficer(e); if (!this.seekHide(e)) { e.lurk = false; this.draw(e); } }
        if (e.lurk) {
          if (e.relocate) { e.relocate = false; this.seekHide(e); }
          if (e.hide && this.hideStep(e, dt, def.speed * 1.1)) return;
          e.lurk = false; this.draw(e);
        }
      }
    }

    if (st && e.canSee) {
      // (night: picking you out again in the dark takes them a moment before they can shoot: NIGHT.ACQ)
      if (this.night && e.lostT > 0.3) e.cool = Math.max(e.cool, this.NIGHT.ACQ * (1 - (e.visK || 0)));
      e.lostT = 0;
      e.lastSeen = { x: st.p[0], y: st.p[1], z: st.p[2] };
      if (this.leads(e)) this.callIn(e, st.p[0], st.p[1], st.p[2], 'has eyes on police'); // (again, now and then, as they move: callIn's gap)
      const dx = st.p[0] - e.x, dz = st.p[2] - e.z, d = Math.hypot(dx, dz) || 1;
      const toYaw = Math.atan2(-dx, -dz);
      e.yaw += U.angDiff(e.yaw, toYaw) * Math.min(1, dt * 8);

      // Going through a door in a stack (breach, clear): on to their corner, shooting as they go, not off to cover
      const bo = e.order && (e.order.phase === 'breach' || e.order.phase === 'clear') ? e.order : null;
      // Sent in under an order (pushing, not holding a cordon or covering the way in): on to where they were sent, shooting as they go,
      // not stopped where they first saw them (nor off to cover: the ones behind them in file would stop too). Within a few metres of
      // them, a fight like any other
      const po = !bo && e.order && e.order.role === 'push' && !e.order.cordon && (e.order.phase === 'approach' || e.order.phase === 'enter') && d > this.PUSH_NEAR ? e.order : null;
      if (e.lowRun) { e.lowRun = false; e.cool = Math.max(e.cool, this.RUN.RAISE); } // (running with it lowered: a moment to bring it up)
      // Their point man near, with his shield up: in behind him, standing, shooting over him as he kneels (not off to a crate)
      const pm = !bo && !po ? this.pointOf(e) : null, pmd = pm ? Math.hypot(pm.x - e.x, pm.z - e.z) : 99;
      let bs = pm && pmd < 9 && this.engaged(pm) && L.los(map, e.x, (e.y || 0) + 1, e.z, pm.x, (pm.y || 0) + 1, pm.z) ? this.behind(e, pm, st.p[0], st.p[2], this.pointIdx(e, pm)) : null;
      // Or someone else's shield man they got in behind, having no cover to go to (below): while he's near and still in the fight
      const lent = !bs && !bo && !po && e.shieldBy != null ? this.lentShield(e) : null;
      if (lent && Math.hypot(lent.x - e.x, lent.z - e.z) < 10) bs = this.behind(e, lent, st.p[0], st.p[2], this.lentIdx(e, lent));
      else if (!bs || bo || po) e.shieldBy = undefined;
      if (bs) { e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; }
      // Cover: move to a spot with a crate between us and the target, crouch, pop up to shoot. (Behind a borrowed shield, still
      // looking now and then: cover of their own found, they leave him for it.) None to be had: in behind a shield man near, if any
      if (!bo && !po && (!bs || e.shieldBy != null) && usesCover && !e.cover && e.coverT <= 0) {
        e.coverT = 3 + Math.random() * 3;
        e.cover = this.findCover(e, st);
        e.coverStuck = 0;
        if (e.cover) { e.shieldBy = undefined; bs = null; }
        else if (!bs && !e.def.shield) { const o = this.shieldNear(e, st); if (o) { e.shieldBy = o.id; bs = this.behind(e, o, st.p[0], st.p[2], this.lentIdx(e, o)); } }
        // path there on a flow field seeded at the cover tile (routes through doorways)
        if (e.cover) e.coverFlow = L.flow(map, [L.src(map, e.cover.x, e.cover.y, e.cover.z)]);
      }
      if (bo) {
        const os = this.orderStep(e, dt);
        if (os) { mx = os.mx; mz = os.mz; sp = Math.min(os.sp, 0.55); }
        e.cover = null; e.inCover = false; e.peek = false;
      } else if (po) {
        const os = this.orderStep(e, dt); e.lowRun = false; // (weapon up while they can see them)
        if (os) { mx = os.mx; mz = os.mz; sp = Math.min(os.sp, 0.7); } else { mx = 0; mz = 0; }
        e.cover = null; e.inCover = false; e.peek = false;
      } else if (bs) {
        const bd = Math.hypot(bs.x - e.x, bs.z - e.z);
        if (bd > 0.25) { towards(bs.x, bs.z); sp = bd > 1.5 ? 0.8 : 0.45; } else { mx = 0; mz = 0; }
      } else if (e.cover) {
        const cd = Math.hypot(e.cover.x - e.x, e.cover.z - e.z);
        if (cd > 0.25) {
          const step = cd > 1.6 && e.coverFlow ? L.flowStep(map, e.coverFlow, e.x, e.z, e.y) : null;
          if (step) towards(step.x, step.z); else towards(e.cover.x, e.cover.z);
          e.inCover = false; e.peek = false;
          e.coverStuck += dt;
          if (e.coverStuck > 6) { e.cover = null; e.coverT = 2; }
        } else {
          e.inCover = true;
          e.coverCheckT = (e.coverCheckT || 0) - dt;
          if (e.coverCheckT <= 0) {
            e.coverCheckT = 0.3;
            if (!this.coverValid(e.cover, st, def)) { e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.coverT = 0.5; }
          }
        }
      } else if (d > def.pref * 1.25 && this.brave(e) && !(e.guard && Math.hypot(e.x - map.extract.x, e.z - map.extract.z) > 6)) { huntStep(); sp = 0.8; }
      else if (d > def.pref * 1.25) { mx = 0; mz = 0; } // hold the position and shoot from where they are
      else if (d < def.pref * 0.6 && e.type !== 'rusher') { mx = -dx / d; mz = -dz / d; sp = 0.6; }
      else {
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafeT = 0.7 + Math.random() * 1.6; e.strafe = [-1, 0, 1][Math.floor(Math.random() * 3)]; }
        mx = (-dz / d) * e.strafe; mz = (dx / d) * e.strafe; sp = 0.5;
      }
      // a civilian in the way: no shot through them. They step out to the side the civilian isn't on (from cover too: it's no use
      // to them now), unless they're going through a door in a stack, and fire once the line's clear.
      const scr = this.screenedBy(e, st.p[0], st.p[2], st.p[1]);
      if (scr && !bo) {
        const lx = -dz / d, lz = dx / d, on = (scr.x - e.x) * lx + (scr.z - e.z) * lz, side = on > 0.02 ? -1 : on < -0.02 ? 1 : e.id % 2 ? 1 : -1;
        mx = lx * side; mz = lz * side; sp = 0.7; e.strafe = side; e.strafeT = 0.8;
        if (e.cover) { e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.coverT = 1.5; }
      }

      // shooting: from cover, stand up first (a short window where the head is exposed)
      if (d < def.range && e.drawT <= 0 && !e.flinchT && !scr) {
        e.cool -= dt;
        const ready = def.aimTime ? e.aiming || e.cool <= 0 : e.cool <= 0;
        if (e.inCover && ready && !e.peek) { e.peek = true; e.peekT = this.PEEK.UP; e.peekOut = this.PEEK.MIN; e.peekDone = false; }
        if (e.peek && e.peekT > 0) e.peekT -= dt;
        const canFire = !e.inCover || (e.peek && e.peekT <= 0);
        if (canFire) {
          if (def.aimTime) {
            if (!e.aiming && e.cool <= 0) { e.aiming = true; e.aimT = def.aimTime * (this.night ? 1 + this.NIGHT.AIMT * (1 - (e.visK || 0)) : 1); } // (longer on someone hard to see, at night)
            if (e.aiming) {
              sp = 0;
              e.aimT -= dt;
              if (e.aimT <= 0 && this.onTarget(e, st, dt)) { this.fire(e, p as LivePlayer); e.aiming = false; e.peekDone = true; e.cool = U.rf(def.pause[0], def.pause[1]); }
            }
          } else if (e.cool <= 0 && this.onTarget(e, st, dt)) {
            if (e.burstLeft <= 0) e.burstLeft = def.burst[0] + Math.floor(Math.random() * (def.burst[1] - def.burst[0] + 1));
            this.fire(e, p as LivePlayer);
            e.burstLeft--;
            if (e.burstLeft > 0) e.cool = def.rof;
            else { e.cool = U.rf(def.pause[0], def.pause[1]); e.peekDone = true; }
          }
        }
      }
    } else {
      e.aiming = false; e.peekDone = true; e.leanOut = 0;
      // just lost sight of them (round a door, behind its leaf): about half keep firing for a moment at where
      // they were, blind. Rounds rarely land, and only if you're still there and in the open.
      if (e.lostT === 0) {
        e.pushing = false; e.pushWait = 0; // (lost sight again: a new push, if they make one)
        e.blind = !def.aimTime && Math.random() < 0.5;
        if (e.order && this.inBreach(e.order)) { if ((e.sawAt ?? -99) > (e.order.resAt ?? e.order.at)) this.resumeBreach(e); } // (on a breach: fought whoever it was, and back to it)
        else if (e.order && !e.order.cordon && e.lastSeen && (e.sawAt || -99) > e.order.at && this.clock - e.order.rt > 4) this.retarget(e, e.lastSeen); // (one holding a cordon stays on it) // (the search starts again from where they were seen)
      }
      e.lostT += dt;
      if (e.blind && !e.flinchT && st && e.drawn && e.lastSeen && e.lostT < 1.1 && e.tgtD < def.range && !this.screenedBy(e, e.lastSeen.x, e.lastSeen.z, e.lastSeen.y || 0)) {
        e.cool -= dt;
        if (e.cool <= 0) { this.fire(e, p as LivePlayer, true); e.cool = U.rf(0.15, 0.4); }
      } else e.cool = Math.max(e.cool, 0.6);
      const leash = Math.hypot(e.x - e.home.x, e.z - e.home.z) < 12;
      if (this.night && !e.order) this.nightSearch(e); // (in the dark they go and look for themselves)
      if (e.order) {
        // under a leader's order (callIn): to the spot by its own way in, and then searching outward from it
        e.lowRun = false; // (orderStep says if they're running)
        const os = this.orderStep(e, dt);
        if (os) { mx = os.mx; mz = os.mz; sp = os.sp; e.holding = false; if (os.yaw != null) faceTo = os.yaw; } else e.holding = true;
      } else if (e.post && !e.canSee && (!e.lastSeen || e.lostT > 5) && Math.hypot(e.post.x - e.x, e.post.z - e.z) > 0.6) {
        // posted (a ship's response) and lost them: back to the doorway they were put on
        const L2 = Level, map2 = this.map!, g = e.post; if (!g.flow) g.flow = L2.flow(map2, [L2.src(map2, g.x, g.y, g.z)]);
        const d = Math.hypot(g.x - e.x, g.z - e.z), step = d > 3 || !this.clearTo(e, g) ? L2.flowStep(map2, g.flow, e.x, e.z, e.y) : null, tx = step ? step.x : g.x, tz = step ? step.z : g.z, dd = Math.hypot(tx - e.x, tz - e.z) || 1;
        mx = (tx - e.x) / dd; mz = (tz - e.z) / dd; sp = 0.8; e.cover = null; e.inCover = false; e.holding = false;
      } else if (this.brave(e) && !this.ground() && e.lastSeen && e.lostT < 12 && leash && Math.hypot(e.lastSeen.x - e.x, e.lastSeen.z - e.z) > 2) { // (not on the ground: there they wait)
        // a push on where police were last seen. A grenade goes first, if they have one and it's far enough off to be safe (5-20 m;
        // not at someone behind bulletproof glass: it'd come back at them): thrown as the push starts, once a push, and they hold
        // where they are till it's gone off, then go in behind it
        if (!e.pushing) {
          e.pushing = true;
          const ld = Math.hypot(e.lastSeen.x - e.x, e.lastSeen.z - e.z);
          if (ld > 5 && ld < 20 && !e.proof && this.tryNade(e, e.lastSeen.x, e.lastSeen.z)) e.pushWait = 3.0;
        }
        if ((e.pushWait || 0) > 0) { e.pushWait! -= dt; e.holding = true; }
        else { e.cover = null; e.inCover = false; e.holding = false; huntStep(); sp = 0.6; } // advance cautiously toward where police were last seen
      } else {
        // dig in: stay put (in cover if they have it), crouched, watching the way the threat came from
        e.holding = true;
        const look = e.lastSeen || e.noise;
        if (look) e.yaw += U.angDiff(e.yaw, Math.atan2(-(look.x - e.x), -(look.z - e.z))) * Math.min(1, dt * 3);
      }
      if (mx || mz) e.yaw += U.angDiff(e.yaw, faceTo != null ? faceTo : Math.atan2(-mx, -mz)) * Math.min(1, dt * 6);
    }
    if (e.peek) { e.peekOut! -= dt; if (e.peekDone && e.peekOut! <= 0) e.peek = false; }
    const corner = e.cover && e.cover.lean;
    if (st && e.canSee) e.holding = false;
    e.crouch = e.flinchT > 0 || (e.inCover && !e.peek && !corner) || (e.holding && !mx && !mz && !e.inCover) || (e.reloadT > 0 && e.inCover && !corner)
      || (!!e.def.shield && this.engaged(e)); // (behind a shield in a fight: down behind it, the legs covered, the rest of the team shooting over it)
    e.leanOut = e.inCover && e.peek && corner ? e.cover!.lean : 0;

    if ((mx || mz) && !e.flinchT) this.moveEntity(e, mx, mz, def.speed * sp, dt);
  },

  // where a player's head actually is: leaning (Q/E) moves it sideways off their feet position
  headXZ(st: PState) {
    const ln = st.ln || 0, yw = st.yw || 0;
    return [st.p[0] + Math.cos(yw) * ln * 0.38, st.p[2] - Math.sin(yw) * ln * 0.38];
  },
  // On the ground (any level but a ship being boarded) they're slower to come for you: once they've lost sight of you nobody pushes on
  // where you were seen, and cover's only taken that's no nearer you than they are. (Hunting you while they can see you, a leader's
  // team sent your way and a search in the dark all still happen.)
  ground() { return !(this.map && this.map.sp); },
  brave(e: Enemy) { return !!e.def.hunt && e.morale > 0.6; },
  // Bold suspects go and look. Someone heard through a door (footsteps, a door, a shot), they think the police are behind it:
  // they get beside it, on their own side of the wall and the far side of the frame from the sound, gun out, and listen; then ease a shut door open and
  // lean out across the frame for a look, back, and once or twice more. See anyone, and it's the lean-out-and-shoot of a corner
  // (doorShot). Shot at, hurt or rattled, they leave it, and it's a while before they'll try again.
  //   REACH: how far off a door they'll go to (m); BEHIND: how far behind it the sound can be, through the building;
  //   HEARD: how long they'll act on it (s); TUCK: off the door's line, into their own room; EDGE: past the frame, to stand;
  //   LISTEN: how much further off than anyone else they catch a footstep
  DOORPEEK: { REACH: 9, BEHIND: 12, HEARD: 6, TUCK: 0.8, EDGE: 0.4, LEAN: 0.55, LISTEN: 2.4 },
  // what a suspect who's bold makes of a sound: about where it was (they're going by ear)
  noted(e: Enemy, x: number, y: number, z: number) { if (e.bold) e.heard = { x: x + (Math.random() - 0.5) * 1.5, y, z: z + (Math.random() - 0.5) * 1.5, at: this.clock }; },
  // the door with what they heard behind it, and the spot beside it to look from
  doorFor(e: Enemy) {
    const L = Level, map = this.map!, P = this.DOORPEEK, h = e.heard!, field = this.soundField(h.x, h.z, h.y || 0), ey = 1.6 * e.def.scale;
    let best: DoorPeekSpot | null = null, bs = 1e9;
    for (const d of map.doors) {
      const y = d.fy || 0, dist = Math.hypot(d.x - e.x, d.z - e.z);
      if (d.kind === 'vault' || d.fallen || dist > P.REACH || Math.abs(y - (e.y || 0)) > 1.5) continue;
      const nx = d.axis === 'x' ? 1 : 0, nz = 1 - nx, tx = nz, tz = nx, s = (e.x - d.x) * nx + (e.z - d.z) * nz < 0 ? -1 : 1, half = (d.w || L.TS) / 2;
      const near = this.heardAt(field, d.x + nx * s * 0.9, d.z + nz * s * 0.9, y), far = this.heardAt(field, d.x - nx * s * 0.9, d.z - nz * s * 0.9, y);
      if (!(far <= P.BEHIND) || !(far < near - 0.5) || this.heardAt(field, e.x, e.z, e.y) < near - 1) continue; // (it's through this door they heard it)
      const score = dist + far * 0.5;
      if (score >= bs) continue;
      let claimed = false;
      for (const o of this.enemies.values()) if (o !== e && o.dp && o.dp.d === d) { claimed = true; break; }
      if (claimed) continue;
      const fm = L.floorMap(map, d.fl || 0), m = d.mirror ? -1 : 1, yaw = Math.atan2(nx * s, nz * s); // (facing the door square on; m: the latch's side, the leaf hanging from the other)
      // the far side of the frame from the sound, so the look goes across the doorway towards it; the leaf swings out from its
      // hinge (+x through an x door, -z through a z door), and they'll not stand where it comes round
      const ht = (h.x - d.x) * tx + (h.z - d.z) * tz, sides = Math.abs(ht) > 0.5 ? [ht > 0 ? -1 : 1, ht > 0 ? 1 : -1] : [m, -m], leafS = d.axis === 'x' ? 1 : -1;
      for (const side of sides) {
        if (side === -m && s === leafS) continue;
        const off = side * (half + P.EDGE), x = d.x + nx * s * P.TUCK + tx * off, z = d.z + nz * s * P.TUCK + tz * off, px = x - tx * side * P.LEAN, pz = z - tz * side * P.LEAN;
        if (L.tile(fm, Math.floor(x / L.TS), Math.floor(z / L.TS)) !== 0 || L.tile(fm, Math.floor(px / L.TS), Math.floor(pz / L.TS)) !== 0) continue;
        if (!this.leanClear(x, z, px, pz, y + ey, y) || L.los(map, x, y + ey, z, d.x - nx * s * 1.5, y + ey, d.z - nz * s * 1.5)) continue; // (out of the doorway's line, with a clear way to lean)
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw), lean = (px - x) * -fz + (pz - z) * fx > 0 ? 1 : -1; // (which way it is, facing the door)
        best = { d, x, y, z, px, pz, lean, yaw, fl: d.fl || 0, phase: 'go', t: 8, n: 1 + Math.floor(Math.random() * 3) };
        bs = score;
        break;
      }
    }
    if (best) best.flow = L.flow(map, [L.src(map, best.x, best.y, best.z)]);
    return best;
  },
  // Returns true while it's what they're doing.
  doorPeek(e: Enemy, dt: number) {
    const U = G_U, L = Level, P = this.DOORPEEK, def = e.def;
    const rattled = e.flinchT! > 0 || e.suppressT > 0 || e.flashT! > 0 || e.flashRec! > 0 || e.morale < def.morale * 0.7 || (e.str != null && e.str < 0.6);
    const stop = () => { e.dp = null; e.leanOut = 0; e.crouch = false; e.dpOk = this.clock + 10 + Math.random() * 8; return false; };
    if (e.dp && rattled) return stop();
    if (!e.dp) {
      if (!e.bold || rattled || e.reloadT > 0 || e.guard || this.clock < (e.dpOk || 0) || !e.heard || this.clock - e.heard.at > P.HEARD) return false;
      if (e.alert && (this.clock - (e.engagedAt || -99) < 3 || e.lostT < 1.5 && e.lastSeen)) return false; // (not in the middle of a fight)
      if ((e.dpT = (e.dpT || 0) - dt) > 0) return false;
      e.dpT = 0.5;
      if (!(e.dp = this.doorFor(e))) return false;
      e.lurk = false; e.hide = null; e.cover = null; e.inCover = false; e.peek = false; e.holding = false; e.walkTo = null; e.aiming = false;
      this.suspect(e, e.heard.x, e.heard.z); // (unaware till now: wary, gun out)
      if (!e.drawn) this.draw(e);
    }
    const q = e.dp, turn = (yaw: number, k: number) => { e.yaw += U.angDiff(e.yaw, yaw) * Math.min(1, dt * k); };
    if (!e.alert) e.calmT = Math.max(e.calmT, 4); // (not settling down halfway through it)
    q.t -= dt;
    if (q.phase === 'go') {
      const d = Math.hypot(q.x - e.x, q.z - e.z);
      if (d > 0.3) {
        if (q.t <= 0) return stop();
        const step = d > 1.6 ? L.flowStep(this.map!, q.flow!, e.x, e.z, e.y) : null, tx = step ? step.x : q.x, tz = step ? step.z : q.z, dx = tx - e.x, dz = tz - e.z, dd = Math.hypot(dx, dz) || 1;
        turn(Math.atan2(-dx, -dz), 8);
        e.crouch = false; e.leanOut = 0;
        this.moveEntity(e, dx / dd, dz / dd, def.speed * (d < 3 ? 0.55 : 0.8), dt); // (slowing as they get there)
        return true;
      }
      q.phase = 'set'; q.t = 0.5 + Math.random() * 0.7;
    }
    if (q.phase === 'set') {
      turn(q.yaw, 5);
      if (q.t > 0) return true;
      if (!q.d.open && !q.d.fallen && SpaceSv.crewMayOpen(q.d, e)) { this.setDoor(q.d.id, true); q.phase = 'open'; q.t = 0.5; return true; }
      q.phase = 'look'; q.t = 1.4 + Math.random();
    }
    if (q.phase === 'open') {
      if (q.t > 0) return true;
      q.phase = 'look'; q.t = 1.4 + Math.random();
    }
    if (q.phase === 'look') {
      turn(q.yaw, 5);
      e.leanOut = q.lean;
      if (q.t > 0) return true;
      e.leanOut = 0;
      if (--q.n <= 0) return stop();
      q.phase = 'back'; q.t = 0.8 + Math.random() * 0.8;
      return true;
    }
    if (q.t <= 0) { q.phase = 'look'; q.t = 1.4 + Math.random(); } // (back behind the frame, and out again)
    return true;
  },
  // They've seen someone from beside the door: it's a corner, and they're at it with the gun up, and quick about it (already out
  // for a look, quicker still). Off their spot, or with the door's line open on you, it's no corner, and coverValid drops it.
  doorShot(e: Enemy) {
    const q = e.dp!, out = !!e.leanOut, there = Math.hypot(q.x - e.x, q.z - e.z) < 0.3;
    e.dp = null; e.dpOk = this.clock + 10 + Math.random() * 8;
    e.cool = Math.min(e.cool, 0.3);
    if (!there) { e.leanOut = 0; return; }
    e.cover = { x: q.x, y: q.y, z: q.z, lean: q.lean, px: q.px, pz: q.pz, fl: q.fl };
    e.inCover = true; e.peek = true; e.peekT = out ? 0.2 : 0.45; e.peekOut = this.PEEK.MIN; e.peekDone = false; e.coverT = 3; e.coverStuck = 0; e.coverFlow = null;
  },

  // ---------------------------------------------------------------- the leader (js/data.ts ENEMIES.leader)
  // He calls it in. Spotting police, being shot at, or hearing a noise gets him on the radio (he stops, a hand to his headset, and barks
  // it: everyone near enough hears that too), and a moment later every suspect within RADIO.R of him (as the crow flies, and a way
  // through the building: sound's way, soundField) is alerted to where he says: dispatch. Then he's at it again every RADIO.GAP seconds
  // while he has eyes on police. The word goes to his own fireteam (teamForm), not everyone in earshot. Take him out, down, arrest him or
  // have him give up and the next in rank has the team and its plan: teamCheck.
  RADIO: { R: 25, GAP: 12, KEY: 1.5, LIFE: 75, HOLD: 5 },
  // metres to a flow field's source from (x, y, z), -1: no way. (Right up against something, where their ways don't go: from the
  // nearest cell beside it that they do.)
  flowDist(flow: Int16Array, x: number, y: number, z: number) {
    const map = this.map!, L = Level, TS = L.TS;
    let i;
    if (map.floors) i = L.navNode(map, x, y, z);
    else { const tx = Math.floor(x / TS), tz = Math.floor(z / TS); i = tx < 0 || tz < 0 || tx >= map.W || tz >= map.H ? -1 : tz * map.W + tx; }
    if (i < 0) return -1;
    if (flow[i] >= 0) return flow[i] * TS;
    const W = map.W;
    if (!this.aiProp || !this.aiProp[i]) return -1; // (only by furniture: a doorway they can't open is no way in)
    let b = -1;
    for (const o of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) { const k = i + o; if (k >= 0 && k < flow.length && flow[k] >= 0 && (b < 0 || flow[k] < b)) b = flow[k]; }
    return b < 0 ? -1 : (b + 1) * TS;
  },
  // Rooms her people have been well inside of (not just in the doorway) without seeing anyone there: searched, as much as if a stack
  // had cleared them (this.cleared). Every so often (js/spaceserver.ts respondTick).
  markSeen() {
    const c = this.clock, TS = Level.TS, map = this.map!;
    for (const e of this.enemies.values()) {
      if (e.def.civ || !this.able(e) || this.engaged(e)) continue;
      const ri = this.roomOf(e.x, e.y || 0, e.z); if (ri < 0) continue;
      const r = map.rooms[ri], m = 1.2; // (a metre and more inside its walls)
      if (e.x < r.x * TS + m || e.x > (r.x + r.w) * TS - m || e.z < r.z * TS + m || e.z > (r.z + r.h) * TS - m) continue;
      this.cleared.set(ri, c);
    }
  },
  // Where the host's people can't go, for their ways about (Level.flow, map.aiNo): a cell furniture stands so far into that someone
  // can't get through it (a box AI_GAP or less from its middle, tall enough to walk into), and a doorway they may not open (locked to
  // them, sealed). The level's own grid (map.t) blocks only the cells furniture covers the middle of: walls and the like for everyone.
  AI_GAP: 0.3,
  aiProp: null as Uint8Array | null, // (the cells furniture stands too far into, every floor's: aiMask)
  aiMask(map: LvMap) {
    const L = Level, TS = L.TS, W = map.W, WH = W * map.H, NF = map.floors ? map.floors.length : 1, R = this.AI_GAP;
    const mask = new Uint8Array(NF * WH), fys = Array.from({ length: NF }, (_, f) => L.floorMap(map, f).fy || 0);
    const tOf = (f: number) => (map.floors ? map.floors[f].t : map.t);
    for (const p of map.propList || []) for (const b of p.boxes || []) {
      if (b.walk || b.h < 0.45 || b.y0 > 0.9 || !(b.hx > 0) || !(b.hz > 0)) continue;
      const gy = b.gy ?? p.gy ?? 0; let f = 0, fd = 1e9; fys.forEach((fy, k) => { if (Math.abs(fy - gy) < fd) { fd = Math.abs(fy - gy); f = k; } });
      const t = tOf(f);
      for (let z = Math.floor((b.cz - b.hz - R) / TS); z <= Math.floor((b.cz + b.hz + R) / TS); z++) for (let x = Math.floor((b.cx - b.hx - R) / TS); x <= Math.floor((b.cx + b.hx + R) / TS); x++) {
        if (x < 0 || z < 0 || x >= W || z >= map.H || t[z * W + x] !== 0) continue;
        const ccx = (x + 0.5) * TS, ccz = (z + 0.5) * TS;
        if (Math.abs(ccx - b.cx) <= b.hx + R && Math.abs(ccz - b.cz) <= b.hz + R) mask[f * WH + z * W + x] = 1;
      }
    }
    this.aiProp = mask;
    map.aiNo = (i: number, f: number) => {
      if (mask[f * WH + i]) return true;
      const fm: any = f ? map.floors[f] : map;
      if (fm.t[i] !== 3) return false;
      const d = (fm.doorAt || map.doorAt) && (fm.doorAt || map.doorAt).get(i);
      return !!d && !d.open && !SpaceSv.crewMayOpen(d);
    };
  },
  // A flow field to a point and the cells beside it (the point itself may be under a crate or in a doorframe)
  flowTo(x: number, y: number, z: number) {
    const L = Level, map = this.map!, [tx, tz, f] = L.src(map, x, y, z), src: number[][] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) src.push([tx + dx, tz + dz, f]);
    return L.flow(map, src);
  },
  callIn(l: Enemy, x: number, y: number, z: number, why: string) {
    const c = this.clock;
    if (l.state !== 'normal' || l.down || c < (l.callAt || 0) || (l.radioT || 0) > 0) return;
    if (this.breaching(l)) return; // (his team's on a room: that first)
    l.callAt = c + this.RADIO.GAP; l.radioT = this.RADIO.KEY; l.callTgt = { x, y, z }; l.calls = (l.calls || 0) + 1;
    this.logCall(l, `${why}: on the radio, police at (${x.toFixed(0)}, ${z.toFixed(0)})`);
    l.cover = null; l.inCover = false; l.peek = false; l.leanOut = 0; l.aiming = false; l.crouch = false;
    if (!l.alert) this.alertEnemy(l, false);
    SvNet.broadcast({ t: 'radio', e: l.id });
  },
  logCall(l: Enemy, m: string) { const a = l.callLog || (l.callLog = []); a.push(`${this.clock.toFixed(0)}s ${m}`); if (a.length > 14) a.shift(); },
  // the leader's keying the radio: he's stopped, facing the spot, hand to his headset; when he's done the word goes out
  leaderTick(l: Enemy, dt: number) {
    if (!(l.radioT! > 0) || !l.callTgt) return false;
    l.radioT! -= dt;
    l.yaw += G_U.angDiff(l.yaw, Math.atan2(-(l.callTgt.x - l.x), -(l.callTgt.z - l.z))) * Math.min(1, dt * 3);
    l.aiming = false; l.crouch = false; l.cool = Math.max(l.cool, 0.4);
    if (l.radioT! <= 0) { l.radioT = 0; this.dispatch(l); }
    return true;
  },
  // The word goes out: his team is sent to the spot (dispatchGroup), himself with it: stacked on a door of it, or each by its own way in
  // where there are none (and one who leads only himself goes and looks on his own word).
  dispatch(l: Enemy) {
    const T = l.callTgt!, fT = this.flowTo(T.x, T.y, T.z);
    if (!this.leads(l)) { this.logCall(l, 'no team to send'); return; }
    const who: Enemy[] = [];
    let skipped = 0;
    for (const e of this.enemies.values()) {
      if (e.team !== l.id || e.def.civ || e.def.boss || e.state !== 'normal' || e.down || e.broken || e.flashT! > 0 || e.guard || e.post) continue;
      if (this.engaged(e)) { skipped++; continue; } // (in a fight: they stay in it, and pick the plan up again when the next word comes)
      if (this.flowDist(fT, e.x, e.y || 0, e.z) < 0) continue;
      who.push(e);
    }
    if (!who.length) { this.logCall(l, skipped ? `nobody to send: ${skipped} in a fight` : 'nobody in his team to send'); return; }
    this.dispatchGroup(T, who, l.id, (m) => this.logCall(l, m));
  },
  // A leader's told where to go by those over him (a ship's sweep: js/spaceserver.ts respondTick): on the radio to his team at once,
  // not waiting out the gap since his last call. False: he can't (on the radio already, down, given up).
  command(l: Enemy, x: number, y: number, z: number, why: string) {
    if (!this.leads(l) || l.state !== 'normal' || l.down || l.broken || (l.radioT || 0) > 0) return false;
    l.callAt = 0; this.callIn(l, x, y, z, why);
    return (l.radioT || 0) > 0;
  },
  // A group sent to clear round a spot (T): each by its own way in (the doors round it), pushing or holding, then searching outward (orderStep)
  dispatchGroup(T: { x: number; y: number; z: number }, who: Enemy[], by: number, log?: (m: string) => void) {
    const c = this.clock, map = this.map!, L = Level, TS = L.TS, R = this.RADIO, fT = this.flowTo(T.x, T.y, T.z);
    // the ways in
    const entries: OrderSpot[] = [], want = Math.min(5, Math.max(2, Math.ceil(who.length / 2)));
    const mk = (x: number, y: number, z: number, kind: 'door' | 'point') => entries.push({ x, y, z, flow: this.flowTo(x, y, z), kind, n: 0 });
    const doors: { d: LvDoor; g: number }[] = [];
    for (const d of map.doors) {
      if (d.kind === 'vault' || d.fallen || Math.abs((d.fy || 0) - T.y) > 1.5 || Math.hypot(d.x - T.x, d.z - T.z) > 22) continue;
      const g = this.flowDist(fT, d.x, d.fy || 0, d.z);
      if (g >= 0 && g <= 30) doors.push({ d, g });
    }
    doors.sort((a, b) => a.g - b.g);
    for (const { d } of doors) { if (entries.length >= want) break; if (!entries.some((q) => Math.hypot(q.x - d.x, q.z - d.z) < 4)) mk(d.x, d.fy || 0, d.z, 'door'); }
    if (entries.length < Math.min(3, who.length)) { // not enough doors: points 7 to 20 m round it, one in each direction (eighths of a circle)
      const used = new Set(entries.map((q) => Math.floor(((Math.atan2(q.z - T.z, q.x - T.x) + Math.PI) / (Math.PI * 2)) * 8) % 8));
      for (const sp of G_U.shuffle(Math.random, map.enemySpots.slice())) {
        if (entries.length >= want) break;
        const f = sp[2] || 0, x = (sp[0] + 0.5) * TS, z = (sp[1] + 0.5) * TS, y = L.spotY(map, x, z, f);
        if (Math.abs(y - T.y) > 1.5) continue;
        const g = this.flowDist(fT, x, y, z), sec = Math.floor(((Math.atan2(z - T.z, x - T.x) + Math.PI) / (Math.PI * 2)) * 8) % 8;
        if (g < 7 || g > 20 || used.has(sec)) continue;
        used.add(sec); mk(x, y, z, 'point');
      }
    }
    if (!entries.length) mk(T.x, T.y, T.z, 'point');
    const split: string[] = [];
    const give = (e: Enemy, q: OrderSpot, hold: boolean, delay: number, rush = false) => {
      e.order = { by, role: hold ? 'hold' : 'push', phase: 'approach', x: T.x, y: T.y, z: T.z, entry: q, tflow: fT, at: c, until: c + R.LIFE, holdUntil: 0, rest: delay + Math.random() * 0.6, leg: 'run', legT: 0, cv: null, cvFlow: null, sp: null, ring: 6, done: [], look: 0, delay, rt: c };
      if (rush) { e.order.rush = true; e.order.rest = Math.random() * 0.3; }
      e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.lurk = false; e.hide = null; e.dp = null; e.heard = undefined; e.walkTo = null; e.pendingAlert = -1; e.dpOk = c + 20;
      e.noise = { x: T.x, z: T.z };
      this.alertEnemy(e, false);
      split.push(`#${e.id}>${q.kind}${entries.findIndex((r) => Math.hypot(r.x - q.x, r.z - q.z) < 0.1)}${q.grp ? 'S' : ''}${hold ? 'H' : ''}`); // (S: in its stack)
    };
    // a stack's door: one of the room's own (it opens into the room they're going to: one side of it is in it)
    const room = this.roomOf(T.x, T.y, T.z), map2 = this.map!;
    const intoRoom = (q: OrderSpot) => { if (room < 0) return false; const d = map2.doors.find((dd) => Math.hypot(dd.x - q.x, dd.z - q.z) < 0.1); if (!d) return false; const nx = d.axis === 'x' ? 1 : 0, nz = 1 - nx; return [1, -1].some((s) => this.roomOf(d.x + nx * s * 1.0, d.fy || 0, d.z + nz * s * 1.0) === room); };
    const doorQ = entries.filter((q) => q.kind === 'door' && intoRoom(q)), stackers = who.filter((e) => !e.def.aimTime);
    // a fight there already (someone of theirs in it, in the room or near the spot): they're reinforcing it, and go straight in, each
    // by the way in nearest him, no stack and nobody holding back
    const fight = [...this.enemies.values()].some((o) => !o.def.civ && this.able(o) && (o.canSee || c - (o.firedAt ?? -99) < this.ENGAGED) // (there, and fighting: has them in sight, or has been shooting)
      && ((room >= 0 && this.roomOf(o.x, o.y || 0, o.z) === room) || Math.hypot(o.x - T.x, o.z - T.z) < this.REINFORCE));
    if (fight) {
      for (const e of who) {
        let best: OrderSpot | null = null, bs = 1e9;
        for (const q of doorQ.length ? doorQ : entries) { const g = this.flowDist(q.flow, e.x, e.y || 0, e.z); if (g >= 0 && g < bs) { bs = g; best = q; } } // (the room's own doors, if it has any)
        if (best) give(e, best, !!e.def.aimTime, 0, true);
      }
      if (log) log(`reinforcing the fight: straight in, no stack: ${split.join(' ')}`);
      return;
    }
    if (doorQ.length && stackers.length) {
      // A stack, the team's own: one door for all of them, the one nearest them on the whole, unless another team's stacking on it
      // (then another, if there is one). On the wall beside it, the nearest first (the point man), behind anyone already there.
      const near = (q: OrderSpot, r: OrderSpot) => Math.hypot(q.x - r.x, q.z - r.z) < 0.5, taken = new Map<OrderSpot, number>();
      for (const o of this.enemies.values()) {
        const oo = o.order; if (!oo || !oo.slot || !oo.entry.grp || oo.entry.grp.cleared || who.includes(o) || !this.able(o)) continue;
        const q = doorQ.find((r) => near(r, oo.entry)); if (q) taken.set(q, Math.max(taken.get(q) || 0, (oo.slotK || 0) + 1));
      }
      // every door into the room another team's stack already: this team doesn't pile on behind them, it holds round it instead
      if (doorQ.every((q) => taken.has(q)) && this.cordon(T, fT, room, who, give)) {
        if (log) log(`every door taken: cordon ${split.join(' ')}`);
        return;
      }
      let door = doorQ[0], ds = 1e9;
      for (const q of doorQ) {
        const gs = stackers.map((e) => this.flowDist(q.flow, e.x, e.y || 0, e.z)).filter((g) => g >= 0); if (!gs.length) continue;
        const sc = gs.reduce((a, b) => a + b, 0) / gs.length + (taken.has(q) ? 25 : 0); if (sc < ds) { ds = sc; door = q; }
      }
      const order = stackers.map((e) => ({ e, g: this.flowDist(door.flow, e.x, e.y || 0, e.z) })).filter((a) => a.g >= 0).sort((a, b) => (b.e.def.shield ? 1 : 0) - (a.e.def.shield ? 1 : 0) || a.g - b.g).map((a) => a.e); // (one with a shield the point man)
      const grp: StackGrp = { by, ids: order.map((e) => e.id), ready: new Set(), first: null, go: null, at: c, inside: new Set(), cleared: false, room };
      // another team stacking on the same room and not gone yet: the two leaders will go together
      for (const o of this.enemies.values()) { const og = o.order && o.order.entry.grp; if (!og || og === grp || og.by === by || og.go != null || og.cleared || (room >= 0 ? og.room !== room : true)) continue;
        const sy = og.sync || (og.sync = { grps: [og] }); if (!sy.grps.includes(grp)) sy.grps.push(grp); grp.sync = sy; break; }
      const q: OrderSpot = Object.assign({}, door, { grp, n: order.length }); // (the team's own copy of the way in: its stack)
      const k0 = taken.get(door) || 0;
      order.forEach((e, k) => { give(e, q, false, 0); this.stackSlot(e, q, k0 + k, k, fT); });
      for (const e of who) if (e.def.aimTime) give(e, q, true, 0); // (a lookout covers the door from where he is)
    } else {
      // no doors to it (out in the open): each takes the way in it's nearest, less for every other that's taken it
      who.sort((a, b) => (b.point ? 1 : 0) - (a.point ? 1 : 0) || Math.hypot(a.x - T.x, a.z - T.z) - Math.hypot(b.x - T.x, b.z - T.z)); // (a point man first: he pushes, they follow)
      const pt = who[0] && who[0].point && !who[0].def.aimTime ? who[0] : null;
      if (pt) { // (with a point man: he takes the way in nearest him, and the rest go with him, in file behind him: orderStep)
        let best: OrderSpot | null = null, bs = 1e9;
        for (const q of entries) { const g = this.flowDist(q.flow, pt.x, pt.y || 0, pt.z); if (g >= 0 && g < bs) { bs = g; best = q; } }
        if (best) { best.n++; for (const e of who) give(e, best, !!e.def.aimTime, 0); if (log) log(`with point man #${pt.id} by ${best.kind}${entries.indexOf(best)}: ${split.join(' ')}`); return; }
      }
      for (const e of who) {
        let best: OrderSpot | null = null, bs = 1e9;
        for (const q of entries) { const g = this.flowDist(q.flow, e.x, e.y || 0, e.z); if (g < 0) continue; const sc = g + 14 * q.n; if (sc < bs) { bs = sc; best = q; } }
        if (!best) continue;
        const hold = best.n === 1 || !!e.def.aimTime, delay = best.n >= 2 ? 3 * (best.n - 1) : 0;
        if (!e.def.aimTime) best.n++; // (a lookout holds wherever it is and doesn't take the way in from the rest)
        give(e, best, hold, delay);
      }
    }
    if (log) log(`dispatched ${split.length} (${entries.length} ways in: ${entries.map((q, i) => `${q.kind}${i}@${q.x.toFixed(0)},${q.z.toFixed(0)}`).join(' ')}): ${split.join(' ')}`);
  },
  // A team with no way in of its own left (every door into the room has another team's stack on it): it holds round the room
  // instead. Two on the police's way out (the first door on the way from the room to the extraction, a few metres past it on the
  // way out, watching it: CORDON.EXIT; with none near enough, a spot on that way a little off the room, watching the room), the rest at defensive spots (cover CORDON.COVER metres off by the building's ways, watching
  // the room). False: nowhere to hold (they stack behind the others after all).
  CORDON: { EXIT: [4, 30], COVER: [6, 16], ON_EXIT: 2 },
  cordon(T: { x: number; y: number; z: number }, fT: Int16Array, room: number, who: Enemy[], give: (e: Enemy, q: OrderSpot, hold: boolean, delay: number) => void) {
    const map = this.map!, L = Level, K = this.CORDON, ex = map.extract;
    const held = (x: number, z: number, r: number) => [...this.enemies.values()].some((o) => !who.includes(o) && this.able(o) && o.order && o.order.cordon && Math.hypot(o.order.entry.x - x, o.order.entry.z - z) < r);
    const claimed = (x: number, z: number) => [...this.enemies.values()].some((o) => !who.includes(o) && ((o.order && o.order.cv && Math.hypot(o.order.cv.x - x, o.order.cv.z - z) < 1.5) || (o.cover && Math.hypot(o.cover.x - x, o.cover.z - z) < 1.2)));
    const sameFl = (y: number) => Math.abs(y - T.y) < 1.5;
    // the way out: a door on the way from the room to the extraction (nearer it than the room is), not one of the room's own
    let exit: { spot: { x: number; y: number; z: number; cv: EnemyCover | null }; face: { x: number; z: number } } | null = null;
    if (ex) {
      const fX = this.flowTo(ex.x, ex.y || 0, ex.z), tX = this.flowDist(fX, T.x, T.y, T.z);
      const doors: { d: LvDoor; g: number; xd: number }[] = [];
      if (tX > 0) for (const d of map.doors) {
        if (d.kind === 'vault' || d.fallen || !sameFl(d.fy || 0)) continue;
        const nx = d.axis === 'x' ? 1 : 0, nz = 1 - nx;
        if (room >= 0 && [1, -1].some((s) => this.roomOf(d.x + nx * s, d.fy || 0, d.z + nz * s) === room)) continue;
        const g = this.flowDist(fT, d.x, d.fy || 0, d.z), xd = this.flowDist(fX, d.x, d.fy || 0, d.z);
        if (g < K.EXIT[0] || g > K.EXIT[1] || xd < 0 || xd > tX - 2 || held(d.x, d.z, 4)) continue;
        doors.push({ d, g, xd });
      }
      doors.sort((a, b) => a.g - b.g);
      const D = doors[0];
      if (D) { // their place: a few metres past it on the way out (cover if there's some), watching it
        let best: { x: number; y: number; z: number; cv: EnemyCover | null } | null = null, bs = 1e9;
        const look = (x: number, y: number, z: number, cv: EnemyCover | null) => {
          const dd = Math.hypot(x - D.d.x, z - D.d.z); if (dd < 1.5 || dd > 7 || !sameFl(y)) return;
          const xd = this.flowDist(fX, x, y, z), g = this.flowDist(fT, x, y, z); if (xd < 0 || xd >= D.xd || g <= D.g) return;
          const sc = Math.abs(dd - 3.5) - (cv ? 2 : 0); if (sc < bs) { bs = sc; best = { x, y, z, cv }; }
        };
        for (const c of map.cover as FlPt[]) if (!claimed(c.x, c.z)) look(c.x, c.y || 0, c.z, c as EnemyCover);
        for (const sp of map.enemySpots) { const f = sp[2] || 0, x = (sp[0] + 0.5) * L.TS, z = (sp[1] + 0.5) * L.TS; look(x, L.spotY(map, x, z, f), z, null); }
        exit = { spot: best || { x: D.d.x, y: D.d.fy || 0, z: D.d.z, cv: null }, face: { x: D.d.x, z: D.d.z } };
      } else if (tX > 0) { // no door on the way out near enough (open floor past the room's own): a spot on the way itself, watching the room
        let best: { x: number; y: number; z: number; cv: EnemyCover | null } | null = null, bs = 1e9;
        const look = (x: number, y: number, z: number, cv: EnemyCover | null) => {
          if (!sameFl(y) || held(x, z, 4)) return;
          const g = this.flowDist(fT, x, y, z), xd = this.flowDist(fX, x, y, z); if (g < K.COVER[0] || g > K.COVER[1] || xd < 0 || xd > tX - 4) return;
          const sc = (g + xd - tX) - (cv ? 3 : 0); if (sc < bs) { bs = sc; best = { x, y, z, cv }; } // (least out of the way between the room and the way out)
        };
        for (const c of map.cover as FlPt[]) if (!claimed(c.x, c.z)) look(c.x, c.y || 0, c.z, c as EnemyCover);
        for (const sp of map.enemySpots) { const f = sp[2] || 0, x = (sp[0] + 0.5) * L.TS, z = (sp[1] + 0.5) * L.TS; look(x, L.spotY(map, x, z, f), z, null); }
        if (best) exit = { spot: best, face: { x: T.x, z: T.z } };
      }
    }
    // defensive spots: cover round the room, a little way off, apart from each other
    const covers: EnemyCover[] = [];
    for (const c of G_U.shuffle(Math.random, (map.cover as FlPt[]).slice())) {
      if (!sameFl(c.y || 0) || claimed(c.x, c.z) || held(c.x, c.z, 3)) continue;
      const g = this.flowDist(fT, c.x, c.y || 0, c.z); if (g < K.COVER[0] || g > K.COVER[1]) continue;
      if (exit && Math.hypot(c.x - exit.spot.x, c.z - exit.spot.z) < 3) continue;
      if (covers.some((q) => Math.hypot(q.x - c.x, q.z - c.z) < 3)) continue;
      covers.push(c as EnemyCover);
    }
    if (!exit && !covers.length) return false;
    const mk = (x: number, y: number, z: number): OrderSpot => ({ x, y, z, flow: this.flowTo(x, y, z), kind: 'point', n: 0 });
    const exQ = exit ? mk(exit.spot.x, exit.spot.y, exit.spot.z) : null;
    const left = who.slice().sort((a, b) => (exQ ? this.flowDist(exQ.flow, a.x, a.y || 0, a.z) - this.flowDist(exQ.flow, b.x, b.y || 0, b.z) : 0));
    const put = (e: Enemy, q: OrderSpot, kind: 'exit' | 'cover', face: { x: number; z: number }, hc: EnemyCover | null) => {
      give(e, q, true, 0); const o = e.order!; o.cordon = kind; o.face = face; o.hc = hc;
    };
    let onExit = 0;
    for (const e of left) {
      if (exQ && exit && (onExit < K.ON_EXIT || !covers.length)) { put(e, exQ, 'exit', exit.face, onExit ? null : exit.spot.cv); onExit++; continue; } // (the second beside the first, on the same door)
      const cv = covers.sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z)).shift();
      if (cv) put(e, mk(cv.x, cv.y || 0, cv.z), 'cover', { x: T.x, z: T.z }, cv);
      else if (exQ && exit) put(e, exQ, 'exit', exit.face, null);
    }
    return true;
  },
  // A stack: WAIT seconds at most for the rest once the first is in place (MAX from the word), then in one after another, GAP apart;
  // CLEAR seconds at most from the go for the room to be called clear (all of them at their corners, or as long as that takes).
  STACK: { WAIT: 15, MAX: 45, GAP: 0.9, CLEAR: 14 },
  // Running under an order (orderStep): PACE m/s (a squad member's with his weapon lowered, js/player.ts SPEED.low), weapon down;
  // up again NEAR metres from their place in a stack, and RAISE seconds before they can fire if they see someone while running.
  // PUSH_NEAR: how close a man pushing under an order gets to whoever he can see before he stops to fight it out
  RUN: { PACE: 3.0, NEAR: 4, RAISE: 0.5 },
  PUSH_NEAR: 4,
  // The ship's moved her teams on (her cameras have the squad somewhere else): a leader's stack that hasn't gone in yet is let go, so
  // he can take the new word (callIn holds off a leader whose team is on a room). True if there was one
  dropStack(l: Enemy) {
    let n = 0;
    for (const e of this.enemies.values()) { const g = e.order && e.order.entry.grp; if (g && g.by === l.id && g.go == null && !g.cleared) { this.endOrder(e); n++; } }
    return n > 0;
  },
  // Their place in the stack (k: their place at the door, after anyone else's there; i: their turn in their own team's). A split stack:
  // just outside the doorway, against the wall beside it and out of its line, the first on the side with more room inside, the next
  // across from him, and so on, each side filling outward; all on one side if the other's walled, straight back from the door if both
  // are. Outside: the side further from where they're going. On their turn: through the doorway, then a button hook along the inside
  // wall to their own side (a one-sided stack: the first one way, the next the other), the first on each side to the corner and the
  // next halfway, a step further in, facing across the room: each out of the doorway for the next.
  stackSlot(e: Enemy, q: OrderSpot, k: number, i: number, fT: Int16Array) {
    const o = e.order!, map = this.map!, TS = Level.TS;
    const d = map.doors.find((dd) => Math.hypot(dd.x - q.x, dd.z - q.z) < 0.1); if (!d) return;
    const nx = d.axis === 'x' ? 1 : 0, nz = d.axis === 'x' ? 0 : 1, tx = nz, tz = nx; // (the doorway's normal: axis is the way through it; and along it)
    const y = d.fy || 0, ok = (x: number, z: number) => this.flowDist(fT, x, y, z) >= 0;
    const dA = this.flowDist(fT, d.x + nx * 1.2, y, d.z + nz * 1.2), dB = this.flowDist(fT, d.x - nx * 1.2, y, d.z - nz * 1.2);
    const out = dB < 0 || (dA >= 0 && dA > dB) ? 1 : -1, half = (d.w || 2 * TS) / 2; // (w: the doorway's width, in metres)
    const at = (lat: number, nrm: number) => ({ x: d.x + tx * lat + nx * out * nrm, z: d.z + tz * lat + nz * out * nrm });
    // inside: the room the doorway opens into, and how far its walls run each way from the door
    const ip = at(0, -1.0);
    const rm = (map.rooms || []).find((r: LvRoom) => (r.fl || 0) === (d.fl || 0) && ip.x >= r.x * TS && ip.x < (r.x + r.w) * TS && ip.z >= r.z * TS && ip.z < (r.z + r.h) * TS);
    const reach = (s: number) => rm ? (tx ? (s > 0 ? (rm.x + rm.w) * TS - d.x : d.x - rm.x * TS) : (s > 0 ? (rm.z + rm.h) * TS - d.z : d.z - rm.z * TS)) : 3;
    const s0 = reach(1) >= reach(-1) ? 1 : -1;
    // outside: which sides of the doorway there's wall to stand against
    const slotAt = (side: number, j: number) => at(side * (half + 0.45 + 0.7 * j), 0.55), open = (side: number) => { const c = slotAt(side, 0); return ok(c.x, c.z); };
    const sides = [s0, -s0].filter(open), split = sides.length === 2;
    let p: { x: number; z: number } | null = null, side = 0;
    if (split) { side = k % 2 === 0 ? s0 : -s0; const j = Math.floor(k / 2); for (const sd of [side, -side]) { const c = slotAt(sd, j); if (ok(c.x, c.z)) { p = c; side = sd; break; } } }
    else if (sides.length) { side = sides[0]; const c = slotAt(side, k); if (ok(c.x, c.z)) p = c; }
    if (!p) { side = 0; const c = at(0, 1.4 + 0.75 * k); if (ok(c.x, c.z)) p = c; }
    if (!p) return;
    o.slot = { x: p.x, y, z: p.z, flow: this.flowTo(p.x, y, p.z), yaw: Math.atan2(-(d.x - p.x), -(d.z - p.z)) }; o.slotK = k; o.rest = Math.random() * 0.4;
    o.inP = { x: ip.x, z: ip.z, flow: this.flowTo(ip.x, y, ip.z) };
    // their corner inside: a split stack hooks to its own side; a one-sided one alternates
    const cs = split && side ? side : i % 2 === 0 ? s0 : -s0, n = split ? Math.floor(i / 2) : Math.floor(i / 2), far = Math.max(0.8, reach(cs) - 0.9);
    const lat0 = (n === 0 ? 1 : 0.5) * far, dep = 0.9 + (n >= 1 ? 0.8 : 0) + Math.floor(n / 2) * 0.8;
    // (no room that way, the side's too short: the other side, a step deeper, out of the way of whoever's there)
    let cp: { x: number; z: number } | null = null;
    const g = o.entry.grp, taken = g ? (g.cps || (g.cps = [])) : []; // (corners the team's already given out)
    for (const [sd, dp, l0] of [[cs, dep, lat0], [-cs, dep + 0.8, Math.max(0.8, reach(-cs) - 0.9) * 0.5]] as [number, number, number][])
      for (let dd = dp; dd <= dp + 1.6 && !cp; dd += 0.8) for (let lat = Math.max(l0, 0.8); lat >= 0.6 && !cp; lat -= 0.4) { const c = at(sd * lat, -dd); if (ok(c.x, c.z) && !taken.some((t) => Math.hypot(t.x - c.x, t.z - c.z) < 0.9)) cp = c; }
    if (!cp) cp = ip;
    taken.push(cp);
    const mid = rm ? { x: (rm.x + rm.w / 2) * TS, z: (rm.z + rm.h / 2) * TS } : at(0, -3); // (across the room: its middle, or a few metres in)
    o.cp = { x: cp.x, z: cp.z, yaw: Math.atan2(-(mid.x - cp.x), -(mid.z - cp.z)) };
  },
  // What they're called (js/spacedata.ts TITLES): aboard a ship, by whose she is and where they stand in her; anywhere else, their type's
  // name. Kept on them (e.title) for the feed once they're gone.
  titleOf(e: Enemy) {
    if (e.named) return (e.title = e.named); // (someone with a name of their own: a liner's security beside the squad, js/spaceserver.ts)
    const T = e.wear && !e.def.civ ? (SpaceData.TITLES as Record<string, Record<string, string>>)[e.wear] : null;
    if (!T) return e.def.name;
    const M = SpaceSv.st.M, lead = this.leads(e) && [...this.enemies.values()].some((o) => o !== e && o.team === e.id);
    const t = M && M.hvt === e.id ? T.hvt : this.topId === e.id ? T.top : e.def.leader ? T.leader : lead ? T.tl
      : (e.grade || 0) >= 0.85 && !e.def.timid ? `${T.vet} ${T[e.type] || e.def.name}` : T[e.type] || e.def.name;
    return (e.title = t);
  },
  topId: null as number | null, // (her highest-ranked fighter, the officer she's boarded for not aboard: teamForm)
  // In a fight: has the squad in sight, or had them a moment ago (ENGAGED seconds): too busy for a new plan
  ENGAGED: 5,
  REINFORCE: 10,
  RUSH_NEAR: 10, // (metres along the way from the fight that reinforcements stop running and bound: orderStep) // (metres from where they're sent that someone of theirs in a fight makes it one they're reinforcing: dispatchGroup)
  engaged(e: Enemy) { return e.canSee || this.clock - (e.sawAt ?? -99) < this.ENGAGED; },
  // The room a spot's in (its index in map.rooms), or -1
  roomOf(x: number, y: number, z: number) {
    const map = this.map!, TS = Level.TS;
    return (map.rooms || []).findIndex((r: LvRoom) => x >= r.x * TS && x < (r.x + r.w) * TS && z >= r.z * TS && z < (r.z + r.h) * TS && Math.abs((Level.floorMap(map, r.fl || 0).fy || 0) - y) < 1.5);
  },
  // Stacks on the same room go together: their leaders tell each other when they're ready, and when the last of them is (or the
  // first's been waiting STACK.WAIT, or one's been at it STACK.MAX), the highest-ranked of them calls the go, for all of them at once.
  stackGo(g: StackGrp) {
    const c = this.clock, S = this.STACK, all = g.sync ? g.sync.grps.filter((q) => q.go == null && !q.cleared) : [g];
    const left = (q: StackGrp) => q.ids.filter((id) => { if (q.ready.has(id) && !(this.enemies.get(id)?.canSee)) return false; const m = this.enemies.get(id); return !!m && this.able(m) && !!m.order && m.order.entry.grp === q; }).length; // (not in place yet, or in place and in a fight: the go waits)
    for (const q of all) if (!q.said && q.first != null && left(q) === 0) { q.said = true; const l = this.enemies.get(q.by); const wait = all.filter((o) => o !== q && left(o) > 0).map((o) => '#' + o.by); if (l) this.logCall(l, `stack ready${wait.length ? `, waiting on ${wait.join(', ')}` : ''}`); }
    const firsts = all.map((q) => q.first).filter((f): f is number => f != null);
    const ready = all.every((q) => left(q) === 0) || (firsts.length > 0 && c > Math.min(...firsts) + S.WAIT) || all.some((q) => c > q.at + S.MAX);
    if (!ready) return;
    const lead = all.map((q) => this.enemies.get(q.by)).filter((l): l is Enemy => !!l).sort((a, b) => (b.rank || 0) - (a.rank || 0))[0];
    for (const q of all) { q.go = c; const l = this.enemies.get(q.by); if (l) this.logCall(l, all.length > 1 ? `GO${lead && lead !== l ? ` on #${lead.id}'s word` : ''}, with ${all.filter((o) => o !== q).map((o) => '#' + o.by).join(', ')}` : 'GO'); }
  },
  // On a breach that's not done (stacking for it, or going in): a fight on the way doesn't end it (resumeBreach)
  inBreach(o: Order) { const g = o.entry.grp; return !!g && !g.cleared && !!o.slot && (o.phase === 'approach' || o.phase === 'stack' || o.phase === 'breach' || o.phase === 'clear'); },
  // They've lost whoever they were fighting: back to the breach. Stacking, to their place in the stack (and it waits for them, as
  // long as it would for anyone: stackGo); gone in already, on with it from where they are.
  resumeBreach(e: Enemy) {
    const o = e.order!, g = o.entry.grp!, c = this.clock;
    o.resAt = c;
    if (o.phase === 'stack' || o.phase === 'approach') {
      const away = !o.slot || Math.hypot(o.slot.x - e.x, o.slot.z - e.z) > 0.6;
      if (away) { o.phase = 'approach'; o.prog = undefined; o.progT = c; o.stuck = 0; o.cv = null; o.legT = 0; o.rest = 0.3; if (g.go == null) g.ready.delete(e.id); }
      const l = this.enemies.get(g.by); if (l && away) this.logCall(l, `#${e.id} lost the contact: back to the stack`);
    } else { o.clrT = c; o.rest = 0; }
    e.cover = null; e.inCover = false; e.peek = false;
  },
  // A leader whose team is breaching a room (stacked on it, or in it and not yet clear): he takes no new word till it's clear
  breaching(l: Enemy) {
    for (const e of this.enemies.values()) { const g = e.order && e.order.entry.grp; if (g && g.by === l.id && !g.cleared && this.able(e)) return true; }
    return false;
  },
  endOrder(e: Enemy) { e.order = null; e.holding = false; e.cover = null; e.inCover = false; },
  // They've seen the police and lost them: the search starts again from where they were last seen
  retarget(e: Enemy, at: { x: number; y: number; z: number }) {
    const o = e.order!;
    o.x = at.x; o.y = at.y; o.z = at.z; o.tflow = this.flowTo(at.x, at.y, at.z);
    o.phase = 'enter'; o.role = 'push'; o.ring = o.own ? 0 : 6; o.done = []; o.sp = null; o.cv = null; o.legT = 0; o.rest = 0; o.rt = this.clock; o.until = Math.max(o.until, this.clock + 45);
  },
  // A night level: an alert suspect who's lost sight of the police (or only heard them) doesn't sit and wait for them to walk into
  // view, it goes and looks, carefully: an order of its own (by itself, own) to where they were last seen or heard, searched as a
  // leader's would be (orderStep: to the spot, then spot to spot outward from it, the nearest first), at a creep, stopping to listen.
  // Not a lookout (it holds), a guard, the Kingpin or one lurking; not again on what it's already searched (nsAt), only on something
  // new seen or heard. NIGHT says how long they wait first and how long they keep at it.
  nightSearch(e: Enemy) {
    const N = this.NIGHT, c = this.clock;
    if (e.def.civ || e.def.boss || e.def.aimTime || e.def.timid || e.guard || e.lurk || e.state !== 'normal' || e.broken) return;
    const ns = e.nsAt == null ? -99 : e.nsAt;
    const seen = e.lastSeen && (e.sawAt == null ? -99 : e.sawAt) > ns ? e.lastSeen : null, heard = !seen && e.noise && (e.noiseAt == null ? -99 : e.noiseAt) > ns ? e.noise : null;
    const at = seen || heard;
    if (!at || e.lostT < (this.brave(e) ? N.HOLD_B : N.HOLD) + (e.id % 5) * 0.3) return; // (not all of them at once)
    e.nsAt = c;
    const y = seen ? seen.y : e.y || 0, tflow = this.flowTo(at.x, y, at.z);
    if (this.flowDist(tflow, e.x, e.y || 0, e.z) < 0) return; // (no way there)
    // (one who'd have pushed on with a grenade first still throws it, as a push does)
    const ld = Math.hypot(at.x - e.x, at.z - e.z);
    if (seen && this.brave(e) && ld > 5 && ld < 20 && !e.proof) this.tryNade(e, at.x, at.z);
    e.order = { by: e.id, own: true, role: 'push', phase: 'enter', x: at.x, y, z: at.z, entry: { x: at.x, y, z: at.z, flow: tflow, kind: 'point', n: 0 }, tflow, at: c, until: c + N.SEARCH_T, holdUntil: 0,
      rest: 0.4 + Math.random() * 0.6, leg: 'run', legT: 0, cv: null, cvFlow: null, sp: null, ring: 0, done: [], look: 0, delay: 0, rt: c };
    e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.pushing = false;
  },
  // ---- Fireteams. Everyone who fights (not a civilian, the Kingpin, one guarding something or one at a station: stay) is in a team of up
  // to TEAM.N (a leader and two) under its highest-ranked (rank: their grade, a Leader a whole rank up: addEnemy). A team's leader calls it in (callIn,
  // dispatch); on a boarded ship her sweep commands the leaders and they their teams (js/spaceserver.ts respondTick). Teams are made
  // as even as they can be (teamForm): those near each other split into as few teams as hold them, of sizes as near equal as can be,
  // under the highest-ranked of them; someone left on his own later tops up the smallest team near him whose leader outranks him.
  // A leader lost, the next in rank takes the team and its orders over: teamCheck.
  TEAM: { N: 3, R: 30, T: 1, LOSS: 0.1 }, // (N: a leader and two under him)
  teamable(e: Enemy) { return !e.def.civ && !e.def.boss && !e.def.timid && !e.guard && !e.stay; },
  able(e: Enemy) { return !e.down && !e.collapsed && e.state === 'normal' && !e.broken; },
  leads(e: Enemy) { return e.team === e.id; },
  // someone the others answer to: a Leader, the gang's boss, the ship's top man or the officer she's boarded for, or a fireteam's
  // leader with anyone in it (for the sidearm challenges, js/arsenal.ts: leader kills)
  leadsMen(e: Enemy) {
    const M = SpaceSv.st.M;
    return !e.def.civ && (!!e.def.leader || !!e.def.boss || this.topId === e.id || !!(M && M.hvt === e.id)
      || (this.leads(e) && [...this.enemies.values()].some((o) => o !== e && o.team === e.id)));
  },
  // the same side of the hull: aboard a ship, the same one of her hulls (a team doesn't span a docking)
  sameHull(a: Enemy, b: Enemy) {
    const map = this.map, sp = map && map.sp; if (!sp) return true;
    const ra = ShipGen.roomAt(map!, a.x, a.z, a.fl || 0), rb = ShipGen.roomAt(map!, b.x, b.z, b.fl || 0);
    return ra < 0 || rb < 0 || sp.hullOf[ra] === sp.hullOf[rb];
  },
  teamForm() {
    const T = this.TEAM, all = [...this.enemies.values()].filter((e) => this.teamable(e) && this.able(e));
    { const M = SpaceSv.st.M, hv = M && M.hvt != null ? this.enemies.get(M.hvt) : null; let top: Enemy | null = null; // (who's at the top of her)
      if (!hv || !this.able(hv)) for (const e of this.enemies.values()) if (e.wear && !e.def.civ && !e.def.timid && this.able(e) && (!top || (e.rank || 0) > (top.rank || 0))) top = e; // (posted guards too: a liner's best guard is her chief)
      this.topId = top ? top.id : null; }
    const size = new Map<number, number>(), rank = (e: Enemy) => e.rank || 0;
    const dist = (a: Enemy, b: Enemy) => Math.hypot(a.x - b.x, a.z - b.z) + Math.abs((a.y || 0) - (b.y || 0)) * 3;
    for (const e of all) if (e.team != null) size.set(e.team, (size.get(e.team) || 0) + 1);
    const solo = all.filter((e) => e.team == null || !this.enemies.has(e.team) || (this.leads(e) && size.get(e.id) === 1)).sort((a, b) => rank(b) - rank(a));
    if (!solo.length) return;
    // a loner tops up the smallest team near him (two or more already, with room) whose leader outranks him
    const left: Enemy[] = [];
    for (const e of solo) {
      let best: Enemy | null = null, bs = 1e9;
      for (const l of all) {
        const n = size.get(l.id) || 0;
        if (l === e || !this.leads(l) || rank(l) <= rank(e) || n < 2 || n >= T.N) continue;
        const d = dist(l, e); if (d > T.R || !this.sameHull(l, e)) continue;
        if (n * 100 + d < bs) { bs = n * 100 + d; best = l; }
      }
      if (best) { if (this.leads(e)) size.delete(e.id); e.team = best.id; size.set(best.id, (size.get(best.id) || 0) + 1); }
      else left.push(e);
    }
    // the rest make new teams among themselves: those near each other (within TEAM.R, a chain of them) into as few teams as hold them,
    // as even as they can be (5: 3 and 2, not 4 and 1); the highest-ranked of them lead, and each of the others goes to the nearest
    // leader with room
    const grp = left.map((_, i) => i), root = (i: number): number => (grp[i] === i ? i : (grp[i] = root(grp[i])));
    for (let i = 0; i < left.length; i++) for (let j = i + 1; j < left.length; j++) if (dist(left[i], left[j]) <= T.R && this.sameHull(left[i], left[j])) grp[root(i)] = root(j);
    const clusters = new Map<number, Enemy[]>();
    left.forEach((e, i) => { const r = root(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r)!.push(e); });
    for (const C of clusters.values()) {
      const n = C.length, m = Math.ceil(n / T.N), base = Math.floor(n / m);
      let extra = n % m;
      const leaders = C.slice().sort((a, b) => rank(b) - rank(a)).slice(0, m), cap = new Map<Enemy, number>();
      for (const l of leaders) { l.team = l.id; cap.set(l, 1); }
      const rest = C.filter((e) => !leaders.includes(e)), pairs: [number, Enemy, Enemy][] = [];
      for (const e of rest) for (const l of leaders) pairs.push([dist(e, l), e, l]);
      pairs.sort((a, b) => a[0] - b[0]);
      const done = new Set<Enemy>();
      for (const [, e, l] of pairs) {
        if (done.has(e)) continue;
        const k = cap.get(l)!;
        if (k < base || (k === base && extra > 0)) { if (k === base) extra--; cap.set(l, k + 1); e.team = l.id; done.add(e); }
      }
    }
  },
  // One point man (giveShield) to a team: where a team has two or more and another (on the same side of her hull, near enough) has none,
  // a spare one of theirs (not the one leading it) trades places with the one in the other nearest him (not its leader, not another
  // point man). Not while either's in a stack on a door; a word they had from their old leader is dropped (unless they're in a fight).
  pointSwap() {
    const teams = new Map<number, Enemy[]>();
    for (const e of this.enemies.values()) if (e.team != null && this.teamable(e) && this.able(e)) { const a = teams.get(e.team) || []; a.push(e); teams.set(e.team, a); }
    const busy = (e: Enemy) => !!(e.order && e.order.slot && e.order.entry.grp && !e.order.entry.grp.cleared);
    for (const [, A] of teams) {
      const spare = A.filter((e) => e.point && !this.leads(e) && !busy(e));
      while (A.filter((e) => e.point).length > 1 && spare.length) {
        const pm = spare.shift()!;
        let best: Enemy | null = null, bd = this.TEAM.R * 1.5;
        for (const [, B] of teams) {
          if (B === A || B.some((e) => e.point)) continue;
          for (const o of B) { if (this.leads(o) || o.point || busy(o) || !this.sameHull(o, pm)) continue; const d = Math.hypot(o.x - pm.x, o.z - pm.z); if (d < bd) { bd = d; best = o; } }
        }
        if (!best) break;
        const B = teams.get(best.team!)!, ta = pm.team!, tb = best.team!;
        pm.team = tb; best.team = ta;
        A.splice(A.indexOf(pm), 1, best); B.splice(B.indexOf(best), 1, pm);
        for (const e of [pm, best]) if (e.order && !e.order.own && e.order.by !== e.team && !this.engaged(e)) this.endOrder(e);
        const lb = this.enemies.get(tb), la = this.enemies.get(ta);
        if (lb) this.logCall(lb, `#${pm.id} (point man) in from #${ta}'s team for #${best.id}`);
        if (la) this.logCall(la, `#${best.id} in from #${tb}'s team for #${pm.id} (point man), who goes to them`);
      }
    }
  },
  // Every tick: a leader who can't lead (killed, down, arrested, given up, run) hands his team to the next in rank, his orders and all;
  // they're shaken by it (TEAM.LOSS off their nerve, and a shout does better with them for a while). With nobody to take it over, the
  // plan lapses: orders from him end, and those who had them are shaken worse (as a Leader's going always did).
  teamCheck() {
    let gone: Set<number> | null = null;
    for (const e of this.enemies.values()) {
      const by = e.team != null && e.team !== e.id ? e.team : e.order && !e.order.own && e.order.by !== e.id ? e.order.by : null;
      if (by == null) continue;
      const l = this.enemies.get(by);
      if (!l || !this.leads(l) || !this.able(l)) (gone || (gone = new Set())).add(by);
    }
    if (!gone) return;
    for (const by of gone) {
      const l = this.enemies.get(by) || (this.bodies.get(by) && this.bodies.get(by)!.rec) || null;
      const team = [...this.enemies.values()].filter((e) => e.team === by && e.id !== by);
      const next = team.filter((e) => this.able(e)).sort((a, b) => (b.rank || 0) - (a.rank || 0))[0] || null;
      if (l && this.enemies.has(by) && l.team === by) l.team = null;
      let n = 0;
      if (next) {
        for (const e of team) e.team = next.id;
        next.team = next.id; next.callLog = next.callLog || [];
        for (const e of this.enemies.values()) {
          if (e.order && !e.order.own && e.order.by === by) e.order.by = next.id;
          if (e.order && e.order.entry.grp && e.order.entry.grp.by === by) e.order.entry.grp.by = next.id; // (his stack's breach is the new man's to finish)
          if (e.team === next.id) { e.noLead = this.clock; e.morale -= this.TEAM.LOSS * (e.def.steady || 1); n++; }
        }
        this.logCall(next, `#${by} down: has his team (${n}), nerve -${this.TEAM.LOSS}`);
        if (l) this.logCall(l, `down: #${next.id} has the team`);
      } else {
        for (const e of team) e.team = null;
        for (const e of this.enemies.values()) {
          if (!e.order || e.order.own || e.order.by !== by) continue;
          this.endOrder(e); n++;
          e.noLead = this.clock; e.morale -= 0.25 * (e.def.steady || 1); e.relocate = false;
        }
        if (l) this.logCall(l, `down: nobody to take over, ${n} lost the plan, nerve -0.25`);
      }
    }
  },
  // Where an order is taking them this tick: a step of the way (returns {mx, mz, sp}), or null while they wait (at a cover spot between
  // bounds, or holding a way in). They go in bounds: to a cover spot a few metres on, down behind it a moment, to the next (a run for
  // a couple of seconds if there's none).
  orderStep(e: Enemy, dt: number): { mx: number; mz: number; sp: number; yaw?: number } | null {
    const o = e.order!, L = Level, c = this.clock, rnd = Math.random;
    if (c > o.until) { this.endOrder(e); return null; }
    // on the move with their point man on the same word (not into a stack, not running to a fight): in file behind him, he leads
    const pm = !o.slot && !o.rush && !o.cordon && (o.phase === 'approach' || o.phase === 'enter' || o.phase === 'search') ? this.pointOf(e) : null;
    if (pm && pm.order && pm.order.by === o.by && !pm.order.slot && Math.hypot(pm.x - e.x, pm.z - e.z) < 12 && L.los(this.map!, e.x, (e.y || 0) + 1, e.z, pm.x, (pm.y || 0) + 1, pm.z)) {
      const k = this.pointIdx(e, pm), fx = -Math.sin(pm.yaw), fz = -Math.cos(pm.yaw), back = 1.3 + 1.0 * k;
      let gx = pm.x - fx * back, gz = pm.z - fz * back;
      if (!L.los(this.map!, pm.x, (pm.y || 0) + 1, pm.z, gx, (pm.y || 0) + 1, gz)) { gx = pm.x - fx * 0.9; gz = pm.z - fz * 0.9; } // (a corner behind him: close up)
      const dd = Math.hypot(gx - e.x, gz - e.z);
      if (dd < 0.4) return null;
      if (pm.lowRun && dd > 1) { e.lowRun = true; return { mx: (gx - e.x) / dd, mz: (gz - e.z) / dd, sp: this.RUN.PACE / Math.max(0.5, e.def.speed) }; } // (he's running: so do they)
      return { mx: (gx - e.x) / dd, mz: (gz - e.z) / dd, sp: dd > 2.5 ? 0.9 : 0.5 };
    }
    const at = (fl: Int16Array) => this.flowDist(fl, e.x, e.y || 0, e.z);
    let goal: Int16Array, gx: number, gz: number;
    if (o.phase === 'approach' && o.slot) {
      const sd = Math.hypot(o.slot.x - e.x, o.slot.z - e.z);
      // (caught on something on the way: no nearer in a few seconds, a step to one side and on again)
      if (o.prog == null || sd < o.prog - 0.5) { o.prog = sd; o.progT = c; }
      else if (c - (o.progT || c) > 3) { o.progT = c; o.prog = sd; o.side = c + 0.8; o.sideYaw = e.yaw + (rnd() < 0.5 ? 1 : -1) * Math.PI / 2; }
      if ((o.side || 0) > c) return { mx: -Math.sin(o.sideYaw!), mz: -Math.cos(o.sideYaw!), sp: 0.6 };
      if (sd > 0.5 && sd < 1.6) o.stuck = (o.stuck || 0) + dt;
      if (sd <= 0.5 || (o.stuck || 0) > 2.5) { o.phase = 'stack'; o.cv = null; o.legT = 0; e.cover = null; e.inCover = false; const g = o.entry.grp; if (g) { g.ready.add(e.id); if (g.first == null) g.first = c; } }
    } else if (o.phase === 'approach') {
      const d = at(o.entry.flow);
      const cd = o.cordon ? Math.hypot(o.entry.x - e.x, o.entry.z - e.z) : 0; // (a cordon's place: right at it, or as near as they get; as the crow flies, the ways' cells being too coarse for it)
      if (o.cordon && d >= 0 && cd < 2 && o.rest <= 0) { if (o.prog == null || cd < o.prog - 0.2) { o.prog = cd; o.progT = c; } else if (c - (o.progT || c) > 2.5) o.stuck = 3; }
      if (o.cordon && (d < 0 || cd <= 0.5 || (o.stuck || 0) > 2.5)) { // (at their place in the cordon: there till the order's out)
        o.phase = 'hold'; o.holdUntil = o.until; o.cv = null;
        if (o.hc && Math.hypot(o.hc.x - e.x, o.hc.z - e.z) < 1) { e.cover = o.hc; e.coverFlow = null; e.inCover = true; e.peek = false; e.coverStuck = 0; e.coverT = 2; }
      } else if (o.cordon) { /* (on their way to it) */ } else if (o.role === 'hold' && d >= 0 && d <= this.RADIO.HOLD) { o.phase = 'hold'; o.holdUntil = c + 12 + rnd() * 6; o.cv = null; }
      else if (d < 0 || d <= 2) o.phase = 'enter';
    }
    if (o.phase === 'stack') { // on the wall beside the door, facing it, till the go and their turn
      const g = o.entry.grp, S = this.STACK;
      if (g && g.go == null) this.stackGo(g);
      if (!g || (g.go != null && c >= g.go + Math.max(0, g.ids.indexOf(e.id)) * S.GAP)) { o.phase = o.inP && o.cp ? 'breach' : 'enter'; o.rest = 0; o.legT = 0; o.cv = null; o.clrT = c; }
      else {
        if (o.slot) { const sd = Math.hypot(o.slot.x - e.x, o.slot.z - e.z); e.yaw += G_U.angDiff(e.yaw, o.slot.yaw) * Math.min(1, dt * 4); if (sd > 0.3) return { mx: (o.slot.x - e.x) / sd, mz: (o.slot.z - e.z) / sd, sp: 0.4 }; }
        return null;
      }
    }
    if (o.phase === 'breach' && o.inP) { // their turn: through the doorway, gun up, to just inside it
      const d = Math.hypot(o.inP.x - e.x, o.inP.z - e.z);
      if (d < 0.6 || c - (o.clrT || c) > 6) o.phase = 'clear';
      else { const st = d > 1.2 ? L.flowStep(this.map!, o.inP.flow, e.x, e.z, e.y) : null, tx = st ? st.x : o.inP.x, tz = st ? st.z : o.inP.z, dd = Math.hypot(tx - e.x, tz - e.z) || 1; return { mx: (tx - e.x) / dd, mz: (tz - e.z) / dd, sp: 0.75 }; }
    }
    if (o.phase === 'clear' && o.cp) { // sideways along the inside wall to their corner, facing across the room; there, they hold it
      const g = o.entry.grp, d = Math.hypot(o.cp.x - e.x, o.cp.z - e.z);
      if (!e.canSee) e.yaw += G_U.angDiff(e.yaw, o.cp.yaw) * Math.min(1, dt * 6); // (on someone: the gun stays on them)
      const inRoom = (m: Enemy) => g!.room < 0 || this.roomOf(m.x, m.y || 0, m.z) === g!.room;
      if (g && inRoom(e) && (d < 0.4 || c - (o.clrT || c) > 8)) g.inside.add(e.id); // (at their corner, or long enough in the room: in place)
      if (g && !g.cleared) {
        const live = g.ids.filter((id) => { const m = this.enemies.get(id); return !!m && this.able(m) && !!m.order && m.order.entry.grp === g; });
        const all = live.every((id) => g.inside.has(id));
        // the room's clear: every one of them in it at their place; or, out of time, as many as half of them in it (otherwise it's
        // given up, not cleared: they go on, and the room's not counted as searched)
        const timeUp = g.go != null && c > g.go + this.STACK.CLEAR, inNow = live.filter((id) => g.inside.has(id) && inRoom(this.enemies.get(id)!)).length;
        if (all || timeUp) {
          g.cleared = true;
          const l = this.enemies.get(g.by);
          if (g.room >= 0 && inNow > 0 && (all || inNow * 2 >= live.length)) this.cleared.set(g.room, c);
          else if (l) this.logCall(l, `breach stalled: ${inNow}/${live.length} in the room, not cleared (${live.map((id) => { const m = this.enemies.get(id)!; return `#${id} ${m.order!.phase} in ${this.roomOf(m.x, m.y || 0, m.z)}`; }).join(', ')}; room ${g.room})`);
        }
      }
      if (!g || g.cleared) { o.phase = 'search'; o.sp = null; o.rest = 0.6 + rnd() * 0.8; }
      else if (d >= 0.4) return { mx: (o.cp.x - e.x) / d, mz: (o.cp.z - e.z) / d, sp: 0.5, yaw: o.cp.yaw };
      else return null;
    }
    if (o.phase === 'hold') { // the way in covered: crouched, the gun on the door, till it's time
      if (c > o.holdUntil) { if (o.cordon) { this.endOrder(e); return null; } o.phase = 'enter'; o.role = 'push'; }
      else {
        const f = o.face || o.entry; // (a cordon: watching the way the police would come)
        if (!o.face || Math.hypot(f.x - e.x, f.z - e.z) > 0.5) e.yaw += G_U.angDiff(e.yaw, Math.atan2(-(f.x - e.x), -(f.z - e.z))) * Math.min(1, dt * 4);
        return null;
      }
    }
    if (o.phase === 'enter' && Math.hypot(o.x - e.x, o.z - e.z) < 2.5 && Math.abs(o.y - (e.y || 0)) < 1.5) { o.phase = 'search'; o.sp = null; o.rest = 1 + rnd(); }
    if (o.phase === 'search') {
      if (!o.sp) {
        o.sp = this.searchSpot(e, o);
        if (!o.sp) { o.ring += 7; if (o.ring > (o.own ? this.NIGHT.RING : 70)) this.endOrder(e); o.rest = 0.5; return null; }
      }
      if (Math.hypot(o.sp.x - e.x, o.sp.z - e.z) < 1.6) { o.done.push([o.sp.x, o.sp.z]); o.sp = null; o.rest = o.own ? this.NIGHT.REST + rnd() * 2 : 1.2 + rnd() * 1.2; e.yaw += (rnd() - 0.5) * 2; return null; } // (a look round it; in the dark, a longer one, listening)
    }
    if (o.phase === 'search' && o.sp) { goal = o.sp.flow; gx = o.sp.x; gz = o.sp.z; }
    else if (o.phase === 'approach') { if (o.slot) { goal = o.slot.flow; gx = o.slot.x; gz = o.slot.z; } else { goal = o.entry.flow; gx = o.entry.x; gz = o.entry.z; } }
    else { goal = o.tflow; gx = o.x; gz = o.z; }
    if (o.rest > 0) {
      o.rest -= dt;
      // (searching in the dark: stopped, listening, and looking round where there's room to look: the doorways, the room's corners)
      if (o.own) {
        if ((o.look -= dt) <= 0) { o.look = 0.8 + rnd() * 0.9; o.lookYaw = this.openYaw(e, e.yaw + (rnd() - 0.5) * 3.2, 3.2); }
        if (o.lookYaw != null) e.yaw += G_U.angDiff(e.yaw, o.lookYaw) * Math.min(1, dt * 3);
      }
      return null;
    }
    // reinforcing a fight, and still a way off it (along the way there): a run, no bounds, no stops; the last RUSH_NEAR metres in bounds
    const rushing = !!o.rush && (o.phase === 'approach' || o.phase === 'enter') && this.flowDist(o.tflow, e.x, e.y || 0, e.z) > this.RUSH_NEAR;
    if (rushing && o.cv) { o.cv = null; o.legT = 0; }
    // a new bound: to cover, and down behind it a moment; with none to be had, a run on (a bound looked for again in a moment)
    if (!o.cv && o.legT <= 0) {
      const near = (o.phase === 'approach' && !!o.slot) || rushing; // (to a door's stack: straight there at a steady pace, no bounds, so it fills together; or a run to a fight)
      const cv = near ? null : this.nextCover(e, goal);
      e.cover = null; e.inCover = false; e.peek = false;
      const cf = cv ? this.flowTo(cv.x, cv.y, cv.z) : null, cd = cv ? this.flowDist(cf!, e.x, e.y || 0, e.z) : -1;
      if (cv && cd >= 0 && cd < Math.hypot(cv.x - e.x, cv.z - e.z) * 1.6 + 2) { o.cv = cv; o.cvFlow = cf; o.leg = 'cover'; o.legT = 6; } // (not one behind a wall, a long way round)
      else { o.leg = 'run'; o.legT = 2.2 + rnd() * 1.2; }
    }
    let tx = gx, tz = gz;
    o.legT -= dt;
    if (o.cv) {
      const cd = Math.hypot(o.cv.x - e.x, o.cv.z - e.z);
      if (cd < 0.35 || o.legT <= 0) { // there: down behind it a moment
        if (cd < 0.7) { e.cover = o.cv; e.coverFlow = null; e.inCover = true; e.peek = false; e.coverStuck = 0; e.coverT = 2; }
        o.cv = null; o.legT = 0; o.rest = 1.1 + rnd() * 1.5;
        return null;
      }
      const st = cd > 1.6 && o.cvFlow ? L.flowStep(this.map!, o.cvFlow, e.x, e.z, e.y) : null;
      if (st) { tx = st.x; tz = st.z; } else { tx = o.cv.x; tz = o.cv.z; }
    } else {
      if (o.legT <= 0 && o.own) { o.rest = 1.4 + rnd() * 1.4; return null; } // (in the dark: a few steps, then a stop to listen; otherwise no cover, no stop: on, and the next bound looked for)
      const st = Math.hypot(gx - e.x, gz - e.z) > 1.2 ? L.flowStep(this.map!, goal, e.x, e.z, e.y) : null;
      if (st) { tx = st.x; tz = st.z; }
    }
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz) || 1;
    // (to a stack's place a way off, or a run to a fight: running, weapon lowered (RUN), up again the last RUN.NEAR metres)
    const run = !o.own && ((o.phase === 'approach' && !!o.slot && Math.hypot(o.slot.x - e.x, o.slot.z - e.z) > this.RUN.NEAR) || rushing);
    if (run) { e.lowRun = true; return { mx: dx / d, mz: dz / d, sp: this.RUN.PACE / Math.max(0.5, e.def.speed) }; }
    return { mx: dx / d, mz: dz / d, sp: o.own ? this.NIGHT.CREEP : rushing ? 1 : 0.9 };
  },
  // The cover spot a bound away that gets them most of the way on: 3 to 10 m off, at least 2.5 m closer to where they're going, no one else's
  nextCover(e: Enemy, goal: Int16Array) {
    const here = this.flowDist(goal, e.x, e.y || 0, e.z);
    if (here < 0) return null;
    let best: EnemyCover | null = null, bs = -1e9;
    for (const c of this.map!.cover as FlPt[]) {
      if (Math.abs((c.y || 0) - (e.y || 0)) > 1.5) continue;
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      if (d < 3 || d > 10) continue;
      const g = this.flowDist(goal, c.x, c.y || 0, c.z);
      if (g < 0 || here - g < 2.5) continue;
      let claimed = false;
      for (const o of this.enemies.values()) if (o !== e && ((o.order && o.order.cv && Math.hypot(o.order.cv.x - c.x, o.order.cv.z - c.z) < 1.5) || (o.cover && Math.hypot(o.cover.x - c.x, o.cover.z - c.z) < 1.2))) { claimed = true; break; }
      if (claimed) continue;
      const sc = (here - g) - d * 0.3 + Math.random() * 2;
      if (sc > bs) { bs = sc; best = c as EnemyCover; }
    }
    return best;
  },
  // Where to look next: somewhere a suspect could stand, on the ring round the spot they've got to (o.ring metres from it by the
  // building's ways, nine metres wide), nearest to them, not looked at, not another's
  searchSpot(e: Enemy, o: Order) {
    const map = this.map!, L = Level, TS = L.TS;
    for (let r = o.ring; r <= 70; r += 7) {
      let best: { x: number; z: number; y: number; f: number; tx: number; tz: number } | null = null, bd = 1e9;
      for (const sp of map.enemySpots) {
        const f = sp[2] || 0, x = (sp[0] + 0.5) * TS, z = (sp[1] + 0.5) * TS, y = L.spotY(map, x, z, f);
        const g = this.flowDist(o.tflow, x, y, z);
        if (g < r || g > r + 9) continue;
        if (o.done.some(([dx, dz]) => Math.hypot(dx - x, dz - z) < 4)) continue;
        let taken = false;
        for (const q of this.enemies.values()) if (q !== e && q.order && q.order.sp && Math.hypot(q.order.sp.x - x, q.order.sp.z - z) < 5) { taken = true; break; }
        if (taken) continue;
        const d = Math.hypot(x - e.x, z - e.z) + Math.abs(y - (e.y || 0)) * 3;
        if (d < bd) { bd = d; best = { x, z, y, f, tx: sp[0], tz: sp[1] }; }
      }
      if (best) { o.ring = r; return { x: best.x, z: best.z, flow: L.flow(map, [[best.tx, best.tz, best.f]]) }; }
    }
    return null;
  },

  // Broken: run from the police, then hide. Panicked, inaccurate shots only; a cornered suspect with
  // nothing left may give up without being told. Nerve comes back slowly.
  thinkBroken(e: Enemy, dt: number, p: LivePlayer, st: PState) {
    const L = Level, U = G_U;
    e.aiming = false; e.peek = false; e.leanOut = 0; e.cover = null; e.inCover = false; e.dp = null;
    if (e.fleeT > 0) {
      e.fleeT -= dt;
      e.crouch = false;
      const step = this.flow ? L.flowAway(this.map!, this.flow, e.x, e.z, e.y) : null;
      if (step) {
        const dx = step.x - e.x, dz = step.z - e.z, d = Math.hypot(dx, dz) || 1;
        e.yaw += U.angDiff(e.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
        this.moveEntity(e, dx / d, dz / d, e.def.speed * 1.15, dt);
      } else e.fleeT = 0;
      return;
    }
    e.crouch = true;
    if (st && e.canSee) {
      e.yaw += U.angDiff(e.yaw, Math.atan2(-(st.p[0] - e.x), -(st.p[2] - e.z))) * Math.min(1, dt * 5);
      e.cool -= dt;
      // cornered with police in sight: fight back, not token shots
      if (e.cool <= 0 && e.tgtD < e.def.range && !this.screenedBy(e, st.p[0], st.p[2], st.p[1]) && this.onTarget(e, st, dt)) { this.fire(e, p); e.cool = U.rf(0.5, 1.2); }
    } else e.cool = Math.max(e.cool, 0.8);
    if (e.morale > 0.45) e.broken = false;
  },

  // Walk, opening any closed door in the way first (which costs a moment and makes noise).
  moveEntity(e: Enemy, mx: number, mz: number, speed: number, dt: number) {
    const map = this.map!;
    if (e.doorWait > 0) { e.doorWait -= dt; return; }
    const ahead = map.world && World.raycast(map.world, e.x, (e.y || 0) + 1.0, e.z, mx, 0, mz, 0.9, { move: true }); // (what they'd walk into)
    const d = ahead && ahead.solid && ahead.solid.kind === 'door' ? ahead.solid.door : null;
    if (d && !d.open) { if (!SpaceSv.crewMayOpen(d, e)) return; this.setDoor(d.id, true); e.doorWait = 0.5; return; } // (a locked or sealed door: they hold where they are)
    if (e.collapsed) return; // legs gone: they're on the floor
    speed *= this.injSpeed(e) * (e.str == null || e.str >= 0.6 ? 1 : 0.3 + 0.7 * e.str / 0.6); // a broken leg limps; blood loss slows
    e.x += mx * speed * dt; e.z += mz * speed * dt;
    this.settle(e, 0.38 * e.def.scale);
  },
  // someone who's moved: out of what they walked into (stepping up onto anything low), and onto the floor or step
  // under them
  settle(e: Enemy, r: number) {
    const L = Level, q = { x: e.x, y: e.y || 0, z: e.z };
    L.inFrame(this.map!, { p: q }, (map) => { // (aboard a ship lying tilted: in her frame, js/level.ts)
      const y = q.y;
      L.resolve(map, q, r, y, World.STEP, true);
      q.y = L.groundAt(map, q.x, q.z, r, y, World.STEP, true); // (stairs as slopes: no hopping from tread to tread)
    });
    e.x = q.x; e.y = q.y; e.z = q.z;
  },

  // Someone on their knees (surrendered, or a cowering civilian) does what the police tell them.
  obedient(e: Enemy) { return e.state === 'surrender' || (e.def.civ && e.state === 'cower'); },
  obey(e: Enemy, dt: number) {
    if (e.dragTo) { // being pulled back by an officer
      const dx = e.dragTo.x - e.x, dz = e.dragTo.z - e.z, d = Math.hypot(dx, dz), st = Math.min(d, 1.3 * dt);
      const ox = e.x, oz = e.z;
      if (d > 0.02) { e.x += (dx / d) * st; e.z += (dz / d) * st; this.settle(e, 0.3); }
      // there, or up against something (it isn't getting any closer)
      if (d <= 0.02 || Math.hypot(e.x - ox, e.z - oz) < st * 0.2) e.dragTo = null;
      return true;
    }
    if (e.turnYaw != null) { // shuffling round on their knees
      const da = G_U.angDiff(e.yaw, e.turnYaw), st = 2.2 * dt;
      if (Math.abs(da) <= st) { e.yaw = e.turnYaw; e.turnYaw = null; } else e.yaw += Math.sign(da) * st;
      return true;
    }
    return false;
  },
  // Surrendered suspects kneel with hands up until cuffed. A few are faking and go for a hidden
  // weapon when nobody is standing over them.
  thinkSurrendered(e: Enemy, dt: number, alive: LivePlayer[]) {
    const near = alive.reduce((b: { d: number; p: LivePlayer | null }, p: LivePlayer) => { const d = Math.hypot(p.st.p[0] - e.x, p.st.p[2] - e.z); return d < b.d ? { d, p } : b; }, { d: 1e9, p: null } as { d: number; p: LivePlayer | null });
    // they watch the police approach, then hold still as ordered once an officer is on top of them
    // (so you can walk round behind to restrain them)
    if (near.p && near.d > 3 && !e.ordered) e.yaw += G_U.angDiff(e.yaw, Math.atan2(-(near.p.st.p[0] - e.x), -(near.p.st.p[2] - e.z))) * Math.min(1, dt * 3);
    if (!e.fake) return;
    e.fakeT -= dt;
    if (e.fakeT <= 0 && near.d > 2.2) {
      const gun = this.evidence.find((v: Evidence) => v.owner === e.id && !v.secured && !v.taken);
      if (!gun) { e.fake = false; return; }
      gun.taken = true;
      SvNet.broadcast({ t: 'evtake', i: gun.i });
      e.state = 'normal'; e.armed = true; e.fake = false;
      e.emboldened = true; e.morale = Math.max(e.morale, 1); e.broken = false; e.shouts = 0; // got away with it once: not giving up again
      this.alertEnemy(e, false);
      e.cool = 0.3;
      SvNet.broadcast({ t: 'chat', id: null, m: 'A surrendered suspect is going for a weapon!' });
    }
  },

  // Civilians: mill about until something scares them, then cower or bolt away from the shooting.
  // A civilian in the line between an armed suspect and the officer he's got in his sights (Server.screenedBy, from the civilian's side):
  // they get out of it, sideways, the way that's further from the line, at a run. Looked for every so often; true while they're moving.
  clearLine(e: Enemy, dt: number) {
    const now = this.clock || 0;
    if (e.clearOut && now < e.clearOut.until) {
      const c = e.clearOut, bx = e.x, bz = e.z;
      this.moveEntity(e, c.ux, c.uz, e.def.run, dt);
      e.yaw += G_U.angDiff(e.yaw, Math.atan2(-c.ux, -c.uz)) * Math.min(1, dt * 8); e.crouch = true;
      if (Math.hypot(e.x - bx, e.z - bz) < e.def.run * dt * 0.2) e.clearOut = null; // (into a wall: as far as they can go)
      else return true;
    }
    e.clearOut = null;
    e.clearT = (e.clearT || 0) - dt; if (e.clearT > 0) return false;
    e.clearT = 0.2 + Math.random() * 0.1;
    for (const s of this.enemies.values()) {
      if (s.def.civ || !s.armed || !s.drawn || !s.canSee || !s.tgt || s.down || s.state !== 'normal') continue;
      const p = this.players.get(s.tgt), st = p && p.st; if (!st) continue;
      const dx = st.p[0] - s.x, dz = st.p[2] - s.z, L2 = dx * dx + dz * dz; if (L2 < 0.25) continue;
      const ox = e.x - s.x, oz = e.z - s.z, t = (ox * dx + oz * dz) / L2;
      if (t <= 0 || t >= 1 || Math.abs((e.y || 0) - (s.y || 0)) > 1.5) continue;
      const L = Math.sqrt(L2), lx = -dz / L, lz = dx / L, off = ox * lx + oz * lz;
      if (Math.abs(off) >= this.SCREEN_R + 0.15) continue;
      // the side they're already on (or the one more open, standing on the line), and as far as gets them clear
      const W = this.map && this.map.world, ey = (e.y || 0) + 1.0, open = (sg: number) => { const r = W ? World.raycast(W, e.x, ey, e.z, lx * sg, 0, lz * sg, 2, { move: true }) : null; return r && r.solid ? r.t : 2; };
      let sg = off > 0.05 ? 1 : off < -0.05 ? -1 : open(1) >= open(-1) ? 1 : -1;
      if (open(sg) < 0.4 && open(-sg) > open(sg)) sg = -sg; // (against a wall that way: the other)
      const need = this.SCREEN_R + 0.45 - Math.abs(off) * Math.sign(off) * sg;
      e.clearOut = { ux: lx * sg, uz: lz * sg, until: now + Math.min(1.5, need / e.def.run + 0.05) };
      if (e.state === 'normal') e.walkTo = null;
      return true;
    }
    return false;
  },
  thinkCiv(e: Enemy, dt: number) {
    const def = e.def, U = G_U, L = Level;
    if (e.state === 'cuffed' || e.state === 'surrender') return;
    if (!e.down && this.clearLine(e, dt)) return; // (out of a shooter's way, before anything else)
    // sent to shelter (a ship's response): fleeing, hiding or frozen, they make for it once there's no officer on top of them
    if (e.shelter && !e.fromPir && (e.state === 'cower' || e.state === 'hide' || e.state === 'flee')) { const near = this.nearestOfficer(e); if (!near || near.d > 6) { e.state = 'normal'; e.hide = null; e.crouch = false; e.leanOut = 0; } }
    if (e.state === 'cower') return;
    if (e.state === 'hide') {
      if (!e.hide && !this.seekHide(e)) { e.state = 'cower'; e.crouch = false; e.leanOut = 0; return; }
      // an officer right on top of them: they give up and freeze
      const near = this.nearestOfficer(e);
      if (near && near.d < 3) { e.state = 'cower'; e.hide = null; e.crouch = false; e.leanOut = 0; return; }
      if (e.relocate) { e.relocate = false; this.seekHide(e); }
      if (!e.hide || !this.hideStep(e, dt, def.run)) { e.state = 'flee'; e.fleeT = 2; e.crouch = false; e.leanOut = 0; }
      return;
    }
    if (e.state === 'flee') {
      e.fleeT -= dt;
      const away = e.fromPir && this.pirFlow ? this.pirFlow : this.flow, step = away ? L.flowAway(this.map!, away, e.x, e.z) : null; // (from the pirates, if it's them they're running from: civFlee)
      if (step) {
        const dx = step.x - e.x, dz = step.z - e.z, d = Math.hypot(dx, dz) || 1;
        e.yaw += U.angDiff(e.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 8);
        this.moveEntity(e, dx / d, dz / d, def.run, dt);
      }
      if (e.fleeT <= 0 || !step) e.state = Math.random() < 0.6 && this.seekHide(e) ? 'hide' : 'cower';
      return;
    }
    if (e.shelter && (Math.hypot(e.x - e.shelter.x, e.z - e.shelter.z) > 1.2 || (e.shelter.room != null && ShipGen.roomAt(this.map!, e.x, e.z, e.fl || 0) !== e.shelter.room))) { // (there, and in the room: not just near it through its wall) // (sent to shelter: there first, at a hurry; in the room, there)
      if (e.shelter.room != null && ShipGen.roomAt(this.map!, e.x, e.z, e.fl || 0) === e.shelter.room && !this.map!.doors.some((d) => Math.hypot(d.x - e.x, d.z - e.z) < 1.3)) { e.shelter.x = e.home.x = e.x; e.shelter.z = e.home.z = e.z; } // (in the room, and clear of its doorways: there. On its threshold: on in, out of the way of its door)
      else {
        // (at their spot and still outside it: a spot on its wall's line, the wrong side of it: the middle of the room instead)
        if (e.shelter.room != null && Math.hypot(e.x - e.shelter.x, e.z - e.shelter.z) < 1.2) { const rm = this.map!.rooms[e.shelter.room], TS = Level.TS; if (rm) { e.shelter = { x: (rm.cx + 0.5) * TS, y: e.shelter.y, z: (rm.cz + 0.5) * TS, room: e.shelter.room }; e.home = { x: e.shelter.x, y: 0, z: e.shelter.z }; } }
        e.walkTo = null; this.travel(e, e.shelter, def.speed * 1.4, dt); return;
      }
    }
    e.idleT -= dt;
    if (e.idleT <= 0) {
      e.idleT = 2 + Math.random() * 4;
      e.walkTo = Math.random() < 0.55 ? this.amble(e) : null;
    }
    if (e.walkTo) {
      const dx = e.walkTo.x - e.x, dz = e.walkTo.z - e.z, d = Math.hypot(dx, dz);
      if (d < 0.3) e.walkTo = null;
      else { e.yaw += U.angDiff(e.yaw, Math.atan2(-dx, -dz)) * Math.min(1, dt * 5); this.moveEntity(e, dx / d, dz / d, def.speed, dt); }
    }
  },

  // A crate at cover spot c shields it from the target if it lies roughly toward them.
  coverProtects(c: EnemyCover, st: PState) {
    const tx = st.p[0] - c.x, tz = st.p[2] - c.z, td = Math.hypot(tx, tz);
    if (td < 3) return false;
    const kx = c.cx! - c.x, kz = c.cz! - c.z, kd = Math.hypot(kx, kz);
    return (tx * kx + tz * kz) / (td * kd) > 0.55;
  },
  findCover(e: Enemy, st: PState) {
    if (e.def.shield) return null; // (a handheld shield is their cover: they stand behind it and fight)
    const L = Level, map = this.map!, def = e.def, ground = this.ground(), now = Math.hypot(e.x - st.p[0], e.z - st.p[2]); // (now: how far off the police are)
    let best: EnemyCover | null = null, bs = 1e9;
    const here = (q: { x: number; y?: number; z: number }) => Math.abs((q.y || 0) - (e.y || 0)) < 1.5 && !(SpaceData.ON && SpaceSv.offLimits(e, q.x, q.z)); // (on their own floor; not in a ship's shelter unless they're of it)
    for (const c of map.cover as FlPt[]) {
      const d = Math.hypot(c.x - e.x, c.z - e.z);
      if (d > 12 || !here(c)) continue;
      const dt = Math.hypot(c.x - st.p[0], c.z - st.p[2]);
      if (dt < 4 || dt > def.range * 0.9 || (ground && dt < now - 1)) continue; // (on the ground: none nearer the police than where they are)
      const score = d + Math.abs(dt - def.pref) * 0.4;
      if (score >= bs || !this.coverProtects(c as EnemyCover, st)) continue;
      let claimed = false;
      for (const o of this.enemies.values()) if (o !== e && o.cover && Math.hypot(o.cover.x - c.x, o.cover.z - c.z) < 1.2) { claimed = true; break; }
      if (claimed) continue;
      if (!L.los(map, c.x, (c.y || 0) + 1.6 * def.scale, c.z, st.p[0], st.p[1] + 1.2, st.p[2])) continue; // can shoot when peeking
      best = c as EnemyCover; bs = score;
    }
    // Corners: stand hidden beside a wall edge, lean out sideways to shoot.
    const ty = st.p[1] + 1.4;
    let tried = 0;
    for (const w of map.wallSpots as FlPt[]) {
      const d = Math.hypot(w.x - e.x, w.z - e.z), ey = (w.y || 0) + 1.6 * def.scale;
      if (d > 10 || tried > 30 || !here(w)) continue;
      const dt = Math.hypot(w.x - st.p[0], w.z - st.p[2]);
      if (dt < 5 || dt > def.range * 0.9 || (ground && dt < now - 1)) continue;
      const score = d + Math.abs(dt - def.pref) * 0.4 + 0.5;
      if (score >= bs) continue;
      let claimed = false;
      for (const o of this.enemies.values()) if (o !== e && o.cover && Math.hypot(o.cover.x - w.x, o.cover.z - w.z) < 1.2) { claimed = true; break; }
      if (claimed) continue;
      tried++;
      if (L.los(map, w.x, ey, w.z, st.p[0], ty, st.p[2])) continue; // must be hidden when standing at the spot
      const nx = -(st.p[2] - w.z) / dt, nz = (st.p[0] - w.x) / dt;
      for (const side of [1, -1]) {
        const px = w.x + nx * side * 0.55, pz = w.z + nz * side * 0.55;
        if (L.tile(L.floorMap(map, w.fl || 0), Math.floor(px / L.TS), Math.floor(pz / L.TS)) !== 0) continue;
        if (!this.leanClear(w.x, w.z, px, pz, ey, w.y || 0)) continue; // (round the edge, not through a door jamb or a thin wall)
        if (!L.los(map, px, ey, pz, st.p[0], ty, st.p[2])) continue;
        best = { x: w.x, y: w.y || 0, z: w.z, lean: side, px, pz, fl: w.fl || 0 }; bs = score;
        break;
      }
    }
    return best;
  },
  coverValid(c: EnemyCover, st: PState, def: EnemyDef) {
    if (!c.lean) return this.coverProtects(c, st);
    const L = Level, map = this.map!, ey = (c.y || 0) + 1.6 * def.scale, ty = st.p[1] + 1.4;
    return !L.los(map, c.x, ey, c.z, st.p[0], ty, st.p[2]) && this.leanClear(c.x, c.z, c.px!, c.pz!, ey, c.y || 0) && L.los(map, c.px!, ey, c.pz!, st.p[0], ty, st.p[2]);
  },
  // Can someone standing at (x, z) actually lean out to (px, pz)? Nothing solid between: a corner's edge, not a
  // door jamb, a door leaf or a thin wall to the next room (at chest and at eye height; and the way the head
  // goes, a little further out still)
  leanClear(x: number, z: number, px: number, pz: number, ey: number, y = 0) { // (ey: their eyes' height; y: the floor they stand on)
    const L = Level, map = this.map!, ox = px + (px - x) * 0.3, oz = pz + (pz - z) * 0.3;
    return L.los(map, x, y + 1.1, z, px, y + 1.1, pz) && L.los(map, x, ey, z, px, ey, pz) && L.los(map, x, ey, z, ox, ey, oz);
  },

  // A suspect's grenade (an Enforcer's, the Kingpin's), thrown at the start of a push (above): two each at most a level, half a minute
  // or so apart, and no more than one in the level every ten seconds. Whether one was thrown.
  tryNade(e: Enemy, tx: number, tz: number) {
    if (!e.def.nades || e.nadeT > 0 || this.nadeT > 0 || this.level < 2 || (e.nadeN || 0) >= 2) return false;
    e.nadeT = 30 + Math.random() * 15; e.nadeN = (e.nadeN || 0) + 1;
    this.nadeT = 10;
    const s = e.def.scale, p = [e.x, (e.y || 0) + 1.6 * s, e.z];
    const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz);
    const T = G_U.clamp(d / 11, 0.6, 1.5), g = 18;
    const v = [dx / T, (0.3 - p[1] + 0.5 * g * T * T) / T, dz / T];
    const r2 = (x: number) => Math.round(x * 100) / 100;
    SvNet.broadcast({ t: 'nade', id: 'enemy', e: e.id, p: p.map(r2), v: v.map(r2), fuse: 2.6, en: 1 });
    return true;
  },
  // ---------------------------------------------------------------- flashbangs
  // A flashbang is a flash and a bang, and each does its own work. Anyone with the blast in sight (or half in sight: a
  // crouch behind cover shows the head or the legs but not both) is blinded, by how close (falling off over FLASH.RANGE)
  // and how squarely they face it (turned away, the lids and the back of the head take most of it); anyone in the same
  // room, by the way sound goes (a closed door adds ten metres: soundField), is deafened and shaken even with no sight of
  // it, less. The sum, k (0..1), sets two times: STUN, in which a suspect is out of the fight (eyes covered, weapon
  // lowered, seeing nothing, stumbling about; they can be cuffed where they stand, and shouted down almost every time),
  // then REC, in which they see only a few metres, shoot badly (FLASH.AIM) and are slow to come round. Somebody who
  // goes in at once has the whole of the stun to take them; somebody who peeks round a doorway meets a suspect who is
  // as unaware as before, and a blast that has done nothing. The steadier types (steady, bosses) shake it off sooner.
  // Civilians curl up where they are.
  // Indoors a few million candela don't need a line of sight: the walls and ceiling of the room throw it back (GLARE: as
  // much of it as a half-seen blast, to anyone in the same room, ROOM metres or less round by the floor, roofed over), and
  // turned away the room behind you is lit up just the same (FACE: what's left of it turned side-on and away); and 170 dB a
  // couple of metres off is more than deafening: the inner ear's balance goes with it (DEAF: the bang alone, close in).
  FLASH: { RANGE: 16, ROOM: 10, DEAF: 0.6, STUN: [0.5, 8], REC: [1.5, 5.5], FACE: [1, 0.75, 0.55], PARTIAL: 0.6, GLARE: 0.45, SEE_R: 5, AIM: 0.25, SHOUT: 0.85, GIVE_UP_R: 6 },
  flashLog: [] as Record<string, any>[],
  // how hard a flash at (x, y, z) hits e: { k (0..1), see (1 full, 0.6 partial, 0 none), face, d, path }
  flashDose(e: Enemy, x: number, y: number, z: number, field: Float32Array, yaw = e.yaw) {
    const L = Level, map = this.map!, F = this.FLASH, s = e.def.scale, base = e.y || 0;
    const d = Math.hypot(e.x - x, base + 1.55 * s - y, e.z - z);
    let see = 0;
    if (d <= F.RANGE) {
      const head = L.los(map, x, y, z, e.x, base + 1.55 * s, e.z), low = L.los(map, x, y, z, e.x, base + 0.6 * s, e.z);
      see = head && low ? 1 : head || low ? F.PARTIAL : 0;
    }
    const flat = Math.hypot(x - e.x, z - e.z) || 1, look = (-Math.sin(yaw) * (x - e.x) + -Math.cos(yaw) * (z - e.z)) / flat;
    const face = d < 1 ? 1 : look > 0.3 ? F.FACE[0] : look > -0.3 ? F.FACE[1] : F.FACE[2];
    const path = this.heardAt(field, e.x, e.z, e.y), TS = L.TS, cell = G_U.clamp(Math.floor(z / TS), 0, map.H - 1) * map.W + G_U.clamp(Math.floor(x / TS), 0, map.W - 1);
    const roofed = !(L.floorMap(map, L.floorAt(map, x, y, z)).out || map.out)[cell];
    if (see < F.GLARE && roofed && path <= F.ROOM && d <= F.RANGE) see = F.GLARE; // (the room lit up round them: FLASH GLARE)
    const kv = see ? Math.pow(Math.max(0, 1 - d / F.RANGE), 0.6) * face * see : 0;
    const kd = path <= F.ROOM ? F.DEAF * (1 - path / F.ROOM) : 0;
    return { k: Math.min(1, Math.max(kv, kd)), see, face, d, path };
  },
  // by: where the thrower stood (what the suspects know of where it came from); id: who threw it. Each bang has its number (n), kept on
  // those it blinds (flashId), so a kill of one while they're still blind says which (js/highlights.ts: the bang shown before it)
  flashN: 0,
  flashbang(p: number[], by?: number[] | null, id?: string | null) {
    const [x, y, z] = p, F = this.FLASH, U = G_U, n = ++this.flashN;
    const field = this.soundField(x, z, y), yaws = new Map<Enemy, number>();
    for (const e of this.enemies.values()) yaws.set(e, e.yaw); // (which way they were facing as the flash went off: the bang's what turns them)
    this.hear(x, z, 30, y);
    this.flashLog = [];
    for (const e of this.enemies.values()) {
      if (e.state === 'cuffed' || e.state === 'dead') continue;
      const q = this.flashDose(e, x, y, z, field, yaws.get(e));
      if (q.k < 0.04) continue;
      let k = q.k;
      if (e.def.boss) k *= 0.5; else k *= U.lerp(1, Math.min(1, e.def.steady == null ? 1 : e.def.steady + 0.35), 0.8);
      const stun = U.lerp(F.STUN[0], F.STUN[1], k), rec = U.lerp(F.REC[0], F.REC[1], k);
      this.flashLog.push({ id: e.id, type: e.type, civ: !!e.def.civ, d: +q.d.toFixed(1), see: q.see, face: q.face, path: +q.path.toFixed(1), k: +k.toFixed(2), stun: +stun.toFixed(1), rec: +rec.toFixed(1), state: e.state });
      this.stun(e, k, stun, rec, n, by);
    }
    SvNet.broadcast({ t: 'flash', p, n, by: id || undefined });
  },
  // Knocked senseless (a flashbang, or a blast's concussion: blastDaze), k how hard (0..1): out of the fight for `stun` seconds,
  // then `rec` coming round (thinkFlashed, flashEnd). n: the flashbang's number (0: a blast's), kept for the highlights.
  stun(e: Enemy, k: number, stun: number, rec: number, n: number, by?: number[] | null) {
    if (e.state === 'cuffed' || e.state === 'dead') return;
    if (e.def.civ) { // curled up where they are
      e.state = 'cower'; e.hide = null; e.crouch = false; e.leanOut = 0; e.walkTo = null;
      e.flashT = Math.max(e.flashT || 0, stun); e.flashRecLen = Math.max(e.flashRecLen || 0, rec); e.flashK = Math.max(e.flashK || 0, k); e.flashOn = true;
      return;
    }
    if (e.state === 'surrender' || e.collapsed) return;
    // a suspect: out of the fight. Weapon lowered, no cover, no door, nothing aimed
    const fresh = !(e.flashT! > 0);
    e.flashT = Math.max(e.flashT || 0, stun); e.flashRecLen = Math.max(e.flashRecLen || 0, rec); e.flashK = Math.max(e.flashK || 0, k); e.flashOn = true;
    if (n) e.flashId = n; else if (fresh) e.flashId = 0; // (a blast's daze isn't a flashbang's, for the highlights)
    e.morale -= 0.25 * k * (e.def.steady || 1);
    e.aiming = false; e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.dp = null; e.lurk = false; e.hide = null; e.walkTo = null; e.holding = false; e.dodge = null;
    e.surprisedT = 0; e.pendingAlert = -1; e.burstLeft = 0;
    if (e.armed && e.drawn) { e.drawn = false; e.drawT = 0; } // (the gun comes down)
    if (fresh) { e.stumbleT = 0; e.flashBy = by ? { x: by[0], y: by[1], z: by[2] } : null; }
  },
  // ---------------------------------------------------------------- blasts' concussion, and getting away from a grenade
  // A blast leaves whoever it didn't kill shaken: ears gone, the balance with them, a moment of not knowing where they are.
  // A frag's (180 g or so of explosive) does that a few metres round by the floor (BLAST.FRAG_R), twice as hard where the room
  // holds it in (closed and roofed: the wave comes back off every wall) as out in the open; a thermobaric's all through the
  // space it filled and a little through its walls (js/player.ts tbDose: daze). k sets the stun and the coming round, as a
  // flashbang's does, shorter (BLAST.STUN, BLAST.REC). by: where the thrower stood.
  BLAST: { FRAG_R: 6, STUN: [0.4, 3.5], REC: [1, 4] },
  blastLog: [] as Record<string, any>[],
  blastDaze(p: number[], kind: 'frag' | 'tb' | null, by?: number[] | null) {
    if (!kind) return;
    const B = this.BLAST, U = G_U, L = Level, map = this.map!, at = new THREE.Vector3(p[0], p[1], p[2]);
    this.blastLog = [];
    const M = kind === 'tb' ? Sim.tbModel(map, at) : null, fill = M ? null : L.blastFill(map, p[0], p[1], p[2], 400);
    const conf = fill && fill.n < 400 && fill.out < fill.n * 0.1 ? 1 : 0.5, idx = new Map<number, number>();
    if (fill) for (let i = 0; i < fill.n; i++) idx.set(fill.order[i], i);
    for (const e of this.enemies.values()) {
      if (e.state === 'cuffed' || e.state === 'dead' || e.collapsed) continue;
      let k = 0;
      if (M) k = Sim.tbDose(M, e.x, (e.y || 0) + 1, e.z).daze;
      else if (fill) {
        const c = U.clamp(Math.floor(e.z / L.TS), 0, map.H - 1) * map.W + U.clamp(Math.floor(e.x / L.TS), 0, map.W - 1), i = idx.get(c);
        if (i != null && L.floorAt(map, e.x, e.y || 0, e.z) === fill.f && fill.d[i] < B.FRAG_R) k = conf * (1 - fill.d[i] / B.FRAG_R);
      }
      if (e.def.boss) k *= 0.5; else k *= U.lerp(1, Math.min(1, e.def.steady == null ? 1 : e.def.steady + 0.35), 0.6);
      if (k < 0.08) continue;
      this.blastLog.push({ id: e.id, type: e.type, kind, k: +k.toFixed(2) });
      this.stun(e, k, U.lerp(B.STUN[0], B.STUN[1], k), U.lerp(B.REC[0], B.REC[1], k), 0, by);
    }
  },
  // A grenade thrown (handle 'nade': where from, how fast, its fuse; flown here as on every screen, js/sim.ts predictNade):
  // suspects who see it land near them, or hear it clatter right by them, get away from it: after a moment to take in what it
  // is (DODGE.REACT: less if they're already in the fight), they run for whatever's between it and them, or just away, and get
  // down, till it's gone off. A cooked one, let go late, leaves them no time at all.
  DODGE: { R: 7, HEAR: 2.5, REACT: [[0.8, 1.3], [0.45, 0.8]], LOOK: -0.2, RUN: 1.25 },
  dodgeLog: [] as Record<string, any>[],
  live: [] as { t0: number; fuse: number; pts: THREE.Vector3[]; kind: string; seen: Set<number>; nid?: number; from?: string }[],
  liveNade(p: number[], v: number[], fuse: number, kind: string, nid?: number, from?: string) {
    if (!this.map) return;
    const P = new THREE.Vector3(p[0], p[1], p[2]), V = new THREE.Vector3(v[0], v[1], v[2]);
    if (kind === 'sticky') { const S = Sim.STICKY, pts = Sim.predictSticky(P, V, this.map, S.MAX_FLY); this.live.push({ t0: this.clock || 0, fuse: pts.length / 60 + S.FUSE, pts, kind, seen: new Set(), nid, from }); return; } // (to where it'll hold, and its fuse from there)
    const pts = Sim.predictNade(P, V, fuse, this.map);
    this.live.push({ t0: this.clock || 0, fuse, pts, kind, seen: new Set(), nid, from });
  },
  // where a sticky held, as its thrower saw it (at: on a wall, the floor; e: on that suspect): it's there from now, and goes off in its
  // fuse's time. Whoever it's on knows it at once.
  stuckNade(nid: number, from: string, at: number[] | null, e: number | null) {
    const n = this.live.find((q) => q.nid === nid && q.from === from); if (!n) return;
    const now = this.clock || 0, age = now - n.t0, i = Math.min(n.pts.length - 1, Math.round(age * 60)), on = e != null ? this.enemies.get(e) : null;
    const end = on ? new THREE.Vector3(on.x, (on.y || 0) + 1, on.z) : at ? new THREE.Vector3(at[0], at[1], at[2]) : n.pts[i];
    n.pts = n.pts.slice(0, i + 1).concat(Array.from({ length: Math.ceil(Sim.STICKY.FUSE * 60) + 2 }, () => end.clone()));
    n.fuse = age + Sim.STICKY.FUSE;
    if (on && !on.def.civ && this.able(on)) { on.morale -= 0.3; if (on.morale < 0.25) { on.broken = true; on.fleeT = 2; } } // (stuck to them: they know)
  },
  dodgeTick() {
    const D = this.DODGE, L = Level, map = this.map!, now = this.clock || 0, U = G_U;
    this.live = this.live.filter((n) => now - n.t0 < n.fuse);
    for (const n of this.live) {
      const age = now - n.t0, q = n.pts[Math.min(n.pts.length - 1, Math.round(age * 60))], end = n.pts[n.pts.length - 1];
      if (age < 0.25) continue; // (still leaving the hand)
      for (const e of this.enemies.values()) {
        if (n.seen.has(e.id) || e.def.civ || e.state !== 'normal' || e.collapsed || e.flashT! > 0 || e.dodge) continue;
        const ey = (e.y || 0) + 1.5 * e.def.scale, d = Math.hypot(q.x - e.x, q.z - e.z);
        if (d > D.R || Math.abs(q.y - (e.y || 0)) > 2.5) continue;
        const look = (-Math.sin(e.yaw) * (q.x - e.x) - Math.cos(e.yaw) * (q.z - e.z)) / (d || 1);
        const sees = (look > D.LOOK || e.alert) && L.los(map, e.x, ey, e.z, q.x, q.y + 0.08, q.z), hears = d < D.HEAR && age > 0.5;
        if (!sees && !hears) continue;
        n.seen.add(e.id);
        const R = D.REACT[e.alert ? 1 : 0], react = U.lerp(R[0], R[1], Math.random());
        e.dodge = { x: end.x, y: end.y, z: end.z, at: now + react, until: n.t0 + n.fuse + 0.4 };
        this.dodgeLog.push({ id: e.id, kind: n.kind, d: +d.toFixed(1), sees, react: +react.toFixed(2), left: +(n.fuse - age - react).toFixed(2) }); // (how long they had to move: for tuning)
        if (this.dodgeLog.length > 20) this.dodgeLog.shift();
      }
    }
  },
  // getting away from the grenade (e.dodge): to cover from it if there's some close, otherwise straight away from it; down once
  // they're clear. True while it lasts (nothing else this tick).
  dodgeStep(e: Enemy, dt: number) {
    const g = e.dodge!, now = this.clock || 0;
    if (now >= g.until) { e.dodge = null; if (e.hide && e.state === 'normal') e.hide = null; return false; }
    if (now < g.at) return false; // (still taking it in)
    e.aiming = false; e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.dp = null; e.burstLeft = 0;
    if (!g.run) {
      g.run = true; e.alert = true;
      // cover from it: close, further from it than they are, and not past it to get there
      const spot = this.findHide(e, g), here = Math.hypot(e.x - g.x, e.z - g.z);
      e.hide = spot && Math.hypot(spot.x - e.x, spot.z - e.z) < 6 && Math.hypot(spot.x - g.x, spot.z - g.z) > here + 1 && (spot.x - e.x) * (e.x - g.x) + (spot.z - e.z) * (e.z - g.z) > 0 ? spot : null;
      if (!e.hide) { // none: the way out that's most away from it and open furthest (round the room, not into its wall)
        const W = this.map!.world, ey = (e.y || 0) + 1.0;
        let best = -Infinity;
        for (let k = 0; k < 12; k++) {
          const a = k * Math.PI / 6, ux = Math.sin(a), uz = Math.cos(a), away = (ux * (e.x - g.x) + uz * (e.z - g.z)) / (here || 1);
          const r = W ? World.raycast(W, e.x, ey, e.z, ux, 0, uz, 4, { move: true }) : null, clear = r && r.solid ? r.t : 4, sc = Math.min(clear, 4) * (away + 1.2);
          if (sc > best) { best = sc; g.ux = ux; g.uz = uz; g.clear = clear; }
        }
        g.from = [e.x, e.z];
      }
    }
    const sp = e.def.speed * this.DODGE.RUN;
    if (e.hide && this.hideStep(e, dt, sp)) { e.crouch = true; return true; }
    e.hide = null;
    const gone = g.from ? Math.hypot(e.x - g.from[0], e.z - g.from[1]) : 0, d = Math.hypot(e.x - g.x, e.z - g.z);
    if (g.ux != null && d < 6 && gone < (g.clear || 0) - 0.5) { this.moveEntity(e, g.ux, g.uz!, sp, dt); e.yaw += G_U.angDiff(e.yaw, Math.atan2(-g.ux, -g.uz!)) * Math.min(1, dt * 8); e.crouch = false; } // (facing the way they run)
    else e.crouch = true; // (clear of it, or as far as they can get: down)
    return true;
  },
  // the stun is over: unless they give it up they come round, alert, the gun coming back up
  flashEnd(e: Enemy) {
    e.flashOn = false; e.flashRec = e.flashRecLen || 0; e.flashRecLen = 0;
    if (e.def.civ || e.state !== 'normal') return;
    const k = e.flashK || 0, near = this.nearestOfficer(e), eh = (e.y || 0) + 1.4 * e.def.scale;
    // eyes open on an officer a few metres off with a gun on them: most give up (nobody there, they only come round angry)
    if (near && near.d < this.FLASH.GIVE_UP_R && !e.def.boss && e.def.comply != null && this.officerSees(e, eh) && Math.random() < G_U.clamp(e.def.comply * 0.8 + 0.4 * k + 0.15, 0, 0.92)) {
      this.surrender(e); e.flashRec = 0; this.flashLog.push({ id: e.id, gaveUp: 1 }); return;
    }
    e.alert = true;
    this.draw(e);
    e.cool = Math.max(e.cool, 0.9 + Math.random() * 0.8);
    if (e.flashBy) { e.lastSeen = e.flashBy; e.lostT = 0.01; e.blind = false; }
  },
  // is any officer who isn't down in sight of this suspect (their head's height)?
  officerSees(e: Enemy, eh: number) {
    for (const p of this.players.values()) if (p.st && !p.st.dn && !p.st.dd && Level.los(this.map!, p.st.p[0], p.st.p[1] + 1.5, p.st.p[2], e.x, eh, e.z)) return true;
    return false;
  },
  // the stun: they can't see, aim or fire; they cover their eyes and stagger about a step at a time
  thinkFlashed(e: Enemy, dt: number) {
    e.aiming = false; e.cover = null; e.inCover = false; e.peek = false; e.leanOut = 0; e.dp = null; e.crouch = false; e.canSee = false; e.tgt = null;
    e.stumbleT = (e.stumbleT || 0) - dt;
    if (e.stumbleT <= 0) { e.stumbleT = 0.5 + Math.random() * 0.9; e.stumbleYaw = Math.random() * Math.PI * 2; e.stumbleV = Math.random() < 0.35 ? 0 : 0.25 + 0.5 * Math.random(); }
    if (e.stumbleV) this.moveEntity(e, Math.cos(e.stumbleYaw!), Math.sin(e.stumbleYaw!), e.stumbleV * (0.4 + (e.flashK || 0)), dt);
    e.yaw += Math.sin(this.clock * 2.3 + e.id) * dt * 1.6 + (Math.random() - 0.5) * dt * 2;
  },
  enemyBoom(p: { x: number; y: number; z: number }) {
    const r2 = (x: number) => Math.round(x * 100) / 100;
    this.hear(p.x, p.z, 20, p.y || 0);
    this.blastDaze([p.x, p.y, p.z], 'frag'); // (their own, too, if they're close to it)
    SvNet.broadcast({ t: 'boom', id: 'enemy', p: [p.x, p.y, p.z].map(r2), r: Math.round(Sim.blastR(this.map, new THREE.Vector3(p.x, p.y, p.z)) * 100) / 100, d: Math.round(Sim.BLAST.dmg * this.dmgMult), en: 1, fr: 1, s: (Math.random() * 4294967296) >>> 0 });
  },

  // blind: firing at where the target was last seen, not at them
  fire(e: Enemy, p: LivePlayer, blind?: boolean) {
    // no shooting with the gun still holstered or slung, or while it's coming up: they start drawing instead
    if (!e.armed) return;
    if (!e.drawn) { this.draw(e); return; }
    if (e.drawT > 0) return;
    if (e.magMax) {
      if (e.reloadT > 0) return;
      if (e.mag <= 0) { this.startReload(e); return; }
      e.mag--;
      if (e.mag <= 0) this.startReload(e);
    }
    // A string of fire: centre mass first, then, 0.3-0.5 s in, they walk their aim up to the head (over half a
    // second). A pause of over a second, or a new target, starts again from the body.
    if (blind || e.engTgt !== p.id || !(this.clock - (e.firedAt || -9) < 1.0)) { e.engAt = this.clock; e.engTgt = p.id; e.headDelay = 0.3 + Math.random() * 0.2; }
    const up = blind ? 0 : G_U.clamp((this.clock - e.engAt! - e.headDelay!) / 0.5, 0, 1); // 0 body .. 1 head
    e.firedAt = this.clock;
    const kickNow = e.kick || 0; // (still coming back from the last one: a snap shot)
    e.kick = kickNow + this.kickOf(e, WEAPONS[e.def.wpn] || { recoil: 1 });
    const def = e.def, s = def.scale, st = p.st, L = Level, map = this.map!;
    const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw);
    const lc = e.leanOut && e.cover && e.cover.lean ? e.cover : null; // cover can be dropped earlier in the same tick
    const bx = lc ? lc.px! : e.x, bz = lc ? lc.pz! : e.z;
    let from = [bx + fx * 0.5 * s, (e.y || 0) + (e.collapsed ? 0.45 : 1.35) * s, bz + fz * 0.5 * s]; // (down on the floor, shooting up)
    // standing against a door or wall: the muzzle must not poke through it
    if (!L.los(map, bx, from[1], bz, from[0], from[1], from[2])) from = [bx, from[1], bz];
    // aim at the exposed part: a leaning player shows head and shoulder, not centre mass
    const [hx, hz] = this.headXZ(st), leaning = Math.abs(st.ln || 0) > 0.3;
    let tx = hx, ty = st.p[1] + (st.pr ? 0.25 : st.cr ? 0.75 : 1.2) + (leaning ? 0.3 : 0) + (leaning ? 0 : up * (st.pr ? 0.08 : st.cr ? 0.25 : 0.38)), tz = hz; // (prone: low, a small target)
    if (blind) { tx = e.lastSeen!.x + (Math.random() - 0.5) * 1.4; tz = e.lastSeen!.z + (Math.random() - 0.5) * 1.4; ty = (e.lastSeen!.y || 0) + 0.8 + Math.random() * 0.9; }
    // In the dark (a night level) they shoot at where they make you out to be: how well they see you (vk: lightK, the light on you,
    // yours, a flash, how close) sets how far off that is (a guess, held a moment, NIGHT.GUESS metres off at vk 0) and their aim
    let vk = 1;
    if (this.night) {
      const N = this.NIGHT, gn = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(Math.PI * 2 * Math.random());
      vk = Math.min(1, this.lightK(e, p, Math.hypot(st.p[0] - e.x, st.p[2] - e.z)) / N.LITK);
      if (!e.guess || this.clock > e.guess.until) e.guess = { x: gn(), y: gn() * 0.35, z: gn(), until: this.clock + N.GUESS_T * (0.6 + 0.8 * Math.random()) };
      if (!blind) { const r = N.GUESS * (1 - vk) ** 2; tx += e.guess.x * r; ty += e.guess.y * r; tz += e.guess.z * r; }
    }
    const dx = tx - from[0], dy = ty - from[1], dz = tz - from[2], d = Math.hypot(dx, dy, dz);
    // a bit worse up close, much worse at range: at their weapon's range they hit about a sixth as often
    const distF = 0.9 * G_U.clamp(0.95 - 0.8 * Math.pow(d / def.range, 1.2), 0.12, 0.95);
    const moveF = st.mv > 3 ? 0.72 : st.mv > 0.5 ? 0.88 : 1;
    const chance = (blind ? 0.15 : 1) * (1 - 0.2 * up) * this.injAim(e) * def.acc * distF * moveF * this.accMult * (1 - 0.6 * (e.sup || 0)) * (1 - 0.5 * Math.min(1, e.shock || 0)) * (e.collapsed ? 0.4 : 1) * (e.str != null && e.str < this.TWO_HAND ? 0.7 : 1) * (1 - Math.min(0.5, kickNow / 16)) * (e.broken ? (e.fleeT > 0 ? 0.4 : 0.8) : 1) * this.dazzle(e, st) * (e.flashRec! > 0 ? this.FLASH.AIM : 1) * (this.night ? this.NIGHT.AIM + (1 - this.NIGHT.AIM) * Math.sqrt(vk) : 1);
    // Their round is a round, flown as yours are (js/player.ts enemyRound) to whatever it meets: on the host's own screen, where
    // everyone's body stands as it's drawn (sent there: 'eround', every pellet's way). All that's rolled is
    // how well it's aimed: chance is the share that would land on a body a BODY_R across at that distance, so the aim's
    // error at the target is the spread that gives that (a two-dimensional normal: 1 - exp(-R²/2σ²)). The rest is what's
    // there: how much of you shows, what's in the way, what the round does.
    const wdef = WEAPONS[def.wpn] || WEAPONS.p9, am = ballFor(calOf(wdef)), v0 = roundSpeed(wdef, am) || 400;
    const norm = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(Math.PI * 2 * Math.random());
    const sd = this.BODY_R / Math.sqrt(-2 * Math.log(1 - G_U.clamp(chance, 0.01, 0.97))), ex = norm() * sd, ey = norm() * sd;
    const fv = new THREE.Vector3(...from), aim = new THREE.Vector3(tx + (-dz / d) * ex, ty + ey, tz + (dx / d) * ex).sub(fv), far = aim.length();
    aim.divideScalar(far); aim.y += GRAVITY * far / (2 * v0 * v0); // (held up for the drop: they've used this gun before)
    const wind = this.windNow(), wdrag = dragOf(wdef, am);
    if (wind && Sim.windy(map, from[0], from[1], from[2])) { // (and off into the wind: they feel it on their face, and misjudge it: each their own way, a little more or less each shot)
      if (e.windErr == null) e.windErr = Sim.windJudge(def.acc);
      const lag = Sim.lagAt(v0, wdrag, far) / far * Sim.windShot(e.windErr); aim.x -= wind.x * lag; aim.z -= wind.z * lag;
    }
    aim.normalize();
    const right = new THREE.Vector3(-aim.z, 0, aim.x).normalize(), upv = new THREE.Vector3().crossVectors(right, aim), pr = Math.tan(((wdef.choke || 0) * Math.PI) / 180), pellets = def.pellets || 1;
    const r2 = (v: number) => Math.round(v * 100) / 100, sid = (this.eSid = (this.eSid || 0) + 1), ds: number[][] = [];
    for (let i = 0; i < pellets; i++) {
      let dir = aim;
      if (pellets > 1 && pr > 0) { const a = Math.random() * Math.PI * 2, rr = pr * Math.min(1.6, Math.abs(norm()) * 0.6); dir = aim.clone().addScaledVector(right, Math.cos(a) * rr).addScaledVector(upv, Math.sin(a) * rr).normalize(); }
      ds.push([dir.x, dir.y, dir.z]);
    }
    if (SvNet.myId) SvNet.sendTo(SvNet.myId, { t: 'eround', e: e.id, wp: def.wpn, am, sid, f: from, ds }); // (js/player.ts enemyRounds)
    const to = Sim.predictEnd(fv, aim.clone().multiplyScalar(v0), wdrag, GRAVITY, map, wind).toArray();
    SvNet.broadcast({ t: 'eshot', e: e.id, ty: e.type, w: def.wpn, f: from.map(r2), to: to.map(r2), tg: p.id, sid });
    // At one of another side's (npcFoes), not an officer: nobody's screen flies that round into them (a suspect's round goes by
    // suspects and civilians there), so it's settled here. Each pellet lands with the chance worked out above, if the way from the
    // muzzle to their chest is clear; a hit is a share of a person's life: a rifle's or a submachine gun's round near half, a
    // pistol's a third, a pellet a seventh.
    const npc = (p as any).npc as Enemy | undefined;
    if (npc) {
      const c = G_U.clamp(chance, 0.01, 0.97) * (pellets > 1 ? 0.6 : 1); let n = 0; for (let i = 0; i < pellets; i++) if (Math.random() < c) n++;
      if (n && L.los(map, from[0], from[1], from[2], npc.x, (npc.y || 0) + (npc.crouch ? 0.7 : 1.1), npc.z)) this.applyHit({ e: npc.id, f: Math.min(1.2, n * (pellets > 1 ? 0.14 : wdef.cls === 'PST' ? 0.3 : 0.45)), byn: e.wear ? this.titleOf(e) : e.def.name }, null);
    }
  },
  // ---- Sides (a ship's people: js/spaceserver.ts, who each is dressed as, wear). Pirates fight everyone: a navy's people, a
  // civilian ship's own armed hands, and the unarmed (her passengers and crew, unless tied: hostages are worth more alive). A navy's
  // people and a civilian ship's fight pirates and nobody else of a ship's: never each other, never the unarmed. Everyone armed still
  // fights the squad. Who's on no side (a building's suspects) is as ever.
  facOf(e: Enemy): 'civ' | 'pirate' | 'navy' | 'civil' | null { return e.def.civ ? 'civ' : e.wear === 'pirate' ? 'pirate' : e.wear === 'navy' ? 'navy' : e.wear === 'civil' ? 'civil' : null; },
  proxies: null as Map<string, any> | null, NOBODY: [] as LivePlayer[],
  // The unarmed run from pirates (when they're aboard together: called with npcFoes). Three times a second: anyone unarmed, on their
  // feet and not tied, with a pirate in sight within 12 m on their deck, runs: away from the pirates (pirFlow: the way to the
  // nearest of them, gone the other way: flee), for a few seconds, then hides or cowers where they've got to as anyone running
  // does; and again when one comes in sight again. Running, they've left wherever they were sheltering.
  pirFlow: null as Int16Array | null, civT: 0,
  civFlee(dt: number) {
    this.civT -= dt; if (this.civT > 0) return; this.civT = 0.33;
    const map = this.map!, L = Level, pir = [...this.enemies.values()].filter((e) => this.facOf(e) === 'pirate' && this.able(e));
    this.pirFlow = pir.length ? L.flow(map, pir.map((e) => L.src(map, e.x, e.y || 0, e.z))) : null;
    for (const e of this.enemies.values()) {
      if (!e.def.civ || e.down || e.hp <= 0 || !(e.state === 'normal' || e.state === 'cower' || e.state === 'hide')) continue;
      const near = pir.find((o) => Math.abs((o.y || 0) - (e.y || 0)) < 3 && Math.hypot(o.x - e.x, o.z - e.z) < 12 && L.see(map, e.x, (e.y || 0) + 1.5, e.z, o.x, (o.y || 0) + 1.4, o.z) > 0);
      if (!near) { if (e.fromPir && !pir.some((o) => Math.hypot(o.x - e.x, o.z - e.z) < 25)) e.fromPir = false; continue; }
      e.fromPir = true; e.shelter = null; e.hide = null; e.crouch = false; e.threat = { x: near.x, z: near.z }; e.state = 'flee'; e.fleeT = 4 + Math.random() * 3;
    }
  },
  // Everyone aboard who could be a target for another side, each as an officer is to the one looking (where they are, how they
  // stand: what think and fire read of a player's state), under an id of their own; null unless pirates and someone they'd fight
  // are aboard together (so nothing changes anywhere else). Made afresh every tick.
  npcFoes() {
    let pir = false, oth = false;
    for (const e of this.enemies.values()) { const f = this.facOf(e); if (f === 'pirate') pir = true; else if (f) oth = true; }
    if (!pir || !oth) { this.proxies = null; return null; }
    const m = new Map<string, any>();
    for (const e of this.enemies.values()) {
      if (!this.facOf(e) || e.down || e.hp <= 0 || e.state === 'cuffed' || e.state === 'surrender' || e.state === 'dead') continue;
      const id = 'npc:' + e.id;
      m.set(id, { id, name: '', npc: e, st: { p: [e.x, e.y || 0, e.z], yw: e.yaw, pt: 0, cr: e.crouch ? 1 : 0, pr: 0, ln: 0, sd: 0, se: 0, lr: 0, dd: 0, dn: 0, mv: 0, tl: 0, w: e.def.wpn || '', hp: e.hp, mhp: e.maxHp } });
    }
    return (this.proxies = m);
  },
  // who e has to pick a target from: the squad, and (armed, and of a side) those of the other side's within 45 m on its deck or the next
  foesOf(e: Enemy, onFoot: LivePlayer[], prox: Map<string, any>): LivePlayer[] {
    const f = this.facOf(e); if (!f || f === 'civ' || !e.armed) return e.ally ? this.NOBODY : onFoot;
    const out = e.ally ? [] : onFoot.slice(); // (ally: armed and on the squad's side, a liner's security when she's being held: the squad's no target of theirs)
    for (const q of prox.values()) { const o = q.npc as Enemy, g = this.facOf(o); if (o === e || !(f === 'pirate' ? g !== 'pirate' : g === 'pirate')) continue; if (Math.hypot(o.x - e.x, o.z - e.z) < 45 && Math.abs((o.y || 0) - (e.y || 0)) < 6) out.push(q); }
    return out;
  },
  BODY_R: 0.24,
};
// (what it gets as it runs: the dead, until secured)
