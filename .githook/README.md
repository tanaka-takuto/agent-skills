# Git フック

このリポジトリでフックを有効にするには、クローンごとに一度実行してください。
Node.js と npm が必要です。

```sh
npm ci
git config --local core.hooksPath .githook
```

`commit-msg` は、コミットメッセージを1行の Conventional Commits 形式
`<type>(<scope>)[!]: <description>` に制限します。本文とトレーラーは使えません。

- `type`: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`
- `scope`: `hooks`, `skills`, `repo`（必須）

例: `feat(hooks): コミットメッセージを検証する`

`pre-commit` はステージ済みの追加・変更・改名されたファイルに、次の検査を行います。

- `SKILL.md` のファイル名、Skill ディレクトリ名、frontmatter の `name`（64文字以内）。
- `SKILL.md` の行数、総文字数、1行の文字数。
- 参照資料を含むすべての `.md` の Prettier フォーマット。

未整形や上限超過があればコミットを止めます。Git のインデックスにある内容を検査し、作業ツリーの自動整形や再ステージは行いません。部分ステージで残した変更はそのまま保たれます。フォーマット設定と指定バージョンもステージ済みの `.prettierrc.json` と `package.json` から読みます。Markdown の削除だけの場合はフォーマット検査を行いません。

frontmatter は YAML として解析します。コメント、引用符、複数行文字列などの有効な構文を受け入れ、不正な構文や重複キーは拒否します。`name` は文字列とし、ケバブケースで Skill ディレクトリ名と一致させます。解析に使う `yaml` も `npm ci` で導入します。

## Markdown のフォーマット

[Prettier](https://prettier.io/docs/) を開発依存として固定バージョンで導入し、`package-lock.json` も保存します。`npm run format` で全 Markdown を整形し、`npm run format:check` で作業ツリーを検査できます。個別のファイルを直す場合は `npm exec -- prettier --write <対象パス...>` を使い、必要な変更だけをステージし直してください。

設定は `.prettierrc.json` にまとめます。[`proseWrap: "preserve"`](https://prettier.io/docs/options#prose-wrap) で文章の改行を保ち、[`embeddedLanguageFormatting: "off"`](https://prettier.io/docs/options#embedded-language-formatting) でコード例の内部を変更しません。1行の文字数制限はフォーマッターと別の検査で強制します。インストール済みの Prettier がステージ済みの指定バージョンと違う場合もコミットを止め、`npm ci` を案内します。

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

Skill も短く保ちます。常時適用する指示に比べて本文を読む時点は遅く、通常は発見用の名前と説明だけが最初に読み込まれます。ただし発動すると `SKILL.md` 全体が会話や他の情報とコンテキストを共有するため、長さの負担は残ります。モデルが既に知る一般論を省き、作業固有の判断、失敗条件、確認方法を優先します。

- [Agent Skills仕様](https://agentskills.io/specification#progressive-disclosure)は、本文を5,000トークン未満、主ファイルを500行未満に抑えることを推奨します。名前・説明、本文、補助資料を段階的に読みます。
- [Anthropicの作成ガイド](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices#progressive-disclosure-patterns)も本文500行未満を推奨し、モデルが既に知る一般論を増やさず、詳細を必要な場合だけ読み込む構成を示しています。
- [Claude Code](https://code.claude.com/docs/en/skills)、[GitHub Copilot](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)、[OpenAI Docs](https://learn.chatgpt.com/docs/build-skills)での利用を想定し、特定モデルのトークナイザーに依存しない規則にします。

500行は共通仕様の推奨に沿う上限です。8,000文字と1行400文字は公式仕様の制約ではなく、このリポジトリの独自規則です。導入時の最長Skillは約3,245文字・1行205文字だったため、成長の余地を残しつつ長い段落や詰め込みを検出する境界として選びました。文字数は5,000トークンの換算値ではなく、この上限だけで品質や各モデルのトークン予算への適合を保証しません。

公開する Skill の内容は共通仕様の `name`・`description` と相対参照を基本にします。各ホストの導入先や発動方法はホスト側に従い、プロバイダー固有の設定を共通の前提にはしません。機械的な長さ・整形の合格と、各モデルでの発動・手順の有効性は別に確認します。
