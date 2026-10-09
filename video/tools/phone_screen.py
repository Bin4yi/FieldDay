"""Put a real FieldDay screenshot into the green phone screen of 11_phone_hand.

Finds the green screen in every frame, fits its four corners, warps the
screenshot into place, and keys out the green.
Usage: python3 phone_screen.py <clip.mp4> <screenshot.png> <out.mp4> <in_s> <out_s> [speed]
"""
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

clip, shot, out = sys.argv[1:4]
a, b = float(sys.argv[4]), float(sys.argv[5])
SPEED = float(sys.argv[6]) if len(sys.argv) > 6 else 1.0
W, H, SW, SH = 1920, 1080, 1280, 720
screen = Image.open(shot).convert('RGB')

dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-ss', str(a), '-t', str(b - a), '-i', clip,
                        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(24 * SPEED),
                        '-i', '-', '-vf', 'eq=contrast=1.06:saturation=1.12:gamma=0.98,fps=30,format=yuv420p',
                        '-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-movflags', '+faststart', out],
                       stdin=subprocess.PIPE)


def coeffs(dst, src):
    """PIL PERSPECTIVE coefficients mapping output (dst quad) to input (src quad)."""
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    return np.linalg.solve(np.array(m, float), np.array(src, float).reshape(8))


prev = None
n = 0
while True:
    raw = dec.stdout.read(SW * SH * 3)
    if len(raw) < SW * SH * 3:
        break
    f = np.frombuffer(raw, np.uint8).reshape(SH, SW, 3)
    img = Image.fromarray(f).resize((W, H), Image.LANCZOS)
    a_ = np.asarray(img).astype(np.int16)
    r, g, bl = a_[..., 0], a_[..., 1], a_[..., 2]
    green = (g > 110) & (g > r + 40) & (g > bl + 40)
    if prev is not None:  # near the last screen, glare makes the green pale: loosen
        x0, y0 = prev.min(0) - 60
        x1, y1 = prev.max(0) + 60
        near = np.zeros_like(green)
        near[int(max(0, y0)):int(y1), int(max(0, x0)):int(x1)] = True
        green = near & (g > r + 12) & (g > bl + 12)
    lab, k = ndimage.label(green)
    if k:
        sizes = ndimage.sum(green, lab, range(1, k + 1))
        big = lab == (np.argmax(sizes) + 1)
        big = ndimage.binary_fill_holes(big)
        ys, xs = np.nonzero(big)
        s1, s2 = xs + ys, xs - ys
        quad = np.array([[xs[s1.argmin()], ys[s1.argmin()]], [xs[s2.argmax()], ys[s2.argmax()]],
                         [xs[s1.argmax()], ys[s1.argmax()]], [xs[s2.argmin()], ys[s2.argmin()]]], float)
        prev = quad if prev is None else prev * 0.5 + quad * 0.5
        warped = screen.transform((W, H), Image.PERSPECTIVE,
                                  tuple(coeffs(prev, [(0, 0), (screen.width, 0), (screen.width, screen.height), (0, screen.height)])),
                                  Image.BICUBIC)
        # matte: green pixels (grown a little, softened) show the screenshot
        poly = Image.new('L', (W, H), 0)
        ImageDraw.Draw(poly).polygon([tuple(p) for p in prev], fill=255)
        skin = (r > g + 12) & (r > bl + 25) & (r > 90)
        matte = (np.asarray(poly) > 0) & ~ndimage.binary_dilation(skin, iterations=2)
        m = Image.fromarray((matte * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5))
        img = Image.composite(warped, img, m)
        # despill: pull leftover green fringe toward neutral
        o = np.asarray(img).astype(np.int16)
        spill = o[..., 1] > np.maximum(o[..., 0], o[..., 2]) + 30
        o[spill, 1] = np.maximum(o[spill, 0], o[spill, 2]) + 30
        img = Image.fromarray(o.clip(0, 255).astype(np.uint8))
    enc.stdin.write(np.asarray(img).tobytes())
    n += 1
enc.stdin.close()
enc.wait()
print('frames', n)
