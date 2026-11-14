# Convert Rocketbox avatars (FBX + TGA) and animation clips into the piece's own files: p/<id>.txt (geometry, skeleton, clips;
# deflated and base64, like the city data) and p/<id>_<part>_<kind>.webp. Needs the working app directory to hold (copy tools/dev/_rbe.html there)
# _rbe.html, _dev/loaders (three.js FBXLoader), _dev/rb/<Avatar>.fbx and _dev/anim/<clip>.fbx. See docs/people-realism.md.
#   python3 tools/avatar_export.py <Rocketbox Assets/Avatars/Adults dir> <texture size>
import sys, os, json, base64, zlib, struct, subprocess, time, glob, shutil
from _paths import APP, CHROME
from playwright.sync_api import sync_playwright
SRC, TS = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1024
AV = ['Female_Adult_01', 'Female_Adult_02', 'Female_Adult_05', 'Female_Adult_08', 'Female_Adult_13', 'Female_Adult_17', 'Male_Adult_01', 'Male_Adult_02', 'Male_Adult_06', 'Male_Adult_08', 'Male_Adult_11', 'Male_Adult_16']
CLIPS = lambda s: [['walk', s + '_walk_neutral', 30, 0], ['walk2', s + '_walk_neutral_02', 30, 0], ['idle', s + '_idle_neutral_01', 15, 12], ['look', s + '_idle_look_around_01', 15, 12], ['phone', s + '_cell_phone_textmessage', 15, 12], ['sit', s + '_sit_chair_idle_neutral_01', 15, 14]]
out = os.path.join(APP, 'p'); os.makedirs(out, exist_ok=True); os.makedirs(os.path.join(APP, '_dev', 'rb'), exist_ok=True)
srv = subprocess.Popen(['python3', '-m', 'http.server', '8779', '--directory', APP], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8); index = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=['--no-sandbox']); pg = b.new_page(); pg.goto('http://localhost:8779/_rbe.html'); pg.wait_for_function('window.__ready', timeout=60000)
        for i, av in enumerate(AV):
            sex = 'f' if av.startswith('Female') else 'm'; aid = '%s%02d' % (sex, int(av[-2:])); shutil.copy(os.path.join(SRC, av, 'Export', av + '.fbx'), os.path.join(APP, '_dev', 'rb', av + '.fbx'))
            r = pg.evaluate('([a, c]) => window.__run(a, c)', [av, CLIPS(sex)]); js = r['json'].encode('utf-8'); raw = b'HPAK' + struct.pack('<I', len(js)) + js + base64.b64decode(r['bin'])
            co = zlib.compressobj(9, zlib.DEFLATED, -15); z = co.compress(raw) + co.flush(); open(os.path.join(out, aid + '.txt'), 'w').write(base64.b64encode(z).decode('ascii'))
            tex = {}
            for t in sorted(glob.glob(os.path.join(SRC, av, 'Textures', '*.tga'))):
                n = os.path.basename(t)[:-4].lower(); part = 'head' if '_head_' in n else 'opacity' if '_opacity_' in n else 'body'; kind = 'color' if n.endswith('_color') else 'normal' if n.endswith('_normal') else None
                if not kind or (part == 'opacity' and kind != 'color'): continue
                dst = os.path.join(out, '%s_%s_%s.webp' % (aid, part, kind)); size = TS if part != 'head' else TS; subprocess.run(['convert', t, '-resize', '%dx%d' % (size, size), '-quality', '82', '-define', 'webp:alpha-quality=90', dst], check=True); tex[part + '_' + kind] = os.path.getsize(dst)
            index.append({'id': aid, 'sex': sex, 'tris': r['tris'], 'bones': r['bones'], 'clips': r['clips']}); print(aid, av, 'tris', r['tris'], 'verts', r['nv'], 'pak %.0f kB' % (os.path.getsize(os.path.join(out, aid + '.txt')) / 1e3), 'textures %.0f kB' % (sum(tex.values()) / 1e3), [c[0] + ':%.1fs' % c[1] for c in r['clips']], flush=True)
        b.close()
finally: srv.terminate()
json.dump(index, open(os.path.join(out, 'index.json'), 'w')); print('total %.1f MB' % (sum(os.path.getsize(f) for f in glob.glob(os.path.join(out, '*'))) / 1e6))
