#!/usr/bin/env python3
"""Live four-country SMS overlay for Telegram RTMP.

Fetches public inbox messages from the official onlinesim.io JSON API
(https://onlinesim.io/api/getFreeList?country=<code>&lang=en) and renders
them with authentication codes, URLs, phone numbers, and email addresses
redacted before they reach the stream.
"""
import argparse
import datetime as dt
import html as html_lib
import json
import os
import random
import re
import signal
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    Image = ImageDraw = ImageFont = None

PAGE_URL = "https://onlinesim.io/free_numbers/united-kingdom"
API_URL = "https://onlinesim.io/api/getFreeList"
W, H = 1280, 720
POLL_SECONDS = 60
BG = (7, 11, 19)
PANEL = (16, 24, 38)
PANEL2 = (21, 32, 49)
LINE = (43, 59, 82)
WHITE = (235, 242, 252)
MUTED = (139, 156, 181)
GREEN = (101, 226, 190)
AMBER = (245, 196, 104)

# (slug, display name, ISO code, onlinesim numeric country code, accent color)
COUNTRY_CANDIDATES = [
    ("united-kingdom", "United Kingdom", "GB", 44, (59, 130, 246)),
    ("france", "France", "FR", 33, (99, 102, 241)),
    ("netherlands", "Netherlands", "NL", 31, (249, 115, 22)),
    ("germany", "Germany", "DE", 49, (239, 68, 68)),
    ("spain", "Spain", "ES", 34, (244, 63, 94)),
    ("italy", "Italy", "IT", 39, (34, 197, 94)),
    ("belgium", "Belgium", "BE", 32, (245, 158, 11)),
    ("austria", "Austria", "AT", 43, (239, 68, 68)),
    ("ireland", "Ireland", "IE", 353, (22, 163, 74)),
    ("czech", "Czech Republic", "CZ", 420, (14, 165, 233)),
]

_FONT_CACHE = {}


def font(size, bold=False):
    key = (size, bold)
    if key in _FONT_CACHE:
        return _FONT_CACHE[key]
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for name in candidates:
        if Path(name).exists():
            fnt = ImageFont.truetype(name, size)
            _FONT_CACHE[key] = fnt
            return fnt
    fnt = ImageFont.load_default()
    _FONT_CACHE[key] = fnt
    return fnt


def strip_html(value):
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()



FLAG_CACHE_DIR = Path(tempfile.gettempdir()) / "sms_flags"
_FLAG_IMG_CACHE = {}


def flag_image(iso2):
    """Return a 30x22 RGBA flag image for an ISO-3166 code, or None."""
    key = str(iso2 or "").lower()[:2]
    if not key or not key.isalpha():
        return None
    if key in _FLAG_IMG_CACHE:
        return _FLAG_IMG_CACHE[key]
    try:
        FLAG_CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path = FLAG_CACHE_DIR / f"{key}.png"
        if not path.exists():
            req = urllib.request.Request(
                f"https://flagcdn.com/w80/{key}.png",
                headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64)"},
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                path.write_bytes(r.read())
        img = Image.open(path).convert("RGBA").resize((30, 22), Image.LANCZOS)
        _FLAG_IMG_CACHE[key] = img
        return img
    except Exception as exc:
        print(f"[Flag] {key}: {exc}", flush=True)
        _FLAG_IMG_CACHE[key] = None
        return None

def clean_message(value):
    text = str(value or "").replace("\r", " ").replace("\n", " ")
    text = re.sub(r"https?://\S+", "[link hidden]", text, flags=re.I)
    text = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[email hidden]", text, flags=re.I)
    return text[:160]


def extract_sender(text, in_number):
    """Prefer a [Service] prefix inside the message body; fall back to in_number."""
    bracket = re.match(r"^\[([^\]\[]{1,30})\]", text)
    if bracket:
        return bracket.group(1).strip()
    sender = str(in_number or "").strip()
    if not sender or sender.lower() == "verify":
        return "SMS"
    return sender[:30]


