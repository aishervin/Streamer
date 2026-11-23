"""Render the ASCII clownfish and anemone scene from ASCII Lab.

The fish and anemone are procedural 3D models projected onto a character grid.
The composition was inspired by a photo by Nhobgood on Wikimedia Commons.
"""
import argparse
import os
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HANDLE = '@ascii.lab'

CW, CH = 12, 16
COLS = int(os.environ.get("ASCII_LAB_COLS", "90"))
W, H, FPS = COLS * CW, 1920, 30
ROWS_CODE, ROWS_FULL = 100, 120                       # scene rows with the code panel / without
TAU = 2 * np.pi
FONT_PATHS = ("/System/Library/Fonts/Menlo.ttc", "DejaVuSansMono.ttf", "consola.ttf")
CAM_D = 7.0
LIGHT = np.array([-0.45, 0.75, -0.48])
LIGHT = LIGHT / np.linalg.norm(LIGHT)
RAMP = "$QB%8&0#@oauenjzt[]{}<>rcvx+=1il!;:,"       # heaviest letters first

FISH, FIN, WEED, BACK = 1, 2, 3, 4                   # who owns a cell
# Set an effect to False to see how it contributes to the scene.
FX = dict(touch=True, plankton=True, shafts=True, glint=True, orbit=True, prey=True)


def glyph_id(ch):
    return ord(ch) - 32


RAMP_G = np.array([glyph_id(c) for c in RAMP])


def ease(x):
    x = np.clip(x, 0.0, 1.0)
    return (3 - 2 * x) * x * x


def rgb(*c):
    return np.array(c, float) / 255


def unit(v):
    return v / np.maximum(np.sqrt((v * v).sum(-1, keepdims=True)), 1e-9)


def rot_y(p, a):
    c, s = np.cos(a), np.sin(a)
    x, y, z = np.moveaxis(p, -1, 0)
    return np.stack([c * x + s * z, y, -s * x + c * z], -1)


def rot_x(p, a):
    c, s = np.cos(a), np.sin(a)
    x, y, z = np.moveaxis(p, -1, 0)
    return np.stack([x, c * y - s * z, s * y + c * z], -1)


def rot_z(p, a):
    c, s = np.cos(a), np.sin(a)
    x, y, z = np.moveaxis(p, -1, 0)
    return np.stack([c * x - s * y, s * x + c * y, z], -1)


def line_glyph(dx, dy):
    # which of | _ / \ lies closest to a direction on the screen, judged in cells
    dx, dy = dx / CW, dy / CH
    steep, flat = np.abs(dy) > 2.0 * np.abs(dx), np.abs(dx) > 2.0 * np.abs(dy)
    return np.select([steep, flat, dx * dy < 0], [glyph_id("|"), glyph_id("-"), glyph_id("/")], glyph_id("\\"))


# ---- the fish ----------------------------------------------------------------------
# [body]
ORANGE, DEEP, FACE = rgb(255, 122, 22), rgb(238, 66, 18), rgb(255, 168, 52)
WHITE, DARK, RIM = rgb(250, 248, 240), rgb(84, 62, 112), rgb(205, 222, 255)
PROFILE_S = np.array([0.0, 0.03, 0.08, 0.16, 0.30, 0.45, 0.60, 0.75, 0.88, 0.96, 1.0])
PROFILE_H = np.array([0.0, 0.075, 0.125, 0.175, 0.222, 0.238, 0.218, 0.165, 0.10, 0.078, 0.075])
LOOP, PECT_HZ = 22.0, 1.3                              # both are reset to fit one round of the swimmer
W1, W2, W3 = 3 * TAU / LOOP, 4 * TAU / LOOP, 8 * TAU / LOOP    # slow clocks that close after one loop
TAIL_ROOT = 0.53                                     # where the tail fin starts, in the fish's own x
SWIM_HZ = 0.95                                       # hover only: the swimmer sets its own tail beat
SWIM = dict(effort=1.0, turn=0.0, phase=0.0, hz=0.95, t=0.0, brake=0.0)   # the swimmer's state at the frame being drawn


def half_height(s):
    return np.interp(s, PROFILE_S, PROFILE_H)


def half_width(s):
    return half_height(s) * (0.58 - 0.22 * s)


def sway(s, t):
    # the body bends sideways as a wave that runs from head to tail; s may exceed 1 on the tail fin
    # the head swings a little the other way; a turn bends the whole spine into a C
    beat = SWIM["phase"] - TAU * min(SWIM["hz"], 1.0) * (SWIM["t"] - t)   # an earlier t gives the lagging edge of a fin; the lag is a share of a beat, so a fast tail does not tear
    wave = (0.014 + 0.105 * s ** 2) * np.sin(beat - 3.4 * s)
    return SWIM["effort"] * wave + SWIM["turn"] * (s - 0.25) ** 2 * np.sign(s - 0.25)


def stripes(s, v):
    # 0 orange, 1 white, 2 dark border; v is the height on the flank, -1 belly .. 1 back
    bulge = np.exp(-(v / 0.55) ** 2)
    bands = [(0.215 + 0.035 * v * v, 0.335 + 0.02 * v * v),
             (0.515 - 0.055 * bulge, 0.655 - 0.02 * bulge),
             (0.905, 0.985)]
    kind = np.zeros(np.broadcast(s, v).shape, int)
    for a, b in bands:
        kind = np.where((s > a - 0.016) & (s < b + 0.016), 2, kind)
        kind = np.where((s > a) & (s < b), 1, kind)
    return kind


def body(t):
    s, th = np.meshgrid(np.linspace(0.0, 1.0, 280), np.linspace(0, TAU, 120, endpoint=False), indexing="ij")
    s, th = s.ravel(), th.ravel()
    h, w = half_height(s), half_width(s)
    v = np.sin(th)
    p = np.stack([s - 0.45, h * v, w * np.cos(th) + sway(s, t)], -1)
    slope = np.gradient(PROFILE_H, PROFILE_S)
    n = unit(np.stack([-np.interp(s, PROFILE_S, slope) * w, w * v, h * np.cos(th)], -1))
    kind = stripes(s, v)
    base = ORANGE * (1 - 0.5 * ease(v[:, None] * 0.9)) + DEEP * 0.5 * ease(v[:, None] * 0.9)
    base = np.where((s < 0.2)[:, None], base * 0.45 + FACE * 0.55, base)
    col = np.select([(kind == 1)[:, None], (kind == 2)[:, None]], [WHITE, DARK], base)
    return p, n, col, kind


# [fins]
def fin_sheet(root, along, out, a, b, t, s_of):
    # a flat fin: root(a) on the body, growing `out` by b; rays follow `out`
    p = root + out * b[:, None]
    s = s_of(p)
    p[:, 2] += sway(s, t)
    q = p + out * 0.02
    q[:, 2] = p[:, 2]
    return p, q


