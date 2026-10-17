---
name: demo-video
description: Make a narrated demo or promo video of the project's live site or app — scripted browser takes, Gemini voice-over, captions, music bed, ffmpeg edit, shareable link. Use when the user asks for a video that shows how their system works.
allowed-tools: Bash(node *demo-video*), Bash(bash *demo-video*), Bash(source *demo-video*), Bash(agent-browser:*), Bash(ffmpeg*), Bash(ffprobe*)
---

# Demo video

Produces a Full HD MP4 that demonstrates the project's live site or app: real
screen recordings, a voice-over in the user's language, burned-in captions, a
music bed and a link to share. Everything runs in the container with
agent-browser, ffmpeg and the project's AI proxy (billed to the project's
credits). Typical result: 1–3 min, 10–20 MB, about 1–2 hours of agent work.
All work lives in `video/` (`build/` and `out/` stay out of git).

## When to use

- "Make a video that shows how the system works", promo, ad, client demo
- A walkthrough for an offer, a release note or a landing page
- Not for recordings the user does themselves: then write them a shooting
  script in `docs/demo/script.md` (scene, action, text to say) instead

## Pipeline (every step is resumable: a rerun skips finished output)

| Step | Command | Output |
|---|---|---|
| 0. Setup | `bash .claude/skills/demo-video/setup.sh` | ffmpeg, caption fonts, `video/` folders |
| 1. Script | write `video/vo/narrator.json` and `video/scenes.mjs` (start from `examples/`) | the plan |
| 2. Voice-over | `node .claude/skills/demo-video/tts.mjs video/vo/narrator.json video/build/vo` | `s01.wav…` + `s01.txt` (what was said) |
| 3. Takes | `source .claude/skills/demo-video/rec-lib.sh` then `take_start`, `mark`, `take_stop` | `video/build/rec/<take>.mp4` + `.marks` |
| 4. Cards | `card_take <name> "file://$PWD/video/cards/<name>.html?…" <seconds>` | `video/build/rec/card-<name>.mp4` |
| 5. Sounds | `node .claude/skills/demo-video/sfx.mjs` | `video/build/sfx/chime.wav`, `click.wav` |
| 6. Edit | `node .claude/skills/demo-video/compose.mjs video/scenes.mjs` | `video/out/<name>.mp4` (+ music if none given) |
| 7. QA | `node .claude/skills/demo-video/listen.mjs video/out/<name>.mp4 "<question>"` and frame grabs | fixes, then step 6 again |
| 8. Publish | `node .claude/skills/demo-video/publish.mjs video/out/<name>.mp4 --cover 16` | key in project storage + cover JPG |

(`.agents/skills/demo-video/` if it was installed with `npx skills add`.)

## How to make it good

**Script first.** 10–15 narrator lines, one idea per line, 8–15 words, in the
user's language. Facts only: never claim numbers, customers or awards you
cannot verify in the project's own data. Put brand names and acronyms in
`pronounce` so they are read right. Each line maps to one scene.

**Voice.** The proxy has no TTS model; `tts.mjs` uses the Live model
(`gemini-3.8-live`) reading each line verbatim, keeps the best of 3 tries by
comparing the model's own transcript with the script (80 % word match) and
writes one WAV per line. Voices: Kore, Charon, Puck, Fenrir, Aoede. One voice
for the narrator; a different one for a "customer" role. Read `s*.txt` after
the run and regenerate any line that differs (`rm` its wav and rerun).

**Takes.** Start from a clean state: fresh browser context, empty cart, no
saved form drafts (`agent-browser eval 'sessionStorage.clear()'` and the
same for `localStorage` keys the app uses), logged in before recording so no
password is typed on camera. Type with `typeslow`,
call `mark <label>` before every click the edit will cut on, wait for AI
answers with `wait_gone "<searching text>"`, never scroll the element you are
showing off-screen. Click by element ref (`@e12` from `snapshot`), not by
label text. `take_start` sets the viewport to 1600×900 (the default is
1280×720, too small for 1080p); one take per scene. When the
product has a voice agent, record a real exchange through its own API
(`examples/voice-exchange.mjs`) and play it over a card instead of faking it.

**Cards.** `examples/cards/` has an intro (animated numbers, logo, pills), a
voice-call card and an outro. Copy to `video/cards/`, change colours, logo
and texts to the brand. Pass timings in the URL (`?t1=<s>`) so animations
land on the voice.

**Edit (`scenes.mjs`).** Each scene is pieces of a take `[take, in, out,
speed, zoom?]` plus audio `['vo:s01', at]`. Speed up waiting 2–5×, punch-in
`zoom` on panels with small text, `chapter` chip at each new section,
`cap: 'left'` when the bottom captions would cover the UI being shown,
`sfx` chime on success moments (added to cart, order placed). The edit is
cached per scene; only changed scenes re-render.

**Audio.** The music bed is synthesized by `compose.mjs` (no licence risk) and
ducked under the voice; set `music: 'path/to/track.mp3'` in `scenes.mjs` for
the user's own track. Output is normalised to −16 LUFS.

**QA before delivering.** `listen.mjs` sends the mix to Gemini: ask about
diction, mispronounced words, music-to-voice balance, glitches and long
silences. Then grab one frame per scene at full resolution
(`ffmpeg -ss <t> -i out.mp4 -frames:v 1 f.png`) and look at it: captions
overlapping the UI, cut-off text, wrong state on screen. Fix, rerun step 6.

**Deliver.** Delete test orders/data the takes created, run
`agent-browser close --all`, commit `video/` tools and script (not
`build/`, `out/`). Give the link, the local path, a short list of what the
video shows, and anything in the product you fixed while shooting (recording
a flow end to end usually finds real bugs; fix them, they affect real users).

## Publishing

`publish.mjs` uploads to the project's storage with the right content type
(the plain storage upload serves video as a download) and prints the public
URL: with `"storage": { "cloudfront": "media" }` in `openkbs.json` the file is
at `<site>/media/<key>` once `openkbs deploy` has set up that path. Without
storage on the CDN, put the file under `site/` and deploy, or share an
`openkbs storage download`. `--cover <seconds>` also uploads a JPG frame as a
thumbnail.

## Requirements

- Studio container: `ffmpeg` (setup installs it), `agent-browser`, proxy JWT in
  `~/.openkbs/projectJWT`. Outside Studio set `OPENKBS_API_KEY`.
- Fonts for captions are downloaded by `setup.sh` into `video/build/fonts`
  (Golos Text, Fira Sans Extra Condensed: Latin + Cyrillic, OFL).
