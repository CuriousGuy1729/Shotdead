'use strict';

/* ------------------------------------------------------------------ *
 * Astra Tutor — frontend controller
 * ------------------------------------------------------------------ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  catalog: null,
  decks: [],
  filters: { exam: 'All', subject: 'All' },
  currentDeck: null,
  slideIndex: 0,
  autoPlay: false,
  chatHistory: [], // {role, content} for the /api/doubt call
  lastVoice: null,
  lastRuleId: null,
  contextTopic: null,
  view: 'home',
  jsonTab: 'latest',
  stats: { slides: 0, doubts: 0, spoken: 0 },
};

const settings = {
  voiceURI: '',
  rate: 1,
  pitch: 1,
  autoSpeak: true,
  autoNarrate: false,
  handsFree: false,
  langHint: true,
  apiKey: '',
};

const tts = new window.AstraTTS();
const stt = new window.AstraSTT();

/* ------------------------------------------------------------------ *
 * Persistence + helpers
 * ------------------------------------------------------------------ */

const LS_KEY = 'astra.settings.v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch {
    /* ignore */
  }
}

function saveSettings() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

let toastTimer = null;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function api(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (settings.apiKey) headers['x-astra-key'] = settings.apiKey;
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** KaTeX auto-render needs delimiters; content stores bare LaTeX, so wrap it. */
function ensureMathDelimiters(text, display = false) {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  if (raw.includes('$') || raw.includes('\\(') || raw.includes('\\[')) return raw;
  return display ? `$$${raw}$$` : `$${raw}$`;
}

/** Escape HTML, then let KaTeX render the $...$ / $$...$$ math inside. */
function renderMathInto(el, text) {
  el.innerHTML = escapeHtml(text);
  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
        strict: false,
        trust: true,
      });
    } catch {
      /* leave raw text */
    }
  }
}

/* ------------------------------------------------------------------ *
 * JSON inspector
 * ------------------------------------------------------------------ */

