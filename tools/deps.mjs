// The inventory for moving from the global G to ES modules (docs/modules-plan.md, phase 0): who uses what, and when.
//   node tools/deps.mjs            writes docs/modules-inventory.md (to read) and docs/modules-inventory.json (for the
//                                  later phases' scripts), and prints a summary
//   node tools/deps.mjs --check    the same summary, nothing written; exit 1 if a simulation file reaches a page-only
//                                  module without a guard while loading (what phase 3 has to clear first)
//   node tools/deps.mjs --no-tsc   without the trial module typecheck (it takes a few seconds)
// What it reads:
//   - every js/*.ts, parsed (TypeScript 5's API, tools/deps/package.json: TypeScript 7's package has no API):
//     which G.X each file defines (`G.X = ...`) and uses, and for each use whether it runs while the file loads or only
//     once something calls it (inside a function), and whether it's guarded (`G.X && ...`, `if (G.X)`, `G.X?.`)
//   - the load orders written by hand: index.html's script tags, the workers' script lists (SERVER_SCRIPTS, PREP_SCRIPTS, EXPORT_SCRIPTS) (js/serverworker.ts,
//     js/prepworker.ts, js/exportworker.ts) and the node tools' (tools/level_env.mjs, tools/model_env.mjs)
//   - the trial typecheck: tsconfig.modules-trial.json, every file a module (moduleDetection force). Its errors are the
//     references between files that don't go through G: the types (interface LvMap in one file, used in forty) and the
//     odd global value. What phase 1 has to give a home.
// "While loading" is worked out, not run: a function's body is taken as run at load when the function's called at once
// (an IIFE, `(() => {...})()`), when it's a callback of an array method called at load (`.map(...)` in a constant's
// initializer), when it's a function or an object's method of the same file called at load, or (one step across files)
// when it's a method of another module called at load (`G.Level.foo()` at the top of a file makes what foo uses at load
// part of that file's load). Anything subtler (a function handed to another file and called there at once) isn't seen.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), JS = path.join(ROOT, 'js');
// (the parser: TypeScript 5 in its own folder, tools/deps, so its tsc doesn't replace the project's TypeScript 7 in
// node_modules/.bin; installed there the first time)
const TOOL = path.join(ROOT, 'tools/deps');
if (!fs.existsSync(path.join(TOOL, 'node_modules/typescript'))) {
  console.log('installing the parser (TypeScript 5) in tools/deps, once');
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--prefix', TOOL, '--no-audit', '--no-fund'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('could not install it: run npm ci --prefix tools/deps'); process.exit(1); }
}
const ts = createRequire(path.join(TOOL, 'package.json'))('typescript');
const argv = process.argv.slice(2), CHECK = argv.includes('--check'), NO_TSC = argv.includes('--no-tsc');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ------------------------------------------------------------------ the load orders written by hand
const listIn = (text, after) => { const i = text.indexOf(after); if (i < 0) return null; const a = text.indexOf('[', i), b = text.indexOf(']', a); return [...text.slice(a, b).matchAll(/'([\w-]+)'/g)].map((m) => m[1]); };
const ORDERS = {
  'index.html': [...read('index.html').matchAll(/src="dist\/js\/([\w-]+)\.js"/g)].map((m) => m[1]),
  'js/serverworker.ts': listIn(read('js/serverworker.ts'), 'SERVER_SCRIPTS ='),
  'js/prepworker.ts': listIn(read('js/prepworker.ts'), 'PREP_SCRIPTS ='),
  'js/exportworker.ts': listIn(read('js/exportworker.ts'), 'EXPORT_SCRIPTS ='),
  'tools/level_env.mjs': listIn(read('tools/level_env.mjs'), 'LEVEL_SCRIPTS ='),
  'tools/model_env.mjs': listIn(read('tools/model_env.mjs'), 'for (const f of ['),
};
// The simulation side: what the server's thread and the level's preparation load (nothing that draws or plays)
const SIM = new Set([...ORDERS['js/serverworker.ts'], ...ORDERS['js/prepworker.ts']]);

