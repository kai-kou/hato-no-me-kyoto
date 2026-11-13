#!/usr/bin/env python3
"""Assemble the submission video from the clips in media/clips, UI screenshots and cards.
One encoded file per scene (same size, rate and encoder settings), joined with the concat demuxer.
usage: python3 build_video.py [scene ...]     (no argument: every scene, then the join)"""
import os, sys, subprocess, shutil
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
CLIPS = '/home/claude/hato-no-me-kyoto/media/clips/'; UI = '/home/claude/award/ui/'; CARDS = HERE + '/cards/'; OV = HERE + '/ov/'; SC = HERE + '/scenes/'
OUT = HERE + '/hato_no_me_kyoto_award.mp4'
W, H, FPS = 1280, 720, 30
ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-video_track_timescale', '30000', '-an', '-movflags', '+faststart']
BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'; REG = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
CREDIT = 'PLATEAU（国土交通省）の 3D 都市モデルと地理院タイル（国土地理院）を加工して作成'
F = lambda path, size: ImageFont.truetype(path, size, index=0)

def overlay(name, lines, credit=True, label=None):
    """Transparent 1280x720 PNG: a caption box at the bottom, the source credit at the top right, an optional label at the top left."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if lines:
        f = F(BOLD, 33); lh = 50; ws = [d.textlength(t, font=f) for t in lines]; bw = max(ws) + 64; bh = lh * len(lines) + 26; x0 = (W - bw) / 2; y0 = H - 34 - bh
        d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=12, fill=(16, 14, 12, 214))
        for i, t in enumerate(lines): d.text(((W - ws[i]) / 2, y0 + 12 + i * lh), t, font=f, fill=(243, 237, 226, 255))
    if credit:
        f = F(REG, 15); w = d.textlength(CREDIT, font=f); d.rounded_rectangle([W - w - 30, 12, W - 12, 40], radius=6, fill=(16, 14, 12, 150)); d.text((W - w - 21, 15), CREDIT, font=f, fill=(243, 237, 226, 235))
    if label:
        f = F(BOLD, 24); w = d.textlength(label, font=f); d.rounded_rectangle([16, 12, 16 + w + 30, 54], radius=21, fill=(226, 83, 47, 245)); d.text((31, 16), label, font=f, fill=(255, 255, 255, 255))
    p = OV + name + '.png'; im.save(p); return p

FX, FY, FW, FH = 112, 46, 1056, 594   # where a screenshot of the running app sits when it is shown framed

def overlay_ui(name, lines, label=None, credit=True):
    """For framed screenshots: nothing is drawn over the screen. Caption in the band below, label and credit in the band above."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if lines:
        f = F(BOLD, 31)
        for i, t in enumerate(lines): w = d.textlength(t, font=f); d.text(((W - w) / 2, 654 + i * 44 - (len(lines) - 1) * 22), t, font=f, fill=(243, 237, 226, 255))
    if credit: f = F(REG, 15); w = d.textlength(CREDIT, font=f); d.text((W - w - 20, 14), CREDIT, font=f, fill=(243, 237, 226, 190))
    if label: f = F(BOLD, 21); w = d.textlength(label, font=f); d.rounded_rectangle([16, 8, 16 + w + 26, 40], radius=16, fill=(226, 83, 47, 255)); d.text((29, 9), label, font=f, fill=(255, 255, 255, 255))
    p = OV + name + '.png'; im.save(p); return p

def framed(name, path):
    """A screenshot of the app, scaled into the frame on the ink ground, with a hairline around it."""
    im = Image.new('RGB', (W, H), (16, 14, 12)); s = Image.open(path).convert('RGB'); k = min(FW / s.width, FH / s.height); s = s.resize((round(s.width * k), round(s.height * k)), Image.LANCZOS)
    x = FX + (FW - s.width) // 2; y = FY + (FH - s.height) // 2; im.paste(s, (x, y)); ImageDraw.Draw(im).rectangle([x - 1, y - 1, x + s.width, y + s.height], outline=(70, 66, 60))
    p = OV + name + '.png'; im.save(p); return p

def run(args, dst):
    tmp = dst[:-4] + '.part.mp4'
    r = subprocess.run(['ffmpeg', '-v', 'error', '-y'] + args + ENC + [tmp])
    if r.returncode != 0: raise SystemExit('ffmpeg failed: ' + dst)
    os.replace(tmp, dst)

