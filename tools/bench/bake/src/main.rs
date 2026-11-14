use std::{env, fs, time::Instant};
fn f32s(p: &str) -> Vec<f32> { fs::read(p).unwrap().chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect() }
fn u32s(p: &str) -> Vec<u32> { fs::read(p).unwrap().chunks_exact(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect() }
fn main() {
    let a: Vec<String> = env::args().collect(); let dir = &a[1]; let rays: u32 = a[2].parse().unwrap(); let far: f32 = a[3].parse().unwrap();
    let (pos, nor, idx) = (f32s(&format!("{dir}/core.pos")), f32s(&format!("{dir}/core.nor")), u32s(&format!("{dir}/core.idx")));
    // the surrounding blocks only block light: they join the hierarchy but get no values of their own
    let (cp, ci) = (f32s(&format!("{dir}/ctx.pos")), u32s(&format!("{dir}/ctx.idx"))); let base = (pos.len() / 3) as u32;
    let mut ap = pos.clone(); ap.extend_from_slice(&cp); let mut ai = idx.clone(); ai.extend(ci.iter().map(|i| i + base));
    let t0 = Instant::now(); let b = hato_bake::build(&ap, &ai); let tb = t0.elapsed().as_secs_f64();
    // other points to light (the ground grid) can be given instead of the city's own vertices
    let (pos, nor) = if a.len() > 5 { (f32s(&format!("{dir}/{}.pos", a[5])), f32s(&format!("{dir}/{}.nor", a[5]))) } else { (pos, nor) };
    let mut out = vec![0u8; pos.len() / 3]; let t1 = Instant::now(); let cast = hato_bake::sky(&b, &pos, &nor, rays, far, &mut out); let ts = t1.elapsed().as_secs_f64();
    fs::write(&a[4], &out).unwrap(); let mean = out.iter().map(|&x| x as f64).sum::<f64>() / out.len() as f64 / 255.0;
    println!("{{\"verts\":{},\"tris\":{},\"rays_per_vertex\":{},\"rays_cast\":{},\"build_s\":{:.2},\"trace_s\":{:.2},\"mrays_per_s\":{:.2},\"mean_sky\":{:.3}}}", pos.len() / 3, ai.len() / 3, rays, cast, tb, ts, cast as f64 / ts / 1e6, mean);
}
