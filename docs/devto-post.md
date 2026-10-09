---
title: "FieldDay: say any game, play it outside, and let your phone be the referee"
published: false
tags: devchallenge, hf26challenge, ai, opensource
cover_image: https://raw.githubusercontent.com/Bin4yi/FieldDay/main/assets/screens/hero_banner.png
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

## What I Built

**FieldDay** is a web app that turns your phone into a referee for real games outside.

You say a game, like *"highest throw battle, 3 rounds, 2 players"*. FieldDay makes the game, checks
that it is safe, and reads you the rules. Then you lean the phone on your bag and go play.

The phone watches with the camera. It sees your body and the ball. It measures how high you throw
and how high you jump. It keeps the score and shouts like a sports announcer: *"Two point four
metres! Massive!"*

The screen is not the game. The field is the game. The phone just watches.

**What you can do with it:**

- **Say any game.** Speak or type it. The AI turns your words into a game with real rules.
- **12 quick games:** Sky Toss, Jump Battle, Freeze Tag Statue, Reaction Race, Squat Storm, Boss Raid and more.
- **Battles with friends on one phone:** turn battles, Red vs Blue teams, Chaos Mode, King of the Hill, and Boss Raid, where everyone jumps, squats and punches together to beat a monster. When the referee shouts *"FREEZE!"*, everyone must stand still.
- **Quests that move you around the park:** "Race to the biggest tree." "Find something red." The phone checks your photo, and the photo never leaves the phone.
- **Ghost challenges:** your scores go into a QR code. A friend scans it and plays against your "ghost", with no internet needed.
- **Touch Grass meter:** after every game it tells you how long you played and how little you looked at the screen: *"You played 34 minutes. Screen time: 4%."*
- **Safety first:** it says no to unsafe ideas (throwing at people, roads, climbing, water) and offers a safer game. Kids Mode uses a calm voice, and every 15 minutes it reminds you to drink water.

**Who is it for?** Friends, families, kids and school groups who want to play outside but end up
on their phones. It's also for places like a park with no signal. **FieldDay works with zero
internet.**

## Demo

