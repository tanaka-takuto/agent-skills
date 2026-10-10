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

`pre-commit` は、ステージ済みの `SKILL.md` のファイル名、Skill ディレクトリ名、
frontmatter の `name` を検証します。Node.js が必要です。

## SKILL.md の長さ

公開する `skills/` と、このリポジトリの作業用 `.agents/skills/` の `SKILL.md` に同じ上限を適用します。本文だけでなく frontmatter、空白、空行、コード例も含むファイル全体が対象です。

| 項目        | 上限      |
| ----------- | --------- |
| 行数        | 500行     |
| 総文字数    | 8,000文字 |
| 1行の文字数 | 400文字   |

文字数はUnicodeコードポイントで数えます。改行はCRLF・CRをLFに正規化し、総文字数にはLFも1文字として含めます。行数は物理行数で、末尾の改行を余分な空行として数えません。1行の文字数には改行を含めません。

作業ツリーの全Skillは `npm run check:skill-size`、個別のファイルは `node .agents/skills/review-agent-skill/scripts/check-skill-size.mjs <SKILL.md...>` で検査できます。`--staged` を渡すとGitのインデックス内の内容を検査します。超過した項目、実際の数値、上限を報告して失敗します。

上限を埋めることを目標にせず、結果を変える判断、手順、検証方法に絞ります。詳細を `references/` に分けたら必要な場面で読むようにし、常に全資料を読む指示で本文の上限を迂回しません。参照資料には同じ数値上限を課しませんが、必要な範囲だけ読む構成を保ちます。

### 根拠

- [Agent Skills仕様](https://agentskills.io/specification#progressive-disclosure)は、本文を5,000トークン未満、主ファイルを500行未満に抑えることを推奨します。名前・説明、本文、補助資料を段階的に読みます。
- [Anthropicの作成ガイド](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#progressive-disclosure-patterns)も本文500行未満を推奨し、モデルが既に知る一般論を増やさず、詳細を必要な場合だけ読み込む構成を示しています。
- [Claude Code](https://code.claude.com/docs/en/skills)、[GitHub Copilot](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)、[OpenAI Docs](https://learn.chatgpt.com/docs/build-skills)での利用を想定し、特定モデルのトークナイザーに依存しない規則にします。

500行は共通仕様の推奨に沿う上限です。8,000文字と1行400文字は公式仕様の制約ではなく、このリポジトリの独自規則です。導入時の最長Skillは約3,245文字・1行205文字だったため、成長の余地を残しつつ長い段落や詰め込みを検出する境界として選びました。文字数は5,000トークンの換算値ではなく、この上限だけで品質や各モデルのトークン予算への適合を保証しません。
