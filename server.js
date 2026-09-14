'use strict';

/**
 * server.js — Astra Tutor backend (zero npm runtime deps, Node >= 18)
 *
 * Serves the single-page app from /public and exposes Astra's contracts plus
 * the local-model integration:
 *
 *   GET  /api/health                     engine, decks, rules, local model + audio status
 *   GET  /api/catalog                    course catalogue
 *   GET  /api/lecture?id=<slug>          MODE 1: LECTURE_MODE JSON
 *   POST /api/doubt                      MODE 2: VOICE_CHAT_MODE JSON
 *   GET  /api/schema                     both contracts + a live example
 *
 *   GET  /api/providers/status           what the server can reach
 *   POST /api/providers/test             probe a local model endpoint
 *   POST /api/generate/lecture           local model writes a new deck (optionally saves it)
 *   POST /api/generate/practice          local model writes MCQs for a topic/slide
 *   POST /api/audio/tts                  local neural TTS (Piper/espeak-ng) -> WAV
 *   POST /api/audio/stt                  local Whisper -> text
 *   GET  /api/audio/status               detected local audio engines
 *
 * Local model config priority: request body -> x-astra-* headers -> env
 * (ASTRA_PROVIDER / ASTRA_BASE_URL / ASTRA_MODEL / ASTRA_API_KEY, or
 * OPENAI_API_KEY / OPENAI_BASE_URL). With nothing configured, Astra answers
 * from its offline knowledge base and never blocks.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const doubtEngine = require('./server/doubtEngine');
const providers = require('./server/providers');
const audio = require('./server/audio');
const generate = require('./server/generate');
const schema = require('./server/schema');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONTENT_DIR = path.join(PUBLIC_DIR, 'content');

/* ------------------------------------------------------------------ *
 * Content loading
 * ------------------------------------------------------------------ */

const cache = new Map();

function readJson(filePath) {
  if (process.env.NODE_ENV === 'production' && cache.has(filePath)) return cache.get(filePath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  cache.set(filePath, data);
  return data;
}

function lectureIds() {
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'catalog.json')
    .map((f) => f.replace(/\.json$/, ''));
}

