#!/bin/zsh
# Makes TEST audio with the macOS "say" voice, only to check that the benchmark harness runs.
# A synthetic voice is not a real speaker: these numbers say nothing about Sayso's accuracy.
# Usage: scripts/benchmark/make-samples.sh [folder]   (default: scripts/benchmark/sample)
set -euo pipefail
dir="${1:-$(dirname "$0")/sample}"
voice="${SAYSO_BENCH_VOICE:-Rishi}"   # an Indian English voice (en_IN)
[[ -f "$dir/manifest.json" ]] || { echo "no manifest.json in $dir" >&2; exit 2; }
count=0
python3 -c '
import json,sys
for s in json.load(open(sys.argv[1]))["samples"]:
    print(s["file"] + "\t" + s["script"])
' "$dir/manifest.json" | while IFS=$'\t' read -r file script; do
  say -v "$voice" -o "$dir/${file%.wav}.aiff" "$script"
  afconvert -f WAVE -d LEI16@16000 -c 1 "$dir/${file%.wav}.aiff" "$dir/$file"
  rm "$dir/${file%.wav}.aiff"
  echo "made $file"
done