// ------------------------------------------------------------------ parsing
const files = fs.readdirSync(JS).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).sort();
const base = (f) => f.replace(/\.ts$/, '');
const SYNC = new Set(['map', 'forEach', 'filter', 'reduce', 'reduceRight', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flatMap', 'sort', 'from', 'fromEntries', 'replace', 'replaceAll']);
const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n);
const unparen = (n) => { while (n && ts.isParenthesizedExpression(n)) n = n.expression; return n; };
const outerParen = (n) => { while (n.parent && ts.isParenthesizedExpression(n.parent)) n = n.parent; return n; };
/** G.X: the X, or null */
const gName = (n) => (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'G' ? n.name.text
  : ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'G' && ts.isStringLiteral(n.argumentExpression) ? n.argumentExpression.text : null);

const F = {}; // per file: defs, uses, top-level declarations, and the methods of what it puts on G
for (const f of files) {
  const text = fs.readFileSync(path.join(JS, f), 'utf8'), sf = ts.createSourceFile(f, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const defs = new Map(), uses = [], decls = new Map();
  // names bound to functions, and objects' members bound to functions (for "called at load")
  const fnsByName = new Map(), objMembers = new Map(); // name -> [fn], objName -> Map(member -> [fn])
  const addFn = (m, k, fn) => { if (!m.has(k)) m.set(k, []); m.get(k).push(fn); };
  const membersOf = (obj) => { const m = new Map(); for (const p of obj.properties) { const k = p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) ? p.name.text : null; if (!k) continue; if (ts.isMethodDeclaration(p) || ts.isGetAccessorDeclaration(p)) addFn(m, k, p); else if (ts.isPropertyAssignment(p) && isFn(unparen(p.initializer))) addFn(m, k, unparen(p.initializer)); } return m; };
  // an object a name is bound to: { ... }, or what an IIFE returns ({ ... } at its end)
  const objOf = (init) => {
    init = unparen(init); if (!init) return null;
    if (ts.isObjectLiteralExpression(init)) return init;
    if (ts.isAsExpression(init) || ts.isSatisfiesExpression?.(init)) return objOf(init.expression);
    if (ts.isCallExpression(init) && isFn(unparen(init.expression))) {
      const fn = unparen(init.expression), body = fn.body; if (!body || !ts.isBlock(body)) return body ? objOf(body) : null;
      for (let i = body.statements.length - 1; i >= 0; i--) { const s = body.statements[i]; if (ts.isReturnStatement(s) && s.expression) return objOf(s.expression); }
    }
    return null;
  };
  const visitDecl = (n) => {
    if (ts.isFunctionDeclaration(n) && n.name) addFn(fnsByName, n.name.text, n);
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const init = unparen(n.initializer);
      if (isFn(init)) addFn(fnsByName, n.name.text, init);
      const o = objOf(n.initializer); if (o) objMembers.set(n.name.text, membersOf(o));
    }
    ts.forEachChild(n, visitDecl);
  };
  visitDecl(sf);
  // the file's own top-level declarations (what another file can name bare, as long as they're all scripts)
  for (const s of sf.statements) {
    const kind = ts.isInterfaceDeclaration(s) ? 'interface' : ts.isTypeAliasDeclaration(s) ? 'type' : ts.isFunctionDeclaration(s) ? 'function' : ts.isClassDeclaration(s) ? 'class' : ts.isEnumDeclaration(s) ? 'enum' : ts.isModuleDeclaration(s) ? 'namespace' : ts.isVariableStatement(s) ? 'var' : null;
    if (!kind) continue;
    if (kind === 'var') { for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) decls.set(d.name.text, { kind: 'value', line: line(d) }); }
    else if (s.name && ts.isIdentifier(s.name)) decls.set(s.name.text, { kind: kind === 'interface' || kind === 'type' ? 'type' : kind === 'class' || kind === 'enum' ? 'both' : 'value', line: line(s) });
  }
  // what the file puts on G: G.X = <name> (its members, for another file calling G.X.m() at load), or G.X = <object>
  const gMembers = new Map();
  const visitDefs = (n) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const x = gName(n.left);
      if (x) {
        if (!defs.has(x)) defs.set(x, line(n));
        const r = unparen(n.right), o = ts.isIdentifier(r) ? objMembers.get(r.text) : objOf(r) ? membersOf(objOf(r)) : null;
        if (o) gMembers.set(x, o);
      }
    }
    ts.forEachChild(n, visitDefs);
  };
  visitDefs(sf);

  // the walk: each G.X use, at load or not, guarded or not; a function's body is walked when it's reached as "at load"
  // (an IIFE, a sync callback, a local function or member called at load), and again (deferred) on its own otherwise
  const loadFns = new Set(), crossCalls = []; // [module, member, line] called at load
  const guardOf = (n, x) => {
    // the use itself as a check: G.X && .., G.X ? .., if (G.X), !G.X, G.X || .., typeof G.X, G.X?.y
    const o = outerParen(n), p = o.parent;
    if (p && ts.isBinaryExpression(p) && p.left === o && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)) return 'check';
    if (p && ts.isConditionalExpression(p) && p.condition === o) return 'check';
    if (p && (ts.isIfStatement(p) || ts.isWhileStatement(p)) && p.expression === o) return 'check';
    if (p && ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) return 'check';
    if (p && ts.isTypeOfExpression(p)) return 'check';
    if (p && (ts.isPropertyAccessExpression(p) || ts.isElementAccessExpression(p) || ts.isCallExpression(p)) && p.questionDotToken) return 'check';
    // inside what a check of it protects: the right of G.X && .., the branch of if (G.X) / G.X ? ..
    const mentions = (e) => { let hit = false; const v = (k) => { if (hit) return; if (gName(k) === x) { hit = true; return; } ts.forEachChild(k, v); }; v(e); return hit; };
    for (let c = n, a = n.parent; a; c = a, a = a.parent) {
      if (ts.isBinaryExpression(a) && a.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && a.right === c && mentions(a.left)) return 'guarded';
      if (ts.isConditionalExpression(a) && a.whenTrue === c && mentions(a.condition)) return 'guarded';
      if (ts.isIfStatement(a) && a.thenStatement === c && mentions(a.expression)) return 'guarded';
      if (isFn(a)) break;
    }
    return 'plain';
  };
  const seen = new Set(); // (node, atLoad) already walked
  const walk = (n, atLoad, via) => {
    const k = n.pos + ':' + n.end + ':' + n.kind + ':' + atLoad; if (seen.has(k)) return; seen.add(k);
    if (isFn(n)) {
      const o = outerParen(n), p = o.parent;
      const iife = p && ts.isCallExpression(p) && unparen(p.expression) === n;
      const syncCb = p && ts.isCallExpression(p) && p.arguments.includes(o) && ts.isPropertyAccessExpression(p.expression) && SYNC.has(p.expression.name.text);
      const now = atLoad && (iife || syncCb || loadFns.has(n));
      if (!now) { if (atLoad) { ts.forEachChild(n, (c) => walk(c, false, via)); return; } }
      ts.forEachChild(n, (c) => walk(c, now || (!atLoad ? false : atLoad), via));
      return;
    }
    // class members: static ones at load (with the class), the rest when one's made
    if ((ts.isPropertyDeclaration(n) || ts.isClassStaticBlockDeclaration(n)) && atLoad) {
      const st = ts.isClassStaticBlockDeclaration(n) || (n.modifiers || []).some((m) => m.kind === ts.SyntaxKind.StaticKeyword);
      if (!st) { ts.forEachChild(n, (c) => walk(c, false, via)); return; }
    }
    // types aren't run
    if (ts.isTypeNode(n) || ts.isInterfaceDeclaration(n) || ts.isTypeAliasDeclaration(n)) return;
    const x = gName(n);
    if (x) {
      const p = outerParen(n).parent, isDef = p && ts.isBinaryExpression(p) && p.left === outerParen(n) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      if (!isDef) uses.push({ x, line: line(n), load: atLoad, guard: guardOf(n, x), via: via || undefined });
      // G.X.m() at load: m's body (in X's file) is run at load too: seen once every file's parsed
      if (atLoad && p && ts.isPropertyAccessExpression(p) && p.expression === outerParen(n) && p.parent && ts.isCallExpression(p.parent) && p.parent.expression === p) crossCalls.push([x, p.name.text, line(n)]);
    }
    if (atLoad && ts.isCallExpression(n)) {
      const cal = unparen(n.expression);
      const mark = (fns) => { for (const fn of fns || []) if (!loadFns.has(fn)) { loadFns.add(fn); walk(fn.body || fn, true, via); } };
      if (ts.isIdentifier(cal)) mark(fnsByName.get(cal.text));
      if (ts.isPropertyAccessExpression(cal) && ts.isIdentifier(cal.expression) && objMembers.has(cal.expression.text)) mark(objMembers.get(cal.expression.text).get(cal.name.text));
    }
    if (atLoad && ts.isNewExpression(n) && ts.isIdentifier(n.expression)) {
      // a class of this file made at load: its constructor and field initialisers run
      const c = sf.statements.find((s) => ts.isClassDeclaration(s) && s.name && s.name.text === n.expression.text);
      if (c) for (const m of c.members) if (ts.isConstructorDeclaration(m) || ts.isPropertyDeclaration(m)) { loadFns.add(m); walk(m.body || m.initializer || m, true, via); }
    }
    ts.forEachChild(n, (c) => walk(c, atLoad, via));
  };
  // (a function's body walked at load must not be counted again as deferred: walk at load first, then deferred skips
  // nodes already counted at load)
  walk(sf, true, null);
  const atLoadUse = new Set(uses.map((u) => u.x + ':' + u.line + ':' + u.load));
  F[f] = { defs, uses, decls, gMembers, crossCalls, sf, line, walkMember: (fn, via) => { const before = uses.length; walk(fn.body || fn, true, via); return uses.slice(before); }, atLoadUse };
}
// (a use counted both at load and deferred, the same place: at load wins)
for (const f of files) {
  const U = F[f].uses, loadAt = new Set(U.filter((u) => u.load).map((u) => u.x + ':' + u.line));
  F[f].uses = U.filter((u) => u.load || !loadAt.has(u.x + ':' + u.line));
}

