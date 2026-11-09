<div align="center">

# ChatterSnap

**Live Finnish ↔ English conversation notebook.**
Speak or type — every sentence is transcribed, translated and saved on your device.

React · TypeScript · Vite · Tailwind · Dexie (IndexedDB) · Web Speech API

</div>

---

## What it does

ChatterSnap listens through your microphone, splits speech into sentences, translates each
sentence between Finnish and English, and stores the bilingual pair in a local notebook you can
reopen and export later.

- **Live transcription** with the Web Speech API (`fi-FI`, `en-US`, `en-GB`).
- **Real machine translation** — no mock strings. Google's public translate endpoint first,
  MyMemory as a second engine, LibreTranslate as an optional bring-your-own endpoint, and an
  offline phrasebook as the clearly-labelled last resort.
- **Manual input** that works everywhere, including browsers with no speech support at all.
- **Everything local** — conversations live in IndexedDB, settings in localStorage. Nothing is
  uploaded except the sentence you are translating, and speech audio goes to the browser's own
  speech service.
- **Sessions** — create, rename, search, reopen, clear, delete.
- **Export** to Markdown or plain text with session name, date/time, direction, original text,
  translation and per-entry timestamps.

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

| Script            | What it does                                                        |
| ----------------- | ------------------------------------------------------------------- |
| `npm run dev`     | Vite dev server on :5173 (plus the API proxy if `.env` exists)       |
| `npm run dev:web` | Vite only — use when you don't want the proxy at all                 |
| `npm run build`   | `tsc --noEmit` then `vite build` → `dist/`                           |
| `npm start`       | Node server on :8787: `/api/translate` + static `dist/`              |
| `npm run preview` | Vite's preview of the built app                                      |
| `npm test`        | Bundles `src/**/*.test.ts` with esbuild, runs them through `node --test` |
| `npm run typecheck` | `tsc --noEmit` only                                                |

## Environment variables

**All optional.** Copy `.env.example` to `.env` only if you want the credential proxy.

| Variable         | Default                                  | Purpose                                                    |
| ---------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `PORT`           | `8787`                                   | Port for the helper server                                  |
| `LIBRE_ENDPOINT` | `https://libretranslate.com/translate`    | LibreTranslate-compatible endpoint the server forwards to   |
| `LIBRE_API_KEY`  | *(empty)*                                | Key sent server-side as `api_key` — never bundled for the browser |

`.env` is git-ignored. **No API key is ever committed or shipped in the client bundle.** When you
enable *Route through local proxy* in Settings, the browser calls `/api/translate` and the key
stays on the server.

## Translation engines

ChatterSnap tries engines in order and records which one answered.

| Engine            | Needs                    | Notes                                                     |
| ----------------- | ------------------------ | --------------------------------------------------------- |
| Google (gtx)      | nothing                  | Public endpoint, CORS-enabled, used by default            |
| MyMemory          | nothing                  | Free tier with anonymous daily quota                      |
| LibreTranslate    | your own endpoint / key  | Point it at a self-hosted instance for unlimited real use  |
| Offline phrasebook | nothing                 | Hand-written FI/EN pairs; marked with a warning badge      |

Because the first two are free public services, they can rate-limit or change behaviour. That is
why the chain exists, why per-engine failures are surfaced in **Settings → Test connection**, and
why you can point LibreTranslate at your own server.

## Browser support

| Browser                   | Speech recognition | Translation | Notebook |
| ------------------------- | ------------------ | ----------- | -------- |
| Chrome / Edge (desktop)   | ✅ yes             | ✅           | ✅        |
| Chrome (Android)          | ✅ yes             | ✅           | ✅        |
| Safari 14.1+ (macOS/iOS)  | ⚠️ partial         | ✅           | ✅        |
| Firefox                   | ❌ no API          | ✅           | ✅        |

Where speech is unavailable the app says so plainly, disables the record button and keeps the
manual text input fully working — nothing is secretly mocked.

Speech recognition also requires a **secure context** (`https://` or `localhost`). Opening the dev
server via a LAN IP over plain HTTP will disable the microphone.

## Known limitations

- **Speech recognition needs the network.** Chrome and Edge stream audio to their vendor's speech
  service; there is no offline recogniser in the Web Speech API.
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

Automated (`npm test` — 31 assertions, all passing):

- Sentence splitting: terminators, decimals, Finnish abbreviations (`esim.`, `jne.`, `klo.`),
  repeated `?!`, trailing fragments, multi-sentence Finnish.
- Dedupe keys and `SentenceSplitter` priming / no-repeat behaviour.
- Markdown and plain-text export: headers, language labels, timestamps, failed translations,
  chronological ordering, empty sessions, filenames, format overrides, mime types.
- Provider chain: fallback ordering, fallback labelling, verbatim-echo rejection, empty-result
  rejection, abort handling, per-engine error detail, offline-disabled failure, empty input.

Manual pass (do this in a real browser — the automated suite cannot cover a microphone):

1. `npm run dev`, open http://127.0.0.1:5173 — notebook, direction switch and empty state render.
2. Type `Hei, mitä kuuluu?` in the manual box → translation appears in the second block.
3. Switch to EN → FI, type `Good morning` → Finnish translation appears.
4. Press **Start**, allow the microphone, say a couple of sentences → interim line updates, then
   finished sentences land as entries.
5. Deny the microphone → a clear permission error appears, manual input still works.
6. Rename the session in the header; reload the page → the new name is still there.
7. Create a second session, switch between them → entries belong to the right session.
8. Delete a session → confirmation appears, entries are gone afterwards.
9. Export as `.md` and `.txt` → files download with header, timestamps and translations.
10. Toggle theme light/dark/system and reload → theme survives first paint with no flash.
11. Go offline → banner appears, an entry still saves, translation reports a clear failure.
12. Settings → Test connection → shows the engine name and a sample translation, or a real error.

## Project layout

```
src/
  components/   Header, DirectionSwitch, RecorderBar, Notebook, EntryCard,
                ManualInput, SessionDrawer, SettingsDialog, ExportMenu,
                Toasts, ConfirmDialog, Logo
  hooks/        useAppStore (state + persistence), useSpeech, useMicLevel
  lib/          db (Dexie), settings, export, speech, speechEngine, util
  lib/translate/  provider chain, offline phrasebook, memo cache
  types.ts      shared domain types and defaults
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
- Self-hosted Whisper backend to remove the browser-vendor dependency for speech.
- Vocabulary/glossary so domain terms translate consistently.

## License

Private project — add a license before distributing.
