#!/usr/bin/env bash
set -e

PLAYLIST_URL="${1:-https://www.youtube.com/playlist?list=PLDIoUOhQQPlXr63I_vwF9GD8sAKh77dWU}"
TG_STREAM_URL="${2:-$TG_STREAM_URL}"
MAX_VIDEOS="${3:-20}"
QUALITY="${4:-720p}"

if [ -z "$TG_STREAM_URL" ]; then
  echo "Error: TG_STREAM_URL is not set"
  exit 1
fi

echo "========================================="
echo "YouTube Playlist to Telegram Streamer"
echo "Playlist: $PLAYLIST_URL"
echo "Max videos: $MAX_VIDEOS"
echo "Quality: $QUALITY"
echo "========================================="

# Setup cookies if provided in environment
COOKIE_ARGS=()
if [ -n "$YOUTUBE_COOKIES" ]; then
  echo "Found YOUTUBE_COOKIES secret, decoding..."
  echo "$YOUTUBE_COOKIES" | base64 -d > /tmp/youtube_cookies.txt 2>/dev/null || echo "$YOUTUBE_COOKIES" > /tmp/youtube_cookies.txt
  if [ -s /tmp/youtube_cookies.txt ]; then
    COOKIE_ARGS=("--cookies" "/tmp/youtube_cookies.txt")
    echo "Cookies configured for yt-dlp authentication."
  fi
elif [ -f "cookies.txt" ]; then
  COOKIE_ARGS=("--cookies" "cookies.txt")
  echo "Found local cookies.txt file."
fi

# Determine resolution parameters
if [ "$QUALITY" = "1080p" ]; then
  SCALE="1920:1080"
  VBITRATE="2200k"
  MAXRATE="2600k"
  BUFSIZE="4500k"
  MAX_H="1080"
elif [ "$QUALITY" = "480p" ]; then
  SCALE="854:480"
  VBITRATE="900k"
  MAXRATE="1100k"
  BUFSIZE="1800k"
  MAX_H="480"
else
  SCALE="1280:720"
  VBITRATE="1500k"
  MAXRATE="1800k"
  BUFSIZE="3000k"
  MAX_H="720"
fi

trap 'echo "Signal received, stopping stream..."; pkill -TERM -x ffmpeg 2>/dev/null || true; exit 0' INT TERM

