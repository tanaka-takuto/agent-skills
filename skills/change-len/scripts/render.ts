import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import {
  validateReport,
  indexTargets,
  buildPrompt,
  VIEW_NAMES,
} from "./model.ts";

import { createReviewTools } from "./review-state.ts";
import type { ReviewState } from "./review-state.ts";
import { prepareComparison } from "./compare.ts";

export function renderReport(input: unknown, saved?: ReviewState): string {
  const report = validateReport(input);
  const state = saved
    ? createReviewTools().validate(saved)
    : createReviewTools().empty();
  if (
    state.reports.some(
      (r) =>
        r.reviewKey && report.reviewKey && r.reviewKey !== report.reviewKey,
    )
  )
    throw new Error("異なるレビューの保存記録です");
  const css = readFileSync(
    new URL("../assets/report.css", import.meta.url),
    "utf8",
  );
  const ui = stripTypeScriptTypes(
    readFileSync(new URL("../assets/report.ts", import.meta.url), "utf8"),
  );
  const script = `const VIEW_NAMES=${JSON.stringify(VIEW_NAMES)};\n${validateReport.toString()}\n${indexTargets.toString()}\n${buildPrompt.toString()}\n${createReviewTools.toString()}\n${ui}`;
  const scriptHash = createHash("sha256").update(script).digest("base64");
  const cssHash = createHash("sha256").update(css).digest("base64");
  const escapeJSON = (v: unknown) =>
    JSON.stringify(v)
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  const data = escapeJSON(report),
    stateData = escapeJSON(state);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${cssHash}'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'">
<title>Change Len — 変更を読み解く</title><style>${css}</style></head>
<body><header class="masthead"><div class="brand">CHANGE LEN <span>変更を読み解く</span></div><div id="revision"></div><button data-copy class="primary">依頼文をコピー <span id="comment-count">0</span></button></header>
<section class="review-controls" aria-label="レビューの記録"><button data-all-changes aria-pressed="true">今回の変更すべて</button><button data-previous disabled aria-pressed="false">前回からの変更</button><button data-reviewed>この版をレビュー済みにする</button><button data-records>コメントの保存・復元 <span id="pending-count"></span></button><p id="review-status" role="status"></p></section>
<div class="workspace"><aside><nav aria-label="読む順序"><h2>読む順序</h2><button data-view="overview">01　全体像</button><button data-view="details">02　変更の詳細</button><button data-view="requirements">03　要件との対応</button></nav><section class="source-rail"><h2>関連する根拠</h2><div id="sources"></div></section></aside><main id="content"></main></div>
<footer><span>対象を選ぶと、その箇所にコメントできます。対象・コード・要件・版を依頼文へ自動で記録します。</span><span id="status" role="status" aria-live="polite"></span><span>保存済みコメントは自動保存します。別の HTML へ引き継ぐときは JSON を保存してください。</span></footer>
<section id="records-dialog" class="overlay" role="dialog" aria-modal="true" aria-labelledby="records-title" hidden><div class="sheet"><header class="dialog-header"><h2 id="records-title">コメントの保存・復元</h2><button data-close-records>閉じる</button></header><div class="dialog-body"><p>元の版・対象・コメントとレビュー済み版をまとめて保存します。変更・移動・削除された対象は下で確認できます。</p><p id="record-status" role="status"></p><label for="review-export">保存する JSON（全文を選択して保存できます）</label><textarea id="review-export" readonly></textarea><button data-download>JSON を保存</button><button data-select-records>JSON 全文を選択</button><label for="review-file">JSON ファイルから復元</label><input id="review-file" type="file" accept=".json,application/json"><label for="review-import">または JSON を貼り付け</label><textarea id="review-import"></textarea><button data-restore>JSON を復元</button><h3>引継ぎの確認待ち</h3><div id="pending-comments"></div><button data-close-records>閉じる</button></div></div></section>
<section id="prompt-dialog" class="overlay" role="dialog" aria-modal="true" aria-labelledby="prompt-title" hidden><div class="sheet"><header class="dialog-header"><h2 id="prompt-title">修正依頼</h2><button data-close-prompt>閉じる</button></header><div class="dialog-body"><p id="copy-status" role="status"></p><label for="prompt-output">完成した依頼文（選択して手動コピーできます）</label><textarea id="prompt-output" readonly></textarea><button data-select-prompt>全文を選択</button><button data-close-prompt>閉じる</button></div></div></section>
<section id="source-dialog" class="overlay" role="dialog" aria-modal="true" aria-labelledby="source-title" hidden><div class="sheet"><header class="dialog-header"><h2 id="source-title"></h2><button data-close-source>閉じる</button></header><div class="dialog-body"><p id="source-locator"></p><pre id="source-excerpt"></pre><a id="source-url" target="_blank" rel="noopener noreferrer" hidden>外部の原文を開く ↗（通信が必要）</a><button data-close-source>閉じる</button></div></div></section>
<script type="application/json" id="review-state-data">${stateData}</script><script type="application/json" id="report-data">${data}</script><script>${script}</script></body></html>\n`;
}

if (
  process.argv[1] &&
  process.argv[1] !== "-" &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  try {
    const [input, output, ...extra] = process.argv.slice(2);
    if (
      !input ||
      !output ||
      (extra.length !== 0 &&
        (extra.length !== 4 ||
          extra[0] !== "--review-state" ||
          extra[2] !== "--repo"))
    )
      throw new Error(
        "使い方: node render.ts <report.json> <review.html> [--review-state <review-state.json> --repo <repository>]",
      );
    let report = validateReport(JSON.parse(readFileSync(input, "utf8")));
    const state = extra.length
      ? createReviewTools().validate(JSON.parse(readFileSync(extra[1], "utf8")))
      : undefined;
    if (state?.reviewed) report = prepareComparison(report, state, extra[3]);
    const html = renderReport(report, state);
    writeFileSync(output, html);
    console.log(`生成: ${output} (${Buffer.byteLength(html)} bytes)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
