'use strict';

/**
 * smoke.js — headless UI smoke test using jsdom.
 *
 *   node test/smoke.js            # boots its own server on TEST_PORT
 *   PORT=3000 node test/smoke.js  # tests an already-running server
 *
 * Boots the real index.html, waits for Astra's controller to finish loading
 * the catalogue, then drives the UI: open a deck, advance slides, send doubts,
 * switch views, inspect payloads. Fails on any uncaught page error.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { JSDOM, VirtualConsole } = require('jsdom');

const PORT = process.env.PORT || process.env.TEST_PORT || 4321;
const BASE_URL = `http://127.0.0.1:${PORT}/`;
const ROOT = path.join(__dirname, '..');
let serverProc = null;

const failures = [];
const checks = [];

function ok(name, cond, extra = '') {
  checks.push({ name, pass: !!cond, extra });
  if (!cond) failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    let value;
    try {
      value = fn();
    } catch {
      value = false;
    }
    if (value) return value;
    await sleep(120);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function ensureServer() {
  // If something already answers on PORT, use it; otherwise spawn our own.
  try {
    const res = await fetch(`${BASE_URL}api/health`);
    if (res.ok) return;
  } catch {
    /* nothing listening */
  }
  serverProc = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stdout.on('data', () => {});
  serverProc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 60; i += 1) {
    await sleep(100);
    try {
      const res = await fetch(`${BASE_URL}api/health`);
      if (res.ok) return;
    } catch {
      /* keep waiting */
    }
  }
  throw new Error(`server did not come up on ${BASE_URL}`);
}