while true; do
  echo "Fetching video list from playlist..."
  VIDEO_IDS=()

  # Check if official YouTube Data API v3 key is provided
  if [ -n "$YOUTUBE_API_KEY" ]; then
    echo "Using official YouTube Data API v3 key for playlist extraction..."
    PLAYLIST_ID=$(echo "$PLAYLIST_URL" | grep -oE "list=([a-zA-Z0-9_-]+)" | cut -d= -f2 || true)
    if [ -n "$PLAYLIST_ID" ]; then
      NODE_VIDS=$(node -e '
        async function fetchVideos() {
          try {
            const key = process.env.YOUTUBE_API_KEY;
            const pid = process.argv[1];
            const max = parseInt(process.argv[2] || "25", 10);
            const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${max}&playlistId=${pid}&key=${key}`);
            const data = await res.json();
            if (data.items) {
              data.items.forEach(it => {
                const vid = it.snippet?.resourceId?.videoId;
                if (vid) console.log(vid);
              });
            }
          } catch (e) {
            console.error(e.message);
          }
        }
        fetchVideos();
      ' "$PLAYLIST_ID" "$MAX_VIDEOS" 2>/dev/null || true)

      while IFS= read -r line; do
        if [ -n "$line" ]; then
          VIDEO_IDS+=("$line")
        fi
      done <<< "$NODE_VIDS"
    fi
  fi

  # Fallback to yt-dlp flat-playlist if API key not available or returned empty
  if [ ${#VIDEO_IDS[@]} -eq 0 ]; then
    while IFS= read -r line; do
      if [ -n "$line" ]; then
        VIDEO_IDS+=("$line")
      fi
    done < <(yt-dlp "${COOKIE_ARGS[@]}" --flat-playlist --print id "$PLAYLIST_URL" 2>/dev/null | head -n "$MAX_VIDEOS" || true)
  fi

  if [ ${#VIDEO_IDS[@]} -eq 0 ]; then
    echo "Could not fetch playlist videos with yt-dlp, attempting single video or fallback..."
    DIRECT_ID=$(echo "$PLAYLIST_URL" | grep -oE "([a-zA-Z0-9_-]{11})" | head -n 1 || true)
    if [ -n "$DIRECT_ID" ]; then
      VIDEO_IDS=("$DIRECT_ID")
    fi
  fi

  if [ ${#VIDEO_IDS[@]} -eq 0 ]; then
    echo "No videos found. Retrying in 10s..."
    sleep 10
    continue
  fi

  echo "Found ${#VIDEO_IDS[@]} video(s) to stream."

  for idx in "${!VIDEO_IDS[@]}"; do
    vid="${VIDEO_IDS[$idx]}"
    echo "-----------------------------------------"
    echo "[$((idx+1))/${#VIDEO_IDS[@]}] Processing video: https://www.youtube.com/watch?v=$vid"

    rm -f current_clip.*

    echo "Downloading video clip with audio..."
    DOWNLOAD_SUCCESS=false

    # Try 1: default with web,mweb,android,ios
    if yt-dlp "${COOKIE_ARGS[@]}" \
      --socket-timeout 30 \
      -f "best[height<=$MAX_H][ext=mp4]/bestvideo[height<=$MAX_H]+bestaudio/best[height<=$MAX_H]/best" \
      --extractor-args "youtube:player_client=mweb,web,ios,android" \
      --no-warnings --no-playlist \
      -o "current_clip.%(ext)s" "https://www.youtube.com/watch?v=$vid"; then
      DOWNLOAD_SUCCESS=true
    fi

    # Try 2: fallback to web_safari / tv client if blocked
    if [ "$DOWNLOAD_SUCCESS" = false ]; then
      echo "Standard clients challenged, attempting fallback clients (tv,web_safari)..."
      if yt-dlp "${COOKIE_ARGS[@]}" \
        --socket-timeout 30 \
        -f "best[height<=$MAX_H]/best" \
        --extractor-args "youtube:player_client=tv,web_safari" \
        --no-warnings --no-playlist \
        -o "current_clip.%(ext)s" "https://www.youtube.com/watch?v=$vid"; then
        DOWNLOAD_SUCCESS=true
      fi
    fi

    if [ "$DOWNLOAD_SUCCESS" = false ]; then
      echo "Failed to download $vid with available clients, skipping to next..."
      sleep 2
      continue
    fi

    CLIP_FILE=$(ls current_clip.* 2>/dev/null | head -n 1 || true)
    if [ -z "$CLIP_FILE" ] || [ ! -f "$CLIP_FILE" ]; then
      echo "Clip file not found after download, skipping..."
      continue
    fi

    echo "Streaming actual video ($CLIP_FILE) to Telegram Live with 25fps..."
    ffmpeg -hide_banner -loglevel info \
      -re -i "$CLIP_FILE" \
      -vf "scale=${SCALE}:force_original_aspect_ratio=decrease,pad=${SCALE}:(ow-iw)/2:(oh-ih)/2,setsar=1" \
      -c:v libx264 -preset veryfast -pix_fmt yuv420p -r 25 -g 50 -keyint_min 50 \
      -b:v "$VBITRATE" -maxrate "$MAXRATE" -bufsize "$BUFSIZE" \
      -c:a aac -b:a 128k -ar 44100 -ac 2 \
      -f flv "$TG_STREAM_URL" || true

    rm -f current_clip.*
    echo "Finished streaming $vid."
    sleep 1
  done

  echo "Playlist round completed. Looping playlist from beginning..."
  sleep 2
done
