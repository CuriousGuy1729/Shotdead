#!/usr/bin/env bash
# setup-piper.sh — install Piper, the local neural TTS engine Astra speaks with.
#
#   bash local-models/setup-piper.sh                       # en_IN voice (recommended)
#   VOICE=en_US-lessac-medium bash local-models/setup-piper.sh
#
# Piper runs 100% offline on CPU. The install itself needs internet once, to
# fetch the wheel and the voice model. Astra auto-detects the result — no code
# changes, just restart `npm start` and the header pill switches to "local voice".
set -euo pipefail

VOICE="${VOICE:-en_IN-smartknal-medium}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${ASTRA_TTS_VENV:-$HERE/.tts-venv}"
DATA_DIR="${ASTRA_TTS_DATA_DIR:-$HERE/models/piper}"

echo "==> Astra local TTS setup (Piper)"
echo "    venv  : $VENV"
echo "    voice : $VOICE"
echo "    models: $DATA_DIR"

PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null 2>&1 || { echo "python3 not found"; exit 1; }

echo "==> Creating venv and installing piper-tts…"
"$PY" -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet piper-tts

echo "==> Downloading the voice model…"
mkdir -p "$DATA_DIR"
if "$VENV/bin/python" -m piper.download_voices "$VOICE" --download-dir "$DATA_DIR"; then
  echo "    voice ready: $DATA_DIR/$VOICE.onnx"
else
  cat <<EOF

!! Voice download failed (usually no internet, or huggingface.co is blocked).
   Manual fix on any machine with internet:
     1. download both files for $VOICE from
        https://huggingface.co/rhasspy/piper-voices/tree/main
     2. copy  $VOICE.onnx  and  $VOICE.onnx.json  into  $DATA_DIR
   Piper itself is already installed, so Astra will pick the voice up on the
   next restart. Until then Astra keeps using the browser's own voice.
EOF
  exit 1
fi

cat <<EOF

==> Done. Start Astra with the local voice:

      ASTRA_TTS=piper \\
      ASTRA_TTS_PYTHON="$VENV/bin/python" \\
      ASTRA_TTS_DATA_DIR="$DATA_DIR" \\
      ASTRA_TTS_VOICE="$VOICE" \\
      npm start

    Or just 'npm start' — Astra finds $VENV and $DATA_DIR automatically.
    Then in the UI: Voice setup → Local audio engine → tick
    "Prefer the local voice over browser speech synthesis".

    Check it works from the shell:
      curl -s -X POST localhost:3000/api/audio/tts \\
           -H 'content-type: application/json' \\
           -d '{"text":"Astra speaking with a local voice."}' --out /tmp/astra.wav
      GET /api/audio/status tells you which engine was detected.
EOF