// ------------------------------------------------------------------ who defines what
const owner = new Map(); // X -> file
for (const f of files) for (const [x] of F[f].defs) if (!owner.has(x)) owner.set(x, f); else if (owner.get(x) !== f) (owner.dup ||= []).push([x, owner.get(x), f]);
// one step across files: G.X.m() at load runs m at load, in X's file: what m uses becomes a load-time use of the caller
for (const f of files) for (const [x, m, ln] of F[f].crossCalls) {
  const of = owner.get(x); if (!of || of === f) continue;
  const fns = F[of].gMembers.get(x) && F[of].gMembers.get(x).get(m); if (!fns) continue;
  for (const fn of fns) for (const u of F[of].walkMember(fn, `G.${x}.${m}() at ${base(f)}:${ln}`)) if (owner.get(u.x) !== f) F[f].uses.push({ ...u, line: ln, via: `G.${x}.${m}() (${base(of)}:${u.line})` });
}
const undefinedNames = new Map();
for (const f of files) for (const u of F[f].uses) if (!owner.has(u.x)) { if (!undefinedNames.has(u.x)) undefinedNames.set(u.x, new Set()); undefinedNames.get(u.x).add(base(f)); }

// ------------------------------------------------------------------ the graph
const edges = {}; // file -> dep file -> { load: n, call: n, lines: [] }
for (const f of files) {
  const e = (edges[base(f)] = {});
  for (const u of F[f].uses) {
    const of = owner.get(u.x); if (!of || of === f) continue;
    const d = (e[base(of)] ||= { load: 0, call: 0, names: new Set(), loadAt: [] });
    d[u.load ? 'load' : 'call']++; d.names.add(u.x);
    if (u.load) d.loadAt.push({ x: u.x, line: u.line, guard: u.guard, via: u.via });
  }
}
const names = files.map(base);
function sccs(adj) { // Tarjan
  let i = 0; const idx = new Map(), low = new Map(), st = [], on = new Set(), out = [];
  const go = (v) => { idx.set(v, i); low.set(v, i); i++; st.push(v); on.add(v);
    for (const w of adj(v)) { if (!idx.has(w)) { go(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), idx.get(w))); }
    if (low.get(v) === idx.get(v)) { const c = []; let w; do { w = st.pop(); on.delete(w); c.push(w); } while (w !== v); out.push(c); } };
  for (const v of names) if (!idx.has(v)) go(v);
  return out;
}
// load-time edges that must hold: unguarded ones (a guarded one only does less when the other isn't there yet)
const hardLoad = (v) => Object.entries(edges[v]).filter(([, d]) => d.loadAt.some((u) => u.guard === 'plain')).map(([w]) => w);
const anyLoad = (v) => Object.entries(edges[v]).filter(([, d]) => d.load).map(([w]) => w);
const anyEdge = (v) => Object.keys(edges[v]);
const loadCycles = sccs(hardLoad).filter((c) => c.length > 1);
const allCycles = sccs(anyEdge).filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
// a load order from the hard load-time edges (dependencies first; ties kept in index.html's order)
const pos = (o) => new Map(o.map((n, k) => [n, k]));
const htmlPos = pos(ORDERS['index.html']);
function topo() {
  const done = new Set(), out = [], tmp = new Set();
  const go = (v) => { if (done.has(v) || tmp.has(v)) return; tmp.add(v); for (const w of hardLoad(v).sort((a, b) => (htmlPos.get(a) ?? 1e9) - (htmlPos.get(b) ?? 1e9))) go(w); tmp.delete(v); done.add(v); out.push(v); };
  for (const v of [...names].sort((a, b) => (htmlPos.get(a) ?? 1e9) - (htmlPos.get(b) ?? 1e9))) go(v);
  return out;
}
const order = topo();
// each hand-kept order against the load-time edges: a dependency missing, or loaded after the file that needs it at load
const orderProblems = {};
for (const [where, list] of Object.entries(ORDERS)) {
  if (!list) continue; const p = pos(list), probs = [];
  for (const v of list) {
    if (!edges[v]) continue;
    for (const [w, d] of Object.entries(edges[v])) {
      const plain = d.loadAt.filter((u) => u.guard === 'plain'); if (!plain.length) continue;
      if (!p.has(w)) probs.push({ file: v, needs: w, kind: 'missing', at: plain.slice(0, 3) });
      else if (p.get(w) > p.get(v)) probs.push({ file: v, needs: w, kind: 'later', at: plain.slice(0, 3) });
    }
  }
  orderProblems[where] = probs;
}

