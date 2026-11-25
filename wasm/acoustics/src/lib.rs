//! The acoustic ray tracer's hot loop: `rays(n)` of `tracer()` in js/acoustics.ts, line for line, so that with the same
//! random numbers it makes the same histograms. No dependencies, no wasm-bindgen: plain `extern "C"` exports over linear memory
//! (docs/wasm.md). The page fills a Scene (a floor's tiles, zones, doors and windows) once per map and floor, and makes a Trace
//! (one measurement from one point) from it; `trace_rays(n)` sends the next n rays, and the page reads the histograms back.
//!
//! The random numbers are mulberry32, the same function js/acousticswasm.ts has (`makeRng`): one 32-bit draw each, over 2^32.

use std::f64::consts::PI;

// the constants of `TR` in js/acoustics.ts
const RAYS: u32 = 500;
const BIN: f64 = 0.002;
const MAX_T: f64 = 3.5;
const MIN_E: f64 = 2e-4;
const SCATTER: f64 = 0.35;
const C: f64 = 343.0;
const EARLY: f64 = 0.08;
const DOOR_H: f64 = 2.1;
const WIN_A: f64 = 0.04;
const DOOR_A: f64 = 0.1;

/// the zone table's columns (one f64 array of NZ * 10: column k of zone z at k * nz + z)
const Z_OUT: usize = 0;
const Z_HEIGHT: usize = 1;
const Z_AC: usize = 2;
const Z_AF: usize = 3;
const Z_ACL: usize = 4;
const Z_AFL: usize = 5;
const Z_AW: usize = 6;
const Z_AWL: usize = 7;
const Z_LOSS: usize = 8;
const Z_LOSSL: usize = 9;
const Z_COLS: usize = 10;

/// the buffers of `scene_ptr`
const B_FLAGS: u32 = 0; // u8 per tile: bit 0 a drop in the floor (tile 5), bit 1 a window
const B_ZONE_AT: u32 = 1; // i32 per tile
const B_DOOR_AT: u32 = 2; // i32 per tile: the door's index, or -1
const B_ZONES: u32 = 3; // f64, Z_COLS * nz


pub struct Scene {
    w: i32,
    h: i32,
    nz: usize,
    f: i32,
    ts: f64,
    fy: f64,
    building_top: f64,
    flags: Vec<u8>,
    zone_at: Vec<i32>,
    door_at: Vec<i32>,
    zones: Vec<f64>,
    doors: Vec<u8>,
}

pub struct Trace {
    scene: *const Scene,
    x0: f64,
    y0: f64,
    z0: f64,
    zi: usize,
    r2: f64,
    out_wall_a: f64,
    out_wall_al: f64,
    rng: u32,
    sent: u32,
    hist: Vec<f64>,
    hist_l: Vec<f64>,
    early: Vec<f64>, // (time, weight) pairs
}

#[inline(always)]
fn next(state: &mut u32) -> f64 {
    // mulberry32
    *state = state.wrapping_add(0x6D2B79F5);
    let a = *state;
    let mut t = (a ^ (a >> 15)).wrapping_mul(1 | a);
    t = t.wrapping_add((t ^ (t >> 7)).wrapping_mul(61 | t)) ^ t;
    ((t ^ (t >> 14)) as f64) / 4294967296.0
}

#[inline(always)]
fn scatter_dir(rng: &mut u32, axis: i32, s: f64) -> (f64, f64, f64) {
    let u = next(rng);
    let v = next(rng) * PI * 2.0;
    let r = u.sqrt();
    let a = r * v.cos();
    let b = r * v.sin();
    let n = (1.0 - u).sqrt() * s;
    if axis == 0 {
        (n, a, b)
    } else if axis == 1 {
        (a, n, b)
    } else {
        (a, b, n)
    }
}

#[inline(always)]
fn sign(x: f64) -> f64 {
    if x > 0.0 { 1.0 } else if x < 0.0 { -1.0 } else { x }
}

/// memory for the page to fill
#[no_mangle]
pub extern "C" fn scene_new(cells: u32, nz: u32, nd: u32, w: u32, h: u32, f: u32, ts: f64, fy: f64, building_top: f64) -> *mut Scene {
    let n = cells as usize;
    Box::into_raw(Box::new(Scene {
        w: w as i32,
        h: h as i32,
        nz: nz as usize,
        f: f as i32,
        ts,
        fy,
        building_top,
        flags: vec![0; n],
        zone_at: vec![-1; n],
        door_at: vec![-1; n],
        zones: vec![0.0; nz as usize * Z_COLS],
        doors: vec![0; nd as usize],
    }))
}

