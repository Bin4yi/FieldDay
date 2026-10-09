"""FieldDay promo music bed, composed in code (numpy). 120 BPM, C major, C-G-Am-F.

Sections (seconds): intro 0-8, hush 8-10, build 10-18, drop 18-52, battle 52-70,
groove 70-100, breakdown 100-112, swell 112-122, end hit 122, tail to 132.
Usage: python3 music.py out.wav
"""
import sys
import numpy as np
import soundfile as sf

SR = 44100
DUR = 132.0
BEAT = 0.5
N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N)
R = np.zeros(N)


def add(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i : i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def env(n, a=0.005, r=0.2):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)
    return e


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 30)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.tanh(2.2 * np.sin(ph) * np.exp(-t * 7))


def clap():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # crude band-pass: difference of smoothed
    k1 = np.convolve(noise, np.ones(4) / 4, 'same')
    k2 = np.convolve(noise, np.ones(30) / 30, 'same')
    bp = k1 - k2
    e = np.exp(-t * 18) + 0.6 * np.exp(-((t - 0.012) ** 2) / 1e-5) + 0.5 * np.exp(-((t - 0.024) ** 2) / 1e-5)
    return bp * e * 0.9


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    hp = noise - np.convolve(noise, np.ones(3) / 3, 'same')
    return hp * np.exp(-t * (12 if open_ else 70)) * 0.35


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0, detune):
        ph = (t * freq * (1 + d)) % 1.0
        out += 2 * ph - 1
    return out / 3


def lowpass(x, cutoff):
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.zeros_like(x)
    acc = 0.0
    # vectorised one-pole via lfilter-like loop in chunks
    from scipy.signal import lfilter  # noqa
    return lfilter([1 - a], [1, -a], x)


try:
    from scipy.signal import lfilter
except ImportError:  # pragma: no cover
    lfilter = None

CHORDS = [  # root, triad (midi)
    (36, [60, 64, 67]),  # C
    (43, [59, 62, 67]),  # G
    (45, [60, 64, 69]),  # Am
    (41, [60, 65, 69]),  # F
]


def bar_chord(b):
    return CHORDS[b % 4]


def pad(b, t0, length, cutoff=1800, gain=0.18):
    n = int(length * SR)
    _, notes = bar_chord(b)
    sig = sum(saw(midi(m), n, 0.004) for m in notes + [notes[0] + 12]) / 4
    sig = lowpass(sig, cutoff)
    t = np.arange(n) / SR
    e = np.minimum(1, t / 0.25) * np.minimum(1, (length - t) / 0.3).clip(0, 1)
    add(sig * e, t0, gain, -0.3)
    add(sig * e, t0 + 0.012, gain, 0.3)


def pluck(m, t0, gain=0.12, pan=0.0):
    n = int(0.4 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * midi(m) * t) + 0.4 * np.sin(4 * np.pi * midi(m) * t) * np.exp(-t * 20)
    add(s * env(n, 0.002, 0.12), t0, gain, pan)


def bass(b, t0, beats=4, gain=0.32):
    root, _ = bar_chord(b)
    for k in range(beats * 2):  # eighth-note pulse, off-beat accent
        n = int(0.24 * SR)
        f = midi(root)
        s = lowpass(saw(f, n), 500 + 400 * (k % 2))
        s += 0.6 * np.sin(2 * np.pi * f * np.arange(n) / SR)
        add(np.tanh(1.5 * s) * env(n, 0.003, 0.16), t0 + k * BEAT / 2, gain * (1.0 if k % 2 else 0.7))


def riser(t0, length, gain=0.25):
    n = int(length * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n)
    # sweep cutoff upward
    seg = int(0.05 * SR)
    for i in range(0, n, seg):
        c = 300 + 9000 * (i / n) ** 2
        out[i : i + seg] = lowpass(noise[max(0, i - 200) : i + seg], c)[-len(out[i : i + seg]) :]
    add(out * (t / length) ** 2, t0, gain)


def impact(t0, gain=0.9):
    n = int(2.5 * SR)
    t = np.arange(n) / SR
    f = 38 + 90 * np.exp(-t * 12)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.2)
    noise = lowpass(rng.standard_normal(n), 2500) * np.exp(-t * 3)
    add(np.tanh(1.6 * boom) + 0.5 * noise, t0, gain)


