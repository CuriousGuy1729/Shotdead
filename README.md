# Astra — AI Master Educator for JEE (Main & Advanced) and NEET

A working implementation of the **Astra** tutor persona: a formal lecturer *and* a sharp 1-on-1
private tutor for Physics, Chemistry and Mathematics. It runs two operational modes, and both
return **strict JSON** so you can wire any frontend, voice pipeline or mobile app straight onto them.

| Mode | Trigger | Shape returned |
| --- | --- | --- |
| **1 · LECTURE_MODE** | "teach me projectile motion", chapter breakdowns | `mode`, `topic`, `targetExam`, `slides[]` — each slide has `slideNumber`, `title`, `content.bullets`, `content.latexFormulas`, `content.keyTakeaway` and a TTS-ready `voiceScript` |
| **2 · VOICE_CHAT_MODE** | ongoing doubt session, follow-ups, "why?", "I didn't get step 2" | `mode`, `spokenResponse`, `uiDisplay.mathHint`, `uiDisplay.actionableTip`, `followUpPrompt` |

Live preview: **chapter library → narrated slide deck** and **voice doubt tutor** (mic + TTS),
with the exact JSON payload of everything Astra returns shown in a right-hand inspector.

---

## Run it

```bash
npm install          # only katex (vendored) + jsdom (dev, for the smoke test)
npm start            # http://0.0.0.0:3000
npm test             # content contract validation + headless UI smoke test
```

Node >= 18. No build step, no framework, no runtime dependencies beyond the vendored KaTeX.

## What is in the box

```
server.js                     zero-dep HTTP server: static files + JSON API
server/doubtEngine.js         Astra's VOICE_CHAT_MODE brain (45 rules + 18 pinpoint remediations)
server/system-prompt.txt      the persona spec handed to a live model when one is configured
public/index.html             single-page app (library / lecture player / voice tutor / contract)
public/styles.css             dark console UI
public/js/app.js              controller: views, slide player, chat, JSON inspector, settings
public/js/speech.js           AstraTTS (narration) + AstraSTT (dictation) with graceful fallback
public/content/*.json         9 lecture decks, 62 slides, ~73 min of narration — LECTURE_MODE JSON
public/vendor/katex/          KaTeX 0.16 + auto-render + mhchem, served locally (no CDN needed)
test/validate-content.js      asserts every deck obeys the contract & voiceScripts are TTS-safe
test/smoke.js                 jsdom smoke test: 38 assertions across both modes
```

## API

```
GET  /api/health                     engine in use, deck count, doubt-rule count
GET  /api/catalog                    all decks (subject, exam, slides, minutes, tags)
GET  /api/lecture?id=<deck-id>       MODE 1 → full LECTURE_MODE JSON
POST /api/doubt                      MODE 2 → VOICE_CHAT_MODE JSON
     body: {"message": "...", "history": [{"role","content"}], "contextTopic": "...", "subject": "Physics"}
GET  /api/schema                     both contracts + a live example response
```

`POST /api/doubt` example:

```jsonc
// in
{ "message": "why is work done by centripetal force zero" }

// out
{
  "mode": "VOICE_CHAT",
  "spokenResponse": "Centripetal force is not a new kind of force, it is a job description…",
  "uiDisplay": {
    "mathHint": "$F_c=\\dfrac{mv^2}{r}=m\\omega^2 r$, directed along $-\\hat r$; $W_c=0$ since $\\vec F_c\\perp\\vec v$",
    "actionableTip": "Trap: never add \"centripetal force\" as a separate arrow in a free body diagram…"
  },
  "followUpPrompt": "At the top of a vertical loop, which two forces together supply m v squared over r?",
  "intent": "concept",
  "subject": "Physics",
  "topic": "Circular motion & centripetal force",
  "engine": "offline-knowledge-base"
}
```

`intent` is one of `concept`, `remediation`, `numerical`, `lecture-request`, `exam-info`,
`greeting`, `acknowledgement`, `clarify` — the extra fields (`intent`, `subject`, `topic`,
`engine`) are additive; the four contract keys are always exactly as specified.

## Answer engine

**Offline (default).** `server/doubtEngine.js` is a curated knowledge base of the doubts JEE/NEET
students actually ask: 45 rules across Physics, Chemistry, Mathematics and exam strategy, each with a
TTS-ready `spokenResponse`, exact LaTeX for `mathHint`, a shortcut/trap and a comprehension check.
On top of that sit **18 pinpoint remediations** — when a student says *"I didn't get step 2"* the
engine resolves the step number and the current topic and explains **that transition only**, instead
of re-lecturing (interactive voice rule 3). Unmatched input degrades honestly: it asks for the
chapter and the exact line rather than bluffing.

Retrieval is keyword-phrase scoring with multi-word phrases weighted higher, biased by the
`subject`/`contextTopic` sent from the client, so a doubt raised mid-lecture stays on topic.

**Live model (optional).** Set an API key and the same endpoint is answered by a model using
`server/system-prompt.txt` (the persona spec verbatim), with automatic fallback to the offline
engine if the call fails or the model returns malformed JSON:

```bash
OPENAI_API_KEY=sk-... npm start
# optional: OPENAI_BASE_URL=https://... ASTRA_MODEL=gpt-4o-mini
```

A key can also be supplied per-request via the `x-astra-key` header (the UI's *Voice setup* dialog
stores one in the browser only). `/api/health` reports which engine is live.

## Voice

* **Narration** uses the browser's `speechSynthesis`. The `voiceScript` of every slide is written
  phonetically — *"F equals m a"*, *"root g r"*, *"ten to the minus fourteen"* — so no engine ever
  reads a backslash aloud. `speech.js` additionally strips any stray LaTeX before speaking and
  chunks long scripts at sentence boundaries.
* **Dictation** uses the Web Speech API (`SpeechRecognition`, `en-IN` by default). Where the browser
  lacks it, the mic reports that clearly and typing works identically.
* *Hands-free* mode (Voice setup) re-opens the mic as soon as Astra finishes speaking, giving a real
  back-and-forth doubt session.

Both run locally in the browser — no audio leaves the device.

## Adding a chapter

Drop a `<subject>-<slug>.json` file into `public/content/` following the LECTURE_MODE contract
(`id` must equal the filename stem) and it appears in the library on the next request — no rebuild.
`npm test` validates the contract, brace balance in every formula, and that no `voiceScript` leaked
LaTeX into the narration.

## Keyboard

`←` / `→` change slide · `space` narrate or stop · `Esc` stop audio and close dialogs · `Enter` send a doubt.
