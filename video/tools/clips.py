"""Cut, grade and upscale the promo clips to 1920x1080 @ 30fps.

Clips marked with a tracking file get FieldDay-style overlays drawn from real
MediaPipe output (pose skeletons + ball ring and trail), frame by frame.
Usage: python3 clips.py <videos_dir> <track_dir> <out_dir> [name ...]
"""
import gzip
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

VID, TRACK, OUT = (Path(a) for a in sys.argv[1:4])
ONLY = set(sys.argv[4:])
W, H, FPS = 1920, 1080, 30
GRADE = 'eq=contrast=1.06:saturation=1.12:gamma=0.98'
COLORS = [(255, 230, 0), (255, 77, 61), (43, 217, 107)]  # yellow, coral, green
PLAYER = {'04_throw_1': 0, '05_jump': 0, '04_throw_2': 1}  # one player: their own colour
BONES = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16), (11, 23), (12, 24), (23, 24),
         (23, 25), (25, 27), (24, 26), (26, 28), (27, 31), (28, 32), (27, 29), (28, 30)]

# name: (source clip, segments [(in, out)], speed, tracked?)
EDL = {
    'a_opening': ('01_opening', [(0.0, 8.2)], 1.0, False),
    'c_phone_down': ('02_phone_down', [(2.0, 10.0)], 1.0, False),
    'd_say': ('03_say_a_game', [(0.4, 5.0)], 1.0, False),
    'd_leave': ('03_say_a_game', [(7.9, 10.0)], 1.0, False),
    'e_fieldcheck': ('02_phone_down', [(7.4, 10.0)], 1.0, False),
    'e_throw1': ('04_throw_1', [(1.5, 6.5)], 1.0, True),
    'e_throw2': ('04_throw_2', [(2.0, 6.5)], 1.0, True),
    'e_jump': ('05_jump', [(2.0, 8.0)], 1.0, True),
    'f_battle_a': ('06_battle', [(0.0, 5.0)], 1.0, True),
    'f_battle_b': ('06_battle', [(7.6, 9.1)], 1.0, False),
    'f_boss_a': ('07_boss_raid', [(0.0, 5.5)], 1.0, True),
    'f_boss_freeze': ('07_boss_raid', [(6.0, 7.5)], 1.0, False),
    'f_boss_b': ('07_boss_raid', [(7.5, 10.0)], 0.6, True),
    'g_team': ('08_quest_team', [(0.0, 4.0)], 1.0, False),
    'g_tree_run': ('08_quest_tree', [(0.0, 3.0)], 1.0, False),
    'g_tree_touch': ('08_quest_tree', [(5.5, 7.5)], 1.0, False),
    'g_red_face': ('08_quest_red', [(1.5, 3.5)], 1.0, False),
    'g_red_leaf': ('08_quest_red', [(3.9, 10.0)], 1.0, False),
    'h_colombo_full': ('09_place_colombo', [(0.0, 2.5)], 1.0, False),
    'h_kandy_full': ('09_place_kandy', [(0.0, 1.5)], 0.75, False),
    'h_colombo_split': ('09_place_colombo', [(2.5, 10.0)], 1.0, False),
    'h_kandy_split': ('09_place_kandy', [(1.5, 3.5), (7.0, 10.0)], 0.667, False),
    'j_ending': ('10_ending', [(0.0, 10.0)], 1.0, False),
}


def src(name):
    return next(VID.glob(f'{name}.mp4*'))


def ffmpeg_cut(out, clip, segs, speed):
    inputs, parts = [], []
    for i, (a, b) in enumerate(segs):
        inputs += ['-ss', f'{a}', '-t', f'{b - a}', '-i', str(src(clip))]
        parts.append(f'[{i}:v]setpts=(PTS-STARTPTS)/{speed}[v{i}]')
    concat = ''.join(f'[v{i}]' for i in range(len(segs)))
    filt = ';'.join(parts) + f';{concat}concat=n={len(segs)}:v=1:a=0,' + \
        f'scale={W}:{H}:flags=lanczos,{GRADE},fps={FPS},format=yuv420p[out]'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', filt, '-map', '[out]',
                    '-an', '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-movflags', '+faststart', str(out)], check=True)


class Tracks:
    """Keeps the same colour on the same person across frames (nearest hip centre)."""

    def __init__(self):
        self.last = {}  # id -> (centre, smoothed landmarks)

    def update(self, poses):
        out = {}
        used = set()
        for p in poses:
            lm = np.array(p, dtype=float) * [1.5, 1.5, 1]
            c = lm[[23, 24], :2].mean(0)
            best, bd = None, 1e9
            for k, (pc, _) in self.last.items():
                d = np.linalg.norm(pc - c)
                if k not in used and d < bd and d < 250:
                    best, bd = k, d
            if best is None:
                best = next(k for k in range(10) if k not in self.last and k not in used and k not in out)
            used.add(best)
            prev = self.last.get(best, (None, None))[1]
            sm = lm if prev is None else prev * 0.45 + lm * 0.55
            sm[:, 2] = lm[:, 2]
            out[best] = (c, sm)
        self.last = out
        return out


