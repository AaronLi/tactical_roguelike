// The codemod for docs/modules-plan.md phase 4: turns one simulation file into an ES module, and makes it name the other converted
// files by `import` instead of by the global G. Run it, then `npm run typecheck`, `npm run test:sim`, `npm run test:level`.
//
//   node tools/codemod_imports.mjs js/foo.ts            convert js/foo.ts (if it isn't yet) and rewrite its G.X uses
//   node tools/codemod_imports.mjs --dry js/foo.ts      the same, nothing written: prints what it would do
//   node tools/codemod_imports.mjs --uses js/bar.ts     only the second half: rewrite its G.X uses of every converted X, add the
//                                                       imports. For a file already converted, run again after another file has
//                                                       been (a name that wasn't an export yet). NOT for a file that isn't converted:
//                                                       an import makes it a module, and its GameModules merge stops being global
//   (several files may be listed; they are done in order. Edits are written in place: review with git diff)
//
// What "convert" means, for a file written the way the simulation's files all are:
//     const G_Level = { ... };          ->    export const Level = { ... };
//     G.Level = G_Level;                ->    G.Level = Level;           (kept: the files not yet converted still read G)
//     interface GameModules { Level: typeof G_Level; }   ->   declare global { interface GameModules { Level: typeof Level; } }
//   Every `G_Level` in the file becomes `Level`. A module's top-level names are no longer global, so the GameModules merge (what
//   makes `G.Level` typed, and `typeof G.Level` work in the files that aren't converted) has to say `declare global`. The name
//   exported is the one on G (`G.TIER_NAMES = G_TIER_NAMES` exports TIER_NAMES), so `import { TIER_NAMES } from './data.js'` reads
//   the way `G.TIER_NAMES` did. A file with several (js/data.ts has ~90) exports them all.
//
// What "uses" means: in the file (converted by this run or not), every `G.X` (also `window.G.X`, `self.G.X`, and `typeof G.X` in a
//   type) where X is a name some converted file exports (a js/*.ts with `export const X` and `G.X = X`) becomes `X`, and the file gets
//   `import { X, Y } from './thatfile.js';` after its 'use strict'. A file's own G.X for its own exports becomes the bare name, too.
//   Left as they are: `G.X = ...` assignments (the definitions), `G['X']`, and a name that is not an export of any converted file.
//   If the file already has a local name X (a parameter, a variable, a type... anywhere in the file) the import is
//   `import { X as G_X }` and the uses say G_X; if that clashes too, it stops and says so.
//
// What it checks and says, and does not fix:
//   - a use of a converted name that was a guard (`G.X && ...`, `if (G.X)`, `typeof G.X`): the import is always there now, so the check
//     is always true; it is rewritten and listed, to be looked at.
//   - a name of a file that the hand-kept load lists (index.html, SERVER_SCRIPTS, PREP_SCRIPTS, EXPORT_SCRIPTS) put AFTER this one, or
//     don't list where this one is: left as G.X, and said. The module graph runs a file when it's first imported, so importing it would
//     move its load-time effects earlier (and make a cycle with anything it needs back). Convert the files in the plan's order (leaves
//     first), or --force-order to import regardless (then the "order:" lines say what moved).
//   - a G.X = ... elsewhere that assigns a converted name at run time (a bare import would not see it).
//   - the layering rule (docs/modules-plan.md phase 3): a simulation file importing a page-only file. tools/deps.mjs --check enforces it.
// It does not touch: the lists (index.html, the workers': they stay, a converted file that is listed still runs once, in its place),
// the files that name an X without G (types: js/types/*.d.ts, `typeof G.X` in unconverted files works through GameModules).
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { createRequire } from 'node:module'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), JS = path.join(ROOT, 'js');
const TOOL = path.join(ROOT, 'tools/deps');
if (!fs.existsSync(path.join(TOOL, 'node_modules/typescript'))) {
  console.log('installing the parser (TypeScript 5) in tools/deps, once');
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci', '--prefix', TOOL, '--no-audit', '--no-fund'], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('could not install it: run npm ci --prefix tools/deps'); process.exit(1); }
}
const ts = createRequire(path.join(TOOL, 'package.json'))('typescript');
const argv = process.argv.slice(2), DRY = argv.includes('--dry'), ONLY_USES = argv.includes('--uses'), FORCE = argv.includes('--force-order');
const targets = argv.filter((a) => !a.startsWith('--'));
if (!targets.length) { console.error('usage: node tools/codemod_imports.mjs [--dry] [--uses] js/foo.ts [js/bar.ts ...]  (see the top of this file)'); process.exit(2); }