// ------------------------------------------------------------------ the simulation reaching the page
const page = (x) => owner.has(x) && !SIM.has(base(owner.get(x)));
const reach = [];
for (const f of files) {
  if (!SIM.has(base(f))) continue;
  for (const u of F[f].uses) if (page(u.x)) reach.push({ file: base(f), x: u.x, owner: base(owner.get(u.x)), line: u.line, load: u.load, guard: u.guard, via: u.via });
}
const unguardedAtLoad = reach.filter((r) => r.load && r.guard === 'plain');

// ------------------------------------------------------------------ the trial typecheck: every file a module
let trial = null;
if (!NO_TSC) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.modules-trial.json', '--pretty', 'false'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  const lines = (r.stdout + r.stderr).split('\n').map((l) => l.match(/^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/)).filter(Boolean);
  const declAt = new Map(); for (const f of files) for (const [n, d] of F[f].decls) if (!declAt.has(n)) declAt.set(n, { file: base(f), ...d });
  const byCode = {}, bare = new Map(), gLost = new Set(), other = [], umd = new Set(), unusedGM = new Set();
  for (const [, file, ln, , code, msg] of lines.filter((l) => l[1].startsWith('js/'))) { // (not node_modules': skipLibCheck is off)
    byCode[code] = (byCode[code] || 0) + 1;
    const nm = msg.match(/^Cannot find (?:name|namespace) '([^']+)'/);
    const gp = msg.match(/^Property '([^']+)' does not exist on type 'GameNamespace'/);
    if (nm) { const k = nm[1]; if (!bare.has(k)) bare.set(k, { name: k, decl: declAt.get(k) || null, users: new Map() }); const b = bare.get(k), u = base(path.basename(file)); b.users.set(u, (b.users.get(u) || 0) + 1); }
    else if (gp) gLost.add(gp[1]);
    else if (code === 'TS2686') umd.add(base(path.basename(file))); // ('THREE' refers to a UMD global: three's types, js/types/three-global.d.ts)
    else if (code === 'TS6196' && /'GameModules'/.test(msg)) unusedGM.add(base(path.basename(file)));
    else other.push({ file, line: +ln, code, msg });
  }
  trial = { total: lines.filter((l) => l[1].startsWith('js/')).length, byCode, bare: [...bare.values()].map((b) => ({ ...b, users: Object.fromEntries(b.users), uses: [...b.users.values()].reduce((a, c) => a + c, 0) })).sort((a, b) => b.uses - a.uses), gLost: [...gLost].sort(), umd: [...umd].sort(), unusedGM: unusedGM.size, other };
}

