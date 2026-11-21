// Builds the game's WebAssembly modules (docs/wasm.md) and copies each to assets/wasm/<name>.wasm, the file the page fetches: wasm/acoustics (the
// acoustic ray tracer) and wasm/gunao (a gun's ambient occlusion). Build outputs, not kept in the repo (.gitignore): `npm run build` makes them (this
// file, its step), and so does CI, which has Rust (.github/workflows/pages.yml). `npm run build:wasm` is this step alone.
// The compiler is the one each crate's rust-toolchain.toml pins, with its target (both pin the same: rustup installs it the first time, `rustup toolchain
// install` in either folder). Without Rust (no cargo), the step is skipped with a warning and the game uses the JavaScript fallbacks (js/acoustics.ts's
// tracer, js/gunao.ts: the same results, slower); on CI (CI set, as GitHub Actions sets it) a missing Rust fails the build.
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), CRATES = ['acoustics', 'gunao'];
const env = { ...process.env, PATH: path.join(os.homedir(), '.cargo/bin') + path.delimiter + (process.env.PATH || '') };
const outOf = (name) => path.join(ROOT, 'assets/wasm/' + name + '.wasm');
const have = spawnSync('cargo', ['--version'], { cwd: path.join(ROOT, 'wasm', CRATES[0]), env, stdio: 'ignore' });
if (have.error || have.status !== 0) {
  const msg = 'no Rust (cargo) found: install it from https://rustup.rs (the crates pin their version and target: wasm/*/rust-toolchain.toml)';
  if (process.env.CI) { console.error('build:wasm: ' + msg); process.exit(1); }
  const old = CRATES.filter((c) => fs.existsSync(outOf(c)));
  console.warn('build:wasm: skipped, ' + msg + '. The game uses the JavaScript acoustic tracer and occlusion' + (old.length ? ' (older ' + old.map((c) => 'assets/wasm/' + c + '.wasm').join(', ') + ' left as they are)' : '') + '.');
  process.exit(0);
}
for (const name of CRATES) {
  const crate = path.join(ROOT, 'wasm', name), out = outOf(name);
  const r = spawnSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { cwd: crate, env, stdio: 'inherit' });
  if (r.status !== 0) { console.error('build:wasm: cargo build failed in wasm/' + name + ' (the toolchain and target: `rustup toolchain install` in that folder)'); process.exit(r.status || 1); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.copyFileSync(path.join(crate, 'target/wasm32-unknown-unknown/release/' + name + '.wasm'), out);
  console.log('assets/wasm/' + name + '.wasm ' + fs.statSync(out).size + ' B');
}
