// Sky visibility per vertex: how much of the sky each point of the city can see.
// A bounding-volume hierarchy over every triangle, then K cosine-weighted rays per vertex; a ray that leaves upward
// without hitting anything within `far` metres has seen the sky.  No dependencies, so the same source builds as a
// native tool (for the conversion pipeline) and as WebAssembly (to run in the browser at load time).
use std::alloc::{alloc as sys_alloc, Layout};

pub struct Bvh { nodes: Vec<Node>, tri: Vec<[f32; 9]> }
#[derive(Clone, Copy)]
struct Node { mn: [f32; 3], mx: [f32; 3], a: u32, n: u32 }   // leaf: a = first triangle, n = count; inner: a = left child (right = a + 1), n = 0

pub fn build(pos: &[f32], idx: &[u32]) -> Bvh {
    let nt = idx.len() / 3; let mut tri = Vec::with_capacity(nt); let mut cen = Vec::with_capacity(nt);
    for t in 0..nt { let mut v = [0f32; 9]; for k in 0..3 { let i = idx[t * 3 + k] as usize * 3; v[k * 3] = pos[i]; v[k * 3 + 1] = pos[i + 1]; v[k * 3 + 2] = pos[i + 2]; }
        cen.push([(v[0] + v[3] + v[6]) / 3.0, (v[1] + v[4] + v[7]) / 3.0, (v[2] + v[5] + v[8]) / 3.0]); tri.push(v); }
    let mut order: Vec<u32> = (0..nt as u32).collect(); let mut nodes: Vec<Node> = Vec::with_capacity(nt); nodes.push(Node { mn: [0.0; 3], mx: [0.0; 3], a: 0, n: nt as u32 });
    let mut stack = vec![0usize];
    while let Some(ni) = stack.pop() {
        let (first, cnt) = (nodes[ni].a as usize, nodes[ni].n as usize); let (mut mn, mut mx, mut cmn, mut cmx) = ([f32::MAX; 3], [f32::MIN; 3], [f32::MAX; 3], [f32::MIN; 3]);
        for &o in &order[first..first + cnt] { let v = &tri[o as usize]; let c = &cen[o as usize];
            for k in 0..3 { for a in 0..3 { let x = v[k * 3 + a]; if x < mn[a] { mn[a] = x; } if x > mx[a] { mx[a] = x; } } }
            for a in 0..3 { if c[a] < cmn[a] { cmn[a] = c[a]; } if c[a] > cmx[a] { cmx[a] = c[a]; } } }
        nodes[ni].mn = mn; nodes[ni].mx = mx; if cnt <= 4 { continue; }
        let e = [cmx[0] - cmn[0], cmx[1] - cmn[1], cmx[2] - cmn[2]]; let ax = if e[0] > e[1] && e[0] > e[2] { 0 } else if e[1] > e[2] { 1 } else { 2 }; if e[ax] <= 0.0 { continue; }
        let mid = first + cnt / 2; order[first..first + cnt].select_nth_unstable_by(cnt / 2, |p, q| cen[*p as usize][ax].partial_cmp(&cen[*q as usize][ax]).unwrap());
        let l = nodes.len(); nodes.push(Node { mn: [0.0; 3], mx: [0.0; 3], a: first as u32, n: (mid - first) as u32 }); nodes.push(Node { mn: [0.0; 3], mx: [0.0; 3], a: mid as u32, n: (first + cnt - mid) as u32 });
        nodes[ni].a = l as u32; nodes[ni].n = 0; stack.push(l); stack.push(l + 1);
    }
    let tri2 = order.iter().map(|&o| tri[o as usize]).collect(); Bvh { nodes, tri: tri2 }
}