def fades(dur, fi=0.25, fo=0.25): return 'fade=t=in:st=0:d=%.2f,fade=t=out:st=%.3f:d=%.2f' % (fi, dur - fo, fo)

def clip_scene(name, clip, dur_clip, hold, caps, fi=0.25, fo=0.25):
    """A recorded clip played once, its last frame held for `hold` seconds; caps: [(lines, start, end)]."""
    dur = dur_clip + hold; ins = ['-i', CLIPS + clip]; fc = '[0:v]fps=%d,scale=%d:%d,tpad=stop_mode=clone:stop_duration=%.3f,trim=duration=%.3f,setpts=PTS-STARTPTS[b0]' % (FPS, W, H, hold, dur); last = 'b0'
    for k, (lines, a, b) in enumerate(caps):
        ins += ['-i', overlay('%s_%d' % (name, k), lines)]; fc += ";[%s][%d:v]overlay=enable='between(t,%.2f,%.2f)'[b%d]" % (last, k + 1, a, b, k + 1); last = 'b%d' % (k + 1)
    fc += ';[%s]%s,format=yuv420p[v]' % (last, fades(dur, fi, fo))
    run(ins + ['-filter_complex', fc, '-map', '[v]', '-t', '%.3f' % dur], SC + name + '.mp4'); return dur

def still_scene(name, frames, fi=0.3, fo=0.3):
    """Held stills: frames = [(png path, seconds, overlay png or None)], cut one after another inside one file."""
    ins = []; fc = ''; n = 0; total = 0
    for k, (img, sec, ov) in enumerate(frames):
        ins += ['-framerate', str(FPS), '-i', img]; i_img = n; n += 1
        fc += '[%d:v]scale=%d:%d,format=yuv420p,loop=-1:1,trim=duration=%.3f,setpts=PTS-STARTPTS[s%d];' % (i_img, W, H, sec, k)
        if ov: ins += ['-i', ov]; fc += '[s%d][%d:v]overlay[t%d];' % (k, n, k); n += 1
        else: fc += '[s%d]null[t%d];' % (k, k)
        total += sec
    fc += ''.join('[t%d]' % k for k in range(len(frames))) + 'concat=n=%d:v=1:a=0[c];[c]%s,format=yuv420p[v]' % (len(frames), fades(total, fi, fo))
    run(ins + ['-filter_complex', fc, '-map', '[v]', '-t', '%.3f' % total], SC + name + '.mp4'); return total