function highlightJson(obj) {
  const json = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return escapeHtml(json).replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'n';
      if (/^&quot;/.test(match)) cls = /:\s*$/.test(match) ? 'k' : 's';
      else if (/true|false|null/.test(match)) cls = 'b';
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function currentPayload() {
  switch (state.jsonTab) {
    case 'lecture':
      return state.currentDeck;
    case 'slide':
      return state.currentDeck?.slides?.[state.slideIndex] || null;
    case 'voice':
      return state.lastVoice;
    default:
      return state.lastVoice || state.currentDeck?.slides?.[state.slideIndex] || state.currentDeck;
  }
}

function paintJson() {
  const out = $('#jsonOut');
  const payload = currentPayload();
  if (!payload) {
    out.innerHTML = '<span class="s">No payload yet — open a deck or ask a doubt.</span>';
    return;
  }
  out.innerHTML = highlightJson(payload);
}

/* ------------------------------------------------------------------ *
 * Voice layer wiring
 * ------------------------------------------------------------------ */

function applyTtsSettings() {
  tts.setVoice(settings.voiceURI);
  tts.rate = settings.rate;
  tts.pitch = settings.pitch;
}

function updateVoicePill() {
  const pill = $('#voicePill');
  const label = $('#voiceLabel');
  if (!tts.supported) {
    pill.classList.add('is-off');
    label.textContent = 'TTS unavailable';
    return;
  }
  pill.classList.toggle('is-off', !stt.supported);
  const name = tts.voiceName();
  label.textContent = stt.supported
    ? `voice: ${name ? name.split(' (')[0] : 'default'} · mic ready`
    : `voice: ${name ? name.split(' (')[0] : 'default'} · mic unsupported`;
}

tts.onStateChange = (evt) => {
  if (evt.type === 'voices') {
    populateVoiceSelect();
    updateVoicePill();
  }
  if (evt.type === 'start') {
    state.stats.spoken += 1;
    updateSessionStats();
    $('#btnNarrate').textContent = '⏸ Narrating…';
  }
  if (evt.type === 'end') {
    $('#btnNarrate').textContent = '🔊 Narrate this slide';
    maybeAutoAdvance();
    maybeHandsFree();
  }
  if (evt.type === 'unsupported') toast('This browser has no speech synthesis — narration is disabled.');
};

function maybeAutoAdvance() {
  if (!state.autoPlay || state.view !== 'lecture' || !state.currentDeck) return;
  if (state.slideIndex < state.currentDeck.slides.length - 1) {
    setTimeout(() => gotoSlide(state.slideIndex + 1, true), 420);
  } else {
    state.autoPlay = false;
    $('#btnAutoPlay').classList.remove('on');
    $('#btnAutoPlay').textContent = '▶ Auto-narrate deck';
    toast('Deck finished. Nicely done — now go ask doubts on the slides you found shaky.');
  }
}

function maybeHandsFree() {
  if (!settings.handsFree || state.view !== 'chat' || stt.listening) return;
  setTimeout(() => startListening(), 500);
}

async function speak(text) {
  if (!text) return;
  applyTtsSettings();
  await tts.speak(text);
}

/* ------------------------------------------------------------------ *
 * Lecture mode
 * ------------------------------------------------------------------ */

function paintDeckGrid() {
  const grid = $('#deckGrid');
  const list = state.decks.filter(
    (d) =>
      (state.filters.exam === 'All' || d.targetExam === state.filters.exam) &&
      (state.filters.subject === 'All' || d.subject === state.filters.subject)
  );

  if (!list.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">No deck matches those filters yet — add one in <code>public/content/</code>.</div>';
    return;
  }

  grid.innerHTML = list
    .map(
      (d) => `
      <button class="deck" data-id="${escapeHtml(d.id)}">
        <div class="deck-top">
          <span class="tag ${escapeHtml(d.subject)}">${escapeHtml(d.subject)}</span>
          <span class="tag exam">${escapeHtml(d.targetExam)}</span>
        </div>
        <h4>${escapeHtml(d.topic)}</h4>
        <p>${escapeHtml(d.tagline || '')}</p>
        <div class="deck-meta">
          <span>📑 ${d.slideCount} slides</span>
          <span>⏱ ~${d.minutes} min</span>
        </div>
      </button>`
    )
    .join('');

  $$('.deck', grid).forEach((btn) => btn.addEventListener('click', () => openLecture(btn.dataset.id)));
}

async function openLecture(id) {
  const deck = await api(`/api/lecture?id=${encodeURIComponent(id)}`);
  state.currentDeck = deck;
  state.slideIndex = 0;
  state.contextTopic = deck.topic;
  paintLectureHead();
  renderSlide();
  setView('lecture');
  state.jsonTab = state.jsonTab === 'voice' ? 'latest' : state.jsonTab;
  syncJsonTabs();
  paintJson();
  toast(`Lecture mode: ${deck.topic}`);
}

function paintLectureHead() {
  const d = state.currentDeck;
  if (!d) return;
  $('#lecTopic').textContent = d.topic;
  const prereq = (d.prerequisites || []).join(' · ');
  $('#lecSub').innerHTML = `${escapeHtml(d.subject)} · ${escapeHtml(d.targetExam)}${prereq ? ` · needs: ${escapeHtml(prereq)}` : ''}`;
}

function renderSlide() {
  const d = state.currentDeck;
  if (!d) return;
  const slide = d.slides[state.slideIndex];
  const body = $('#slideBody');

  const bullets = (slide.content.bullets || [])
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join('');
  const formulas = (slide.content.latexFormulas || []).map(() => '<div class="formula"></div>').join('');

  body.innerHTML = `
    <div class="slide-num">Slide ${slide.slideNumber} of ${d.slides.length} · LECTURE_MODE</div>
    <h3>${escapeHtml(slide.title)}</h3>
    <h4>Concept</h4>
    <ul class="bullets">${bullets}</ul>
    <h4>Formulas</h4>
    <div class="formulas">${formulas}</div>
    <div class="takeaway"><b>Key takeaway — </b><span class="takeaway-body"></span></div>
    <div class="narration"><b>voiceScript (what Astra speaks):</b> <span id="voiceScriptText">${escapeHtml(slide.voiceScript)}</span></div>
  `;

  $$('.formula', body).forEach((node, i) =>
    renderMathInto(node, ensureMathDelimiters(slide.content.latexFormulas[i], true))
  );
  renderMathInto($('.takeaway-body', body), slide.content.keyTakeaway || '');

  $('#lecCounter').textContent = `${slide.slideNumber} / ${d.slides.length}`;
  $('#lecProgress').style.width = `${((state.slideIndex + 1) / d.slides.length) * 100}%`;
  $('#btnPrev').disabled = state.slideIndex === 0;
  $('#btnNext').disabled = state.slideIndex === d.slides.length - 1;

  state.stats.slides += 1;
  updateSessionStats();
  if (state.jsonTab === 'slide' || state.jsonTab === 'latest') paintJson();
}

function gotoSlide(index, narrate = false) {
  const d = state.currentDeck;
  if (!d) return;
  const next = Math.max(0, Math.min(d.slides.length - 1, index));
  if (next === state.slideIndex && !narrate) return;
  state.slideIndex = next;
  renderSlide();
  if (narrate || settings.autoNarrate || state.autoPlay) narrateSlide();
  else tts.stop();
}

async function narrateSlide() {
  const slide = state.currentDeck?.slides?.[state.slideIndex];
  if (!slide) return;
  if (!tts.supported) return toast('Speech synthesis is unavailable in this browser — read the voiceScript instead.');
  await speak(slide.voiceScript);
}

/* ------------------------------------------------------------------ *
 * Voice chat mode
 * ------------------------------------------------------------------ */

function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
}

