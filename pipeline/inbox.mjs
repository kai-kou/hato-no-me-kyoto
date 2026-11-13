import { leavesInBox, tileFile, readTile } from './lib.mjs';
import fs from 'node:fs';
const [boxS, ...dirs] = process.argv.slice(2); const [w, s, e, n] = boxS.split(',').map(Number);
for (const d of dirs) { const l = leavesInBox(d + '/tileset.json', w, s, e, n); let bytes = 0, feats = 0, inb = 0; const usage = {};
  for (const u of l) { const f = tileFile(d, u); if (!fs.existsSync(f)) continue; bytes += fs.statSync(f).size; try { const t = readTile(f); feats += t.feat.n; for (let i = 0; i < t.feat.n; i++) { const x = t.feat.x[i], y = t.feat.y[i]; if (x >= w && x <= e && y >= s && y <= n) { inb++; const k = (t.feat.bt && (t.feat.bt['frn:function'] || t.feat.bt['tran:function'] || t.feat.bt['feature_type'] || [])[i]) || (t.feat.usage && t.feat.usage[i]) || '?'; usage[k] = (usage[k] || 0) + 1; } } if (process.env.KEYS && t.feat.bt) { console.log(Object.keys(t.feat.bt).slice(0, 40).join(',')); process.env.KEYS = ''; } } catch (e) { console.log('ERR', e.message); } }
  console.log(d.split('/').pop(), 'leaves', l.length, 'MB', (bytes / 1e6).toFixed(1), 'feats', feats, 'inBox', inb, JSON.stringify(Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 25))); }
