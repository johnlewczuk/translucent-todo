#!/usr/bin/env bash
#
# Version, tag, and build.
#
#   ./scripts/release.sh [--dry-run] [--release-as X.Y.Z] [--allow-unreleased]
#
# Everything version.sh does, then `npm run tauri build` so the binary and the
# bundles carry the version that was just tagged. Nothing to release means
# nothing to build, so a non-zero version.sh aborts the build too — unless
# --allow-unreleased, which builds the version already in the tree instead.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --allow-unreleased is ours; version.sh rejects arguments it doesn't know, so
# forward everything except that one.
ALLOW_UNRELEASED=""
DRY_RUN=""
VERSION_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --allow-unreleased) ALLOW_UNRELEASED=1 ;;
    --dry-run) DRY_RUN=1; VERSION_ARGS+=("$arg") ;;
    *) VERSION_ARGS+=("$arg") ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

set +e
"$SCRIPT_DIR/version.sh" ${VERSION_ARGS[@]+"${VERSION_ARGS[@]}"}
STATUS=$?
set -e

if [ $STATUS -eq 3 ] && [ -n "$ALLOW_UNRELEASED" ]; then
  VERSION="$(node -p "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).version")"
  echo
  echo "Nothing to release — building the existing v$VERSION."
elif [ $STATUS -ne 0 ]; then
  exit $STATUS
fi

if [ -n "$DRY_RUN" ]; then
  echo "(--dry-run: skipping the build)"
  exit 0
fi

echo
echo "Building..."
npm run tauri build