{% embed https://www.youtube.com/watch?v=YOUR_VIDEO_ID %}

*In the video, the people are AI-generated clips. The body and ball tracking you see on them is
real MediaPipe output, run on every frame. The app screens are real screenshots of FieldDay.*

**Try it:** YOUR_DEPLOYED_LINK

![Demo camera: a simulated player throws, the referee measures and scores](https://raw.githubusercontent.com/Bin4yi/FieldDay/main/docs/demo.gif)

| Home | Say a game | Play | Quests |
|---|---|---|---|
| ![Home](https://raw.githubusercontent.com/Bin4yi/FieldDay/main/docs/screenshots/home.png) | ![Say a game](https://raw.githubusercontent.com/Bin4yi/FieldDay/main/docs/screenshots/say-a-game.png) | ![Play](https://raw.githubusercontent.com/Bin4yi/FieldDay/main/docs/screenshots/play-demo-camera.png) | ![Quests](https://raw.githubusercontent.com/Bin4yi/FieldDay/main/docs/screenshots/quests.png) |

No ball or park nearby? Pick **Demo camera** in the app. A simulated player throws and jumps, and
you can watch the referee work.

## Code

{% github Bin4yi/FieldDay %}

The git tag **`v0.1-devto`** is my submission for this challenge.

## How I Built It

The main idea is simple: **the AI never writes code.** It only fills in a *Game Spec*, a small
piece of JSON built from fixed blocks: trackers, events, measures and rules. A small, well-tested
rules engine runs that spec. So the AI can be creative, but it can't break the game.

**The open-source AI inside FieldDay, all running on the phone:**

| Part | Open model / tool | What it does |
|---|---|---|
| The brain | **Gemma** (open weights), run in the browser with MediaPipe LLM Inference | Turns your words into a Game Spec and makes quests |
| The ears | **Whisper tiny** (MIT), run with Transformers.js and ONNX Runtime Web | Speech to text, so you can just say your game |
| The eyes | **MediaPipe Pose Landmarker** + **EfficientDet** object detector (Apache-2.0) | Finds your body and the ball in every frame |

**How a game works:**

1. **You speak.** Whisper turns your voice into text on the phone.
2. **Gemma designs the game.** It writes a Game Spec. I check the spec with strict zod schemas. If something is wrong, Gemma gets one chance to fix it. If it still fails, a built-in template takes over, so you always get a game.
3. **Safety check.** Every game passes a safety check and a "can the camera see this?" check. For example, the camera can't measure spin or heart rate, so FieldDay offers the closest game it *can* referee.
4. **Field Check.** Before you play, FieldDay checks that the phone is steady, the light is good, your whole body is in view, the ball is found and the space is clear.
5. **The camera referees.** Pose and ball tracking turn into events like *jump*, *ball apex*, *catch* and *freeze broken*. Heights come from your body size, so it doesn't need a tape measure (about ±10% after a quick calibration).
6. **The referee talks.** Short, hand-written lines in 5 styles (football announcer, wrestling host, calm coach, robot, pirate) are spoken with the phone's own voice.

**No Gemma model on your phone, or no WebGPU?** Open Mode still works. An offline rules designer
turns your words into a game from the templates, and the same safety check runs.

**Built with:** Vite + React (a PWA that works offline), Zustand, Dexie (IndexedDB), zod, and a
pnpm monorepo with separate packages for the engine, vision, brain, quests and UI. It has 165 unit
tests and 26 Playwright browser tests, including a test that plays a whole game in airplane mode.

**Some bugs I had to fix along the way:**

- **Freeze never fired.** The body points shake a tiny bit every frame, and that looked like movement. Now I compare against a frame from about 200 ms earlier.
- **Punches everywhere.** Raising your arms looked like a punch. Now a punch needs a straight arm at shoulder height that moves fast.
- **A falling ball counted as a catch.** Now the ball must also slow down at your hand.

**The promo video** was made with open tools too: HyperFrames (HTML to video), Kokoro (an
open-weight voice model) for the voice, MediaPipe for the tracking overlays, and music I wrote in
code.

## Why Does Open Innovation Matter?

For FieldDay, open models are not a nice extra. **Without them, the app doesn't work.**

- **Parks don't have Wi-Fi.** The best places to play often have weak or no signal. A closed AI API needs the internet for every request. Gemma, Whisper and MediaPipe run on the phone, so FieldDay works in airplane mode. I tested this: a typed game becomes a playable, refereed game with the network turned off.
- **Your video stays on your phone.** The camera watches kids and families playing. With open models, the video goes to the model *on the phone* and nowhere else. Nothing is uploaded. That would be very hard to promise with a cloud API.
- **It's free.** No API key, no bill and no limits. A school can use it with a whole class, and nobody pays per game.
- **It's fast.** A referee has to react right away. A call to a server and back is too slow for a *"FREEZE!"*.
- **I can see inside it and change it.** Open weights and open tools let me test, measure and fix every part, from the pose points to the game rules.

A closed API would have made FieldDay another app that only works at home on Wi-Fi. Open AI let me
build one that works outside, which is the whole point of touching grass.

## My Agent Session

I built FieldDay with an AI coding agent (Claude Code) as my pair programmer. I planned the
features, made the decisions and tested the results, and the agent helped me write and test the
code.

<!-- Optional: embed your saved DevRelay session here with the agent_session tag from the challenge page -->

## Prize Categories

- **Best Use of Gemma.** Gemma is FieldDay's brain in Open Mode: it designs every game and quest on the phone, offline.

<!-- Team Submissions: Please pick one member to publish the submission and credit teammates by listing their DEV usernames directly in the body of the post. -->

Thanks for reading. Now put your phone down and go play! 🌱
