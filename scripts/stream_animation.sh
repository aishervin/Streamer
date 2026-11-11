#!/bin/bash
set -x
# stream_animation.sh
# Requires: xvfb, chromium, ffmpeg

# Cleanup on exit
cleanup() {
    pkill -TERM -f "chromium"
    pkill -TERM -f "Xvfb"
    pkill -TERM -x ffmpeg
    exit 0
}
trap cleanup INT TERM

# Start Virtual Framebuffer if not running
if ! pgrep -x "Xvfb" > /dev/null; then
    Xvfb :99 -screen 0 1280x720x24 &
    export DISPLAY=:99
    sleep 2
fi

while true; do
    echo "Starting stream..."
    
    # 2. Launch browser
    chromium --headless=new \
             --window-size=1280,720 \
             --disable-gpu \
             --no-sandbox \
             "file://$(pwd)/public/assets/aistudio/thinking_animation_7b993a79.html" &
    CHROMIUM_PID=$!
    
    # Wait for browser to stabilize
    sleep 5
    
    # 3. Stream to RTMP
    ffmpeg -f x11grab \
           -video_size 1280x720 \
           -i :99 \
           -c:v libx264 -preset ultrafast -tune zerolatency \
           -pix_fmt yuv420p -g 30 -r 30 \
           -f flv "$1"
           
    echo "Stream interrupted. Restarting in 5 seconds..."
    kill $CHROMIUM_PID 2>/dev/null
    sleep 5
done
