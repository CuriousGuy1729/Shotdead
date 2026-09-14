'use strict';

/**
 * schema.js — single source of truth for Astra's two output contracts.
 *
 * Validates AND repairs model output: local models (Qwen, Llama, Mistral…)
 * frequently return fenced JSON, miss a key, or leak LaTeX into the voice
 * script. Instead of rejecting the response we repair what is repairable and
 * report the rest, so a locally-generated deck is always usable.
 *
 * Used by the server, by the generator, and by test/validate-content.js.
 */

const EXAMS = ['JEE Main', 'JEE Advanced', 'NEET'];
const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'];

const LATEX_COMMAND = /\\[a-zA-Z]{2,}/;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function str(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Nearest allowed enum value, else the fallback. */
function nearest(value, allowed, fallback) {
  const raw = str(value).toLowerCase();
  if (!raw) return fallback;
  const exact = allowed.find((a) => a.toLowerCase() === raw);
  if (exact) return exact;
  const alias = {
    'jee mains': 'JEE Main',
    'jee-main': 'JEE Main',
    jeemain: 'JEE Main',
    main: 'JEE Main',
    'jee adv': 'JEE Advanced',
    advanced: 'JEE Advanced',
    'jee advanced ': 'JEE Advanced',
    neetug: 'NEET',
    'neet exam': 'NEET',
    physics: 'Physics',
    chemistry: 'Chemistry',
    maths: 'Mathematics',
    math: 'Mathematics',
    mathematics: 'Mathematics',
  };
  if (alias[raw]) return alias[raw];
  const partial = allowed.find((a) => raw.includes(a.toLowerCase().split(' ')[0]));
  return partial || fallback;
}

/**
 * Strip the wrappers local models love to add: ```json fences, leading
 * prose, trailing commentary. Returns the outermost JSON object/array text.
 */
function extractJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  // remove code fences
  const fenced = text.match(/```(?:json|json5|javascript|js)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;

  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ]) {
    const start = candidate.indexOf(open);
    const end = candidate.lastIndexOf(close);
    if (start >= 0 && end > start) {
      const slice = candidate.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        /* fall through to the next strategy */
      }
    }
  }

  // last resort: the whole candidate
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/** Convert LaTeX-ish text into something a TTS engine can read aloud. */
function latexToPhonetic(input) {
  let s = String(input || '');
  if (!s) return '';

  const greek = {
    alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', epsilon: 'epsilon',
    theta: 'theta', lambda: 'lambda', mu: 'mu', nu: 'nu', pi: 'pi', rho: 'rho',
    sigma: 'sigma', phi: 'phi', omega: 'omega', Delta: 'delta', Omega: 'omega',
    Theta: 'theta', Gamma: 'gamma', Sigma: 'sigma',
  };

  s = s.replace(/\$\$?/g, ' ');
  s = s.replace(/\\(?:mathrm|text|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1');
  s = s.replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, ' $1 over $2 ');
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, ' root $1 ');
  s = s.replace(/\\(?:vec|hat|bar|overline)\s*\{([^{}]*)\}/g, ' $1 ');
  s = s.replace(/\\[a-zA-Z]+\^?\{?([a-zA-Z0-9]*)\}?/g, (m, name) => {
    const key = m.slice(1).replace(/[^a-zA-Z]/g, '');
    return greek[key] || greek[name] || ' ';
  });
  s = s
    .replace(/\\times/g, ' times ')
    .replace(/\\cdot/g, ' times ')
    .replace(/\\pm/g, ' plus or minus ')
    .replace(/\\Rightarrow/g, ' implies ')
    .replace(/\\rightarrow/g, ' gives ')
    .replace(/\\rightleftharpoons/g, ' is in equilibrium with ')
    .replace(/\\iff/g, ' if and only if ')
    .replace(/\\ne/g, ' not equal to ')
    .replace(/\\le(?:q)?/g, ' less than or equal to ')
    .replace(/\\ge(?:q)?/g, ' greater than or equal to ')
    .replace(/\\approx/g, ' approximately ')
    .replace(/\\infty/g, ' infinity ')
    .replace(/\\degree|\\circ/g, ' degrees ')
    .replace(/\\quad|\\qquad|\\,|\\;|\\!/g, ' ')
    .replace(/\\left|\\right/g, ' ')
    .replace(/[_^]\{([^{}]*)\}/g, ' $1 ')
    .replace(/[_^]/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\\/g, ' ');

  return s.replace(/\s{2,}/g, ' ').trim();
}

function sanitizeForTts(text) {
  let out = String(text || '');
  if (LATEX_COMMAND.test(out) || /[$]/.test(out)) out = latexToPhonetic(out);
  return out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'astra-deck';
}

function wordCount(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

/* ------------------------------------------------------------------ *
 * MODE 1 — LECTURE_MODE
 * ------------------------------------------------------------------ */

const SLIDE_KEYS = ['slideNumber', 'title', 'content', 'voiceScript'];

function validateLecture(input, options = {}) {
  const issues = [];
  const warn = (msg) => issues.push({ level: 'warn', message: msg });
  const error = (msg) => issues.push({ level: 'error', message: msg });

  const src = input && typeof input === 'object' ? input : {};
  const slides = arr(src.slides);

  if (!src.topic) error('topic is missing');
  if (!slides.length) error('slides array is empty');

  const targetExam = nearest(src.targetExam, EXAMS, options.targetExam || 'JEE Main');
  if (src.targetExam && targetExam !== src.targetExam) warn(`targetExam normalised to "${targetExam}"`);

  const subject = nearest(src.subject, SUBJECTS, options.subject || null);
  if (options.subject && subject !== options.subject) warn(`subject normalised to "${subject}"`);

  const maxSlides = options.maxSlides || 12;
  const minSlides = options.minSlides || 3;
  let used = slides.slice(0, maxSlides);
  if (slides.length > maxSlides) warn(`trimmed ${slides.length - maxSlides} slide(s) beyond the ${maxSlides} limit`);
  if (used.length < minSlides) warn(`only ${used.length} slide(s) — fewer than the recommended ${minSlides}`);

  const outSlides = used.map((raw, index) => {
    const s = raw && typeof raw === 'object' ? raw : {};
    const content = s.content && typeof s.content === 'object' ? s.content : {};

    let bullets = arr(content.bullets).map((b) => str(b)).filter(Boolean);
    if (bullets.length > 8) {
      bullets = bullets.slice(0, 8);
      warn(`slide ${index + 1}: bullets trimmed to 8`);
    }
    if (!bullets.length) warn(`slide ${index + 1}: no bullets`);

    let formulas = arr(content.latexFormulas)
      .map((f) => str(f))
      .filter(Boolean)
      .slice(0, 6);
    // tolerate models that put formulas under a different key
    if (!formulas.length) {
      const alt = arr(content.formulas || content.latex || s.latexFormulas).map((f) => str(f)).filter(Boolean);
      if (alt.length) {
        formulas = alt.slice(0, 6);
        warn(`slide ${index + 1}: formulas read from a non-standard key`);
      } else {
        warn(`slide ${index + 1}: no latexFormulas`);
      }
    }

    const keyTakeaway = str(content.keyTakeaway || content.takeaway || content.keyPoint);
    if (!keyTakeaway) warn(`slide ${index + 1}: keyTakeaway missing`);

    let voiceScript = sanitizeForTts(s.voiceScript || content.voiceScript || '');
    if (!voiceScript) {
      voiceScript = sanitizeForTts(
        [s.title, keyTakeaway, bullets.join('. ')].filter(Boolean).join('. ')
      );
      warn(`slide ${index + 1}: voiceScript missing — synthesised from bullets`);
    } else if (LATEX_COMMAND.test(String(s.voiceScript))) {
      warn(`slide ${index + 1}: voiceScript contained LaTeX — converted to phonetic text`);
    }
    if (wordCount(voiceScript) < 30) warn(`slide ${index + 1}: voiceScript is short (${wordCount(voiceScript)} words)`);

    const missingKeys = SLIDE_KEYS.filter((k) => !(k in s));
    if (missingKeys.length) warn(`slide ${index + 1}: keys added by repair: ${missingKeys.join(', ')}`);

    return {
      slideNumber: index + 1,
      title: str(s.title, `Slide ${index + 1}`),
      content: { bullets, latexFormulas: formulas, keyTakeaway },
      voiceScript,
    };
  });

  const deck = {
    id: str(src.id) || slugify(`${subject || 'astra'}-${src.topic || 'deck'}`),
    mode: 'LECTURE',
    subject: subject || options.subject || 'Physics',
    topic: str(src.topic, options.topic || 'Untitled lecture'),
    targetExam,
    tagline: str(src.tagline || src.summary || ''),
    tags: arr(src.tags).map((t) => str(t)).filter(Boolean).slice(0, 8),
    prerequisites: arr(src.prerequisites).map((p) => str(p)).filter(Boolean).slice(0, 6),
    slides: outSlides,
  };

  if (src.generatedBy) deck.generatedBy = str(src.generatedBy);

  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    warnings: issues.filter((i) => i.level === 'warn').map((i) => i.message),
    errors: issues.filter((i) => i.level === 'error').map((i) => i.message),
    value: deck,
  };
}

/* ------------------------------------------------------------------ *
 * MODE 2 — VOICE_CHAT_MODE
 * ------------------------------------------------------------------ */

function validateVoiceChat(input) {
  const issues = [];
  const warn = (msg) => issues.push({ level: 'warn', message: msg });
  const error = (msg) => issues.push({ level: 'error', message: msg });

  const src = input && typeof input === 'object' ? input : {};
  const ui = src.uiDisplay && typeof src.uiDisplay === 'object' ? src.uiDisplay : {};

  let spoken = str(src.spokenResponse || src.response || src.answer);
  if (!spoken) error('spokenResponse is missing');
  else if (LATEX_COMMAND.test(spoken) || /\$/.test(spoken)) {
    spoken = sanitizeForTts(spoken);
    warn('spokenResponse contained LaTeX — converted to phonetic text');
  }
  if (wordCount(spoken) > 95) warn(`spokenResponse is long (${wordCount(spoken)} words) — brevity rule`);

  const mathHint = str(ui.mathHint || ui.math || src.mathHint);
  const actionableTip = str(ui.actionableTip || ui.tip || src.actionableTip);
  const followUpPrompt = str(src.followUpPrompt || src.followUp || ui.followUpPrompt);

  if (!mathHint) warn('uiDisplay.mathHint is empty');
  if (!actionableTip) warn('uiDisplay.actionableTip is empty');
  if (!followUpPrompt) warn('followUpPrompt is empty');

  const value = {
    mode: 'VOICE_CHAT',
    spokenResponse: spoken,
    uiDisplay: { mathHint, actionableTip },
    followUpPrompt,
  };
  for (const key of ['intent', 'subject', 'topic', 'matchedKeywords', 'engine', 'model', 'ruleId']) {
    if (key in src) value[key] = src[key];
  }

  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    warnings: issues.filter((i) => i.level === 'warn').map((i) => i.message),
    errors: issues.filter((i) => i.level === 'error').map((i) => i.message),
    value,
  };
}

/* ------------------------------------------------------------------ *
 * Practice questions (extra mode built on the same discipline)
 * ------------------------------------------------------------------ */

function validatePractice(input, options = {}) {
  const issues = [];
  const src = Array.isArray(input) ? input : arr(input?.questions || input?.items);
  if (!src.length) issues.push({ level: 'error', message: 'no questions returned' });

  const questions = src.slice(0, options.max || 8).map((raw, i) => {
    const q = raw && typeof raw === 'object' ? raw : {};
    const optionsList = arr(q.options || q.choices).map((o) => str(o)).filter(Boolean).slice(0, 4);
    let correct = q.correct ?? q.answer ?? q.correctIndex;
    if (typeof correct === 'string' && optionsList.length) {
      const byText = optionsList.findIndex((o) => o.toLowerCase() === correct.trim().toLowerCase());
      const byLetter = correct.trim().toUpperCase().match(/^([A-D])$/);
      correct = byText >= 0 ? byText : byLetter ? byLetter[1].charCodeAt(0) - 65 : Number(correct) || 0;
    }
    correct = clampInt(correct, 0, Math.max(0, optionsList.length - 1), 0);

    return {
      number: i + 1,
      question: str(q.question || q.prompt || q.text),
      options: optionsList,
      correctIndex: correct,
      explanation: str(q.explanation || q.solution || q.reason),
      difficulty: ['easy', 'medium', 'hard'].includes(String(q.difficulty).toLowerCase())
        ? String(q.difficulty).toLowerCase()
        : 'medium',
      exam: nearest(q.exam || options.targetExam, EXAMS, options.targetExam || 'JEE Main'),
      spoken: sanitizeForTts(q.spoken || q.question || ''),
    };
  });

  return {
    ok: !issues.some((i) => i.level === 'error'),
    issues,
    warnings: issues.filter((i) => i.level === 'warn').map((i) => i.message),
    errors: issues.filter((i) => i.level === 'error').map((i) => i.message),
    value: { mode: 'PRACTICE', topic: str(options.topic), targetExam: nearest(options.targetExam, EXAMS, 'JEE Main'), questions },
  };
}

module.exports = {
  EXAMS,
  SUBJECTS,
  extractJson,
  latexToPhonetic,
  sanitizeForTts,
  slugify,
  wordCount,
  nearest,
  validateLecture,
  validateVoiceChat,
  validatePractice,
};
