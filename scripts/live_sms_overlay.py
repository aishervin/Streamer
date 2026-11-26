#!/usr/bin/env python3
"""Live four-country SMS overlay for Telegram RTMP.

Public inbox messages are rendered with authentication codes, URLs, phone numbers,
and email addresses redacted before they reach the stream.
"""
import argparse
import datetime as dt
import json
import os
import random
import re
import subprocess
import signal
import time
import urllib.parse
import urllib.request
import html as html_lib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

API = "https://onlinesim.io/api/getFreeList"
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


def font(size, bold=False):
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for name in candidates:
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


F_TITLE = font(27, True)
F_SUB = font(12, True)
F_COUNTRY = font(16, True)
F_NUMBER = font(24, True)
F_SENDER = font(17, True)
F_BODY = font(15)
F_SMALL = font(12)


def strip_html(value):
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def scrape_page(url=PAGE_URL):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
    })
    with urllib.request.urlopen(req, timeout=20) as response:
        raw = response.read().decode("utf-8", "ignore")

    numbers = []
    for found in re.findall(r"\+44[\d\s]{9,16}", raw):
        candidate = re.sub(r"\s+", " ", found).strip()
        if candidate not in numbers:
            numbers.append(candidate)

    messages = []
    for article in re.findall(r'<article class="sms-item.*?</article>', raw, re.S):
        sender = re.search(r"<span>([^<]{1,30})</span>", article)
        ago = re.search(r'<div class="ms-auto text-gray-700">([^<]+)</div>', article)
        body = re.search(r'<div class="mb-4[^>]*">(.*?)</div>', article, re.S)
        messages.append({
            "sender": strip_html(sender.group(1)) if sender else "SMS",
            "data_humans": strip_html(ago.group(1)) if ago else "",
            "text": strip_html(body.group(1)) if body else "",
        })

    if not numbers:
        return None
    return {
        "country_id": "web",
        "country": "United Kingdom",
        "slug": "united-kingdom",
        "flag": country_flag("united-kingdom"),
        "number": numbers[0],
        "short": "",
        "messages": messages[:5],
        "last_time": dt.datetime.now(dt.timezone.utc),
    }


def parse_time(value):
    if not value:
        return dt.datetime.min.replace(tzinfo=dt.timezone.utc)
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone.utc)
        return parsed
    except ValueError:
        return dt.datetime.min.replace(tzinfo=dt.timezone.utc)


