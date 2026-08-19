#!/usr/bin/env bash
#
# Decide the next version from the Conventional Commits since the last tag,
# stamp it into every manifest, commit that, and create an annotated tag.
#
#   ./scripts/version.sh [--dry-run] [--release-as X.Y.Z]
#
# Exits 3 when there is nothing to release: HEAD is already tagged, or nothing
# since the last tag warrants a bump. Callers use that code to tell "nothing to
# do" apart from "you did something wrong".
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# The header comment above is the usage text: everything from the line after
# the shebang's blank comment up to the first line that isn't a comment.
usage() {
  sed -n '3,${/^[^#]/q;s/^# \{0,1\}//p;}' "${BASH_SOURCE[0]}"
}

DRY_RUN=""
RELEASE_AS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN="--dry-run"; shift ;;
    --release-as) RELEASE_AS="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 1 ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# A release commit must describe the tree it tags, so refuse to run on top of
# unrelated edits. Untracked files are fine — they aren't part of the commit.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to release: you have uncommitted changes. Commit or stash them first." >&2
  exit 1
fi

if git describe --exact-match --tags HEAD >/dev/null 2>&1; then
  echo "Nothing to release: HEAD is already tagged $(git describe --exact-match --tags HEAD). Commit something first." >&2
  exit 3
fi

LAST_TAG="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
if [ -n "$LAST_TAG" ]; then
  RANGE="$LAST_TAG..HEAD"
  echo "Commits since $LAST_TAG:"
else
  RANGE="HEAD"
  echo "No tags yet — reading the whole history:"
fi
git log --oneline "$RANGE" | sed 's/^/  /'

NOTES="$(mktemp)"
trap 'rm -f "$NOTES"' EXIT

set +e
VERSION="$(git log --format='%B%x00' "$RANGE" \
  | node "$SCRIPT_DIR/bump.mjs" --root "$ROOT" --notes-file "$NOTES" \
      ${DRY_RUN:+"$DRY_RUN"} ${RELEASE_AS:+--release-as "$RELEASE_AS"})"
STATUS=$?
set -e

if [ $STATUS -eq 3 ]; then
  echo "Nothing to release: no feat, fix, perf or breaking commits since ${LAST_TAG:-the start}." >&2
  echo "Use --release-as X.Y.Z to cut one anyway." >&2
  exit 3
fi
[ $STATUS -eq 0 ] || exit $STATUS

if [ -n "$DRY_RUN" ]; then
  echo
  echo "Would release v$VERSION:"
  sed 's/^/  /' "$NOTES"
  echo "(--dry-run: nothing written, nothing tagged)"
  exit 0
fi

git commit -q -a -m "chore(release): v$VERSION"
git tag -a "v$VERSION" -F "$NOTES"

echo
echo "Released v$VERSION"
sed 's/^/  /' "$NOTES"