def fins(t):
    parts = []

    def add(p, q, b, margin=0.74, rim=0.93, flip=1.0):
        col = np.select([(b > rim)[:, None], (b > margin)[:, None]], [RIM, DARK], ORANGE * 0.94 + FACE * 0.06)
        lum = np.select([b > rim, b > margin], [0.9, 0.5], 0.72 + 0.2 * b)
        parts.append((p, q, col, lum))

    # dorsal: a spiny front lobe and a soft rear lobe
    for s0, s1, tall, lean in [(0.25, 0.57, 0.15, 0.45), (0.53, 0.88, 0.125, 0.85)]:
        a, b = [x.ravel() for x in np.meshgrid(np.linspace(0, 1, 110), np.linspace(0, 1, 30), indexing="ij")]
        s = s0 + (s1 - s0) * a
        reach = tall * np.sin(np.pi * a ** 0.8) ** 0.8
        root = np.stack([s - 0.45, half_height(s) * 0.93, 0 * s], -1)
        out = np.stack([lean * reach, reach, 0 * s], -1)
        p = root + out * b[:, None]
        p[:, 2] = sway(p[:, 0] + 0.45, t - 0.16 * b) + 0.05 * b ** 1.5 * np.sin(TAU * 1.1 * t - 8 * a - 3 * (s0 > 0.4))
        q = p + unit(out) * 0.03
        add(p, q, b, margin=0.84, rim=0.96)

    # anal fin, under the rear half
    a, b = [x.ravel() for x in np.meshgrid(np.linspace(0, 1, 80), np.linspace(0, 1, 26), indexing="ij")]
    s = 0.62 + 0.25 * a
    reach = 0.135 * np.sin(np.pi * np.clip(a * 0.9 + 0.1, 0, 1)) ** 0.6
    out = np.stack([0.7 * reach, -reach, 0 * s], -1)
    p = np.stack([s - 0.45, -half_height(s) * 0.93, 0 * s], -1) + out * b[:, None]
    p[:, 2] = sway(p[:, 0] + 0.45, t - 0.18 * b) + 0.045 * b ** 1.5 * np.sin(TAU * 1.1 * t - 7 * a + 1.0)
    add(p, p + unit(out) * 0.03, b, margin=0.72)

    # pelvic fins, a pair under the chest
    for side in (-1, 1):
        a, b = [x.ravel() for x in np.meshgrid(np.linspace(0, 1, 46), np.linspace(0, 1, 26), indexing="ij")]
        s = 0.37 + 0.09 * a
        reach = 0.17 * (0.55 + 0.45 * np.sin(np.pi * a) ** 0.7)
        out = np.stack([0.55 * reach, -reach, side * 0.25 * reach], -1)
        p = np.stack([s - 0.45, -half_height(s) * 0.9, side * 0.04 + 0 * s], -1) + out * b[:, None]
        p[:, 2] += sway(s, t - 0.2 * b) + 0.04 * b ** 2 * np.sin(TAU * 0.8 * t + side + 2 * a)
        p[:, 0] += 0.05 * b ** 2 * np.sin(TAU * 0.8 * t + 1.5 + side)
        add(p, p + unit(out) * 0.03, b, margin=0.78, rim=2.0)

    # [tail] a rounded fan that carries the body wave further
    a, b = [x.ravel() for x in np.meshgrid(np.linspace(-1, 1, 110), np.linspace(0, 1, 46), indexing="ij")]
    phi = 0.95 * a
    r = b * 0.31 * (1 - 0.13 * a * a)
    # the fin is a blade of fixed length: it bends with the wave, it does not stretch with it.
    # Walk out from the root in small steps, each turned by the slope of the wave at that place.
    out = np.linspace(0, 1, 46)
    here = 0.98 + 0.31 * out
    turn = np.clip(np.arctan(np.gradient(sway(here, t - 0.12 * out), here) * (1 + 0.3 * out)), -0.95, 0.95)
    step = out[1] - out[0]
    far = np.concatenate([[0.0], np.cumsum(np.cos(turn[1:]) * step)])
    side = np.concatenate([[0.0], np.cumsum(np.sin(turn[1:]) * step)])
    j = np.arange(len(b)) % 46
    span = 0.31 * (1 - 0.13 * a * a)
    x, y = TAIL_ROOT + span * np.cos(phi) * far[j], 0.075 * a * (1 - b) + r * np.sin(phi)
    p = np.stack([x, y, sway(0.98, t) + span * side[j] + 0.03 * b ** 2 * np.sin(TAU * SWIM_HZ * t - 4.2 + 2.5 * np.abs(a))], -1)
    ray = np.stack([np.cos(phi), np.sin(phi), 0 * phi], -1)
    add(p, p + ray * 0.03, b, margin=0.76, rim=0.94)

    # [pectorals] beat like oars; only the tail pushes. Sides a third of a stroke apart
    for side in (-1, 1):
        a, b = [x.ravel() for x in np.meshgrid(np.linspace(-1, 1, 70), np.linspace(0, 1, 36), indexing="ij")]
        beat = TAU * PECT_HZ * t + (0.0 if side > 0 else 2.2) - 2.1 * b - 0.5 * np.abs(a)   # the tip and the edges lag the root
        stroke = np.sin(beat) + 0.25 * np.sin(2 * beat + 0.6)                   # quick pull, slow return
        tucked = min(SWIM["effort"] - 0.55, 1.0)                              # cruising: fins held closer; braking: thrown open
        open_ = 0.72 - 0.20 * tucked + 0.55 * SWIM["brake"] + (0.48 - 0.14 * tucked) * stroke
        back, outw, up = np.array([0.72, -0.69, 0.0]), np.array([0.0, 0.0, float(side)]), np.array([0.69, 0.72, 0.0])
        axis = back * np.cos(open_)[:, None] + outw * np.sin(open_)[:, None]
        phi = 0.8 * a
        r = b * 0.21 * (1 - 0.12 * a * a)
        hinge = np.array([0.375 - 0.45, -0.07, side * half_width(0.375) * 0.9])
        ray = axis * np.cos(phi)[:, None] + up * np.sin(phi)[:, None]
        p = hinge + ray * r[:, None] - outw * (0.07 * b ** 2 * np.cos(beat))[:, None]     # the blade cups against the water
        add(p, p + ray * 0.03, b, margin=0.74, rim=0.93)

    return [np.concatenate([part[i] for part in parts]) for i in range(4)]


# [eyes]
def eyes(t):
    out = []
    for side in (-1, 1):
        u, k = [x.ravel() for x in np.meshgrid(np.linspace(0, 1, 9), np.linspace(0, TAU, 28), indexing="ij")]
        r = 0.041 * u
        s = 0.115 + r * np.cos(k)
        y = 0.05 + r * np.sin(k)
        z = side * (half_width(s) * np.sqrt(np.clip(1 - (y / half_height(s)) ** 2, 0.05, 1)) + 0.03)
        p = np.stack([s - 0.45, y, z + sway(s, t)], -1)
        col = np.where((u < 0.6)[:, None], rgb(58, 34, 30), rgb(255, 190, 96))
        col = np.where(((u > 0.15) & (u < 0.42) & (np.abs(k - 2.2) < 0.45))[:, None], rgb(235, 225, 215), col)
        out.append((p, col, np.where(u < 0.6, 0.62, 0.72)))
    return [np.concatenate([o[i] for o in out]) for i in range(3)]


# [swimmer]
# Nobody moves the fish along a curve. It has a heading, a speed and an effort. Every step
# of the clock: it turns towards the next mark of its round; the harder it tries, the faster
# its tail beats; every sweep of the tail pushes it forward (two pushes per beat); the water
# slows it down again. Near a resting place it stops trying and glides to a halt.
#          x      y      z    effort  rest  near enough
ROUND = [(-0.50,  0.42,  0.02, 0.55, 0.0, 0.30),     # up and out of the arms, to the left
         (-1.30,  0.14, -0.38, 0.65, 0.0, 0.34),     # along the tips
         (-1.72, -0.28, -0.80, 0.60, 0.0, 0.30),     # a wide left turn, round towards us
         (-1.30, -0.58, -1.08, 0.80, 0.0, 0.30),     # ...and back along the bottom
         (-0.70, -0.50, -1.14, 2.10, 0.0, 0.30),     # here, or at the morsel: a burst, the tail works flat out
         ( 0.30, -0.42, -1.10, 1.15, 0.0, 0.34),     # across the front of the anemone at that speed
         ( 1.50, -0.10, -0.60, 0.95, 0.0, 0.34),     # up towards the rock, easing off
         ( 1.85,  0.35,  0.10, 0.60, 0.0, 0.30),     # over the rock
         ( 1.25,  0.66,  0.62, 0.75, 0.0, 0.34),     # home, from above and behind
         ( 0.16,  0.05,  0.27, 0.65, 0.0, 0.16),     # down into the arms, belly among the tips
         ( 0.04,  0.01,  0.10, 0.55, 0.0, 0.15),     # a turn inside them: round towards us,
         ( 0.22,  0.00,  0.04, 0.55, 0.0, 0.15),     # past the camera,
         ( 0.30,  0.04,  0.24, 0.55, 0.25, 0.15)]    # and round the back: a breath
THRUST, DRAG2, DRAG1 = 2.1, 2.2, 0.6
# [prey] the burst has a reason: a morsel sinks into view, the fish sees it, goes for it flat out and eats it.
# The morsel is a mark that moves: the fish steers at where it is now, and its mouth has to reach it.
PREY_SEEN, PREY_MARK = 2, 4                           # the round's mark at which the morsel appears; the mark it takes the place of
PREY_FROM, PREY_DRIFT = np.array([-0.02, -0.17, -1.14]), np.array([-0.020, -0.055, 0.0])   # where it appears, how it sinks per second
PREY_PAUSE = 0.55                                     # it sees the morsel: for this long it stops beating its tail and turns to face it
PREY_BITE, MOUTH = 0.12, 0.45                         # how close the mouth must come; the mouth is this far ahead of the middle of the fish
PREY_LOOK, PREY_TURN, PREY_WIDE = 0.5, 2.6, 0.36       # seconds after it appears that the camera starts to turn to it; seconds the turn takes; how far the camera steps back
PREY_INK = np.array([1.0, 0.84, 0.42])


def morsel(age):
    # a crumb in the water: it sinks, and rocks from side to side as it goes
    return PREY_FROM + PREY_DRIFT * age + np.array([0.035 * np.sin(2.3 * age), 0.0, 0.02 * np.sin(1.7 * age + 1.0)])


_m = np.random.default_rng(23)
MOTES = np.concatenate([_m.uniform([-3.0, -1.25, -1.7], [3.1, 1.0, 1.2], (300, 3)),        # everywhere the fish goes
                        _m.uniform([-1.9, -0.85, -1.55], [1.9, -0.10, -0.70], (170, 3))])   # thicker along the pass in front
MOTE_FADE, MOTE_INK = 1.6, np.array([0.50, 0.92, 1.0])
WAKE, WAKE_RATE, WAKE_LIFE = 460, 130.0, 2.6              # sparks in the pool, sparks per second at full speed, seconds they live
GLOW_FADE, GLOW_RUN, GLOW_INK = 0.7, 13.0, np.array([0.80, 1.0, 0.97])     # the arm's own pale tip colour, only brighter   # seconds to fade, nodes per second, colour
STEP, WARM = 1 / 60, 240                              # the clock of the swimmer and of the anemone; steps to settle
TRACK = {}
PIVOT, ORBIT, TILT = np.array([0.05, -0.55, 0.40]), 0.24, 0.22   # the centre of the scene; radians of swing and of lean per unit of camera travel
BAR, BARS = 2.0, 11                                   # the beat of the reel: one event every 2 s, 11 of them in a loop
START_X = 1.05                                        # where on the way home the loop begins