def clean_message(value):
    text = str(value or "").replace("\r", " ").replace("\n", " ")
    text = re.sub(r"https?://\S+", "[link hidden]", text, flags=re.I)
    text = re.sub(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[email hidden]", text, flags=re.I)
    return text[:190]


def normalize_number(value):
    """Clean a phone number string: keep digits, +, spaces, dashes, parens."""
    if value is None:
        return ""
    text = str(value).strip()
    # Remove any zero-width / invisible characters
    text = re.sub(r"[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00A0]", "", text)
    # Remove any characters that aren't valid in a phone number
    text = re.sub(r"[^\d+\-().\s]", "", text).strip()
    return text


def country_flag(slug):
    flags = {
        "united-kingdom": "GB", "uk": "GB", "germany": "DE", "france": "FR",
        "netherlands": "NL", "united-states": "US", "usa": "US", "canada": "CA",
        "spain": "ES", "italy": "IT", "poland": "PL", "sweden": "SE",
        "norway": "NO", "finland": "FI", "austria": "AT", "belgium": "BE",
        "switzerland": "CH", "ireland": "IE", "portugal": "PT", "australia": "AU",
        "russia": "RU", "ukraine": "UA", "romania": "RO", "czech-republic": "CZ",
    }
    code = flags.get(str(slug or "").lower().replace("_", "-"), "")
    if not code:
        return "◎"
    return "".join(chr(0x1F1E6 + ord(c) - 65) for c in code)


def ellipsize(draw, text, fnt, max_width):
    text = str(text)
    while text and draw.textbbox((0, 0), text, font=fnt)[2] > max_width:
        text = text[:-2]
    return text + ("…" if len(text) < len(str(text)) else "")


def render(cards, updated):
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((20, 18, W - 20, 82), radius=16, fill=PANEL, outline=LINE, width=2)
    draw.rounded_rectangle((38, 33, 76, 71), radius=10, fill=(104, 83, 224))
    draw.text((49, 38), "S", font=font(24, True), fill=WHITE)
    draw.text((92, 29), "® SHΞN™ ZERO", font=F_TITLE, fill=WHITE)
    draw.text((94, 59), "PUBLIC SMS MONITOR  /  LIVE FEED", font=F_SUB, fill=MUTED)
    draw.ellipse((1040, 43, 1052, 55), fill=(255, 83, 105))
    draw.text((1061, 39), "LIVE", font=F_SUB, fill=(255, 123, 137))
    draw.text((1120, 40), updated, font=F_SMALL, fill=MUTED)

    gap, left, top = 14, 20, 98
    active = [card for card in cards if card]
    slots = len(active) if active else 4
    card_w = (W - 2 * left - (slots - 1) * gap) // slots
    card_h = H - top - 42
    for index in range(slots):
        x = left + index * (card_w + gap)
        card = active[index] if index < len(active) else None
        draw.rounded_rectangle((x, top, x + card_w, top + card_h), radius=15,
                               fill=PANEL, outline=LINE, width=2)
        if not card:
            draw.text((x + 20, top + 25), "WAITING FOR DATA", font=F_COUNTRY, fill=MUTED)
            continue
        draw.rounded_rectangle((x + 1, top + 1, x + card_w - 1, top + 103),
                               radius=14, fill=PANEL2)
        draw.text((x + 17, top + 16), card["flag"], font=font(23), fill=WHITE)
        draw.text((x + 62, top + 20), str(card["country"]).upper()[:19], font=F_COUNTRY, fill=MUTED)
        # Phone number with background box for better visibility
        number_text = str(card["number"])[:20] if card["number"] else "N/A"
        num_w = draw.textbbox((0, 0), number_text, font=F_NUMBER)[2]
        draw.rounded_rectangle(
            (x + 15, top + 50, x + 15 + num_w + 12, top + 82),
            radius=4, fill=(5, 8, 15)
        )
        draw.text((x + 21, top + 58), number_text, font=F_NUMBER, fill=WHITE)
        draw.line((x + 14, top + 105, x + card_w - 14, top + 105), fill=LINE, width=1)
        draw.text((x + 17, top + 122), "LATEST MESSAGES", font=F_SUB, fill=GREEN)
        y = top + 153
        messages = card.get("messages") or []
        if not messages:
            draw.text((x + 17, y + 8), "No recent messages", font=F_BODY, fill=MUTED)
        for message in messages[:5]:
            sender = str(message.get("sender") or message.get("from") or "SMS")[:24]
            ago = str(message.get("data_humans") or "")
            body = clean_message(message.get("text") or "")
            draw.text((x + 17, y), sender, font=F_SENDER, fill=WHITE)
            aw = draw.textbbox((0, 0), ago, font=F_SMALL)[2]
            draw.text((x + card_w - 16 - aw, y + 3), ago[:18], font=F_SMALL, fill=MUTED)
            y += 25
            words, line = body.split(), ""
            for word in words:
                candidate = (line + " " + word).strip()
                if draw.textbbox((0, 0), candidate, font=F_BODY)[2] > card_w - 34:
                    draw.text((x + 17, y), line, font=F_BODY, fill=(177, 191, 211))
                    y += 21
                    line = word
                else:
                    line = candidate
            if line:
                draw.text((x + 17, y), line, font=F_BODY, fill=(177, 191, 211))
                y += 22
            y += 10
            draw.line((x + 17, y, x + card_w - 17, y), fill=(35, 48, 67), width=1)
            y += 12
            if y > top + card_h - 28:
                break
    draw.text((22, H - 27), "SHΞN ZERO  •  STREAM OVERLAY", font=F_SMALL, fill=(102, 119, 144))
    draw.text((W - 205, H - 27), "REFRESH 60s", font=F_SMALL, fill=AMBER)
    return image


def choose_audio(audio_dir):
    if not audio_dir or not os.path.isdir(audio_dir):
        return None
    tracks = [str(p) for p in Path(audio_dir).glob("*") if p.suffix.lower() in
              (".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg")]
    return random.choice(tracks) if tracks else None


def run_stream(rtmp_url, audio_dir, duration, page_url=PAGE_URL, my_number=None, country=None):
    cards = []
    try:
        first = scrape_page(page_url)
        cards = [first] if first else []
    except Exception as exc:
        print(f"Page scrape failed: {exc}", flush=True)
    if not cards:
        cards = [{"country_id": None, "country": "Connecting", "slug": "", "flag": "◎",
                  "number": "Waiting for number", "short": "", "messages": [], "last_time": dt.datetime.min}]
    track = choose_audio(audio_dir)
    print(f"Selected {len(cards)} active country cards; audio={'on' if track else 'off'}.", flush=True)

    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "info",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", "1", "-i", "pipe:0"]
    if track:
        cmd += ["-re", "-stream_loop", "-1", "-i", track, "-map", "0:v:0", "-map", "1:a:0"]
    else:
        cmd += ["-map", "0:v:0", "-an"]
    cmd += ["-vf", "fps=15,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast",
            "-tune", "zerolatency", "-r", "15", "-g", "30", "-b:v", "1600k",
            "-maxrate", "1800k", "-bufsize", "3200k"]
    if track:
        cmd += ["-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2"]
    cmd += ["-f", "flv", rtmp_url]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    start = time.monotonic()
    next_refresh = 0
    last_image = render(cards, dt.datetime.now().strftime("%H:%M:%S"))
    try:
        while time.monotonic() - start < duration:
            now = time.monotonic()
            if now >= next_refresh:
                if cards and cards[0].get("number") != "Waiting for number":
                    try:
                        fresh = scrape_page(page_url)
                        cards = [fresh] if fresh else cards
                    except Exception as exc:
                        print(f"Page refresh failed: {exc}", flush=True)
                last_image = render(cards, dt.datetime.now().strftime("%H:%M:%S"))
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
    parser.add_argument("--rtmp-url", required=True)
    parser.add_argument("--audio-dir", default="music")
    parser.add_argument("--duration-seconds", type=int, default=14400)
    parser.add_argument("--url", default=PAGE_URL, help="Web page to scrape for numbers and SMS list")
    args = parser.parse_args()
    if not args.rtmp_url.startswith(("rtmp://", "rtmps://")):
        raise SystemExit("RTMPS destination URL is invalid")
    run_stream(args.rtmp_url, args.audio_dir, args.duration_seconds, args.url)


if __name__ == "__main__":
    main()
