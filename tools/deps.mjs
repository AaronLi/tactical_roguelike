// The inventory of what the game's files use of each other (docs/modules-plan.md, phase 0: who uses what, and when; first written for the move from the global G to
// ES modules, which is done: no file has a G any more, js/debugglobals.ts builds the console's from the exports).
//   node tools/deps.mjs            writes docs/modules-inventory.md (to read) and docs/modules-inventory.json (for the
//                                  later phases' scripts), and prints a summary
//   node tools/deps.mjs --check    the same summary, nothing written; exit 1 if a simulation file names a page-only module
//                                  by import, guarded or not (the layering rule, phase 3), or if a file reads or writes the global G (it has
//                                  none: only js/debugglobals.ts builds one) or a load order is wrong; run in CI: npm run deps:check
// What it reads:
//   - every js/*.ts, parsed (TypeScript 5's API, tools/deps/package.json: TypeScript 7's package has no API):
//     which names each file exports and uses (a name imported from another file, or, if one came back, a read of the global G),
//     and for each use whether it runs while the file loads or only once something calls it (inside a function), and whether
//     it's guarded (`X && ...`, `if (X)`, `X?.`). js/debugglobals.ts, which names everything to build the console's G, is not read for uses
//   - the load orders: the page's entry file (js/main.ts, with index.html's one classic script, js/modelbundles.ts), the three workers' entry files
//     (js/serverhost.ts, js/prepentry.ts, js/exportentry.ts) and the node tools' lists (tools/level_env.mjs, tools/model_env.mjs); what runs in what
//     order is worked out from the imports
// "While loading" is worked out, not run: a function's body is taken as run at load when the function's called at once
// (an IIFE, `(() => {...})()`), when it's a callback of an array method called at load (`.map(...)` in a constant's
// initializer), when it's a function or an object's method of the same file called at load, or (one step across files)
// when it's a method of another module called at load (`Level.foo()` at the top of a file makes what foo uses at load
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
const argv = process.argv.slice(2), CHECK = argv.includes('--check');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// ------------------------------------------------------------------ the load orders written by hand
const listIn = (text, after) => { const i = text.indexOf(after); if (i < 0) return null; const a = text.indexOf('[', i), b = text.indexOf(']', a); return [...text.slice(a, b).matchAll(/'([\w-]+)'/g)].map((m) => m[1]); };
// What loads what, as the loaders state it: the page's entry file (js/main.ts) and its classic script, the three workers' entry files (each worker
// imports one file, and that file's imports do the rest: the server's, the level preparation's and the highlights export's), and the node tools'
// lists. A list is a sequence of roots; what actually runs, and in what order, is worked out below from the imports (evalOrder), as an ES module
// loader would.
const dynImports = (text) => [...text.matchAll(/import\('\.\/([\w-]+)\.js'\)/g)].map((m) => m[1]);
const sideImports = (text) => [...text.matchAll(/^import '\.\/([\w-]+)\.js';/gm)].map((m) => m[1]); // (an entry file's imports, in order)
const ROOTS = {
  // the page: index.html's classic script (js/modelbundles.ts, which runs first) and its one module, js/main.ts, whose imports are the rest
  'js/main.ts': [...read('index.html').matchAll(/<script src="dist\/js\/([\w-]+)\.js"/g)].map((m) => m[1]).concat(sideImports(read('js/main.ts'))),
  'js/serverworker.ts': dynImports(read('js/serverworker.ts')).filter((n) => n !== 'threeboot'), // (threeboot: three.js, the page's)
  'js/prepworker.ts': dynImports(read('js/prepworker.ts')).filter((n) => n !== 'threeboot'),
  'js/exportworker.ts': dynImports(read('js/exportworker.ts')).filter((n) => n !== 'threeboot'),
  // the other pages and tools that load some of the files: ambience.html (its inline module's imports), the cloud test (its SRC)
  'ambience.html': [...read('ambience.html').matchAll(/from '\.\/dist\/js\/([\w-]+)\.js'/g)].map((m) => m[1]),
  'tools/cloud.test.mjs': [...(read('tools/cloud.test.mjs').match(/const SRC = \[(.*?)\]/) || ['', ''])[1].matchAll(/'([\w-]+)\.js'/g)].map((m) => m[1]),
  'tools/level_env.mjs': listIn(read('tools/level_env.mjs'), 'LEVEL_SCRIPTS ='),
  'tools/model_env.mjs': listIn(read('tools/model_env.mjs'), 'runScripts(ctx, dist, ['),
};
// The simulation's files, stated: the layering rule needs them named (a simulation file importing a page file would otherwise make that
// file part of the simulation, quietly). They must be exactly what the two workers' entry files reach (js/serverhost.ts, js/prepentry.ts):
// checked below, so a file added to the simulation is added here on purpose.
const SIMULATION = ['util', 'medical', 'materials', 'data', 'spacedata', 'shipgen', 'callsigns', 'arsenal', 'parts', 'gear', 'sim', 'world', 'ballistics', 'leveldesc', 'level', 'furnspec', 'furniture', 'homes', 'residents', 'scars', 'damage', 'stickers', 'route', 'shop', 'recorder', 'server', 'spaceserver', 'serverhost', 'furnmesh', 'lightgrid', 'prepentry', 'radar', 'spacesim', 'hullshape', 'rcstris', 'spacenet', 'svbattle'];
const SIM = new Set(SIMULATION);

