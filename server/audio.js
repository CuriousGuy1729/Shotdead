'use strict';

/**
 * audio.js — LOCAL audio engines for Astra.
 *
 * TTS  : Piper (neural, offline, CPU) → espeak-ng → none (browser Web Speech).
 * STT  : whisper.cpp → faster-whisper → none (browser SpeechRecognition).
 *
 * Everything is auto-detected from binaries/env, so the app works with zero
 * setup on a machine that has none of them, and instantly upgrades when a
 * local engine is installed:
 *
 *   ASTRA_TTS=piper|espeak-ng|none        ASTRA_TTS_VOICE=en_IN-smartknal-medium
 *   ASTRA_TTS_DATA_DIR=./models/piper     ASTRA_TTS_PYTHON=/path/to/venv/bin/python
 *   ASTRA_STT=whisper-cpp|faster-whisper  ASTRA_STT_MODEL=/path/to/ggml-base.en.bin
 *
 * Piper synthesis runs fully offline and returns a real 16-bit PCM WAV built
 * here (no ffmpeg needed) from Piper's raw audio stream.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DATA_DIR = process.env.ASTRA_TTS_DATA_DIR || path.join(ROOT, 'models', 'piper');

const VOICE_PREFERENCE = [
  'en_IN-smartknal-medium',
  'en_IN-pratham-medium',
  'en_GB-alba-medium',
  'en_GB-southern_english_female-low',
  'en_US-lessac-medium',
  'en_US-amy-medium',
];

/* ------------------------------------------------------------------ *
 * Detection helpers
 * ------------------------------------------------------------------ */

