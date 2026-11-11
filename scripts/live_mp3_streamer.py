#!/usr/bin/env python3
import os
import sys
import time
import subprocess

def extract_cover(mp3_path, cover_path, fallback_cover):
    cmd = ["ffmpeg", "-y", "-i", mp3_path, "-an", "-vcodec", "png", cover_path]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(cover_path) and os.path.getsize(cover_path) > 0:
        return cover_path
    return fallback_cover

def stream_mp3_folder(audio_dir, rtmp_url):
    covers_dir = "covers"
    os.makedirs(covers_dir, exist_ok=True)
    fallback_cover = os.path.join(covers_dir, "fallback.png")
    
    if not os.path.exists(fallback_cover):
        subprocess.run([
            "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=0x111827:s=1280x720:d=1",
            "-frames:v", "1", fallback_cover
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    while True:
        mp3_files = sorted([
            f for f in os.listdir(audio_dir)
            if f.lower().endswith(('.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg'))
        ])

        if not mp3_files:
            print(f"Error: No audio files found in {audio_dir}", file=sys.stderr)
            time.sleep(5)
            continue

        print(f"\n=== Starting playlist round with {len(mp3_files)} tracks ===")
        
        for idx, filename in enumerate(mp3_files, 1):
            mp3_path = os.path.join(audio_dir, filename)
            cover_path = os.path.join(covers_dir, f"cover_{idx:03d}.png")
            use_cover = extract_cover(mp3_path, cover_path, fallback_cover)

            print(f"[{idx}/{len(mp3_files)}] Now streaming live: '{filename}' with cover art '{use_cover}'...")

            ffmpeg_cmd = [
                "ffmpeg", "-hide_banner", "-loglevel", "info",
                "-re", "-loop", "1", "-i", use_cover,
                "-i", mp3_path,
                "-map", "0:v:0", "-map", "1:a:0",
                "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p",
                "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
                "-r", "15", "-g", "30",
                "-b:v", "500k", "-maxrate", "500k", "-bufsize", "1000k",
                "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
                "-shortest", "-f", "flv", rtmp_url
            ]

            proc = subprocess.run(ffmpeg_cmd)
            if proc.returncode != 0:
                print(f"Warning: FFmpeg stream exited with code {proc.returncode} for '{filename}'. Reconnecting in 2s...")
                time.sleep(2)

        print("\n=== Playlist round complete. Looping from track 1... ===")
        time.sleep(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python3 live_mp3_streamer.py <audio_dir> <rtmp_url>")
        sys.exit(1)
    audio_dir = sys.argv[1]
    rtmp_url = sys.argv[2]
    stream_mp3_folder(audio_dir, rtmp_url)
