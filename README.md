<div align="center">

# ChatterSnap

**Live Finnish ↔ English conversation notebook.**
Press Start once, speak either language — every sentence is detected, transcribed, translated and
saved on your device.

React · TypeScript · Vite · Tailwind · Dexie (IndexedDB) · Web Speech API · Whisper (on-device)

</div>

---

## What it does

ChatterSnap listens through your microphone, splits speech into sentences, works out whether each
sentence was Finnish or English, translates it into the other language, and stores the bilingual
pair in a local notebook you can reopen and export later.

- **One Start button, two languages.** There is no direction switch to press mid-conversation. You
  speak Finnish, then English, then Finnish — each sentence is attributed to the language it was
  actually spoken in and translated into the other one.
- **Two speech engines to choose from.**
  - **Browser engine** — the Web Speech API (Chrome/Edge). Fast, no download, but audio is
    streamed to the browser vendor's cloud service.
  - **On-device model** — Whisper (`tiny` or `base`) running in the page via
    `@huggingface/transformers` + ONNX Runtime WebAssembly. One-time download, then **the audio
    never leaves the device**.
- **Real machine translation** — no mock strings. Google's public translate endpoint first,
  MyMemory as a second engine, LibreTranslate as an optional bring-your-own endpoint, and an
  offline phrasebook as the clearly-labelled last resort.
- **Manual input** that works everywhere, including browsers with no speech support at all. Typed
  text goes through the same language detection, so you can type Finnish in the middle of an
  English conversation and it is still translated the right way.
- **Everything local** — conversations live in IndexedDB, settings in localStorage.
- **Sessions** — create, rename, search, reopen, clear, delete.
- **Export** to Markdown or plain text with session name, date/time, per-entry language, original
  text, translation and per-entry timestamps.
- **Microphone test** — Settings → mic button runs a real end-to-end check of both device access
  and recognition, and shows you what it heard.

## Install and run

Requires **Node 20+** (developed on Node 24) and npm. No global installs, no paid services.

```bash
npm install
npm run dev
```

Then open **http://127.0.0.1:5173**.

### Production build

```bash
npm run build     # typecheck + bundle into dist/
npm start         # serve dist/ and the optional API on http://127.0.0.1:8787
```

`npm start` needs `npm run build` to have run first, and reads `.env` if it exists.

### Scripts

| Script              | What it does                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| `npm run dev`       | Vite dev server on :5173 (plus the API proxy if `.env` exists)            |
| `npm run dev:web`   | Vite only — use when you don't want the proxy at all                      |
| `npm run build`     | `tsc --noEmit` then `vite build` → `dist/`                                |
| `npm start`         | Node server on :8787: `/api/translate` + static `dist/`                   |
| `npm run preview`   | Vite's preview of the built app                                           |
| `npm test`          | Bundles `src/**/*.test.ts` with esbuild, runs them through `node --test`  |
| `npm run typecheck` | `tsc --noEmit` only                                                       |

## Environment variables

**All optional.** Copy `.env.example` to `.env` only if you want the credential proxy.

| Variable         | Default                                | Purpose                                                          |
| ---------------- | -------------------------------------- | ---------------------------------------------------------------- |
| `PORT`           | `8787`                                 | Port for the helper server                                        |
| `LIBRE_ENDPOINT` | `https://libretranslate.com/translate` | LibreTranslate-compatible endpoint the server forwards to         |
| `LIBRE_API_KEY`  | *(empty)*                              | Key sent server-side as `api_key` — never bundled for the browser |

`.env` is git-ignored. **No API key is ever committed or shipped in the client bundle.** When you
enable *Route through local proxy* in Settings, the browser calls `/api/translate` and the key
stays on the server.

## How the language detection works

The speech APIs bind one locale per recogniser and cannot tell you which language they heard, so
ChatterSnap decides from the transcript itself (`src/lib/langDetect.ts`, pure and unit-tested).

It scores each word with evidence that separates the two languages:

- Function words — `ja`, `on`, `ei`, `että`, `minä` versus `the`, `is`, `have`, `because`…
- Finnish morphology — `ä`/`ö`, doubled vowels, and case endings (`-ssa`, `-sta`, `-lle`,
  `-minen`, `-vat`…)
- English shape — `th`/`wh`/`sh`/`qu`, contractions (`n't`, `'s`, `'re`), `-tion`/`-ment`/`-ing`,
  and words starting with consonant clusters
- A penalty for tokens with no vowel at all

The winner is the language with more evidence, with a confidence derived from how far ahead it is
and how much text there was to go on. Below a minimum amount of evidence the verdict is `null` and
the previous language is kept — "mm", "ok" and "ja" change nothing.

Two separate decisions come out of this:

