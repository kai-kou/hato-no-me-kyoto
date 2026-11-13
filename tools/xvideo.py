# Assemble the recorded clips into one captioned video for posting (silent, 1280x720, H.264).
import os, subprocess, sys
from _paths import MEDIA, TMP as TMP0
from PIL import Image, ImageDraw, ImageFont

CLIPDIR = os.environ.get('HATO_CLIPS') or MEDIA + '/clips'; OUT = MEDIA + '/video'; TMP = TMP0 + '/xvideo'
os.makedirs(TMP, exist_ok=True); os.makedirs(OUT, exist_ok=True)
FONT = os.environ.get('HATO_FONT', '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc')
# (candidate files, caption, start seconds, maximum seconds)
CLIPS = [
    (['v19_clip_6_gion_kimono.mp4'], '祇園・新橋通。人が近づくと、ハトは歩いて道を空ける', 0.9, 5.6),
    (['v21_clip_1_hato_no_me.mp4', 'v16_clip_1_hato_no_me.mp4', 'v12_clip_1_hato_no_me.mp4', 'v11_clip_1_hato_no_me.mp4'], 'ハトの目。視野は約320°、下に見えるのは自分のくちばし', 0, 4.0),
    (['v21_clip_3_flush_overview.mp4', 'v18_clip_3_flush_overview.mp4', 'v12_clip_3_flush_overview.mp4', 'v11_clip_3_flush_overview.mp4'], '手をたたくと、群れが一斉に飛び立つ', 0.5, 3.8),
    (['v12_clip_2_kamogawa.mp4', 'v11_clip_2_kamogawa.mp4'], '行動に台本はない。空腹と渇きと時刻で決まる', 0, 3.6),
    (['v21_clip_5_pontocho.mp4', 'v16_clip_5_pontocho.mp4', 'v12_clip_5b_pontocho_hi.mp4', 'v12_clip_5_pontocho.mp4'], '先斗町。壁は PLATEAU LOD3 の実写テクスチャ', 0, 4.2),
    (['v11_clip_4_gion_night.mp4'], '夜の祇園白川', 0, 4.6),
]
W, H = 1280, 720


def font(size):
    f = ImageFont.truetype(FONT, size, index=0)
    return f


def caption_png(text, path):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    f = font(34); tw = d.textlength(text, font=f); x0, y0 = 36, H - 36 - 64
    d.rounded_rectangle((x0, y0, x0 + tw + 44, y0 + 64), 14, fill=(12, 12, 14, 178))
    d.text((x0 + 22, y0 + 9), text, font=f, fill=(255, 255, 255, 255))
    f2 = font(22); mark = '鳩の目、京都。'; mw = d.textlength(mark, font=f2)
    d.rounded_rectangle((W - 36 - mw - 28, 30, W - 36, 30 + 42), 12, fill=(12, 12, 14, 150))
    d.text((W - 36 - mw - 14, 36), mark, font=f2, fill=(255, 255, 255, 235))
    im.save(path)


def end_card(path, secs=2.2, fps=30):
    im = Image.new('RGB', (W, H), (14, 14, 16)); d = ImageDraw.Draw(im)
    f1 = font(64); f2 = font(26); f3 = font(20)
    t = '鳩の目、京都。'; d.text(((W - d.textlength(t, font=f1)) / 2, 236), t, font=f1, fill=(245, 242, 235))
    t = '先斗町・鴨川・祇園白川を、ハトの目で歩くブラウザ作品'; d.text(((W - d.textlength(t, font=f2)) / 2, 340), t, font=f2, fill=(214, 210, 200))
    t = '実装: Claude Fable 5.2 ／ three.js r170'; d.text(((W - d.textlength(t, font=f2)) / 2, 386), t, font=f2, fill=(214, 210, 200))
    t = '出典: 国土交通省 Project PLATEAU（京都市 2025年度）、国土地理院 地理院タイルを加工して作成'; d.text(((W - d.textlength(t, font=f3)) / 2, 596), t, font=f3, fill=(150, 148, 142))
    png = TMP + '/end.png'; im.save(png)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-loop', '1', '-framerate', str(fps), '-t', str(secs), '-i', png, '-vf', 'fade=t=in:st=0:d=0.3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-r', str(fps), path], check=True)


def dur(path):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True)
    return float(r.stdout.strip())


print('font', font(20).getname())
parts = []
for i, (names, text, ss, mx) in enumerate(CLIPS):
    name = next((n for n in names if os.path.exists(f'{CLIPDIR}/{n}')), None)
    if not name: print('missing', names); continue
    src = f'{CLIPDIR}/{name}'
    cap = f'{TMP}/cap{i}.png'; caption_png(text, cap); D = min(dur(src) - ss, mx); out = f'{TMP}/part{i}.mp4'
    vf = f"[0:v][1:v]overlay=0:0:format=auto,fade=t=in:st=0:d=0.2,fade=t=out:st={D - 0.2:.3f}:d=0.2,format=yuv420p[v]"
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{ss:.3f}', '-t', f'{D:.3f}', '-i', src, '-i', cap, '-filter_complex', vf, '-map', '[v]', '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', '-r', '30', '-t', f'{D:.3f}', out], check=True)
    parts.append(out); print('part', name, f'{D:.2f}s')
end = TMP + '/part_end.mp4'; end_card(end); parts.append(end)
lst = TMP + '/list.txt'; open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
final = OUT + '/hato_kyoto_x.mp4'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', final], check=True)
print('final', final, os.path.getsize(final), f'{dur(final):.2f}s')
