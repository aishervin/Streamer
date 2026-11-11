#!/usr/bin/env python3
import os
import sys
import subprocess
from concurrent.futures import ThreadPoolExecutor

def process_track(args):
    idx, filename, audio_dir, covers_dir, segments_dir, fallback_cover, total_files = args
    full_path = os.path.join(audio_dir, filename)
    cover_path = os.path.join(covers_dir, f"cover_{idx:03d}.png")
    segment_path = os.path.join(segments_dir, f"segment_{idx:03d}.ts")

    # 1. Try extracting embedded artwork cover
    extract_cmd = [
        "ffmpeg", "-y", "-i", full_path, "-an", "-vcodec", "png", cover_path
    ]
    subprocess.run(extract_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if not os.path.exists(cover_path) or os.path.getsize(cover_path) == 0:
        print(f"[{idx}/{total_files}] No embedded cover art for '{filename}'. Using fallback cover.")
        use_cover = fallback_cover
    else:
        print(f"[{idx}/{total_files}] Extracted embedded cover art for '{filename}'.")
        use_cover = cover_path

    # 2. Encode to MPEG-TS video segment with 720p HD artwork
    print(f"[{idx}/{total_files}] Encoding video segment for '{filename}'...")
    encode_cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", use_cover,
        "-i", full_path,
        "-map", "0:v:0", "-map", "1:a:0",
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p",
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
        "-r", "30", "-g", "60",
        "-b:v", "1200k", "-maxrate", "1200k", "-bufsize", "2400k",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-shortest", "-f", "mpegts", segment_path
    ]
    encode_res = subprocess.run(encode_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if encode_res.returncode == 0 and os.path.exists(segment_path) and os.path.getsize(segment_path) > 0:
        print(f"[{idx}/{total_files}] Created segment: {segment_path} ({os.path.getsize(segment_path)} bytes)")
        return idx, f"file '{segment_path}'\n"
    else:
        print(f"[{idx}/{total_files}] Error encoding segment for '{filename}'!", file=sys.stderr)
        return idx, None

def prepare_playlist(audio_dir, output_playlist="mp3_concat.txt", segments_dir="segments", covers_dir="covers"):
    os.makedirs(segments_dir, exist_ok=True)
    os.makedirs(covers_dir, exist_ok=True)

    if not os.path.exists(audio_dir):
        print(f"Error: Directory {audio_dir} does not exist", file=sys.stderr)
        sys.exit(1)

    mp3_files = sorted([
        f for f in os.listdir(audio_dir)
        if f.lower().endswith(('.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg'))
    ])

    if not mp3_files:
        print(f"Error: No audio files found in {audio_dir}", file=sys.stderr)
        sys.exit(1)

    total_files = len(mp3_files)
    print(f"Found {total_files} audio tracks in {audio_dir}:")
    for idx, f in enumerate(mp3_files, 1):
        print(f"  {idx}. {f}")

    fallback_cover = os.path.join(covers_dir, "fallback_cover.png")
    
    # Generate fallback background image
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=0x111827:s=1280x720:d=1",
        "-frames:v", "1", fallback_cover
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    tasks = [
        (idx, filename, audio_dir, covers_dir, segments_dir, fallback_cover, total_files)
        for idx, filename in enumerate(mp3_files, 1)
    ]

    print(f"\nProcessing {total_files} tracks in parallel...")
    results = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(process_track, tasks))

    # Sort results by original index
    results.sort(key=lambda x: x[0])
    playlist_lines = [res[1] for res in results if res[1] is not None]

    if not playlist_lines:
        print("Error: Failed to create any video segments!", file=sys.stderr)
        sys.exit(1)

    with open(output_playlist, "w", encoding="utf-8") as f:
        f.writelines(playlist_lines)

    print(f"\nSuccessfully generated {output_playlist} with {len(playlist_lines)} tracks.")

if __name__ == "__main__":
    dir_to_scan = sys.argv[1] if len(sys.argv) > 1 else "mp3_repo"
    prepare_playlist(dir_to_scan)
