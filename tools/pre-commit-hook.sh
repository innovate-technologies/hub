#!/bin/bash
#
# Linter script that checks for common issues in the codebase.

fail=0

files="$(git diff --name-only --diff-filter=ACMRTUXB --cached | egrep '^source' | egrep '[.]js$')" || exit 0

if ! node_modules/.bin/eslint ${files}; then
  fail=1
fi

if ! flow source/; then
  fail=1
fi

exit ${fail}