#[no_mangle]
pub unsafe extern "C" fn scene_ptr(s: *mut Scene, which: u32) -> *mut u8 {
    let s = &mut *s;
    match which {
        B_FLAGS => s.flags.as_mut_ptr(),
        B_ZONE_AT => s.zone_at.as_mut_ptr() as *mut u8,
        B_DOOR_AT => s.door_at.as_mut_ptr() as *mut u8,
        B_ZONES => s.zones.as_mut_ptr() as *mut u8,
        _ => s.doors.as_mut_ptr(), // (B_DOORS: u8 per door, 1 if a ray passes it: open, fallen or gone)
    }
}

#[no_mangle]
pub unsafe extern "C" fn scene_free(s: *mut Scene) {
    drop(Box::from_raw(s));
}

#[no_mangle]
pub unsafe extern "C" fn trace_new(s: *const Scene, x0: f64, y0: f64, z0: f64, zi: u32, r2: f64, out_wall_a: f64, out_wall_al: f64, seed: u32) -> *mut Trace {
    let nb = (MAX_T / BIN).ceil() as usize;
    Box::into_raw(Box::new(Trace {
        scene: s,
        x0,
        y0,
        z0,
        zi: zi as usize,
        r2,
        out_wall_a,
        out_wall_al,
        rng: seed,
        sent: 0,
        hist: vec![0.0; nb],
        hist_l: vec![0.0; nb],
        early: Vec::new(),
    }))
}

#[no_mangle]
pub unsafe extern "C" fn trace_free(t: *mut Trace) {
    drop(Box::from_raw(t));
}