def parse_country_payload(payload):
    """Turn the raw getFreeList JSON into (display_number, messages) or None."""
    if not isinstance(payload, dict) or payload.get("response") != 1:
        return None
    numbers = payload.get("numbers") or {}
    if not numbers:
        return None

    messages_block = payload.get("messages") or {}
    data = messages_block.get("data") or []

    # Pick the number the message list belongs to when possible.
    my_number = str(messages_block.get("number") or "")
    key = my_number if my_number and my_number in numbers else next(iter(numbers))
    info = numbers.get(key) or {}
    full = str(info.get("full_number") or key)
    digits = re.sub(r"\D", "", full)
    if len(digits) < 7:
        return None
    display_number = "+" + digits

    messages = []
    for item in data:
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        messages.append({
            "sender": extract_sender(text, item.get("in_number")),
            "data_humans": str(item.get("data_humans") or "")[:20],
            "text": text,
        })

    return display_number, messages[:6]


def scrape_country(slug, name, code, api_code, accent):
    url = f"{API_URL}?country={api_code}&lang=en"
    req = urllib.request.Request(url, headers={
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": f"https://onlinesim.io/free_numbers/{slug}",
    })
    with urllib.request.urlopen(req, timeout=18) as response:
        payload = json.loads(response.read().decode("utf-8", "ignore"))

    parsed = parse_country_payload(payload)
    if not parsed:
        return None
    number, messages = parsed

    return {
        "country_id": slug,
        "country": name,
        "slug": slug,
        "code": code,
        "accent": accent,
        "flag": code.lower(),
        "number": number,
        "messages": messages,
        "last_time": dt.datetime.now(dt.timezone.utc),
    }


def slug_from_url(url):
    """Map a free_numbers page URL (or slug) to its API country code."""
    if not url:
        return None
    match = re.search(r"free_numbers/([a-z0-9\-_]+)", url)
    slug = match.group(1) if match else url.strip().lower()
    for candidate in COUNTRY_CANDIDATES:
        if candidate[0] == slug:
            return candidate[3]
    return None


def scrape_four_countries(previous_cards=None, primary_url=None):
    prev_map = {c["slug"]: c for c in (previous_cards or []) if c and c.get("slug")}
    cards = []

    primary_code = slug_from_url(primary_url)
    ordered = list(COUNTRY_CANDIDATES)
    if primary_code is not None:
        ordered.sort(key=lambda c: 0 if c[3] == primary_code else 1)

    for slug, name, code, api_code, accent in ordered:
        if len(cards) >= 4:
            break
        try:
            card = scrape_country(slug, name, code, api_code, accent)
            if card:
                cards.append(card)
                continue
        except Exception as exc:
            print(f"[SMS Fetch] {slug} error: {exc}", flush=True)

        if slug in prev_map:
            cards.append(prev_map[slug])

    return cards


def fit_font(draw, text, max_width, sizes=(22, 20, 18, 16, 14)):
    for size in sizes:
        f = font(size, True)
        bbox = draw.textbbox((0, 0), text, font=f)
        if (bbox[2] - bbox[0]) <= max_width:
            return f
    return font(sizes[-1], True)


def ellipsize(draw, text, fnt, max_width):
    text = str(text)
    orig = text
    while text and draw.textbbox((0, 0), text, font=fnt)[2] > max_width:
        text = text[:-1]
    return text + ("..." if len(text) < len(orig) else "")


