'use strict';

/**
 * validate-content.js — asserts every deck obeys the LECTURE_MODE contract
 * and that voiceScripts are TTS-safe (no LaTeX leakage).
 *
 *   node test/validate-content.js
 */

const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'public', 'content');
const EXAMS = ['JEE Main', 'JEE Advanced', 'NEET'];
const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'];

const errors = [];
const warn = [];
let slideCount = 0;
let wordCount = 0;

function req(cond, msg) {
  if (!cond) errors.push(msg);
}

const LATEX_LEAK = /\\[a-zA-Z]{2,}|[_^{}]\s|\\frac|\\vec|\\dfrac|\\mathrm/;

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))) {
  const full = path.join(DIR, file);
  let deck;
  try {
    deck = JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch (err) {
    errors.push(`${file}: invalid JSON — ${err.message}`);
    continue;
  }

  req(deck.mode === 'LECTURE', `${file}: mode must be "LECTURE"`);
  req(typeof deck.id === 'string' && deck.id === path.basename(file, '.json'), `${file}: id must equal the filename stem`);
  req(SUBJECTS.includes(deck.subject), `${file}: subject "${deck.subject}" not in ${SUBJECTS.join('/')}`);
  req(EXAMS.includes(deck.targetExam), `${file}: targetExam "${deck.targetExam}" not in ${EXAMS.join('/')}`);
  req(typeof deck.topic === 'string' && deck.topic.length > 3, `${file}: topic missing`);
  req(Array.isArray(deck.slides) && deck.slides.length >= 3, `${file}: needs at least 3 slides`);

  deck.slides.forEach((s, i) => {
    const at = `${file} slide ${i + 1}`;
    req(s.slideNumber === i + 1, `${at}: slideNumber should be ${i + 1}, got ${s.slideNumber}`);
    req(typeof s.title === 'string' && s.title.length > 2, `${at}: title missing`);
    req(Array.isArray(s.content?.bullets) && s.content.bullets.length >= 3, `${at}: needs >= 3 bullets`);
    req(Array.isArray(s.content?.latexFormulas) && s.content.latexFormulas.length >= 1, `${at}: needs >= 1 latexFormula`);
    req(typeof s.content?.keyTakeaway === 'string' && s.content.keyTakeaway.length > 10, `${at}: keyTakeaway missing`);
    req(typeof s.voiceScript === 'string' && s.voiceScript.split(/\s+/).length >= 40, `${at}: voiceScript too short for TTS`);

    // voiceScript must be spoken-ready: no LaTeX commands, no math delimiters
    if (LATEX_LEAK.test(s.voiceScript) || /\$/.test(s.voiceScript)) {
      errors.push(`${at}: voiceScript contains LaTeX — must be phonetic for TTS`);
    }
    if (/\\|\{|\}/.test(s.voiceScript)) warn.push(`${at}: voiceScript has stray braces/backslashes`);

    // formulas must look like LaTeX
    s.content.latexFormulas.forEach((f, j) => {
      if (!/[\\=^_]/.test(f)) warn.push(`${at} formula ${j + 1}: no LaTeX markup found`);
      const open = (f.match(/\{/g) || []).length;
      const close = (f.match(/\}/g) || []).length;
      req(open === close, `${at} formula ${j + 1}: unbalanced braces (${open} vs ${close})`);
    });

    slideCount += 1;
    wordCount += s.voiceScript.split(/\s+/).filter(Boolean).length;
  });
}

console.log(`\nDecks checked : ${fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).length}`);
console.log(`Slides        : ${slideCount}`);
console.log(`Narration     : ${wordCount} words (~${Math.round(wordCount / 140)} min at 140 wpm)`);

if (warn.length) {
  console.log(`\nWarnings (${warn.length}):`);
  warn.slice(0, 12).forEach((w) => console.log(`  ! ${w}`));
}

if (errors.length) {
  console.log(`\nERRORS (${errors.length}):`);
  errors.forEach((e) => console.log(`  x ${e}`));
  process.exit(1);
}

console.log('\nAll decks conform to the LECTURE_MODE contract.\n');