def swim_round():
    # run the swimmer for three rounds and keep the last one, when it has forgotten how it started
    p = np.array(ROUND[0][:3], float)
    global LOOP, W1, W2, W3, PECT_HZ
    a, th, v, e, phi, k, rest = np.pi + 0.5, 0.0, 0.0, 0.0, 0.0, 1, 0.0
    log, homes, circling, food, stare = [], [], 0.0, -1.0, 0.0           # food: seconds the morsel has been in the water, -1 when there is none
    while len(homes) < 3 and len(log) < 60 * 240:
        mark = ROUND[(k + 1) % len(ROUND)] if rest > 0 else ROUND[k]
        hunting = FX["prey"] and k == PREY_MARK and food >= 0 and rest <= 0
        food = food + STEP if food >= 0 else food
        to = (morsel(food) if hunting else np.array(mark[:3])) - p
        dist = np.linalg.norm(to)
        mouth = p + MOUTH * np.array([np.cos(a) * np.cos(th), np.sin(th), np.sin(a) * np.cos(th)])
        if rest > 0:
            rest -= STEP
            want = 0.0
            if rest <= 0:
                k = (k + 1) % len(ROUND)
        else:
            want = mark[3] * (np.clip(dist / 0.35, 0.5, 1) if mark[4] > 0 else 1)
            if hunting and stare > 0:                                     # it has just seen the morsel: a held breath before the burst
                stare -= STEP
                want = 0.05
            ahead = to[0] * np.cos(a) + to[2] * np.sin(a)                 # past a resting place is as good as at it: no circling back
            circling = circling + STEP if dist < 3 * mark[5] else 0.0      # round and round a mark it cannot quite hit: let it go
            caught = np.linalg.norm(morsel(food) - mouth) < PREY_BITE if hunting else dist < mark[5]
            if caught or (mark[4] > 0 and dist < 2.5 * mark[5] and ahead < 0) or circling > 1.4:
                circling = 0.0
                food = -1.0 if hunting else 0.0 if FX["prey"] and k == PREY_SEEN - 1 else food
                if k == 0:
                    homes.append(len(log))
                rest = mark[4]
                if rest <= 0:
                    k = (k + 1) % len(ROUND)
                    stare = PREY_PAUSE if FX["prey"] and k == PREY_MARK and food >= 0 else 0.0
        # steer: swing the heading round (never loop over the top), tip the nose along the path
        swing = (np.arctan2(to[2], to[0]) - a + np.pi) % TAU - np.pi
        eager = 0.35 if rest > 0 else 0.5 + 2.4 * e                       # a fish that is not swimming yet cannot turn fast
        eager = max(eager, 2.2) if stare > 0 else eager                   # ...but it can whip its head round at food
        want *= 0.40 + 0.60 * max(np.cos(swing), 0.0) ** 2                # it eases off to make a tight turn
        a += np.clip(swing * eager, -1.9, 1.9) * STEP
        th += (0.8 * np.arcsin(np.clip(to[1] / max(dist, 1e-6), -0.6, 0.6)) * (0.25 if rest > 0 else 1) - th) * 0.7 * eager * STEP
        e += (want - e) * (2.2 if want < e else 1.1 + 2.2 * max(want - 1.2, 0)) * STEP   # effort builds slowly, a burst comes on fast
        hz = 0.70 + 1.05 * e
        phi += TAU * hz * STEP
        push = THRUST * e * (0.30 + 0.70 * np.sin(phi - 0.9) ** 2)       # the tail pushes twice per beat
        v += (push - DRAG2 * v * abs(v) - DRAG1 * v) * STEP
        p = p + v * STEP * np.array([np.cos(a) * np.cos(th), np.sin(th), np.sin(a) * np.cos(th)])
        log.append((p[0], p[1], p[2], a, th, v, e, phi, *(morsel(food) if food >= 0 else p), food, k, float(stare > 0)))
    lap = np.array(log[homes[1]:homes[2] + 1])
    # the loop starts on the way home: the fish is above the anemone, three quarters towards us
    start = next(i for i in range(len(lap) - 1) if lap[i, 0] > START_X and lap[i + 1, 0] <= START_X and np.cos(lap[i, 3]) < 0 and lap[i, 1] > 0.2)
    turned = lap[:start + 1] + (lap[-1] - lap[0]) * np.array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0])     # carry on the turn count and the tail clock
    lap = np.concatenate([lap[start:-1], turned])
    LOOP = BARS * BAR if abs((len(lap) - 1) * STEP / (BARS * BAR) - 1) < 0.08 else round((len(lap) - 1) * STEP * FPS) / FPS
    # one round is stretched by a few per cent to fill a whole number of bars, so the music can loop with the picture
    W1, W2, W3 = 3 * TAU / LOOP, 4 * TAU / LOOP, 8 * TAU / LOOP
    PECT_HZ = round(1.3 * LOOP) / LOOP
    n = int(round(LOOP / STEP))
    at = np.linspace(0, len(lap) - 1, n + 1)
    lo = np.clip(at.astype(int), 0, len(lap) - 2)
    w = (at - lo)[:, None]
    aim, staring = lap[lo, 12].astype(int), lap[lo, 13] > 0
    lap = lap[lo] * (1 - w) + lap[lo + 1] * w                            # one round, stretched to exactly one loop
    ramp = np.linspace(0, 1, n + 1)
    gap = lap[-1] - lap[0]
    gap[3] = (gap[3] + np.pi) % TAU - np.pi                              # whole turns are fine, the rest is error
    gap[7] = gap[7] - TAU * round(gap[7] / TAU)                          # a whole number of tail beats
    gap[8:] = 0
    lap -= ramp[:, None] * gap
    rate = lambda col: np.gradient(col, STEP)
    x, y, z, a, th, v, e, phi = lap[:, :8].T
    food = np.where(lap[:, 11] >= 0, lap[:, 11], -1.0)
    gone = [i for i in range(1, n + 1) if food[i] < 0 <= food[i - 1]]
    TRACK.update(mark=aim, spot=float(np.argmax(staring)) * STEP if staring.any() else -99.0, prey=lap[:, 8:11], food=food, bite=gone[0] * STEP if gone else -99.0, bite_at=lap[gone[0] - 1, 8:11] if gone else np.zeros(3))
    TRACK.update(n=n, place=lap[:, :3], a=a, th=th, v=v, e=e, phi=phi, hz=rate(phi) / TAU, spin=rate(a), slowing=np.clip(-rate(v), 0, None), speed=np.linalg.norm(np.gradient(lap[:, :3], STEP, axis=0), axis=1),
                 lap_seconds=(homes[2] - homes[1]) * STEP)

    def follow(col, tau):                                                # what a lazy camera sees: the value, a moment late
        out, val = np.empty(2 * n), col[0]
        for i in range(2 * n):
            val += (col[i % n] - val) * STEP / tau
            out[i] = val
        return np.append(out[n:], out[n])

    # [prey] the camera sees the morsel a moment before the fish goes for it: it steps back and
    # turns to hold both, then closes in again as the gap closes
    eyes_on = np.clip((food - PREY_LOOK) / PREY_TURN, 0, 1)
    eyes_on = (eyes_on * eyes_on * (3 - 2 * eyes_on))[:, None]
    gap = (lap[:, 8:11] - lap[:, :3]) * eyes_on
    wide = 1 - PREY_WIDE * np.clip(np.linalg.norm(gap, axis=1) / 1.2, 0, 1)
    TRACK.update(cam_x=follow(x + 0.5 * gap[:, 0], 0.55), cam_y=follow(y + 0.5 * gap[:, 1], 0.8), cam_z=follow(z + 0.5 * gap[:, 2], 0.9), lead=follow(np.cos(a), 0.9),
                 zoom=follow(1.34 - 0.52 * np.clip(v / 0.75, 0, 1) - 0.22 * np.clip((v - 0.58) / 0.28, 0, 1), 1.0) * follow(wide, 0.25))   # and further back in a sprint
    # which part of the program matters most right now, for the code panel
    among = (np.abs(x - 0.05) < 1.3) & (y < 0.12) & (z > -1.35)
    now = np.where(among, 3, np.where(e > 0.62, 1, np.where(np.abs(TRACK["spin"]) > 0.7, 0, 2)))
    shown, since, out = now[0], 0, []
    for i in range(2 * n + 1):
        j = i % n
        since += 1
        if now[j] != shown and since > 1.7 / STEP and (now[(j + np.arange(24)) % n] == now[j]).all():
            shown, since = now[j], 0
        out.append(shown)
    TRACK["section"] = np.array(out[n:])


swim_round()


