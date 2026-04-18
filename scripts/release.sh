#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <version>" >&2
  echo "Example: $0 0.2.1" >&2
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

git fetch --tags origin

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Local tag $TAG already exists." >&2
  exit 1
fi

if git ls-remote --exit-code --tags origin "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "Remote tag $TAG already exists on origin." >&2
  exit 1
fi

npm version "$VERSION" --no-git-tag-version

node - "$VERSION" <<'NODE'
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
const root = process.cwd();

const tauriConfigPath = path.join(root, 'src-tauri', 'tauri.conf.json');
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
tauriConfig.version = version;
fs.writeFileSync(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

const cargoTomlPath = path.join(root, 'src-tauri', 'Cargo.toml');
const cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
const updatedCargoToml = cargoToml.replace(
  /(\[package\][\s\S]*?^version = ")([^"]+)(")/m,
  `$1${version}$3`
);

if (updatedCargoToml === cargoToml) {
  throw new Error(`Failed to update version in ${cargoTomlPath}`);
}

fs.writeFileSync(cargoTomlPath, updatedCargoToml);
NODE

npm run check

git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: release ${TAG}"
git push origin "$CURRENT_BRANCH"
git tag -a "$TAG" -m "$TAG"
git push origin "$TAG"

echo "Released ${TAG} from ${CURRENT_BRANCH}."
