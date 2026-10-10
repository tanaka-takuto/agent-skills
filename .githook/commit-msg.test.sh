#!/bin/sh
set -eu

hook="$(CDPATH= cd "$(dirname "$0")" && pwd)/commit-msg"
message_file=$(mktemp)
trap 'rm -f "$message_file"' EXIT

check() {
  expected=$1
  label=$2
  message=$3
  printf '%s\n' "$message" > "$message_file"

  if "$hook" "$message_file" >/dev/null 2>&1; then
    actual=accept
  else
    actual=reject
  fi

  if [ "$actual" != "$expected" ]; then
    printf 'FAIL %s: expected %s, got %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
  printf 'PASS %s\n' "$label"
}

for type in feat fix docs refactor test chore ci; do
  check accept "type $type" "$type(hooks): メッセージを検証する"
done

for scope in hooks skills repo; do
  check accept "scope $scope" "feat($scope): メッセージを検証する"
done

check accept 'breaking change' 'fix(hooks)!: 旧形式を廃止する'
check reject 'unknown type' 'feature(hooks): メッセージを検証する'
check reject 'unknown scope' 'feat(api): メッセージを検証する'
check reject 'missing scope' 'feat: メッセージを検証する'
check reject 'uppercase type' 'FEAT(hooks): メッセージを検証する'
check reject 'uppercase scope' 'feat(HOOKS): メッセージを検証する'
check reject 'missing description' 'feat(hooks): '
check reject 'body' 'feat(hooks): メッセージを検証する

本文'
check reject 'trailer' 'feat(hooks): メッセージを検証する

Refs: #1'