function whichSync(cmd) {
  if (!cmd) return null;
  if (cmd.includes(path.sep) && fs.existsSync(cmd)) return cmd;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      try {
        fs.accessSync(full, fs.constants.X_OK);
        return full;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}

function findPiperPython() {
  const candidates = [
    process.env.ASTRA_TTS_PYTHON,
    path.join(ROOT, '.tts-venv', 'bin', 'python'),
    path.join(ROOT, 'models', 'venv', 'bin', 'python'),
    '/tmp/tts/bin/python',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function listVoices(dataDir) {
  const found = [];
  for (const dir of [dataDir, path.join(ROOT, 'models', 'piper'), path.join(os.homedir(), '.local', 'share', 'piper')]) {
    try {
      if (!fs.existsSync(dir)) continue;
      for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith('.onnx')) continue;
        const voice = entry.replace(/\.onnx$/, '');
        const config = path.join(dir, `${voice}.onnx.json`);
        found.push({ id: voice, name: voice, file: path.join(dir, entry), config: fs.existsSync(config) ? config : null, dataDir: dir });
      }
    } catch {
      /* ignore unreadable dirs */
    }
  }
  const seen = new Set();
  return found.filter((v) => (seen.has(v.id) ? false : seen.add(v.id)));
}

function pickVoice(voices, requested) {
  if (!voices.length) return null;
  if (requested) {
    const exact = voices.find((v) => v.id === requested || v.name === requested);
    if (exact) return exact;
  }
  for (const pref of VOICE_PREFERENCE) {
    const hit = voices.find((v) => v.id === pref);
    if (hit) return hit;
  }
  const en = voices.find((v) => /^en[_-]/.test(v.id));
  return en || voices[0];
}

/* ------------------------------------------------------------------ *
 * TTS
 * ------------------------------------------------------------------ */

function ttsStatus() {
  const forced = (process.env.ASTRA_TTS || '').toLowerCase();
  const piperPython = findPiperPython();
  const piperBin = whichSync('piper');
  const dataDir = DEFAULT_DATA_DIR;
  const voices = listVoices(dataDir);
  const espeak = whichSync('espeak-ng') || whichSync('espeak');

  let provider = 'none';
  let reason = null;

  if (forced && forced !== 'auto' && forced !== 'none') {
    provider = forced;
  } else if (piperPython && voices.length) {
    provider = 'piper';
  } else if (piperBin && voices.length) {
    provider = 'piper-bin';
  } else if (espeak) {
    provider = 'espeak-ng';
  }

  if (provider.startsWith('piper') && !voices.length) {
    reason = `Piper is installed but no voice model was found in ${dataDir}. Run: python -m piper.download_voices en_IN-smartknal-medium --download-dir ${dataDir}`;
    provider = espeak ? 'espeak-ng' : 'none';
  }
  if (provider === 'none' && !reason) {
    reason = piperPython || piperBin
      ? 'Piper present, voice models missing (see local-models/setup-piper.sh).'
      : 'No local TTS engine found — the browser\u2019s own speech synthesis is being used. Install Piper for a local neural voice (local-models/setup-piper.sh).';
  }

  const selected = pickVoice(voices, process.env.ASTRA_TTS_VOICE);
  return {
    provider,
    reason,
    local: provider !== 'none',
    dataDir,
    voice: selected ? selected.id : null,
    voices: voices.map((v) => v.id),
    piperPython,
    piperBin,
    espeak: espeak || null,
    fallback: 'browser-speech-synthesis',
  };
}

/** Minimal 16-bit PCM WAV container. */
function wavWrap(pcm, sampleRate = 22050, channels = 1) {
  const byteRate = sampleRate * channels * 2;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(channels * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function sampleRateOf(voice) {
  try {
    const cfg = JSON.parse(fs.readFileSync(voice.config || `${voice.file}.json`, 'utf8'));
    return Number(cfg.audio?.sample_rate) || 22050;
  } catch {
    return 22050;
  }
}

function runPiper(voice, text, lengthScale) {
  return new Promise((resolve, reject) => {
    const status = ttsStatus();
    let bin;
    let argv;
    if (status.piperPython) {
      bin = status.piperPython;
      argv = ['-m', 'piper'];
    } else {
      bin = status.piperBin;
      argv = [];
    }
    argv.push('-m', voice.file);
    if (voice.config) argv.push('-c', voice.config);
    argv.push('--output-raw', '--length-scale', String(lengthScale));
    const args = argv;

    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', (c) => chunks.push(c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`piper exited ${code}: ${stderr.slice(0, 240)}`));
      const pcm = Buffer.concat(chunks);
      if (!pcm.length) return reject(new Error(`piper produced no audio: ${stderr.slice(0, 240)}`));
      resolve(wavWrap(pcm, sampleRateOf(voice)));
    });
    child.stdin.end(text);
  });
}

function runEspeak(text, rate = 165) {
  return new Promise((resolve, reject) => {
    const status = ttsStatus();
    const bin = status.espeak;
    const isNg = /espeak-ng/.test(bin || '');
    const out = path.join(os.tmpdir(), `astra-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
    const args = ['-v', isNg ? 'en-gb' : 'en', '-s', String(rate), '-w', out, text];

    execFile(bin, args, { timeout: 30000 }, (err) => {
      if (err) return reject(new Error(`espeak failed: ${err.message}`));
      fs.readFile(out, (readErr, data) => {
        fs.unlink(out, () => {});
        if (readErr) return reject(readErr);
        resolve(data);
      });
    });
  });
}

/**
 * Synthesise speech locally. Returns { wav, provider, voice } or null when no
 * local engine is available (the caller then uses browser speech synthesis).
 */
async function synthesize(text, options = {}) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const status = ttsStatus();

  try {
    if (status.provider === 'piper' || status.provider === 'piper-bin') {
      const voice = pickVoice(listVoices(status.dataDir), options.voice || process.env.ASTRA_TTS_VOICE);
      if (!voice) return null;
      const wav = await runPiper(voice, clean, options.lengthScale || 1.0);
      return { wav, provider: status.provider, voice: voice.id, engine: 'local' };
    }
    if (status.provider === 'espeak-ng') {
      const wav = await runEspeak(clean, options.rate || 165);
      return { wav, provider: 'espeak-ng', voice: 'espeak-en', engine: 'local' };
    }
  } catch (err) {
    return { error: String(err.message || err).slice(0, 300), provider: 'none', engine: 'none' };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * STT
 * ------------------------------------------------------------------ */

function sttStatus() {
  const forced = (process.env.ASTRA_STT || '').toLowerCase();
  const whisperCpp = process.env.ASTRA_STT_BIN || whichSync('whisper-cli') || whichSync('main');
  const model = process.env.ASTRA_STT_MODEL || '';
  const fasterWhisper = whichSync('faster-whisper') || whichSync('whisper');

  let provider = 'none';
  let reason = null;

  if (forced && forced !== 'auto') provider = forced;
  else if (whisperCpp && model && fs.existsSync(model)) provider = 'whisper-cpp';
  else if (fasterWhisper) provider = 'faster-whisper';
  else if (whisperCpp) provider = 'whisper-cpp-no-model';

  if (provider === 'whisper-cpp-no-model') {
    reason = 'whisper.cpp found but ASTRA_STT_MODEL is not set to a ggml model file.';
    provider = 'none';
  }
  if (provider === 'none' && !reason) {
    reason = 'No local STT engine found — the browser\u2019s SpeechRecognition is used. See local-models/setup-whisper.sh.';
  }

  return { provider, reason, local: provider !== 'none', binary: whisperCpp || fasterWhisper || null, model: model || null, fallback: 'browser-speech-recognition' };
}

/** Transcribe a WAV/16k PCM upload with a local engine, or null. */
async function transcribe(buffer, mimetype) {
  const status = sttStatus();
  if (!status.local || !buffer?.length) return null;
  const tmp = path.join(os.tmpdir(), `astra-stt-${Date.now()}.wav`);

  try {
    fs.writeFileSync(tmp, buffer);
    if (status.provider === 'whisper-cpp') {
      const out = await new Promise((resolve, reject) => {
        execFile(
          status.binary,
          ['-m', status.model, '-f', tmp, '-nt', '-np', '-l', 'en'],
          { timeout: 120000, maxBuffer: 8e6 },
          (err, stdout, stderr) => (err ? reject(new Error(stderr?.slice(0, 200) || err.message)) : resolve(stdout))
        );
      });
      return { text: out.trim(), provider: 'whisper-cpp', engine: 'local' };
    }
    if (status.provider === 'faster-whisper') {
      const out = await new Promise((resolve, reject) => {
        execFile(status.binary, [tmp], { timeout: 180000, maxBuffer: 8e6 }, (err, stdout) =>
          err ? reject(err) : resolve(stdout)
        );
      });
      return { text: out.trim(), provider: 'faster-whisper', engine: 'local' };
    }
  } catch (err) {
    return { text: '', error: String(err.message || err).slice(0, 240), provider: status.provider, engine: 'local' };
  } finally {
    fs.unlink(tmp, () => {});
  }
  return null;
}

module.exports = { ttsStatus, sttStatus, synthesize, transcribe, listVoices, pickVoice, DEFAULT_DATA_DIR };
