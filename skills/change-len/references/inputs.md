# 対象変更と資料を取得する

この文書は入力形式に合わせて読む。出力先は対象リポジトリの変更対象と分け、比較した版・生の差分・取得した資料を残す。入力をコマンド文字列へ連結せず、引数として渡す。Git の external diff と textconv を無効にして読む。

## コミットと比較範囲

コミットは `git rev-parse --verify <ref>^{commit}` で完全な ID に解決し、その親と比較する。マージコミットでは比較する親を明示する。ルートコミットの場合は空のツリーを基準にし、JSON の版は別途合成した空のコミットで特定するか、差分入力としてその SHA-256 を保存する。存在しない親を通常の版として扱わない。

範囲を渡されたら、その意味を保つ。`A..B` は A のツリーと B の比較、`A...B` は merge-base(A,B) と B の比較として、実際に比較する両端を解決して記録する。

```sh
git rev-parse --verify 'HEAD^{commit}'
git rev-parse --verify 'HEAD^1^{commit}'
git -c core.quotePath=false diff --no-ext-diff --no-textconv --find-renames BASE_ID HEAD_ID --
git show 'HEAD_ID:path/to/file.ts'
```

例の ID・パスを確認済みの値で置き換える。コードの行は元版のファイルから採り、差分の行番号を別の版へ移さない。rename は前後のパスを保持し、gitlink はサブモジュール ID として説明する。作業ツリーの差分を依頼されたら、`git diff` と `git diff --cached` の境界を記録し、その差分の SHA-256 を使う。未コミットの内容に HEAD のコード版を付けない。

## 差分ファイル

渡された差分をそのまま保存し、`sha256sum /path/to/change.diff` または `shasum -a 256 /path/to/change.diff` で SHA-256 を記録する。元版・先版が確定していなければ `revision.kind: "diff"` とし、未確認のまま表示する。コードと周辺文脈は入力から読み取れる範囲だけ収録する。差分が空の場合も、存在しない変更を創作しない。

## PR と Issue

利用可能な認証済みの GitHub 接続、または `gh` で原文と比較両端を取得する。

```sh
gh pr view PR_URL --json number,title,body,url,baseRefOid,headRefOid,files
gh pr diff PR_URL --color never
gh issue view ISSUE_URL --json number,title,body,url,comments
```

実際の PR 差分の比較元は merge-base になる場合がある。取得した base/head とローカルオブジェクトを照合し、実際に比較した merge-base を `revision.base` に使う。ローカルに版がなければ fetch または取得した diff を使用する。ブランチを checkout して未保存の作業を上書きしない。PR の head が取得途中に更新されたら、同じ版で資料と差分を取り直す。

取得した原文、完全な URL、版・取得時点を `sources` に保存する。取得できない PR をコミット入力へ黙って置き換えず、不足と、手元の diff で進められる境界を示す。Issue がない場合も架空の番号やリンクを付けない。

## 資料と確認根拠

ユーザーが渡した仕様、完了条件、採用済みの決定、実装者のログを読み、原文と期待結果を対応させる。文書の作成日だけで採用状態を決めない。資料間の矛盾は論点へ残し、期待結果の合否を勝手に確定しない。

出典は保存した本文と所在を組にする。外部リンクなしでも `locator` と格納済み `excerpt` を読める。実装者が行った確認の条件・方法・観測結果を保存する。テストの名前だけを、利用者から見た要件全体の証拠にしない。
