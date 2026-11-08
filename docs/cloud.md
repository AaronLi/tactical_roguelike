# Cloud saves: login and progress (Supabase)

Your progress lives in the browser, as it always has (`G.U.store`, localStorage under `bp_`). With a Supabase project set up, it is
also kept in an account, so it survives a cleared browser and follows you to another device. Without one, the game is exactly as it
was: no request to Supabase, and the Account box in the main menu says cloud saves aren't set up.

| File | What |
| --- | --- |
| `js/cloudconfig.ts` | The project's URL and anon key. Empty: no cloud saves. |
| `js/cloud.ts` | `G.Cloud`: the session, the sync, the queue, the merge, the menu's Account box. Page only. |
| `js/career.ts` | `G.Career`: the career's counters and the run log, kept locally (`bp_career`, `bp_runs`), the Career screen. |
| `supabase/migrations/*.sql` | The tables, Row Level Security, limits, `career_add`. |
| `tools/cloud_db.mjs`, `tools/cloud_fake.mjs`, `tools/cloud.test.mjs` | The tests (`npm run test:cloud`): see Testing. |

## Setting up the project

1. **Create a project** at [supabase.com](https://supabase.com) (the free tier is plenty). Note its region; nothing else is needed yet.
2. **Auth > Sign In / Providers**:
   - **Email** on (it is by default), with **Confirm email** on. Passwords aren't used by the game; nothing to change there.
   - **Allow anonymous sign-ins** is no longer needed: the game never signs in anonymously, so you can turn it off. (The guest
     cleanup still deletes any anonymous users an earlier build made.)
   - The rate limits under **Auth > Rate Limits** apply as they are.
3. **Auth > URL Configuration**:
   - **Site URL**: `https://d5g.ca`
   - **Redirect URLs**: add `https://d5g.ca/**` and `http://localhost:8080/**` (and any other port you serve on, e.g. `http://localhost:8270/**`).
4. **Auth > Emails > Templates** (optional, recommended): the game also takes the **code** from the email, for when the link opens in
   another browser (a desktop game's mail client). Add `{{ .Token }}` to the **Magic Link** and **Change Email Address** templates, e.g.
   `<p>Or enter this code in the game: <b>{{ .Token }}</b></p>`. Without it the link alone works.
   The built-in email sender is limited to a few emails an hour: set up custom SMTP (**Project Settings > Auth > SMTP**) before many people use it.
5. **Enable pg_cron** (for the guest cleanup): **Database > Extensions**, search *pg_cron*, enable it. (Optional: without it the
   cleanup isn't scheduled, and the migration says so with a notice; enable it later and run the second migration again.)
6. **Run the migrations**, in order: either paste each file of `supabase/migrations/` (`20261107000000_progress.sql`, then
   `20261108000000_guest_cleanup.sql`) into **SQL Editor** and run it, or with the Supabase CLI: `supabase link --project-ref <ref>`
   then `supabase db push`.
7. **Paste the URL and the anon key** into `js/cloudconfig.ts` (from **Project Settings > API**: "Project URL" and the `anon` `public`
   key; newer projects call it the "publishable" key, which works the same). **Never** the `service_role` / secret key: it bypasses
   Row Level Security. Rebuild (`npm run build`) and deploy as usual.

To check it: open the game, open **Account** in the main menu (*Not signed in*), sign in with your email (the link, or the code),
and **Table Editor** shows your rows. `?cloud=0` in the URL turns cloud saves off for that visit.

## How it behaves

- **Local until you sign in.** Signed out, the game saves in this browser exactly as it always did: no account, no request to
  Supabase (the client isn't even loaded until you open **Account**, or there's a session to restore).
- **The offer to register**: with cloud saves set up and not signed in, the main menu opens on *Keep your progress* (the same email
  sign-in, **Play as guest**, **Don't show again**). Not on a debug start (`?play`, `?hangar`, `?demo`), with `?cloud=0`, signed in, or
  once *Don't show again* is ticked (`bp_noOffer`, this device only, not synced; Esc is Play as guest). The client isn't loaded for it
  until an email is typed. Dismissed for good, signing in is still the Account box's **Sign in with email** (or delete `bp_noOffer`).
- **Sign in with email** (Account box: *Not signed in: progress saved on this device. Sign in with email to keep it everywhere.*):
  a magic link or its code (`signInWithOtp`), which creates the account if the email has none yet. Everything in this browser merges
  into the account (below). From then on it syncs.
- **Sign out**: the account's progress (sidearm tree, wishlist, career, runs) leaves this browser; your preferences (callsign, look,
  settings) stay. Signing back in brings it back. Signed out, you play and save locally again, and that merges in when you sign in.
- **Offline**: signed in, cloud writes queue (`bp_cloudq`; the runs carry their own "sent" mark) and go up when the network is back
  (the browser's `online` event, and retries backing off from 5 s to a minute).
- **Debounced**: a change goes up 4 s after the last one. Writes are small; a level makes a handful of requests.
- The Account box shows *offline* or *sync failed* (with the reason) beside the account, and a status line inside.
- **Other players** see a small **GUEST** mark beside your name in the lobby, the hangar's roster and the Tab scoreboard while you
  play not signed in on a build with cloud saves set up (the optional `anon: 1` on `hello`, and the `acct` message when you sign in or
  out mid-session; js/server.ts). A player with cloud saves off or not set up isn't marked. Names are display names only (not
  unique); the account's identity is its user id.
- **Anonymous users** (from an earlier version, which made a guest account at once): a session one left in a browser is let go of
  (signed out locally), its progress kept in the browser, merging into the email account you sign in with; the guest cleanup
  (below) deletes the user itself.
- **Callsign preference**: every animal, ranked (*Callsign preference* in the main menu: one row in your order, each with its rank;
  dragged to rank with the mouse or a finger, moved with the arrow keys / Home / End, or clicked to put it 1st), kept as one list
  (`animals`, all of them) and synced like the rest of your look. `hello` sends it as `prefs` (and `animal`, the 1st, for an older
  host); the host checks it (known animals, no repeats, at most as many as there are) and gives you the highest-ranked one that's
  free (one of each to a squad), else the first one free (only for an older client, or a short list). The menu and the lobby say
  which choice you got when it wasn't your 1st. An older version's single `animal` and its `animal2` second choice, or a top-three
  list, become the list's first entries, the rest appended in their usual order, in the browser and in a profile row (which the
  next write rewrites whole). The list lives in `settings` (jsonb), so it needed no migration.

## The data

Every row has `schema_version` (1 now). All tables: `user_id uuid` = `auth.uid()`, cascading on the user's deletion, Row Level
Security on, one policy each: *own rows only*, for the `authenticated` role. The `anon`
role (no session) has no grants at all.

| Table | Columns | Limits |
| --- | --- | --- |
| `profiles` | `name`, `animal` (the 1st of the ranking, kept for anything reading it), `look` (jsonb), `settings` (jsonb: `animals` (every animal, ranked) `sens fov vol loadKit muted quick`; never the TURN relay's), `mt` (jsonb: when each was last changed), `updated_at` | name/animal ≤ 32 chars, look ≤ 4 KB, settings ≤ 8 KB |
| `progress` | `arsenal` (jsonb: `{ got, n, pro, on }`, js/arsenal.ts), `wishlist` (jsonb array), `mt`, `updated_at` | arsenal ≤ 32 KB, wishlist ≤ 500 items / 32 KB |
| `career` | `runs runs_done deepest acts levels kills incaps headshots arrests rescued civ_killed unauth deaths downs revives evidence credits`, `best_level`, `best_credits` (jsonb run summaries) | non-negative, capped; written only through `career_add` |
| `runs` | PK `(user_id, id)`; `id` (client uuid), `started_at`, `ended_at`, `solo`, `host`, `squad`, `joined_at`, `outcome` (`playing wiped left abandoned`), `deepest`, `credits`, `kills`, `arrests`, `levels` (jsonb), `updated_at` | ≤ 200 levels / 64 KB; squad 1-16; the newest 1000 runs a player are kept |

`career_add(d jsonb)` (security invoker: it runs as the player, under RLS) adds `d.add`'s counters (each addition capped: 1000 runs,
100 000 kills... at a time), raises `deepest` to `d.max.deepest`, and replaces a best run only with a better one; it returns the row.
Two browsers on one account both count, because nothing overwrites the counters.

A run's `levels` entry: `{ n, th, theme, night, stronghold, boss, cleared, kills, incaps, headshots, arrests, rescued, civKilled, unauth,
evidence, downs, deaths, revives, credits, report }`, `report` being the squad's level report as the hangar's screen shows it (arrests,
incap, bleedouts, rescued, evidence, bodies, civKilled, unauth, allRescued, stronghold).

### What counts (js/career.ts)

Only your own, host or client, from your screen's messages (never the simulation, which is in its worker):

- **runs** a run started (the lobby's Deploy) or joined while going; **runs_done** ones played to the end (the game over table);
  a run you leave is `left`; one the page was closed in is `abandoned` on the next visit.
- **deepest** the highest level you entered; **levels** levels you extracted from; **acts** boss levels extracted from.
- **kills / incaps** suspects you put down (killed, or incapacitated: the host's `kill` / `incap`), **headshots** of those;
  **civ_killed / unauth** a civilian or a surrendered suspect you killed; **arrests**, **rescued** (civilians you secured),
  **evidence** weapons you bagged.
- **downs** you went down, or were killed outright (as the scoreboard counts them); **deaths** you were killed; **revives**
  teammates you revived.
- **credits** credits earned (kills, arrests, evidence, bodies, mission bonuses; penalties don't subtract here). A run's own
  `credits` is net of penalties; **best_credits** is the run with the most.

## Merge rules (signing in)

What's in the browser has an *owner* (`bp_cloudmeta`: the account it was last synced with, and whether that was an anonymous one).

| This browser's copy | Mode | What happens |
| --- | --- | --- |
| Of this account | same | Pull, merge (below), push. The career gets only what's queued since the last sync. |
| Of no account (never signed in, or signed out), or of an anonymous user | adopt | Everything here merges *into* the account, the career added in whole, every local run copied in. Signing out clears the account's progress from this copy and the owner with it, so signing in again adds only what was played since: the career is never counted twice. |
| Of another email account | replace | The account's progress replaces this copy (the other account's is safe in its own rows); preferences still merge by time. |

Per item:

- **Sidearm unlocks** (`got`): the union. **Tallies** (`n`): per gun and stat, the higher. **Pro builds earned**: earned on either
  side is earned. **Start in pro mode** (`on`): the side whose arsenal changed last.
- **Preferences** (name, the callsign ranking (as a whole), look, each setting, and the wishlist): per key, the one changed later (`mt`, the
  changing device's clock). A tie, or a value nobody chose (the made-up `OperatorNN` name, written with `mt` 0), goes to the account;
  a key only one side has comes from that side. (The wishlist is a preference rather than a union, so un-starring sticks.)
- **Career counters**: added (the account's + this browser's unsent additions). **deepest**: the higher. **Best runs**: the better.
- **Runs**: the union by id; for the same run, the later copy, unless this browser has changes the account hasn't seen.

Known limitation (kept on purpose): the sidearm tallies take the higher, with no record of what each device added, so tallies made
on two devices between syncs are not summed (8 on one and 7 on the other, both from 5, give 8, not 10). It only slows an unlock a
little, and only for someone playing on two devices at once. The career's counters don't have this problem (they're added).
The preference clock is each device's own.

## Security

- The anon key is public by design; Row Level Security is what protects the rows. Each policy ties a row to `auth.uid()`; `career_add`
  runs as the caller (security invoker), so RLS applies inside it too. The run cap's trigger is the only `security definer`, and it
  deletes only the inserting user's oldest runs.
- **The client is trusted for its own progress.** Nothing stops a player writing any numbers into their own rows (the checks only cap
  sizes and ranges, against abuse of storage). That's fine while the numbers only matter to that player.
- **If leaderboards come later**, the client can't be the source of truth: the stats would have to come from somewhere the player
  doesn't control, e.g. the host reporting each player's events to an **Edge Function** that validates them (plausible rates, levels in
  order, a run's events signed by the host's session) and writes a separate, server-only table (no client insert/update policy), or the
  simulation itself running server-side. Leaderboard reads would then be a view over that table, readable by everyone.
- **Connection secrets stay local.** The TURN relay's settings (`turn`: its URL, user and password) are never synced: they stay in the
  browser they were typed into. A `turn` an older build wrote into a profile row is dropped by the next write from any client, and
  never merged back into a browser.
- **Guest cleanup** (`20261108000000_guest_cleanup.sql`): `public.bp_cleanup_guests(idle_days default 90)`, security definer, not callable
  through the API, deletes anonymous users who never linked an email and have had no activity for 90 days (no sign-in, no change
  to their user record, none of their rows written), and their rows with them (cascade). pg_cron runs it daily at 04:17 UTC (job
  `bp-cleanup-guests`). Without pg_cron the migration makes the function and skips the schedule with a notice; run
  `select public.bp_cleanup_guests();` in the SQL Editor by hand, or enable pg_cron and run the migration again.

## Testing

`npm run test:cloud` (no Supabase project or Docker needed):

- the migration applied to a real Postgres in-process (PGlite, `@electric-sql/pglite`), with a stand-in for Supabase's `auth` schema
  (`auth.users`, `auth.uid()` from the request's claims, the `anon` and `authenticated` roles): RLS between two users, the anon role
  refused, the size/range checks, `career_add`'s caps and maxima, the 1000-run cap, the guest cleanup (an idle guest goes with its
  rows; a recently active one, a new one and an emailed one stay; players can't call it). pg_cron's scheduling itself can't run there;
- the game's own `dist/js/util.js`, `career.js`, `cloud.js`, in script contexts that each act as a browser with its own localStorage,
  against a stand-in for supabase-js over that database (each table call run as the signed-in user, so RLS decides): playing and
  changing settings signed out with the project set up (no request, no user made), the first email sign-in merging everything local
  into the new account, a reload restoring the session without counting anything twice, the offline queue, two accounts kept apart
  through the API, signing in on a second browser and the merge, the first browser picking the merge up, signing out, playing and
  signing in again (and again) with the career counted once, an anonymous session from the earlier version let go of with its
  progress kept, the TURN settings kept out of the row (and stripped from one that had them), the callsign list's migration.

Not covered until a real project exists: supabase-js itself from the CDN (its session storage, token refresh, the magic link's
redirect back with the session in the URL), the emails Supabase sends and their templates, the Auth settings above, real network
failure modes, and PostgREST's own request handling.
