'use strict';

/**
 * generate.js — new material from a LOCAL model (Qwen, Llama, Mistral, …).
 *
 *   generateLecture()   topic + exam  -> full LECTURE_MODE deck
 *   generatePractice()  topic/slide   -> MCQs with worked explanations
 *   generateVoiceChat() doubt         -> VOICE_CHAT_MODE JSON
 *
 * Every path goes through the same discipline: prompt for strict JSON, extract
 * it from whatever the model actually returned, validate + repair against the
 * contract (server/schema.js), then report the repairs. A 3B local model rarely
 * returns perfect JSON on the first try, so one repair round-trip is automatic.
 */

const fs = require('node:fs');
const path = require('node:path');

const providers = require('./providers');
const schema = require('./schema');

const ROOT = path.join(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'public', 'content');
const SYSTEM_PROMPT = fs.existsSync(path.join(ROOT, 'server', 'system-prompt.txt'))
  ? fs.readFileSync(path.join(ROOT, 'server', 'system-prompt.txt'), 'utf8')
  : '';

/* ------------------------------------------------------------------ *
 * Prompts
 * ------------------------------------------------------------------ */

function fewShotSlide() {
  return JSON.stringify(
    {
      slideNumber: 1,
      title: 'Centripetal force is a role, not a new force',
      content: {
        bullets: [
          'The net inward force from tension, friction, normal reaction or gravity plays the centripetal role.',
          'It is always perpendicular to the instantaneous velocity, so it changes direction but never speed.',
          'Because the force and displacement stay perpendicular, the work done is zero.',
        ],
        latexFormulas: ['\\sum F_{radial}=\\frac{mv^2}{r}=m\\omega^2 r', 'W=\\vec F\\cdot\\vec s=0\\ \\text{since}\\ \\vec F\\perp\\vec s'],
        keyTakeaway: 'Never add a separate "centripetal force" arrow to a free body diagram.',
      },
      voiceScript:
        'The step that trips people is treating centripetal force as an extra arrow. It is not added, it is the name of the net inward force you already have. Because it stays perpendicular to the velocity, it bends the path but never changes the speed, so the work done is zero.',
    },
    null,
    2
  );
}

function lecturePrompt({ topic, targetExam, subject, slideCount, audience }) {
  return `Create a lecture deck for a ${audience || targetExam} student.

TOPIC   : ${topic}
SUBJECT : ${subject || 'infer it from the topic'}
EXAM    : ${targetExam}
SLIDES  : exactly ${slideCount}

Return ONE JSON object and nothing else — no markdown fence, no commentary. Shape:
{
  "mode": "LECTURE",
  "topic": "${topic}",
  "targetExam": "${targetExam}",
  "subject": "${subject || 'Physics | Chemistry | Mathematics'}",
  "tagline": "one line telling the student why this chapter pays marks",
  "tags": ["3-5 short tags"],
  "prerequisites": ["1-3 prerequisite topics"],
  "slides": [ ... ]
}

Every slide must have exactly these keys:
{
  "slideNumber": <1-based integer>,
  "title": "<specific, not generic>",
  "content": {
    "bullets": ["4-6 bullets, each a real conceptual statement or an exam-relevant fact"],
    "latexFormulas": ["1-4 formulas in raw LaTeX, NO $ delimiters, braces balanced"],
    "keyTakeaway": "one sentence worth remembering in the exam hall"
  },
  "voiceScript": "110-170 words of natural spoken teaching for text-to-speech"
}

Rules that matter:
1. The voiceScript is SPOKEN audio. Write every formula phonetically: say "F equals m a", "root g r", "u squared sine two theta over g", "ten to the minus fourteen". Never write LaTeX, backslashes, dollar signs, braces, or symbols like theta or delta inside voiceScript.
2. latexFormulas is the opposite: precise raw LaTeX only, and it must compile in KaTeX.
3. Sequence the deck properly: motivation -> definitions -> core results -> the hard part -> application -> traps and exam method. Make the final slide a summary of traps plus a practice plan.
4. Be exam-specific. ${
    targetExam === 'NEET'
      ? 'NEET wants NCERT-precise statements, factual accuracy and fast numericals; mention NCERT-favourite exceptions.'
      : targetExam === 'JEE Advanced'
        ? 'JEE Advanced wants multi-concept depth, derivations, edge cases and problem-solving method, not just formulas.'
        : 'JEE Main wants formula fluency, graph interpretation, direct numericals and the common traps that cause negative marking.'
  }
5. Include at least one genuinely non-obvious insight and at least three concrete exam traps with their fixes.
6. Do not invent data: no fabricated previous-year question numbers, no invented statistics.

Example of one well-formed slide:
${fewShotSlide()}`;
}