def swimmer(t):
    i = (t % LOOP) / STEP
    lo = int(i) % TRACK["n"]
    w = i - int(i)
    get = lambda key: TRACK[key][lo] * (1 - w) + TRACK[key][lo + 1] * w
    return {key: get(key) for key in ("place", "a", "th", "v", "speed", "e", "phi", "hz", "spin", "slowing", "cam_x", "cam_y", "cam_z", "lead", "zoom")} | {"section": int(TRACK["section"][lo]), "prey": TRACK["prey"][lo], "food": TRACK["food"][lo], "mark": int(TRACK["mark"][lo])}


def fish_pose(t):
    # place, yaw and nose-down pitch of the fish at time t
    st = swimmer(t)
    wag = 0.05 * (0.4 + st["e"]) * np.sin(st["phi"] + 0.8)            # the head answers the tail
    return st["place"], np.pi - st["a"] + wag, -st["th"]


def fish(t):
    place, yaw, pitch = fish_pose(t)
    st = swimmer(t)
    SWIM.update(effort=min(0.5 + 1.25 * st["e"], 2.0), turn=float(np.clip(0.11 * st["spin"], -0.2, 0.2)), phase=st["phi"], hz=st["hz"], t=t,
                brake=float(np.clip(1.6 * st["slowing"], 0, 0.7)))

    # A bent spine is no longer than a straight one. Without this the sideways wave only adds
    # to every length, and in a sprint the tail fin looked stretched. Walk along the wave and
    # give each point the distance it has really covered along the body's axis.
    along = np.linspace(0.0, 1.5, 76)
    slope = np.gradient(sway(along, t), along)
    reach = np.concatenate([[0.0], np.cumsum((along[1] - along[0]) / np.sqrt(1 + slope[1:] ** 2))])

    def posed(p, vec=False):
        if not vec:
            p = p.copy()
            body_end = np.interp(0.98, along, reach) - 0.45
            p[:, 0] = np.where(p[:, 0] > TAIL_ROOT, body_end + p[:, 0] - TAIL_ROOT, np.interp(p[:, 0] + 0.45, along, reach) - 0.45)   # the tail fin has kept its own length
        p = rot_y(rot_z(p, pitch), yaw)
        return p if vec else p + place

    bp, bn, bcol, bkind = body(t)
    normal = np.nan_to_num(posed(bn, True))
    lit = np.clip(normal.dot(LIGHT), 0, 1)
    # [glint] when the fish turns its face to us, a highlight slides over its flank
    facing = ease((-posed(np.array([[-1.0, 0.0, 0.0]]), True)[0, 2] - 0.35) / 0.45) if FX["glint"] else 0.0
    shine = np.clip(normal.dot(unit(LIGHT + np.array([0.0, 0.0, -1.0]))), 0, 1) ** 14 * (0.25 + 0.75 * facing) * (1.0 if FX["glint"] else 0.0)
    shade = 0.42 + 0.58 * lit
    lum = np.where(bkind == 2, 0.42, np.where(bkind == 1, 0.86 + 0.14 * lit, 0.66 + 0.3 * lit))
    tone = bcol * np.where(bkind == 2, 1.0, np.where(bkind == 1, 0.82 + 0.18 * lit, shade))[:, None]
    tone = np.clip(tone + 0.75 * shine[:, None] * (bkind != 2)[:, None], 0, 1)
    lum = np.clip(lum + 0.3 * shine, 0, 1)
    P = [posed(bp)]; Q = [posed(bp)]; C = [tone]; L = [lum]
    K = [np.full(len(bp), FISH)]; R = [np.zeros(len(bp), bool)]

    fp, fq, fcol, flum = fins(t)
    P.append(posed(fp)); Q.append(posed(fq)); C.append(fcol * 0.92); L.append(flum)
    K.append(np.full(len(fp), FIN)); R.append(np.ones(len(fp), bool))

    ep, ecol, elum = eyes(t)
    ep = posed(ep)
    ep[:, 2] -= 0.004
    P.append(ep); Q.append(ep); C.append(ecol); L.append(elum)
    K.append(np.full(len(ep), FISH)); R.append(np.zeros(len(ep), bool))
    return [np.concatenate(x) for x in (P, Q, C, L, K, R)]


# ---- the anemone -------------------------------------------------------------------
# [anemone]
# Every arm is a chain of NODES points rooted on a mound. Each step of the clock:
#   1. water drags a node towards the local current (the surge + the wake of the fish),
#      and the arm bends itself a little, a slow wave from root to tip;
#   2. the arm's own springiness pulls each node back to its rest place relative to its parent,
#      strongly near the root and weakly near the tip, so the tip arrives last;
#   3. no node may be inside the fish: it is pushed out to the fish's skin;
#   4. the links keep their length.
ARMS, NODES = 50, 14
_a = np.random.default_rng(11)
ARM_LON = _a.random(ARMS) * TAU
ARM_LAT = 0.06 + 1.12 * _a.random(ARMS) ** 1.15         # 0 = top of the mound
ARM_LEN = 0.60 + 0.42 * _a.random(ARMS)
ARM_PH = _a.random(ARMS) * TAU                          # not used: kept so the dice below roll the same
ARM_CURL = _a.normal(0, 0.42, (ARMS, 2))
_b = np.random.default_rng(31)
ARM_BEAT = _b.integers(4, 9, (ARMS, 2))                 # each arm also moves by itself: whole waves per loop, so the loop still closes
ARM_PHASE = _b.random((ARMS, 2)) * TAU
ARM_BEND = 2.2                                           # how far an arm curls away from a straight line at rest
ARM_STIFF = (0.20, 2.2, 0.012)                           # how hard a link holds its rest angle: at the root, the fall-off, at the tip
ARM_LIFE = 0.34                                          # how hard an arm bends itself, as a water speed
MOUND = np.array([1.10, 0.36, 0.80])
TIP, STEM = rgb(186, 228, 236), rgb(112, 94, 160)
FILL_G = np.array([glyph_id(c) for c in ".::;;ioo08"])
ARM_R = 0.043                                           # half the thickness of an arm
FISH_C, FISH_R = np.array([0.08, 0.0, 0.0]), np.array([0.60, 0.30, 0.17])   # the fish as an egg, for touching


def current(x, t):
    # the surge: water sloshes sideways as a slow wave that crosses the reef
    push = 0.62 * np.sin(W1 * t - 1.3 * x[..., 0]) + 0.16 * np.sin(W3 * t + 2.0 * x[..., 2])
    return np.stack([push, 0.10 * np.cos(W1 * t - 1.3 * x[..., 0]), 0.08 * np.cos(W2 * t + 3.0 * x[..., 0])], -1)


