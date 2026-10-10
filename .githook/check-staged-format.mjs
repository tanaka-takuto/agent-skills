#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    throw new Error(result.error?.message ?? result.stderr.trim());
  }
  return result.stdout;
}

async function check() {
  const paths = git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR')
    .split('\0')
    .filter((path) => /\.md$/i.test(path));
  if (!paths.length) return;

  let prettier;
  try {
    prettier = await import('prettier');
  } catch {
    throw new Error('Prettier が見つかりません。リポジトリルートで npm ci を実行してください');
  }
  const options = JSON.parse(git('show', ':0:.prettierrc.json'));
  const expectedVersion = JSON.parse(git('show', ':0:package.json')).devDependencies?.prettier;
  if (prettier.version !== expectedVersion) {
    throw new Error(`Prettier は ${prettier.version}、ステージ済みの指定は ${expectedVersion} です。npm ci を実行してください`);
  }

  for (const path of paths) {
    try {
      const content = git('show', `:0:${path}`);
      if (await prettier.check(content, { ...options, filepath: path, parser: 'markdown' })) continue;
      console.error(`${path}: ステージ済みの Markdown が未整形です`);
      console.error('npm exec -- prettier --write <対象パス> で整形し、必要な変更をステージし直してください');
    } catch (error) {
      console.error(`${path}: ${error.message}`);
    }
    process.exitCode = 1;
  }
}

check().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
