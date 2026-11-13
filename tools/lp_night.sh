#!/bin/bash
# Replace the night cut in the landing-page videos (app/lp) after the night clip has been recorded again.
# hero.mp4 and hero_s.mp4: the first 22 s of the existing hero, a 0.6 s crossfade into the clip, a fade-out at the end (the video loops).
# intro.mp4: the video for posting (tools/xvideo.py), encoded again at a lower bit rate.
# usage: tools/lp_night.sh [app directory]      (run tools/xvideo.py first)
set -e
HERE=$(cd "$(dirname "$0")" && pwd); APP=${1:-$HERE/../app}; LP=$APP/lp; CLIP=$HERE/../media/clips/v27_clip_4_gion_night.mp4
ENC="-c:v libx264 -preset slow -pix_fmt yuv420p -r 30 -an -movflags +faststart"
cp "$LP/hero.mp4" "$LP/hero.old.mp4"
ffmpeg -v error -y -t 22.0 -i "$LP/hero.old.mp4" -i "$CLIP" -filter_complex "[0:v]fps=30,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[a];[1:v]fps=30,scale=1280:720,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=0.6:offset=21.4[x];[x]fade=t=out:st=26.2:d=0.6[v]" -map "[v]" $ENC -b:v 1300k -maxrate 2300k -bufsize 4600k "$LP/hero.part.mp4"
mv "$LP/hero.part.mp4" "$LP/hero.mp4"; rm "$LP/hero.old.mp4"
ffmpeg -v error -y -i "$LP/hero.mp4" -vf scale=854:480 $ENC -b:v 500k -maxrate 900k -bufsize 1800k "$LP/hero_s.part.mp4"; mv "$LP/hero_s.part.mp4" "$LP/hero_s.mp4"
ffmpeg -v error -y -i "$HERE/../media/video/hato_kyoto_x.mp4" $ENC -b:v 1260k -maxrate 2300k -bufsize 4600k "$LP/intro.part.mp4"; mv "$LP/intro.part.mp4" "$LP/intro.mp4"
for f in hero hero_s intro; do printf "%s " $f; ffprobe -v error -show_entries format=duration,size -of csv=p=0 "$LP/$f.mp4"; done
