#!/usr/bin/env bash
# Vitest kurulamayan ortamlar için: testleri Bun'ın yerleşik çalıştırıcısıyla koşturur.
# (describe/it/expect API'si Vitest ile uyumludur; yalnızca import kaynağı değişir.)
# Normal geliştirmede bunun yerine `npm test` kullanın.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -r "$SRC/src" "$TMP/src"
[ -d "$SRC/server" ] && cp -r "$SRC/server" "$TMP/server"
# Kurulu bağımlılıklar varsa (ws gibi) onları da görünür kıl.
[ -d "$SRC/node_modules" ] && ln -s "$SRC/node_modules" "$TMP/node_modules"
find "$TMP/src" "$TMP/server" -name '*.test.ts' -exec sed -i "s#from 'vitest'#from 'bun:test'#" {} +
cd "$TMP" && bun test --timeout 90000 "$@"
