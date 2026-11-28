#!/usr/bin/env bash
# Creates (or reuses) an example project that consumes the repo's packages straight from their
# `dist`, through `link:` overrides: rebuilding a package is enough, no pack, no install.
#
#   bash ejemplo.sh <repo> <dir> [tutorial-slug]
#
# With a slug, the project starts as a copy of `tutorials/<slug>/`; without one, as `fudic new`.
# It is reused as it is when <dir> already has node_modules.
set -euo pipefail
repo=$(cd "$1" && (pwd -W 2>/dev/null || pwd))
dir=$2
slug=${3:-}

if [ -d "$dir/node_modules" ]; then
  echo "reused: $dir"
  exit 0
fi

parent=$(dirname "$dir")
mkdir -p "$parent"
if [ -n "$slug" ]; then
  cp -r "$repo/tutorials/$slug" "$dir"
else
  (cd "$parent" && node "$repo/packages/cli/dist/bin.js" new "$(basename "$dir")" --no-install --no-git >/dev/null)
fi

cd "$dir"
{
  echo "overrides:"
  for pkg in "$repo"/packages/*/package.json; do
    name=$(node -p "require(process.argv[1]).name" "$pkg")
    case "$name" in @fudic/*) echo "  '$name': 'link:$(dirname "$pkg")'" ;; esac
  done
} > pnpm-workspace.yaml
pnpm install --silent
# Kept: without it a later `pnpm install` would undo the links. The CLI may then believe it is in
# a workspace; for these examples that does not matter.
echo "ready: $dir"