1. **Attribution** — which language this sentence was, and therefore which way to translate it.
   This always follows the detection, so a sentence is never translated from the wrong language.
2. **Retuning** — whether to restart the live recogniser in the other locale so the *next*
   sentence is heard accurately. Interim text must clear a higher bar than a finished sentence
   before it is allowed to interrupt recognition mid-utterance.

When a line does come out wrong anyway, **Swap language** on that entry flips it and re-translates.

## Speech engines in detail

| Engine          | Where the audio goes        | Download            | Needs network     | Notes                                        |
| --------------- | --------------------------- | ------------------- | ----------------- | -------------------------------------------- |
| Browser engine  | The browser vendor's cloud  | none                | yes, always       | Chrome/Edge only. Very fast.                 |
| On-device model | Nowhere — stays in the tab  | ~40 MB tiny / ~80 MB base (cached) | only for the first download | Whisper via WebAssembly. Slower, works offline after the first run. |

Both produce the same shape of result, so the notebook, detection and translation paths are shared.
Switch engines in **Settings → How speech is recognised**.

Because the on-device engine records an utterance and transcribes it **once, as a whole**, it has
no revision stream — which is also why the on-device engine structurally cannot produce the
duplicated-word artefact described below.

### The duplicated-words bug (fixed)

Chrome's recogniser re-fires results it has already finalised, with revised and *longer* text, still
flagged `isFinal: true`:

```
"Moi"  →  "Moi miten"  →  "Moi miten menee"
```

Appending each of those to a buffer produces `"Moi Moi Moi miten Moi miten menee"`. The engine now
keeps the latest text per result **index** and tracks what has already been written for that index,
so a revision only contributes genuinely new words. `src/lib/speechEngine.test.ts` locks this down
with the exact sequence from the bug report.

## Translation engines

ChatterSnap tries engines in order and records which one answered.

| Engine             | Needs                   | Notes                                                      |
| ------------------ | ----------------------- | ---------------------------------------------------------- |
| Google (gtx)       | nothing                 | Public endpoint, CORS-enabled, used by default             |
| MyMemory           | nothing                 | Free tier with anonymous daily quota                       |
| LibreTranslate     | your own endpoint / key | Point it at a self-hosted instance for unlimited real use  |
| Offline phrasebook | nothing                 | Hand-written FI/EN pairs; marked with a warning badge       |

Because the first two are free public services, they can rate-limit or change behaviour. That is
why the chain exists, why per-engine failures are surfaced in **Settings → Test connection**, and
why you can point LibreTranslate at your own server.

## Browser support

| Browser                  | Browser speech engine | On-device Whisper | Translation | Notebook |
| ------------------------ | --------------------- | ----------------- | ----------- | -------- |
| Chrome / Edge (desktop)  | ✅                    | ✅ WebAssembly + WASM threads | ✅ | ✅ |
| Chrome (Android)         | ✅                    | ⚠️ works but slow on low-end phones | ✅ | ✅ |
| Safari 17+ (macOS/iOS)   | ⚠️ partial            | ✅                | ✅          | ✅       |
| Firefox                  | ❌ no API             | ✅                | ✅          | ✅       |

Where the browser engine is unavailable, the app says so plainly, offers the on-device engine
instead, and keeps the manual text input fully working — nothing is secretly mocked.

The browser engine also requires a **secure context** (`https://` or `localhost`). Opening the dev
server via a LAN IP over plain HTTP will disable the microphone.

## Known limitations

- **The browser speech engine needs the network** and streams audio to its vendor. Choose the
  on-device model if that matters to you.
- **The on-device model has a one-time download** (~40–80 MB, cached by the browser). The first
  sentence after a cold start waits for it; a progress line says so.
- **Short utterances are ambiguous.** "Okay", "yeah", "ja" and single names carry too little
  evidence, so they keep the previous language. Use **Swap language** if one lands wrong.
- **Code-switching mid-sentence is hard.** Detection works per sentence; a sentence that starts in
  Finnish and ends in English will be attributed to whichever language dominates it.
- **One recogniser at a time.** Browsers allow a single consumer of the microphone, so switching
  language retunes the existing recogniser rather than running two in parallel.
- **Recognition restarts.** Long sessions hit the API's own stop conditions. The app restarts it
  automatically with backoff and reports a clear message after repeated failures.
- **Punctuation is approximate.** Sentence splitting relies on terminators and a silence timeout,
  so a very long unpunctuated monologue is chunked at a character limit instead.
- **Public translation endpoints have quotas** and no uptime guarantee. For dependable use, host
  LibreTranslate and set `LIBRE_ENDPOINT` / `LIBRE_API_KEY`.
- **Data is per-browser.** IndexedDB is not synced. Clearing site data deletes every conversation;
  export what you want to keep.