/// the histograms (f64 each, trace_bins() of them) and the early arrivals (trace_early_len() f64 pairs)
#[no_mangle]
pub unsafe extern "C" fn trace_hist(t: *const Trace, low: u32) -> *const f64 {
    if low != 0 { (*t).hist_l.as_ptr() } else { (*t).hist.as_ptr() }
}
#[no_mangle]
pub unsafe extern "C" fn trace_bins(t: *const Trace) -> u32 {
    (*t).hist.len() as u32
}
#[no_mangle]
pub unsafe extern "C" fn trace_early(t: *const Trace) -> *const f64 {
    (*t).early.as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn trace_early_len(t: *const Trace) -> u32 {
    ((*t).early.len() / 2) as u32
}

/// Send the next n rays; true (1) once all of them have gone.
#[no_mangle]
pub unsafe extern "C" fn trace_rays(tr: *mut Trace, n: u32) -> u32 {
    let tr = &mut *tr;
    let sc = &*tr.scene;
    let end = RAYS.min(tr.sent + n);
    while tr.sent < end {
        send_ray(tr, sc);
        tr.sent += 1;
    }
    (tr.sent >= RAYS) as u32
}

#[inline(always)]
fn send_ray(tr: &mut Trace, sc: &Scene) {
    let nb = tr.hist.len();
    let (w, h, ts, fy, nz) = (sc.w, sc.h, sc.ts, sc.fy, sc.nz);
    let col = |k: usize, z: usize| sc.zones[k * nz + z];
    let (x0, y0, z0, zi, r2) = (tr.x0, tr.y0, tr.z0, tr.zi, tr.r2);
    let rng = &mut tr.rng;

    let u = 2.0 * next(rng) - 1.0;
    let ph = next(rng) * PI * 2.0;
    let sq = (1.0 - u * u).sqrt();
    let (mut dx, mut dy, mut dz) = (sq * ph.cos(), u, sq * ph.sin());
    let (mut px, mut py, mut pz) = (x0, y0, z0);
    let (mut e, mut e_l, mut path) = (1.0f64, 1.0f64, 0.0f64);
    for ev in 0..600 {
        let tx = (px / ts).floor();
        let tz = (pz / ts).floor();
        if tx < 0.0 || tz < 0.0 || tx >= w as f64 || tz >= h as f64 {
            break; // off the map: gone
        }
        let (tx, tz) = (tx as i32, tz as i32);
        let i = (tz * w + tx) as usize;
        let zc = sc.zone_at[i];
        let zk = if zc >= 0 { zc as usize } else { zi };
        let out = zc >= 0 && col(Z_OUT, zk) != 0.0;
        let ceil = if out { f64::INFINITY } else { fy + col(Z_HEIGHT, zk) };
        let flo = fy;
        let sx = if dx > 1e-9 { (((tx + 1) as f64) * ts - px) / dx } else if dx < -1e-9 { ((tx as f64) * ts - px) / dx } else { f64::INFINITY };
        let sz = if dz > 1e-9 { (((tz + 1) as f64) * ts - pz) / dz } else if dz < -1e-9 { ((tz as f64) * ts - pz) / dz } else { f64::INFINITY };
        let sy = if dy > 1e-9 { (ceil - py) / dy } else if dy < -1e-9 { (flo - py) / dy } else { f64::INFINITY };
        let mut m = sx;
        if sz < m { m = sz; }
        if sy < m { m = sy; }
        let s = if m.is_nan() || m > 1e-6 { m } else { 1e-6 };
        if !s.is_finite() {
            break;
        }
        // the catching sphere
        if ev > 0 || path > 0.0 {
            let wx = x0 - px;
            let wy = y0 - py;
            let wz = z0 - pz;
            let proj = wx * dx + wy * dy + wz * dz;
            let dd = wx * wx + wy * wy + wz * wz - proj * proj;
            if dd < r2 {
                let hh = (r2 - dd).sqrt();
                let lo = if proj - hh > 0.0 { proj - hh } else { 0.0 };
                let hi = if s < proj + hh { s } else { proj + hh };
                if hi > lo {
                    let wgt = e * (hi - lo);
                    let at2 = (path + (lo + hi) / 2.0) / C;
                    let b = (at2 / BIN).floor();
                    if b < nb as f64 {
                        let b = b as usize;
                        tr.hist[b] += wgt;
                        tr.hist_l[b] += e_l * (hi - lo);
                    }
                    if at2 < EARLY {
                        tr.early.push(at2);
                        tr.early.push(wgt);
                    }
                }
            }
        }
        e *= (-col(Z_LOSS, zk) * s).exp();
        e_l *= (-col(Z_LOSSL, zk) * s).exp();
        path += s;
        px += dx * s;
        py += dy * s;
        pz += dz * s;
        if (e < MIN_E && e_l < MIN_E) || path > C * MAX_T {
            break;
        }
        if s == sy {
            // the ceiling or the floor
            if dy > 0.0 && out {
                break;
            }
            if dy < 0.0 && sc.f > 0 && (sc.flags[i] & 1) != 0 {
                break;
            }
            e *= 1.0 - if dy > 0.0 { col(Z_AC, zk) } else { col(Z_AF, zk) };
            e_l *= 1.0 - if dy > 0.0 { col(Z_ACL, zk) } else { col(Z_AFL, zk) };
            if next(rng) < SCATTER {
                let r = scatter_dir(rng, 1, if dy > 0.0 { -1.0 } else { 1.0 });
                dx = r.0;
                dy = r.1;
                dz = r.2;
            } else {
                dy = -dy;
            }
            continue;
        }
        // into the next tile across
        let axis = if s == sx { 0 } else { 2 };
        let sg = if axis == 0 { sign(dx) } else { sign(dz) };
        let nx = tx + if axis == 0 { sg as i32 } else { 0 };
        let nzz = tz + if axis == 2 { sg as i32 } else { 0 };
        if nx < 0 || nzz < 0 || nx >= w || nzz >= h {
            break;
        }
        let j = (nzz * w + nx) as usize;
        let zj = sc.zone_at[j];
        let dr = sc.door_at[j];
        let mut pass = false;
        let mut a = col(Z_AW, zk);
        let mut a_l = col(Z_AWL, zk);
        if zj >= 0 {
            let zj = zj as usize;
            pass = col(Z_OUT, zj) != 0.0 || py < fy + col(Z_HEIGHT, zj);
        } else if dr >= 0 {
            pass = sc.doors[dr as usize] != 0 && py < fy + DOOR_H;
            a = DOOR_A;
            a_l = 0.15;
        } else if out && py > sc.building_top {
            pass = true;
        } else if (sc.flags[j] & 2) != 0 {
            a = WIN_A;
            a_l = 0.25;
        } else if out {
            a = tr.out_wall_a;
            a_l = tr.out_wall_al;
        }
        if pass {
            if axis == 0 { px += sg * 1e-4; } else { pz += sg * 1e-4; }
            continue;
        }
        e *= 1.0 - a;
        e_l *= 1.0 - a_l;
        if next(rng) < SCATTER {
            let r = scatter_dir(rng, axis, -sg);
            dx = r.0;
            dy = r.1;
            dz = r.2;
        } else if axis == 0 {
            dx = -dx;
        } else {
            dz = -dz;
        }
    }
}
