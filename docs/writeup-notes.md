# Write-up notes

Material for the DEV (Touch Grass) and Hack47 OFFGRID posts. Numbers below were measured in this
repo's test environment; things that need a real phone outdoors are listed at the end.

## What it is

FieldDay turns a phone into a voice-first referee for outdoor games. You say a game, put the
phone down, and play. The camera and mic referee; the brain designs games and quests from your
words; nothing needs the internet in Open Mode.

## Open models vs OpenAI

| | Open Mode (Gemma, on device) | Boost Mode (OpenAI) |
|---|---|---|
| Works in a park with no signal | ✅ yes (the whole point) | ❌ needs internet, falls back to Gemma |
| Cost | free | API usage |
| Privacy | nothing leaves the phone | request text / quest photos go to OpenAI via our server |
| Game design | Gemma + strict zod validation + one repair + templates | structured outputs from the same zod schemas; same validation |
| Voice | browser speech with hand-written line banks (instant) | live Realtime voice (more natural) |
| Photo checks | detector labels + colours (limited vocabulary) | vision model (anything) |
| Without the model | an offline rules designer still makes valid games | n/a |

Brain Stats (Settings → Brain Stats → Export) gives latency, success, repair and fallback rates
per brain from real use: run the same 20 requests in each mode and paste the table here.

## Numbers from the tests

- 12 templates, each with a recorded-style event fixture; 165 unit tests, 26 browser tests (Playwright, incl. offline, live online, Boost fallback and accessibility).
- Vision accuracy on simulated people with known sizes (2 px landmark noise):
  jump height within ±10% (0.25/0.40/0.55 m), throw apex within ±10% even with the frames at
  the top missing (2.0, 2.6 m, and 3.2 m thrown off the top of the screen).
- Our vision logic costs ~0.02 ms per frame in Node (the MediaPipe models dominate; the app shows
  live FPS so the real number can be measured on a mid-range phone).
- A template ghost fits in < 200 characters (QR version ~6); a custom game ghost < 1200.
- Initial JS 236 KB (75 KB gzip). Camera WASM 13 MB and Whisper ~40 MB load only when used and
  are then cached for offline play ("Get ready for offline" downloads them up front).
- Accessibility: axe-core finds no WCAG 2.1 AA violations on the 14 main screens.

## Bugs we hit and how we fixed them

1. **Referee calls were late after a timer ended a turn.** `tick()` handled calls before timers,
   so the next turn's "FREEZE!" only started on the following tick. Fix: process clock moments
   (call end, call start, timer) strictly in time order.
2. **Freeze never fired.** Landmark jitter (~2 px/frame at 30 fps) looked like movement. Fix:
   measure motion against a frame ~200 ms earlier, so jitter does not scale with frame rate.
3. **Punches everywhere.** Moving the whole body (or raising arms) looked like a punch. Fix: a
   punch is an arm that straightens at shoulder height with reach growing fast relative to the
   shoulder.
4. **A ball falling past your hand counted as a catch.** Fix: a catch also needs the ball to
   slow down at the hand.
5. **Heights without calibration were missing**, so a demo game had no scores. Fix: estimate the
   scale from the standing body and an assumed height until the player calibrates.
6. **MediaPipe WASM was never copied** to `public/` (the package hides `package.json` from
   `require.resolve`), but the demo camera hid it. Fix: resolve the entry file; a browser test
   now checks every runtime file is served locally.
7. **The safety filter blocked "Boosted Jump Off"** because of the rule against jumping off high
   places. Fix: the rule now needs "jump off the/a/from …"; both cases are tested.
8. **"Touch object home first" ended Sprint & Tap instantly.** Fix: targets in conditions
   (`after touch_object:far`) and conditions on turn-end events (`has score`).

## Touch Grass features to show

- Screen-Time Meter after every game ("You played 34 minutes. Screen time: 4%").
- Outside Score, outside streak, badges (Touch Grass, Offline Hero, Boss Slayer…).
- Quests that move people around the park; photo checks done on the phone.
- Water and shade reminder every 15 minutes (hot climates like Sri Lanka).

## Still to collect outdoors (needs a real phone)

- [ ] Photos/clips of real play in a park (bonus points on DEV).
- [ ] Field Check + calibration on a mid-range Android: FPS (HUD), jump/throw accuracy against a
      tape measure (target ±10%), Bounce & Catch reliability in daylight.
- [ ] Use "Record test data" during real play and add the JSON files to `fixtures/vision/`
      (tests replay every file there automatically).
- [ ] Screen-Time Meter results from real sessions.
- [ ] Brain Stats export: Gemma (on a WebGPU phone) vs OpenAI latency and fallback rate.
- [ ] Gemma model actually loaded on the phone (Settings → Gemma model) — not testable in CI.