impl Bvh {
    // is anything in the way within tmax?
    #[inline] pub fn occluded(&self, o: [f32; 3], d: [f32; 3], tmax: f32) -> bool {
        let inv = [1.0 / d[0], 1.0 / d[1], 1.0 / d[2]]; let mut st = [0u32; 64]; let mut sp = 1usize;
        while sp > 0 { sp -= 1; let nd = &self.nodes[st[sp] as usize];
            let (mut t0, mut t1) = (0.0f32, tmax);
            for a in 0..3 { let (x0, x1) = ((nd.mn[a] - o[a]) * inv[a], (nd.mx[a] - o[a]) * inv[a]); let (lo, hi) = if x0 < x1 { (x0, x1) } else { (x1, x0) }; if lo > t0 { t0 = lo; } if hi < t1 { t1 = hi; } }
            if t0 > t1 { continue; }
            if nd.n == 0 { st[sp] = nd.a; st[sp + 1] = nd.a + 1; sp += 2; continue; }
            for v in &self.tri[nd.a as usize..(nd.a + nd.n) as usize] {
                let e1 = [v[3] - v[0], v[4] - v[1], v[5] - v[2]]; let e2 = [v[6] - v[0], v[7] - v[1], v[8] - v[2]];
                let p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]]; let det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2]; if det.abs() < 1e-9 { continue; }
                let id = 1.0 / det; let s = [o[0] - v[0], o[1] - v[1], o[2] - v[2]]; let u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * id; if !(0.0..=1.0).contains(&u) { continue; }
                let q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]]; let w = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * id; if w < 0.0 || u + w > 1.0 { continue; }
                let t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * id; if t > 1e-4 && t < tmax { return true; }
            }
        }
        false
    }
}

#[inline] fn hash(mut x: u32) -> u32 { x ^= x >> 16; x = x.wrapping_mul(0x7feb352d); x ^= x >> 15; x = x.wrapping_mul(0x846ca68b); x ^ (x >> 16) }

// out[i] = 255 * (share of the cosine-weighted hemisphere above vertex i that reaches the sky)
pub fn sky(bvh: &Bvh, pos: &[f32], nor: &[f32], rays: u32, far: f32, out: &mut [u8]) -> u64 {
    let nv = pos.len() / 3; let side = (rays as f32).sqrt().ceil() as u32; let mut cast = 0u64;
    for i in 0..nv {
        let n = [nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]]; let o = [pos[i * 3] + n[0] * 0.04, pos[i * 3 + 1] + n[1] * 0.04, pos[i * 3 + 2] + n[2] * 0.04];
        let t = if n[1].abs() < 0.9 { [0.0, 1.0, 0.0] } else { [1.0, 0.0, 0.0] }; let mut b1 = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
        let l = (b1[0] * b1[0] + b1[1] * b1[1] + b1[2] * b1[2]).sqrt().max(1e-6); b1 = [b1[0] / l, b1[1] / l, b1[2] / l]; let b2 = [n[1] * b1[2] - n[2] * b1[1], n[2] * b1[0] - n[0] * b1[2], n[0] * b1[1] - n[1] * b1[0]];
        let h = hash(i as u32); let (jx, jy) = ((h & 0xffff) as f32 / 65536.0, (h >> 16) as f32 / 65536.0); let mut seen = 0u32; let mut up = 0u32;
        for s in 0..side * side { let (u, v) = (((s % side) as f32 + jx) / side as f32, ((s / side) as f32 + jy) / side as f32);
            let r = u.sqrt(); let ph = 6.2831853 * v; let (x, y, z) = (r * ph.cos(), r * ph.sin(), (1.0 - u).max(0.0).sqrt());
            let d = [b1[0] * x + b2[0] * y + n[0] * z, b1[1] * x + b2[1] * y + n[1] * z, b1[2] * x + b2[2] * y + n[2] * z];
            if d[1] <= 0.02 { continue; }   // towards the ground: not sky
            cast += 1; up += 1; if !bvh.occluded(o, d, far) { seen += 1; } }
        // of the directions that point above the horizon, the share that reaches the sky; a face that looks only downward gets 0
        out[i] = if up > 0 { (255 * seen / up) as u8 } else { 0 };
    }
    cast
}

// ---- WebAssembly surface
#[no_mangle] pub extern "C" fn alloc(n: usize) -> *mut u8 { unsafe { sys_alloc(Layout::from_size_align_unchecked(n.max(1), 16)) } }
#[no_mangle] pub unsafe extern "C" fn bake_sky(pos: *const f32, nor: *const f32, nv: usize, idx: *const u32, ni: usize, occ_pos: *const f32, occ_nv: usize, rays: u32, far: f32, out: *mut u8) -> f64 {
    let p = std::slice::from_raw_parts(pos, nv * 3); let n = std::slice::from_raw_parts(nor, nv * 3); let i = std::slice::from_raw_parts(idx, ni); let _ = (occ_pos, occ_nv);
    let b = build(p, i); sky(&b, p, n, rays, far, std::slice::from_raw_parts_mut(out, nv)) as f64
}
