// Types js/career.ts shares with the other files: declared here, globally, so any file can name them whether it's a
// script or (docs/modules-plan.md) a module. What makes and uses them is in js/career.ts.

// Your career: what you've done over every run, and a log of the runs themselves, kept in this browser (U.store 'career' and
// 'runs') and, with the cloud saves on, in your account (js/cloud.ts, docs/cloud.md). Only your own: each player keeps theirs,
// host or not. It hears what your screen hears (js/game.ts: the host's word of kills, arrests, the phases; js/player.ts: you
// going down, dying), never the simulation itself, which is in its own thread (docs/threads.md). Nothing here changes play.
// A run: from the lobby's Deploy (the host's 'newrun'), or from joining one that's going, to the game over table (wiped), or
// to leaving it (left). One the page was closed in the middle of is put down as abandoned the next time the page loads.
interface CareerBest { id: string; start: number; lvl: number; credits: number; squad: number; outcome: string }

interface CareerStats {
  v: number; runs: number; runsDone: number; deepest: number; acts: number; levels: number; kills: number; incaps: number; headshots: number;
  arrests: number; rescued: number; civKilled: number; unauth: number; deaths: number; downs: number; revives: number; evidence: number; credits: number;
  bestLevel: CareerBest | null; bestCredits: CareerBest | null;
}

interface CareerRun {
  id: string; v: number; start: number; end: number | null; solo: boolean; host: boolean; squad: number; joined: number | null;
  outcome: 'playing' | 'wiped' | 'left' | 'abandoned'; deepest: number; credits: number; kills: number; arrests: number; levels: CareerLevel[];
  t: number; u: number; sy: number; // (last touched; its version, and the version the cloud has: js/cloud.ts)
}

// a level of a run: where, and what you did in it (report: the squad's, as the hangar's screen shows it: js/shop.ts render)
interface CareerLevel {
  n: number; th: number; theme: string; night: boolean; stronghold: boolean; boss: boolean; cleared: boolean;
  kills: number; incaps: number; headshots: number; arrests: number; rescued: number; civKilled: number; unauth: number; evidence: number;
  downs: number; deaths: number; revives: number; credits: number; report: Record<string, number | boolean> | null;
}
