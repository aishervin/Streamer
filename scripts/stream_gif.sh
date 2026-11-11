#!/bin/bash
# stream_gif.sh
# Requires: ffmpeg

RTMP_URL=$1
GIF_PATH="/app/applet/assets/shen-loader.gif"

# Cleanup on exit
cleanup() {
    pkill -TERM -x ffmpeg
    exit 0
}
trap cleanup INT TERM

echo "Starting GIF stream..."

while true; do
    ffmpeg -re -stream_loop -1 -i "$GIF_PATH" \
           -c:v libx264 -preset ultrafast -tune zerolatency \
           -pix_fmt yuv420p -r 30 -g 60 \
           -f flv "$RTMP_URL"
    
    echo "Stream interrupted. Restarting in 5 seconds..."
    sleep 5
done
