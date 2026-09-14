'use strict';

/**
 * server.js — Astra Tutor backend (zero npm runtime deps, Node >= 18)
 *
 * Serves the single-page app from /public and exposes the two Astra output
 * contracts as JSON endpoints:
 *
 *   GET  /api/catalog                     -> course catalogue
 *   GET  /api/lecture?id=<slug>           -> MODE 1: LECTURE_MODE JSON
 *   POST /api/doubt  {message,history}    -> MODE 2: VOICE_CHAT_MODE JSON
 *   GET  /api/schema                      -> both raw JSON contracts
 *
 * Optional live-model mode: set OPENAI_API_KEY (and optionally
 * OPENAI_BASE_URL / ASTRA_MODEL) and POST /api/doubt will be answered by the
 * model instead of the offline engine, using the same JSON contract.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const doubtEngine = require('./server/doubtEngine');

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
  const useCache = process.env.NODE_ENV === 'production';
  if (useCache && cache.has(filePath)) return cache.get(filePath);
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

function loadCatalog() {
  const lectures = lectureIds()
    .map(loadLecture)
    .filter(Boolean)
    .map((l) => ({
      id: l.id,
      subject: l.subject,
      topic: l.topic,
      targetExam: l.targetExam,
      tagline: l.tagline || '',
      slideCount: (l.slides || []).length,
      minutes: estimateMinutes(l),
      tags: l.tags || [],
    }));

  const order = { Physics: 0, Chemistry: 1, Mathematics: 2 };
  lectures.sort(
    (a, b) =>
      (order[a.subject] ?? 9) - (order[b.subject] ?? 9) ||
      a.targetExam.localeCompare(b.targetExam) ||
      a.topic.localeCompare(b.topic)
  );
  return { mode: 'CATALOG', generatedBy: 'astra-local', lectures };
}

function estimateMinutes(lecture) {
  const words = (lecture.slides || [])
    .map((s) => String(s.voiceScript || '').split(/\s+/).filter(Boolean).length)
    .reduce((a, b) => a + b, 0);
  return Math.max(4, Math.round(words / 140));
}

/* ------------------------------------------------------------------ *
 * Optional live model proxy (same JSON contract)
 * ------------------------------------------------------------------ */

const SYSTEM_PROMPT = fs.existsSync(path.join(ROOT, 'server', 'system-prompt.txt'))
  ? fs.readFileSync(path.join(ROOT, 'server', 'system-prompt.txt'), 'utf8')
  : '';

function llmEnabled(req) {
  const key = process.env.OPENAI_API_KEY || req.headers['x-astra-key'] || '';
  return key ? String(key).trim() : '';
}

async function askLiveModel(req, body) {
  const apiKey = llmEnabled(req);
  const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.ASTRA_MODEL || body.model || 'gpt-4o-mini';

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(Array.isArray(body.history) ? body.history.slice(-8) : []),
    { role: 'user', content: String(body.message || '') },
  ];

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.4 }),
  });

  if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const parsed = start >= 0 && end > start ? JSON.parse(raw.slice(start, end + 1)) : null;
  if (!parsed || parsed.mode !== 'VOICE_CHAT') throw new Error('model did not return VOICE_CHAT JSON');
  parsed.engine = `live:${model}`;
  return parsed;
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
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, payload, headers = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'content-type': typeof payload === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type,x-astra-key',
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2e6) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const route = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, '');

  try {
    if (route === '/api/health') {
      return send(res, 200, {
        ok: true,
        app: 'astra-tutor',
        engine: llmEnabled(req) ? 'live-model' : 'offline-knowledge-base',
        lectures: lectureIds().length,
        doubtRules: doubtEngine.stats().rules,
        time: new Date().toISOString(),
      });
    }

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
        liveExample: doubtEngine.answer({ message: 'why is work done by centripetal force zero' }).json,
      });
    }

    if (route === '/api/doubt' && req.method === 'POST') {
      const body = await readBody(req);
      const message = String(body.message || '').trim();
      if (!message) return send(res, 400, { error: 'message is required' });

      if (llmEnabled(req)) {
        try {
          return send(res, 200, await askLiveModel(req, { ...body, message }));
        } catch (err) {
          const fallback = doubtEngine.answer({
            message,
            history: body.history,
            subject: body.subject,
            contextTopic: body.contextTopic,
          });
          fallback.json.engine = 'offline-knowledge-base (live model failed)';
          fallback.json.engineNote = String(err.message || err).slice(0, 200);
          return send(res, 200, fallback.json);
        }
      }

      const result = doubtEngine.answer({
        message,
        history: body.history,
        subject: body.subject,
        contextTopic: body.contextTopic,
      });
      return send(res, 200, result.json);
    }

    if (route.startsWith('/api/')) return send(res, 404, { error: 'unknown endpoint' });

    return serveStatic(req, res, route);
  } catch (err) {
    return send(res, 500, { error: String(err.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Astra Tutor running  ->  http://${HOST}:${PORT}`);
  console.log(`  Lectures: ${lectureIds().length}   Doubt rules: ${doubtEngine.stats().rules}`);
  console.log(
    `  Engine: ${llmEnabled({ headers: {} }) ? 'live model (OPENAI_API_KEY set)' : 'offline knowledge base'}\n`
  );
});
