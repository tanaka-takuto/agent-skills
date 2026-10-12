#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const kebabCase = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr.trim());
  }
  return result.stdout;
}

function check(path, content, parseYaml) {
  const errors = [];
  if (basename(path) !== 'SKILL.md') {
    errors.push('ファイル名は SKILL.md にしてください');
  }

  const directoryName = basename(dirname(path));
  if (!kebabCase.test(directoryName)) {
    errors.push(`ディレクトリ名「${directoryName}」はケバブケースにしてください`);
  }

  const frontmatter = content.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  try {
    const metadata = frontmatter === undefined
      ? undefined
      : parseYaml(frontmatter, { uniqueKeys: true, logLevel: 'error' });
    const name = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata.name
      : undefined;
    if (typeof name !== 'string') {
      errors.push('frontmatter に文字列の name を1つ指定してください');
    } else {
      if ([...name].length > 64) {
        errors.push(`name は64文字以内にしてください（${[...name].length}文字）`);
      }
      if (!kebabCase.test(name)) {
        errors.push(`name「${name}」はケバブケースにしてください`);
      } else if (name !== directoryName) {
        errors.push(`name「${name}」をディレクトリ名「${directoryName}」と一致させてください`);
      }
    }
  } catch (error) {
    errors.push(`frontmatter の YAML が不正です: ${error.message}`);
  }
  return errors.map((error) => `${path}: ${error}`);
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
    throw new Error('使い方: check-skill-names.mjs --staged | <SKILL.md>...');
  }

  const parseYaml = files.length ? (await import('yaml')).parse : undefined;
  const errors = files.flatMap(([path, content]) => check(path, content, parseYaml));
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
