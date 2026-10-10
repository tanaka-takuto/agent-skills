import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('./check-skill-size.mjs', import.meta.url));

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-size-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}

function write(cwd, path, text) {
  const target = join(cwd, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return target;
}

function run(cwd, ...args) {
  return spawnSync('node', [script, ...args], { cwd, encoding: 'utf8' });
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

for (const [label, content] of [
  ['500 physical lines with a final newline', 'a\n'.repeat(500)],
  ['500 physical lines without a final newline', 'a\n'.repeat(499) + 'a'],
  ['8000 Unicode code points including newlines', ('あ'.repeat(399) + '\n').repeat(20)],
  ['astral Unicode characters counted once', ('😀'.repeat(399) + '\n').repeat(20)],
  ['CRLF normalized before counting', ('あ'.repeat(399) + '\r\n').repeat(20)],
  ['400 characters on one line', 'あ'.repeat(400)],
]) {
  test(`accepts ${label}`, (t) => {
    const cwd = fixture(t);
    const path = write(cwd, 'skills/example-skill/SKILL.md', content);
    const result = run(cwd, path);
    assert.equal(result.status, 0, result.stderr);
  });
}

for (const [label, content, diagnostic] of [
  ['501 lines', 'a\n'.repeat(501), /501.*500.*行/],
  ['8001 characters', ('あ'.repeat(399) + '\n').repeat(20) + 'a', /8001.*8000.*文字/],
  ['401 characters on one line', 'あ'.repeat(401), /1行目.*401.*400.*文字/],
  ['frontmatter included in the budget', '---\nname: example-skill\n---\n' + ('あ'.repeat(399) + '\n').repeat(20), /8000.*文字/],
]) {
  test(`rejects ${label} with an actionable diagnostic`, (t) => {
    const cwd = fixture(t);
    const path = write(cwd, 'skills/example-skill/SKILL.md', content);
    const result = run(cwd, path);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, diagnostic);
    assert.match(result.stderr, /references\//);
  });
}

test('checks every explicitly supplied path', (t) => {
  const cwd = fixture(t);
  const valid = write(cwd, 'skills/valid-skill/SKILL.md', '# Valid\n');
  const invalid = write(cwd, 'skills/invalid-skill/SKILL.md', 'a\n'.repeat(501));
  const result = run(cwd, valid, invalid);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid-skill/);
});

test('staged validation accepts the index even if working tree exceeds a limit', (t) => {
  const cwd = fixture(t);
  git(cwd, 'init', '-q');
  const path = 'some project/skills/example-skill/SKILL.md';
  write(cwd, path, '# Valid\n');
  git(cwd, 'add', '--', path);
  write(cwd, path, 'a\n'.repeat(501));
  assert.equal(run(cwd, '--staged').status, 0);
});

test('staged validation rejects the index even if working tree was fixed', (t) => {
  const cwd = fixture(t);
  git(cwd, 'init', '-q');
  const path = 'skills/example-skill/SKILL.md';
  write(cwd, path, 'a\n'.repeat(501));
  git(cwd, 'add', '--', path);
  write(cwd, path, '# Fixed\n');
  const result = run(cwd, '--staged');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /501.*500.*行/);
});

test('reference documents are outside the SKILL.md size budget', (t) => {
  const cwd = fixture(t);
  git(cwd, 'init', '-q');
  const path = 'skills/example-skill/references/details.md';
  write(cwd, path, 'a\n'.repeat(501));
  git(cwd, 'add', '--', path);
  assert.equal(run(cwd, '--staged').status, 0);
});

test('requires a path or --staged', (t) => {
  const result = run(fixture(t));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /使い方/);
});