(async () => {
  await ensureServer();
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');

  const virtualConsole = new VirtualConsole();
  const pageErrors = [];
  virtualConsole.on('jsdomError', (err) => pageErrors.push(`jsdomError: ${err.message}`));
  virtualConsole.on('error', (...args) => pageErrors.push(`console.error: ${args.join(' ')}`));

  // jsdom implements neither Web Speech API. Install stubs BEFORE the page
  // scripts run, so app.js picks them up at load time.
  const spokenLog = [];
  const dom = new JSDOM(html, {
    url: BASE_URL,
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      // jsdom has no fetch; bridge to Node's global fetch (absolute URLs only).
      window.fetch = (input, init) =>
        global.fetch(typeof input === 'string' ? new URL(input, BASE_URL).href : input, init);
      window.SpeechSynthesisUtterance = class {
        constructor(text) {
          this.text = text;
        }
      };
      window.speechSynthesis = {
        getVoices: () => [
          { name: 'Astra EN-IN', lang: 'en-IN', voiceURI: 'astra-in', localService: true },
          { name: 'Google US English', lang: 'en-US', voiceURI: 'google-us', localService: false },
        ],
        speak: (u) => {
          spokenLog.push(u.text);
          setTimeout(() => u.onstart && u.onstart(), 5);
          setTimeout(() => u.onend && u.onend(), 25);
        },
        cancel: () => {},
        onvoiceschanged: null,
      };
    },
  });

  const { window } = dom;
  const { document } = window;

  try {
    await waitFor(() => document.querySelectorAll('.deck').length > 0, 'deck grid to render');
  } catch (err) {
    console.error('FATAL: page never finished booting:', err.message);
    console.error('Page errors:', pageErrors.slice(0, 8));
    if (serverProc) serverProc.kill();
    process.exit(1);
  }

  /* ---------- assertions ---------- */

  const decks = document.querySelectorAll('.deck');
  ok('catalogue renders decks', decks.length >= 6, `got ${decks.length}`);
  ok('KPI deck count filled', document.querySelector('#kpiDecks').textContent !== '—');
  ok('KPI slide count filled', Number(document.querySelector('#kpiSlides').textContent) >= 40);
  ok('engine pill filled', document.querySelector('#engineLabel').textContent.includes('offline'));
  ok('rule count filled', Number(document.querySelector('#stRules').textContent) >= 20);
  ok('KaTeX loaded from vendor', typeof window.katex === 'object' && typeof window.renderMathInElement === 'function');
  ok('mhchem extension loaded', !!window.katex.__defineMacro, 'katex macro API present');

  // voice select populated by the stub
  document.querySelector('#btnVoiceSettings').click();
  ok('voice modal opens', document.querySelector('#voiceModal').classList.contains('open'));
  ok(
    'voice select populated',
    document.querySelector('#voiceSelect').options.length === 2,
    `got ${document.querySelector('#voiceSelect').options.length}`
  );
  document.querySelector('#btnCloseModal').click();
  ok('voice modal closes', !document.querySelector('#voiceModal').classList.contains('open'));

  // ---------- lecture mode ----------
  decks[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => document.querySelector('#view-lecture').classList.contains('active'), 'lecture view');
  await waitFor(() => document.querySelector('.slide h3').textContent.length > 3, 'slide title');

  const deckTopic = document.querySelector('#lecTopic').textContent;
  ok('lecture topic painted', deckTopic.length > 5, deckTopic);
  ok('slide bullets rendered', document.querySelectorAll('.bullets li').length >= 3);
  ok('slide formulas rendered', document.querySelectorAll('.formula').length >= 1);
  ok('takeaway rendered', document.querySelector('.takeaway').textContent.length > 20);
  ok('voiceScript shown', document.querySelector('#voiceScriptText').textContent.length > 60);
  ok('progress bar moved', document.querySelector('#lecProgress').style.width !== '0%');
  ok('prev disabled on first slide', document.querySelector('#btnPrev').disabled);
  ok('raw slide JSON shown in inspector', document.querySelector('#jsonOut').textContent.includes('slideNumber'));

  // KaTeX actually produced markup (not raw LaTeX text)
  ok(
    'KaTeX rendered markup present',
    document.querySelectorAll('.formula .katex').length >= 1,
    `katex nodes: ${document.querySelectorAll('.formula .katex').length}`
  );
  ok(
    'no raw \\dfrac text leaked into formulas',
    !Array.from(document.querySelectorAll('.formula')).some((f) => f.textContent.includes('\\dfrac'))
  );

  // narrate (long scripts are chunked, so the first utterance is a sentence)
  document.querySelector('#btnNarrate').click();
  await waitFor(() => spokenLog.length > 0, 'TTS to be invoked');
  await sleep(900); // let the chunk queue drain
  const narration = spokenLog.join(' ');
  ok('narration spoke the voiceScript', narration.length > 200, `${narration.length} chars in ${spokenLog.length} chunks`);
  ok(
    'narration matches the slide voiceScript',
    narration.slice(0, 40) === document.querySelector('#voiceScriptText').textContent.slice(0, 40)
  );
  ok('narration text is latex-free', !/\\[a-zA-Z]{3,}/.test(narration), narration.slice(0, 60));
  spokenLog.length = 0;

  // next slide
  document.querySelector('#btnNext').click();
  await waitFor(() => document.querySelector('#lecCounter').textContent.startsWith('2 /'), 'slide 2');
  ok('advanced to slide 2', true);

  // ask a doubt from the slide
  document.querySelector('#btnAskDoubt').click();
  await waitFor(() => document.querySelector('#view-chat').classList.contains('active'), 'chat view');
  ok('jump to doubt prefills context', document.querySelector('#doubtInput').value.includes("step 2"));

  // ---------- voice chat mode ----------
  document.querySelector('#doubtInput').value = 'why is work done by centripetal force zero';
  document.querySelector('#btnSend').click();
  await waitFor(() => document.querySelectorAll('.msg.astra').length >= 1, 'astra reply');

  const firstReply = document.querySelector('.msg.astra .spoken').textContent;
  ok('astra answered the doubt', firstReply.length > 60, firstReply.slice(0, 60));
  ok('mathHint rendered with KaTeX', document.querySelectorAll('.msg.astra .hint.math .katex').length >= 1);
  ok('actionableTip rendered', document.querySelectorAll('.msg.astra .hint.tip').length >= 1);
  ok('followUpPrompt rendered', document.querySelectorAll('.msg.astra .hint.follow').length >= 1);
  ok('voice-chat JSON in inspector', document.querySelector('#jsonOut').textContent.includes('VOICE_CHAT'));
  ok('doubt counter incremented', Number(document.querySelector('#stDoubts').textContent) >= 1);
  await sleep(700);
  ok('auto-speak triggered', spokenLog.length >= 1, `utterances: ${spokenLog.length}`);
  spokenLog.length = 0;

  // remediation path — "I didn't get step 2" must NOT re-lecture
  document.querySelector('#doubtInput').value = "I didn't get step 3";
  document.querySelector('#btnSend').click();
  const before = document.querySelectorAll('.msg.astra').length;
  await waitFor(() => document.querySelectorAll('.msg.astra').length > before, 'second reply');
  const remText = document.querySelectorAll('.msg.astra .spoken');
  const remediation = remText[remText.length - 1].textContent;
  ok('remediation answer is short', remediation.split(/\s+/).length < 90, `${remediation.split(/\s+/).length} words`);

  // quick chip
  const chip = document.querySelector('#quickChips .chip');
  const countBefore = document.querySelectorAll('.msg.astra').length;
  chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(() => document.querySelectorAll('.msg.astra').length > countBefore, 'quick-chip reply');
  ok('quick chip asks a doubt', true);

  // ---------- local model integration surface ----------
  ok('local-models.js loaded', typeof window.AstraDirect === 'object' && typeof window.AstraDirect.chat === 'function');
  ok('AstraUI bridge exposed', typeof window.AstraUI === 'object' && typeof window.AstraUI.openLecture === 'function');
  ok('direct provider resolves Ollama defaults', window.AstraDirect.resolve({ provider: 'ollama' }).baseUrl === 'http://127.0.0.1:11434');
  ok('direct provider appends /v1 for LM Studio', window.AstraDirect.resolve({ provider: 'lmstudio' }).baseUrl.endsWith('/v1'));

  document.querySelector('[data-view="create"]').click();
  await waitFor(() => document.querySelector('#view-create').classList.contains('active'), 'create view');
  ok('create view opens', true);
  ok('generate form present', !!document.querySelector('#genTopic') && !!document.querySelector('#btnGenerateDeck'));

  document.querySelector('#genTopic').value = 'Rotational motion';
  document.querySelector('#btnGenerateDeck').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(150);
  ok('generate without a model explains how to connect one', /No local model selected/i.test(document.querySelector('#genLog').textContent));

  document.querySelector('#btnVoiceSettings').click();
  ok('local model settings rendered', !!document.querySelector('#providerSelect') && !!document.querySelector('#baseUrlInput') && !!document.querySelector('#modelInput'));
  ok('browser-direct toggle rendered', !!document.querySelector('#optDirect'));
  ok('local audio section rendered', !!document.querySelector('#optLocalAudio') && !!document.querySelector('#localAudioInfo'));
  document.querySelector('#providerSelect').value = 'ollama';
  document.querySelector('#providerSelect').dispatchEvent(new window.Event('change'));
  ok('provider change sets the default base URL placeholder', document.querySelector('#baseUrlInput').placeholder.includes('11434'));
  document.querySelector('#btnCloseModal').click();

  // practice panel hooks exist on the lecture view
  ok('practice button wired', !!document.querySelector('#btnPractice'));
  ok('practice panel present', !!document.querySelector('#practicePanel') && !!document.querySelector('#practiceList'));

  // ---------- views & filters ----------
  document.querySelector('[data-view="api"]').click();
  await waitFor(() => document.querySelector('#view-api').classList.contains('active'), 'api view');
  ok('schema lecture printed', document.querySelector('#schemaLecture').textContent.includes('slideNumber'));
  ok('schema voice printed', document.querySelector('#schemaVoice').textContent.includes('followUpPrompt'));

  document.querySelector('[data-view="home"]').click();
  document.querySelector('[data-exam="NEET"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  const filtered = document.querySelectorAll('.deck').length;
  ok('exam filter narrows the library', filtered >= 1 && filtered < decks.length, `NEET decks: ${filtered}`);
  document.querySelector('[data-exam="All"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // ---------- report ----------
  const pageErrs = pageErrors.filter((e) => !/not implemented|Could not parse CSS|css parsing/i.test(e));
  ok('no page errors', pageErrs.length === 0, pageErrs.slice(0, 4).join(' | '));

  console.log('');
  for (const c of checks) console.log(`  ${c.pass ? '\u2713' : '\u2717'} ${c.name}${c.pass || !c.extra ? '' : ` — ${c.extra}`}`);
  console.log(`\n${checks.length - failures.length}/${checks.length} checks passed`);
  if (pageErrors.length) console.log(`(ignored ${pageErrors.length - pageErrs.length} jsdom CSS/impl notices)`);

  dom.window.close();
  if (serverProc) serverProc.kill();
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('SMOKE TEST CRASHED:', err);
  if (serverProc) serverProc.kill();
  process.exit(1);
});
