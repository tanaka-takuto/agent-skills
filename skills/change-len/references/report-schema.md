# 構造化 JSON の契約 v1

`scripts/model.ts` の `Report` が型定義、`validateReport` が実行時の検証器。入力は UTF-8 JSON。`references/example.json` はこのリポジトリの実コミットを読み解いた入力で、架空の PR #128 は使わない。

## 項目

| キー            | 内容                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `schemaVersion` | 数値 `1`                                                                                                                                                                                   |
| `revision`      | `kind`（`commit` / `range` / `diff` / `pr`）、表示用 `label`、解決済み `base` / `head`、比較範囲の根拠 `sourceIds`                                                                         |
| `sources`       | `{id, label, locator, excerpt, url?}`。保存済みの資料・差分・確認結果。`locator` はファイル・行・版または取得元、`excerpt` はオフラインで読める内容。URL は取得済みで実在する http(s) だけ |
| `targets`       | 下記のコメント対象。画面の配置から参照される対象をすべて含む                                                                                                                               |
| `overview`      | `titleId`, `purposeId`, `beforeId`, `afterId` と `flowIds`, `questionIds`, `evidenceIds`                                                                                                   |
| `changes`       | `{id, targetId, beforeCodeId?, afterCodeId?, requirementIds, evidenceIds}`。目的・処理に沿う変更単位                                                                                       |
| `requirements`  | `{id, targetId, expectationId, changeIds, evidenceIds}`。原文と期待結果を区別する。資料なしなら `[]`                                                                                       |
| `evidence`      | `{id, targetId, status, method, conditions, result}`。状態は `observed` / `unverified` / `missing`。確認方法・条件・観測結果を含む                                                         |

`reviewKey` は任意の空でない文字列で、リポジトリとレビューを区別する安定した識別子。再レビューでは同じ値を維持する。`reviewComparison` は生成コードが Git から取得する任意の `{base, head, sourceId}`。`base` は明示レビュー済みの head、`head` は今回の `revision.head`、`sourceId` は保存した前回差分の出典。初期の `revision.base` と区別する。両方の版を解決済みコミット ID にする。`review.patch` は前回差分全体へコメントする予約 ID で、他の対象・行・出典には使わない。

コミット ID は省略しない 40 桁または 64 桁の小文字十六進数。差分ファイルの元版・先版を特定できない場合は `kind: "diff"`、`base: null`、`head: null` とし、差分ファイルの SHA-256 を `contentHash` に保存する。分かっている版があれば同じ形式で記録する。`sourceIds` には比較範囲を裏付ける保存資料を指定する。

全 ID はレポート全体で一意とし、英数字と `_ . : -` を使う。表示名は一致してもよい。要件と変更の対応は `changes[].requirementIds` と `requirements[].changeIds` の双方へ記録し、根拠がない対応は空配列にする。

## コメント対象

```json
{
  "id": "overview.flow.1",
  "view": "overview",
  "path": ["全体像", "どう実現するか", "1 画面"],
  "label": "1 画面",
  "text": "連続操作を抑止する",
  "certainty": "inference",
  "sourceIds": ["diff-source"],
  "requirementIds": [],
  "evidenceIds": [],
  "linkIds": ["code.after"]
}
```

`view` は `overview` / `details` / `requirements`。`path` の最初は対応する画面名または view キーとし、後に対象の階層を付ける。`label` は短い対象名、`text` は今回の入力から得た該当内容。`certainty` は `fact`（出典必須）/ `inference` / `unverified`。本文に断定する内容が含まれるなら、その区別と出典を見直す。`linkIds` は利用可能な関連箇所への任意の参照で、存在しない ID は指定しない。

コード対象には任意の `code` を付ける。前後それぞれに別の対象を作る。

```json
{
  "file": "src/example.ts",
  "side": "after",
  "revision": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "lines": [
    { "id": "code.after.L37", "number": 37, "text": "return input;", "change": "added" },
    { "id": "code.after.L38", "number": 38, "text": "}", "change": "context" }
  ]
}
```

`file` はその版のパス、`side` は `before` / `after`、`revision` は該当版。Git の版があればレポートの `base` / `head` と一致させる。差分だけで版不明なら、入力差分の SHA-256 を使う `patch:<contentHash>:before` / `patch:<contentHash>:after` を指定する。別の差分のハッシュや前後の取り違えを検出する。行番号はその側の実際の行で、正の整数を昇順にする。`text` は改行を含まない 1 行で空行も許可する。`change` は `added` / `removed` / `context`。新規追加・削除・バイナリ・gitlink は存在しないコードを捏造せず、変更の説明と元の差分へ情報を残す。

コード行の ID も JSON で指定する。行の対象はファイル、前後、版、行番号、正確な本文、親の階層・出典を引き継ぎ、対応する変更の要件・根拠も参照する。クリックの座標や見出しの文字列で ID を推定しない。

確認根拠の `observed` は保存済みの実行結果・観察結果を指す `sourceIds` がある場合に限る。未実施は `unverified`、実施したが記録がない場合は `missing` とし、結果を創作しない。複数画面から同じ確認根拠を開く場合は同じ対象 ID を使う。

## 出力と失敗

`node scripts/render.ts <report.json> <review.html>` は契約を検証してから HTML を書く。不正なら非ゼロ終了し、JSON の位置と理由を標準エラーへ出す。既存の出力 HTML は書き換えない。欠落、重複 ID、参照切れ、別画面への誤参照、コードの版の不一致、出典なしの事実、非 http(s) URL、要件との逆向き対応の欠落、配置されない対象を検出する。

HTML にはデータ、CSS、型除去後の JavaScript を埋め込む。入力テキストは HTML として評価せず、JSON 内の `<` をエスケープし、画面では `textContent` を使う。CSP のハッシュで同梱コード・スタイルだけを許可し、外部アセット・API 接続を使わない。外部の原文を開く操作だけは通信が必要で、保存済み内容は HTML 内から読める。

依頼文生成器 `buildPrompt` の入力は `{targetId, body}` の対で、空白だけの本文・未保存・取消を依頼文へ含めない。本文の改行・引用符・前後空白を保存時に書き換えない。依頼文は `buildPrompt` で対象データと結合する。同じ JSON と同じ順序の保存コメントは同じ依頼内容になる。

保存と再レビュー用の JSON は Report とは別の v1 契約。[レビューの保存と再レビュー](review-state.md)を参照する。`createReviewTools` が保存・検証・復元・引継ぎ・依頼文生成を扱い、HTML でも同じ処理を使用する。
