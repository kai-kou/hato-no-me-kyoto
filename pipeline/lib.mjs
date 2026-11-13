// Shared helpers: tileset walking, b3dm/glb parsing, ECEF->ENU, feature tables
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, EXTTextureWebP, KHRMaterialsUnlit, KHRTextureTransform, KHRMeshQuantization } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

export const DEG = Math.PI / 180;
const A = 6378137.0, F = 1 / 298.257223563, E2 = F * (2 - F);
export function geodeticToEcef(lat, lon, h) {
  const s = Math.sin(lat * DEG), c = Math.cos(lat * DEG), N = A / Math.sqrt(1 - E2 * s * s);
  return [(N + h) * c * Math.cos(lon * DEG), (N + h) * c * Math.sin(lon * DEG), (N * (1 - E2) + h) * s];
}
export function makeEnu(lat0, lon0, h0) {
  const O = geodeticToEcef(lat0, lon0, h0);
  const sl = Math.sin(lon0 * DEG), cl = Math.cos(lon0 * DEG), sp = Math.sin(lat0 * DEG), cp = Math.cos(lat0 * DEG);
  // rows: east, north, up
  const R = [[-sl, cl, 0], [-sp * cl, -sp * sl, cp], [cp * cl, cp * sl, sp]];
  return {
    O, R,
    // ecef point -> three coords (x=east, y=up, z=-north)
    pt(X, Y, Z, out, o) {
      const dx = X - O[0], dy = Y - O[1], dz = Z - O[2];
      out[o] = R[0][0] * dx + R[0][1] * dy + R[0][2] * dz;
      out[o + 1] = R[2][0] * dx + R[2][1] * dy + R[2][2] * dz;
      out[o + 2] = -(R[1][0] * dx + R[1][1] * dy + R[1][2] * dz);
    },
    vec(X, Y, Z, out, o) {
      out[o] = R[0][0] * X + R[0][1] * Y + R[0][2] * Z;
      out[o + 1] = R[2][0] * X + R[2][1] * Y + R[2][2] * Z;
      out[o + 2] = -(R[1][0] * X + R[1][1] * Y + R[1][2] * Z);
    },
    // lon/lat (deg) -> local east/north metres (flat approx via ecef at h0)
    ll(lon, lat, h = h0) { const p = geodeticToEcef(lat, lon, h), o = [0, 0, 0]; this.pt(p[0], p[1], p[2], o, 0); return [o[0], -o[2], o[1]]; },
  };
}

