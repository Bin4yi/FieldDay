# Generates every voiceover line with Kokoro (open model, runs locally).
# Usage: python3 tools/vo.py <kokoro.onnx> <voices.bin> <out_dir>
import json, sys
import soundfile as sf
from kokoro_onnx import Kokoro

LINES = [
    ("n01", "af_heart", 0.98, "Every great game starts the same way. A field. A ball. And your friends."),
    ("n02", "af_heart", 0.95, "Not a screen."),
    ("n03", "af_heart", 0.95, "Meet FieldDay."),
    ("n04", "af_heart", 0.98, "Say any game. Play it outside. Your phone is the referee."),
    ("n05", "af_heart", 1.0, "Just say what you want to play."),
    ("n06", "af_heart", 1.0, "FieldDay designs the game, checks that it's safe, and reads you the rules."),
    ("n07", "af_heart", 0.98, "Then put the phone down."),
    ("n08", "af_heart", 1.0, "It watches every throw. Every jump. And measures it."),
    ("n09", "af_heart", 1.02, "Turn battles. Team battles. Chaos mode."),
    ("n10", "af_heart", 1.0, "Or team up, and take down a boss."),
    ("n11", "af_heart", 1.0, "Quests send you across the park. Race to the biggest tree. Find something red."),
    ("n12", "af_heart", 1.0, "Your phone checks the photo, right on the device."),
    ("n13", "af_heart", 1.0, "Challenge friends in another city, live. Only the score travels. Your video never leaves your phone."),
    ("n14", "af_heart", 0.98, "No signal? No problem. The brain runs right on your phone."),
    ("n15", "af_heart", 0.95, "You played thirty four minutes."),
    ("n16", "af_heart", 0.92, "Screen time. Four percent."),
    ("n17", "af_heart", 0.92, "FieldDay. Go play."),
    ("r01", "am_fenrir", 1.12, "Two point four metres! Massive!"),
    ("r02", "am_fenrir", 1.12, "New personal best!"),
    ("r03", "am_fenrir", 1.15, "Everybody... freeze!"),
    ("r04", "am_fenrir", 1.1, "Photo check passed!"),
]

k = Kokoro(sys.argv[1], sys.argv[2])
out = sys.argv[3]
meta = {}
for lid, voice, speed, text in LINES:
    samples, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
    path = f"{out}/{lid}.wav"
    sf.write(path, samples, sr)
    meta[lid] = {"text": text, "voice": voice, "duration": round(len(samples) / sr, 3)}
    print(lid, meta[lid]["duration"], text)
json.dump(meta, open(f"{out}/vo.json", "w"), indent=1)
