#!/usr/bin/env python3
"""Stream a playlist to Telegram RTMP with guaranteed video frames."""
import os
import sys
import time
import subprocess

VIDEO_SIZE = "1280x720"


def run_quiet(cmd):
    return subprocess.run(
        cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False
    ).returncode == 0


def prepare_fallback(covers_dir):
    """Create a real fallback frame from the repository artwork."""
    fallback = os.path.join(covers_dir, "fallback.png")
    if os.path.isfile(fallback) and os.path.getsize(fallback) > 0:
        return fallback

    os.makedirs(covers_dir, exist_ok=True)
    artwork = os.path.join("assets", "background.jpg")
    if os.path.isfile(artwork) and os.path.getsize(artwork) > 0:
        ok = run_quiet([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", artwork, "-frames:v", "1", "-vf",
            "scale=1280:720:force_original_aspect_ratio=decrease,"
            "pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0x111827",
            fallback,
        ])
        if ok and os.path.isfile(fallback) and os.path.getsize(fallback) > 0:
            print(f"Using repository background image: {artwork}", flush=True)
            return fallback

    # Last-resort generated frame: never start an audio-only RTMP stream.
    ok = run_quiet([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-f", "lavfi", "-i", "color=c=0x111827:s=1280x720",
        "-frames:v", "1", fallback,
    ])
    if not ok or not os.path.isfile(fallback) or os.path.getsize(fallback) == 0:
        raise RuntimeError("Could not create a valid fallback video frame")
    print("Using generated fallback video frame", flush=True)
    return fallback


def extract_cover(mp3_path, cover_path, fallback_cover):
    # MP3 artwork is commonly marked as attached_pic; map it explicitly.
    ok = run_quiet([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", mp3_path, "-map", "0:v:0", "-frames:v", "1", cover_path,
    ])
    if ok and os.path.isfile(cover_path) and os.path.getsize(cover_path) > 0:
        return cover_path
    return fallback_cover


def stream_mp3_folder(audio_dir, rtmp_url):
    if not rtmp_url.strip():
        raise RuntimeError("RTMP destination URL is empty")
    if not os.path.isdir(audio_dir):
        raise RuntimeError(f"Audio directory does not exist: {audio_dir}")

    covers_dir = "covers"
    os.makedirs(covers_dir, exist_ok=True)
    fallback_cover = prepare_fallback(covers_dir)

    while True:
        mp3_files = sorted(
            f for f in os.listdir(audio_dir)
            if f.lower().endswith((".mp3", ".m4a", ".aac", ".flac", ".wav", ".ogg"))
        )
        if not mp3_files:
            print(f"Error: No audio files found in {audio_dir}", file=sys.stderr, flush=True)
            time.sleep(5)
            continue

        print(f"\\n=== Starting playlist round with {len(mp3_files)} tracks ===", flush=True)
        for idx, filename in enumerate(mp3_files, 1):
            mp3_path = os.path.join(audio_dir, filename)
            cover_path = os.path.join(covers_dir, f"cover_{idx:03d}.png")
            use_cover = extract_cover(mp3_path, cover_path, fallback_cover)
            print(
                f"[{idx}/{len(mp3_files)}] Streaming '{filename}' with video frame '{use_cover}'",
                flush=True,
            )

            # Loop the still image for the entire audio track and explicitly
            # map both streams. This guarantees Telegram receives H.264 video
            # even when an MP3 has no embedded album artwork.
            ffmpeg_cmd = [
                "ffmpeg", "-hide_banner", "-loglevel", "info",
                "-loop", "1", "-framerate", "15", "-i", use_cover,
                "-i", mp3_path,
                "-map", "0:v:0", "-map", "1:a:0",
                "-vf",
                "scale=1280:720:force_original_aspect_ratio=decrease,"
                "pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p",
                "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
                "-r", "15", "-g", "30", "-b:v", "700k",
                "-maxrate", "700k", "-bufsize", "1400k",
                "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
                "-shortest", "-f", "flv", rtmp_url,
            ]
            proc = subprocess.run(ffmpeg_cmd)
            if proc.returncode != 0:
                print(
                    f"Warning: FFmpeg exited with code {proc.returncode} "
                    f"for '{filename}'. Reconnecting in 2s...",
                    flush=True,
                )
                time.sleep(2)

        print("\\n=== Playlist round complete. Looping from track 1... ===", flush=True)
        time.sleep(1)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 live_mp3_streamer.py <audio_dir> <rtmp_url>")
        sys.exit(1)
    try:
        stream_mp3_folder(sys.argv[1], sys.argv[2])
    except Exception as exc:
        print(f"FATAL: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
