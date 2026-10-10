import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = fileURLToPath(new URL('..', import.meta.url));
const skillPath = 'skills/example-skill/SKILL.md';
const formatted = '---\nname: example-skill\ndescription: Test.\n---\n\n# Example\n\n- First\n- Second\n';
const unformatted = formatted.replace('- First', '* First');

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

function fixture(t, { dependencies = true } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'staged-format-hook-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.name', 'Test User');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'core.hooksPath', '.githook');
  for (const path of [
    '.githook/pre-commit',
    '.githook/check-staged-format.mjs',
    '.agents/skills/review-agent-skill/scripts/check-skill-names.mjs',
    '.agents/skills/review-agent-skill/scripts/check-skill-size.mjs',
    '.prettierrc.json',
    'package.json',
  ]) {
    if (!existsSync(join(repo, path))) continue;
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    copyFileSync(join(repo, path), join(cwd, path));
  }
  if (dependencies) symlinkSync(join(repo, 'node_modules'), join(cwd, 'node_modules'));
  git(cwd, 'add', '--', '.prettierrc.json', 'package.json');
  git(cwd, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'test(repo): setup');
  return cwd;
}

function stage(cwd, path, content) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true });
  writeFileSync(join(cwd, path), content);
  git(cwd, 'add', '--', path);
}

function commit(cwd) {
  return spawnSync('git', ['commit', '-m', 'test(hooks): check staged Markdown'], { cwd, encoding: 'utf8' });
}

test('pre-commit rejects unformatted staged Markdown without changing either copy', (t) => {
  const cwd = fixture(t);
  stage(cwd, skillPath, unformatted);
  const index = git(cwd, 'write-tree');
  const result = commit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /SKILL\.md/);
  assert.match(result.stderr, /prettier --write/);
  assert.equal(git(cwd, 'write-tree'), index);
  assert.equal(readFileSync(join(cwd, skillPath), 'utf8'), unformatted);
});

test('pre-commit accepts formatted staged Markdown', (t) => {
  const cwd = fixture(t);
  stage(cwd, skillPath, formatted);
  const result = commit(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('pre-commit rejects an oversized staged Skill', (t) => {
  const cwd = fixture(t);
  stage(cwd, skillPath, formatted + 'あ'.repeat(401) + '\n');
  const result = commit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /上限 400 文字/);
});

test('staged formatting failure persists when the working-tree copy is fixed', (t) => {
  const cwd = fixture(t);
  stage(cwd, skillPath, unformatted);
  writeFileSync(join(cwd, skillPath), formatted);
  const index = git(cwd, 'write-tree');
  const result = commit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(git(cwd, 'write-tree'), index);
  assert.equal(readFileSync(join(cwd, skillPath), 'utf8'), formatted);
});

test('formatted staged content commits while unstaged content remains intact', (t) => {
  const cwd = fixture(t);
  stage(cwd, skillPath, formatted);
  writeFileSync(join(cwd, skillPath), unformatted);
  const result = commit(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(cwd, 'show', `HEAD:${skillPath}`), formatted);
  assert.equal(readFileSync(join(cwd, skillPath), 'utf8'), unformatted);
});

test('pre-commit rejects unformatted references with spaces in the path', (t) => {
  const cwd = fixture(t);
  stage(cwd, 'skills/example-skill/references/example notes.md', '* First\n- Second\n');
  const result = commit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /example notes\.md/);
});

test('formatted references are not constrained by Skill size limits', (t) => {
  const cwd = fixture(t);
  stage(cwd, 'skills/example-skill/references/details.md', '# Details\n\n' + 'あ'.repeat(8001) + '\n');
  const result = commit(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('pre-commit uses staged formatter configuration instead of unstaged edits', (t) => {
  const cwd = fixture(t);
  const content = '# Example\n\nThis is a long sentence that must stay on one line.\n';
  stage(cwd, 'README.md', content);
  writeFileSync(join(cwd, '.prettierrc.json'), '{"proseWrap":"always","printWidth":10}\n');
  const result = commit(cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(cwd, 'show', 'HEAD:README.md'), content);
});

test('pre-commit skips formatter dependencies when no Markdown is staged', (t) => {
  const cwd = fixture(t, { dependencies: false });
  stage(cwd, 'data.json', '{"ok":true}\n');
  const result = commit(cwd);
  assert.equal(result.status, 0, result.stderr);
});

test('pre-commit reports how to install a missing formatter', (t) => {
  const cwd = fixture(t, { dependencies: false });
  stage(cwd, 'README.md', '# Example\n');
  const result = commit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /npm ci/);
});

test('pre-commit ignores deleted Markdown', (t) => {
  const cwd = fixture(t, { dependencies: false });
  stage(cwd, 'README.md', '* First\n- Second\n');
  git(cwd, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'test(repo): setup deletion');
  git(cwd, 'rm', '--', 'README.md');
  const result = commit(cwd);
  assert.equal(result.status, 0, result.stderr);
});
