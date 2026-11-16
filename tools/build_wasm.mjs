// Builds the acoustic ray tracer's WebAssembly module (wasm/acoustics, docs/wasm.md) and copies it to assets/wasm/acoustics.wasm, the file the
// page fetches and the repo commits (neither CI nor the site build has Rust). `npm run build:wasm`.
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), CRATE = path.join(ROOT, 'wasm/acoustics');
const env = { ...process.env, PATH: path.join(os.homedir(), '.cargo/bin') + path.delimiter + (process.env.PATH || '') };
const r = spawnSync('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], { cwd: CRATE, env, stdio: 'inherit' });
if (r.status !== 0) { console.error('cargo build failed (needs Rust and the wasm32-unknown-unknown target: rustup target add wasm32-unknown-unknown)'); process.exit(r.status || 1); }
const out = path.join(ROOT, 'assets/wasm/acoustics.wasm');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(path.join(CRATE, 'target/wasm32-unknown-unknown/release/acoustics.wasm'), out);
console.log('assets/wasm/acoustics.wasm ' + fs.statSync(out).size + ' B');