// ------------------------------------------------------------------ the summary, the doc, the data
const totalUses = files.reduce((a, f) => a + F[f].uses.length, 0), loadUses = files.reduce((a, f) => a + F[f].uses.filter((u) => u.load).length, 0);
const summary = [
  `${files.length} files, ${owner.size} names on G, ${totalUses} uses (${loadUses} while loading)`,
  `load-time cycles (unguarded): ${loadCycles.length}${loadCycles.length ? ': ' + loadCycles.map((c) => c.join(' <-> ')).join('; ') : ''}`,
  `cycles counting calls: ${allCycles.length}, the largest ${allCycles[0] ? allCycles[0].length : 0} files`,
  `hand-kept orders against the load-time needs: ${Object.entries(orderProblems).map(([k, v]) => `${k} ${v.length}`).join(', ')}`,
  `the simulation reaching page-only modules: ${reach.length} uses (${reach.filter((r) => r.guard === 'plain').length} unguarded, ${unguardedAtLoad.length} of them while loading)`,
  `names used but defined nowhere: ${undefinedNames.size}`,
  trial ? `trial module typecheck: ${trial.total} errors; ${trial.bare.length} bare names between files (${trial.bare.reduce((a, b) => a + b.uses, 0)} uses), ${trial.gLost.length} G members lost, ${trial.other.length} others` : 'trial module typecheck: skipped',
];
console.log(summary.join('\n'));
if (CHECK) process.exit(unguardedAtLoad.length ? 1 : 0);

