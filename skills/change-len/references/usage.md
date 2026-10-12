# 導入と検証

公開元の `skills/change-len` は共通の Skill パッケージ。実行に必要なのは `SKILL.md`、`references`、`scripts/model.ts`、`scripts/review-state.ts`、`scripts/compare.ts`、`scripts/code-links.ts`、`scripts/render.ts`、`assets`、このディレクトリの `package.json`。生成コードは Node.js 標準ライブラリだけを使う。

## Claude Code／Codex

対象リポジトリへフォルダー全体をコピーするか、そのホストが探索する場所からシンボリックリンクする。公開元をホストごとに書き換えない。

| ホスト      | プロジェクト内の配置先      | 起動例                                                          |
| ----------- | --------------------------- | --------------------------------------------------------------- |
| Claude Code | `.claude/skills/change-len` | `/change-len HEAD の変更と spec.md から review.html を作成して` |
| Codex       | `.agents/skills/change-len` | `$change-len HEAD の変更と spec.md から review.html を作成して` |

自動選択も許可する。発動対象の例は「PR の目的とコード・要件の対応を HTML でレビューしたい」。近い非対象例は「この関数だけを修正して」「完了条件だけを文章で作って」。ホストに名前が出ない場合は配置を確認し、再読み込みまたは新しいセッションで確認する。配置の検査は実際のスキル起動の証明にはならない。

2026-10-11 に確認した一次資料：[Agent Skills 仕様](https://agentskills.io/specification)、[Claude Code Skills](https://code.claude.com/docs/en/skills)、[OpenAI の Skills ドキュメント](https://developers.openai.com/codex/skills)。ホストの配置・起動方法はそれぞれの公式仕様に従う。

## 生成

リポジトリルートから実コミットのサンプルを生成する。

```sh
node skills/change-len/scripts/render.ts skills/change-len/references/example.json /tmp/change-len-review.html
```

別の実入力は `references/pr-example.json`（Node.js PR #56350 と Issue #17）、資料なしの差分入力は `references/diff-example.json`。同じ生成コードを使用できる。

生成後は HTML だけを任意の場所へコピーして、ブラウザで開く。閲覧者が Node.js、JSON、画像、サーバーを用意する必要はない。各対象を選ぶと入力欄が直下に現れる。コメントを保存し、「依頼文をコピー」から全文を取得する。自動コピーを利用できないブラウザでも、表示された全文を手動コピーできる。

コメントの自動保存、JSON による保存・復元、前回レビュー済み版からの再生成は [保存と再レビュー](review-state.md) を読む。`archive` と `completion` は設計・作業記録用で、利用・配布に不要。テストデータは `references` と `scripts/testdata` に置く。

### VS Code 用リンクの生成

「コード参照を VS Code で開けるリンクにして」と指定された場合だけ、`--vscode-local` と `--repo` を付ける。`--repo` は閲覧する端末のローカルリポジトリのルート。対象リポジトリがその端末にあり参照先が確定していれば、その場所を使う。リモート環境しか分からない場合は閲覧側の場所を確認し、パスの文字列置換でリンクを捏造しない。

```sh
node /path/to/change-len/scripts/render.ts /path/to/report.json /path/to/review.html \
  --vscode-local --repo /absolute/path/to/local/repository
```

前回レビューの `--review-state /path/to/review-state.json` とも併用できる。引数の順序は任意。通常の生成では VS Code リンクや参照先のローカル絶対パスを追加しない。

指定時はコードのファイル名と行番号を `vscode://file/<絶対パス>:<行>:1` 形式のリンクにする。ファイル名は掲載範囲の先頭行へ、行番号はその行へ移動する。パス内のスペース、日本語、`#`、`%` は URL としてエンコードする。[VS Code の公式 URL 形式](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls)

リンクを作るのは、生成時に Git の対象版の通常ファイルとローカルファイル全体がバイト単位で一致し、掲載コードと行番号も一致する場合だけ。変更前・変更後を別々に確認する。版が未確認、版やローカルファイルが取得できない、内容が違う、リポジトリ外へのパス、シンボリックリンクの場合はリンクを作らず理由を表示する。過去版や削除済みコードを現在のファイルへ結び付けない。改行変換などでバイト単位の一致を確認できない場合も同様。

HTML 内の掲載コードは保存された対象版のまま。VS Code は閲覧時のローカルファイルを開くため、生成後にファイルを変更したら再生成する。リンクにはその端末の絶対パスが含まれ、ほかの端末での開通は保証しない。VS Code のインストールと OS の URL ハンドラー、ブラウザの外部アプリ起動許可が必要。生成・DOM 検査だけでは実際に VS Code が起動した証拠にならず、実クリックで行の移動を確認していなければ未確認と報告する。

Node.js は TypeScript の型を除去して直接実行する。`enum`、引数プロパティ、JSX などコード生成が必要な構文は使わない。型検査は開発時に `tsc --noEmit` で別に行い、ビルド生成物を維持しない。[Node.js の型除去](https://nodejs.org/api/typescript.html)、[stripTypeScriptTypes](https://nodejs.org/api/module.html#modulestriptypescripttypescode-options)

## 開発時の検証

```sh
npm ci
npm run check:change-len
npm run test:change-len
npm run check:skill-names
npm run check:skill-size
npm run format:check
npm test
```

DOM テストは入力、画面切替、対象への入力、コメントの保持、コピーの成功／失敗を検査するが、実ブラウザでの表示・クリップボード権限を証明しない。オフラインのローカル HTML を実ブラウザで開いて確認し、確認記録へ環境と結果を残す。

## 引き継ぎ

JSON 契約とサンプルはこの `references`、生成コードは `scripts`、画面のソースは `assets`。検証は `npm run check:change-len` と `npm run test:change-len` を使う。各ホストでの実起動、実ブラウザ、PR の取得などの未確認を、ローカルのテスト結果で埋めない。
