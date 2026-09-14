'use strict';

/**
 * speech.js — browser voice layer for Astra.
 *
 * AstraTTS: narration via SpeechSynthesis (used for lecture voiceScript and
 *           VOICE_CHAT_MODE spokenResponse).
 * AstraSTT: dictation via SpeechRecognition (Web Speech API) with graceful
 *           fallback to typing when the browser does not support it.
 */

/* ------------------------------------------------------------------ *
 * Text to speech
 * ------------------------------------------------------------------ */

class AstraTTS {
  constructor() {
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voiceURI = '';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.voices = [];
    this._ready = false;
    this._queue = [];
    this._speaking = false;
    this.onStateChange = () => {};

    if (this.supported) {
      const load = () => {
        this.voices = window.speechSynthesis.getVoices() || [];
        if (this.voices.length) {
          this._ready = true;
          this.onStateChange({ type: 'voices', voices: this.voices });
        }
      };
      load();
      window.speechSynthesis.onvoiceschanged = load;
      setTimeout(load, 400);
      setTimeout(load, 1500);
    }
  }

  /** Pick a sensible default: en-IN first, then any en-* voice. */
  preferredVoice() {
    if (!this.voices.length) return null;
    const pick = (test) => this.voices.find(test) || null;
    return (
      pick((v) => /^en[-_]IN/i.test(v.lang)) ||
      pick((v) => /^en[-_]GB/i.test(v.lang)) ||
      pick((v) => /^en/i.test(v.lang)) ||
      this.voices[0]
    );
  }

  setVoice(uri) {
    this.voiceURI = uri || '';
  }

  voiceName() {
    const v = this.voices.find((x) => x.voiceURI === this.voiceURI);
    return v ? `${v.name} (${v.lang})` : '';
  }

  stop() {
    if (!this.supported) return;
    this._queue = [];
    this._speaking = false;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* noop */
    }
    this.onStateChange({ type: 'end' });
  }

  get speaking() {
    return this._speaking;
  }

  /**
   * Speak text. Long text is chunked at sentence boundaries because several
   * engines truncate utterances beyond ~200 characters.
   */
  speak(text, opts = {}) {
    if (!this.supported) {
      this.onStateChange({ type: 'unsupported' });
      return Promise.resolve(false);
    }
    const clean = this.sanitize(String(text || ''));
    if (!clean.trim()) return Promise.resolve(false);

    this.stop();
    const chunks = this.chunk(clean);
    let i = 0;

    return new Promise((resolve) => {
      const next = () => {
        if (i >= chunks.length) {
          this._speaking = false;
          this.onStateChange({ type: 'end' });
          resolve(true);
          return;
        }
        const u = new SpeechSynthesisUtterance(chunks[i++]);
        const voice = this.voices.find((v) => v.voiceURI === this.voiceURI) || this.preferredVoice();
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        } else {
          u.lang = 'en-IN';
        }
        u.rate = this.rate;
        u.pitch = this.pitch;
        u.volume = this.volume;
        u.onstart = () => {
          this._speaking = true;
          this.onStateChange({ type: 'start', text: clean });
        };
        u.onend = () => setTimeout(next, 90);
        u.onerror = () => setTimeout(next, 90);
        window.speechSynthesis.speak(u);
      };
      next();
      if (opts.onDone) this.onStateChange = opts.onDone;
    });
  }

  /** Strip LaTeX/markup so TTS never reads backslashes aloud. */
  sanitize(text) {
    return text
      .replace(/\$\$[\s\S]*?\$\$/g, ' ')
      .replace(/\$[^$]*\$/g, ' ')
      .replace(/\\(?:frac|dfrac|sqrt|vec|hat|bar|int|sum|prod|lim|alpha|beta|gamma|theta|omega|Delta|mu|pi|lambda|sigma|phi|cdot|times|Rightarrow|rightleftharpoons|ce|text|mathrm|left|right|quad|qquad|ne|le|ge|approx|infty|circ|log|ln|sin|cos|tan)[^a-zA-Z]?/g, ' ')
      .replace(/[{}\\]/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  chunk(text, max = 190) {
    const sentences = text.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g) || [text];
    const out = [];
    let buf = '';
    for (const s of sentences) {
      if ((buf + s).length > max && buf) {
        out.push(buf.trim());
        buf = '';
      }
      if (s.length > max) {
        const parts = s.match(new RegExp(`.{1,${max}}(\\s|$)`, 'g')) || [s];
        parts.forEach((p, idx) => {
          if (idx === parts.length - 1) buf += p;
          else out.push(p.trim());
        });
        continue;
      }
      buf += s;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }
}

/* ------------------------------------------------------------------ *
 * Speech to text
 * ------------------------------------------------------------------ */

class AstraSTT {
  constructor() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    this.supported = !!SR;
    this.Ctor = SR;
    this.lang = 'en-IN';
    this.rec = null;
    this.listening = false;
    this.handlers = { start: () => {}, interim: () => {}, result: () => {}, error: () => {}, end: () => {} };
  }

  _new() {
    const rec = new this.Ctor();
    rec.lang = this.lang;
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      this.listening = true;
      this.handlers.start();
    };
    rec.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) this.handlers.interim(interim.trim());
      if (final.trim()) this.handlers.result(final.trim());
    };
    rec.onerror = (event) => {
      this.listening = false;
      this.handlers.error(event.error || 'unknown');
    };
    rec.onend = () => {
      this.listening = false;
      this.handlers.end();
    };
    return rec;
  }

  start() {
    if (!this.supported) {
      this.handlers.error('unsupported');
      return false;
    }
    if (this.listening) return true;
    try {
      this.rec = this._new();
      this.rec.start();
      return true;
    } catch (err) {
      this.handlers.error(String(err.message || err));
      return false;
    }
  }

  stop() {
    if (this.rec && this.listening) {
      try {
        this.rec.stop();
      } catch {
        /* noop */
      }
    }
    this.listening = false;
  }
}

window.AstraTTS = AstraTTS;
window.AstraSTT = AstraSTT;
