#!/usr/bin/env bash
#
# Version, tag, build, and install.
#
#   ./scripts/install.sh [--dry-run] [--release-as X.Y.Z]
#
# Everything release.sh does, then installs the freshly built .deb with dpkg so
# the app-menu entry and icon are registered. Prompts for sudo.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$SCRIPT_DIR/release.sh" "$@"

for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    echo "(--dry-run: skipping the install)"
    exit 0
  fi
done

cd "$(git rev-parse --show-toplevel)"
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')).version")"

shopt -s nullglob
DEBS=(src-tauri/target/release/bundle/deb/*_"$VERSION"_*.deb)
if [ ${#DEBS[@]} -eq 0 ]; then
  echo "Built v$VERSION but found no .deb under src-tauri/target/release/bundle/deb/" >&2
  exit 1
fi

echo
echo "Installing ${DEBS[0]} (sudo)..."
sudo dpkg -i "${DEBS[0]}"
echo "Installed v$VERSION"