const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
const base = (f) => path.basename(f).replace(/\.ts$/, '');
const unparen = (n) => { while (n && ts.isParenthesizedExpression(n)) n = n.expression; return n; };
/** `G` as an expression: G, window.G, self.G, globalThis.G */
const isG = (n) => (ts.isIdentifier(n) && n.text === 'G') || (ts.isPropertyAccessExpression(n) && n.name.text === 'G' && ts.isIdentifier(n.expression) && ['window', 'self', 'globalThis'].includes(n.expression.text));
/** the name of a member (`.name`, `{ name: ..}`, a method, a property signature), not a binding or a reference */
const isPropName = (n) => { const p = n.parent; return !!p && ((ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isQualifiedName(p) && p.right === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isMethodDeclaration(p) && p.name === n) || (ts.isPropertySignature(p) && p.name === n) || (ts.isPropertyDeclaration(p) && p.name === n) || (ts.isMethodSignature(p) && p.name === n)); };
const isDeclName = (n) => {
  const p = n.parent; if (!p) return false;
  return (ts.isVariableDeclaration(p) || ts.isParameter(p) || ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) || ts.isClassDeclaration(p) || ts.isClassExpression(p) || ts.isBindingElement(p) || ts.isInterfaceDeclaration(p) || ts.isTypeAliasDeclaration(p) || ts.isEnumDeclaration(p) || ts.isTypeParameterDeclaration(p) || ts.isImportSpecifier(p) || ts.isImportClause(p) || ts.isNamespaceImport(p) || ts.isModuleDeclaration(p)) && p.name === n;
};

