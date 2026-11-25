//! A gun's (and the ship's) per-vertex ambient occlusion: the numeric core of js/gunao.ts (`mark`, `shut`, the trace loop and the
//! adaptive `refine` with its weld), line for line, so that from the same inputs it makes the same numbers and the same mesh. No
//! dependencies, no wasm-bindgen: plain `extern "C"` exports over linear memory (docs/wasm.md); js/gunaowasm.ts is the page's side.
//!
//! What it takes care to do as the JavaScript does:
//! - every sum and product in f64, in the same order (no fused multiply-add: WebAssembly has none, and Rust doesn't contract);
//! - a vertex is f32 (the JS keeps them in Float32Arrays): a midpoint, a lerp, a normalised normal and a stored occlusion are rounded
//!   to f32 where the JS stores them, and read back as f32;
//! - `Math.hypot` is V8's (the largest magnitude taken out, the squares summed with Kahan's compensation), not a plain sqrt of the
//!   sum: they differ in the last bit, and a last bit can move a ray's step across a cell's edge;
//! - `Math.round` is JavaScript's (halves up), for the weld's keys.
//!
//! One thing it does that the JS doesn't: `refine` remembers the occlusion of every vertex it has worked out (by the f32 bits of its
//! position and normal, the only inputs), so a corner the triangles share, or an edge's middle that both its triangles split at, is
//! traced once. The occlusion is a pure function of those six numbers, so this changes nothing in the result (an M4: 136 000 asks,
//! about a third of them new).

use std::alloc::{alloc, dealloc, Layout};

// ---------------------------------------------------------------- what JavaScript's Math does, bit for bit

/// V8's Math.hypot of three (src/builtins/math.tq): NaN and infinity as it handles them, then each over the largest, squared and summed with
/// Kahan's compensation, the root times the largest.
#[inline(always)]
fn hypot3(a: f64, b: f64, c: f64) -> f64 {
    let v = [a, b, c];
    let mut abs = [0.0f64; 3];
    let mut nan = false;
    let mut max = 0.0f64;
    for i in 0..3 {
        if v[i].is_nan() {
            nan = true;
        } else {
            let x = v[i].abs();
            abs[i] = x;
            if x > max {
                max = x;
            }
        }
    }
    if max == f64::INFINITY {
        return f64::INFINITY;
    }
    if nan {
        return f64::NAN;
    }
    if max == 0.0 {
        return 0.0;
    }
    let mut sum = 0.0f64;
    let mut comp = 0.0f64;
    for x in abs {
        let n = x / max;
        let summand = n * n - comp;
        let pre = sum + summand;
        comp = (pre - sum) - summand;
        sum = pre;
    }
    sum.sqrt() * max
}
/// `Math.hypot(...) || 1`
#[inline(always)]
fn len_or_1(a: f64, b: f64, c: f64) -> f64 {
    let l = hypot3(a, b, c);
    if l == 0.0 || l.is_nan() { 1.0 } else { l }
}
/// Math.max of two (NaN wins, as in JS)
#[inline(always)]
fn jmax(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() { f64::NAN } else if b > a { b } else { a }
}
#[inline(always)]
fn jmin(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() { f64::NAN } else if b < a { b } else { a }
}
#[inline(always)]
fn jmax3(a: f64, b: f64, c: f64) -> f64 {
    jmax(jmax(a, b), c)
}
#[inline(always)]
fn jmin3(a: f64, b: f64, c: f64) -> f64 {
    jmin(jmin(a, b), c)
}
/// Math.round: the nearest integer, halves toward +infinity (V8: the ceiling, less one if that's more than half above)
#[inline(always)]
fn jround(x: f64) -> f64 {
    let c = x.ceil();
    if c - 0.5 > x { c - 1.0 } else { c }
}

// ---------------------------------------------------------------- memory for the page to fill

/// `bytes` of memory, 8-aligned (a Float64Array, a Float32Array, a Uint32Array over it)
#[no_mangle]
pub extern "C" fn buf_new(bytes: u32) -> *mut u8 {
    if bytes == 0 {
        return 8 as *mut u8;
    }
    unsafe { alloc(Layout::from_size_align_unchecked(bytes as usize, 8)) }
}
#[no_mangle]
pub unsafe extern "C" fn buf_free(p: *mut u8, bytes: u32) {
    if bytes != 0 {
        dealloc(p, Layout::from_size_align_unchecked(bytes as usize, 8));
    }
}

