'use strict';

/**
 * local-models.js — local model integration on the client.
 *
 * Two transports:
 *   1. server relay  — the Node server talks to Ollama / LM Studio / llama.cpp
 *      / vLLM. Works when the model runs where the server runs.
 *   2. browser direct — the page itself calls the local model. This is the one
 *      that works when Astra is served from somewhere else (a sandbox preview,
 *      a VPS) but Ollama runs on the student's own PC: the browser can always
 *      reach its own localhost.
 *
 * Also drives the two generation features: "write me a deck" (LECTURE_MODE)
 * and "give me practice questions" for the current slide.
 */

/* ------------------------------------------------------------------ *
 * Browser-direct provider client
 * ------------------------------------------------------------------ */

const AstraDirect = {
  defaults: {
    ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:3b-instruct' },
    lmstudio: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'qwen2.5-3b-instruct' },
    llamacpp: { baseUrl: 'http://127.0.0.1:8080/v1', model: 'local-model' },
    vllm: { baseUrl: 'http://127.0.0.1:8000/v1', model: 'Qwen/Qwen2.5-3B-Instruct' },
    openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    'openai-compatible': { baseUrl: 'http://127.0.0.1:8000/v1', model: 'local-model' },
  },

  resolve(cfg = {}) {
    const provider = cfg.provider || 'ollama';
    const preset = this.defaults[provider] || this.defaults['openai-compatible'];
    let baseUrl = (cfg.baseUrl || preset.baseUrl).replace(/\/+$/, '');
    const model = cfg.model || preset.model;
    const apiKey = cfg.apiKey || 'not-needed';

    const isOllama = provider === 'ollama' || /:11434/.test(baseUrl);
    const native = isOllama && !/\/v\d+$/.test(baseUrl);
    if (!native && !/\/v\d+$/.test(baseUrl)) baseUrl = `${baseUrl}/v1`;
    return { provider, baseUrl, model, apiKey, api: native ? 'ollama-native' : 'openai-compatible' };
  },

  async test(cfg) {
    const c = this.resolve(cfg);
    const started = Date.now();
    try {
      if (c.api === 'ollama-native') {
        const res = await fetch(`${c.baseUrl}/api/tags`, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const models = (data.models || []).map((m) => m.name || m.model);
        return {
          ok: true,
          ms: Date.now() - started,
          provider: `ollama (browser-direct)`,
          baseUrl: c.baseUrl,
          model: c.model,
          models,
          modelAvailable: models.some((m) => m.split(':')[0] === c.model.split(':')[0]),
        };
      }
      const res = await fetch(`${c.baseUrl}/models`, {
        headers: { authorization: `Bearer ${c.apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        ok: true,
        ms: Date.now() - started,
        provider: `${c.provider} (browser-direct)`,
        baseUrl: c.baseUrl,
        model: c.model,
        models: (data.data || []).map((m) => m.id),
      };
    } catch (err) {
      return {
        ok: false,
        ms: Date.now() - started,
        provider: c.provider,
        baseUrl: c.baseUrl,
        error: String(err.message || err),
        hint: `The browser could not reach ${c.baseUrl}. Start the local server (ollama serve / LM Studio "Start"), and if Astra is served over https from another host set OLLAMA_ORIGINS=* and enable CORS in LM Studio. Otherwise switch off Browser-direct so the Astra server relays instead.`,
      };
    }
  },

  async chat(cfg, prompt, { system = '', temperature = 0.5, maxTokens = 6000, timeoutMs = 600000 } = {}) {
    const c = this.resolve(cfg);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (c.api === 'ollama-native') {
        const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }] : [{ role: 'user', content: prompt }];
        const res = await fetch(`${c.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: c.model, messages, stream: false, format: 'json', options: { temperature, num_predict: maxTokens } }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        return { text: data.message?.content || '', model: data.model || c.model, provider: `ollama-direct` };
      }

      const messages = system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }] : [{ role: 'user', content: prompt }];
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${c.apiKey}` },
        body: JSON.stringify({ model: c.model, messages, temperature, max_tokens: maxTokens, stream: false, response_format: { type: 'json_object' } }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return { text: data.choices?.[0]?.message?.content || '', model: data.model || c.model, provider: `${c.provider}-direct` };
    } finally {
      clearTimeout(timer);
    }
  },
};

window.AstraDirect = AstraDirect;

/** Shared prompt builder so browser-direct practice matches the server path. */
  function practicePrompt({ topic, exam, count, focus }) {
  return `Write ${count} exam-level practice questions on "${topic}" for ${exam}.
Focus the questions on: ${focus}

Return ONE JSON object and nothing else — no markdown fence, no commentary:
{"questions":[{"question":"...","options":["A","B","C","D"],"correct":<0-based index>,"explanation":"2-4 sentences with the governing equation and the trap the wrong options exploit","difficulty":"easy|medium|hard","exam":"${exam}"}]}

Rules: exactly 4 options, only one correct, no "all of the above"; distractors must be real misconceptions; include units; do NOT use LaTeX in question or options (write "m/s^2", "root(gR)") so it reads aloud cleanly.`;
}

window.AstraPrompts = { practicePrompt };

/* ------------------------------------------------------------------ *
 * Deck generation panel
 * ------------------------------------------------------------------ */

(function initGeneratePanel() {
  const UI = () => window.AstraUI;

  function setBusy(busy, label) {
    const btn = document.querySelector('#btnGenerateDeck');
    const log = document.querySelector('#genLog');
    if (btn) {
      btn.disabled = busy;
      btn.textContent = busy ? label || 'Generating…' : '⚡ Generate deck';
    }
    document.querySelectorAll('#genPanel input, #genPanel select').forEach((el) => {
      el.disabled = busy;
    });
    if (log && busy && label) log.textContent = label;
  }

  function logLine(text, cls = '') {
    const log = document.querySelector('#genLog');
    if (!log) return;
    log.className = `gen-log ${cls}`;
    log.textContent = text;
  }

  function buildPrompt(cfg) {
    // Mirror of server/generate.js so browser-direct mode produces the same contract.
    const slideCount = Number(document.querySelector('#genSlides').value) || 7;
    return `Create a lecture deck for a ${cfg.targetExam} student.

TOPIC   : ${cfg.topic}
SUBJECT : ${cfg.subject}
EXAM    : ${cfg.targetExam}
SLIDES  : exactly ${slideCount}

Return ONE JSON object and nothing else — no markdown fence, no commentary. Shape:
{"mode":"LECTURE","topic":"${cfg.topic}","targetExam":"${cfg.targetExam}","subject":"${cfg.subject}","tagline":"...","tags":["..."],"prerequisites":["..."],"slides":[...]}

Every slide must have exactly these keys: slideNumber (1-based integer), title, content{bullets[4-6], latexFormulas[1-4 raw LaTeX, no dollar signs, balanced braces], keyTakeaway}, voiceScript (110-170 words).

Rules:
1. voiceScript is SPOKEN audio: write every formula phonetically ("F equals m a", "root g r", "u squared sine two theta over g"). No LaTeX, no backslashes, no dollar signs, no braces, no symbols inside voiceScript.
2. latexFormulas is precise raw LaTeX that compiles in KaTeX.
3. Sequence: motivation -> definitions -> core results -> the hard part -> application -> traps and exam method. The final slide is traps plus a practice plan.
4. Be exam-specific for ${cfg.targetExam}, include one non-obvious insight and at least three concrete exam traps with fixes.
5. Never invent previous-year question numbers or statistics.`;
  }

  async function generateDirect(cfg) {
    const prompt = buildPrompt(cfg);
    logLine('Browser-direct: calling the local model… (large decks can take a minute on a 3B model)', 'busy');
    const out = await AstraDirect.chat(
      { provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model, apiKey: cfg.apiKey },
      prompt,
      { temperature: 0.5 }
    );
    // Let the server validate/repair and (optionally) save it.
    logLine('Validating against the LECTURE_MODE contract…', 'busy');
    const res = await fetch('/api/generate/lecture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rawModelOutput: out.text, topic: cfg.topic, targetExam: cfg.targetExam, subject: cfg.subject, save: cfg.save, model: out.model, provider: 'browser-direct' }),
    });
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    return res.json();
  }

  async function generateViaServer(cfg) {
    logLine(`Server relay: ${cfg.provider || 'local model'} is writing ${cfg.slideCount} slides…`, 'busy');
    return UI().api('/api/generate/lecture', { method: 'POST', body: JSON.stringify(cfg) });
  }

  function renderWarnings(data) {
    const box = document.querySelector('#genWarnings');
    if (!box) return;
    const warnings = data.validation?.warnings || [];
    const errors = data.validation?.errors || [];
    if (!warnings.length && !errors.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML =
      (errors.length ? `<div class="warn-line err"><b>Rejected fields:</b> ${errors.map(UI().escapeHtml).join(' · ')}</div>` : '') +
      (warnings.length
        ? `<div class="warn-line"><b>Auto-repaired:</b> ${warnings.slice(0, 8).map(UI().escapeHtml).join(' · ')}${
            warnings.length > 8 ? ` (+${warnings.length - 8} more)` : ''
          }</div>`
        : '');
  }

  function showResult(data) {
    renderWarnings(data);
    const meta = document.querySelector('#genMeta');
    if (meta) {
      const secs = data.elapsedMs ? `${(data.elapsedMs / 1000).toFixed(1)}s` : '—';
      meta.textContent = `${data.deck.slides.length} slides · ${secs} · ${data.engine || data.deck.generatedBy?.provider || 'local model'}${
        data.saved?.id ? ` · saved as ${data.saved.id}.json` : data.saved?.error ? ` · not saved: ${data.saved.error}` : ''
      }`;
    }
    logLine(
      data.saved?.id
        ? `Deck saved to the library and opened. Generated locally in ${(data.elapsedMs / 1000).toFixed(1)}s.`
        : 'Deck generated. Preview it, then save to the library.',
      data.saved?.id ? 'good' : 'good'
    );

    UI().state.jsonTab = 'lecture';
    const deck = data.deck;
    if (data.saved?.id) {
      // refresh the catalogue so the new deck appears in the library
      UI()
        .api('/api/catalog')
        .then((cat) => {
          UI().state.catalog = cat;
          UI().state.decks = cat.lectures;
          document.querySelector('#kpiDecks').textContent = cat.lectures.length;
          document.querySelector('#kpiSlides').textContent = cat.lectures.reduce((a, d) => a + d.slideCount, 0);
          UI().paintDeckGrid();
          UI().openLecture(data.saved.id);
        })
        .catch(() => UI().openDeckObject(deck));
    } else {
      UI().openDeckObject(deck);
      const saveBtn = document.querySelector('#btnSaveDeck');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.dataset.pending = JSON.stringify(deck);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('#btnGenerateDeck');
    if (!btn) return;

    btn.addEventListener('click', async () => {
      const s = UI().settings;
      const cfg = {
        topic: document.querySelector('#genTopic').value.trim(),
        subject: document.querySelector('#genSubject').value,
        targetExam: document.querySelector('#genExam').value,
        slideCount: Number(document.querySelector('#genSlides').value) || 7,
        save: document.querySelector('#btnSaveDeck')?.dataset.autoSave === '1',
        provider: s.provider,
        baseUrl: s.baseUrl,
        model: s.model,
        apiKey: s.apiKey,
      };

      if (!cfg.topic) {
        logLine('Give the deck a topic first — e.g. "Rotational motion: moment of inertia and angular momentum".', 'bad');
        return;
      }
      if (!cfg.provider) {
        logLine(
          'No local model selected. Open Voice setup → Local model, pick Ollama (or LM Studio) and test the connection.',
          'bad'
        );
        UI().toast('Pick a local model in Voice setup first.');
        return;
      }

      setBusy(true, `Generating ${cfg.slideCount} slides with ${cfg.model || cfg.provider}…`);
      const started = Date.now();
      const ticker = setInterval(() => setBusy(true, `Generating… ${Math.round((Date.now() - started) / 1000)}s elapsed`), 1000);

      try {
        const data = s.direct ? await generateDirect(cfg) : await generateViaServer(cfg);
        showResult(data);
      } catch (err) {
        logLine(`Generation failed: ${err.message}`, 'bad');
        UI().toast('Local model generation failed — see the log line.');
      } finally {
        clearInterval(ticker);
        setBusy(false);
      }
    });

    const saveBtn = document.querySelector('#btnSaveDeck');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const pending = saveBtn.dataset.pending;
        if (!pending) return UI().toast('Nothing pending — generate a deck first.');
        const deck = JSON.parse(pending);
        saveBtn.disabled = true;
        try {
          const res = await fetch('/api/decks', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ deck, overwrite: false }),
          });
          const out = await res.json();
          if (!res.ok) throw new Error(out.error || `HTTP ${res.status}`);
          delete saveBtn.dataset.pending;
          UI().toast(`Saved to the library as ${out.id}.json`);
          const cat = await UI().api('/api/catalog');
          UI().state.catalog = cat;
          UI().state.decks = cat.lectures;
          UI().paintDeckGrid();
          UI().openLecture(out.id);
        } catch (err) {
          saveBtn.disabled = false;
          UI().toast(`Save failed: ${err.message}`);
        }
      });
    }
  });
})();

/* ------------------------------------------------------------------ *
 * Practice questions for the current slide
 * ------------------------------------------------------------------ */

(function initPractice() {
  const UI = () => window.AstraUI;

  function renderQuestions(data) {
    const wrap = document.querySelector('#practiceList');
    if (!wrap) return;
    const qs = data.practice?.questions || [];
    if (!qs.length) {
      wrap.innerHTML = '<div class="empty">The model returned no questions — try a more specific focus.</div>';
      return;
    }
    wrap.innerHTML = qs
      .map(
        (q, i) => `
      <div class="pq" data-i="${i}">
        <div class="pq-head">
          <span class="pq-num">Q${q.number}</span>
          <span class="tag exam">${UI().escapeHtml(q.exam || '')}</span>
          <span class="tag diff-${UI().escapeHtml(q.difficulty)}">${UI().escapeHtml(q.difficulty)}</span>
        </div>
        <div class="pq-text"></div>
        <div class="pq-options">
          ${q.options
            .map(
              (o, oi) =>
                `<button class="pq-opt" data-oi="${oi}"><span class="pq-letter">${'ABCD'[oi]}</span><span class="pq-opt-text"></span></button>`
            )
            .join('')}
        </div>
        <div class="pq-actions">
          <button class="btn small ghost pq-reveal">Show answer &amp; explanation</button>
          <button class="btn small ghost pq-speak">🔊 Read aloud</button>
        </div>
        <div class="pq-explain"></div>
      </div>`
      )
      .join('');

    qs.forEach((q, i) => {
      const card = wrap.querySelector(`.pq[data-i="${i}"]`);
      UI().renderMathInto(card.querySelector('.pq-text'), q.question);
      card.querySelectorAll('.pq-opt-text').forEach((node, oi) => UI().renderMathInto(node, q.options[oi]));

      let answered = false;
      card.querySelectorAll('.pq-opt').forEach((opt) =>
        opt.addEventListener('click', () => {
          if (answered) return;
          answered = true;
          const chosen = Number(opt.dataset.oi);
          card.querySelectorAll('.pq-opt').forEach((o, oi) => {
            o.classList.add('locked');
            if (oi === q.correctIndex) o.classList.add('right');
            else if (oi === chosen) o.classList.add('wrong');
          });
          const explain = card.querySelector('.pq-explain');
          explain.classList.add('open');
          UI().renderMathInto(explain, q.explanation || '');
          const stats = UI().state.practiceStats;
          stats.total += 1;
          if (chosen === q.correctIndex) stats.correct += 1;
          const el = document.querySelector('#practiceScore');
          if (el) el.textContent = `${stats.correct}/${stats.total} correct`;
        })
      );

      card.querySelector('.pq-reveal').addEventListener('click', () => {
        answered = true;
        card.querySelectorAll('.pq-opt').forEach((o, oi) => {
          o.classList.add('locked');
          if (oi === q.correctIndex) o.classList.add('right');
        });
        const explain = card.querySelector('.pq-explain');
        explain.classList.add('open');
        UI().renderMathInto(explain, q.explanation || '');
      });

      card.querySelector('.pq-speak').addEventListener('click', () => {
        const lines = [
          q.spoken || q.question,
          'Options.',
          ...q.options.map((o, oi) => `${'ABCD'[oi]}. ${o}`),
          'Think for a moment before I give the answer.',
        ];
        UI().speak(lines.join(' '));
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.querySelector('#btnPractice');
    if (!btn) return;
    if (!UI().state.practiceStats) UI().state.practiceStats = { total: 0, correct: 0 };

    btn.addEventListener('click', async () => {
      const s = UI().settings;
      const deck = UI().state.currentDeck;
      if (!deck) return UI().toast('Open a deck first.');
      if (!s.provider) {
        UI().toast('Pick a local model in Voice setup to generate practice questions.');
        return;
      }
      const slide = deck.slides[UI().state.slideIndex];
      const panel = document.querySelector('#practicePanel');
      panel.classList.add('open');
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Writing questions…';
      document.querySelector('#practiceList').innerHTML =
        '<div class="empty">The local model is writing exam-level questions on this slide…</div>';

      try {
        const topic = `${deck.topic} — ${slide.title}`;
        const count = Number(document.querySelector('#practiceCount')?.value || 4);
        const focus = slide.content.bullets.slice(0, 3).join(' | ');
        const body = {
          topic,
          targetExam: deck.targetExam,
          count,
          focus,
          provider: s.provider,
          baseUrl: s.baseUrl,
          model: s.model,
          apiKey: s.apiKey,
        };

        let data;
        if (s.direct) {
          const out = await AstraDirect.chat(
            { provider: s.provider, baseUrl: s.baseUrl, model: s.model, apiKey: s.apiKey },
            practicePrompt({ topic, exam: deck.targetExam, count, focus })
          );
          data = await UI().api('/api/generate/practice', {
            method: 'POST',
            body: JSON.stringify({ rawModelOutput: out.text, topic, targetExam: deck.targetExam, model: out.model, provider: 'browser-direct' }),
          });
        } else {
          data = await UI().api('/api/generate/practice', { method: 'POST', body: JSON.stringify(body) });
        }
        renderQuestions(data);
      } catch (err) {
        document.querySelector('#practiceList').innerHTML = `<div class="empty">Generation failed: ${UI().escapeHtml(err.message)}</div>`;
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });

    document.querySelector('#btnClosePractice')?.addEventListener('click', () => {
      document.querySelector('#practicePanel').classList.remove('open');
    });
  });
})();