// ------------------------------------------------------------------ what each file already exports (converted files)
/** { name -> file base } of every `export const X` (or function/let) in js/*.ts that is also put on G as G.X = X */
function exportsOfAll() {
  const out = new Map(), per = new Map();
  for (const f of fs.readdirSync(JS).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))) {
    const text = fs.readFileSync(path.join(JS, f), 'utf8'); if (!/^export\s/m.test(text)) continue;
    const sf = parse(f, text), names = exportedOf(sf);
    per.set(base(f), names);
    for (const n of names) if (!out.has(n)) out.set(n, base(f));
  }
  return { out, per };
}
function exportedOf(sf) {
  const exported = new Set(), onG = new Set();
  for (const s of sf.statements) {
    if (ts.isVariableStatement(s) && (s.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) exported.add(d.name.text);
    if (ts.isFunctionDeclaration(s) && s.name && (s.modifiers || []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) exported.add(s.name.text);
    if (ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && s.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const l = s.expression.left; if (ts.isPropertyAccessExpression(l) && isG(l.expression)) onG.add(l.name.text);
    }
  }
  return [...exported].filter((n) => onG.has(n)); // (the ones the unconverted files can still reach through G)
}

// ------------------------------------------------------------------ the hand-kept load lists
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const listIn = (text, after) => { const i = text.indexOf(after); if (i < 0) return null; const a = text.indexOf('[', i), b = text.indexOf(']', a); return [...text.slice(a, b).matchAll(/'([\w-]+)'/g)].map((m) => m[1]); };
const ORDERS = {
  'index.html': [...read('index.html').matchAll(/src="dist\/js\/([\w-]+)\.js"/g)].map((m) => m[1]),
  'js/serverworker.ts': listIn(read('js/serverworker.ts'), 'SERVER_SCRIPTS ='),
  'js/prepworker.ts': listIn(read('js/prepworker.ts'), 'PREP_SCRIPTS ='),
  'js/exportworker.ts': listIn(read('js/exportworker.ts'), 'EXPORT_SCRIPTS ='),
};
const SIM = new Set([...(ORDERS['js/serverworker.ts'] || []), ...(ORDERS['js/prepworker.ts'] || [])]);

// ------------------------------------------------------------------ one file
function convert(file, text) {
  // 1. const G_X = ...; G.X = G_X;  ->  export const X = ...; (G.X = X; stays)
  let sf = parse(file, text);
  const edits = []; // [start, end, text]
  const notes = [];
  const tops = new Map(); // top-level const name -> { stmt, decl }
  for (const s of sf.statements) if (ts.isVariableStatement(s) && !s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) for (const d of s.declarationList.declarations) if (ts.isIdentifier(d.name)) tops.set(d.name.text, { stmt: s, decl: d });
  const taken = new Set(); const collect = (n) => { if (ts.isIdentifier(n) && !isPropName(n)) taken.add(n.text); ts.forEachChild(n, collect); }; collect(sf);
  const renames = new Map(); // G_X -> X
  for (const s of sf.statements) {
    if (!(ts.isExpressionStatement(s) && ts.isBinaryExpression(s.expression) && s.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken)) continue;
    const l = s.expression.left, r = unparen(s.expression.right);
    if (!(ts.isPropertyAccessExpression(l) && isG(l.expression) && ts.isIdentifier(r))) continue;
    const t = tops.get(r.text); if (!t) { notes.push(`G.${l.name.text} = ${r.text}: ${r.text} is not a top-level const of the file, left`); continue; }
    if (t.stmt.declarationList.declarations.length !== 1 || !(t.stmt.declarationList.flags & ts.NodeFlags.Const)) { notes.push(`${r.text}: not a single const declaration, left`); continue; }
    const name = l.name.text;
    if (r.text !== name) { if (taken.has(name) && !renames.has(r.text)) { notes.push(`cannot export ${r.text} as ${name}: the file already has a ${name}`); continue; } renames.set(r.text, name); }
    edits.push([t.stmt.getStart(sf), t.stmt.getStart(sf), 'export ']);
  }
  for (const [from] of [...renames]) { /* (G.X = G_X: both sides are renamed below) */ void from; }
  // rename every reference
  const visit = (n) => {
    if (ts.isIdentifier(n) && renames.has(n.text)) {
      const p = n.parent;
      const isProp = isPropName(n);
      if (ts.isShorthandPropertyAssignment(p)) notes.push(`line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: shorthand property { ${n.text} } renamed: check it`);
      if (!isProp) edits.push([n.getStart(sf), n.end, ts.isShorthandPropertyAssignment(p) ? `${renames.get(n.text)}: ${renames.get(n.text)}` : renames.get(n.text)]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  // 2. interface GameModules { ... } -> declare global { interface GameModules { ... } }
  for (const s of sf.statements) if (ts.isInterfaceDeclaration(s) && s.name.text === 'GameModules') { edits.push([s.getStart(sf), s.getStart(sf), 'declare global { ']); edits.push([s.end, s.end, ' }']); }
  if (!edits.length) return { text, notes: [...notes, 'nothing to convert (already a module?)'] };
  edits.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  for (const [a, b, t] of edits) text = text.slice(0, a) + t + text.slice(b);
  return { text, notes };
}

function rewriteUses(file, text, exportsMap, ownBase) {
  const sf = parse(file, text), notes = [], edits = [];
  const mine = new Set(exportedOfFuture(sf));
  // (a name of a file the hand-kept lists load AFTER this one is left as G.X: importing it would run that file first, and before whatever it
  // needs that the lists put between them; --force-order imports it anyway, and says so)
  const skipped = new Set();
  const orderOk = (f) => FORCE || Object.values(ORDERS).every((order) => !order || !order.includes(ownBase) || (order.includes(f) && order.indexOf(f) < order.indexOf(ownBase)));
  const via = (name) => {
    if (mine.has(name)) return { file: ownBase, own: true };
    if (!exportsMap.has(name)) return null;
    const f = exportsMap.get(name);
    if (!orderOk(f)) { skipped.add(f); return null; }
    return { file: f, own: false };
  };
  // names used as bindings in the file (a clash if one is imported bare)
  const bound = new Set();
  const collect = (n) => { if (ts.isIdentifier(n) && !isPropName(n)) bound.add(n.text); ts.forEachChild(n, collect); };
  collect(sf);
  const used = new Map(); // name -> local name
  const guardOf = (n) => {
    let o = n; while (o.parent && ts.isParenthesizedExpression(o.parent)) o = o.parent; const p = o.parent;
    if (!p) return false;
    return (ts.isBinaryExpression(p) && p.left === o && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)) || (ts.isConditionalExpression(p) && p.condition === o) || ((ts.isIfStatement(p) || ts.isWhileStatement(p)) && p.expression === o) || (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.ExclamationToken) || ts.isTypeOfExpression(p);
  };
  const local = (name) => {
    if (mine.has(name)) return name;
    if (used.has(name)) return used.get(name);
    let l = name;
    if (bound.has(name)) { l = 'G_' + name; if (bound.has(l)) throw new Error(`${file}: cannot import ${name}: both ${name} and ${l} are used in the file already`); }
    used.set(name, l); bound.add(l); return l;
  };
  const visit = (n) => {
    // G.X as an expression
    if (ts.isPropertyAccessExpression(n) && isG(n.expression)) {
      const name = n.name.text, v = via(name);
      if (v) {
        let o = n; while (o.parent && ts.isParenthesizedExpression(o.parent)) o = o.parent;
        const p = o.parent, isDef = p && ts.isBinaryExpression(p) && p.left === o && p.operatorToken.kind === ts.SyntaxKind.EqualsToken;
        const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
        if (isDef) { if (!v.own) notes.push(`line ${line}: G.${name} is assigned here: a run-time change that the import would not see`); }
        else {
          if (guardOf(n)) notes.push(`line ${line}: G.${name} was a guard (${text.slice(n.getStart(sf), Math.min(n.end + 20, text.indexOf('\n', n.end) < 0 ? n.end + 20 : text.indexOf('\n', n.end))).trim()}): always true now`);
          if (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.PlusPlusToken) notes.push(`line ${line}: G.${name} is incremented`);
          edits.push([n.getStart(sf), n.end, local(name)]);
          if (!v.own) used.set('\0from:' + name, v.file);
        }
        return; // (nothing inside G.X to rewrite)
      }
    }
    // typeof G.X in a type
    if (ts.isTypeQueryNode(n) && ts.isQualifiedName(n.exprName)) {
      let q = n.exprName; while (ts.isQualifiedName(q.left)) q = q.left; // the innermost `G.X`
      if (ts.isIdentifier(q.left) && q.left.text === 'G') {
        const name = q.right.text, v = via(name);
        if (v) { edits.push([q.getStart(sf), q.end, local(name)]); if (!v.own) used.set('\0from:' + name, v.file); }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  const byFile = new Map();
  for (const [k, v] of used) if (k.startsWith('\0from:')) { const name = k.slice(6), f = v; if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(used.get(name) === name ? name : `${name} as ${used.get(name)}`); }
  for (const f of skipped) notes.push(`left as G.X: the names of ${f}, which the lists load after ${ownBase} (or not before it: --force-order imports them anyway)`);
  return { edits, byFile, notes, sf };
}
/** the names the file will export (after convert), from its text as it now is */
function exportedOfFuture(sf) { return exportedOf(sf); }

function insertImports(text, sf, byFile) {
  if (!byFile.size) return text;
  const have = new Map(); // existing imports: from -> specifier text
  const lines = [...byFile].sort((a, b) => a[0].localeCompare(b[0])).map(([f, names]) => `import { ${[...new Set(names)].sort((a, b) => a.localeCompare(b)).join(', ')} } from './${f}.js';`);
  void have;
  // after 'use strict' (line 1), or the last existing import, else at the top
  let at = 0; const imps = sf.statements.filter((s) => ts.isImportDeclaration(s));
  const us = sf.statements.find((s) => ts.isExpressionStatement(s) && ts.isStringLiteral(s.expression) && s.expression.text === 'use strict');
  if (imps.length) at = imps[imps.length - 1].end; else if (us) at = us.end; else at = 0;
  const ins = (at ? '\n' : '') + lines.join('\n') + (at ? '' : '\n');
  return text.slice(0, at) + ins + text.slice(at);
}

let bad = 0;
for (const target of targets) {
  const file = path.resolve(ROOT, target), b = base(file), rel = path.relative(ROOT, file);
  if (!fs.existsSync(file) || !file.endsWith('.ts')) { console.error(`${target}: not a js/*.ts file`); bad++; continue; }
  let text = fs.readFileSync(file, 'utf8'); const notes = [];
  if (!ONLY_USES && !/^export\s/m.test(text)) { const r = convert(rel, text); text = r.text; notes.push(...r.notes); }
  // (the exports of the OTHER files from disk; this file's own from the text as converted just now)
  const { out } = exportsOfAll(); for (const [n, f] of [...out]) if (f === b) out.delete(n);
  const r = rewriteUses(rel, text, out, b);
  const edits = r.edits.sort((x, y) => y[0] - x[0] || y[1] - x[1]);
  for (const [a, e, t] of edits) text = text.slice(0, a) + t + text.slice(e);
  // the imports go in as the text now stands (parse again: the edits moved things)
  text = insertImports(text, parse(rel, text), r.byFile);
  notes.push(...r.notes);
  // the load lists: every imported file must come before this one in each list this one is in
  for (const [list, order] of Object.entries(ORDERS)) {
    if (!order || !order.includes(b)) continue;
    for (const f of r.byFile.keys()) if (!order.includes(f)) notes.push(`order: ${list} does not list ${f}, which ${b} now imports (it would load there, where nothing listed it)`); else if (order.indexOf(f) > order.indexOf(b)) notes.push(`order: ${list} loads ${f} AFTER ${b}, which now imports it (it will run first: its load-time effects move earlier)`);
  }
  // the layering rule
  if (SIM.has(b)) for (const f of r.byFile.keys()) if (!SIM.has(f)) notes.push(`layering: the simulation's ${b} would import page-only ${f}`);
  const count = r.edits.length;
  console.log(`${rel}: ${count} uses rewritten, imports from ${[...r.byFile.keys()].join(', ') || '(none)'}${DRY ? ' (dry run: not written)' : ''}`);
  for (const n of notes) console.log('  ' + n);
  if (notes.some((n) => /^cannot|layering:/.test(n))) bad++;
  if (!DRY) fs.writeFileSync(file, text);
}
process.exit(bad ? 1 : 0);
