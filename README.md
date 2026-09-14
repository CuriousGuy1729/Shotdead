# Astra — AI Master Educator for JEE (Main & Advanced) and NEET

A working implementation of the **Astra** tutor persona: a formal lecturer *and* a sharp 1-on-1
private tutor for Physics, Chemistry and Mathematics. It runs two operational modes, and both
return **strict JSON** so you can wire any frontend, voice pipeline or mobile app straight onto them.

| Mode | Trigger | Shape returned |
| --- | --- | --- |
| **1 · LECTURE_MODE** | "teach me projectile motion", chapter breakdowns | `mode`, `topic`, `targetExam`, `slides[]` — each slide has `slideNumber`, `title`, `content.bullets`, `content.latexFormulas`, `content.keyTakeaway` and a TTS-ready `voiceScript` |
| **2 · VOICE_CHAT_MODE** | ongoing doubt session, follow-ups, "why?", "I didn't get step 2" | `mode`, `spokenResponse`, `uiDisplay.mathHint`, `uiDisplay.actionableTip`, `followUpPrompt` |

Live preview: **chapter library → narrated slide deck**, **voice doubt tutor** (mic + TTS) and
**create with local model** (Qwen/Llama writes new decks and practice MCQs), with the exact JSON
payload of everything Astra returns shown in a right-hand inspector.

With no local model configured, Astra answers from its own offline knowledge base and never blocks.

---

## Run it

```bash
npm install          # only katex (vendored) + jsdom (dev, for the tests)
npm start            # http://0.0.0.0:3000
npm test             # contract validation + local-model tests + headless UI test

# optional: give Astra a local brain and a local voice
bash local-models/setup-ollama.sh    # Qwen via Ollama  -> decks, doubts, practice MCQs
bash local-models/setup-piper.sh     # Piper neural TTS -> Astra speaks locally
ASTRA_PROVIDER=ollama npm start
```

Node >= 18. No build step, no framework, no runtime dependencies beyond the vendored KaTeX.
Everything works with **no model and no audio engine installed** — those are upgrades, not requirements.

## What is in the box

```
server.js                     zero-dep HTTP server: static files + JSON API + local-model routes
server/doubtEngine.js         Astra's offline VOICE_CHAT_MODE brain (45 rules + 18 remediations)
server/providers.js           local model transports: Ollama native + OpenAI-compatible, with probing
server/generate.js            local-model generation: decks, practice MCQs, doubt answers
server/schema.js              contract validation + repair (fenced JSON, LaTeX leaks, enum aliases)
server/audio.js               local audio engines: Piper / espeak-ng TTS, whisper.cpp / faster-whisper STT
server/system-prompt.txt      the persona spec handed to a local model verbatim
public/index.html             single-page app (library / player / tutor / create / contract)
public/styles.css             dark console UI
public/js/app.js              controller: views, slide player, chat, JSON inspector, settings
public/js/speech.js           AstraTTS (narration) + AstraSTT (dictation), browser engines
public/js/local-models.js     browser-direct provider client + generation & practice panels
public/content/*.json         9 built-in decks, 62 slides, ~73 min of narration (LECTURE_MODE JSON)
public/vendor/katex/          KaTeX 0.16 + auto-render + mhchem, served locally (no CDN needed)
local-models/                 setup scripts for Ollama/Qwen, Piper TTS, Whisper STT
test/validate-content.js      asserts every deck obeys the contract & voiceScripts are TTS-safe
test/generate.test.js         64 assertions: mock local model -> generate -> repair -> save -> fallback
test/smoke.js                 jsdom UI test: 51 assertions across both modes + the local-model UI
```

## API

