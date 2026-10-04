#!/bin/sh
# Publish the committed dist/ tree using standard Git commands.
set -eu
cd "$(git rev-parse --show-toplevel)"
git fetch origin
pages_tree=$(git rev-parse HEAD:dist)
if git rev-parse --verify refs/remotes/origin/gh-pages >/dev/null 2>&1; then
  pages_commit=$(git commit-tree "$pages_tree" -p refs/remotes/origin/gh-pages -m "Publish Cosmic Flight Trainer")
else
  pages_commit=$(git commit-tree "$pages_tree" -m "Publish Cosmic Flight Trainer")
fi
git push origin "$pages_commit:refs/heads/gh-pages"
