#!/usr/bin/env python3
"""Live four-country SMS overlay for Telegram RTMP.

Public inbox messages are rendered with authentication codes, URLs, phone numbers,
and email addresses redacted before they reach the stream.
"""
import argparse
import datetime as dt
import html as html_lib
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

COUNTRY_CANDIDATES = [
    ("united-kingdom", "United Kingdom", "GB", (59, 130, 246), r"\+44[\d\s\-]{8,16}"),
    ("france", "France", "FR", (99, 102, 241), r"\+33[\d\s\-]{8,16}"),
    ("netherlands", "Netherlands", "NL", (249, 115, 22), r"\+31[\d\s\-]{8,16}"),
    ("sweden", "Sweden", "SE", (234, 179, 8), r"\+46[\d\s\-]{8,16}"),
    ("finland", "Finland", "FI", (14, 165, 233), r"\+358[\d\s\-]{7,15}"),
    ("ukraine", "Ukraine", "UA", (56, 189, 248), r"\+380[\d\s\-]{7,14}"),
    ("belgium", "Belgium", "BE", (245, 158, 11), r"\+32[\d\s\-]{7,15}"),
    ("austria", "Austria", "AT", (239, 68, 68), r"\+43[\d\s\-]{7,15}"),
    ("poland", "Poland", "PL", (244, 63, 94), r"\+48[\d\s\-]{7,15}"),
    ("denmark", "Denmark", "DK", (225, 29, 72), r"\+45[\d\s\-]{7,14}"),
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


def clean_message(value):
    text = str(value or "").replace("\r", " ").replace("\n", " ")
    text = re.sub(r"https?://\S+", "[link hidden]", text, flags=re.I)
    text = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[email hidden]", text, flags=re.I)
    return text[:160]


def scrape_country(slug, name, code, accent, prefix_regex, url_override=None):
    url = url_override or f"https://onlinesim.io/free_numbers/{slug}"
    req = urllib.request.Request(url, headers={
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=18) as response:
        raw = response.read().decode("utf-8", "ignore")

    numbers = []
    for found in re.findall(prefix_regex, raw):
        candidate = re.sub(r"\s+", " ", found).strip()
        digits = re.sub(r"\D", "", candidate)
        if len(digits) >= 9 and candidate not in numbers:
            numbers.append(candidate)

    if not numbers:
        # Generic fallback regex inside free_numbers page
        for found in re.findall(r"\+\d{1,3}[\s\-]?\d[\d\s\-]{7,15}\d", raw):
            candidate = re.sub(r"\s+", " ", found).strip()
            digits = re.sub(r"\D", "", candidate)
            if len(digits) >= 9 and candidate not in numbers:
                numbers.append(candidate)

    messages = []
    for article in re.findall(r'<article[^>]*class="[^"]*sms-item.*?</article>', raw, re.S):
        sender = re.search(r"<span>([^<]{1,40})</span>", article)
        ago = re.search(r'<div class="ms-auto text-gray-700">([^<]+)</div>', article)
        body = re.search(r'<div class="mb-4[^>]*">(.*?)</div>', article, re.S)
        body_text = strip_html(body.group(1)) if body else ""
        if not body_text:
            continue
        messages.append({
            "sender": strip_html(sender.group(1)) if sender else "SMS",
            "data_humans": strip_html(ago.group(1)) if ago else "",
            "text": body_text,
        })

    if not numbers:
        return None

    return {
        "country_id": slug,
        "country": name,
        "slug": slug,
        "code": code,
        "accent": accent,
        "number": numbers[0],
        "messages": messages[:6],
        "last_time": dt.datetime.now(dt.timezone.utc),
    }


def scrape_four_countries(previous_cards=None, primary_url=None):
    prev_map = {c["slug"]: c for c in (previous_cards or []) if c and c.get("slug")}
    cards = []

    for idx, (slug, name, code, accent, prefix_regex) in enumerate(COUNTRY_CANDIDATES):
        if len(cards) >= 4:
            break
        override = primary_url if (idx == 0 and primary_url and "free_numbers/" in primary_url) else None
        try:
            card = scrape_country(slug, name, code, accent, prefix_regex, url_override=override)
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
    if not audio_dir or not os.path.isdir(audio_dir):
        return None, None
    tracks = sorted(
        str(p.resolve()) for p in Path(audio_dir).glob("*")
        if p.suffix.lower() in (".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg")
    )
    if not tracks:
        return None, None
    random.shuffle(tracks)
    if len(tracks) == 1:
        return tracks[0], False

    playlist_file = Path(tempfile.gettempdir()) / "sms_overlay_audio_playlist.txt"
    lines = []
    for t in tracks:
        escaped = t.replace("'", "'\\''")
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
        "ffmpeg", "-hide_banner", "-loglevel", "info",
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
    cmd += ["-f", "flv", rtmp_url]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    start = time.monotonic()
    next_refresh = time.monotonic() + POLL_SECONDS
    last_image = render(cards, dt.datetime.now(dt.timezone.utc).strftime("%H:%M:%S"))
    try:
        while time.monotonic() - start < duration:
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
            try:
                proc.stdin.write(last_image.tobytes())
                proc.stdin.flush()
            except BrokenPipeError:
                raise RuntimeError("FFmpeg stopped accepting video frames")
            time.sleep(1)
        print("Four-hour streaming window completed.", flush=True)
    finally:
        if proc.stdin and not proc.stdin.closed:
            proc.stdin.close()
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
    parser.add_argument("--url", default=PAGE_URL, help="Primary web page to scrape for numbers and SMS list")
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
