'use strict';

/**
 * generate.test.js — local-model integration tests.
 *
 * Spins up a mock Ollama/LM Studio-class server that answers like a real small
 * local model (fenced JSON, missing keys, LaTeX leaking into the voiceScript),
 * then drives Astra's server against it. Proves the whole path works offline:
 * provider resolution -> generation -> extraction -> validation/repair ->
 * persistence -> library.
 *
 *   node test/generate.test.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const mock = require('./mock-local-model');
const schema = require('../server/schema');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'public', 'content');
const PORT = process.env.TEST_PORT || 4399;
const BASE = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const failures = [];

function ok(name, cond, extra = '') {
  checks.push(name);
  if (!cond) failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
  console.log(`  ${cond ? '\u2713' : '\u2717'} ${name}${cond || !extra ? '' : ` — ${extra}`}`);
}

async function waitForServer(timeout = 15000) {
  for (let i = 0; i < timeout / 150; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(150);
  }
  throw new Error('Astra server did not start');
}

/* ------------------------------------------------------------------ *
 * Unit tests: the contract validator itself
 * ------------------------------------------------------------------ */

function unitTests() {
  console.log('\nschema.js');

  ok('extracts JSON from a markdown fence', schema.extractJson('```json\n{"a":1}\n```')?.a === 1);
  ok('extracts JSON wrapped in prose', schema.extractJson('Sure! Here you go:\n{"a":2}\nHope that helps.')?.a === 2);
  ok('returns null for garbage', schema.extractJson('I cannot help with that.') === null);

  const phonetic = schema.latexToPhonetic('$F_c=\\frac{mv^2}{r}$ and $\\alpha=\\sqrt{gR}$');
  ok('latexToPhonetic removes commands', !/[\\$]/.test(phonetic), phonetic);
  ok('latexToPhonetic reads fractions', /over/.test(phonetic), phonetic);
  ok('latexToPhonetic reads greek', /alpha/.test(phonetic), phonetic);

  const lecture = schema.validateLecture({
    topic: 'Test',
    targetExam: 'jee mains',
    subject: 'maths',
    slides: [
      { title: 'A', content: { bullets: ['b1'], formulas: ['x^2'], keyTakeaway: 'k' }, voiceScript: 'The value is $x^2$ and it matters.' },
      { title: 'B', content: { bullets: ['b2'], latexFormulas: ['y^2'], keyTakeaway: 'k2' }, voiceScript: 'Second slide narration goes here for the audio.' },
    ],
  });
  ok('normalises targetExam alias', lecture.value.targetExam === 'JEE Main', lecture.value.targetExam);
  ok('normalises subject alias', lecture.value.subject === 'Mathematics', lecture.value.subject);
  ok('renumbers slideNumber', lecture.value.slides[1].slideNumber === 2);
  ok('reads formulas from a non-standard key', lecture.value.slides[0].content.latexFormulas[0] === 'x^2');
  ok('strips LaTeX out of the voiceScript', !/[\\$]/.test(lecture.value.slides[0].voiceScript), lecture.value.slides[0].voiceScript);
  ok('reports repairs as warnings', lecture.warnings.length >= 3, `${lecture.warnings.length} warnings`);
  ok('still marks the deck usable', lecture.ok === true);

  const chat = schema.validateVoiceChat({
    spokenResponse: 'Because $F=ma$ applies here.',
    uiDisplay: { mathHint: '$F=ma$', actionableTip: 'tip' },
    followUpPrompt: 'ok?',
  });
  ok('voice chat: keeps the four contract keys', Object.keys(chat.value).slice(0, 4).join(',') === 'mode,spokenResponse,uiDisplay,followUpPrompt');
  ok('voice chat: spoken text is latex-free', !/[\\$]/.test(chat.value.spokenResponse), chat.value.spokenResponse);
  ok('voice chat: warns on long answers', schema.validateVoiceChat({ spokenResponse: Array(140).fill('word').join(' '), uiDisplay: {} }).warnings.some((w) => /long/.test(w)));

  const practice = schema.validatePractice(
    [{ question: 'q', options: ['a', 'b', 'c', 'd'], correct: 'C', explanation: 'e', difficulty: 'HARD' }],
    { topic: 't', targetExam: 'neet' }
  );
  ok('practice: letter answer becomes an index', practice.value.questions[0].correctIndex === 2);
  ok('practice: difficulty lowercased', practice.value.questions[0].difficulty === 'hard');
  ok('practice: exam normalised', practice.value.questions[0].exam === 'NEET');
}

