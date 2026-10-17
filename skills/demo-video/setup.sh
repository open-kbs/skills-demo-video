#!/usr/bin/env bash
# One-time setup for the demo-video skill: ffmpeg, caption fonts, video/ folders.
set -e
cd "${PROJECT_DIR:-$PWD}"
mkdir -p video/vo video/cards video/build/rec video/build/vo video/build/sfx video/build/fonts video/out
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "installing ffmpeg…"; sudo apt-get update -qq && sudo apt-get install -y -qq ffmpeg >/dev/null
fi
ffmpeg -hide_banner -filters 2>/dev/null | grep -qE " subtitles " || { echo "ffmpeg lacks libass (subtitles filter)"; exit 1; }
cd video/build/fonts
for f in "firasansextracondensed/FiraSansExtraCondensed-Bold.ttf" "firasansextracondensed/FiraSansExtraCondensed-SemiBold.ttf" "golostext/GolosText%5Bwght%5D.ttf"; do
  out="$(basename "$f" | sed 's/%5B/[/;s/%5D/]/')"
  [ -s "$out" ] || curl -fsSL -o "$out" "https://github.com/google/fonts/raw/main/ofl/$f"
done
cd - >/dev/null
grep -qE '^video/(build|out)/?$' .gitignore 2>/dev/null || printf 'video/build/\nvideo/out/\n' >> .gitignore
echo "ok: ffmpeg $(ffmpeg -version | head -1 | cut -d' ' -f3), fonts: $(ls video/build/fonts | tr '\n' ' ')"
