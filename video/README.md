# FieldDay promo video

A 2:12 promo for YouTube (1920×1080, 30 fps), built with [HyperFrames](https://hyperframes.heygen.com)
from the clips in `/videos`.

- Final file: `fieldday-promo/renders/fieldday-promo-youtube.mp4` (H.264 + AAC, loudness -14 LUFS for YouTube)
- Composition: `fieldday-promo/index.html` (one file, one GSAP timeline)
- Plan: `fieldday-promo/BRIEF.md`, `fieldday-promo/STORYBOARD.md`

## What is real in the video

- **Footage**: the AI-generated clips in `/videos` (cut, graded, upscaled from 1280×720).
- **Body and ball tracking**: real MediaPipe output. Every frame of the throw, jump, battle and Boss Raid
  clips went through Pose Landmarker (heavy) and the object detector (EfficientDet-Lite2) in headless
  Chromium (`tracking/track.html`, `tracking/track.mjs`). The skeletons and ball rings are drawn from that
  data (`tools/clips.py`). Raw results: `tracking/out_*.json.gz`.
- **Numbers**: Kavin's throw (2.1 m) and Nethmi's jump (0.70 m) are measured from the tracking data, using
  body height as the scale. In Nethmi's first throw the camera tilts up and the ball leaves the frame, so
  that height cannot be measured; the 2.4 m on screen is the value the voice-over says.
- **App screens**: real screenshots of the FieldDay PWA (Playwright, Pixel 7 size). The offline home screen
  is put into the green-screen phone clip frame by frame (`tools/phone_screen.py`).
- Some overlays are motion graphics in the app's style (Field Check list, boss HP bar, live scoreboard,
  quest card, airplane toggle). They show real features, but they are not screen recordings.

## Sound

- **Voice-over**: Kokoro TTS (82M, Apache-2.0) through `kokoro-onnx`, voices `af_heart` (narrator) and
  `am_fenrir` (referee). Made offline with `tools/vo.py`.
- **Music**: composed in code with numpy (`tools/music.py`): 120 BPM, C–G–Am–F, sections cut to the edit.
  The bed is carved under the voice with HyperFrames' voice-over carve.
- **Sound effects**: the free sound effects bundled with HyperFrames.

## Rebuild

```bash
# 1. clips (needs ffmpeg, python3 with numpy, scipy, pillow)
python3 video/tools/clips.py videos video/tracking video/fieldday-promo/assets/clips
python3 video/tools/phone_screen.py videos/11_phone_hand*.mp4 \
  video/fieldday-promo/assets/app/home_offline.png video/fieldday-promo/assets/clips/i_phone.mp4 1.6 6.0 0.75
# 2. music
python3 video/tools/music.py /tmp/bed.wav && ffmpeg -i /tmp/bed.wav -b:a 256k video/fieldday-promo/assets/music/bed.mp3
# 3. check and render
cd video/fieldday-promo && npm run check && npm run render
```

## Credits

| What | Licence |
|---|---|
| [HyperFrames](https://github.com/heygen-com/hyperframes) (render, sound effects) | Apache-2.0 |
| [GSAP](https://gsap.com) | GSAP Standard "no charge" licence |
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) + [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) | Apache-2.0 / MIT |
| MediaPipe Pose Landmarker (heavy), EfficientDet-Lite2 | Apache-2.0 |
| numpy, scipy, Pillow, FFmpeg | BSD / BSD / HPND / LGPL |
| Fonts: Archivo Black, Space Mono, Montserrat | OFL-1.1 |