const md = [];
const P = (...l) => md.push(...l);
const fmtAt = (u) => `${u.x}:${u.line}${u.guard !== 'plain' ? ` (${u.guard})` : ''}${u.via ? ` via ${u.via}` : ''}`;
P('# Modules inventory', '', 'Generated by `node tools/deps.mjs` (docs/modules-plan.md, phase 0). Do not edit by hand: run it again.', 'The same data, complete, is in `docs/modules-inventory.json`.', '',
  '"While loading" is worked out statically, not run (the rules are at the top of `tools/deps.mjs`). A use is **plain** if', 'nothing checks the module is there, **check** if it is the check itself (`G.X && ...`), **guarded** if a check of it protects it.', '',
  '## Summary', '', ...summary.map((s) => '- ' + s), '');
P('## 1. Dependency graph', '', '### Load-time cycles', '');
if (!loadCycles.length) P('None: every unguarded use while loading can be satisfied by some order.', '');
else for (const c of loadCycles) { P(`- ${c.join(', ')}`); for (const v of c) for (const w of c) if (edges[v][w]) for (const u of edges[v][w].loadAt.filter((q) => q.guard === 'plain').slice(0, 4)) P(`  - ${v} needs ${w} at load: ${fmtAt(u)}`); }
P('', '### Cycles counting calls', '', 'These are fine as ES modules (a module may call one that imports it, once both have loaded). Listed for scale.', '');
for (const c of allCycles) P(`- ${c.length} files: ${c.sort().join(', ')}`);
P('', '### A load order the load-time needs allow', '', 'Dependencies first, ties in index.html\'s order:', '', '```', order.join(' '), '```', '');
P('### The hand-kept orders against the load-time needs', '', 'A file that uses another, unguarded, while loading, where that other is missing from the list or comes after it.', '');
for (const [where, probs] of Object.entries(orderProblems)) {
  P(`- **${where}** (${ORDERS[where].length} files): ${probs.length ? probs.length + ' problems' : 'consistent'}`);
  for (const q of probs) P(`  - ${q.file} needs ${q.needs} (${q.kind}): ${q.at.map(fmtAt).join(', ')}`);
}
P('', '### Each file', '', '| File | Defines | Needs at load | Calls into |', '| --- | --- | --- | --- |');
for (const v of order) {
  const f = v + '.ts', defsOf = [...F[f].defs.keys()];
  const ld = Object.entries(edges[v]).filter(([, d]) => d.load).map(([w, d]) => w + (d.loadAt.every((u) => u.guard !== 'plain') ? ' (guarded)' : '')).sort();
  const cl = Object.entries(edges[v]).filter(([, d]) => !d.load).map(([w]) => w).sort();
  P(`| ${v}${SIM.has(v) ? ' (sim)' : ''} | ${defsOf.slice(0, 8).join(', ')}${defsOf.length > 8 ? `, +${defsOf.length - 8}` : ''} | ${ld.join(', ') || '-'} | ${cl.join(', ') || '-'} |`);
}
if (undefinedNames.size) { P('', '### Names used but defined nowhere', '', 'Stubs some loader puts there, or leftovers.', ''); for (const [x, us] of undefinedNames) P(`- G.${x}: used in ${[...us].join(', ')}`); }
if (owner.dup && owner.dup.length) { P('', '### Names defined in more than one file', ''); for (const [x, a, b] of owner.dup) P(`- G.${x}: ${base(a)} and ${base(b)}`); }
P('', '## 2. The simulation reaching page-only modules', '',
  `The simulation side is what js/serverworker.ts and js/prepworker.ts load (${SIM.size} files). Each use below names a module`, 'the page has and the server thread does not. Phase 3 replaces each with a hook the page fills in.', '');