function pushStudentMessage(text) {
  const log = $('#chatLog');
  const wrap = el('div', 'msg student');
  wrap.appendChild(el('div', 'who', 'You'));
  wrap.appendChild(el('div', 'bubble', escapeHtml(text)));
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

function pushAstraMessage(json) {
  const log = $('#chatLog');
  const wrap = el('div', 'msg astra');
  wrap.appendChild(el('div', 'who', `Astra${json.topic ? ` · ${escapeHtml(json.topic)}` : ''}`));

  const bubble = el('div', 'bubble');
  const spoken = el('div', 'spoken', escapeHtml(json.spokenResponse));
  bubble.appendChild(spoken);

  const hints = el('div', 'hint-row');
  if (json.uiDisplay?.mathHint) {
    const h = el('div', 'hint math');
    h.appendChild(el('span', 'lbl', 'mathHint'));
    const holder = el('div');
    renderMathInto(holder, ensureMathDelimiters(json.uiDisplay.mathHint, false));
    h.appendChild(holder);
    hints.appendChild(h);
  }
  if (json.uiDisplay?.actionableTip) {
    const h = el('div', 'hint tip');
    h.appendChild(el('span', 'lbl', 'actionableTip · shortcut / exam trap'));
    h.appendChild(el('div', '', escapeHtml(json.uiDisplay.actionableTip)));
    hints.appendChild(h);
  }
  if (json.followUpPrompt) {
    const h = el('div', 'hint follow');
    h.appendChild(el('span', 'lbl', 'followUpPrompt'));
    h.appendChild(el('div', '', escapeHtml(json.followUpPrompt)));
    hints.appendChild(h);
  }
  bubble.appendChild(hints);

  const actions = el('div', 'msg-actions');
  const btnSpeak = el('button', 'btn small', '🔊 Replay');
  btnSpeak.addEventListener('click', () => speak(json.spokenResponse));
  const btnCopy = el('button', 'btn small ghost', 'Copy JSON');
  btnCopy.addEventListener('click', () => copyText(JSON.stringify(json, null, 2)));
  actions.appendChild(btnSpeak);
  actions.appendChild(btnCopy);
  if (json.engine) actions.appendChild(el('span', 'pill', `<span class="dot"></span>${escapeHtml(json.engine)}`));
  bubble.appendChild(actions);

  wrap.appendChild(bubble);
  log.appendChild(wrap);
  log.scrollTop = log.scrollHeight;
}

async function sendDoubt(text) {
  const message = String(text || '').trim();
  if (!message) return;

  pushStudentMessage(message);
  $('#doubtInput').value = '';
  setMicStatus('Astra is thinking…', false);

  const payload = {
    message,
    history: state.chatHistory.slice(-8),
    contextTopic: state.contextTopic,
    subject: state.filters.subject === 'All' ? null : state.filters.subject,
  };

  try {
    const json = await api('/api/doubt', { method: 'POST', body: JSON.stringify(payload) });
    state.lastVoice = json;
    state.lastRuleId = json.ruleId || null;
    if (json.topic) state.contextTopic = json.topic;
    state.chatHistory.push({ role: 'user', content: message });
    state.chatHistory.push({ role: 'assistant', content: json.spokenResponse });
    pushAstraMessage(json);
    state.stats.doubts += 1;
    updateSessionStats();
    state.jsonTab = 'voice';
    syncJsonTabs();
    paintJson();
    setMicStatus('', false);
    if (settings.autoSpeak) await speak(json.spokenResponse);
    else maybeHandsFree();
  } catch (err) {
    setMicStatus(`Request failed: ${err.message}`, false);
    toast(`Doubt request failed — ${err.message}`);
  }
}

function setMicStatus(text, live, interim = false) {
  const el2 = $('#micStatus');
  el2.className = `mic-status${live ? ' live' : ''}`;
  el2.innerHTML = interim
    ? `<span class="interim">${escapeHtml(text)}</span>`
    : escapeHtml(text);
}

function startListening() {
  if (!stt.supported) {
    setMicStatus('This browser has no SpeechRecognition (try Chrome/Edge) — type your doubt instead.', false);
    toast('Mic unavailable in this browser — typing works the same.');
    return;
  }
  tts.stop();
  stt.lang = settings.langHint ? 'en-IN' : 'en-US';
  stt.start();
}

stt.handlers = {
  start: () => {
    $('#btnMic').classList.add('rec');
    $('#btnMic').textContent = '⏹ Listening…';
    setMicStatus('Listening — speak your doubt.', true);
  },
  interim: (text) => setMicStatus(text, true, true),
  result: (text) => {
    $('#doubtInput').value = text;
    sendDoubt(text);
  },
  error: (code) => {
    $('#btnMic').classList.remove('rec');
    $('#btnMic').textContent = '🎙️ Speak';
    const map = {
      'not-allowed': 'Microphone permission blocked — allow it in the browser, or type instead.',
      'no-speech': 'No speech detected. Try again, a little louder.',
      unsupported: 'SpeechRecognition is not supported here — use Chrome or Edge, or type.',
      network: 'Speech service unreachable — type your doubt instead.',
      aborted: 'Listening stopped.',
    };
    setMicStatus(map[code] || `Mic error: ${code}`, false);
  },
  end: () => {
    $('#btnMic').classList.remove('rec');
    $('#btnMic').textContent = '🎙️ Speak';
  },
};

/* ------------------------------------------------------------------ *
 * Quick prompts
 * ------------------------------------------------------------------ */

const QUICK = [
  'Why is work done by centripetal force zero?',
  'I didn\u2019t get step 2',
  'How do I decide the limiting reagent?',
  'Explain the sign convention in ray optics',
  'When can I use L\u2019Hospital\u2019s rule?',
  'Why is molality preferred over molarity?',
  'Difference between geometry and shape in VSEPR',
  'How do I manage time in the JEE Main paper?',
];

function paintQuickChips() {
  const wrap = $('#quickChips');
  wrap.innerHTML = QUICK.map((q) => `<button class="chip" data-q="${escapeHtml(q)}">${escapeHtml(q)}</button>`).join('');
  $$('.chip', wrap).forEach((c) => c.addEventListener('click', () => sendDoubt(c.dataset.q)));
}

/* ------------------------------------------------------------------ *
 * Views
 * ------------------------------------------------------------------ */

function setView(name) {
  state.view = name;
  $$('.view').forEach((v) => v.classList.remove('active'));
  const map = { home: 'view-home', lecture: 'view-lecture', chat: 'view-chat', api: 'view-api' };
  $(`#${map[name]}`)?.classList.add('active');
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  $('#filterCard').style.display = name === 'lecture' ? 'none' : '';
  if (name !== 'lecture') {
    state.autoPlay = false;
    tts.stop();
    $('#btnAutoPlay').classList.remove('on');
    $('#btnAutoPlay').textContent = '▶ Auto-narrate deck';
  }
}

function syncJsonTabs() {
  $$('#jsonTabs .chip').forEach((c) => c.classList.toggle('on', c.dataset.json === state.jsonTab));
  paintJson();
}

function updateSessionStats() {
  $('#stSlides').textContent = state.stats.slides;
  $('#stDoubts').textContent = state.stats.doubts;
  $('#stSpoken').textContent = state.stats.spoken;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('Copied.');
    } catch {
      toast('Copy blocked by the browser.');
    }
    ta.remove();
  }
}