def drums(t0, t1, hats=True, claps=True, kick_every=1, openhat=False):
    t = t0
    i = 0
    while t < t1 - 1e-6:
        if i % kick_every == 0:
            add(kick(), t, 0.85)
        if claps and i % 2 == 1:
            add(clap(), t, 0.5, 0.05)
        if hats:
            add(hat(), t + BEAT / 2, 0.55, 0.35)
            add(hat(), t + BEAT / 4, 0.25, -0.35)
            add(hat(), t + 3 * BEAT / 4, 0.25, -0.35)
        if openhat and i % 4 == 3:
            add(hat(True), t + BEAT / 2, 0.4, 0.2)
        t += BEAT
        i += 1


def arp(t0, t1, gain=0.1, octave=12):
    t = t0
    step = BEAT / 2
    k = 0
    while t < t1 - 1e-6:
        b = int(t // 2)
        _, notes = bar_chord(b)
        seq = [notes[0], notes[1], notes[2], notes[1] + 12 - 12, notes[2], notes[0] + 12, notes[2], notes[1]]
        pluck(seq[k % 8] + octave, t, gain, 0.4 if k % 2 else -0.4)
        t += step
        k += 1


# --- arrangement ---
for b in range(0, 73):  # bars of 2s
    t0 = b * 2.0
    if t0 >= 122:
        break
    if 8 <= t0 < 10:
        continue  # hush: "Not a screen."
    if t0 < 8:
        pad(b, t0, 2.05, cutoff=1100, gain=0.45)
    elif t0 < 18:
        pad(b, t0, 2.05, cutoff=1100 + (t0 - 10) * 150, gain=0.4)
    elif 100 <= t0 < 112:
        pad(b, t0, 2.05, cutoff=1000, gain=0.5)
    else:
        pad(b, t0, 2.05, cutoff=2400, gain=0.15)

# intro plucks
arp(0.0, 8.0, gain=0.2)
add(np.zeros(1), 0)
# build 10-18: hats + kick on 1, riser
arp(10.0, 18.0, gain=0.16)
drums(12.0, 16.0, hats=True, claps=False, kick_every=2)
drums(16.0, 17.5, hats=True, claps=True, kick_every=1)
riser(14.0, 4.0, 0.3)
# drop 18-52
impact(18.0, 0.7)
drums(18.0, 52.0, openhat=True)
for b in range(9, 26):
    bass(b, b * 2.0)
arp(18.0, 52.0, gain=0.08)
# battle 52-70: more energy, double-time hats
impact(52.0, 0.5)
drums(52.0, 70.0, openhat=True)
drums(52.0, 70.0, hats=True, claps=False, kick_every=99)
for b in range(26, 35):
    bass(b, b * 2.0, gain=0.36)
arp(52.0, 70.0, gain=0.1, octave=24)
# groove 70-100
drums(70.0, 100.0, openhat=False)
for b in range(35, 50):
    bass(b, b * 2.0, gain=0.3)
arp(70.0, 100.0, gain=0.07)
riser(96.0, 4.0, 0.15)
# breakdown 100-112: pad + slow plucks only
for k in range(12):
    b = int((100 + k) // 2)
    _, notes = bar_chord(b)
    pluck(notes[k % 3] + 12, 100 + k, 0.22, 0.2 if k % 2 else -0.2)
riser(108.0, 4.0, 0.3)
# swell 112-122
impact(112.0, 0.7)
drums(112.0, 122.0, openhat=True)
for b in range(56, 61):
    bass(b, b * 2.0, gain=0.36)
arp(112.0, 122.0, gain=0.1, octave=24)
# end hit + tail
impact(122.0, 1.0)
n = int(10 * SR)
tt = np.arange(n) / SR
tail = sum(saw(midi(m), n, 0.004) for m in [48, 60, 64, 67, 72]) / 5
tail = lowpass(tail, 1200) * np.exp(-tt / 4) * np.minimum(1, tt / 0.05)
add(tail, 122.0, 0.35, -0.2)
add(tail, 122.015, 0.35, 0.2)

# simple stereo reverb-ish: feedback delays
for d, g in ((0.031, 0.25), (0.047, 0.2), (0.073, 0.15), (0.25, 0.12)):
    k = int(d * SR)
    L[k:] += R[:-k] * g
    R[k:] += L[:-k] * g

mix = np.stack([L, R], 1)
mix = np.tanh(mix * 1.2)
fade = np.ones(N)
fo = int(3 * SR)
fade[-fo:] = np.linspace(1, 0, fo)
mix *= fade[:, None]
mix /= np.abs(mix).max() / 0.89
sf.write(sys.argv[1], mix.astype(np.float32), SR, subtype='PCM_16')
print('wrote', sys.argv[1], round(DUR, 1), 's')