const byPair = new Map(); for (const r of reach) { const k = r.file + ' -> ' + r.owner; if (!byPair.has(k)) byPair.set(k, []); byPair.get(k).push(r); }
P('| From | To | Uses | Plain | At load | Where |', '| --- | --- | --- | --- | --- | --- |');
for (const [k, rs] of [...byPair].sort((a, b) => b[1].length - a[1].length)) {
  const [fr, to] = k.split(' -> ');
  P(`| ${fr} | ${to} | ${rs.length} | ${rs.filter((r) => r.guard === 'plain').length} | ${rs.filter((r) => r.load).length} | ${rs.slice(0, 12).map((r) => `${r.x}:${r.line}${r.guard === 'plain' ? '' : '*'}`).join(' ')}${rs.length > 12 ? ' ...' : ''} |`);
}
P('', '`*` checked or guarded. Plain uses are the ones that would throw in the server thread if reached there.', '');
P('## 3. Trial module typecheck', '');
if (!trial) P('Skipped (--no-tsc).');
else {
  P('`tsconfig.modules-trial.json`: the project with every file a module (`moduleDetection: force`). Phase 1 is done when', 'the only errors left are G members (those go when the files are converted).', '',
    `${trial.total} errors: ${Object.entries(trial.byCode).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join(', ')}.`, '',
    `**G members lost** (TS2339 on GameNamespace, ${trial.gLost.length} names): each file's \`interface GameModules\` no longer merges (and in ${trial.unusedGM} files it's reported unused). Expected; they go as the files are converted.`, '',
    `**THREE as a global** (TS2686, in ${trial.umd.length} files): three's types declare it a UMD global, which a module may not use without an import. Phase 2's import map, or \`allowUmdGlobalAccess\`, clears these.`, '',
    '**Bare names between files** (TS2304 and the like): declared at the top of one file, named in others without G.', '',
    '| Name | Kind | Declared in | Uses | Used by |', '| --- | --- | --- | --- | --- |');
  for (const b of trial.bare) P(`| ${b.name} | ${b.decl ? b.decl.kind : '?'} | ${b.decl ? `${b.decl.file}:${b.decl.line}` : '(not a top-level declaration)'} | ${b.uses} | ${Object.entries(b.users).sort((a, c) => c[1] - a[1]).map(([u, n]) => `${u} ${n}`).join(', ')} |`);
  const vals = trial.bare.filter((b) => b.decl && b.decl.kind !== 'type');
  if (vals.length) { P('', `**Bare values** (${vals.length}): named across files without G, some only in types (\`typeof G_World.add\`), some at runtime and even at load (\`G_Sim.VEIL_MS\` in game.ts's object literal): the graph above doesn't see those, so each needs an export and an import, not only a home for its type: ${vals.map((b) => `${b.name} (${b.decl.file})`).join(', ')}.`); }
  if (trial.other.length) { P('', `**Everything else** (${trial.other.length}): almost all follow on from the lost G members (a callback's parameter loses its type with the module it came from: TS7006, TS7031, TS18047...). They should go with the rest; any left after phase 1 is real.`, ''); for (const o of trial.other.slice(0, 60)) P(`- ${o.file}:${o.line} ${o.code} ${o.msg}`); if (trial.other.length > 60) P(`- ... ${trial.other.length - 60} more in the JSON`); }
}
fs.writeFileSync(path.join(ROOT, 'docs/modules-inventory.md'), md.join('\n') + '\n');
const json = {
  note: 'Generated by node tools/deps.mjs. See docs/modules-plan.md.',
  sim: [...SIM], orders: ORDERS, order, owner: Object.fromEntries([...owner].map(([x, f]) => [x, base(f)])),
  files: Object.fromEntries(files.map((f) => [base(f), { defs: Object.fromEntries(F[f].defs), uses: F[f].uses, decls: Object.fromEntries(F[f].decls) }])),
  edges: Object.fromEntries(Object.entries(edges).map(([v, e]) => [v, Object.fromEntries(Object.entries(e).map(([w, d]) => [w, { load: d.load, call: d.call, names: [...d.names], loadAt: d.loadAt }]))])),
  loadCycles, allCycles, orderProblems, reach, undefined: Object.fromEntries([...undefinedNames].map(([x, s]) => [x, [...s]])), trial,
};
fs.writeFileSync(path.join(ROOT, 'docs/modules-inventory.json'), JSON.stringify(json, null, 1) + '\n');
console.log('wrote docs/modules-inventory.md and docs/modules-inventory.json');