/* ------------------------------------------------------------------ *
 * Voice settings modal
 * ------------------------------------------------------------------ */

function populateVoiceSelect() {
  const sel = $('#voiceSelect');
  if (!tts.voices.length) {
    sel.innerHTML = '<option>No voices reported by this browser yet</option>';
    return;
  }
  const preferred = tts.preferredVoice();
  if (!settings.voiceURI && preferred) settings.voiceURI = preferred.voiceURI;

  sel.innerHTML = tts.voices
    .map((v) => {
      const isDefault = v.voiceURI === settings.voiceURI;
      return `<option value="${escapeHtml(v.voiceURI)}"${isDefault ? ' selected' : ''}>${escapeHtml(v.name)} — ${escapeHtml(v.lang)}${v.localService ? '' : ' (network)'}</option>`;
    })
    .join('');
  updateVoicePill();
}

function openModal() {
  $('#rateRange').value = settings.rate;
  $('#pitchRange').value = settings.pitch;
  $('#rateOut').textContent = `${Number(settings.rate).toFixed(2)}×`;
  $('#pitchOut').textContent = Number(settings.pitch).toFixed(2);
  $('#optAutoSpeak').checked = settings.autoSpeak;
  $('#optAutoNarrate').checked = settings.autoNarrate;
  $('#optHandsFree').checked = settings.handsFree;
  $('#optLangHint').checked = settings.langHint;
  $('#apiKey').value = settings.apiKey;
  $('#btnAutoSpeak').classList.toggle('on', settings.autoSpeak);
  populateVoiceSelect();
  $('#voiceModal').classList.add('open');
}

