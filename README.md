# Agent Skills

Claude Code と Codex で使う、要望の整理・設計・検証・レビューのためのスキル集です。必要な仕事を汎用スキルに分け、目的に応じて組み合わせます。

## インストール

公開リポジトリの [`skills/`](https://github.com/tanaka-takuto/agent-skills/tree/main/skills) を、[`npx skills`](https://github.com/vercel-labs/skills) で直接取得します。事前の手動 `git clone` は不要です。以下のコマンドは、すべて `skills` CLI のテレメトリを無効化します。

必要な環境は Node.js、npm（`npx`）、Git、利用する Claude Code または Codex です。確認した `skills` CLI 1.7.2 の Node.js 要件は **22.20.0 以上**です。[CLI の実行環境](https://github.com/vercel-labs/skills/blob/main/package.json)

以下の `sh` コマンドは macOS / Linux のシェル向けです。公開用の `skills/` を指定して、このリポジトリの作業用スキルもインストール対象に混ざることを防ぎます。

### Claude Code にインストール

ユーザー全体で使えるように、公開スキルをすべてインストールします。

```sh
DISABLE_TELEMETRY=1 npx --yes skills add https://github.com/tanaka-takuto/agent-skills/tree/main/skills \
  --agent claude-code --skill '*' --global --yes
```

### Codex にインストール

```sh
DISABLE_TELEMETRY=1 npx --yes skills add https://github.com/tanaka-takuto/agent-skills/tree/main/skills \
  --agent codex --skill '*' --global --yes
```

### 両方にインストール

```sh
DISABLE_TELEMETRY=1 npx --yes skills add https://github.com/tanaka-takuto/agent-skills/tree/main/skills \
  --agent claude-code codex --skill '*' --global --yes
```

`--agent` で利用するエージェント、`--skill '*'` で公開スキル全体、`--global` でユーザー単位のインストール、`--yes` で確認の省略を指定します。`'*'` はシェルがファイル名へ展開しないよう引用します。[CLI のオプション](https://github.com/vercel-labs/skills#options)

### プロジェクト単位で使う

利用するプロジェクトのディレクトリで、`--global` を外して実行します。

```sh
DISABLE_TELEMETRY=1 npx --yes skills add https://github.com/tanaka-takuto/agent-skills/tree/main/skills \
  --agent claude-code codex --skill '*' --yes
```

標準設定での読み込み先は次のとおりです。CLI は共通の保存先とシンボリックリンクを使って配置します。

| エージェント | ユーザー単位        | プロジェクト単位  |
| ------------ | ------------------- | ----------------- |
| Claude Code  | `~/.claude/skills/` | `.claude/skills/` |
| Codex        | `~/.agents/skills/` | `.agents/skills/` |

読み込み先は [skills CLI の対応エージェント](https://github.com/vercel-labs/skills#supported-agents)、[Claude Code のスキル仕様](https://code.claude.com/docs/en/skills#choose-where-skills-load)、[Codex のスキル仕様](https://developers.openai.com/codex/skills/#where-to-save-skills)を参照してください。

### 完了条件とループ指示書に必要なスキルだけ入れる

`define-loop` と `define-completion` が参照する汎用スキルも含めてインストールします。

```sh
DISABLE_TELEMETRY=1 npx --yes skills add https://github.com/tanaka-takuto/agent-skills/tree/main/skills \
  --agent claude-code codex --global --yes \
  --skill define-loop define-completion define-boundaries find-gaps \
    test-assumptions elicit-intent verify-understanding capture-decisions
```

ほかのスキルを選ぶ場合も `--skill` に名前を指定できます。スキル間の参照は自動で追加インストールされる依存定義ではないため、個別に選ぶ場合は各 `SKILL.md` が参照するスキルも含めてください。

### Windows / PowerShell

同じターミナルで環境変数を設定してから実行します。以下は両方のエージェントへユーザー単位でインストールする例です。

```powershell
$env:DISABLE_TELEMETRY = '1'
npx --yes skills add https://github.com/tanaka-takuto/agent-skills/tree/main/skills --agent claude-code codex --skill '*' --global --yes
```

### 一覧とインストール結果を確認

公開リモートにあるスキルを、インストールせずに確認できます。

```sh
DISABLE_TELEMETRY=1 npx --yes skills add https://github.com/tanaka-takuto/agent-skills/tree/main/skills --list
```

ユーザー単位でインストール済みのスキルを確認します。プロジェクト単位で入れた場合は、そのプロジェクトで `--global` を外して実行します。

```sh
DISABLE_TELEMETRY=1 npx --yes skills list --global --agent claude-code codex
```

## テレメトリの無効化

コマンドの先頭に付けた `DISABLE_TELEMETRY=1` は、そのコマンドと子プロセスへ渡す環境変数です。PowerShell の例では、同じターミナルでの後続コマンドにも適用されます。

公式 CLI は `DISABLE_TELEMETRY=1` または `DO_NOT_TRACK=1` で、利用統計の送信と連動するセキュリティ監査リクエストを無効化します。ここでは `DISABLE_TELEMETRY=1` に統一しています。[公式のテレメトリ説明](https://github.com/vercel-labs/skills#telemetry)、[無効化処理の実装](https://github.com/vercel-labs/skills/blob/main/src/telemetry.ts)

これは `skills` CLI の収集設定です。npm や GitHub からファイルを取得する通信は行われます。Claude Code / Codex 自体のデータ収集設定は、それぞれの製品設定に従います。

## 使い方

インストール後、Claude Code または Codex でスキルを指定して依頼します。表示されない場合は新しいセッションで確認してください。

Claude Code では `/スキル名` で指定します。[Claude Code の呼出し方法](https://code.claude.com/docs/en/skills)

```text
/define-completion この要望から、判定方法と証拠を含む完了条件を作成してください。
/define-loop この完了条件から、ループ実行へ渡す指示書を作成してください。
```

Codex では `$スキル名` で指定します。[Codex の呼出し方法](https://developers.openai.com/codex/skills/#how-codex-uses-skills)

```text
$define-completion この要望から、判定方法と証拠を含む完了条件を作成してください。
$define-loop この完了条件から、ループ実行へ渡す指示書を作成してください。
```

`define-completion` は成果の合格条件を作り、`define-loop` は実行・観測・検証・続行と停止・再開を含む指示書へ組み立てます。対象作業の実行開始は、利用する実行環境で別に依頼します。入力元や保存先は、会話・文書・Issueなどから仕事に合わせて選べます。

## 公開スキル

| スキル                                                       | 用途                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [align-request](skills/align-request/SKILL.md)               | 汎用スキルを組み合わせ、要望の認識と期待結果をそろえる                 |
| [elicit-intent](skills/elicit-intent/SKILL.md)               | 目的、背景、望む結果、譲れない条件を引き出す                           |
| [find-gaps](skills/find-gaps/SKILL.md)                       | 判断を変える曖昧さ、抜け、矛盾、未確認を探す                           |
| [verify-understanding](skills/verify-understanding/SKILL.md) | 具体例や境界から、同じ理解・判断になるか照合する                       |
| [capture-decisions](skills/capture-decisions/SKILL.md)       | 決定、理由、適用条件、未決事項を記録する                               |
| [define-completion](skills/define-completion/SKILL.md)       | 観測可能な完了条件、判定方法、証拠を作る                               |
| [define-loop](skills/define-loop/SKILL.md)                   | ループ実行へ渡す指示書を作る                                           |
| [define-boundaries](skills/define-boundaries/SKILL.md)       | 責務と所有者、依存、境界を越える契約を決める                           |
| [compare-options](skills/compare-options/SKILL.md)           | 同じ目的と評価基準で代替案を比較する                                   |
| [test-assumptions](skills/test-assumptions/SKILL.md)         | 重要な仮定を反証可能にし、証拠で確かめる                               |
| [design-web-app](skills/design-web-app/SKILL.md)             | 画面、API、データ、認証、インフラと運用を整合させる                    |
| [reconstruct-behavior](skills/reconstruct-behavior/SKILL.md) | 資料や実装から、現在の挙動と暗黙の契約を復元する                       |
| [migrate-legacy](skills/migrate-legacy/SKILL.md)             | 既存機能を保ちながら、設計・移行・検証を進める                         |
| [plan-transition](skills/plan-transition/SKILL.md)           | 移行途中の状態、進行条件、復旧と終了を設計する                         |
| [verify-equivalence](skills/verify-equivalence/SKILL.md)     | 置換前後を同じ条件で比較し、同等性を確かめる                           |
| [change-len](skills/change-len/SKILL.md)                     | 変更の目的と挙動、実装、要件をたどれる単一HTMLのレビューレポートを作る |

スクリプトを含むスキルの追加要件や検証方法は、それぞれの `SKILL.md` を参照してください。

## リポジトリの構成

```text
skills/          公開・インストール用のスキル
.agents/skills/  このリポジトリで作成・レビューを行うための作業用スキル
.githook/        名前、長さ、整形、コミットメッセージの検査
```

スキルを編集する場合の形式検査は、[Git フックとフォーマットの説明](.githook/README.md)を参照してください。
