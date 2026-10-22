#!/usr/bin/env bash
# Vercel ignoreCommand (cost cut). Exit 0 = skip the build, exit 1 = build.
# - Only production builds (the production branch, master) run; previews are skipped.
# - A production push that only touches docs is skipped.
# Anything unexpected builds (the safe direction).
if [ -n "$VERCEL_ENV" ] && [ "$VERCEL_ENV" != "production" ]; then
  echo "Skipping: $VERCEL_ENV deployment (previews are off to save build usage)."
  exit 0
fi
base="$VERCEL_GIT_PREVIOUS_SHA"
if [ -z "$base" ]; then echo "No previous deployment - building."; exit 1; fi
files=$(git diff --name-only "$base" HEAD 2>/dev/null) || { echo "Could not diff - building."; exit 1; }
[ -z "$files" ] && { echo "No changed files reported - building."; exit 1; }
relevant=$(printf '%s\n' "$files" | grep -vE '^(docs/|designs/|\.github/|\.claude/)|\.md$' || true)
if [ -z "$relevant" ]; then echo "Skipping: docs-only change."; exit 0; fi
echo "Building."; exit 1