def compose(name, parts, bg=(16, 14, 12)):
    """A 1280x720 picture from screenshots: parts = [(path, box x, y, w, h)], each fitted inside its box."""
    im = Image.new('RGB', (W, H), bg)
    for path, x, y, w, h in parts:
        s = Image.open(path).convert('RGB'); k = min(w / s.width, h / s.height); s = s.resize((round(s.width * k), round(s.height * k)), Image.LANCZOS); im.paste(s, (x + (w - s.width) // 2, y + (h - s.height) // 2))
    p = OV + name + '.png'; im.save(p); return p

SCENES = {}
def scene(f): SCENES[f.__name__] = f; return f

@scene
def s01_title(): return still_scene('s01_title', [(CARDS + 'title.png', 5.0, None)], fi=0.5)
@scene
def s02_gion(): return clip_scene('s02_gion', 'v19_clip_6_gion_kimono.mp4', 6.5, 1.5, [(['京都・祇園の新橋通。地面から 17 cm の高さ'], 0.4, 3.9), (['人が近づくと、ハトは歩いて道を空ける'], 4.1, 7.8)])
@scene
def s03_open():
    a = OV + 'flow_lp.png'; b = OV + 'flow_load.png'; c = OV + 'flow_game.png'
    return still_scene('s03_open', [(framed('s03_fa', a), 3.2, overlay_ui('s03_a', ['リンクを開くと、紹介ページが出る'], label='始め方 1 / 3')), (framed('s03_fb', b), 2.4, overlay_ui('s03_b', ['画面を押すと、読み込みが始まる。約 21 MB'], label='始め方 2 / 3')), (framed('s03_fc', c), 3.6, overlay_ui('s03_c', ['そのままブラウザの中で動きだす。インストールは要らない'], label='始め方 3 / 3'))])
@scene
def s04_eye(): return clip_scene('s04_eye', 'v21_clip_1_hato_no_me.mp4', 4.0667, 3.2, [(['ハトの目。左右あわせて約 320° を 1 枚に展開'], 0.3, 3.6), (['中央の狭い帯だけが両眼視。下に見えるのは自分のくちばし'], 3.8, 7.0)])
@scene
def s05_phone():
    p = compose('s05_phone', [(UI + 'mp_0.png', 250, 46, 330, 594), (UI + 'mp_1.png', 700, 46, 330, 594)])
    return still_scene('s05_phone', [(p, 5.0, overlay_ui('s05', ['縦持ちでは、上段が左目、下段が右目（左）。右は望遠'], label='スマートフォンの画面'))])
@scene
def s06_kamo(): return clip_scene('s06_kamo', 'v12_clip_2_kamogawa.mp4', 4.5, 2.0, [(['行動に台本はない'], 0.3, 2.6), (['空腹と渇き、時刻、周りの動きから、1 羽ずつが決める'], 2.8, 6.3)])
@scene
def s07_flush(): return clip_scene('s07_flush', 'v21_clip_3_flush_overview.mp4', 5.0, 1.2, [(['手をたたくと、近いハトから順に飛び立つ'], 0.3, 6.0)])
@scene
def s08_views():
    fr = []
    for i, (n, cap) in enumerate([('d_1.png', 'ハトの目'), ('d_2.png', '追う　自分で歩かせ、飛ばせる'), ('d_0.png', '望遠　背景をぼかして 1 羽を観察'), ('d_3.png', '俯瞰　群れ全体を見下ろす'), ('d_4.png', 'シネマ　カメラが自動で切り替わる')]):
        fr.append((framed('s08_f%d' % i, UI + n), 1.9, overlay_ui('s08_%d' % i, [cap], label='視点 %d / 5' % (i + 1))))
    return still_scene('s08_views', fr)
@scene
def s09_etho(): return still_scene('s09_etho', [(framed('s09_f', UI + 'd_5.png'), 4.6, overlay_ui('s09', ['観察した行動は「行動図鑑」に記録される。全 16 種'], label='行動図鑑'))])
@scene
def s10_ponto(): return clip_scene('s10_ponto', 'v21_clip_5_pontocho.mp4', 4.4, 2.0, [(['先斗町。壁は PLATEAU LOD3 の写真テクスチャをそのまま使用'], 0.3, 3.4), (['石畳、空、人はコードで描いている'], 3.6, 6.2)])
@scene
def s11_density(): return still_scene('s11_density', [(CARDS + 'density.png', 7.5, None)])
@scene
def s12_pipeline(): return still_scene('s12_pipeline', [(CARDS + 'pipeline.png', 7.0, None)])
@scene
def s13_before():
    a = compose('s13_a', [('/home/claude/hato-no-me-kyoto/media/stills/ground_before_after_tele.jpg', 40, 150, 1200, 340)])
    b = compose('s13_b', [('/home/claude/hato-no-me-kyoto/media/stills/people_before_after.jpg', 100, 110, 1080, 400)])
    return still_scene('s13_before', [(a, 4.6, overlay_ui('s13_a_ov', ['空中写真は 1 画素が約 50 cm。足元の小石は立体で置いた（右）'], label='変更前と変更後')), (b, 4.4, overlay_ui('s13_b_ov', ['近づくと粗かった人は、作り直した（右）'], label='変更前と変更後'))])
@scene
def s14_night(): return clip_scene('s14_night', 'v27_clip_4_gion_night.mp4', 5.2, 1.6, [(['夜の祇園白川。街灯の位置は PLATEAU の都市設備データ'], 0.3, 3.3), (['夜、ハトは街灯の届く軒先で眠る', '時刻は 0 時から 24 時まで、連続に変えられる'], 3.5, 6.6)])
@scene
def s15_verify(): return still_scene('s15_verify', [(CARDS + 'verify.png', 7.5, None)])
@scene
def s16_end(): return still_scene('s16_end', [(CARDS + 'end.png', 9.0, None)], fo=0.6)

if __name__ == '__main__':
    want = sys.argv[1:] or list(SCENES); total = 0
    for k in want:
        d = SCENES[k](); print('%-14s %.2f s' % (k, d)); total += d
    if not sys.argv[1:]:
        lst = HERE + '/scenes.txt'; open(lst, 'w').write(''.join("file '%s%s.mp4'\n" % (SC, k) for k in SCENES))
        tmp = OUT[:-4] + '.part.mp4'; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', tmp], check=True); os.replace(tmp, OUT)
        print('total %.2f s  ->' % total, OUT, os.path.getsize(OUT))
