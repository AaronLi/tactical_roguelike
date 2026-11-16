// Builds the acoustic ray tracer's WebAssembly module (wasm/acoustics, docs/wasm.md) and copies it to assets/wasm/acoustics.wasm, the file the
// page fetches. A build output, not kept in the repo (.gitignore): `npm run build` makes it (this file, its step), and so does CI, which has Rust
// (.github/workflows/pages.yml). `npm run build:wasm` is this step alone.
// The compiler is the one wasm/acoustics/rust-toolchain.toml pins, with its target (rustup installs it the first time: `rustup toolchain install` in
// that folder). Without Rust (no cargo), the step is skipped with a warning and the game measures its rooms with the JavaScript tracer
// (js/acoustics.ts, the fallback: the same results, about half as fast); on CI (CI set, as GitHub Actions sets it) a missing Rust fails the build.
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), CRATE = path.join(ROOT, 'wasm/acoustics');
const env = { ...process.env, PATH: path.join(os.homedir(), '.cargo/bin') + path.delimiter + (process.env.PATH || '') };
const out = path.join(ROOT, 'assets/wasm/acoustics.wasm');
const have = spawnSync('cargo', ['--version'], { cwd: CRATE, env, stdio: 'ignore' });
if (have.error || have.status !== 0) {
  const msg = 'no Rust (cargo) found: install it from https://rustup.rs (the crate pins its version and target: wasm/acoustics/rust-toolchain.toml)';
  if (process.env.CI) { console.error('build:wasm: ' + msg); process.exit(1); }
  console.warn('build:wasm: skipped, ' + msg + '. The game uses the JavaScript acoustic tracer' + (fs.existsSync(out) ? ' (an older assets/wasm/acoustics.wasm is left as it is)' : '') + '.');
  process.exit(0);
}
const r = spawnSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { cwd: CRATE, env, stdio: 'inherit' });
if (r.status !== 0) { console.error('build:wasm: cargo build failed (the toolchain and target: `rustup toolchain install` in wasm/acoustics)'); process.exit(r.status || 1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(path.join(CRATE, 'target/wasm32-unknown-unknown/release/acoustics.wasm'), out);
console.log('assets/wasm/acoustics.wasm ' + fs.statSync(out).size + ' B');
