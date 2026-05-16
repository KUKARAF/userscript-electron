#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   .tools/create_release.sh           → keep MAJOR.MINOR, bump shortsha only
#   .tools/create_release.sh minor     → bump MINOR, shortsha
#   .tools/create_release.sh major     → bump MAJOR, reset MINOR, shortsha

MODE="${1:-}"

CURRENT=$(node -p "require('./package.json').version")
MAJOR=$(echo "$CURRENT" | cut -d. -f1)
MINOR=$(echo "$CURRENT" | cut -d. -f2)

case "$MODE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    ;;
  "")
    ;;
  *)
    echo "Usage: $0 [major|minor]" >&2
    exit 1
    ;;
esac

# Update package.json with valid semver (MAJOR.MINOR.0)
npm version "${MAJOR}.${MINOR}.0" --no-git-tag-version --silent

SHA=$(git rev-parse --short HEAD)
TAG="v${MAJOR}.${MINOR}.${SHA}"

git add package.json
git commit -m "chore: release ${TAG}"
git tag -a "${TAG}" -m "Release ${TAG}"

echo ""
echo "  Created tag: ${TAG}"
echo ""
echo "  Push with:"
echo "    git push && git push --tags"
echo ""