class Anemone:
    def __init__(self, centre):
        self.centre = np.asarray(centre, float)
        u = np.linspace(0, 1, NODES)[None, :, None]
        normal = np.stack([np.sin(ARM_LAT) * np.cos(ARM_LON), np.cos(ARM_LAT), np.sin(ARM_LAT) * np.sin(ARM_LON)], -1)
        root = self.centre + normal * MOUND
        aim = normal * np.array([1.05, 0.7, 1.0]) + np.array([0.0, 0.42, 0.0])
        aim[:, 1] = np.maximum(aim[:, 1], 0.30)
        aim = unit(aim)
        side = unit(np.cross(aim, np.array([0.0, 0.0, 1.0])))
        fore = np.cross(aim, side)
        length = ARM_LEN[:, None, None]
        bend = side[:, None] * ARM_CURL[:, :1, None] + fore[:, None] * ARM_CURL[:, 1:, None]
        rest = root[:, None] + length * (aim[:, None] * u + ARM_BEND * bend * (u ** 2 - 0.55 * u ** 3))    # a lazy S
        rest[..., 1] += 0.20 * length[..., 0] * u[..., 0] ** 2          # the arms curl up towards the light
        self.rest = rest
        self.side, self.fore, self.u = side[:, None], fore[:, None], u[..., 0]
        self.offset = np.diff(rest, axis=1)                             # node i+1 relative to node i, at rest
        self.link = np.linalg.norm(self.offset, axis=-1)
        self.stiff = (ARM_STIFF[0] * (1 - u[0, 1:, 0]) ** ARM_STIFF[1] + ARM_STIFF[2])[None, :, None]
        self.drag = (1.2 + 4.2 * u[0, :, 0] ** 1.2)[None, :, None]      # the tip feels the water most
        self.back = (root[:, 2] - self.centre[2] + MOUND[2]) / (2 * MOUND[2])
        self.x, self.v, self.n, self.seen = rest.copy(), np.zeros_like(rest), 0, {}
        self.glow = np.zeros(rest.shape[:2])                            # [touch] how brightly each node of each arm shines
        self.lit, self.off = np.zeros(len(MOTES)), np.zeros((len(MOTES), 3))   # [plankton] brightness and drift of each mote
        self.wake, self.born, self.owed, self.dice = np.zeros((WAKE, 3)), np.full(WAKE, -99.0), 0.0, np.random.default_rng(7)

    def step(self):
        t = (self.n - WARM) * STEP
        place, yaw, roll = fish_pose(t)
        earlier = fish_pose(t - STEP)[0]
        x, v = self.x, self.v
        touched = np.zeros(x.shape[:2], bool)
        flow = current(x, t)
        near = np.exp(-((x - place) ** 2).sum(-1) / 0.10)
        flow = flow + 0.9 * near[..., None] * (place - earlier) / STEP  # the fish drags water along
        # an arm is a muscle, not a reed: a slow bend runs from its root to its tip, each arm in its own time
        beat = ARM_BEAT[:, None, :] * TAU / LOOP * t - 5.0 * self.u[..., None] + ARM_PHASE[:, None, :]
        own = np.sin(beat[..., :1]) * self.side + 0.7 * np.sin(beat[..., 1:]) * self.fore
        flow = flow + ARM_LIFE * (self.u ** 0.7)[..., None] * own
        v = v + self.drag * (flow - v) * STEP
        v[:, 0] = 0
        x = x + v * STEP
        for _ in range(2):
            for i in range(1, NODES):
                want = x[:, i - 1] + self.offset[:, i - 1]
                x[:, i] += self.stiff[0, i - 1] * (want - x[:, i])
            # the fish: go to its own frame, where it is an egg; anything inside moves to the shell
            local = rot_z(rot_y(x - place, -yaw), -roll)
            e = (local - FISH_C) / (FISH_R + ARM_R)
            d = np.linalg.norm(e, axis=-1, keepdims=True)
            inside = d < 1
            touched |= inside[..., 0]
            out = np.where(inside, e / np.maximum(d, 1e-6), e) * (FISH_R + ARM_R) + FISH_C
            x = np.where(inside, x + 0.5 * (rot_y(rot_z(out, roll), yaw) + place - x), x)    # half way out per pass: a soft shove
            x[:, 0] = self.rest[:, 0]
            for i in range(1, NODES):
                x[:, i] = x[:, i - 1] + unit(x[:, i] - x[:, i - 1]) * self.link[:, i - 1, None]
        self.v = (x - self.x) / STEP * 0.985
        fast = np.linalg.norm(self.v, axis=-1, keepdims=True)
        self.v *= np.minimum(1.0, 1.1 / np.maximum(fast, 1e-6))          # water does not let an arm whip
        self.v[:, 0] = 0
        self.x = x
        # [touch] an arm the fish has touched lights up where it was touched; the light runs
        # out to the tip and fades. A fish that rushes past wakes the nearest arms too.
        rush = np.clip((np.linalg.norm(place - earlier) / STEP - 0.55) * 3.0, 0, 1) * np.exp(-((x - place) ** 2).sum(-1) / 0.16)
        glow = self.glow * np.exp(-STEP / GLOW_FADE)
        glow[:, 1:] += GLOW_RUN * STEP * (glow[:, :-1] - glow[:, 1:])
        self.glow = np.maximum(glow, np.maximum(touched * 1.0, 0.8 * rush))
        # [plankton] motes that hang in the water flash when the fish rushes by, the faster the brighter;
        # its wake drags them along for a moment, then they drift back and go dark
        speed = np.linalg.norm(place - earlier) / STEP
        gap = ((MOTES + self.off - place) ** 2).sum(-1)
        flash = np.clip((speed - 0.42) * 2.4, 0, 1) * np.exp(-gap / 0.22) + 0.35 * np.exp(-gap / 0.03)
        self.lit = np.maximum(self.lit * np.exp(-STEP / MOTE_FADE), np.clip(flash, 0, 1))
        self.off = self.off * np.exp(-STEP / 2.2) + 0.55 * np.exp(-gap / 0.10)[:, None] * (place - earlier)
        # the faster it goes, the more sparks it sheds behind its tail; they stay where they were born
        self.owed += WAKE_RATE * np.clip((speed - 0.50) / 0.30, 0, 1) * STEP
        heading = unit(place - earlier)
        while self.owed >= 1:
            self.owed -= 1
            k = int(self.dice.integers(WAKE))
            self.wake[k] = place - heading * self.dice.uniform(0.30, 0.85) + self.dice.normal(0, [0.07, 0.20, 0.16])
            self.born[k] = t
        self.wake[:, 1] += 0.04 * STEP
        self.now = t
        self.n += 1

    def at(self, t):
        n = int(round(t / STEP))
        if n + WARM < self.n:
            self.x, self.v, self.n = self.rest.copy(), np.zeros_like(self.rest), 0
            self.glow[:] = 0
            self.lit[:], self.off[:] = 0, 0
            self.born[:], self.owed, self.dice = -99.0, 0.0, np.random.default_rng(7)
        while self.n < n + WARM:                                         # the first WARM steps let the arms settle into the surge
            self.step()
        uu = np.linspace(0, 1, 34)
        cap = np.sqrt(np.clip(1 - ((uu - 0.90) / 0.10) ** 2, 0, 1))      # the rounded end
        thick = np.where(uu > 0.90, (ARM_R + 0.006) * cap + 0.004, ARM_R + 0.008 - 0.014 * uu + 0.012 * np.exp(-((uu - 0.86) / 0.08) ** 2))
        # a smooth curve through the nodes
        fine = np.linspace(0, NODES - 1, 34)
        i0 = np.clip(fine.astype(int), 0, NODES - 2)
        f = (fine - i0)[None, :, None]
        p0, p1 = self.x[:, i0], self.x[:, i0 + 1]
        m0 = (self.x[:, np.clip(i0 + 1, 0, NODES - 1)] - self.x[:, np.clip(i0 - 1, 0, NODES - 1)]) / 2
        m1 = (self.x[:, np.clip(i0 + 2, 0, NODES - 1)] - self.x[:, i0]) / 2
        line = (2 * f ** 3 - 3 * f ** 2 + 1) * p0 + (f ** 3 - 2 * f ** 2 + f) * m0 + (-2 * f ** 3 + 3 * f ** 2) * p1 + (f ** 3 - f ** 2) * m1
        glow = self.glow[:, i0] * (1 - f[..., 0]) + self.glow[:, i0 + 1] * f[..., 0]
        return line, thick, np.clip(1.1 - 0.7 * self.back, 0.30, 1.0), glow * FX["touch"]


# [shafts] slanted beams of sunlight stand in the water and sway; whatever is inside one is brighter
BEAMS = np.array([-2.6, -1.35, -0.2, 0.95, 2.1, 3.2])


def shafts(chars, ink, t, scale, cam_x, mid_y):
    rows = chars.shape[0]
    cx, cy = (np.arange(COLS) + 0.5) * CW, (np.arange(rows) + 0.5) * CH
    lit = np.zeros((rows, COLS))
    for k, x0 in enumerate(BEAMS):
        foot = W / 2 + 0.85 * scale * (x0 + 0.22 * np.sin(W1 * t + 1.7 * k) - cam_x)          # a little parallax: the beams are far
        lean = foot - 0.30 * (cy - mid_y)
        wide = 60 + 22 * np.sin(W2 * t + 2.3 * k)
        lit += (0.65 + 0.35 * np.sin(W3 * t + 1.1 * k)) * np.exp(-((cx[None, :] - lean[:, None]) / wide) ** 2)
    lit *= np.clip(1.15 - 0.55 * cy / (rows * CH), 0.3, 1)[:, None]                             # the light dies with depth
    ink *= (1 + 0.42 * lit)[..., None]
    np.clip(ink, 0, 1, out=ink)
    rr, cc = np.indices(lit.shape)
    dust = (chars == 0) & (lit > 0.30) & ((rr * 2 + cc) % 5 == 0)
    chars[dust] = glyph_id("/")
    ink[dust] = rgb(46, 84, 108) * lit[dust, None]


def draw_motes(chars, ink, zbuf, reef, t, project):
    # plankton: a dim speck that becomes a + and then a * as it lights up
    pts = MOTES + reef.off + 0.03 * np.sin(W2 * t + MOTES[:, ::-1] * 9.0)
    age = (reef.now - reef.born) / WAKE_LIFE
    alive = (age >= 0) & (age < 1)
    pts = np.concatenate([pts, reef.wake[alive]])
    glow = np.concatenate([reef.lit, (1 - age[alive]) ** 1.4 * (0.75 + 0.25 * np.sin(40 * age[alive] + np.arange(alive.sum())))])
    sx, sy, _ = project(pts)
    c, r = np.floor(sx / CW).astype(int), np.floor(sy / CH).astype(int)
    rows = chars.shape[0]
    ok = (c >= 0) & (c < COLS) & (r >= 0) & (r < rows)
    ok[ok] &= zbuf[r[ok], c[ok]] >= 99                                # only in open water: a mote never takes a letter from the fish, an arm or a rock
    c, r, lit = c[ok], r[ok], glow[ok]
    order = np.argsort(lit)
    c, r, lit = c[order], r[order], lit[order]
    chars[r, c] = np.select([lit > 0.55, lit > 0.18], [glyph_id("*"), glyph_id("+")], glyph_id("."))
    ink[r, c] = MOTE_INK * (0.16 + 0.84 * lit[:, None]) + 0.5 * np.clip(lit[:, None] - 0.5, 0, 1)   # the hottest go white
    ink[r, c] = np.clip(ink[r, c], 0, 1)
    for dc in (-1, 1):                                               # the brightest throw a short ray to each side
        hot = (lit > 0.6) & (c + dc >= 0) & (c + dc < COLS)
        free = hot.copy()
        free[hot] = chars[r[hot], c[hot] + dc] == 0
        chars[r[free], c[free] + dc] = glyph_id("-")
        ink[r[free], c[free] + dc] = MOTE_INK * 0.5 * lit[free, None]