/* ------------------------------------------------------------------ *
 * Integration tests against a mock local model
 * ------------------------------------------------------------------ */

async function integrationTests() {
  const mockOllama = await mock.start({ mode: 'ollama' });
  const mockLm = await mock.start({ mode: 'openai' });

  const serverProc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverLog = '';
  serverProc.stdout.on('data', (d) => (serverLog += d));
  serverProc.stderr.on('data', (d) => (serverLog += d));

  try {
    await waitForServer();
    console.log('\nproviders');

    const post = (p, body) => fetch(`${BASE}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    // ---- connection probing ----
    let res = await post('/api/providers/test', { provider: 'ollama', baseUrl: mockOllama.baseUrl(), model: 'qwen2.5:3b-instruct' });
    let probe = await res.json();
    ok('ollama probe succeeds', probe.ok === true, JSON.stringify(probe).slice(0, 120));
    ok('ollama probe lists local models', (probe.models || []).some((m) => m.includes('qwen2.5')), JSON.stringify(probe.models));

    res = await post('/api/providers/test', { provider: 'lmstudio', baseUrl: mockLm.baseUrl(), model: 'qwen2.5-3b-instruct' });
    probe = await res.json();
    ok('openai-compatible probe succeeds', probe.ok === true, JSON.stringify(probe).slice(0, 120));

    res = await post('/api/providers/test', { provider: 'ollama', baseUrl: 'http://127.0.0.1:59999' });
    probe = await res.json();
    ok('dead endpoint fails cleanly with a hint', probe.ok === false && !!probe.hint, probe.error);

    // ---- lecture generation (server relay -> ollama native API) ----
    console.log('\ngenerate/lecture');
    res = await post('/api/generate/lecture', {
      topic: 'Rotational motion — moment of inertia and angular momentum',
      subject: 'Physics',
      targetExam: 'JEE Advanced',
      slideCount: 4,
      save: true,
      provider: 'ollama',
      baseUrl: mockOllama.baseUrl(),
      model: 'qwen2.5:3b-instruct',
    });
    const gen = await res.json();
    ok('generation endpoint returns 200', res.status === 200, `status ${res.status}: ${gen.error || ''}`);
    ok('deck passes the contract after repair', gen.ok === true, JSON.stringify(gen.validation));
    ok('deck has mode LECTURE', gen.deck?.mode === 'LECTURE');
    ok('deck topic preserved', /Rotational motion/.test(gen.deck?.topic || ''));
    ok('deck targetExam preserved', gen.deck?.targetExam === 'JEE Advanced');
    ok('every slide numbered in order', gen.deck.slides.every((s, i) => s.slideNumber === i + 1));
    ok('every slide has all contract keys', gen.deck.slides.every((s) => s.title && s.content && Array.isArray(s.content.bullets) && Array.isArray(s.content.latexFormulas) && s.content.keyTakeaway && s.voiceScript));
    ok('voiceScripts are TTS-safe (no LaTeX)', gen.deck.slides.every((s) => !/[\\$]/.test(s.voiceScript)), gen.deck.slides.find((s) => /[\\$]/.test(s.voiceScript))?.voiceScript?.slice(0, 80));
    ok('non-standard "formulas" key was repaired', gen.validation.warnings.some((w) => /non-standard key/.test(w)));
    ok('repairs are reported to the user', gen.validation.warnings.length > 0, `${gen.validation.warnings.length} warnings`);
    ok('provenance recorded', !!gen.deck.generatedBy?.model, JSON.stringify(gen.deck.generatedBy));
    ok('elapsed time reported', typeof gen.elapsedMs === 'number' && gen.elapsedMs >= 0);

    // saved into the library?
    const savedId = gen.saved?.id;
    ok('deck saved into public/content', !!savedId && fs.existsSync(path.join(CONTENT_DIR, `${savedId}.json`)), JSON.stringify(gen.saved));

    res = await fetch(`${BASE}/api/catalog`);
    const catalog = await res.json();
    ok('saved deck appears in the catalogue', catalog.lectures.some((l) => l.id === savedId));
    ok('catalogue flags generated decks', catalog.lectures.find((l) => l.id === savedId)?.generated?.model?.includes('qwen'));

    res = await fetch(`${BASE}/api/lecture?id=${encodeURIComponent(savedId)}`);
    const reloaded = await res.json();
    ok('saved deck reloads through /api/lecture', res.status === 200 && reloaded.slides.length === gen.deck.slides.length);

    // duplicate protection
    res = await post('/api/generate/lecture', {
      topic: 'Rotational motion — moment of inertia and angular momentum',
      subject: 'Physics',
      targetExam: 'JEE Advanced',
      slideCount: 4,
      save: true,
      provider: 'ollama',
      baseUrl: mockOllama.baseUrl(),
    });
    const dup = await res.json();
    ok('re-saving without overwrite reports the conflict', dup.saved?.code === 'EXISTS' || dup.saved?.error, JSON.stringify(dup.saved));

    // ---- openai-compatible relay ----
    res = await post('/api/generate/lecture', {
      topic: 'Test deck via LM Studio relay',
      subject: 'Physics',
      targetExam: 'NEET',
      slideCount: 4,
      provider: 'lmstudio',
      baseUrl: mockLm.baseUrl(),
      model: 'qwen2.5-3b-instruct',
    });
    const lmGen = await res.json();
    ok('openai-compatible relay also generates', lmGen.ok === true && lmGen.engine.includes('lmstudio'), lmGen.engine || lmGen.error);

    // ---- browser-direct transport ----
    console.log('\ngenerate/validate (browser-direct transport)');
    const rawOutput = '```json\n' + JSON.stringify(require('./mock-local-model').messyLecture('p-block', 'NEET')) + '\n```';
    res = await post('/api/generate/validate', {
      rawModelOutput: rawOutput,
      kind: 'lecture',
      topic: 'p-block',
      subject: 'Chemistry',
      targetExam: 'NEET',
      model: 'qwen2.5:3b-instruct',
      provider: 'browser-direct',
    });
    const validated = await res.json();
    ok('raw browser-direct output validates', validated.ok === true, JSON.stringify(validated.validation?.errors));
    ok('validate repairs the same way as generate', validated.deck.slides.every((s) => !/[\\$]/.test(s.voiceScript)));

    res = await post('/api/generate/validate', { rawModelOutput: 'sorry, I cannot do that', kind: 'lecture', topic: 'x' });
    ok('unparseable model output is rejected with 422', res.status === 422);

    res = await post('/api/decks', { deck: validated.deck });
    const saveOut = await res.json();
    ok('POST /api/decks persists a previewed deck', res.status === 200 && !!saveOut.id, JSON.stringify(saveOut).slice(0, 140));

    // ---- practice questions ----
    console.log('\ngenerate/practice');
    res = await post('/api/generate/practice', {
      topic: 'Rotational motion',
      targetExam: 'JEE Advanced',
      count: 4,
      provider: 'ollama',
      baseUrl: mockOllama.baseUrl(),
      model: 'qwen2.5:3b-instruct',
    });
    const practice = await res.json();
    ok('practice questions generated', practice.ok === true && practice.practice.questions.length === 2, JSON.stringify(practice).slice(0, 140));
    ok('letter answer normalised to an index', practice.practice.questions[0].correctIndex === 0);
    ok('practice mode label set', practice.practice.mode === 'PRACTICE');
    ok('questions carry exam + difficulty', practice.practice.questions.every((q) => q.exam && ['easy', 'medium', 'hard'].includes(q.difficulty)));

    // ---- doubt answering through the local model ----
    console.log('\ndoubt via local model');
    res = await post('/api/doubt', {
      message: 'why does a skater spin faster when she pulls her arms in',
      provider: 'lmstudio',
      baseUrl: mockLm.baseUrl(),
      model: 'qwen2.5-3b-instruct',
    });
    const doubt = await res.json();
    ok('local model answers in VOICE_CHAT_MODE', doubt.mode === 'VOICE_CHAT', JSON.stringify(doubt).slice(0, 120));
    ok('answer carries the four contract keys', ['spokenResponse', 'uiDisplay', 'followUpPrompt'].every((k) => k in doubt));
    ok('spokenResponse is non-empty and latex-free', doubt.spokenResponse.length > 20 && !/[\\$]/.test(doubt.spokenResponse), doubt.spokenResponse);
    ok('mathHint keeps the exact LaTeX', /\\omega/.test(doubt.uiDisplay.mathHint), doubt.uiDisplay.mathHint);
    ok('missing followUpPrompt is reported as a repair note', (doubt.repairNotes || []).some((w) => /followUpPrompt/.test(w)), JSON.stringify(doubt.repairNotes));
    ok('answer is labelled with the model', /local-model|mock/.test(doubt.engine || ''), doubt.engine);

    // ---- failure -> offline fallback ----
    res = await post('/api/doubt', { message: 'explain friction', provider: 'ollama', baseUrl: 'http://127.0.0.1:59998' });
    const fallback = await res.json();
    ok('dead model falls back to the offline engine', fallback.mode === 'VOICE_CHAT' && /offline/.test(fallback.engine || ''), fallback.engine);
    ok('fallback explains itself in engineNote', !!fallback.engineNote);

    // ---- no provider configured -> offline, never blocks ----
    res = await post('/api/doubt', { message: 'what is the limiting reagent' });
    const offline = await res.json();
    ok('no provider still answers offline', offline.mode === 'VOICE_CHAT' && offline.engine === 'offline-knowledge-base');

    res = await post('/api/generate/lecture', { topic: 'anything' });
    ok('generate without a provider returns a helpful 400', res.status === 400 && (await res.json()).hint);

    // ---- audio endpoints degrade gracefully ----
    console.log('\nlocal audio');
    res = await fetch(`${BASE}/api/audio/status`);
    const audioStatus = await res.json();
    ok('audio status reports both engines', 'tts' in audioStatus && 'stt' in audioStatus);
    ok('audio status names the fallback', audioStatus.tts.fallback === 'browser-speech-synthesis' && audioStatus.stt.fallback === 'browser-speech-recognition');

    res = await post('/api/audio/tts', { text: 'Astra speaking. The centripetal force does zero work.' });
    const audioOut = await res.json();
    const isWav = (res.headers.get('content-type') || '').startsWith('audio/');
    ok(
      'tts either returns WAV or a clean fallback',
      isWav || (audioOut.audio === null && audioOut.fallback === 'browser-speech-synthesis'),
      isWav ? 'wav returned' : JSON.stringify(audioOut).slice(0, 120)
    );
    ok('tts fallback ships the install hint', isWav || !!audioOut.hint);

    // clean up decks created by this run
    for (const id of [savedId, saveOut.id].filter(Boolean)) {
      const file = path.join(CONTENT_DIR, `${id}.json`);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    ok('test decks cleaned up', ![savedId, saveOut.id].filter(Boolean).some((id) => fs.existsSync(path.join(CONTENT_DIR, `${id}.json`))));
  } finally {
    serverProc.kill();
    await mockOllama.close();
    await mockLm.close();
  }

  return serverLog;
}

(async () => {
  unitTests();
  await integrationTests();

  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log(`  x ${f}`));
  }
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('TEST CRASHED:', err);
  process.exit(1);
});
