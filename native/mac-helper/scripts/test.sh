#!/bin/sh
# Runs the helper's tests. With only the Command Line Tools installed, SwiftPM does not pass the
# Swift Testing macro plugin path once the package has dependencies, so pass it explicitly.
set -eu
here="$(cd "$(dirname "$0")/.." && pwd)"
plugins="$(dirname "$(xcrun --find swift)")/../lib/swift/host/plugins/testing"
if [ -d "$plugins" ]; then
  exec swift test --package-path "$here" -Xswiftc -plugin-path -Xswiftc "$plugins" "$@"
fi
exec swift test --package-path "$here" "$@"
