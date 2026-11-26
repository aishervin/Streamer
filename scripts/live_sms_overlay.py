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
import sys
import signal
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

API = "https://onlinesim.io/api/getFreeList"
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


def api_get(country=None, number=None):
    params = {"lang": "en", "count": "20"}
    if country is not None:
        params["country"] = str(country)
    if number is not None:
        params["number"] = str(number)
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "SHEN-Streamer/1.0"})
    with urllib.request.urlopen(req, timeout=20) as response:
        if response.status == 429:
            raise RuntimeError("Onlinesim rate limit (HTTP 429)")
        return json.loads(response.read().decode("utf-8"))


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
    text = re.sub(r"\+?\d[\d\s().-]{3,}\d", "[number hidden]", text)
    text = re.sub(r"(?<![A-Za-z])\d{4,8}(?![A-Za-z])", "[code hidden]", text)
    text = re.sub(r"(?i)\b(otp|verification|security|login|confirmation)\s*(code)?\s*[:#-]?\s*[A-Z0-9-]{4,10}\b",
                  r"\1 [code hidden]", text)
    return text[:190]


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


def unpack_country(country):
    code = country.get("country")
    result = api_get(code)
    numbers = result.get("numbers") or {}
    usable = [(k, v) for k, v in numbers.items() if not v.get("is_archive")]
    if not usable:
        return None
    short, info = usable[0]
    messages = ((result.get("messages") or {}).get("data") or [])
    latest = max(messages, key=lambda m: parse_time(m.get("created_at")), default={})
    return {
        "country_id": code,
        "country": country.get("country_text") or country.get("country_original") or "Unknown",
        "slug": country.get("country_original") or "",
        "flag": country_flag(country.get("country_original")),
        "number": info.get("full_number") or str(short),
        "short": str(short),
        "last_time": parse_time(latest.get("created_at")),
        "messages": messages,
    }


def discover_top_countries():
    base = api_get()
    countries = base.get("countries") or []
    candidates = []
    for country in countries:
        try:
            item = unpack_country(country)
            if item:
                candidates.append(item)
        except Exception as exc:
            print(f"Country lookup skipped: {country.get('country_text', '?')}: {exc}", flush=True)
    candidates.sort(key=lambda x: x["last_time"], reverse=True)
    return candidates[:4]


def refresh_card(card):
    result = api_get(card["country_id"], card["short"])
    paginator = result.get("messages") or {}
    messages = paginator.get("data") or []
    card["messages"] = sorted(messages, key=lambda m: parse_time(m.get("created_at")), reverse=True)[:5]
    card["number"] = (result.get("numbers") or {}).get(card["short"], {}).get("full_number") or card["number"]
    if card["messages"]:
        card["last_time"] = parse_time(card["messages"][0].get("created_at"))
    return card


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
    card_w, card_h = (W - 2 * left - 3 * gap) // 4, H - top - 42
    for index in range(4):
        x = left + index * (card_w + gap)
        card = cards[index] if index < len(cards) else None
        draw.rounded_rectangle((x, top, x + card_w, top + card_h), radius=15,
                               fill=PANEL, outline=LINE, width=2)
        if not card:
            draw.text((x + 20, top + 25), "WAITING FOR DATA", font=F_COUNTRY, fill=MUTED)
            continue
        draw.rounded_rectangle((x + 1, top + 1, x + card_w - 1, top + 103),
                               radius=14, fill=PANEL2)
        draw.text((x + 17, top + 16), card["flag"], font=font(23), fill=WHITE)
        draw.text((x + 62, top + 20), str(card["country"]).upper()[:19], font=F_COUNTRY, fill=MUTED)
        draw.text((x + 17, top + 58), str(card["number"])[:20], font=F_NUMBER, fill=WHITE)
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


def run_stream(rtmp_url, audio_dir, duration):
    cards = []
    try:
        cards = discover_top_countries()
    except Exception as exc:
        print(f"Initial Onlinesim discovery failed: {exc}", flush=True)
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
                if cards and cards[0].get("country_id") is not None:
                    refreshed = []
                    for card in cards:
                        try:
                            refreshed.append(refresh_card(card))
                        except Exception as exc:
                            print(f"Refresh failed for {card['country']}: {exc}", flush=True)
                            refreshed.append(card)
                    cards = refreshed
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
    args = parser.parse_args()
    if not args.rtmp_url.startswith(("rtmp://", "rtmps://")):
        raise SystemExit("RTMPS destination URL is invalid")
    run_stream(args.rtmp_url, args.audio_dir, args.duration_seconds)


if __name__ == "__main__":
    main()