// ---------------------------------------------------------------- the grid

/// makeGrid's grid, and the Opts the rays need (reach, rays, strength, max) with the rays' directions (dirsOf in js/gunao.ts: filled by the page)
#[derive(Clone)]
pub struct Grid {
    occ: Vec<u8>,
    x0: f64,
    y0: f64,
    z0: f64,
    nx: f64,
    ny: f64,
    nz: f64,
    c: f64,
    ic: f64,
    reach: f64,
    rays: f64,
    strength: f64,
    max: f64,
    dirs: Vec<f64>,
}

#[no_mangle]
pub extern "C" fn grid_new(nx: u32, ny: u32, nz: u32, x0: f64, y0: f64, z0: f64, c: f64, ic: f64, reach: f64, rays: u32, strength: f64, max: f64) -> *mut Grid {
    let n = nx as usize * ny as usize * nz as usize;
    Box::into_raw(Box::new(Grid {
        occ: vec![0; n],
        x0,
        y0,
        z0,
        nx: nx as f64,
        ny: ny as f64,
        nz: nz as f64,
        c,
        ic,
        reach,
        rays: rays as f64,
        strength,
        max,
        dirs: vec![0.0; rays as usize * 3],
    }))
}
/// the rays' directions (x, y, z each, f64): the page writes them
#[no_mangle]
pub unsafe extern "C" fn grid_dirs(g: *mut Grid) -> *mut f64 {
    (*g).dirs.as_mut_ptr()
}
/// the cells (u8 each, nx * ny * nz): for a comparison
#[no_mangle]
pub unsafe extern "C" fn grid_occ(g: *const Grid) -> *const u8 {
    (*g).occ.as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn grid_clone(g: *const Grid) -> *mut Grid {
    Box::into_raw(Box::new((*g).clone()))
}
#[no_mangle]
pub unsafe extern "C" fn grid_free(g: *mut Grid) {
    drop(Box::from_raw(g));
}

/// mark(): a mesh's surfaces into the grid. `pos`: its world positions (f32, 3 a vertex); `idx`: its index (u32), or n_idx 0 for none.
#[no_mangle]
pub unsafe extern "C" fn mark(g: *mut Grid, pos: *const f32, n: u32, idx: *const u32, n_idx: u32) {
    let g = &mut *g;
    let p = std::slice::from_raw_parts(pos, n as usize * 3);
    let ix = if n_idx > 0 { std::slice::from_raw_parts(idx, n_idx as usize) } else { &[][..] };
    let tri = if n_idx > 0 { n_idx as usize / 3 } else { n as usize / 3 };
    let (x0, y0, z0, nx, ny, ic) = (g.x0, g.y0, g.z0, g.nx, g.ny, g.ic);
    let len = g.occ.len() as f64;
    let occ = &mut g.occ;
    let at = |i: usize| p[i] as f64;
    for t in 0..tri {
        let (a, b, d) = if n_idx > 0 { (ix[t * 3] as usize * 3, ix[t * 3 + 1] as usize * 3, ix[t * 3 + 2] as usize * 3) } else { (t * 9, t * 9 + 3, t * 9 + 6) };
        let (ex, ey, ez) = (at(b) - at(a), at(b + 1) - at(a + 1), at(b + 2) - at(a + 2));
        let (fx, fy, fz) = (at(d) - at(a), at(d + 1) - at(a + 1), at(d + 2) - at(a + 2));
        let l = jmax3(hypot3(ex, ey, ez), hypot3(fx, fy, fz), hypot3(at(d) - at(b), at(d + 1) - at(b + 1), at(d + 2) - at(b + 2)));
        let k = jmax(1.0, (l * ic * 1.4).ceil());
        let (ax, ay, az) = (at(a), at(a + 1), at(a + 2));
        let mut i = 0.0;
        while i <= k {
            let mut j = 0.0;
            while i + j <= k {
                let (u, w) = (i / k, j / k);
                let x = ((ax + ex * u + fx * w - x0) * ic).floor();
                let y = ((ay + ey * u + fy * w - y0) * ic).floor();
                let z = ((az + ez * u + fz * w - z0) * ic).floor();
                let q = (z * ny + y) * nx + x; // (as the JS: a typed array ignores an index outside it)
                if q >= 0.0 && q < len {
                    occ[q as usize] = 1;
                }
                j += 1.0;
            }
            i += 1.0;
        }
    }
}

/// shut(): how shut in a point is (0 open .. max), rays over the hemisphere its normal faces, against the grid
#[inline(always)]
fn shut(g: &Grid, px: f64, py: f64, pz: f64, nxv: f64, nyv: f64, nzv: f64) -> f64 {
    let (reach, c, ic) = (g.reach, g.c, g.ic);
    let (x0, y0, z0, nx, ny, nz) = (g.x0, g.y0, g.z0, g.nx, g.ny, g.nz);
    let steps = (reach / c).ceil();
    let (mut tx, mut ty, mut tz);
    if nxv.abs() < 0.8 {
        tx = 0.0;
        ty = -nzv;
        tz = nyv;
    } else {
        tx = nzv;
        ty = 0.0;
        tz = -nxv;
    }
    let tl = len_or_1(tx, ty, tz);
    tx /= tl;
    ty /= tl;
    tz /= tl;
    let bx = nyv * tz - nzv * ty;
    let by = nzv * tx - nxv * tz;
    let bz = nxv * ty - nyv * tx;
    let occ = &g.occ[..];
    let mut sum = 0.0f64;
    for dv in g.dirs.chunks_exact(3) {
        let dx = tx * dv[0] + bx * dv[1] + nxv * dv[2];
        let dy = ty * dv[0] + by * dv[1] + nyv * dv[2];
        let dz = tz * dv[0] + bz * dv[1] + nzv * dv[2];
        let mut s = 3.0;
        while s <= steps {
            let q = s * c;
            let cx = ((px + dx * q - x0) * ic).floor();
            let cy = ((py + dy * q - y0) * ic).floor();
            let cz = ((pz + dz * q - z0) * ic).floor();
            if cx < 0.0 || cy < 0.0 || cz < 0.0 || cx >= nx || cy >= ny || cz >= nz {
                break;
            }
            if occ[((cz * ny + cy) * nx + cx) as usize] != 0 {
                sum += 1.0 - q / reach;
                break;
            }
            s += 1.0;
        }
    }
    jmin(g.max, (sum / g.rays) * g.strength)
}

/// traceG()'s inner loop for vertices from..to of one mesh: out[i] the occlusion (f32), or left as it is outside `bx` (6 f64: x0 y0 z0 x1 y1 z1; null for none)
#[no_mangle]
pub unsafe extern "C" fn trace(g: *const Grid, pos: *const f32, nor: *const f32, from: u32, to: u32, out: *mut f32, bx: *const f64) {
    let g = &*g;
    let n = to as usize * 3;
    let p = std::slice::from_raw_parts(pos, n);
    let nr = std::slice::from_raw_parts(nor, n);
    let o = std::slice::from_raw_parts_mut(out, to as usize);
    let b = if bx.is_null() { None } else { Some(std::slice::from_raw_parts(bx, 6)) };
    for i in from as usize..to as usize {
        let (px, py, pz) = (p[i * 3] as f64, p[i * 3 + 1] as f64, p[i * 3 + 2] as f64);
        if let Some(b) = b {
            if px < b[0] || py < b[1] || pz < b[2] || px > b[3] || py > b[4] || pz > b[5] {
                continue;
            }
        }
        o[i] = shut(g, px, py, pz, nr[i * 3] as f64, nr[i * 3 + 1] as f64, nr[i * 3 + 2] as f64) as f32;
    }
}

// ---------------------------------------------------------------- refine

/// what has been worked out, by the f32 bits of (position, normal): an open-addressed table
struct Memo {
    keys: Vec<[u32; 6]>,
    vals: Vec<f64>,
    used: Vec<bool>,
    n: usize,
    bits: u32,
}
impl Memo {
    fn new() -> Memo {
        let bits = 12;
        Memo { keys: vec![[0; 6]; 1 << bits], vals: vec![0.0; 1 << bits], used: vec![false; 1 << bits], n: 0, bits }
    }
    #[inline(always)]
    fn slot(&self, k: &[u32; 6]) -> usize {
        let mut h: u64 = 0;
        for &x in k {
            h = (h.rotate_left(5) ^ x as u64).wrapping_mul(0x517c_c1b7_2722_0a95);
        }
        (h >> (64 - self.bits)) as usize
    }
    #[inline(always)]
    fn get(&self, k: &[u32; 6]) -> Option<f64> {
        let mask = (1usize << self.bits) - 1;
        let mut i = self.slot(k);
        while self.used[i] {
            if self.keys[i] == *k {
                return Some(self.vals[i]);
            }
            i = (i + 1) & mask;
        }
        None
    }
    fn put(&mut self, k: [u32; 6], v: f64) {
        if (self.n + 1) * 2 > self.used.len() {
            let (keys, vals, used) = (std::mem::take(&mut self.keys), std::mem::take(&mut self.vals), std::mem::take(&mut self.used));
            self.bits += 1;
            let size = 1usize << self.bits;
            self.keys = vec![[0; 6]; size];
            self.vals = vec![0.0; size];
            self.used = vec![false; size];
            self.n = 0;
            for i in 0..used.len() {
                if used[i] {
                    self.put(keys[i], vals[i]);
                }
            }
        }
        let mask = (1usize << self.bits) - 1;
        let mut i = self.slot(&k);
        while self.used[i] {
            i = (i + 1) & mask;
        }
        self.used[i] = true;
        self.keys[i] = k;
        self.vals[i] = v;
        self.n += 1;
    }
}

struct Ctx<'a> {
    g: &'a Grid,
    mw: [f64; 16],
    nm: [f64; 9],
    po: usize,
    no: usize,
    stride: usize,
    memo: Memo,
    asks: u32,
}
impl<'a> Ctx<'a> {
    /// aoOf(): the occlusion of a vertex (its position and normal through the mesh's world matrix and normal matrix)
    #[inline(always)]
    fn ao(&mut self, v: &[f32]) -> f64 {
        let (po, no) = (self.po, self.no);
        self.asks += 1;
        let key = [v[po].to_bits(), v[po + 1].to_bits(), v[po + 2].to_bits(), v[no].to_bits(), v[no + 1].to_bits(), v[no + 2].to_bits()];
        if let Some(r) = self.memo.get(&key) {
            return r;
        }
        let (x, y, z) = (v[po] as f64, v[po + 1] as f64, v[po + 2] as f64);
        let (a, b, c) = (v[no] as f64, v[no + 1] as f64, v[no + 2] as f64);
        let (nm, mw) = (&self.nm, &self.mw);
        let mut nx = nm[0] * a + nm[3] * b + nm[6] * c;
        let mut ny = nm[1] * a + nm[4] * b + nm[7] * c;
        let mut nz = nm[2] * a + nm[5] * b + nm[8] * c;
        let l = len_or_1(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        let r = shut(self.g, mw[0] * x + mw[4] * y + mw[8] * z + mw[12], mw[1] * x + mw[5] * y + mw[9] * z + mw[13], mw[2] * x + mw[6] * y + mw[10] * z + mw[14], nx, ny, nz);
        self.memo.put(key, r);
        r
    }
    /// the normal of a vertex made unit length (`r[no] /= l` on a Float32Array)
    #[inline(always)]
    fn norm(&self, r: &mut [f32]) {
        let no = self.no;
        let l = len_or_1(r[no] as f64, r[no + 1] as f64, r[no + 2] as f64);
        r[no] = (r[no] as f64 / l) as f32;
        r[no + 1] = (r[no + 1] as f64 / l) as f32;
        r[no + 2] = (r[no + 2] as f64 / l) as f32;
    }
}

pub struct Refined {
    rows: Vec<f32>,
    idx: Vec<u32>,
    nv: u32,
    nt: u32,
    changed: u32,
    asks: u32,
    traced: u32,
}

/// a refine under way (refine_begin, refine_run as many times as it takes, refine_end): the triangles are done in the JS's order, so a
/// refine done in pieces (a few hundred triangles a call, the first-person gun's, across frames) is the one done at once
pub struct Job {
    g: *const Grid,
    cur: *mut f32,
    cnt: usize,
    wu: usize,
    po: usize,
    no: usize,
    mw: [f64; 16],
    nm: [f64; 9],
    edge: f64,
    fine: f64,
    tol: f64,
    next: usize,
    out: Vec<f32>,
    changed: bool,
    memo: Memo,
    asks: u32,
}

/// refine(), begun: the triangles of one mesh (cur: cnt vertices of w f32 each, the attributes side by side and the last the occlusion, as the
/// JS lays them out: it is written to, and must stay till refine_end) will be split where the occlusion doesn't follow the corners. `m`: the
/// mesh's world matrix (16 f64, column-major, three.js's elements) then its normal matrix (9 f64), copied here. The grid must stay till refine_end.
#[no_mangle]
pub unsafe extern "C" fn refine_begin(g: *const Grid, cur: *mut f32, cnt: u32, w: u32, po: u32, no: u32, m: *const f64, edge: f64, fine: f64, tol: f64) -> *mut Job {
    let mm = std::slice::from_raw_parts(m, 25);
    let mut mw = [0.0; 16];
    mw.copy_from_slice(&mm[..16]);
    let mut nm = [0.0; 9];
    nm.copy_from_slice(&mm[16..25]);
    Box::into_raw(Box::new(Job {
        g,
        cur,
        cnt: cnt as usize,
        wu: w as usize,
        po: po as usize,
        no: no as usize,
        mw,
        nm,
        edge,
        fine,
        tol,
        next: 0,
        out: Vec::with_capacity(cnt as usize * w as usize * 2),
        changed: false,
        memo: Memo::new(),
        asks: 0,
    }))
}

/// the next `n` of the mesh's triangles: 1 once they've all been done
#[no_mangle]
pub unsafe extern "C" fn refine_run(j: *mut Job, n: u32) -> u32 {
    let j = &mut *j;
    let (wu, stride) = (j.wu, j.wu - 1);
    let cur = std::slice::from_raw_parts_mut(j.cur, j.cnt * wu);
    let mut cx = Ctx { g: &*j.g, mw: j.mw, nm: j.nm, po: j.po, no: j.no, stride, memo: std::mem::replace(&mut j.memo, Memo { keys: Vec::new(), vals: Vec::new(), used: Vec::new(), n: 0, bits: 0 }), asks: j.asks };
    let (edge, fine, tol) = (j.edge, j.fine, j.tol);
    let big = edge * edge;
    let small = fine * fine;
    let dark = cx.g.max - 0.05;
    let sample = edge / 2.0;
    let out = &mut j.out;
    let mut ar: Vec<f32> = Vec::with_capacity(wu * 64); // (one triangle's vertices and what it's split into)
    let mut tmp: Vec<f32> = vec![0.0; wu];
    let mut cen: Vec<f32> = vec![0.0; wu];
    let mut stack: Vec<[usize; 3]> = Vec::new();
    let mut changed = j.changed;
    let pof = j.po;
    let d2 = |ar: &[f32], a: usize, b: usize| {
        let (x, y, z) = (ar[a * wu + pof] as f64 - ar[b * wu + pof] as f64, ar[a * wu + pof + 1] as f64 - ar[b * wu + pof + 1] as f64, ar[a * wu + pof + 2] as f64 - ar[b * wu + pof + 2] as f64);
        x * x + y * y + z * z
    };
    let s = |ar: &[f32], a: usize| ar[a * wu + stride] as f64;
    // mid(): the middle of an edge, a vertex of its own (pushed onto ar), with its occlusion
    fn mid(cx: &mut Ctx, ar: &mut Vec<f32>, wu: usize, a: usize, b: usize) -> usize {
        let i = ar.len() / wu;
        for k in 0..cx.stride {
            let v = ((ar[a * wu + k] as f64 + ar[b * wu + k] as f64) / 2.0) as f32;
            ar.push(v);
        }
        ar.push(0.0);
        let r = &mut ar[i * wu..(i + 1) * wu];
        cx.norm(r);
        let o = cx.ao(r) as f32;
        r[cx.stride] = o;
        i
    }
    // at(): the occlusion part way along p -> q (the point isn't kept)
    fn at(cx: &mut Ctx, tmp: &mut [f32], p: &[f32], q: &[f32], t: f64) -> f64 {
        for k in 0..cx.stride {
            tmp[k] = (p[k] as f64 + (q[k] as f64 - p[k] as f64) * t) as f32;
        }
        cx.norm(tmp);
        cx.ao(tmp)
    }
    let ntri = j.cnt / 3;
    let end = (j.next + n as usize).min(ntri);
    for t in j.next..end {
        ar.clear();
        for k in 0..3 {
            let v = &mut cur[(t * 3 + k) * wu..(t * 3 + k + 1) * wu];
            let o = cx.ao(v) as f32;
            v[stride] = o;
            ar.extend_from_slice(v);
        }
        stack.push([0, 1, 2]);
        let mut guard = 0u32;
        while let Some([a, b, c]) = stack.pop() {
            let (ab, bc, ca) = (d2(&ar, a, b), d2(&ar, b, c), d2(&ar, c, a));
            let mx = jmax3(ab, bc, ca);
            let emit = mx <= small || {
                guard += 1;
                guard > 512
            };
            if emit {
                out.extend_from_slice(&ar[a * wu..(a + 1) * wu]);
                out.extend_from_slice(&ar[b * wu..(b + 1) * wu]);
                out.extend_from_slice(&ar[c * wu..(c + 1) * wu]);
                continue;
            }
            let mut split = mx > big;
            if split && jmin3(s(&ar, a), s(&ar, b), s(&ar, c)) >= dark {
                // (all its corners shut in: split only if its middles aren't dark too)
                let mab = mid(&mut cx, &mut ar, wu, a, b);
                let mbc = mid(&mut cx, &mut ar, wu, b, c);
                let mca = mid(&mut cx, &mut ar, wu, c, a);
                if jmin3(s(&ar, mab), s(&ar, mbc), s(&ar, mca)) >= dark {
                    split = false;
                }
            }
            if split && mx > big {
                // (a long triangle: its occlusion read every edge/2 along each edge and at points inside; cut only if that doesn't follow its corners)
                let mut err = 0.0f64;
                for (p, q) in [(a, b), (b, c), (c, a)] {
                    let l = d2(&ar, p, q).sqrt();
                    let n = (l / sample).ceil();
                    let mut i = 1.0;
                    while i < n && err <= tol {
                        let tt = i / n;
                        let (sp, sq) = (s(&ar, p), s(&ar, q));
                        let v = at(&mut cx, &mut tmp, &ar[p * wu..(p + 1) * wu], &ar[q * wu..(q + 1) * wu], tt);
                        err = jmax(err, (v - (sp + (sq - sp) * tt)).abs());
                        i += 1.0;
                    }
                    if err > tol {
                        break;
                    }
                }
                if err <= tol {
                    for k in 0..stride {
                        cen[k] = ((ar[a * wu + k] as f64 + ar[b * wu + k] as f64 + ar[c * wu + k] as f64) / 3.0) as f32;
                    }
                    cen[stride] = ((s(&ar, a) + s(&ar, b) + s(&ar, c)) / 3.0) as f32;
                    for p in [a, b, c] {
                        let v = at(&mut cx, &mut tmp, &cen, &ar[p * wu..(p + 1) * wu], 0.5);
                        let e = (v - (cen[stride] as f64 + s(&ar, p)) / 2.0).abs();
                        if e > err {
                            err = e;
                        }
                    }
                    cx.norm(&mut cen);
                    let v = cx.ao(&cen);
                    err = jmax(err, (v - cen[stride] as f64).abs());
                }
                split = err > tol;
            }
            if !split && mx <= big {
                // (does the occlusion in the middle of an edge, and at the face's middle, follow the corners'?)
                let mab = mid(&mut cx, &mut ar, wu, a, b);
                let mbc = mid(&mut cx, &mut ar, wu, b, c);
                let mca = mid(&mut cx, &mut ar, wu, c, a);
                let (sa, sb, sc) = (s(&ar, a), s(&ar, b), s(&ar, c));
                let mut err = jmax3((s(&ar, mab) - (sa + sb) / 2.0).abs(), (s(&ar, mbc) - (sb + sc) / 2.0).abs(), (s(&ar, mca) - (sc + sa) / 2.0).abs());
                if err <= tol {
                    for k in 0..stride {
                        cen[k] = ((ar[a * wu + k] as f64 + ar[b * wu + k] as f64 + ar[c * wu + k] as f64) / 3.0) as f32;
                    }
                    cen[stride] = 0.0;
                    cx.norm(&mut cen);
                    err = (cx.ao(&cen) - (sa + sb + sc) / 3.0).abs();
                }
                split = err > tol;
            }
            if !split {
                out.extend_from_slice(&ar[a * wu..(a + 1) * wu]);
                out.extend_from_slice(&ar[b * wu..(b + 1) * wu]);
                out.extend_from_slice(&ar[c * wu..(c + 1) * wu]);
                continue;
            }
            changed = true;
            if mx == ab {
                let m = mid(&mut cx, &mut ar, wu, a, b);
                stack.push([m, b, c]);
                stack.push([a, m, c]);
            } else if mx == bc {
                let m = mid(&mut cx, &mut ar, wu, b, c);
                stack.push([a, m, c]);
                stack.push([a, b, m]);
            } else {
                let m = mid(&mut cx, &mut ar, wu, c, a);
                stack.push([b, c, m]);
                stack.push([a, b, m]);
            }
        }
    }
    j.next = end;
    j.changed = changed;
    j.asks = cx.asks;
    j.memo = cx.memo;
    (end >= ntri) as u32
}

/// refine(), finished (the job freed): the triangles as they came out, welded (when `weld`, or when any was split) as the JS does: a corner the
/// triangles share (every attribute and the occlusion the same to 1e-6, as Math.round(x * 1e6) has it) one vertex, numbered as first met
#[no_mangle]
pub unsafe extern "C" fn refine_end(j: *mut Job, weld: u32) -> *mut Refined {
    let j = *Box::from_raw(j);
    let wu = j.wu;
    let out = j.out;
    let nt = out.len() / wu;
    let (asks, traced, changed) = (j.asks, j.memo.n as u32, j.changed);
    if !(changed || weld != 0) {
        return Box::into_raw(Box::new(Refined { rows: out, idx: Vec::new(), nv: nt as u32, nt: nt as u32, changed: 0, asks, traced }));
    }
    let key = |i: usize, k: usize| jround(out[i * wu + k] as f64 * 1e6);
    let mut bits = 4u32;
    while (1usize << bits) < nt * 2 {
        bits += 1;
    }
    let mask = (1usize << bits) - 1;
    let mut table: Vec<u32> = vec![0; 1 << bits]; // (0 empty, else the kept vertex's number + 1)
    let mut keep: Vec<usize> = Vec::new();
    let mut idx: Vec<u32> = vec![0; nt];
    for i in 0..nt {
        let mut h: u64 = 0;
        for k in 0..wu {
            h = (h.rotate_left(5) ^ (key(i, k) as i64 as u64)).wrapping_mul(0x517c_c1b7_2722_0a95);
        }
        let mut sl = (h >> (64 - bits)) as usize;
        loop {
            let e = table[sl];
            if e == 0 {
                table[sl] = keep.len() as u32 + 1;
                idx[i] = keep.len() as u32;
                keep.push(i);
                break;
            }
            let k0 = keep[e as usize - 1];
            if (0..wu).all(|k| key(k0, k) == key(i, k)) {
                idx[i] = e - 1;
                break;
            }
            sl = (sl + 1) & mask;
        }
    }
    let mut rows: Vec<f32> = Vec::with_capacity(keep.len() * wu);
    for &i in &keep {
        rows.extend_from_slice(&out[i * wu..(i + 1) * wu]);
    }
    Box::into_raw(Box::new(Refined { rows, idx, nv: keep.len() as u32, nt: nt as u32, changed: changed as u32, asks, traced }))
}

/// a job given up (its result not wanted)
#[no_mangle]
pub unsafe extern "C" fn refine_drop(j: *mut Job) {
    drop(Box::from_raw(j));
}

/// the result's vertices (nv of w f32: the attributes and the occlusion; unwelded, nt of them, when it wasn't welded)
#[no_mangle]
pub unsafe extern "C" fn ref_rows(r: *const Refined) -> *const f32 {
    (*r).rows.as_ptr()
}
/// its index (nt u32), when welded
#[no_mangle]
pub unsafe extern "C" fn ref_idx(r: *const Refined) -> *const u32 {
    (*r).idx.as_ptr()
}
/// 0: vertices; 1: index entries; 2: whether a triangle was split; 3: occlusions asked for; 4: of them traced (the rest remembered)
#[no_mangle]
pub unsafe extern "C" fn ref_info(r: *const Refined, which: u32) -> u32 {
    let r = &*r;
    match which {
        0 => r.nv,
        1 => r.nt,
        2 => r.changed,
        3 => r.asks,
        _ => r.traced,
    }
}
#[no_mangle]
pub unsafe extern "C" fn ref_free(r: *mut Refined) {
    drop(Box::from_raw(r));
}
