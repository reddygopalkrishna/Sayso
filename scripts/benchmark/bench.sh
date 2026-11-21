#!/bin/zsh
# Runs the benchmark. Usage: scripts/benchmark/bench.sh <folder> [--ai] [--json out.json]
# The report is printed and saved as <folder>/report.md. See docs/BENCHMARK.md.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
[[ $# -ge 1 ]] || { echo "usage: bench.sh <folder> [--ai] [--json out.json]" >&2; exit 2; }
folder="$(cd "$1" && pwd)"; shift
cd "$here/../.."
BENCH_DIR="$folder" BENCH_ARGS="$*" npx vitest run --config scripts/benchmark/vitest.config.ts
