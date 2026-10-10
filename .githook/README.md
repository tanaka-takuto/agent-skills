# Git フック

このリポジトリでフックを有効にするには、クローンごとに一度実行してください。

```sh
git config --local core.hooksPath .githook
```

`commit-msg` は、コミットメッセージを1行の Conventional Commits 形式
`<type>(<scope>)[!]: <description>` に制限します。本文とトレーラーは使えません。

- `type`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`
- `scope`: `hooks`, `skills`, `repo`（必須）

例: `feat(hooks): コミットメッセージを検証する`