```
GET  /api/health                     engine, decks, rules, local model + audio status
GET  /api/catalog                    all decks (subject, exam, slides, minutes, tags)
GET  /api/lecture?id=<deck-id>       MODE 1 → full LECTURE_MODE JSON
POST /api/doubt                      MODE 2 → VOICE_CHAT_MODE JSON
     body: {"message": "...", "history": [{"role","content"}], "contextTopic": "...", "subject": "Physics"}
GET  /api/schema                     both contracts + a live example response

GET  /api/providers/status           which local model the server can reach
POST /api/providers/test             probe an endpoint (Ollama /api/tags or /v1/models)
POST /api/generate/lecture           local model writes a deck → validate → repair → save
POST /api/generate/practice          local model writes MCQs for a topic or a single slide
POST /api/generate/validate          validate raw model output (browser-direct transport)
POST /api/decks                      save a previewed deck into the library
POST /api/audio/tts                  local neural TTS (Piper / espeak-ng) → WAV
POST /api/audio/stt                  local Whisper → text
GET  /api/audio/status               detected local audio engines + their fallbacks
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

**Local model (optional).** Point Astra at a model on your own machine — Qwen, Llama, Mistral,
anything Ollama / LM Studio / llama.cpp / vLLM serves — and the same endpoint is answered by that
model using `server/system-prompt.txt` (the persona spec verbatim). Malformed JSON is repaired by
`server/schema.js`, and any failure falls back to the offline engine with the reason attached:

```bash
bash local-models/setup-ollama.sh          # installs Ollama + pulls qwen2.5:3b-instruct
ASTRA_PROVIDER=ollama ASTRA_MODEL=qwen2.5:3b-instruct npm start
```

Config priority is **request body → `x-astra-*` headers → environment**, so one server can drive
several models and the UI can switch without a restart. `/api/health` and `/api/providers/status`
report what is live.

## Local models in depth

| | Server relay (default) | Browser-direct |
| --- | --- | --- |
| Who calls the model | the Node server | the web page itself |
| Use when | Astra and the model run on the same machine, or the model is on your LAN | Astra is served from a remote host or sandbox preview but Ollama runs on **your** PC — a browser can always reach its own `localhost` |
| Setup | `ASTRA_PROVIDER=ollama npm start` | tick *Browser-direct* in Voice setup; start Ollama with `OLLAMA_ORIGINS='*'` |

### Writing a new deck

**Create with local model** → topic, subject, exam, slide count → *Generate deck*. The model is asked
for strict `LECTURE_MODE` JSON, then `server/schema.js` does the adult supervision:

* strips markdown fences and surrounding prose,
* normalises aliases (`"jee mains"` → `JEE Main`, `"maths"` → `Mathematics`),
* renames non-standard keys (`formulas` → `latexFormulas`), renumbers `slideNumber`, trims to the
  contract's limits,
* **forces the `voiceScript` TTS-safe** — LaTeX that leaked in is converted to phonetic text
  (`\frac{mv^2}{r}` → "mv squared over r", `\alpha` → "alpha"), because narration must never read a
  backslash aloud,
* reports every repair to the UI, and
* if the deck still breaks the contract, runs **one automatic repair round-trip** with the error list
  appended to the prompt.

*Save to library* then writes `public/content/<id>.json`: the generated deck is indistinguishable from
a built-in one, appears in the catalogue immediately, and records `generatedBy: {model, provider}`.
`POST /api/decks` refuses to overwrite an existing deck unless asked.

### Practice questions

On any slide, **🧪 Practice questions** sends the deck topic plus that slide's bullets as focus to the
local model and renders clickable MCQs with answer locking, explanations, a running score and
read-aloud. A model that answers `correct: "C"` is normalised to `correctIndex: 2`.

### Local audio

* **TTS** — Piper (neural, offline, CPU) is auto-detected from `.tts-venv/`, `models/piper/` or
  `PATH`, with `espeak-ng` as a fallback. `bash local-models/setup-piper.sh` installs the engine and
  an `en_IN` voice. `POST /api/audio/tts` returns a real WAV built in-process (no ffmpeg needed);
  tick *Prefer the local voice* in Voice setup to use it for every narration.
* **STT** — whisper.cpp (`ASTRA_STT_BIN` + `ASTRA_STT_MODEL`) or `faster-whisper` behind
  `POST /api/audio/stt`.
* Missing engines are reported honestly instead of breaking anything:
  `{"audio": null, "fallback": "browser-speech-synthesis"}` and the browser's own voices take over.

### Environment

```bash
ASTRA_PROVIDER=ollama|lmstudio|llamacpp|vllm|openai-compatible|openai
ASTRA_BASE_URL=http://127.0.0.1:11434      ASTRA_MODEL=qwen2.5:3b-instruct
ASTRA_API_KEY=…                            # optional; local servers accept any value
ASTRA_TTS=piper|espeak-ng|none             ASTRA_TTS_VOICE=en_IN-smartknal-medium
ASTRA_TTS_DATA_DIR=./models/piper          ASTRA_TTS_PYTHON=./.tts-venv/bin/python
ASTRA_STT=whisper-cpp|faster-whisper       ASTRA_STT_MODEL=/path/to/ggml-base.en.bin
ASTRA_GENERATE_TIMEOUT_MS=420000           # small models are slow; default 7 min
```

### Verified without weights

This sandbox has 2 vCPU / 4 GB RAM and cannot reach HuggingFace or ollama.com, so no weights could be
downloaded here. The integration is therefore proven by `test/generate.test.js` against
`test/mock-local-model.js` — a mock that misbehaves exactly like a real 3B model: fenced JSON, missing
`mode`, `formulas` instead of `latexFormulas`, LaTeX leaked into `voiceScript`, `correct: "C"`, missing
`followUpPrompt`. 64 assertions cover probing, both transports, repair, persistence, practice
generation, fallback on a dead endpoint and the audio endpoints. Piper itself installs and runs here
from PyPI; only the voice download is blocked, which is why `/api/audio/status` reports
*"Piper present, voice models missing"*.

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
