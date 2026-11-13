// After stage 6: turn the binary paks into base64 text files, the form the app loads.
// The first host of the app could not serve binary file extensions, so the app reads d/*.txt and t/{b,m}.txt.
// usage: node pack.mjs [output directory]
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const OUT = process.argv[2] || fileURLToPath(new URL('../app', import.meta.url));
for (const [dir, ext] of [['d', '.bin'], ['t', '.pak']]) for (const f of fs.readdirSync(`${OUT}/${dir}`)) {
  if (!f.endsWith(ext)) continue;
  const src = `${OUT}/${dir}/${f}`, dst = src.slice(0, -ext.length) + '.txt';
  fs.writeFileSync(dst, fs.readFileSync(src).toString('base64')); fs.rmSync(src);
  console.log(dst, fs.statSync(dst).size);
}
