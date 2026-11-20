---
name: review-agent-skill
description: Agent Skill の品質をレビューする。SKILL.md や付属ファイルの確認を依頼されたときに使う。
---

# Agent Skill のレビュー

1. 対象の `SKILL.md`、必要な付属ファイル、元の依頼を読む。想定する利用環境が不明なら、その前提を明示する。
2. `node` で [scripts/check-skill-names.mjs](scripts/check-skill-names.mjs) と [scripts/check-skill-size.mjs](scripts/check-skill-size.mjs) に対象の `SKILL.md` のパスを渡して実行する。ファイル名・ディレクトリ名・frontmatter の `name` と、[長さの上限](../../../.githook/README.md#skillmd-の長さ)はスクリプトの結果で判定する。
3. リポジトリルートで `npm exec -- prettier --check <対象パス...>` を実行し、`SKILL.md` と必要な参照資料のフォーマットを確認する。初回は `npm ci` で固定バージョンを導入する。全 Skill の確認には `npm run format:check` を使う。未整形のファイルは問題として報告し、修正を依頼されていれば `--write` で整形する。
4. [Agent Skills 仕様](https://agentskills.io/specification)への適合、参照先と依存関係を確認する。対象ホスト固有の項目はその仕様で確認し、仕様違反と推奨事項を分ける。
5. `description` が適切な依頼で発動するか、手順が目的と完了条件を満たすかを確認する。既定の能力で欠ける仕事を補うか、固定テンプレートが依頼や既存の設計を上書きしないかを点検する。冗長な一般論、重複、古くなりやすい情報、不要な制約を指摘する。スクリプトと権限の危険も確認する。
6. 使うべき依頼と使うべきでない近い依頼、重要な失敗例で点検する。重要な手順の新設・改訂や有効性の主張には、[evaluate-agent-skill](../../../skills/evaluate-agent-skill/SKILL.md)でSkillなし／あり、必要なら現行版／候補版を比較する。整形だけの変更に比較を一律に要求しない。未実施なら効果未検証と記す。
7. 問題を重要度順に、ファイル位置・影響・具体的な修正案とともに報告する。形式への適合、手順の例題点検、実測された効果を区別し、問題未発見を有効性の証明にしない。統合・廃止の提案には失われる役割と代替手段を示す。修正や削除は依頼された範囲で行う。