// ------------------------------------------------------------------ parsing
const files = fs.readdirSync(JS).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts')).sort();
const base = (f) => f.replace(/\.ts$/, '');
const SYNC = new Set(['map', 'forEach', 'filter', 'reduce', 'reduceRight', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flatMap', 'sort', 'from', 'fromEntries', 'replace', 'replaceAll']);
const isFn = (n) => ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n) || ts.isConstructorDeclaration(n);
const unparen = (n) => { while (n && ts.isParenthesizedExpression(n)) n = n.expression; return n; };
const outerParen = (n) => { while (n.parent && ts.isParenthesizedExpression(n.parent)) n = n.parent; return n; };
/** G.X: the X, or null (no file has a G now: any one is reported) */
const gName = (n) => (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'G' ? n.name.text
  : ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'G' && ts.isStringLiteral(n.argumentExpression) ? n.argumentExpression.text : null);

const F = {}; // per file: defs (its exports), uses, top-level declarations, and the members of what it exports
for (const f of files) {
  const text = fs.readFileSync(path.join(JS, f), 'utf8'), sf = ts.createSourceFile(f, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const defs = new Map(), uses = [], decls = new Map(), imports = []; // (imports: what the file takes from another by `import`, once it's a module: docs/modules-plan.md phase 4)
  const importLocals = new Map(); // (local name -> its import: what a bare name in the file refers to)
  for (const s of sf.statements) if (ts.isImportDeclaration(s) && !(s.importClause && s.importClause.isTypeOnly) && ts.isStringLiteral(s.moduleSpecifier) && /^\.\.?\//.test(s.moduleSpecifier.text)) { // (an `import type` runs nothing and is no edge)
    const els = s.importClause && s.importClause.namedBindings && ts.isNamedImports(s.importClause.namedBindings) ? s.importClause.namedBindings.elements : [];
    const im = { from: path.basename(s.moduleSpecifier.text).replace(/\.js$/, ''), line: line(s), names: els.map((e) => (e.propertyName || e.name).text), sideEffect: !s.importClause, kept: !s.importClause };
    imports.push(im);
    for (const e of els) importLocals.set(e.name.text, { im, name: (e.propertyName || e.name).text });
  }
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
  // what the file exports (its members, for another file calling X.m() at load), and any G.X = ... (there are none: each is reported)
  const gMembers = new Map(), gWrites = [];
  const exported = (s) => (s.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  for (const s of sf.statements) {
    const def = (name, nameNode) => { if (!defs.has(name)) defs.set(name, line(nameNode || s)); const o = objMembers.get(name); if (o) gMembers.set(name, o); };
    if (ts.isVariableStatement(s) && exported(s)) { for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) def(d.name.text, d); }
    else if ((ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) && s.name && exported(s)) def(s.name.text, s);
    else if (ts.isExportDeclaration(s) && !s.isTypeOnly && !s.moduleSpecifier && s.exportClause && ts.isNamedExports(s.exportClause)) for (const e of s.exportClause.elements) if (!e.isTypeOnly) def(e.name.text, e);
  }
  const visitDefs = (n) => {
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken) { const x = gName(n.left); if (x) gWrites.push({ x, line: line(n) }); }
    ts.forEachChild(n, visitDefs);
  };
  visitDefs(sf);

  // the walk: each G.X use, at load or not, guarded or not; a function's body is walked when it's reached as "at load"
  // (an IIFE, a sync callback, a local function or member called at load), and again (deferred) on its own otherwise
  const loadFns = new Set(), crossCalls = []; // [module, member, line] called at load
  // a bare name that is an import's (not a member, not the import's own specifier): a use of the module it comes from, as G.X is
  const importRef = (n) => {
    if (!ts.isIdentifier(n) || !importLocals.has(n.text)) return null;
    const p = n.parent; if (!p) return null;
    if (ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p)) return null;
    if ((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || ((ts.isMethodDeclaration(p) || ts.isPropertyDeclaration(p) || ts.isPropertySignature(p) || ts.isMethodSignature(p)) && p.name === n) || (ts.isQualifiedName(p) && p.right === n)) return null;
    return importLocals.get(n.text);
  };
  const refName = (n) => { const g = gName(n); if (g) return g; const r = importRef(n); return r ? r.name : null; };
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
    const mentions = (e) => { let hit = false; const v = (k) => { if (hit) return; if (refName(k) === x) { hit = true; return; } ts.forEachChild(k, v); }; v(e); return hit; };
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
    const ir = importRef(n), x = ir ? ir.name : gName(n);
    if (x) {
      if (ir) ir.im.kept = true; // (a name used as a value: the import stays in the compiled file; used only in types, tsc drops it)
      const p = outerParen(n).parent, isDef = !ir && p && ts.isBinaryExpression(p) && p.left === outerParen(n) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      if (!isDef) uses.push({ x, from: ir ? ir.im.from : undefined, line: line(n), load: atLoad, guard: guardOf(n, x), via: via || undefined });
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
  if (f !== 'debugglobals.ts') walk(sf, true, null); // (the console's G names every export, at load: not a use the game has)
  const atLoadUse = new Set(uses.map((u) => u.x + ':' + u.line + ':' + u.load));
  F[f] = { defs, uses, decls, imports, gMembers, gWrites, crossCalls, sf, line, walkMember: (fn, via) => { const before = uses.length; walk(fn.body || fn, true, via); return uses.slice(before); }, atLoadUse };
}
// (a use counted both at load and deferred, the same place: at load wins)
for (const f of files) {
  const U = F[f].uses, loadAt = new Set(U.filter((u) => u.load).map((u) => u.x + ':' + u.line));
  F[f].uses = U.filter((u) => u.load || !loadAt.has(u.x + ':' + u.line));
}

// ------------------------------------------------------------------ who defines what
const owner = new Map(); // X (an export) -> file
for (const f of files) for (const [x] of F[f].defs) if (!owner.has(x)) owner.set(x, f); else if (owner.get(x) !== f) (owner.dup ||= []).push([x, owner.get(x), f]);
// one step across files: X.m() at load runs m at load, in X's file: what m uses becomes a load-time use of the caller
for (const f of files) for (const [x, m, ln] of F[f].crossCalls) {
  const of = owner.get(x); if (!of || of === f) continue;
  const fns = F[of].gMembers.get(x) && F[of].gMembers.get(x).get(m); if (!fns) continue;
  for (const fn of fns) for (const u of F[of].walkMember(fn, `${x}.${m}() at ${base(f)}:${ln}`)) if (owner.get(u.x) !== f) F[f].uses.push({ ...u, line: ln, via: `${x}.${m}() (${base(of)}:${u.line})` });
}

// ------------------------------------------------------------------ the graph
const edges = {}; // file -> dep file -> { load: n, call: n, lines: [] }
for (const f of files) {
  const e = (edges[base(f)] = {});
  for (const u of F[f].uses) {
    const of = u.from ? u.from + '.ts' : owner.get(u.x); if (!of || of === f) continue; // (a use of an imported name: the file it is imported from)
    const d = (e[base(of)] ||= { load: 0, call: 0, names: new Set(), loadAt: [] });
    d[u.load ? 'load' : 'call']++; d.names.add(u.x);
    if (u.load) d.loadAt.push({ x: u.x, line: u.line, guard: u.guard, via: u.via });
  }
}
// What an `import` does to the order is not an edge of need (a need is a use while loading, above: G.X or an imported name): it makes
// the module graph run the imported file first. That is what evalOrder simulates, and the orders are checked against the needs.
/** the files in the order they run when `roots` are imported one after another: depth first, an import before its importer, each once
 *  (a cycle's second visit does nothing, as in the ES module loader); an import only of types is dropped by tsc, so it is not followed */
function evalOrder(roots) {
  const done = new Set(), out = [];
  const go = (v) => { if (done.has(v)) return; done.add(v); const f = F[v + '.ts']; if (f) for (const im of f.imports) if (im.kept && F[im.from + '.ts']) go(im.from); out.push(v); };
  for (const r of roots) go(r);
  return out;
}
const ORDERS = Object.fromEntries(Object.entries(ROOTS).map(([k, r]) => [k, r && evalOrder(r)]));
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
// a load order from the hard load-time edges (dependencies first; ties kept in the page's order (js/main.ts))
const pos = (o) => new Map(o.map((n, k) => [n, k]));
const htmlPos = pos(ORDERS['js/main.ts']);
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
  for (const u of F[f].uses) if (!u.from && page(u.x)) reach.push({ file: base(f), x: u.x, owner: base(owner.get(u.x)), line: u.line, load: u.load, guard: u.guard, via: u.via });
}
for (const f of files) if (SIM.has(base(f))) for (const im of F[f].imports) if (!SIM.has(im.from) && files.includes(im.from + '.ts')) reach.push({ file: base(f), x: im.names.join(', ') || '*', owner: im.from, line: im.line, load: true, guard: 'plain', import: true });
const unguardedAtLoad = reach.filter((r) => r.load && r.guard === 'plain');
// the simulation as stated (SIMULATION) is what the two entry files reach, no more and no less
const reached = new Set([...ORDERS['js/serverworker.ts'], ...ORDERS['js/prepworker.ts']]);
const simDrift = [...reached].filter((v) => !SIM.has(v)).map((v) => `${v} is reached by a worker's entry file but is not in SIMULATION (tools/deps.mjs): a page file imported by the simulation, or a new simulation file to add there`)
  .concat([...SIM].filter((v) => !reached.has(v)).map((v) => `${v} is in SIMULATION (tools/deps.mjs) but no worker's entry file reaches it`));

// ------------------------------------------------------------------ a global G
// (docs/modules-plan.md phase 7: the files reach each other by import; the only G is the console's, built by js/debugglobals.ts, which reads every export and
// is read by none. A `G.X` read or written anywhere else is the old way back in.)
const gReads = []; // { file, x, line, write }
for (const f of files) {
  for (const u of F[f].uses) if (!u.from) gReads.push({ file: base(f), x: u.x, line: u.line, write: false });
  for (const w of F[f].gWrites) gReads.push({ file: base(f), x: w.x, line: w.line, write: true });
}
// ------------------------------------------------------------------ the summary, the doc, the data
const fmtAt = (u) => `${u.x}:${u.line}${u.guard !== 'plain' ? ` (${u.guard})` : ''}${u.via ? ` via ${u.via}` : ''}`;
const totalUses = files.reduce((a, f) => a + F[f].uses.length, 0), loadUses = files.reduce((a, f) => a + F[f].uses.filter((u) => u.load).length, 0);
const summary = [
  `${files.length} files, ${owner.size} exported names, ${totalUses} uses (${loadUses} while loading)`,
  `load-time cycles (unguarded): ${loadCycles.length}${loadCycles.length ? ': ' + loadCycles.map((c) => c.join(' <-> ')).join('; ') : ''}`,
  `cycles counting calls: ${allCycles.length}, the largest ${allCycles[0] ? allCycles[0].length : 0} files`,
  `load orders (from the imports and the lists) against the load-time needs: ${Object.entries(orderProblems).map(([k, v]) => `${k} ${v.length}`).join(', ')}`,
  `the simulation reaching page-only modules: ${reach.length} uses (${reach.filter((r) => r.guard === 'plain').length} unguarded, ${unguardedAtLoad.length} of them while loading)`,
  `reads and writes of the global G (only js/debugglobals.ts builds one, and reads none): ${gReads.length} (see 2b)`,
];
console.log(summary.join('\n'));
// The layering rule (docs/modules-plan.md, phase 3): a simulation file names only simulation modules; what it needs of the page it asks
// through Hooks (js/types/hooks.d.ts), which the page fills in. Any import of a page-only module in a simulation file, guarded or not, fails; so does
// any use of the global G (there is none: the console's is built by js/debugglobals.ts).
if (CHECK) {
  for (const r of reach) console.error(r.import ? `layering: js/${r.file}.ts:${r.line} imports ${r.x} from ${r.owner}.ts (page-only): ask through a Hooks hook the page fills in` : `layering: js/${r.file}.ts:${r.line} uses G.${r.x} (${r.owner}.ts is page-only): ask through a Hooks hook the page fills in`);
  for (const g of gReads) console.error(`G: js/${g.file}.ts:${g.line} ${g.write ? 'writes' : 'reads'} G.${g.x}: the files import each other; only js/debugglobals.ts builds a G`);
  for (const d of simDrift) console.error('layering: ' + d);
  const badOrder = Object.entries(orderProblems).flatMap(([where, ps]) => ps.map((q) => `order: ${where}: ${q.file} needs ${q.needs} while loading (${q.kind}): ${q.at.map(fmtAt).join(', ')}`));
  for (const b of badOrder) console.error(b);
  if (reach.length) console.error(`${reach.length} use(s) of a page-only module in the simulation's files (${[...SIM].length} files: what js/serverhost.ts and js/prepentry.ts reach)`);
  else if (!simDrift.length && !badOrder.length && !gReads.length) console.log('layering ok: no simulation file names a page-only module; every order consistent with the load-time needs; no use of G');
  process.exit(reach.length || simDrift.length || badOrder.length || gReads.length ? 1 : 0);
}

const md = [];
const P = (...l) => md.push(...l);
P('# Modules inventory', '', 'Generated by `node tools/deps.mjs` (docs/modules-plan.md, phase 0). Do not edit by hand: run it again.', 'The same data, complete, is in `docs/modules-inventory.json`.', '',
  '"While loading" is worked out statically, not run (the rules are at the top of `tools/deps.mjs`). A use is **plain** if', 'nothing checks the module is there, **check** if it is the check itself (`X && ...`), **guarded** if a check of it protects it.', '',
  '## Summary', '', ...summary.map((s) => '- ' + s), '');
P('## 1. Dependency graph', '', '### Load-time cycles', '');
if (!loadCycles.length) P('None: every unguarded use while loading can be satisfied by some order.', '');
else for (const c of loadCycles) { P(`- ${c.join(', ')}`); for (const v of c) for (const w of c) if (edges[v][w]) for (const u of edges[v][w].loadAt.filter((q) => q.guard === 'plain').slice(0, 4)) P(`  - ${v} needs ${w} at load: ${fmtAt(u)}`); }
P('', '### Cycles counting calls', '', 'These are fine as ES modules (a module may call one that imports it, once both have loaded). Listed for scale.', '');
for (const c of allCycles) P(`- ${c.length} files: ${c.sort().join(', ')}`);
P('', '### A load order the load-time needs allow', '', 'Dependencies first, ties in the page\'s order (js/main.ts):', '', '```', order.join(' '), '```', '');
P('### The load orders against the load-time needs', '', 'The order each loader runs the files in, worked out from the imports (a file runs after what it imports; the two workers each import one entry file, js/serverhost.ts and js/prepentry.ts; the page, the export worker and the tools name a list of files). A file that uses another, unguarded, while loading, where that other is missing or comes after it.', '');
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
if (owner.dup && owner.dup.length) { P('', '### Names exported by more than one file', ''); for (const [x, a, b] of owner.dup) P(`- ${x}: ${base(a)} and ${base(b)}`); }
P('', '## 2. The simulation reaching page-only modules', '',
  `The simulation side is what js/serverhost.ts and js/prepentry.ts, the two workers' entry files, reach (${SIM.size} files, stated as SIMULATION in tools/deps.mjs). Each use below names a module`, 'the page has and the server thread does not. The layering rule (phase 3; `npm run deps:check`, run in CI) allows none: what the simulation needs of the page it asks through `G.Hooks` (js/types/hooks.d.ts), which the page files fill in as they load.', '');
if (!reach.length) P('None.', '');
const byPair = new Map(); for (const r of reach) { const k = r.file + ' -> ' + r.owner; if (!byPair.has(k)) byPair.set(k, []); byPair.get(k).push(r); }
if (reach.length) P('| From | To | Uses | Plain | At load | Where |', '| --- | --- | --- | --- | --- | --- |');
for (const [k, rs] of [...byPair].sort((a, b) => b[1].length - a[1].length)) {
  const [fr, to] = k.split(' -> ');
  P(`| ${fr} | ${to} | ${rs.length} | ${rs.filter((r) => r.guard === 'plain').length} | ${rs.filter((r) => r.load).length} | ${rs.slice(0, 12).map((r) => `${r.x}:${r.line}${r.guard === 'plain' ? '' : '*'}`).join(' ')}${rs.length > 12 ? ' ...' : ''} |`);
}
if (reach.length) P('', '`*` checked or guarded. Plain uses are the ones that would throw in the server thread if reached there.', '');
P('## 2b. The global G', '', 'No file reads or writes `G`: they import each other (phase 7). `js/debugglobals.ts` builds `window.G` for the console and the browser checks from every export, at the end of `js/main.ts`, and is not read for uses here. `npm run deps:check` fails on any other `G.X`.', '');
if (!gReads.length) P('None.', '');
else for (const g of gReads) P(`- js/${g.file}.ts:${g.line} ${g.write ? 'writes' : 'reads'} G.${g.x}`);
P('');
fs.writeFileSync(path.join(ROOT, 'docs/modules-inventory.md'), md.join('\n') + '\n');
const json = {
  note: 'Generated by node tools/deps.mjs. See docs/modules-plan.md.',
  sim: [...SIM], orders: ORDERS, order, owner: Object.fromEntries([...owner].map(([x, f]) => [x, base(f)])),
  files: Object.fromEntries(files.map((f) => [base(f), { defs: Object.fromEntries(F[f].defs), imports: F[f].imports, uses: F[f].uses, decls: Object.fromEntries(F[f].decls) }])),
  edges: Object.fromEntries(Object.entries(edges).map(([v, e]) => [v, Object.fromEntries(Object.entries(e).map(([w, d]) => [w, { load: d.load, call: d.call, names: [...d.names], loadAt: d.loadAt }]))])),
  loadCycles, allCycles, orderProblems, reach, gReads,
};
fs.writeFileSync(path.join(ROOT, 'docs/modules-inventory.json'), JSON.stringify(json, null, 1) + '\n');
console.log('wrote docs/modules-inventory.md and docs/modules-inventory.json');