export function leavesInBox(tilesetPath, w, s, e, n) {
  const t = JSON.parse(fs.readFileSync(tilesetPath, 'utf8')), out = [];
  (function walk(nd) {
    const r = nd.boundingVolume && nd.boundingVolume.region;
    if (r) { const d = r.slice(0, 4).map(v => v / DEG); if (d[0] > e || d[2] < w || d[1] > n || d[3] < s) return; }
    const ch = nd.children || [];
    if (nd.content && !ch.length) out.push((nd.content.uri || nd.content.url));
    ch.forEach(walk);
  })(t.root);
  return out;
}
export const tileFile = (dir, uri) => path.join(dir, 't', uri.replace(/\//g, '_'));

let _io = null;
export async function getIO() {
  if (_io) return _io;
  _io = new NodeIO().registerExtensions([KHRDracoMeshCompression, EXTTextureWebP, KHRMaterialsUnlit, KHRTextureTransform, KHRMeshQuantization])
    .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
  return _io;
}

function glbJson(glb) { const jl = glb.readUInt32LE(12); return { json: JSON.parse(glb.subarray(20, 20 + jl).toString('utf8')), bin: glb.subarray(20 + jl + 8) }; }

// returns { glb(Buffer), rtc:[x,y,z]|null (ECEF), feat:{n, lod:Int8Array, x:Float64Array, y:..., zmin, zmax, name:[], usage:[], height:[] , id:[]} }
export function readTile(file) {
  const b = fs.readFileSync(file);
  if (b.subarray(0, 4).toString() === 'b3dm') {
    const ftj = b.readUInt32LE(12), ftb = b.readUInt32LE(16), btj = b.readUInt32LE(20), btb = b.readUInt32LE(24);
    let o = 28; const ft = ftj ? JSON.parse(b.subarray(o, o + ftj).toString('utf8')) : {}; o += ftj + ftb;
    const bt = btj ? JSON.parse(b.subarray(o, o + btj).toString('utf8')) : {}; const btbin = b.subarray(o + btj, o + btj + btb); o += btj + btb;
    const glb = b.subarray(o), n = ft.BATCH_LENGTH || 0, { json } = glbJson(glb);
    let rtc = ft.RTC_CENTER || (json.extensions && json.extensions.CESIUM_RTC && json.extensions.CESIUM_RTC.center) || null;
    const col = (k, Ty, sz) => { const v = bt[k]; if (v && !Array.isArray(v) && typeof v === 'object') { const a = new Ty(n); const dv = new DataView(btbin.buffer, btbin.byteOffset + v.byteOffset, sz * n); for (let i = 0; i < n; i++) a[i] = Ty === Float64Array ? dv.getFloat64(i * 8, true) : dv.getInt8(i); return a; } return v ? Ty.from(v.map(x => x == null ? NaN : x)) : new Ty(n); };
    const feat = { n, lod: col('_lod', Int8Array, 1), x: col('_x', Float64Array, 8), y: col('_y', Float64Array, 8), zmin: col('_zmin', Float64Array, 8), zmax: col('_zmax', Float64Array, 8), name: bt['gml:name'] || [], usage: bt['bldg:usage'] || [], id: bt['gml_id'] || [], bt };
    return { glb, rtc, feat, idAttr: '_BATCHID', json };
  }
  const { json, bin } = glbJson(b);
  let feat = { n: 0, lod: new Int8Array(0) };
  const sm = json.extensions && json.extensions.EXT_structural_metadata;
  if (sm && sm.propertyTables && sm.propertyTables[0]) {
    const pt = sm.propertyTables[0], n = pt.count, P = pt.properties;
    const bv = i => { const v = json.bufferViews[i]; return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength); };
    const f64 = k => { const a = new Float64Array(n); if (!P[k]) return a; const s = bv(P[k].values), dv = new DataView(s.buffer, s.byteOffset, 8 * n); for (let i = 0; i < n; i++) a[i] = dv.getFloat64(i * 8, true); return a; };
    const str = k => { if (!P[k]) return []; const vals = bv(P[k].values), so = bv(P[k].stringOffsets), t = P[k].stringOffsetType || 'UINT32'; const out = []; const rd = i => t === 'UINT32' ? so.readUInt32LE(i * 4) : t === 'UINT16' ? so.readUInt16LE(i * 2) : so.readUInt8(i); for (let i = 0; i < n; i++) out.push(vals.subarray(rd(i), rd(i + 1)).toString('utf8')); return out; };
    const lod = new Int8Array(n); if (P._lod) { const s = bv(P._lod.values); for (let i = 0; i < n; i++) lod[i] = s.readInt8(i); }
    const attrs = str('attributes'); const name = [], usage = [];
    for (let i = 0; i < n; i++) { let a = {}; try { a = JSON.parse(attrs[i]); } catch (e) { } name.push(a['gml:name'] || null); usage.push(a['bldg:usage'] || a['frn:function'] || a['tran:function'] || null); }
    feat = { n, lod, x: f64('_x'), y: f64('_y'), zmin: f64('_zmin'), zmax: f64('_zmax'), name, usage, id: str('gml_id'), attrs };
  }
  return { glb: b, rtc: null, feat, idAttr: '_FEATURE_ID_0', json };
}

// Remove extensions gltf-transform does not know (keeps geometry intact) and rebuild the GLB container
export function cleanGlb(glb) {
  const jl = glb.readUInt32LE(12), json = JSON.parse(glb.subarray(20, 20 + jl).toString('utf8')), rest = glb.subarray(20 + jl);
  const drop = ['CESIUM_RTC', 'EXT_mesh_features', 'EXT_structural_metadata'];
  for (const k of ['extensionsUsed', 'extensionsRequired']) if (json[k]) { json[k] = json[k].filter(e => !drop.includes(e)); if (!json[k].length) delete json[k]; }
  if (json.extensions) { for (const d of drop) delete json.extensions[d]; if (!Object.keys(json.extensions).length) delete json.extensions; }
  for (const m of json.meshes || []) for (const p of m.primitives) if (p.extensions) { for (const d of drop) delete p.extensions[d]; if (!Object.keys(p.extensions).length) delete p.extensions; }
  let js = Buffer.from(JSON.stringify(json), 'utf8'); const pad = (4 - (js.length % 4)) % 4; if (pad) js = Buffer.concat([js, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(20); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + js.length + rest.length, 8); head.writeUInt32LE(js.length, 12); head.write('JSON', 16);
  return Buffer.concat([head, js, rest]);
}

export const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');