function closeModal() {
  $('#voiceModal').classList.remove('open');
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function boot() {
  loadSettings();
  applyTtsSettings();
  paintQuickChips();
  updateSessionStats();
  updateVoicePill();

  // Health / engine pill
  try {
    const health = await api('/api/health');
    $('#engineLabel').textContent = health.engine === 'live-model' ? 'live model connected' : `offline engine · ${health.doubtRules} rules`;
    $('#stRules').textContent = health.doubtRules;
    $('#stDecks').textContent = health.lectures;
    $('#kpiRules').textContent = health.doubtRules;
  } catch {
    $('#engineLabel').textContent = 'server unreachable';
    $('#enginePill').classList.add('is-off');
  }

  // Catalogue
  try {
    state.catalog = await api('/api/catalog');
    state.decks = state.catalog.lectures;
    $('#kpiDecks').textContent = state.decks.length;
    $('#kpiSlides').textContent = state.decks.reduce((a, d) => a + d.slideCount, 0);
    $('#kpiMinutes').textContent = `${state.decks.reduce((a, d) => a + d.minutes, 0)} min`;
    paintDeckGrid();
  } catch (err) {
    $('#deckGrid').innerHTML = `<div class="empty" style="grid-column:1/-1">Could not load the catalogue: ${escapeHtml(err.message)}</div>`;
  }

  // Schema view
  api('/api/schema')
    .then((s) => {
      $('#schemaLecture').innerHTML = highlightJson(s.LECTURE_MODE);
      $('#schemaVoice').innerHTML = highlightJson(s.VOICE_CHAT_MODE);
    })
    .catch(() => {
      $('#schemaLecture').textContent = 'unavailable';
      $('#schemaVoice').textContent = 'unavailable';
    });

  /* ---------- events ---------- */

  $$('.nav-btn').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.view;
      setView(v);
      if (v === 'home') paintDeckGrid();
    })
  );

  $$('#examChips .chip').forEach((c) =>
    c.addEventListener('click', () => {
      $$('#examChips .chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      state.filters.exam = c.dataset.exam;
      paintDeckGrid();
    })
  );

  $$('#subjectChips .chip').forEach((c) =>
    c.addEventListener('click', () => {
      $$('#subjectChips .chip').forEach((x) => x.classList.remove('on'));
      c.classList.add('on');
      state.filters.subject = c.dataset.subject;
      paintDeckGrid();
    })
  );

  $('#btnStartChat').addEventListener('click', () => {
    setView('chat');
    $('#doubtInput').focus();
    if (!state.chatHistory.length) {
      sendDoubt('Hi Astra, I want to start a doubt clearing session.');
    }
  });
  $('#btnScrollDecks').addEventListener('click', () => $('#deckGrid').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  $('#btnBackHome').addEventListener('click', () => setView('home'));

  $('#btnPrev').addEventListener('click', () => gotoSlide(state.slideIndex - 1));
  $('#btnNext').addEventListener('click', () => gotoSlide(state.slideIndex + 1));
  $('#btnNarrate').addEventListener('click', () => {
    if (tts.speaking) tts.stop();
    else narrateSlide();
  });
  $('#btnStopSpeak').addEventListener('click', () => {
    state.autoPlay = false;
    $('#btnAutoPlay').classList.remove('on');
    $('#btnAutoPlay').textContent = '▶ Auto-narrate deck';
    tts.stop();
  });
  $('#btnAutoPlay').addEventListener('click', () => {
    state.autoPlay = !state.autoPlay;
    $('#btnAutoPlay').classList.toggle('on', state.autoPlay);
    $('#btnAutoPlay').textContent = state.autoPlay ? '⏸ Narrating deck…' : '▶ Auto-narrate deck';
    if (state.autoPlay) narrateSlide();
    else tts.stop();
  });

  $('#btnAskDoubt').addEventListener('click', () => {
    const slide = state.currentDeck?.slides?.[state.slideIndex];
    if (slide) state.contextTopic = state.currentDeck.topic;
    setView('chat');
    $('#doubtInput').value = slide ? `I didn't get step ${slide.slideNumber} of ${state.currentDeck.topic}. ` : '';
    $('#doubtInput').focus();
  });

  $('#btnRawSlide').addEventListener('click', () => {
    state.jsonTab = 'slide';
    syncJsonTabs();
    toast('Showing the raw LECTURE_MODE slide object in the right panel.');
  });

  $('#btnSend').addEventListener('click', () => sendDoubt($('#doubtInput').value));
  $('#doubtInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendDoubt($('#doubtInput').value);
    }
  });

  $('#btnMic').addEventListener('click', () => {
    if (stt.listening) stt.stop();
    else startListening();
  });

  $('#btnAutoSpeak').addEventListener('click', () => {
    settings.autoSpeak = !settings.autoSpeak;
    $('#btnAutoSpeak').classList.toggle('on', settings.autoSpeak);
    $('#optAutoSpeak').checked = settings.autoSpeak;
    saveSettings();
    if (!settings.autoSpeak) tts.stop();
    toast(`Auto-speak ${settings.autoSpeak ? 'on' : 'off'}`);
  });

  $('#btnClearChat').addEventListener('click', () => {
    $('#chatLog').innerHTML = '';
    state.chatHistory = [];
    state.lastVoice = null;
    state.lastRuleId = null;
    paintJson();
    toast('Session cleared.');
  });

  $('#btnReset').addEventListener('click', () => {
    state.stats = { slides: 0, doubts: 0, spoken: 0 };
    updateSessionStats();
    toast('Session counters reset.');
  });

  $$('#jsonTabs .chip').forEach((c) =>
    c.addEventListener('click', () => {
      state.jsonTab = c.dataset.json;
      syncJsonTabs();
    })
  );

  $('#btnCopyJson').addEventListener('click', () => {
    const payload = currentPayload();
    if (!payload) return toast('Nothing to copy yet.');
    copyText(JSON.stringify(payload, null, 2));
  });

  $('#btnDownloadJson').addEventListener('click', () => {
    const payload = currentPayload();
    if (!payload) return toast('Nothing to download yet.');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = payload.mode === 'LECTURE' ? `${payload.topic || 'lecture'}.json` : 'astra-voice-chat.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  // Voice modal
  $('#btnVoiceSettings').addEventListener('click', openModal);
  $('#btnCloseModal').addEventListener('click', closeModal);
  $('#voiceModal').addEventListener('click', (e) => {
    if (e.target === $('#voiceModal')) closeModal();
  });
  $('#voiceSelect').addEventListener('change', (e) => {
    settings.voiceURI = e.target.value;
    applyTtsSettings();
  });
  $('#rateRange').addEventListener('input', (e) => {
    settings.rate = Number(e.target.value);
    $('#rateOut').textContent = `${settings.rate.toFixed(2)}×`;
  });
  $('#pitchRange').addEventListener('input', (e) => {
    settings.pitch = Number(e.target.value);
    $('#pitchOut').textContent = settings.pitch.toFixed(2);
  });
  $('#btnTestVoice').addEventListener('click', () => {
    applyTtsSettings();
    speak(
      'Hello, I am Astra, your master educator for JEE and NEET. Let us take one concept at a time, and I will keep every answer short enough to listen to.'
    );
  });
  $('#btnSaveVoice').addEventListener('click', () => {
    settings.autoSpeak = $('#optAutoSpeak').checked;
    settings.autoNarrate = $('#optAutoNarrate').checked;
    settings.handsFree = $('#optHandsFree').checked;
    settings.langHint = $('#optLangHint').checked;
    settings.apiKey = $('#apiKey').value.trim();
    applyTtsSettings();
    saveSettings();
    $('#btnAutoSpeak').classList.toggle('on', settings.autoSpeak);
    updateVoicePill();
    closeModal();
    toast('Voice settings saved.');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (typing) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (e.key === 'Escape') {
      tts.stop();
      stt.stop();
      closeModal();
      return;
    }
    if (state.view !== 'lecture') return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      gotoSlide(state.slideIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      gotoSlide(state.slideIndex - 1);
    } else if (e.key === ' ') {
      e.preventDefault();
      if (tts.speaking) tts.stop();
      else narrateSlide();
    }
  });

  setView('home');
  syncJsonTabs();
}

document.addEventListener('DOMContentLoaded', () => {
  boot().catch((err) => {
    console.error('[Astra] boot failed:', err);
    const grid = document.querySelector('#deckGrid');
    if (grid) grid.innerHTML = `<div class="empty" style="grid-column:1/-1">Astra could not start: ${String(err && err.message)}</div>`;
  });
});
