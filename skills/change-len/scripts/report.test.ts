import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.ts";
import { validateReport, buildPrompt } from "./model.ts";
import { renderReport } from "./render.ts";
import type { Report } from "./model.ts";

test("有効なレポートと同名対象・変更前後の行を区別する", () => {
  const r = fixture();
  assert.equal(validateReport(r), r);
  const prompt = buildPrompt(r, [
    { targetId: "old-line", body: "前を確認" },
    { targetId: "new-line", body: "後を確認" },
  ]);
  assert.match(prompt, /変更前.*aaaaaaaa/);
  assert.match(prompt, /変更後.*bbbbbbbb/);
  assert.match(prompt, /old-line/);
  assert.match(prompt, /new-line/);
});

const invalidCases: [string, (r: Report) => void, RegExp][] = [
  [
    "必須情報欠落",
    (r) => delete (r.overview as Partial<Report["overview"]>).purposeId,
    /overview.purposeId/,
  ],
  [
    "重複対象",
    (r) => r.targets.push(structuredClone(r.targets[0])),
    /重複.*title/,
  ],
  [
    "行IDの衝突",
    (r) => (r.targets[8].code!.lines[0].id = "title"),
    /重複.*title/,
  ],
  [
    "存在しない参照",
    (r) => (r.changes[0].requirementIds = ["missing"]),
    /requirementIds.*missing/,
  ],
  [
    "別の版のコード",
    (r) => (r.targets[8].code!.revision = "c".repeat(40)),
    /revision/,
  ],
  ["根拠なしの事実", (r) => (r.targets[0].certainty = "fact"), /sourceIds/],
  ["コード行の欠落", (r) => (r.targets[8].code!.lines[0].number = 0), /number/],
  ["実行可能リンク", (r) => (r.sources[0].url = "javascript:alert(1)"), /url/],
  ["片方向だけの要件対応", (r) => (r.requirements[0].changeIds = []), /逆向き/],
  [
    "配置のない根拠",
    (r) => {
      r.overview.evidenceIds = [];
      r.changes[0].evidenceIds = [];
      r.requirements[0].evidenceIds = [];
    },
    /配置/,
  ],
  [
    "変更前に追加行",
    (r) => (r.targets[7].code!.lines[0].change = "added"),
    /change/,
  ],
  [
    "変更後に削除行",
    (r) => (r.targets[8].code!.lines[0].change = "removed"),
    /change/,
  ],
];
for (const [name, mutate, error] of invalidCases)
  test(name, () => {
    const r = fixture();
    mutate(r);
    assert.throws(() => validateReport(r), error);
  });

test("コメントの対象・階層・要件・版と特殊文字を正確に保持する", () => {
  const r = fixture(),
    body = '  <script>\n"引用" > 終わり  ';
  const comments = [
    { targetId: "flow", body },
    { targetId: "new-line", body: "行の指摘" },
    { targetId: "expectation", body: "要件の指摘" },
  ];
  const prompt = buildPrompt(r, comments);
  assert.equal(buildPrompt(r, comments), prompt);
  assert.ok(prompt.includes(body));
  assert.match(prompt, /全体像 > 1 画面/);
  assert.match(prompt, /src\/result.js.*L1/);
  assert.match(prompt, /AC-1/);
  assert.equal(buildPrompt(r, []), "");
  assert.equal(buildPrompt(r, [{ targetId: "flow", body: "  " }]), "");
  assert.throws(
    () => buildPrompt(r, [{ targetId: "absent", body: "指摘" }]),
    /absent/,
  );
});

test("差分入力のSHA-256と未知の版を区別し、不正な版を拒否する", () => {
  const r = fixture();
  r.revision.kind = "diff";
  r.revision.base = null;
  r.revision.head = null;
  r.revision.contentHash = "c".repeat(64);
  r.targets
    .filter((t) => t.code)
    .forEach(
      (t) =>
        (t.code!.revision = `patch:${r.revision.contentHash}:${t.code!.side}`),
    );
  assert.equal(validateReport(r), r);
  assert.match(
    buildPrompt(r, [{ targetId: "new-line", body: "指摘" }]),
    /先版未確認/,
  );
  const invalid = structuredClone(r);
  invalid.revision.base = "short";
  assert.throws(() => validateReport(invalid), /revision.base/);
});

test("未知のコード版は入力差分のハッシュと変更前後に一致する", () => {
  const r = fixture();
  r.revision.kind = "diff";
  r.revision.base = null;
  r.revision.head = null;
  r.revision.contentHash = "c".repeat(64);
  r.targets
    .filter((t) => t.code)
    .forEach((t) => {
      t.code!.revision = `patch:${r.revision.contentHash}:${t.code!.side}`;
    });
  assert.equal(validateReport(r), r);
  for (const value of [
    "不明な版",
    `patch:${"d".repeat(64)}:after`,
    `patch:${r.revision.contentHash}:before`,
  ]) {
    const invalid = structuredClone(r);
    invalid.targets[8].code!.revision = value;
    assert.throws(() => validateReport(invalid), /code.revision/);
  }
});

test("HTMLに入力を安全に埋め込み、単一ファイルで異なる内容を表示する", () => {
  const r = fixture();
  r.targets[0].text = '</script><script>globalThis.injected=1</script>&"';
  const html = renderReport(r);
  assert.ok(html.includes("\\u003c/script>"));
  assert.ok(!html.includes("<script>globalThis.injected=1</script>"));
  assert.ok(!/<(?:script|link|img)[^>]+(?:src|href)=/i.test(html));
  assert.match(html, /connect-src 'none'/);
  const changed = fixture();
  changed.targets[0].text = "別の変更";
  assert.notEqual(renderReport(changed), html);
});
