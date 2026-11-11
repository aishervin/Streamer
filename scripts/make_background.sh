#!/usr/bin/env bash
set -euo pipefail

mkdir -p assets

ffmpeg -hide_banner -loglevel error -y   -f lavfi -i "color=c=black:s=640x360:d=1"   -frames:v 1 assets/background.png

echo "Created assets/background.png"