function practicePrompt({ topic, targetExam, count, focus, difficulty }) {
  return `Write ${count} ${difficulty || 'exam-level'} practice questions on "${topic}" for ${targetExam}.
${focus ? `Focus the questions on: ${focus}` : ''}

Return ONE JSON object and nothing else — no markdown fence, no commentary:
{
  "questions": [
    {
      "question": "the full question text, self-contained, with all data and units",
      "options": ["option A", "option B", "option C", "option D"],
      "correct": <0-based index of the right option>,
      "explanation": "2-4 sentences: the governing equation, the substitution, and the trap the wrong options exploit",
      "difficulty": "easy | medium | hard",
      "exam": "${targetExam}"
    }
  ]
}

Rules:
1. Exactly 4 options, only one correct. Avoid "all of the above".
2. Make the distractors real misconceptions, not random numbers.
3. Every quantity needs units where applicable; use plain ASCII for units in the question text.
4. In the question and options do NOT use LaTeX — write "m/s^2", "10^-14", "root(gR)" so it reads aloud cleanly.
5. Difficulty spread: roughly one easy, the rest medium/hard.`;
}

function voiceChatPrompt({ message, history, contextTopic, subject }) {
  const ctx = [
    contextTopic ? `The student is currently studying: ${contextTopic}.` : '',
    subject ? `Subject filter: ${subject}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `${ctx}
Answer in VOICE_CHAT_MODE JSON only — no markdown fence, no extra keys.
{
  "mode": "VOICE_CHAT",
  "spokenResponse": "max 3-4 sentences, conversational and encouraging, and it MUST be readable aloud: pronounce every symbol in words (say 'm v squared over r', not 'mv^2/r'), no LaTeX, no dollar signs, no backslashes",
  "uiDisplay": {
    "mathHint": "the exact LaTeX for the screen, raw LaTeX with $ delimiters allowed",
    "actionableTip": "a shortcut or an exam trap warning"
  },
  "followUpPrompt": "one short natural question that checks whether the student actually got it"
}
${
  /\b(step|didn'?t get|not getting|confus|samajh|dobara|repeat)\b/i.test(message)
    ? 'The student is stuck on a specific step. Pinpoint that single mental hurdle — do NOT re-explain the whole topic.'
    : 'Give the conceptual answer first, then the exam consequence.'
}

Student says: "${message}"${
    history && history.length
      ? `\n\nRecent conversation:\n${history
          .slice(-6)
          .map((h) => `${h.role === 'user' ? 'Student' : 'Astra'}: ${String(h.content).slice(0, 400)}`)
          .join('\n')}`
      : ''
  }`;
}

/* ------------------------------------------------------------------ *
 * Model call with one repair round-trip
 * ------------------------------------------------------------------ */

async function callModel(cfg, prompt, options = {}) {
  return providers.chat(cfg, [{ role: 'user', content: prompt }], {
    system: options.system === null ? undefined : options.system || SYSTEM_PROMPT,
    json: options.json !== false,
    temperature: options.temperature ?? 0.5,
    maxTokens: options.maxTokens || 6000,
    timeoutMs: options.timeoutMs || Number(process.env.ASTRA_GENERATE_TIMEOUT_MS || 420000),
  });
}

async function generateJson(cfg, prompt, validate, repairPrompt, options = {}) {
  const started = Date.now();
  const first = await callModel(cfg, prompt, options);
  let parsed = schema.extractJson(first.text);
  let result = parsed ? validate(parsed) : null;

  const attempts = [
    { attempt: 1, model: first.model, provider: first.provider, ok: !!result?.ok, raw: first.text.length },
  ];

  if ((!result || !result.ok) && repairPrompt) {
    const problems = result ? result.errors.join('; ') : 'the reply was not parseable JSON';
    const repair = await callModel(
      cfg,
      `${prompt}

YOUR PREVIOUS ANSWER WAS REJECTED. Problems: ${problems}.
Fix them and return ONLY the corrected JSON object. No markdown fence, no prose.`,
      options
    );
    const reparsed = schema.extractJson(repair.text);
    const retried = reparsed ? validate(reparsed) : null;
    attempts.push({ attempt: 2, model: repair.model, provider: repair.provider, ok: !!retried?.ok, raw: repair.text.length });
    if (retried && (retried.ok || !result)) result = retried;
  }

  if (!result) {
    const err = new Error('the local model did not return parseable JSON after a repair attempt');
    err.attempts = attempts;
    err.elapsedMs = Date.now() - started;
    throw err;
  }

  return { result, attempts, elapsedMs: Date.now() - started };
}

/* ------------------------------------------------------------------ *
 * Public generators
 * ------------------------------------------------------------------ */

async function generateLecture({ cfg, topic, targetExam = 'JEE Main', subject = null, slideCount = 7, audience = null }) {
  if (!cfg) throw new Error('no local model configured');
  const cleanTopic = String(topic || '').trim();
  if (!cleanTopic) throw new Error('topic is required');
  const count = Math.min(12, Math.max(3, Number(slideCount) || 7));
  const exam = schema.nearest(targetExam, schema.EXAMS, 'JEE Main');

  const prompt = lecturePrompt({ topic: cleanTopic, targetExam: exam, subject, slideCount: count, audience });
  const { result, attempts, elapsedMs } = await generateJson(cfg, prompt, (obj) =>
    schema.validateLecture(obj, { targetExam: exam, subject, maxSlides: 12, minSlides: 3, topic: cleanTopic })
  );

  const deck = result.value;
  deck.id = schema.slugify(`${(subject || deck.subject || 'gen').toLowerCase()}-${cleanTopic}`);
  deck.targetExam = exam;
  deck.generatedBy = {
    model: attempts[attempts.length - 1].model,
    provider: attempts[attempts.length - 1].provider,
    attempts: attempts.length,
    generatedAt: new Date().toISOString(),
  };

  return {
    ok: result.ok && deck.slides.length >= 3,
    deck,
    validation: { errors: result.errors, warnings: result.warnings },
    attempts,
    elapsedMs,
  };
}

async function generatePractice({ cfg, topic, targetExam = 'JEE Main', count = 5, focus = null, difficulty = null }) {
  if (!cfg) throw new Error('no local model configured');
  const n = Math.min(10, Math.max(1, Number(count) || 5));
  const exam = schema.nearest(targetExam, schema.EXAMS, 'JEE Main');
  const prompt = practicePrompt({ topic, targetExam: exam, count: n, focus, difficulty });

  const { result, attempts, elapsedMs } = await generateJson(
    cfg,
    prompt,
    (obj) => schema.validatePractice(obj, { topic, targetExam: exam, max: 10 }),
    'Return the corrected JSON.',
    { temperature: 0.6 }
  );

  return {
    ok: result.ok && result.value.questions.length > 0,
    practice: result.value,
    validation: { errors: result.errors, warnings: result.warnings },
    attempts,
    elapsedMs,
  };
}

async function generateVoiceChat({ cfg, message, history, contextTopic, subject }) {
  if (!cfg) throw new Error('no local model configured');
  const prompt = voiceChatPrompt({ message, history, contextTopic, subject });
  const { result, attempts, elapsedMs } = await generateJson(
    cfg,
    prompt,
    (obj) => schema.validateVoiceChat(obj),
    'Return the corrected JSON.',
    { system: SYSTEM_PROMPT, temperature: 0.4, maxTokens: 1200 }
  );
  return { result: result.value, validation: result, attempts, elapsedMs };
}

/* ------------------------------------------------------------------ *
 * Persistence — a generated deck becomes a normal library deck
 * ------------------------------------------------------------------ */

function saveDeck(deck, { overwrite = false } = {}) {
  const id = deck.id || schema.slugify(deck.topic);
  const file = path.join(CONTENT_DIR, `${id}.json`);
  if (fs.existsSync(file) && !overwrite) {
    const err = new Error(`a deck already exists at public/content/${id}.json`);
    err.code = 'EXISTS';
    err.file = file;
    throw err;
  }
  deck.id = id;
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(deck, null, 2)}\n`, 'utf8');
  return { file, id };
}

module.exports = { generateLecture, generatePractice, generateVoiceChat, saveDeck, lecturePrompt, practicePrompt };