- **No cross-tab live sync.** Two tabs each write their own entries; reload to pick up the other.
- **The offline phrasebook is not a real translator.** It matches whole phrases from a small fixed
  list and marks every result it produces, so it is never mistaken for machine translation.

## Test checklist

Automated — `npm test` runs **65 tests across 8 suites**, all passing:

- **`langDetect` (18)** — Finnish and English sentences classify correctly with confidence > 0.2;
  `null` for "", whitespace, "ok", "mm", "ja", "?…"; shared-word disambiguation; mixed-sentence
  majority; `tokenize` keeps `ä`/`ö` and `n't`; `plausibility`; and the decision rules — no switch
  on ambiguous input, interim stricter than final, attribution always follows detection, switching
  back and forth between the languages.
- **`speechEngine` (16)** — revised final results per index emit once (the duplicate bug); the exact
  reported sequence emits a single clean sentence with no repeated words; advancing indices emit
  separately; interim never reaches the notebook; silence flush for unterminated fragments; `Hei.`
  emits immediately while the fragment waits; `stop()` flushes; multi-sentence splits; `yms.` is
  not split; restart reuses the instance; `switchLocale` flushes first, then rebuilds.
- **`speech` (11)** — terminators, decimals, Finnish abbreviations, `?!` runs, trailing fragments,
  dedupe keys, splitter priming.
- **`export` (12)** — headers, language labels, timestamps, prefs off, failed-translation note,
  ordering, empty sessions, plain-text labels, filenames, unsafe titles, format overrides.
- **`translate` (8)** — fallback ordering and labelling, verbatim-echo rejection, empty-result
  rejection, abort handling, per-engine error detail, offline-disabled failure, empty input.

Manual pass (do this in a real browser — no automation can cover a microphone):

1. `npm run dev`, open http://127.0.0.1:5173 — notebook, direction pill and empty state render.
2. Press the mic button → **Test microphone**. Allow permission, say something, hear it echoed back.
   This separates "browser cannot see a mic" from "recognition failed".
3. Type `Hei, mitä kuuluu?` in the manual box → it is badged **FI**, translated to English.
4. In the same session, type `Good morning! The meeting starts at nine.` → badged **EN**,
   translated to Finnish. Both languages now coexist in one notebook.
5. Press **Start**, speak a Finnish sentence, pause, then speak an English sentence → two entries
   with different badges, each translated the other way.
6. Speak a long unpunctuated run → no repeated words appear in the entry.
7. Settings → **How speech is recognised** → switch to *On-device model*, reload, press Start →
   download progress appears, then speech transcribes with the network disabled.
8. Delete an entry's language with **Swap language** → it flips and re-translates.
9. Deny the microphone → a clear permission error appears, manual input still works.
10. Rename the session; reload → the new name is still there.
11. Create a second session, switch between them → entries belong to the right session.
12. Delete a session → confirmation appears, entries are gone afterwards.
13. Export as `.md` and `.txt` → files download with header, timestamps and translations.
14. Toggle theme light/dark/system and reload → theme survives first paint with no flash.
15. Go offline → banner appears, an entry still saves, translation reports a clear failure.
16. Settings → Test connection → shows the engine name and a sample translation, or a real error.

## Project layout

```
src/
  components/   Header, Logo, DirectionPill, Controls (record button/status/timer),
                Notebook, EntryRow, SideRail, SessionsPanel, ManualInput,
                MicTestDialog, SettingsDialog, Toasts, ConfirmDialog
  hooks/        useAppStore (state + persistence + detection),
                useSpeech (permission flow + engine selection), useMicLevel
  lib/          db (Dexie), settings, export, util,
                langDetect (+ test)        Finnish↔English language detection
                speech (+ test)            pure transcript helpers
                speechEngine (+ test)      Web Speech API engine, revision-safe
                localWhisper               in-page Whisper (transformers.js)
                listener                   engine-agnostic bilingual listener
  lib/translate/  provider chain, offline phrasebook, memo cache (+ test)
  types.ts      shared domain types and defaults
public/         favicon + logo
server/proxy.mjs  optional API proxy + static server (no dependencies)
scripts/dev.mjs   dev launcher (Vite + optional proxy)
scripts/test.mjs  esbuild + node --test runner
```

## Future improvements

- Streaming translation that updates while the user is still speaking.
- Speaker separation and per-speaker colour coding.
- Full-text search across all sessions, not just titles.
- Import of previously exported Markdown files.
- Optional encrypted cloud sync with an explicit opt-in.
- Larger local models (small/medium) for the on-device engine where the device can take them.
- Vocabulary/glossary so domain terms translate consistently.

## License

Private project — add a license before distributing.