function loadLecture(id) {
  if (!/^[a-z0-9._-]+$/i.test(String(id || ''))) return null;
  const file = path.join(CONTENT_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return readJson(file);
}

function estimateMinutes(lecture) {
  const words = (lecture.slides || [])
    .map((s) => String(s.voiceScript || '').split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  return Math.max(4, Math.round(words / 140));
}

function summarise(lecture) {
  return {
    id: lecture.id,
    subject: lecture.subject,
    topic: lecture.topic,
    targetExam: lecture.targetExam,
    tagline: lecture.tagline || '',
    slideCount: (lecture.slides || []).length,
    minutes: estimateMinutes(lecture),
    tags: lecture.tags || [],
    generated: lecture.generatedBy || null,
  };
}

function loadCatalog() {
  const lectures = lectureIds().map(loadLecture).filter(Boolean).map(summarise);
  const order = { Physics: 0, Chemistry: 1, Mathematics: 2 };
  lectures.sort(
    (a, b) =>
      (order[a.subject] ?? 9) - (order[b.subject] ?? 9) ||
      a.targetExam.localeCompare(b.targetExam) ||
      a.topic.localeCompare(b.topic)
  );
  return { mode: 'CATALOG', generatedBy: 'astra-local', lectures };
}

/* ------------------------------------------------------------------ *
 * HTTP helpers
 * ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.sh': 'text/plain; charset=utf-8',
};

function send(res, status, payload, headers = {}) {
  const isJson = typeof payload !== 'string' && !Buffer.isBuffer(payload);
  const body = isJson ? JSON.stringify(payload, null, 2) : payload;
  res.writeHead(status, {
    'content-type': isJson
      ? 'application/json; charset=utf-8'
      : Buffer.isBuffer(payload)
        ? headers['content-type'] || 'application/octet-stream'
        : 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-astra-key,x-astra-provider,x-astra-base-url,x-astra-model',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    ...headers,
  });
  res.end(body);
}

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'forbidden');

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, 'not found');
    const ext = path.extname(filePath).toLowerCase();
    const isVendor = filePath.includes(`${path.sep}vendor${path.sep}`);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'content-length': stat.size,
      'cache-control': isVendor ? 'public, max-age=604800' : 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req, limit = 4e6, asBuffer = false) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const buf = Buffer.concat(chunks);
      if (asBuffer) return resolve(buf);
      if (!buf.length) return resolve({});
      try {
        resolve(JSON.parse(buf.toString('utf8')));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/** Effective engine label for the UI pill. */
function engineLabel(cfg) {
  if (cfg) return `${cfg.provider}:${cfg.model}`;
  return 'offline-knowledge-base';
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  try {
    /* ---------- status ---------- */

    if (route === '/api/health') {
      const cfg = providers.resolveConfig({ headers: req.headers });
      return send(res, 200, {
        ok: true,
        app: 'astra-tutor',
        engine: cfg ? 'local-model' : 'offline-knowledge-base',
        model: cfg ? { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl } : null,
        tts: audio.ttsStatus(),
        stt: audio.sttStatus(),
        lectures: lectureIds().length,
        doubtRules: doubtEngine.stats().rules,
        time: new Date().toISOString(),
      });
    }

    if (route === '/api/audio/status') {
      return send(res, 200, { tts: audio.ttsStatus(), stt: audio.sttStatus() });
    }

    if (route === '/api/providers/status') {
      return send(res, 200, await providers.status());
    }

    /* ---------- content ---------- */

    if (route === '/api/catalog') return send(res, 200, loadCatalog());

    if (route === '/api/lecture') {
      const lecture = loadLecture(url.searchParams.get('id'));
      if (!lecture) return send(res, 404, { error: 'lecture not found' });
      return send(res, 200, lecture);
    }

    if (route === '/api/schema') {
      return send(res, 200, {
        LECTURE_MODE: doubtEngine.SCHEMA.lecture,
        VOICE_CHAT_MODE: doubtEngine.SCHEMA.voiceChat,
        PRACTICE: {
          mode: 'PRACTICE',
          topic: '<string>',
          targetExam: '<JEE Advanced | JEE Main | NEET>',
          questions: [
            {
              number: 1,
              question: '<string>',
              options: ['<string>', '<string>', '<string>', '<string>'],
              correctIndex: 0,
              explanation: '<string>',
              difficulty: 'easy | medium | hard',
              exam: '<JEE Advanced | JEE Main | NEET>',
            },
          ],
        },
        liveExample: doubtEngine.answer({ message: 'why is work done by centripetal force zero' }).json,
      });
    }

    /* ---------- local model providers ---------- */

    if (route === '/api/providers/test' && req.method === 'POST') {
      const body = await readBody(req);
      const cfg = providers.resolveConfig({ body, headers: req.headers });
      if (!cfg) return send(res, 400, { ok: false, error: 'no provider given (body.provider or ASTRA_PROVIDER)' });
      const probe = await providers.testConnection(cfg);
      return send(res, probe.ok ? 200 : 200, { ...probe, config: { provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model, api: cfg.api } });
    }

    /* ---------- generation ---------- */

    if (route === '/api/generate/lecture' && req.method === 'POST') {
      const body = await readBody(req, 2e6);
      const cfg = providers.resolveConfig({ body, headers: req.headers });
      if (!cfg) {
        return send(res, 400, {
          error: 'no local model configured',
          hint: 'Send {provider:"ollama"} (or lmstudio / llamacpp / vllm / openai-compatible with baseUrl), or start the server with ASTRA_PROVIDER=ollama. Browser-direct mode also works from the UI.',
          known: providers.DEFAULTS,
        });
      }
      if (!String(body.topic || '').trim()) return send(res, 400, { error: 'topic is required' });

      // Browser-direct transport: the page already called the local model, we
      // just validate/repair and optionally persist the result.
      if (body.rawModelOutput) {
        const parsed = schema.extractJson(body.rawModelOutput);
        if (!parsed) return send(res, 422, { error: 'the model output contained no parseable JSON', preview: String(body.rawModelOutput).slice(0, 400) });
        const checked = schema.validateLecture(parsed, {
          topic: body.topic,
          targetExam: body.targetExam,
          subject: body.subject || null,
          maxSlides: 12,
          minSlides: 3,
        });
        const deck = checked.value;
        deck.id = schema.slugify(`${(body.subject || deck.subject || 'gen').toLowerCase()}-${body.topic}`);
        deck.generatedBy = { model: body.model || 'local-model', provider: body.provider || 'browser-direct', attempts: 1, generatedAt: new Date().toISOString() };
        let saved = null;
        if (body.save) {
          try {
            saved = generate.saveDeck(deck, { overwrite: !!body.overwrite });
          } catch (err) {
            saved = { error: err.message, code: err.code };
          }
        }
        return send(res, 200, {
          ok: checked.ok && deck.slides.length >= 3,
          deck,
          validation: { errors: checked.errors, warnings: checked.warnings },
          engine: `browser-direct:${deck.generatedBy.model}`,
          saved,
        });
      }

      try {
        const out = await generate.generateLecture({
          cfg,
          topic: body.topic,
          targetExam: body.targetExam,
          subject: body.subject || null,
          slideCount: body.slideCount,
          audience: body.audience || null,
        });

        let saved = null;
        if (body.save) {
          try {
            saved = generate.saveDeck(out.deck, { overwrite: !!body.overwrite });
          } catch (err) {
            saved = { error: err.message, code: err.code };
          }
        }

        return send(res, 200, {
          ok: out.ok,
          deck: out.deck,
          validation: out.validation,
          attempts: out.attempts,
          elapsedMs: out.elapsedMs,
          engine: engineLabel(cfg),
          saved,
        });
      } catch (err) {
        return send(res, 502, {
          error: String(err.message || err),
          hint: 'Is the local model server running and is the model name exact (ollama list)? Large decks on a 3B model can exceed the timeout — try fewer slides.',
          attempts: err.attempts || null,
          elapsedMs: err.elapsedMs || null,
          config: { provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model },
        });
      }
    }

    if (route === '/api/generate/practice' && req.method === 'POST') {
      const body = await readBody(req, 2e6);
      const cfg = providers.resolveConfig({ body, headers: req.headers });
      if (!cfg) return send(res, 400, { error: 'no local model configured', known: providers.DEFAULTS });
      if (!String(body.topic || '').trim()) return send(res, 400, { error: 'topic is required' });

      if (body.rawModelOutput) {
        const parsed = schema.extractJson(body.rawModelOutput);
        if (!parsed) return send(res, 422, { error: 'the model output contained no parseable JSON' });
        const checked = schema.validatePractice(parsed, { topic: body.topic, targetExam: body.targetExam, max: 10 });
        return send(res, 200, {
          ok: checked.ok,
          practice: checked.value,
          validation: { errors: checked.errors, warnings: checked.warnings },
          engine: `browser-direct:${body.model || 'local-model'}`,
        });
      }

      try {
        const out = await generate.generatePractice({
          cfg,
          topic: body.topic,
          targetExam: body.targetExam,
          count: body.count,
          focus: body.focus || null,
          difficulty: body.difficulty || null,
        });
        return send(res, 200, {
          ok: out.ok,
          practice: out.practice,
          validation: out.validation,
          attempts: out.attempts,
          elapsedMs: out.elapsedMs,
          engine: engineLabel(cfg),
        });
      } catch (err) {
        return send(res, 502, { error: String(err.message || err), attempts: err.attempts || null, config: { provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model } });
      }
    }

    /* ---------- validate raw model output (browser-direct transport) ---------- */

    if (route === '/api/generate/validate' && req.method === 'POST') {
      const body = await readBody(req, 6e6);
      const raw = body.rawModelOutput != null ? body.rawModelOutput : body.raw;
      if (!raw) return send(res, 400, { error: 'rawModelOutput is required' });
      const parsed = schema.extractJson(raw);
      if (!parsed) {
        return send(res, 422, {
          ok: false,
          error: 'the model output contained no parseable JSON',
          preview: String(raw).slice(0, 400),
        });
      }
      if (body.kind === 'practice') {
        const out = schema.validatePractice(parsed, { topic: body.topic, targetExam: body.targetExam, max: 10 });
        return send(res, 200, { ok: out.ok, practice: out.value, validation: { errors: out.errors, warnings: out.warnings } });
      }
      const out = schema.validateLecture(parsed, {
        topic: body.topic,
        targetExam: body.targetExam,
        subject: body.subject || null,
        maxSlides: 12,
        minSlides: 3,
      });
      const deck = out.value;
      deck.id = schema.slugify(`${(body.subject || deck.subject || 'gen').toLowerCase()}-${body.topic || deck.topic}`);
      deck.generatedBy = {
        model: body.model || 'local-model',
        provider: body.provider || 'browser-direct',
        attempts: 1,
        generatedAt: new Date().toISOString(),
      };
      return send(res, 200, {
        ok: out.ok && deck.slides.length >= 3,
        deck,
        validation: { errors: out.errors, warnings: out.warnings },
        engine: `${deck.generatedBy.provider}:${deck.generatedBy.model}`,
      });
    }

    /* ---------- save a generated deck into the library ---------- */

    if (route === '/api/decks' && req.method === 'POST') {
      const body = await readBody(req, 6e6);
      const rawDeck = body.deck;
      if (!rawDeck) return send(res, 400, { error: 'deck is required' });
      const checked = schema.validateLecture(rawDeck, {
        topic: rawDeck.topic,
        targetExam: rawDeck.targetExam,
        subject: rawDeck.subject,
        maxSlides: 12,
        minSlides: 3,
      });
      if (!checked.ok || checked.value.slides.length < 3) {
        return send(res, 422, { error: 'deck does not satisfy the LECTURE_MODE contract', details: checked.errors });
      }
      try {
        const saved = generate.saveDeck(checked.value, { overwrite: !!body.overwrite });
        return send(res, 200, { ok: true, id: saved.id, file: path.relative(ROOT, saved.file), validation: checked.warnings });
      } catch (err) {
        return send(res, err.code === 'EXISTS' ? 409 : 500, { error: err.message });
      }
    }

    /* ---------- local audio ---------- */

    if (route === '/api/audio/tts' && req.method === 'POST') {
      const body = await readBody(req, 2e6);
      const text = schema.sanitizeForTts(body.text || '');
      if (!text) return send(res, 400, { error: 'text is required' });

      const out = await audio.synthesize(text, { voice: body.voice, lengthScale: body.lengthScale, rate: body.rate });
      if (out?.wav) {
        return send(res, 200, out.wav, {
          'content-type': 'audio/wav',
          'x-astra-tts-provider': out.provider,
          'x-astra-tts-voice': out.voice || '',
        });
      }
      return send(res, 200, {
        audio: null,
        fallback: 'browser-speech-synthesis',
        status: audio.ttsStatus(),
        error: out?.error || null,
        hint: 'Install a local voice: bash local-models/setup-piper.sh (needs internet once, for the voice model).',
      });
    }

    if (route === '/api/audio/stt' && req.method === 'POST') {
      const buf = await readBody(req, 25e6, true);
      const out = await audio.transcribe(buf, req.headers['content-type']);
      if (out?.text) return send(res, 200, out);
      return send(res, 200, {
        text: null,
        fallback: 'browser-speech-recognition',
        status: audio.sttStatus(),
        error: out?.error || null,
      });
    }

    /* ---------- MODE 2: doubt answering ---------- */

    if (route === '/api/doubt' && req.method === 'POST') {
      const body = await readBody(req);
      const message = String(body.message || '').trim();
      if (!message) return send(res, 400, { error: 'message is required' });

      const cfg = providers.resolveConfig({ body, headers: req.headers });
      const offline = () =>
        doubtEngine.answer({
          message,
          history: body.history,
          subject: body.subject,
          contextTopic: body.contextTopic,
        }).json;

      if (!cfg) return send(res, 200, offline());

      try {
        const out = await generate.generateVoiceChat({
          cfg,
          message,
          history: body.history,
          contextTopic: body.contextTopic,
          subject: body.subject,
        });
        out.result.engine = `local-model:${out.attempts[out.attempts.length - 1].model}`;
        out.result.model = out.attempts[out.attempts.length - 1].model;
        if (out.validation.warnings?.length) out.result.repairNotes = out.validation.warnings;
        return send(res, 200, out.result);
      } catch (err) {
        const fallback = offline();
        fallback.engine = 'offline-knowledge-base (local model failed)';
        fallback.engineNote = String(err.message || err).slice(0, 240);
        return send(res, 200, fallback);
      }
    }

    if (route.startsWith('/api/')) return send(res, 404, { error: 'unknown endpoint' });

    return serveStatic(req, res, route);
  } catch (err) {
    return send(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  const cfg = providers.resolveConfig({ headers: {} });
  const tts = audio.ttsStatus();
  const stt = audio.sttStatus();
  console.log(`\n  Astra Tutor running  ->  http://${HOST}:${PORT}`);
  console.log(`  Lectures: ${lectureIds().length}   Doubt rules: ${doubtEngine.stats().rules}`);
  console.log(`  Model engine : ${cfg ? `${cfg.provider} @ ${cfg.baseUrl} (${cfg.model})` : 'offline knowledge base (no local model configured)'}`);
  console.log(`  Local TTS    : ${tts.provider}${tts.voice ? ` / ${tts.voice}` : ''}`);
  console.log(`  Local STT    : ${stt.provider}\n`);
});
