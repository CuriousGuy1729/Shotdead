#!/usr/bin/env bash
# setup-ollama.sh — run a local LLM (Qwen) that Astra can drive.
#
#   bash local-models/setup-ollama.sh            # install Ollama + pull Qwen 2.5 3B
#   QWEN=qwen2.5:7b-instruct bash local-models/setup-ollama.sh
#
# Needs internet ONCE (to fetch Ollama and the model weights). After that
# everything runs offline on your machine.
set -euo pipefail

MODEL="${QWEN:-qwen2.5:3b-instruct}"
HOST_BIND="${OLLAMA_HOST:-127.0.0.1:11434}"

echo "==> Astra local model setup"
echo "    model : $MODEL"
echo "    listen: $HOST_BIND"

if ! command -v ollama >/dev/null 2>&1; then
  echo "==> Installing Ollama…"
  if [[ "$(uname)" == "Darwin" ]]; then
    echo "    macOS: brew install ollama   (or download from https://ollama.com/download)"
    command -v brew >/dev/null 2>&1 && brew install ollama || { echo "Install Ollama manually, then re-run."; exit 1; }
  else
    curl -fsSL https://ollama.com/install.sh | sh
  fi
else
  echo "==> Ollama already installed: $(command -v ollama)"
fi

# Make sure the daemon is up.
if ! curl -sf "http://${HOST_BIND}/api/tags" >/dev/null 2>&1; then
  echo "==> Starting 'ollama serve' in the background…"
  OLLAMA_HOST="$HOST_BIND" nohup ollama serve >/tmp/ollama.log 2>&1 &
  sleep 3
fi

# Astra is served from a browser page; if that page is not on localhost, Ollama
# must be told to accept the origin (browser-direct transport).
echo "==> Pulling $MODEL (one-time download)…"
ollama pull "$MODEL"

cat <<EOF

==> Done. In Astra: Voice setup → Local model
      Provider : Ollama
      Base URL : http://${HOST_BIND}
      Model    : ${MODEL}
      then press "Test connection".

    Server-relay (simplest, run Astra and Ollama on the same machine):
      ASTRA_PROVIDER=ollama ASTRA_MODEL=${MODEL} npm start

    Browser-direct (Astra served remotely, Ollama on this PC):
      OLLAMA_ORIGINS='*' OLLAMA_HOST=0.0.0.0:11434 ollama serve
      then tick "Browser-direct" in Voice setup.

    Hardware notes:
      qwen2.5:1.5b-instruct  ~1.5 GB RAM   — slow machines, quick answers
      qwen2.5:3b-instruct    ~3 GB RAM     — good default for deck generation
      qwen2.5:7b-instruct    ~6 GB RAM     — much better teaching prose
    Deck generation asks for 5-10 slides of JSON: on a 3B model expect roughly
    30-90 s on a modern laptop CPU, faster on GPU. Astra validates and repairs
    whatever comes back, so a small model is still usable.
EOF