def render(cards, updated):
    if Image is None:
        raise RuntimeError("Pillow is required for rendering video frames")
    F_TITLE = font(26, True)
    F_SUB = font(12, True)
    F_CODE = font(14, True)
    F_COUNTRY = font(15, True)
    F_SENDER = font(15, True)
    F_BODY = font(13)
    F_SMALL = font(11)

    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)

    # Header
    draw.rounded_rectangle((20, 18, W - 20, 82), radius=16, fill=PANEL, outline=LINE, width=2)
    draw.rounded_rectangle((38, 33, 76, 71), radius=10, fill=(104, 83, 224))
    draw.text((49, 38), "S", font=font(24, True), fill=WHITE)
    draw.text((92, 27), "SHEN ZERO  |  SMS MONITOR", font=F_TITLE, fill=WHITE)
    draw.text((94, 58), "PUBLIC LIVE SMS FEED  •  4 ACTIVE COUNTRIES", font=F_SUB, fill=MUTED)
    draw.ellipse((1035, 43, 1047, 55), fill=(255, 83, 105))
    draw.text((1056, 39), "LIVE", font=F_SUB, fill=(255, 123, 137))
    draw.text((1115, 41), f"UTC {updated}", font=F_SMALL, fill=MUTED)

    gap, left, top = 14, 20, 98
    slots = 4
    card_w = (W - 2 * left - (slots - 1) * gap) // slots
    card_h = H - top - 42

    for index in range(slots):
        x = left + index * (card_w + gap)
        card = cards[index] if index < len(cards) else None
        draw.rounded_rectangle((x, top, x + card_w, top + card_h), radius=15,
                               fill=PANEL, outline=LINE, width=2)
        if not card:
            draw.text((x + 20, top + 25), "CONNECTING...", font=F_COUNTRY, fill=MUTED)
            continue

        draw.rounded_rectangle((x + 1, top + 1, x + card_w - 1, top + 103),
                               radius=14, fill=PANEL2)

        accent = card.get("accent") or (59, 130, 246)
        code = str(card.get("code") or "SMS")[:3]
        flag = flag_image(code)
        if flag:
            image.paste(flag, (x + 15, top + 17), flag)
        else:
            draw.rounded_rectangle((x + 15, top + 15, x + 53, top + 40), radius=6, fill=accent)
            draw.text((x + 22, top + 19), code, font=F_CODE, fill=WHITE)
        draw.text((x + 62, top + 19), str(card["country"]).upper()[:18], font=F_COUNTRY, fill=WHITE)

        number_text = str(card.get("number") or "N/A")[:22]
        f_num = fit_font(draw, number_text, card_w - 42)
        num_bbox = draw.textbbox((0, 0), number_text, font=f_num)
        num_w = min(num_bbox[2] - num_bbox[0], card_w - 42)
        draw.rounded_rectangle(
            (x + 15, top + 50, x + 15 + num_w + 14, top + 86),
            radius=6, fill=(5, 8, 15), outline=LINE, width=1
        )
        draw.text((x + 22, top + 56), number_text, font=f_num, fill=GREEN)

        draw.line((x + 14, top + 105, x + card_w - 14, top + 105), fill=LINE, width=1)
        draw.text((x + 17, top + 118), "LATEST MESSAGES", font=F_SUB, fill=GREEN)

        y = top + 146
        messages = card.get("messages") or []
        if not messages:
            draw.text((x + 17, y + 8), "No recent messages", font=F_BODY, fill=MUTED)

        for message in messages[:5]:
            sender = ellipsize(draw, str(message.get("sender") or "SMS"), F_SENDER, card_w - 115)
            ago = str(message.get("data_humans") or "")[:14]
            body = clean_message(message.get("text") or "")

            draw.text((x + 17, y), sender, font=F_SENDER, fill=WHITE)
            aw = draw.textbbox((0, 0), ago, font=F_SMALL)[2]
            draw.text((x + card_w - 16 - aw, y + 2), ago, font=F_SMALL, fill=MUTED)
            y += 22

            words, line = body.split(), ""
            lines_drawn = 0
            for word in words:
                candidate = (line + " " + word).strip()
                if draw.textbbox((0, 0), candidate, font=F_BODY)[2] > card_w - 34:
                    draw.text((x + 17, y), line, font=F_BODY, fill=(177, 191, 211))
                    y += 18
                    lines_drawn += 1
                    line = word
                    if lines_drawn >= 3:
                        break
                else:
                    line = candidate
            if line and lines_drawn < 3:
                draw.text((x + 17, y), ellipsize(draw, line, F_BODY, card_w - 34), font=F_BODY, fill=(177, 191, 211))
                y += 19

            y += 8
            draw.line((x + 17, y, x + card_w - 17, y), fill=(35, 48, 67), width=1)
            y += 10
            if y > top + card_h - 32:
                break

    total_msgs = sum(len(c.get("messages") or []) for c in cards if c)
    draw.text((22, H - 27), f"SHEN ZERO  •  LIVE PUBLIC SMS ({len(cards)} COUNTRIES / {total_msgs} MSGS)",
              font=F_SMALL, fill=(102, 119, 144))
    draw.text((W - 210, H - 27), "AUTO REFRESH 60s", font=F_SMALL, fill=AMBER)
    return image


