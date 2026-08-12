#!/bin/bash
set -e
S=/private/tmp/claude-501/-Users-parthagrawal-claude-code-workarea/a59e37e4-6f42-4186-9ae1-5c01f2d15029/scratchpad
CLIPS=/Users/parthagrawal/claude-code-workarea/homecanvas-ai/demo-video/public/captures/walk
CARDS=$S/cards
VO=$S/vo-el
SEG=$S/seg2
mkdir -p $SEG
ENC="-c:v libx264 -pix_fmt yuv420p -r 30 -video_track_timescale 15360 -crf 19 -preset medium"

# --- title & outro cards (durations tuned to the ElevenLabs VO) ---
ffmpeg -y -v error -loop 1 -i $CARDS/title.png -t 7.6 \
  -vf "fade=in:st=0:d=0.6,fade=out:st=7.1:d=0.5,format=yuv420p" $ENC $SEG/01_title.mp4
ffmpeg -y -v error -loop 1 -i $CARDS/outro.png -t 7.2 \
  -vf "fade=in:st=0:d=0.5,fade=out:st=6.4:d=0.8,format=yuv420p" $ENC $SEG/10_outro.mp4

seg() { # idx slot dur
  ffmpeg -y -v error -i $CLIPS/$2.mp4 -loop 1 -i $CARDS/cap-$2.png -filter_complex \
    "[0:v]tpad=stop_mode=clone:stop_duration=2,fps=30,scale=1920:1080,setsar=1[v];\
     [1:v]format=rgba,fade=in:st=0.35:d=0.55:alpha=1[c];\
     [v][c]overlay=0:0:format=auto,format=yuv420p[o]" \
    -map "[o]" -t $3 $ENC $SEG/$1_$2.mp4
  echo "seg $2 ($3s): built"
}
seg 02 home      6.5
seg 03 tour      6.6
seg 04 stylepack 8.2
seg 05 tower     6.2
seg 06 boards    6.3
seg 07 batch     5.8
seg 08 viewer    7.0
seg 09 hindi     6.0

printf "file '%s'\n" $SEG/01_title.mp4 $SEG/02_home.mp4 $SEG/03_tour.mp4 $SEG/04_stylepack.mp4 \
  $SEG/05_tower.mp4 $SEG/06_boards.mp4 $SEG/07_batch.mp4 $SEG/08_viewer.mp4 $SEG/09_hindi.mp4 $SEG/10_outro.mp4 > $S/concat2.txt
ffmpeg -y -v error -f concat -safe 0 -i $S/concat2.txt -c copy $S/_video2.mp4
echo "video: $(ffprobe -v error -show_entries format=duration -of csv=p=0 $S/_video2.mp4)s"

# --- narration track: each beat at segment start + lead-in (ms) ---
ffmpeg -y -v error \
  -i $VO/title.wav -i $VO/home.wav -i $VO/tour.wav -i $VO/stylepack.wav -i $VO/tower.wav \
  -i $VO/boards.wav -i $VO/batch.wav -i $VO/viewer.wav -i $VO/hindi.wav -i $VO/outro.wav \
  -filter_complex \
  "[0]adelay=400|400[a0];[1]adelay=8100|8100[a1];[2]adelay=14600|14600[a2];[3]adelay=21200|21200[a3];\
   [4]adelay=29400|29400[a4];[5]adelay=35600|35600[a5];[6]adelay=41900|41900[a6];[7]adelay=47700|47700[a7];\
   [8]adelay=54700|54700[a8];[9]adelay=60800|60800[a9];\
   [a0][a1][a2][a3][a4][a5][a6][a7][a8][a9]amix=inputs=10:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,apad[a]" \
  -map "[a]" -t 67.4 $S/_vo2.wav

ffmpeg -y -v error -i $S/_video2.mp4 -i $S/_vo2.wav -c:v copy -c:a aac -b:a 192k -shortest \
  $S/homecanvas-walkthrough.mp4
echo "FINAL: $(ffprobe -v error -show_entries format=duration -of csv=p=0 $S/homecanvas-walkthrough.mp4)s"
ffmpeg -hide_banner -i $S/homecanvas-walkthrough.mp4 -af volumedetect -f null - 2>&1 | grep -iE "mean_volume|max_volume"
