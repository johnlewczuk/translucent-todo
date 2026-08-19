#!/usr/bin/env bash
#
# Version, tag, and build.
#
#   ./scripts/release.sh [--dry-run] [--release-as X.Y.Z]
#
# Everything version.sh does, then `npm run tauri build` so the binary and the
# bundles carry the version that was just tagged. Nothing to release means
# nothing to build, so a non-zero version.sh aborts the build too.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/version.sh" "$@"

for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    echo "(--dry-run: skipping the build)"
    exit 0
  fi
done

cd "$(git rev-parse --show-toplevel)"
echo
echo "Building..."
npm run tauri build