def build_audio_input(audio_dir):
    """Normalize every source track before building a loopable playlist.

    Mixed AAC/M4A/MP3 streams in one concat input can confuse FFmpeg's AAC
    decoder and terminate the whole RTMP process. Re-encode each track to a
    consistent MP3 profile first, skipping only files that cannot be decoded.
    """
    if not audio_dir or not os.path.isdir(audio_dir):
        return None, None
    tracks = sorted(
        str(p.resolve()) for p in Path(audio_dir).glob("*")
        if p.suffix.lower() in (".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg")
    )
    if not tracks:
        return None, None

    normalized_dir = Path(tempfile.gettempdir()) / "sms_overlay_audio_normalized"
    normalized_dir.mkdir(parents=True, exist_ok=True)
    normalized = []
    for index, track in enumerate(tracks):
        output = normalized_dir / f"track_{index:04d}.mp3"
        try:
            result = subprocess.run(
                [
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-i", track, "-map", "0:a:0", "-vn",
                    "-ac", "2", "-ar", "44100",
                    "-c:a", "libmp3lame", "-b:a", "128k",
                    "-f", "mp3", str(output),
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                text=True,
                timeout=300,
            )
            if result.returncode == 0 and output.exists() and output.stat().st_size > 1024:
                normalized.append(str(output.resolve()))
                print(f"[Audio] Normalized: {Path(track).name}", flush=True)
            else:
                print(f"[Audio] Skipping unreadable track: {Path(track).name}; {result.stderr[-500:]}", flush=True)
        except Exception as exc:
            print(f"[Audio] Skipping {Path(track).name}: {exc}", flush=True)

    if not normalized:
        print("[Audio] No valid audio tracks; continuing with silent video.", flush=True)
        return None, None

    random.shuffle(normalized)
    if len(normalized) == 1:
        return normalized[0], False

    playlist_file = Path(tempfile.gettempdir()) / "sms_overlay_audio_playlist.txt"
    lines = []
    for track in normalized:
        escaped = track.replace("'", "'\\''")
        lines.append(f"file '{escaped}'")
    playlist_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return str(playlist_file), True

def run_stream(rtmp_url, audio_dir, duration, page_url=PAGE_URL):
    cards = scrape_four_countries(primary_url=page_url)
    for c in cards:
        print(f"[SMS Init] {c['country']} -> {c['number']} ({len(c['messages'])} msgs)", flush=True)

    if not cards:
        cards = [{
            "country_id": "gb", "country": "United Kingdom", "slug": "united-kingdom",
            "code": "GB", "accent": (59, 130, 246),
            "number": "Retrying live fetch...", "messages": [], "last_time": dt.datetime.now(dt.timezone.utc)
        }]

    audio_input, is_concat = build_audio_input(audio_dir)
    print(f"Selected {len(cards)} active country cards; audio={'on' if audio_input else 'off'}.", flush=True)

    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "warning",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "1", "-i", "pipe:0",
    ]
    if audio_input:
        if is_concat:
            cmd += ["-re", "-stream_loop", "-1", "-f", "concat", "-safe", "0", "-i", audio_input,
                    "-map", "0:v:0", "-map", "1:a:0"]
        else:
            cmd += ["-re", "-stream_loop", "-1", "-i", audio_input, "-map", "0:v:0", "-map", "1:a:0"]
    else:
        cmd += ["-map", "0:v:0", "-an"]

    cmd += [
        "-vf", "fps=15,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
        "-r", "15", "-g", "30", "-b:v", "1600k", "-maxrate", "1800k", "-bufsize", "3200k",
    ]
    if audio_input:
        cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"]
    cmd += ["-f", "flv", "-flvflags", "no_duration_filesize", rtmp_url]

    def launch_ffmpeg():
        process = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        print(f"[RTMP] FFmpeg started (pid={process.pid}).", flush=True)
        return process

    proc = launch_ffmpeg()
    started_at = time.monotonic()
    next_refresh = started_at + POLL_SECONDS
    last_image = render(cards, dt.datetime.now(dt.timezone.utc).strftime("%H:%M:%S"))
    reconnect_delay = 5
    try:
        while time.monotonic() - started_at < duration:
            now = time.monotonic()
            if now >= next_refresh:
                try:
                    fresh = scrape_four_countries(previous_cards=cards, primary_url=page_url)
                    if fresh:
                        cards = fresh
                        summary = " | ".join(f"{c['code']}:{c['number']}({len(c['messages'])})" for c in cards)
                        print(f"[SMS Refresh] {summary}", flush=True)
                except Exception as exc:
                    print(f"[SMS Refresh] failed: {exc}", flush=True)
                last_image = render(cards, dt.datetime.now(dt.timezone.utc).strftime("%H:%M:%S"))
                next_refresh = now + POLL_SECONDS

            # A remote RTMP server can close a long-running publish session.
            # Keep the four-hour window alive and reconnect FFmpeg without
            # terminating the Python overlay process.
            if proc.poll() is not None:
                print(f"[RTMP] FFmpeg exited ({proc.returncode}); reconnecting in {reconnect_delay}s.", flush=True)
                time.sleep(reconnect_delay)
                try:
                    proc = launch_ffmpeg()
                    reconnect_delay = min(reconnect_delay * 2, 60)
                except Exception as exc:
                    print(f"[RTMP] Restart failed: {exc}", flush=True)
                    time.sleep(reconnect_delay)
                continue

            try:
                proc.stdin.write(last_image.tobytes())
                proc.stdin.flush()
                reconnect_delay = 5
            except (BrokenPipeError, OSError, ValueError) as exc:
                print(f"[RTMP] FFmpeg input closed ({exc}); reconnecting.", flush=True)
                try:
                    if proc.stdin and not proc.stdin.closed:
                        proc.stdin.close()
                except Exception:
                    pass
                try:
                    proc.wait(timeout=5)
                except Exception:
                    proc.terminate()
                time.sleep(reconnect_delay)
                try:
                    proc = launch_ffmpeg()
                    reconnect_delay = min(reconnect_delay * 2, 60)
                except Exception as restart_exc:
                    print(f"[RTMP] Restart failed: {restart_exc}", flush=True)
                    time.sleep(reconnect_delay)
            time.sleep(1)

        print("Four-hour streaming window completed.", flush=True)
    finally:
        if proc.stdin and not proc.stdin.closed:
            try:
                proc.stdin.close()
            except Exception:
                pass
        if proc.poll() is None:
            proc.send_signal(signal.SIGINT)
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.terminate()
            proc.wait(timeout=10)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rtmp-url", required=False, default="")
    parser.add_argument("--audio-dir", default="music")
    parser.add_argument("--duration-seconds", type=int, default=14400)
    parser.add_argument("--url", default=PAGE_URL, help="Primary free_numbers page; its slug selects the lead API country")
    parser.add_argument("--check-only", action="store_true", help="Verify live SMS fetch and exit")
    args = parser.parse_args()

    if args.check_only:
        cards = scrape_four_countries(primary_url=args.url)
        if not cards:
            raise SystemExit("Failed to fetch any live SMS numbers")
        for c in cards:
            print(f"[CHECK] {c['country']} ({c['code']}): {c['number']} -> {len(c['messages'])} messages")
            if c["messages"]:
                m0 = c["messages"][0]
                print(f"        Latest: [{m0['sender']}] ({m0['data_humans']}) {clean_message(m0['text'])}")
        return

    if not args.rtmp_url.startswith(("rtmp://", "rtmps://")):
        raise SystemExit("RTMPS destination URL is invalid")
    run_stream(args.rtmp_url, args.audio_dir, args.duration_seconds, args.url)


if __name__ == "__main__":
    main()
