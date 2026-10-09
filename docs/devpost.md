## Inspiration

You know this moment. Friends meet in a park. Ten minutes later, everyone is looking at their phone again.

Phones are great at games, but those games keep us on the screen. So we asked:

> **What if the phone made the game, and then got out of the way?**

A good referee doesn't play. It watches, keeps score and makes the game fun. We wanted a phone that does exactly that, so people play **outside**, not **on the screen**.

We also live in a place where many parks have weak or no mobile signal. So FieldDay had to work **with zero internet**.

## What it does

**FieldDay turns your phone into a referee for real games outside.**

1. **🗣️ Say a game.** For example: *"highest throw battle, 3 rounds, 2 players."* FieldDay makes the game, checks that it is safe, and reads the rules out loud.
2. **📱 Put the phone down.** Lean it on a bag. A quick **Field Check** makes sure the phone is steady, the light is good, it can see your whole body and the ball, and the space is clear.
3. **⚽ Play!** The camera follows your body and the ball. It measures how high you throw and jump, keeps the score, and shouts like a sports announcer: *"Two point four metres! Massive!"*

### Features

- **12 quick games:** Sky Toss, Jump Battle, Freeze Tag Statue, Reaction Race, Squat Storm, Boss Raid and more.
- **Battles:** turn battles, Red vs Blue, Chaos Mode, King of the Hill and tournaments.
- **Boss Raid:** everyone jumps, squats and punches together to beat a monster. When the referee shouts *"FREEZE!"*, everyone must stand still.
- **Quests:** *"Race to the biggest tree." "Find something red."* The phone checks your photo itself, and the photo is never uploaded.
- **Online rooms:** play live with friends in another city. Only the score is sent. **Your video never leaves your phone.**
- **Ghost challenges:** your scores go into a QR code. A friend scans it and plays against your "ghost", with no internet needed.
- **Touch Grass meter:** *"You played 34 minutes. Screen time: 4%."*
- **Safety:** unsafe ideas get a kind "no" and a safer game instead. Kids Mode has a calm voice and longer timers. Every 15 minutes, the app reminds everyone to drink water.

### Two modes

| | **Open Mode** (default) | **Boost Mode** (optional) |
|---|---|---|
| AI | Runs on the phone | OpenAI, through our server |
| Internet | Not needed (works in airplane mode) | Needed |
| Cost | Free | Pay per use |
| Your video | Stays on the phone | Stays on the phone |

The OpenAI key stays on our server and never goes to the phone.

## How we built it

### The main idea

**The AI never writes code.** It only fills in a **Game Spec**: a small piece of JSON built from fixed blocks (trackers, events, measures and rules). A small, well-tested rules engine runs that spec.

So the AI can be creative, but it can't break the game.

### AI on the phone

- **Gemma** (open model) runs in the browser with MediaPipe LLM Inference and WebGPU. It turns your words into a Game Spec and creates quests.
- **Whisper tiny** turns your voice into text, using Transformers.js and ONNX Runtime Web.
- **MediaPipe** (Pose Landmarker + EfficientDet) finds your body and the ball in every camera frame.

### Making sure there is always a game

1. We check every AI answer with strict **zod** rules.
2. If the answer is wrong, Gemma gets one more try to fix it.
3. If it still fails, a ready-made template takes over.
4. No Gemma on the phone? A simple offline game designer still turns your words into a game.

### Seeing the game

We turn body points and ball positions into events like *jump*, *ball at the top*, *catch*, *punch* and *moved during freeze*. Heights come from your body size, so you don't need a tape measure. After a quick calibration, it is about ±10% accurate.

### The rest of the app

- **App:** React + Vite, as a PWA that works offline. Zustand keeps the app state, and Dexie (IndexedDB) saves everything on the phone.
- **Server:** Hono + WebSockets for live rooms and crews, SQLite for storage, and the OpenAI connection for Boost Mode (structured outputs, vision and Realtime voice).
- **Code:** a pnpm monorepo, with separate packages for the game engine, vision, brain, quests, network and UI.
- **Tests:** 165 unit tests (Vitest) and 26 browser tests (Playwright). One test plays a full game in airplane mode, and another checks accessibility with axe-core.

The **promo video** was made with HyperFrames, a Kokoro AI voice, music written in code, and real MediaPipe tracking drawn on every frame.

## Challenges we ran into

- **"Freeze" never worked.** Body points shake a tiny bit in every frame, and that looked like moving. **Fix:** compare with a frame from about 0.2 seconds earlier.
- **Punches everywhere.** Raising your arms looked like a punch. **Fix:** a punch now needs a straight arm at shoulder height, moving fast.
- **A falling ball counted as a catch.** **Fix:** the ball must also slow down at your hand.
- **The referee was late.** It shouted "FREEZE!" one step too late. **Fix:** everything now happens in the right time order.
- **The safety check was too strict.** The rule against "jumping off high places" blocked a game called "Boosted Jump Off". **Fix:** a smarter rule, with tests for both cases.
- **AI answers can be broken.** Small models sometimes return bad JSON. **Fix:** strict checks, one retry, and a template if all else fails.
- **Offline is hard.** The camera models, the speech model and Gemma are big files. **Fix:** load them only when needed, then save them on the phone for next time.

## Accomplishments that we're proud of

- ✈️ **It works with no internet.** You can say a game and have it made and refereed, all in airplane mode.
- 🔒 **Privacy first.** Video never leaves the phone. Online games only send small score messages.
- 🛡️ **The AI can't break the game**, thanks to the Game Spec and the rules engine.
- 🎉 **Fun for groups.** Boss Raid, Freeze, Chaos Mode and quests get everyone moving together.
- ✅ **Well tested:** 165 unit tests, 26 browser tests, and no accessibility errors on the 14 main screens.
- 🌱 **A real Touch Grass meter** that shows how little you looked at the screen.

## What we learned

- **Small open models work great when you give them clear rules.** With a strict format and checks, Gemma went from "sometimes right" to "always gives a game you can play".
- **AI on the phone opens new doors.** It works with no signal, has no API bill, and private video is never uploaded.
- **Real-world camera data is messy.** Light, shaky points and fast balls needed simple, careful rules more than bigger models.
- **The best screen is less screen.** Big buttons, voice and sound let people keep their eyes on the field.

## What's next for FieldDay

- 📏 **Test outside on real phones.** We will check jump and throw heights against a tape measure on normal Android phones, and use real recordings to make the tests better.
- 🎲 **More games and quests**, plus game codes that people can share.
- 🗣️ **More voices and languages**, including Sinhala and Tamil.
- 🏫 **Schools and clubs:** a teacher mode for PE classes, with simple class challenges.
- ⚡ **A smaller, faster brain**, so older phones can run Gemma too.
