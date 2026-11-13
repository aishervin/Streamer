#!/usr/bin/env bash
set -e

PLAYLIST_URL="${1:-https://www.youtube.com/watch?v=GHT2dpciTzg}"
TG_STREAM_URL="${2:-$TG_STREAM_URL}"
MAX_VIDEOS="${3:-1}"
QUALITY="${4:-480p}"

if [ -z "$TG_STREAM_URL" ]; then
  echo "Error: TG_STREAM_URL is not set"
  exit 1
fi

echo "========================================="
echo "YouTube Playlist to Telegram Streamer"
echo "Source: $PLAYLIST_URL"
echo "Max videos: $MAX_VIDEOS"
echo "Quality: $QUALITY"
echo "========================================="

# Setup cookies if provided in environment
COOKIE_ARGS=()
PLAYER_ARGS=()
if [ -n "$YOUTUBE_COOKIES" ]; then
  echo "Found YOUTUBE_COOKIES secret, configuring authentication..."
  if echo "$YOUTUBE_COOKIES" | grep -q "Netscape HTTP Cookie File"; then
    printf "%s\n" "$YOUTUBE_COOKIES" > /tmp/youtube_cookies.txt
  else
    echo "$YOUTUBE_COOKIES" | base64 -d > /tmp/youtube_cookies.txt 2>/dev/null || printf "%s\n" "$YOUTUBE_COOKIES" > /tmp/youtube_cookies.txt
  fi
  if [ -s /tmp/youtube_cookies.txt ]; then
    COOKIE_ARGS=("--cookies" "/tmp/youtube_cookies.txt")
    echo "Cookies configured for yt-dlp authentication."
  fi
elif [ -f "cookies.txt" ]; then
  COOKIE_ARGS=("--cookies" "cookies.txt")
  echo "Found local cookies.txt file."
else
  PLAYER_ARGS=(--extractor-args "youtube:player-client=mweb,tv,web_safari")
  echo "No cookies provided; using anonymous PO-token client mode."
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

cleanup() {
  echo "Signal received, stopping stream..."
  pkill -TERM -x ffmpeg 2>/dev/null || true
  rm -f /tmp/youtube_cookies.txt current_clip.*
  exit 0
}
trap cleanup INT TERM

