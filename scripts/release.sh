#!/usr/bin/env bash
# Bumps the version across the monorepo, commits, tags, and pushes.
# The GitHub Actions Release workflow builds the binaries on the tag push.

set -euo pipefail

usage() {
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 0.5.0" >&2
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

VERSION_INPUT="${1:-}"
if [[ -z "$VERSION_INPUT" ]]; then
  usage
fi

VERSION="${VERSION_INPUT#v}"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Version must look like 1.2.3 or 1.2.3-rc.1" >&2
  exit 1
fi

TAG="v${VERSION}"

require_command git
require_command node
require_command npm
require_command cargo

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Run this script from inside the repository." >&2
  exit 1
}
cd "$ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree must be clean before running the release script." >&2
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Git remote 'origin' is required." >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" == "HEAD" ]]; then
  echo "Release script must run on a branch, not a detached HEAD." >&2
  exit 1
fi

if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "Warning: releasing from branch '$CURRENT_BRANCH' (expected 'main')." >&2
  read -r -p "Continue anyway? [y/N] " reply
  case "$reply" in
    [yY]|[yY][eE][sS]) ;;
    *) echo "Aborted."; exit 1 ;;
  esac
fi

git fetch --tags origin

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Local tag $TAG already exists." >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "Remote tag $TAG already exists on origin." >&2
  exit 1
fi

echo "Bumping package.json versions to ${VERSION}..."
npm version "$VERSION" --no-git-tag-version --workspaces --include-workspace-root >/dev/null

echo "Bumping tauri.conf.json and Cargo.toml to ${VERSION}..."
node - "$VERSION" <<'NODE'
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
const root = process.cwd();

function rewriteJson(relPath, patch) {
  const p = path.join(root, relPath);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  patch(json);
  fs.writeFileSync(p, `${JSON.stringify(json, null, 2)}\n`);
}

function rewriteCargoVersion(relPath) {
  const p = path.join(root, relPath);
  const original = fs.readFileSync(p, 'utf8');
  const updated = original.replace(
    /(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
    `$1${version}$3`
  );
  if (updated === original) {
    throw new Error(`Failed to update version in ${p}`);
  }
  fs.writeFileSync(p, updated);
}

rewriteJson('apps/desktop/src-tauri/tauri.conf.json', (c) => { c.version = version; });
rewriteCargoVersion('apps/desktop/src-tauri/Cargo.toml');
NODE

echo "Refreshing Cargo.lock..."
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml >/dev/null

echo "Running checks..."
npm run check

git add \
  package.json \
  package-lock.json \
  apps/desktop/package.json \
  packages/shared-types/package.json \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/Cargo.lock \
  apps/desktop/src-tauri/tauri.conf.json

git commit -m "chore(release): ${TAG}"
git tag -a "$TAG" -m "$TAG"
git push origin "$CURRENT_BRANCH"
git push origin "$TAG"

echo
echo "Released ${TAG} from ${CURRENT_BRANCH}."
echo "The GitHub Actions Release workflow is now building the binaries."
