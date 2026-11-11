#!/usr/bin/env bash
set -euo pipefail

DIR="${1:-music-optimized}"

if [ ! -d "$DIR" ]; then
  echo "Directory not found: $DIR"
  exit 1
fi

find "$DIR" -type f   \( -iname '*.m4a' -o -iname '*.aac' -o -iname '*.mp3'      -o -iname '*.ogg' -o -iname '*.opus' -o -iname '*.flac' -o -iname '*.wav' \)   -print0 | sort -z | while IFS= read -r -d '' f; do
    escaped=$(printf '%s' "$f" | sed "s/'/'\\''/g")
    printf "file '%s'\n" "$escaped"
  done > playlist.txt

echo "Playlist written: playlist.txt"
wc -l playlist.txt || true
