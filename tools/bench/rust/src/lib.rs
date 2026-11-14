// Two kernels for the comparison with the JavaScript in the app:
//   b64_decode  — the base64 text the host forces on every binary payload
//   pose_kernel — per bird, 15 bones: two axis-angle rotations composed, a rotated offset, written as (quat, trans)
use std::alloc::{alloc as sys_alloc, Layout};

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 { unsafe { sys_alloc(Layout::from_size_align_unchecked(n.max(1), 16)) } }

static mut T: [u8; 256] = [0; 256];
#[no_mangle]
pub extern "C" fn b64_init() {
    let a = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i, c) in a.iter().enumerate() { unsafe { T[*c as usize] = i as u8; } }
}
#[no_mangle]
pub unsafe extern "C" fn b64_decode(src: *const u8, mut n: usize, dst: *mut u8) -> usize {
    let s = std::slice::from_raw_parts(src, n);
    while n > 0 && matches!(s[n - 1], 61 | 10 | 13 | 32) { n -= 1; }
    let out_len = n * 3 / 4; let d = std::slice::from_raw_parts_mut(dst, out_len + 3);
    let t = &*std::ptr::addr_of!(T);
    let (mut i, mut o) = (0usize, 0usize);
    while i + 4 <= n {
        let v = ((t[s[i] as usize] as u32) << 18) | ((t[s[i + 1] as usize] as u32) << 12) | ((t[s[i + 2] as usize] as u32) << 6) | (t[s[i + 3] as usize] as u32);
        d[o] = (v >> 16) as u8; d[o + 1] = (v >> 8) as u8; d[o + 2] = v as u8; i += 4; o += 3;
    }
    if n - i == 2 { let v = ((t[s[i] as usize] as u32) << 18) | ((t[s[i + 1] as usize] as u32) << 12); d[o] = (v >> 16) as u8; }
    else if n - i == 3 { let v = ((t[s[i] as usize] as u32) << 18) | ((t[s[i + 1] as usize] as u32) << 12) | ((t[s[i + 2] as usize] as u32) << 6); d[o] = (v >> 16) as u8; d[o + 1] = (v >> 8) as u8; }
    out_len
}

#[inline(always)] fn axis_angle(ax: [f32; 3], ang: f32) -> [f32; 4] { let h = ang * 0.5; let s = h.sin(); [ax[0] * s, ax[1] * s, ax[2] * s, h.cos()] }
#[inline(always)] fn qmul(a: [f32; 4], b: [f32; 4]) -> [f32; 4] {
    [a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1], a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
     a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]]
}
#[inline(always)] fn qrot(q: [f32; 4], v: [f32; 3]) -> [f32; 3] {
    let (x, y, z, w) = (q[0], q[1], q[2], q[3]);
    let ix = w * v[0] + y * v[2] - z * v[1]; let iy = w * v[1] + z * v[0] - x * v[2]; let iz = w * v[2] + x * v[1] - y * v[0]; let iw = -x * v[0] - y * v[1] - z * v[2];
    [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]
}
// input: per bird 32 floats of pose angles; output: per bird 15 bones x 8 floats
#[no_mangle]
pub unsafe extern "C" fn pose_kernel(n: usize, inp: *const f32, out: *mut f32) {
    let a = std::slice::from_raw_parts(inp, n * 32); let d = std::slice::from_raw_parts_mut(out, n * 15 * 8);
    const AX: [[f32; 3]; 3] = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
    for i in 0..n {
        let p = &a[i * 32..i * 32 + 32]; let mut parent = [0.0f32, 0.0, 0.0, 1.0];
        for b in 0..15 {
            let q1 = axis_angle(AX[b % 3], p[b * 2]); let q2 = axis_angle(AX[(b + 1) % 3], p[b * 2 + 1]);
            let q = qmul(parent, qmul(q1, q2)); let t = qrot(q, [0.01 * b as f32, 0.02, 0.03]);
            let o = (i * 15 + b) * 8; d[o] = q[0]; d[o + 1] = q[1]; d[o + 2] = q[2]; d[o + 3] = q[3]; d[o + 4] = t[0]; d[o + 5] = t[1]; d[o + 6] = t[2]; d[o + 7] = 1.0;
            if b % 4 != 3 { parent = q; } else { parent = [0.0, 0.0, 0.0, 1.0]; }
        }
    }
}
