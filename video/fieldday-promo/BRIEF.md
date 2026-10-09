---
workflow: general-video
flow: automation
storyboard: no
message: "Say any game, play it outside — the phone is the referee, even with no signal."
destination: youtube
aspect: 1920x1080
language: en
audience: "Teens, young adults and families who want to play outside more; hackathon judges (DEV Touch Grass, Hack47)."
length: "2:12 (under 3 minutes)"
angle: product-promo
voice: kokoro:af_heart
---

## Intent

A professional, Apple-style promotional film for FieldDay: big confident type that
appears word by word, slow camera moves on real park footage, the app shown inside
floating phones, clean cuts on the music. Uplifting, sunny, energetic but premium.
User's words: "make like professional advertisement… use animations and so on like
apple video", "use real video as demo", "youtube video size", "under 3 min",
"generate your own music and voiceover".

## Assets

- ../../videos/01_opening… — drone over an empty park at golden hour; the opening.
- ../../videos/02_phone_down… — a hand leans the phone on a backpack; the "Meet FieldDay" beat.
- ../../videos/03_say_a_game… — Ama talks to the phone; the "say a game" beat.
- ../../videos/04_throw_1…, 04_throw_2… — straight-up throws, static camera; real tracking overlay.
- ../../videos/05_jump… — a big jump, static camera; real tracking overlay.
- ../../videos/06_battle… — two friends battling; battle modes beat.
- ../../videos/07_boss_raid… — three friends jump, squat, then freeze; Boss Raid beat.
- ../../videos/08_quest_team…, 08_quest_tree…, 08_quest_red… — quests.
- ../../videos/09_place_colombo…, 09_place_kandy… — two cities, live battle split screen (skip the film-camera moment in Kandy at ~2–5 s).
- ../../videos/10_ending… — friends at sunset; Screen-Time Meter close.
- ../../videos/11_phone_hand… — green-screen phone (optional).
- ../../assets/* — Volt mascot, bosses, mode icons, badges, app icon.

## Customizations

- Voiceover generated locally with Kokoro (open model, voice af_heart); referee shouts with a second Kokoro voice.
- Original music composed in code (no catalog/sign-in available), mixed under the voice.
- Real FieldDay tracking (MediaPipe pose + ball detection + FieldDay's vision pipeline) drawn over the throw/jump/boss footage, with the heights it measured.
- Real app screens recorded from the FieldDay PWA inside phone mock-ups.

## Notes

- HeyGen not signed in; usage status unknown. Offline engines used: Kokoro (voice), code-composed music, bundled SFX.
- Footage is 1280×720 24 fps; scaled to 1920×1080 30 fps.
- Brand palette from the app: yellow #FFE600, grass green #2BD96B, navy #0B1C3D, coral #FF4D3D, white.