def draw_overlay(img, people, ball, trail, slots, fixed=None):
    d = ImageDraw.Draw(img, 'RGBA')
    for _, (c, lm) in people.items():
        if lm[[11, 12], 1].mean() > lm[[23, 24], 1].mean() - 40:
            continue  # shoulders not above hips: a broken pose
        col = COLORS[fixed] if fixed is not None else COLORS[min(slots - 1, int(c[0] / (W / slots)))]  # same place, same colour
        for a, b in BONES:
            if lm[a, 2] > 0.5 and lm[b, 2] > 0.5:
                d.line([tuple(lm[a, :2]), tuple(lm[b, :2])], fill=(*col, 235), width=7)
        for j in (0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28):
            if lm[j, 2] > 0.5:
                x, y = lm[j, :2]
                r = 11 if j == 0 else 8
                d.ellipse([x - r, y - r, x + r, y + r], fill=(11, 28, 61, 255), outline=(*col, 255), width=4)
    for i, (x, y) in enumerate(trail):
        a = int(60 + 160 * (i + 1) / max(1, len(trail)))
        r = 4 + 6 * (i + 1) / max(1, len(trail))
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 230, 0, a))
    if ball is not None:
        x, y, r = ball
        d.ellipse([x - r - 10, y - r - 10, x + r + 10, y + r + 10], outline=(255, 230, 0, 255), width=6)
        d.line([x - r - 26, y, x - r - 12, y], fill=(255, 230, 0, 255), width=5)
        d.line([x + r + 12, y, x + r + 26, y], fill=(255, 230, 0, 255), width=5)
    return img


def orange_ball(img, near, people):
    """Fallback when the detector misses: the promo ball is bright orange."""
    a = np.asarray(img.resize((W // 4, H // 4)), dtype=np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = (r > 170) & (g > 40) & (g < 130) & (b < 90) & (r - g > 90)
    if near is not None:
        ys, xs = np.mgrid[0:m.shape[0], 0:m.shape[1]]
        m &= np.hypot(xs * 4 - near[0], ys * 4 - near[1]) < 300
    n = int(m.sum())
    if n < 12 or n > 1500:
        return None
    ys, xs = np.nonzero(m)
    if np.ptp(xs) > 60 or np.ptp(ys) > 60:
        return None
    cx, cy = xs.mean() * 4 + 2, ys.mean() * 4 + 2
    for _, lm in people.values():  # not the shirt
        t = lm[[11, 12, 23, 24], :2]
        if t[:, 0].min() - 30 < cx < t[:, 0].max() + 30 and t[:, 1].min() - 20 < cy < t[:, 1].max() + 20:
            return None
    return (cx, cy, max(18.0, np.sqrt(n / np.pi) * 4))


def frame(clip, i):
    """Source frame i (24 fps, 1280x720), cached as JPEG next to the tracking data."""
    d = TRACK / 'frames' / clip
    if not d.exists():
        d.mkdir(parents=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(src(clip)), '-q:v', '3', str(d / '%04d.jpg')], check=True)
    return Image.open(d / f'{i + 1:04d}.jpg')


def tracked_cut(out, clip, segs, speed):
    gz = TRACK / f'out_{clip}.json.gz'
    data = json.loads(gzip.open(gz).read() if gz.exists() else (TRACK / f'out_{clip}.json').read_text())
    frames = []
    for a, b in segs:
        frames += list(range(int(round(a * 24)), min(240, int(round(b * 24)))))
    tracks = Tracks()
    trail = []
    last_ball, miss = None, 99
    rate = 24 * speed
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}',
                            '-r', f'{rate}', '-i', '-', '-vf', f'{GRADE},fps={FPS},format=yuv420p',
                            '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-movflags', '+faststart', str(out)],
                           stdin=subprocess.PIPE)
    for fi in frames:
        f = data[fi]
        img = frame(clip, fi).convert('RGB').resize((W, H), Image.LANCZOS)
        people = tracks.update(f['poses'])
        balls = [o for o in f['objects'] if o['label'] == 'sports ball' and o['score'] >= 0.25]
        ball = None
        if balls:
            o = max(balls, key=lambda o: o['score'])
            x, y, w, h = (v * 1.5 for v in o['box'])
            cx, cy, r = x + w / 2, y + h / 2, max(w, h) / 2
            if last_ball is None or miss > 6 or np.hypot(cx - last_ball[0], cy - last_ball[1]) < 260:
                ball, last_ball, miss = (cx, cy, r), (cx, cy, r), 0
        if ball is None and 'boss' not in clip:
            ball = orange_ball(img, last_ball if miss < 12 else None, people)
            if ball is not None:
                last_ball, miss = ball, 0
        if ball is None:
            miss += 1
            if last_ball is not None and miss <= 2:
                ball = last_ball
        if ball is not None and miss == 0:
            trail.append(ball[:2])
        elif miss > 4 and trail:
            trail.pop(0)
        trail = trail[-12:]
        enc.stdin.write(np.asarray(draw_overlay(img, people, ball, trail[:-1], 3 if 'boss' in clip else 2, PLAYER.get(clip))).tobytes())
    enc.stdin.close()
    enc.wait()


for name, (clip, segs, speed, tracked) in EDL.items():
    if ONLY and name not in ONLY:
        continue
    out = OUT / f'{name}.mp4'
    if tracked and any((TRACK / f'out_{clip}.json{x}').exists() for x in ('', '.gz')):
        tracked_cut(out, clip, segs, speed)
    else:
        ffmpeg_cut(out, clip, segs, speed)
    dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(out)],
                         capture_output=True, text=True).stdout.strip()
    print(f'{name:18s} {dur}s{"  (tracked)" if tracked else ""}')
