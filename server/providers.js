'use strict';

/**
 * providers.js — local model access for Astra.
 *
 * Speaks to any OpenAI-compatible server (LM Studio, llama.cpp, vLLM,
 * text-generation-webui, Ollama's /v1 shim) and to Ollama's native API.
 * A local model can live anywhere the Node process can reach: this machine,
 * a LAN box, or an SSH tunnel — so Qwen/Llama/Mistral running on the
 * student's own PC drives the app.
 *
 * Nothing here needs the internet. If no provider is configured or reachable,
 * Astra falls back to its offline knowledge base.
 */

const DEFAULTS = {
  ollama: { baseUrl: 'http://127.0.0.1:11434', model: 'qwen2.5:3b-instruct' },
  lmstudio: { baseUrl: 'http://127.0.0.1:1234/v1', model: 'qwen2.5-3b-instruct' },
  llamacpp: { baseUrl: 'http://127.0.0.1:8080/v1', model: 'local-model' },
  vllm: { baseUrl: 'http://127.0.0.1:8000/v1', model: 'Qwen/Qwen2.5-3B-Instruct' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
};

const KNOWN = Object.keys(DEFAULTS);

function stripTrailingSlash(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function normaliseBaseUrl(provider, baseUrl) {
  let url = stripTrailingSlash(baseUrl);
  if (!url) url = DEFAULTS[provider]?.baseUrl || DEFAULTS.openai.baseUrl;
  // OpenAI-compatible providers need the /v1 suffix; Ollama's native API must not have it.
  if (provider !== 'ollama-native' && !/\/v\d+$/.test(url) && !url.includes('/api')) url = `${url}/v1`;
  return url;
}

/**
 * Build the effective provider config.
 * Priority: explicit config (UI / request body) → x-astra-* headers → env → none.
 */
function resolveConfig({ body = {}, headers = {} } = {}) {
  const envProvider = (process.env.ASTRA_PROVIDER || process.env.OPENAI_API_KEY ? 'openai' : '').toLowerCase();
  const rawProvider = String(
    body.provider || headers['x-astra-provider'] || process.env.ASTRA_PROVIDER || envProvider || ''
  )
    .trim()
    .toLowerCase();

  const provider = KNOWN.includes(rawProvider) ? rawProvider : rawProvider ? 'openai-compatible' : '';
  if (!provider) return null;

  const baseUrlRaw =
    body.baseUrl || body.base_url || headers['x-astra-base-url'] || process.env.ASTRA_BASE_URL || process.env.OPENAI_BASE_URL || '';
  const apiKey =
    body.apiKey || body.api_key || headers['x-astra-key'] || process.env.ASTRA_API_KEY || process.env.OPENAI_API_KEY || 'not-needed';
  const model =
    body.model || headers['x-astra-model'] || process.env.ASTRA_MODEL || DEFAULTS[provider]?.model || 'local-model';

  const isOllama = provider === 'ollama' || /:11434/.test(baseUrlRaw);
  const nativeOllama = isOllama && !/\/v1$/.test(stripTrailingSlash(baseUrlRaw));
  const baseUrl = normaliseBaseUrl(nativeOllama ? 'ollama-native' : provider, baseUrlRaw || DEFAULTS[provider]?.baseUrl);

  return {
    provider: nativeOllama ? 'ollama' : provider,
    api: nativeOllama ? 'ollama-native' : 'openai-compatible',
    baseUrl: nativeOllama ? stripTrailingSlash(baseUrlRaw || DEFAULTS.ollama.baseUrl) : baseUrl,
    model,
    apiKey: apiKey || 'not-needed',
    transport: 'server',
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** POST /api/chat for Ollama's native API. */
async function chatOllama(cfg, messages, options) {
  const res = await fetchWithTimeout(
    `${cfg.baseUrl}/api/chat`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: false,
        format: options.json ? 'json' : undefined,
        options: {
          temperature: options.temperature ?? 0.4,
          num_ctx: options.numCtx || 8192,
          num_predict: options.maxTokens || 4096,
        },
      }),
    },
    options.timeoutMs
  );
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const data = await res.json();
  const text = data?.message?.content ?? '';
  if (!text) throw new Error('ollama returned an empty message');
  return { text, model: data.model || cfg.model, provider: `ollama:${cfg.baseUrl}` };
}

/** POST /chat/completions for any OpenAI-compatible server. */
async function chatOpenAiCompatible(cfg, messages, options) {
  const res = await fetchWithTimeout(
    `${cfg.baseUrl}/chat/completions`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens || 4096,
        stream: false,
        ...(options.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    },
    options.timeoutMs
  );
  if (!res.ok) throw new Error(`upstream ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error('model returned an empty completion');
  return { text, model: data.model || cfg.model, provider: `${cfg.provider}:${cfg.baseUrl}` };
}

/**
 * One completion. options: { system, json, temperature, maxTokens, timeoutMs }
 */
async function chat(cfg, messages, options = {}) {
  if (!cfg) throw new Error('no provider configured');
  const opts = { timeoutMs: options.timeoutMs || 240000, ...options };
  const withSystem = options.system ? [{ role: 'system', content: options.system }, ...messages] : messages;
  const result =
    cfg.api === 'ollama-native' ? await chatOllama(cfg, withSystem, opts) : await chatOpenAiCompatible(cfg, withSystem, opts);
  return { ...result, transport: cfg.transport || 'server' };
}

/** Cheap reachability probe used by the UI's "test connection" button. */
async function testConnection(cfg) {
  if (!cfg) return { ok: false, error: 'no provider configured' };
  const started = Date.now();

  try {
    if (cfg.api === 'ollama-native') {
      const res = await fetchWithTimeout(`${cfg.baseUrl}/api/tags`, {}, 6000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const models = (data.models || []).map((m) => m.name || m.model).slice(0, 25);
      return {
        ok: true,
        ms: Date.now() - started,
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        modelAvailable: models.some((m) => m.split(':')[0] === cfg.model.split(':')[0]),
        models,
      };
    }

    // OpenAI-compatible: ask for a one-token reply, fall back to /models
    try {
      const out = await chat(cfg, [{ role: 'user', content: 'Reply with the single word: ready' }], {
        temperature: 0,
        maxTokens: 8,
        timeoutMs: 20000,
      });
      return { ok: true, ms: Date.now() - started, provider: cfg.provider, baseUrl: cfg.baseUrl, model: cfg.model, reply: out.text.slice(0, 40) };
    } catch (err) {
      const res = await fetchWithTimeout(`${cfg.baseUrl}/models`, { headers: { authorization: `Bearer ${cfg.apiKey}` } }, 6000);
      if (!res.ok) throw err;
      const data = await res.json();
      const models = (data.data || []).map((m) => m.id).slice(0, 25);
      return {
        ok: true,
        ms: Date.now() - started,
        provider: cfg.provider,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        note: 'server reachable, chat probe failed',
        probeError: String(err.message || err).slice(0, 160),
        models,
      };
    }
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - started,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      error: String(err.message || err).slice(0, 240),
      hint: /ECONNREFUSED|ENOTFOUND|abort|fetch failed/i.test(String(err.message || err))
        ? `Nothing answered at ${cfg.baseUrl}. Start the local server (e.g. \`ollama serve\`) and check the port — or enable Browser-direct mode if the model runs on this PC and Astra is served from elsewhere.`
        : undefined,
    };
  }
}

/** What the server can see, for the UI status pill. */
async function status() {
  const configured = resolveConfig({});
  const out = {
    configured: !!configured,
    provider: configured?.provider || null,
    baseUrl: configured?.baseUrl || null,
    model: configured?.model || null,
    transport: 'server-relay',
    known: DEFAULTS,
    browserDirectSupported: true,
    reachable: null,
  };
  if (configured) {
    const probe = await testConnection(configured);
    out.reachable = probe.ok;
    out.probe = probe;
  }
  return out;
}

module.exports = { DEFAULTS, KNOWN, resolveConfig, chat, testConnection, status, normaliseBaseUrl };
