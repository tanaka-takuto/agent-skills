---
name: create-agent-skill
description: 反復可能な作業を Agent Skill として新規作成・改訂する。SKILL.md の作成や更新を依頼されたときに使う。
---

# Agent Skill の作成

1. 依頼から対象の作業、使う場面、想定環境、完了条件を特定する。既存の Skill とリポジトリの指示を確認し、重複を避ける。紛らわしい非対象の依頼があれば境界も決める。
2. 保存先の指定がなければ、このリポジトリの `skills/<name>/SKILL.md` に置く。`name` をディレクトリ名と一致させ、`description` に仕事と使用条件を簡潔に書く。
3. `SKILL.md` には結果を変える判断、手順、検証方法だけを書く。一般論や未確認の前提を増やさない。[リポジトリの上限](../../../.githook/README.md#skillmd-の長さ)は全体500行・8,000文字・1行400文字で、上限を埋めることを目指さない。詳細資料は必要な場合だけ `references/` に、繰り返す決定的な処理は必要な場合だけ `scripts/` に置く。
4. リポジトリルートで、固定バージョンの Prettier を使って作成・変更した `SKILL.md` と参照資料をフォーマットする。初回は `npm ci`、個別のファイルは `npm exec -- prettier --write <対象パス...>`、全 Skill は `npm run format` を使う。設定は `.prettierrc.json` に従う。
5. [Agent Skills 仕様](https://agentskills.io/specification)に照らして frontmatter と参照先を検証する。`npm run check:skill-size` で長さ、`npm exec -- prettier --check <対象パス...>` でフォーマットも確認する。実際に使う依頼と、使うべきでない近い依頼で発動条件を確認し、未検証の点を報告する。

常時適用する規則や機械的な強制には、それぞれリポジトリ指示やフックが適する場合がある。依頼された Skill の目的を保ちつつ、該当する場合は理由を伝える。
