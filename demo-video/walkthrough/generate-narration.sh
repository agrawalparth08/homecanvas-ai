#!/bin/bash
# Generate the 10 narration beats with the AI Tokenomics ElevenLabs voice.
# Voice inv_voice_1 (EKYQ0Yq4eLPupAut2PUr) via eleven_multilingual_v2 tuned
# (stability 0.48 / similarity 0.75 / style 0.05) — the engine your VOICE-settings
# doc recommends for SHORT narration beats (v3 garbles onsets under ~250 chars).
# Key read from ~/.config/ai-tokenomics/elevenlabs.key (never stored here).
set -e
OUT=${1:-./vo}; mkdir -p "$OUT"
KEY=$(tr -d '[:space:]' < "$HOME/.config/ai-tokenomics/elevenlabs.key")
VOICE=${ELEVEN_VOICE:-EKYQ0Yq4eLPupAut2PUr}
gen() { local id="$1"; shift; local text="$*"
  local body; body=$(python3 -c 'import json,sys;print(json.dumps({"text":sys.argv[1],"model_id":"eleven_multilingual_v2","voice_settings":{"stability":0.48,"similarity_boost":0.75,"style":0.05,"use_speaker_boost":True}}))' "$text")
  curl -s -f "https://api.elevenlabs.io/v1/text-to-speech/$VOICE?output_format=mp3_44100_128" \
    -H "xi-api-key: $KEY" -H "Content-Type: application/json" -H "Accept: audio/mpeg" -d "$body" -o "$OUT/$id.mp3"
  ffmpeg -y -v error -i "$OUT/$id.mp3" -ar 48000 -ac 2 "$OUT/$id.wav"; echo "$id ok"; }
gen title   "HomeCanvas AI. Turn any floor plan into a designed, walkable home, entirely on your own machine."
gen home    "Every client gets their own project. Trace a new plan, or open one you have already built."
gen tour    "Your flat drawing becomes a real three-D home you can orbit, walk, and tour, room by room."
gen stylepack "Restyle a whole home in one click. Indian Modern, Japandi, Rajasthani, or your own saved packs."
gen tower   "Stack floors for towers and multi-unit layouts. Each level is a copy you can tweak."
gen boards  "Export branded client boards to PDF, with a bill of quantities ready to price."
gen batch   "Queue a ray-traced render of every room, and come back to a finished set."
gen viewer  "Send your client a single file. An interactive three-D walkthrough they open in any browser."
gen hindi   "Work in English or Hindi. And every project stays on your own machine."
gen outro   "HomeCanvas AI. Local-first home design for independent designers. Try home canvas dot com."
