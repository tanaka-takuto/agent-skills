#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const maxLines = 500;
const maxCharacters = 8000;
const maxLineCharacters = 400;

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr.trim());
  }
  return result.stdout;
}

function check(path, content) {
  const normalized = content.replace(/\r\n?/g, '\n');
  const lines = normalized ? normalized.replace(/\n$/, '').split('\n') : [];
  const characters = [...normalized].length;
  const errors = [];
  if (lines.length > maxLines) {
    errors.push(`${lines.length}（上限 ${maxLines} 行）`);
  }
  if (characters > maxCharacters) {
    errors.push(`${characters}（上限 ${maxCharacters} 文字）`);
  }
  const longLine = lines.findIndex((line) => [...line].length > maxLineCharacters);
  if (longLine !== -1) {
    errors.push(`${longLine + 1}行目: ${[...lines[longLine]].length}（上限 ${maxLineCharacters} 文字）`);
  }
  return errors.map((error) => `${path}: ${error}。手順を簡潔にし、詳細は references/ へ分けてください`);
}

try {
  const args = process.argv.slice(2);
  let files;
  if (args.length === 1 && args[0] === '--staged') {
    files = git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR')
      .split('\0')
      .filter((path) => path && basename(path).toLowerCase() === 'skill.md')
      .map((path) => [path, git('show', `:0:${path}`)]);
  } else if (args.length && !args.includes('--staged')) {
    files = args.map((path) => [path, readFileSync(path, 'utf8')]);
  } else {
    throw new Error('使い方: check-skill-size.mjs --staged | <SKILL.md>...');
  }
  const errors = files.flatMap(([path, content]) => check(path, content));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