while true; do
  echo "Fetching video list from source..."
  VIDEO_IDS=()

  # Check if URL has a playlist ID and official YouTube Data API v3 key is provided
  PLAYLIST_ID=$(echo "$PLAYLIST_URL" | grep -oE "list=([a-zA-Z0-9_-]+)" | cut -d= -f2 || true)
  if [ -n "$PLAYLIST_ID" ] && [ -n "$YOUTUBE_API_KEY" ]; then
    echo "Using official YouTube Data API v3 key for playlist extraction..."
    NODE_VIDS=$(node -e '
      async function fetchVideos() {
        try {
          const key = process.env.YOUTUBE_API_KEY;
          const oauthToken = process.env.YOUTUBE_OAUTH_TOKEN;
          const pid = process.argv[1];
          const requested = Math.max(1, parseInt(process.argv[2] || "25", 10) || 25);
          const max = Math.min(requested, 500);
          let pageToken = "";
          let collected = 0;
          const headers = {};
          if (oauthToken) {
            headers["Authorization"] = `Bearer ${oauthToken}`;
          }
          do {
            const params = new URLSearchParams({
              part: "snippet", maxResults: String(Math.min(50, max - collected)),
              playlistId: pid
            });
            if (key && !oauthToken) params.set("key", key);
            if (pageToken) params.set("pageToken", pageToken);
            const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?${params}`, { headers });
            const data = await res.json();
            if (!res.ok) {
              console.error("YouTube API error:", data.error?.message || res.status);
              break;
            }
            for (const it of (data.items || [])) {
              const vid = it.snippet?.resourceId?.videoId;
              if (vid) { console.log(vid); collected++; }
              if (collected >= max) break;
            }
            pageToken = data.nextPageToken || "";
          } while (pageToken && collected < max);
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

  # Extract single video ID directly if URL is a watch/youtu.be/shorts/live link without list=
  if [ ${#VIDEO_IDS[@]} -eq 0 ]; then
    DIRECT_ID=$(node -e '
      const u = (process.argv[1] || "").trim();
      const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|(?:embed|v|shorts|live)\/))([a-zA-Z0-9_-]{11})/) || u.match(/^([a-zA-Z0-9_-]{11})$/);
      if (m) console.log(m[1]);
    ' "$PLAYLIST_URL" 2>/dev/null || true)
    if [ -n "$DIRECT_ID" ] && [ -z "$PLAYLIST_ID" ]; then
      VIDEO_IDS=("$DIRECT_ID")
      echo "Extracted single video ID: $DIRECT_ID"
    fi
  fi

  # Fallback to yt-dlp flat-playlist
  if [ ${#VIDEO_IDS[@]} -eq 0 ]; then
    while IFS= read -r line; do
      if [ -n "$line" ]; then
        VIDEO_IDS+=("$line")
      fi
    done < <(yt-dlp "${COOKIE_ARGS[@]}" "${PLAYER_ARGS[@]}" --js-runtimes node --flat-playlist --print id "$PLAYLIST_URL" | head -n "$MAX_VIDEOS" || true)
  fi

  if [ ${#VIDEO_IDS[@]} -eq 0 ]; then
    echo "No videos found for source: $PLAYLIST_URL. Retrying in 10s..."
    sleep 10
    continue
  fi

  echo "Found ${#VIDEO_IDS[@]} video(s) to stream."

  for idx in "${!VIDEO_IDS[@]}"; do
    vid="${VIDEO_IDS[$idx]}"
    echo "-----------------------------------------"
    echo "[$((idx+1))/${#VIDEO_IDS[@]}] Processing video: https://www.youtube.com/watch?v=$vid"

    rm -f current_clip.*

    echo "Downloading video clip with original audio..."
    DOWNLOAD_SUCCESS=false

    # Check if local POT provider service is running
    POT_ARGS=()
    if curl -s http://127.0.0.1:4416/ping 2>/dev/null | grep -iq "pong"; then
      POT_ARGS=("--extractor-args" "youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416")
    fi

    # Try 1: prefer original audio track + <= MAX_H video
    if yt-dlp "${COOKIE_ARGS[@]}" "${PLAYER_ARGS[@]}" "${POT_ARGS[@]}" \
      --js-runtimes node \
      --socket-timeout 35 \
      --merge-output-format mp4 \
      -f "bestvideo[height<=$MAX_H]+bestaudio[format_note*=original]/bestvideo[height<=$MAX_H]+bestaudio[language^=fa]/best[height<=$MAX_H][format_note*=original]/best[height<=$MAX_H][ext=mp4]/bestvideo[height<=$MAX_H]+bestaudio/best[height<=$MAX_H]/best" \
      --no-warnings --no-playlist \
      -o "current_clip.%(ext)s" "https://www.youtube.com/watch?v=$vid"; then
      DOWNLOAD_SUCCESS=true
    fi

    # Try 2: fallback format
    if [ "$DOWNLOAD_SUCCESS" = false ]; then
      echo "Standard format download challenged, attempting fallback formats..."
      if yt-dlp "${COOKIE_ARGS[@]}" "${PLAYER_ARGS[@]}" "${POT_ARGS[@]}" \
        --js-runtimes node \
        --socket-timeout 35 \
        --merge-output-format mp4 \
        -f "b/bv+ba/best" \
        --no-warnings --no-playlist \
        -o "current_clip.%(ext)s" "https://www.youtube.com/watch?v=$vid"; then
        DOWNLOAD_SUCCESS=true
      fi
    fi

    if [ "$DOWNLOAD_SUCCESS" = false ]; then
      echo "Failed to download $vid with available clients, skipping to next..."
      sleep 5
      continue
    fi

    CLIP_FILE=$(ls current_clip.* 2>/dev/null | head -n 1 || true)
    if [ -z "$CLIP_FILE" ] || [ ! -f "$CLIP_FILE" ]; then
      echo "Clip file not found after download, skipping..."
      continue
    fi

    ls -lh "$CLIP_FILE"
    echo "Streaming actual video ($CLIP_FILE) to Telegram Live with 25fps..."
    FFMPEG_EXIT=0
    ffmpeg -hide_banner -loglevel warning -stats \
      -re -i "$CLIP_FILE" \
      -vf "scale=${SCALE}:force_original_aspect_ratio=decrease,pad=${SCALE}:(ow-iw)/2:(oh-ih)/2,setsar=1" \
      -c:v libx264 -preset veryfast -pix_fmt yuv420p -r 25 -g 50 -keyint_min 50 \
      -b:v "$VBITRATE" -maxrate "$MAXRATE" -bufsize "$BUFSIZE" \
      -c:a aac -b:a 128k -ar 44100 -ac 2 \
      -f flv "$TG_STREAM_URL" || FFMPEG_EXIT=$?

    rm -f current_clip.*
    echo "Finished streaming $vid (ffmpeg exit code: $FFMPEG_EXIT)."
    sleep 1
  done

  echo "Playlist round completed. Looping playlist from beginning..."
  sleep 2
done