def draw_prey(chars, ink, zbuf, st, t, project):
    # the morsel: one bright warm letter with a whisker that flicks; when it is eaten, a few crumbs scatter and go out
    rows = chars.shape[0]

    def put(v, glyph, tone):
        sx, sy, _ = project(np.asarray(v, float)[None])
        c, r = int(sx[0] // CW), int(sy[0] // CH)
        if 0 <= c < COLS and 0 <= r < rows and zbuf[r, c] > v[2] - 0.05:
            chars[r, c], ink[r, c] = glyph_id(glyph), np.clip(PREY_INK * tone, 0, 1)
        return c, r

    if st["food"] >= 0:
        tone = np.clip(st["food"] / 0.8, 0, 1) * (0.85 + 0.15 * np.sin(9.0 * t))
        c, r = put(st["prey"], "@", 1.3 * tone)
        flick = int(t * 5) % 2
        seen = (t % LOOP) - TRACK["spot"]
        glint = np.clip(1 - seen / 0.6, 0, 1) if seen >= 0 else 0.0       # it catches the light: that is what the fish sees
        body = [(-1, 0, "8", 1.0), (1, 0, "8", 1.0), (-2, 0, "~-"[flick], 0.7), (2, 0, "-~"[flick], 0.7), (0, -1, "o", 0.8), (0, 1, "o", 0.6)]
        rays = [(-1, -1, "\\", 1.0), (1, -1, "/", 1.0), (-1, 1, "/", 1.0), (1, 1, "\\", 1.0), (0, -2, "|", 0.9), (0, 2, "|", 0.9), (-3, 0, "-", 0.9), (3, 0, "-", 0.9)]
        for dc, dr, glyph, dim in body + (rays if glint > 0 else []):
            shine = dim * tone * (1 + glint) if (dc, dr, glyph, dim) in body else dim * glint
            if 0 <= c + dc < COLS and 0 <= r + dr < rows and zbuf[r + dr, c + dc] > st["prey"][2] - 0.05:
                chars[r + dr, c + dc], ink[r + dr, c + dc] = glyph_id(glyph), np.clip(PREY_INK * shine + 0.5 * glint, 0, 1)
    since = (t % LOOP) - TRACK["bite"]
    if 0 <= since < 0.7:
        for k in range(6):
            way = np.array([np.cos(2.4 * k), np.sin(2.4 * k) - 0.3, 0.4 * np.sin(1.3 * k)])
            put(TRACK["bite_at"] + way * 0.16 * since ** 0.6, ".", 0.9 * (1 - since / 0.7))


def draw_arms(chars, ink, zbuf, arms, project):
    # every arm is a soft tube: a bright broken rim, a quiet fill that is lighter on the lit side, a pale tip
    line, thick, depth, glow = arms
    rows = chars.shape[0]
    fine = np.linspace(0, line.shape[1] - 1, 90)
    lo, w = fine.astype(int).clip(0, line.shape[1] - 2), None
    w = (fine - lo)[None, :, None]
    line = line[:, lo] * (1 - w) + line[:, lo + 1] * w
    glow = glow[:, lo] * (1 - w[..., 0]) + glow[:, lo + 1] * w[..., 0]
    thick = np.interp(fine, np.arange(len(thick)), thick)
    u = fine / fine[-1]
    sx, sy, shrink = project(line.reshape(-1, 3))
    sx, sy, shrink = [a.reshape(line.shape[:2]) for a in (sx, sy, shrink)]
    rad = thick[None] * shrink
    cx, cy = (np.arange(COLS) + 0.5) * CW, (np.arange(rows) + 0.5) * CH
    for i in np.argsort(-line[:, :, 2].mean(1)):
        c0, c1 = int((sx[i] - rad[i]).min() // CW), int((sx[i] + rad[i]).max() // CW) + 1
        r0, r1 = int((sy[i] - rad[i]).min() // CH), int((sy[i] + rad[i]).max() // CH) + 1
        c0, c1, r0, r1 = max(c0, 0), min(c1, COLS), max(r0, 0), min(r1, rows)
        if c0 >= c1 or r0 >= r1:
            continue
        ox = cx[None, c0:c1, None] - sx[i][None, None, :]
        oy = cy[r0:r1, None, None] - sy[i][None, None, :]
        d = np.sqrt(ox * ox + oy * oy) / rad[i][None, None, :]
        j = d.argmin(-1)
        d = np.take_along_axis(d, j[..., None], -1)[..., 0]
        ox, oy = np.take_along_axis(ox, j[..., None], -1)[..., 0], np.take_along_axis(oy, j[..., None], -1)[..., 0]
        z = line[i, j, 2]
        hit = (d < 1.0) & (z < zbuf[r0:r1, c0:c1])
        if not hit.any():
            continue
        tipness = ease((u[j] - 0.30) / 0.62)
        tone = (STEM * (1 - tipness[..., None]) + TIP * tipness[..., None]) * depth[i]
        lit = np.clip(0.5 - 0.5 * (ox * 0.8 + oy * 0.6) / np.maximum(rad[i][j], 1), 0, 1)     # the lamp is up and to the left
        rim = d > 0.70
        broken = np.sin(j * 0.9 + i * 2.1) > -0.86
        shine = glow[i][j] * (0.55 + 0.45 * depth[i]) * (0.25 + 0.75 * tipness)      # the light gathers towards the tip
        value = 0.14 + 0.24 * lit + 0.42 * tipness ** 2 + 0.25 * shine
        g = np.where(rim, line_glyph(-oy, ox), FILL_G[np.clip((value * 1.25 * len(FILL_G)).astype(int), 0, len(FILL_G) - 1)])
        col = np.where(rim[..., None], tone * (0.50 + 0.38 * lit[..., None] + 0.22 * tipness[..., None]) * np.where(broken, 1.0, 0.45)[..., None],
                       tone * (0.16 + 0.26 * lit[..., None] + 0.5 * tipness[..., None] ** 2))
        col = np.clip(col + GLOW_INK * shine[..., None] * np.where(rim, 0.62, 0.34)[..., None], 0, 1)
        view = (slice(r0, r1), slice(c0, c1))
        chars[view][hit], ink[view][hit], zbuf[view][hit] = g[hit], col[hit], z[hit]


# ---- water and the bottom ----------------------------------------------------------
_w = np.random.default_rng(5)
DOT, MOTE = _w.random((150, 3)), _w.random((46, 4))


def water(t, chars, ink, rows, deep=1.0, slide=(0.0, 0.0)):
    # far specks slide a third as fast as the camera moves, near motes half as fast
    r = ((DOT[:, 1] * rows + 0.18 * t * (0.5 + DOT[:, 2]) + slide[1] * 0.3) % rows).astype(int)
    c = ((DOT[:, 0] * COLS + 0.25 * np.sin(0.4 * t + DOT[:, 2] * 9) - slide[0] * 0.3) % COLS).astype(int)
    chars[r, c] = glyph_id(".")
    ink[r, c] = rgb(64, 84, 112) * (0.5 + 0.5 * DOT[:, 2:3]) * deep
    r = ((MOTE[:, 1] * rows - 0.3 * t * (0.4 + MOTE[:, 2]) + slide[1] * 0.55) % rows).astype(int)
    c = ((MOTE[:, 0] * COLS + 0.8 * np.sin(0.5 * t + MOTE[:, 3] * 20) - slide[0] * 0.55) % COLS).astype(int)
    tw = np.sin(t * (1.0 + 2.0 * MOTE[:, 2]) + MOTE[:, 3] * 40)
    chars[r, c] = np.where(tw > 0.7, glyph_id("*"), glyph_id("+"))
    ink[r, c] = rgb(70, 118, 160) * (0.5 + 0.5 * np.clip(tw + 0.4, 0, 1))[:, None] * deep


def stroke(chars, ink, own, pts, col, rows, glyph=None):
    # a polyline given in pixels, drawn with the slash that fits each piece
    pts = np.asarray(pts, float)
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = int(max(abs(x1 - x0) / CW, abs(y1 - y0) / CH) * 1.6) + 2
        f = np.linspace(0, 1, n)
        c, r = ((x0 + (x1 - x0) * f) // CW).astype(int), ((y0 + (y1 - y0) * f) // CH).astype(int)
        ok = (c >= 0) & (c < COLS) & (r >= 0) & (r < rows)
        chars[r[ok], c[ok]] = line_glyph(x1 - x0, y1 - y0) if glyph is None else glyph_id(glyph)
        ink[r[ok], c[ok]] = col
        own[r[ok], c[ok]] = BACK


_corals = {}


def coral_shape(seed):
    # a branching coral, grown once: every branch forks into two shorter ones.
    # Lengths are in units of the first branch, so the shape never depends on the zoom.
    if seed not in _corals:
        rng = np.random.default_rng(seed)
        twigs, buds = [], []

        def grow(x, y, ang, length, level):
            if level == 0:
                buds.append((x, y, rng.random() < 0.6))
                return
            x1, y1 = x + length * np.sin(ang), y + length * np.cos(ang)
            twigs.append((x, y, x1, y1, level))
            spread = 0.35 + 0.3 * rng.random()
            grow(x1, y1, ang - spread, length * (0.62 + 0.2 * rng.random()), level - 1)
            grow(x1, y1, ang + spread * (0.7 + 0.5 * rng.random()), length * (0.62 + 0.2 * rng.random()), level - 1)
            if rng.random() < 0.3:
                grow(x1, y1, ang + 0.1 * rng.normal(), length * 0.6, level - 1)

        grow(0.0, 0.0, 0.0, 1.0, 5)
        _corals[seed] = (np.array(twigs), np.array(buds))
    return _corals[seed]


def coral(chars, ink, own, rows, x, y, size, col, seed, t=0.0, bend=0.0):
    # draw the grown coral at a place on the screen; it leans a little with the surge, more towards the top
    twigs, buds = coral_shape(seed)
    lean = lambda h: bend * 0.06 * np.sin(W1 * t + 0.7 * seed) * np.clip(h, 0, None) ** 1.5
    for x0, y0, x1, y1, level in twigs:
        stroke(chars, ink, own, [(x + size * (x0 + lean(y0)), y - size * y0), (x + size * (x1 + lean(y1)), y - size * y1)],
               col * (0.55 + 0.1 * (5 - level)), rows)
    for bx, by, round_ in buds:
        c, r = int((x + size * (bx + lean(by))) // CW), int((y - size * by) // CH)
        if 0 <= c < COLS and 0 <= r < rows:
            chars[r, c], ink[r, c], own[r, c] = glyph_id("o" if round_ else "*"), np.minimum(col * 1.5, 1), BACK


# [relief] the bottom the fish swims around: sand, rocks, corals. All of it stays put; the camera moves.
FLOOR = -1.42
ROCKS = [(0.05, 0.42, 1.50, 0.44, 1.10, 0.5),            # the anemone's own rock
         (2.25, 0.80, 0.95, 0.80, 0.85, 1.0), (-3.3, 1.5, 0.8, 0.5, 0.7, 2.0), (1.2, 2.9, 1.4, 0.9, 0.8, 3.0),
         (-1.2, 3.3, 1.1, 0.65, 0.7, 4.0), (4.6, 1.9, 0.9, 0.6, 0.7, 5.0), (-4.9, 0.4, 0.7, 0.45, 0.6, 6.0)]
CORALS = [(-2.25, FLOOR, 0.85, 0.34, rgb(236, 96, 132), 3), (-2.85, FLOOR, 0.45, 0.24, rgb(240, 150, 90), 8),
          (2.60, FLOOR + 0.72, 1.25, 0.27, rgb(80, 200, 200), 5), (1.0, FLOOR, 2.3, 0.30, rgb(180, 110, 220), 12),
          (-0.9, FLOOR + 0.5, 3.4, 0.30, rgb(236, 96, 132), 21), (4.3, FLOOR, 0.9, 0.25, rgb(240, 150, 90), 30)]


def hash01(a, b):
    return np.modf(np.abs(np.sin(a * 127.1 + b * 311.7) * 43758.5453))[0]


def sand(chars, ink, rows, project, cam_x, t=0.0):
    ix, iz = np.meshgrid(np.arange(-34, 35) + int(cam_x / 0.13), np.arange(-12, 42), indexing="ij")
    ix, iz = ix.ravel(), iz.ravel()
    h = hash01(ix, iz)
    keep = h > 0.52
    x, z = ix * 0.13 + 0.09 * hash01(iz, ix), iz * 0.13 + 0.09 * h
    ripple = np.sin(x * 4.2 + 1.6 * np.sin(z * 2.1)) > 0.72
    keep |= ripple & (hash01(ix + 7, iz) > 0.35)
    pts = np.stack([x, FLOOR + 0.03 * np.sin(x * 1.7 + z), z], -1)[keep]
    sx, sy, _ = project(pts)
    c, r = np.floor(sx / CW).astype(int), np.floor(sy / CH).astype(int)
    ok = (c >= 0) & (c < COLS) & (r >= 0) & (r < rows)
    fade = np.clip(1.0 - (pts[:, 2] + 1.5) / 6.5, 0.15, 1.0)
    if FX["shafts"]:                                                # ripples of light run over the sand
        net = np.sin(pts[:, 0] * 5.0 + 1.3 * np.sin(pts[:, 2] * 3.0 + W3 * t)) * np.sin(pts[:, 2] * 4.0 - W2 * t + pts[:, 0])
        fade = fade * (1 + 1.1 * np.clip(net, 0, 1) ** 2)
    chars[r[ok], c[ok]] = np.where(ripple[keep], glyph_id("~"), glyph_id("."))[ok]
    ink[r[ok], c[ok]] = (rgb(168, 140, 98) * np.where(ripple[keep], 0.56, 0.36)[:, None] * fade[:, None])[ok]


def rocks():
    parts = []
    for cx, cz, rx, ry, rz, seed in ROCKS:
        th, ph = [v.ravel() for v in np.meshgrid(np.linspace(0.02, 1.57, 46), np.linspace(0, TAU, 110, endpoint=False), indexing="ij")]
        lump = 1 + 0.10 * np.sin(5 * ph + seed) * np.sin(3 * th + seed) + 0.06 * np.sin(11 * ph + 2 * seed)
        n = np.stack([np.sin(th) * np.cos(ph), np.cos(th), np.sin(th) * np.sin(ph)], -1)
        p = np.array([cx, FLOOR, cz]) + n * lump[:, None] * np.array([rx, ry, rz])
        lit = np.clip(unit(n / np.array([rx, ry, rz])).dot(LIGHT), 0, 1)
        far = np.clip(1.0 - (cz + 1.0) / 6.0, 0.35, 1.0)
        parts.append((p, rgb(104, 116, 150) * (0.20 + 0.50 * lit[:, None]) * far, 0.05 + 0.75 * lit ** 1.5))
    p, col, lum = [np.concatenate([part[i] for part in parts]) for i in range(3)]
    return [p, p, col, lum, np.full(len(p), BACK), np.zeros(len(p), bool)]


def foot():
    # the fleshy body of the anemone that the arms grow from, sitting on its rock
    th, ph = [v.ravel() for v in np.meshgrid(np.linspace(0.02, 1.57, 40), np.linspace(0, TAU, 120, endpoint=False), indexing="ij")]
    n = np.stack([np.sin(th) * np.cos(ph), np.cos(th), np.sin(th) * np.sin(ph)], -1)
    p = np.array(LAYOUT_WEED) + n * MOUND * np.array([1.0, 1.0, 1.0]) - np.array([0.0, 0.06, 0.0])
    lit = np.clip(unit(n / MOUND).dot(LIGHT), 0, 1)
    return [p, p, STEM * (0.14 + 0.30 * lit[:, None]), 0.10 + 0.25 * lit, np.full(len(p), BACK), np.zeros(len(p), bool)]


LAYOUT_WEED = (0.05, -1.02, 0.40)
ROCK_POINTS = [np.concatenate([a, b]) for a, b in zip(rocks(), foot())]
ROCK_G = np.array([glyph_id(c) for c in " . .:.:;:=+"])


# ---- from points to letters to pixels ----------------------------------------------
_font = {}


def font(size):
    if size not in _font:
        override = os.environ.get("ASCII_LAB_FONT")
        if override:
            _font[size] = ImageFont.truetype(override, size)
        else:
            for name in FONT_PATHS:
                try:
                    _font[size] = ImageFont.truetype(name, size)
                    break
                except OSError:
                    continue
            else:
                raise OSError("Set ASCII_LAB_FONT to the path of a monospace TTF or TTC font.")
    return _font[size]


def make_atlas():
    out = np.zeros((96, CH, CW), np.float32)
    f = font(20)
    for i in range(95):
        im = Image.new("L", (CW, CH), 0)
        lift = 5 if chr(32 + i) == "_" else 3        # Make room for the underscore below the baseline.
        ImageDraw.Draw(im).text((0, -lift), chr(32 + i), font=f, fill=255)
        out[i] = np.asarray(im, np.float32) / 255
    return out


LAYOUT = dict(scale=(660, 740), weed=LAYOUT_WEED, mid=(640, 680))


def grid(t, rows):
    look = LAYOUT
    which = 0 if rows == ROWS_CODE else 1
    scale, mid_y = look["scale"][which], look["mid"][which]
    chars = np.zeros((rows, COLS), int)
    ink = np.zeros((rows, COLS, 3))
    owner = np.zeros((rows, COLS), int)
    # [camera] it keeps the fish near the middle, a moment late, leaves room ahead of the nose,
    # and leans in when the fish slows down
    cam_x = cam_y = lead = swing = tilt = 0.0
    aim = np.zeros(3)
    st = swimmer(t)
    cam_x, cam_y, lead = st["cam_x"], 0.62 * st["cam_y"] - 0.10, 0.11 * st["lead"]
    scale = scale * st["zoom"]
    if FX["orbit"]:
        # [orbit] the camera does not slide along a rail: it swings round the anemone on an arc
        # and keeps facing it, and it leans down or up towards it as the fish climbs or sinks
        swing, tilt = ORBIT * (cam_x - PIVOT[0]), -TILT * (cam_y - 0.15)
        aim = np.array([cam_x + lead, cam_y, st["cam_z"]])

    def view(v):
        # the world as the camera sees it: turned about the anemone
        if swing == 0.0 and tilt == 0.0:
            return v
        return rot_x(rot_y(v - PIVOT, swing), tilt) + PIVOT

    centre = view(aim[None])[0] if (swing or tilt) else np.array([cam_x + lead, cam_y, 0.0])
    near = view(np.array([[cam_x, cam_y, st["cam_z"]]]))[0, 2]      # how close the fish has come to the lens
    scale = scale * ((CAM_D + near) / CAM_D) ** 0.85              # pull back by nearly as much, so it does not loom

    def project(v):
        shrink = scale * CAM_D / (CAM_D + v[:, 2])
        return W / 2 + shrink * (v[:, 0] - centre[0]), mid_y - shrink * (v[:, 1] - centre[1]), shrink

    water(t, chars, ink, rows, slide=(cam_x * scale / CW, cam_y * scale / CH))
    parts = fish(t)
    sand(chars, ink, rows, lambda v: project(view(v)), cam_x, t)
    for x, y, z, size, tone, seed in CORALS:
        bx, by, shrink = project(view(np.array([[x, y, z]])))
        if -300 < bx[0] < W + 300:
            coral(chars, ink, owner, rows, bx[0], by[0], size * shrink[0], tone * np.clip(0.75 - 0.12 * z, 0.3, 0.7), seed, t, bend=1.0)
    parts = [np.concatenate([a, b]) for a, b in zip(parts, ROCK_POINTS)]
    p, q, col, lum, kind, ray = parts
    p, q = view(p), view(q)

    sx, sy, _ = project(p)
    qx, qy, _ = project(q)
    g = np.where(ray, line_glyph(qx - sx, qy - sy), RAMP_G[np.clip(((1 - lum) ** 1.3 * (len(RAMP) - 1)).astype(int), 0, len(RAMP) - 1)])
    g = np.where(kind == BACK, ROCK_G[np.clip((lum * len(ROCK_G)).astype(int), 0, len(ROCK_G) - 1)], g)   # stone is quiet: dots, lighter on top
    c, r = np.floor(sx / CW).astype(int), np.floor(sy / CH).astype(int)
    ok = (c >= 0) & (c < COLS) & (r >= 0) & (r < rows)
    order = np.argsort(-p[ok, 2], kind="stable")       # far first, so the nearest wins
    c, r, g, col, kind, depth = c[ok][order], r[ok][order], g[ok][order], col[ok][order], kind[ok][order], p[ok, 2][order]
    zbuf = np.full((rows, COLS), 99.0)
    chars[r, c], ink[r, c], owner[r, c], zbuf[r, c] = g, col, kind, depth

    # outline pass: where the fish's flank meets water, draw the edge in its own tone
    solid = np.pad(owner == FISH, 1)
    up, down, left, right = ~solid[:-2, 1:-1], ~solid[2:, 1:-1], ~solid[1:-1, :-2], ~solid[1:-1, 2:]
    here = owner == FISH
    edge = np.full((rows, COLS), -1)
    edge[here & up & (owner != FIN)] = glyph_id("-")
    edge[here & down] = glyph_id("_")
    edge[here & left] = glyph_id("(")
    edge[here & left & up] = glyph_id("/")
    edge[here & left & down] = glyph_id("\\")
    edge[here & right & up] = glyph_id("\\")
    edge[here & right & down] = glyph_id("/")
    above_fin = np.pad(owner == FIN, 1)
    touching = above_fin[:-2, 1:-1] | above_fin[2:, 1:-1] | above_fin[1:-1, :-2] | above_fin[1:-1, 2:]
    m = (edge >= 0) & ~touching & (np.random.default_rng(int(t * 3)).random((rows, COLS)) > 0.12)   # a soft, broken line
    chars[m] = edge[m]
    ink[m] = ink[m] * 0.78 + 0.1
    if "reef" not in look:
        look["reef"] = Anemone(look["weed"])
    arms = look["reef"].at(t)
    draw_arms(chars, ink, zbuf, (view(arms[0]),) + arms[1:], project)
    if FX["plankton"]:
        draw_motes(chars, ink, zbuf, look["reef"], t, lambda v: project(view(v)))
    if FX["shafts"]:
        shafts(chars, ink, t, scale, cam_x + lead + 1.6 * swing, mid_y)
    if FX["prey"]:
        draw_prey(chars, ink, zbuf, st, t, lambda v: project(view(v)))
    return chars, ink


GLOW_NEAR, GLOW_FAR, GLOW_RAYS, STREAK = 0.6, 0.5, 0.10, 90
ATLAS = None


def paint(chars, ink):
    global ATLAS
    if ATLAS is None:
        ATLAS = make_atlas()
    rows = chars.shape[0]
    hh = rows * CH
    mask = ATLAS[chars].transpose(0, 2, 1, 3).reshape(hh, W)
    col = np.repeat(np.repeat(ink.astype(np.float32), CH, 0), CW, 1)
    img = mask[..., None] * col
    small = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).resize((W // 4, hh // 4), Image.BOX)
    near = np.asarray(small.filter(ImageFilter.GaussianBlur(2.2)).resize((W, hh), Image.BILINEAR), np.float32)
    far = np.asarray(small.filter(ImageFilter.GaussianBlur(9)).resize((W, hh), Image.BILINEAR), np.float32)
    run = np.cumsum(np.pad(img, ((STREAK, STREAK), (0, 0), (0, 0))), 0)
    rays = (run[2 * STREAK:] - run[:-2 * STREAK]) / (2 * STREAK)
    return np.clip(img * 255 + GLOW_NEAR * near + GLOW_FAR * far + GLOW_RAYS * 255 * rays, 0, 255).astype(np.uint8)


with open(__file__, encoding="utf-8") as source:
    SOURCE = source.read().splitlines()


SECTIONS = ["# [swimmer]", "# [body]", "    # [pectorals]", "# [anemone]"]


def panel(t, rows):
    # the bottom of the frame shows this very file, opened at the part that drives the picture right now
    hh = H - rows * CH
    im = Image.new("RGB", (W, hh), (8, 10, 14))
    d = ImageDraw.Draw(im)
    d.line([(0, 0), (W, 0)], fill=(40, 48, 60))
    mark = SECTIONS[swimmer(t)["section"]]
    start = next(i for i, line in enumerate(SOURCE) if line.startswith(mark))
    for j in range(hh // 30):
        n = start + j
        text = SOURCE[n][:66] if n < len(SOURCE) else ""
        d.text((14, 14 + 30 * j), f"{n + 1:4d}", font=font(21), fill=(70, 80, 96))
        tone = (110, 150, 120) if text.strip().startswith("#") else (176, 186, 204)
        d.text((88, 14 + 30 * j), text, font=font(21), fill=(150, 220, 170) if j == 0 else tone)
    return im


def frame(t, code=True):
    rows = ROWS_CODE if code else ROWS_FULL
    chars, ink = grid(t, rows)
    im = Image.new("RGB", (W, H), (0, 0, 0))
    im.paste(Image.fromarray(paint(chars, ink)), (0, 0))
    d = ImageDraw.Draw(im)
    st = swimmer(t)
    note = f"tail {st['hz']:.1f} Hz   speed {st['speed']:.2f}   chars {int((chars > 0).sum())}"
    d.text((96, 130), note, font=font(20), fill=(120, 132, 150))
    d.text((W - 96 - d.textlength(HANDLE, font=font(20)), 130), HANDLE, font=font(20), fill=(120, 132, 150))
    if code:
        im.paste(panel(t, rows), (0, rows * CH))
    return im


def mp4(path, code, dur):
    ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                           "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "16", path], stdin=subprocess.PIPE)
    for i in range(int(dur * FPS)):
        ff.stdin.write(frame(i / FPS, code).tobytes())
    ff.stdin.close()
    if ff.wait():
        raise subprocess.CalledProcessError(ff.returncode, ff.args)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="format", required=True)
    png = commands.add_parser("png", help="Render one frame")
    png.add_argument("time", type=float, help="Time in seconds")
    png.add_argument("output")
    video = commands.add_parser("mp4", help="Render a silent video with FFmpeg")
    video.add_argument("output")
    video.add_argument("--duration", type=float, default=LOOP,
                       help="Duration in seconds (default: one loop)")
    for command in (png, video):
        command.add_argument("--no-code", action="store_true", help="Hide the code panel")
    args = parser.parse_args()
    if args.format == "png":
        frame(args.time, code=not args.no_code).save(args.output)
    else:
        if not np.isfinite(args.duration) or args.duration < 1 / FPS:
            video.error(f"duration must be at least {1 / FPS:g} seconds")
        mp4(args.output, code=not args.no_code, dur=args.duration)


if __name__ == "__main__":
    main()
