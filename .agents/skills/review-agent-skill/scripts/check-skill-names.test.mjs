import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repo = fileURLToPath(new URL('../../../..', import.meta.url));

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'skill-name-hook-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.name', 'Test User');
  git(cwd, 'config', 'user.email', 'test@example.com');
  git(cwd, 'config', 'core.hooksPath', '.githook');

  for (const path of [
    '.githook/pre-commit',
    '.agents/skills/review-agent-skill/scripts/check-skill-names.mjs',
  ]) {
    const source = join(repo, path);
    if (existsSync(source)) {
      const target = join(cwd, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
  return cwd;
}

function stage(cwd, path, content) {
  const target = join(cwd, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  git(cwd, 'add', '--', path);
}

function commit(cwd) {
  return spawnSync('git', ['commit', '-m', 'test(skills): check skill name'], {
    cwd,
    encoding: 'utf8',
  });
}

test('pre-commit rejects a staged skill with a non-kebab-case name', (t) => {
  const cwd = fixture(t);
  stage(cwd, '.agents/skills/example-skill/SKILL.md', '---\nname: example_skill\ndescription: Test.\n---\n');

  const result = commit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /example_skill/);
});

test('pre-commit accepts a valid staged skill', (t) => {
  const cwd = fixture(t);
  stage(cwd, '.agents/skills/example-skill/SKILL.md', '---\nname: "example-skill"\ndescription: Test.\n---\n');

  assert.equal(commit(cwd).status, 0);
});

for (const [path, content, diagnostic] of [
  ['.agents/skills/ExampleSkill/SKILL.md', '---\nname: ExampleSkill\n---\n', /ExampleSkill/],
  ['.agents/skills/example-skill/SKILL.md', '---\nname: other-skill\n---\n', /other-skill/],
  ['.agents/skills/example-skill/Skill.md', '---\nname: example-skill\n---\n', /Skill\.md/],
  ['.agents/skills/example-skill/SKILL.md', '---\ndescription: Test.\n---\n', /name/],
]) {
  test(`pre-commit rejects ${path} with ${diagnostic}`, (t) => {
    const cwd = fixture(t);
    stage(cwd, path, content);
    const result = commit(cwd);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, diagnostic);
  });
}

test('pre-commit checks the staged blob rather than later working-tree edits', (t) => {
  const cwd = fixture(t);
  const path = '.agents/skills/example-skill/SKILL.md';
  stage(cwd, path, '---\nname: example-skill\n---\n');
  writeFileSync(join(cwd, path), '---\nname: example_skill\n---\n');

  assert.equal(commit(cwd).status, 0);
});

test('pre-commit rejects an invalid staged blob even when working tree is fixed', (t) => {
  const cwd = fixture(t);
  const path = '.agents/skills/example-skill/SKILL.md';
  stage(cwd, path, '---\nname: example_skill\n---\n');
  writeFileSync(join(cwd, path), '---\nname: example-skill\n---\n');

  const result = commit(cwd);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /example_skill/);
});

test('pre-commit ignores staged files other than SKILL.md', (t) => {
  const cwd = fixture(t);
  stage(cwd, '.agents/skills/example-skill/notes.md', 'name: example_skill\n');

  assert.equal(commit(cwd).status, 0);
});

test('review script checks a working-tree SKILL.md by path', (t) => {
  const cwd = fixture(t);
  const path = '.agents/skills/example-skill/SKILL.md';
  const target = join(cwd, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, '---\nname: example_skill\n---\n');

  const result = spawnSync('node', [join(repo, '.agents/skills/review-agent-skill/scripts/check-skill-names.mjs'), target], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /example_skill/);
});
