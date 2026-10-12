import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM, VirtualConsole } from "jsdom";
import { renderReport } from "./render.ts";
import { fixture } from "./fixtures.ts";
import type { Report } from "./model.ts";
import { createReviewTools } from "./review-state.ts";
import type { ReviewState } from "./review-state.ts";
const review = createReviewTools();
function page(
  r: Report,
  state?: ReviewState,
  storage = new Map<string, string>(),
  blocked = false,
) {
  const errors: Error[] = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e));
  const dom = new JSDOM(renderReport(r, state), {
    runScripts: "dangerously",
    url: "file:///review.html",
    virtualConsole: vc,
    beforeParse(w) {
      Object.defineProperty(w, "localStorage", {
        value: {
          getItem: (k: string) => {
            if (blocked) throw Error("denied");
            return storage.get(k) ?? null;
          },
          setItem: (k: string, v: string) => {
            if (blocked) throw Error("quota");
            storage.set(k, v);
          },
        },
      });
    },
  });
  assert.deepEqual(errors, []);
  return dom;
}
function click(d: JSDOM, selector: string) {
  const n = d.window.document.querySelector<HTMLElement>(selector);
  assert.ok(n, selector);
  n.click();
}
function save(d: JSDOM, id: string, body: string) {
  click(d, `[data-target="${id}"]`);
  d.window.document.querySelector<HTMLTextAreaElement>("#comment-body")!.value =
    body;
  click(d, "[data-save]");
}
function exported(d: JSDOM): ReviewState {
  click(d, "[data-records]");
  return review.validate(
    JSON.parse(
      d.window.document.querySelector<HTMLTextAreaElement>("#review-export")!
        .value,
    ),
  );
}
function next(r: Report) {
  const n = structuredClone(r);
  n.revision.head = "c".repeat(40);
  for (const t of n.targets)
    if (t.code?.side === "after") t.code.revision = n.revision.head;
  return n;
}

test("自動保存した特殊文字コメントと明示レビュー済み版が再読み込みで復元される", () => {
  const r = Object.assign(fixture(), { reviewKey: "sample:42" }),
    storage = new Map<string, string>();
  let d = page(r, undefined, storage);
  assert.equal(
    (d.window.document.querySelector("[data-previous]") as HTMLButtonElement)
      .disabled,
    true,
  );
  save(d, "flow", '< > "\n保存する');
  assert.equal(exported(d).reviewed, undefined);
  click(d, "[data-close-records]");
  click(d, "[data-reviewed]");
  d.window.close();
  d = page(r, undefined, storage);
  assert.match(
    d.window.document.querySelector('[data-target="flow"] .annotation')!
      .textContent!,
    /保存する/,
  );
  assert.equal(exported(d).reports[0].revision.head, r.revision.head);
  assert.ok(exported(d).reviewed);
  d.window.close();
});
test("JSONの保存・復元は既存本文を保ち、不正JSONを拒否する", () => {
  const r = Object.assign(fixture(), { reviewKey: "sample:restore" });
  const a = page(r);
  save(a, "flow", "保存済み\n< >");
  const json = JSON.stringify(exported(a));
  a.window.close();
  const d = page(r);
  click(d, "[data-records]");
  const field =
    d.window.document.querySelector<HTMLTextAreaElement>("#review-import")!;
  field.value = json;
  click(d, "[data-restore]");
  assert.equal(
    d.window.document.querySelector("#comment-count")!.textContent,
    "1",
  );
  field.value = '{"version":99}';
  click(d, "[data-restore]");
  assert.match(
    d.window.document.querySelector("#record-status")!.textContent!,
    /version|版/,
  );
  assert.equal(exported(d).comments[0].body, "保存済み\n< >");
  d.window.close();
});
test("変更・削除コメントは確認待ちで保持し、明示引継ぎ後の依頼文も元のコードを保持する", async () => {
  const r = Object.assign(fixture(), { reviewKey: "sample:carry" });
  let state = review.save(
    review.empty(),
    r,
    "new-line",
    "元の指摘",
    "comment.1",
  );
  state = review.save(state, r, "flow", "削除された対象", "comment.2");
  const n = next(r);
  n.targets[8].code!.lines[0].text = "return 3;";
  n.overview.flowIds = [];
  n.targets = n.targets.filter((t) => t.id !== "flow");
  const d = page(n, state);
  assert.equal(
    d.window.document.querySelector('[data-target="new-line"] .annotation'),
    null,
  );
  click(d, "[data-records]");
  assert.match(
    d.window.document.querySelector("#pending-comments")!.textContent!,
    /内容変更/,
  );
  assert.match(
    d.window.document.querySelector("#pending-comments")!.textContent!,
    /対象削除/,
  );
  click(d, '[data-confirm="comment.1"]');
  assert.equal(exported(d).comments[0].origin.snapshot, 0);
  click(d, "[data-close-records]");
  click(d, "[data-copy]");
  await new Promise((r) => setTimeout(r, 0));
  const prompt =
    d.window.document.querySelector<HTMLTextAreaElement>(
      "#prompt-output",
    )!.value;
  assert.ok(prompt.includes("return 2;"));
  assert.ok(prompt.includes("return 3;"));
  assert.ok(prompt.includes("削除された対象"));
  assert.ok(prompt.includes("引継ぎ確認待ち"));
  d.window.close();
});
test("自動保存が拒否されてもJSON全文の取得とコメント削除ができる", () => {
  const r = fixture(),
    d = page(r, undefined, undefined, true);
  save(d, "flow", "残す");
  assert.match(
    d.window.document.querySelector("#status")!.textContent!,
    /JSON/,
  );
  assert.equal(exported(d).comments.length, 1);
  click(d, "[data-close-records]");
  click(d, '[data-target="flow"]');
  click(d, "[data-delete]");
  assert.equal(exported(d).comments.length, 0);
  d.window.close();
});
test("前回比較は実Git差分を表示し、初期比較のコードと区別できる", () => {
  const r = Object.assign(fixture(), { reviewKey: "sample:delta" }),
    state = review.markReviewed(review.empty(), r),
    n = next(r);
  n.targets[8].code!.lines[0].text = "return 3;";
  n.reviewComparison = {
    base: r.revision.head!,
    head: n.revision.head!,
    sourceId: "delta",
  };
  n.sources.push({
    id: "delta",
    label: "前回差分",
    locator: "git diff",
    excerpt: "-return 2;\n+return 3;",
  });
  const d = page(n, state);
  click(d, "[data-previous]");
  assert.match(
    d.window.document.querySelector("#review-comparison")!.textContent!,
    /前回レビュー/,
  );
  assert.ok(
    d.window.document
      .querySelector("#review-comparison")!
      .textContent!.includes(r.revision.head!),
  );
  assert.equal(
    d.window.document.querySelector<HTMLElement>(".change .code-comparison")!
      .hidden,
    true,
  );
  save(d, "review.patch", "前回からの指摘");
  click(d, "[data-all-changes]");
  assert.equal(
    d.window.document.querySelector<HTMLElement>(".change .code-comparison")!
      .hidden,
    false,
  );
  d.window.close();
});

test("前回差分を見たまま現在版をレビュー済みにすると比較元と表示も更新される", () => {
  const r = Object.assign(fixture(), { reviewKey: "sample:remark" }),
    state = review.markReviewed(review.empty(), r),
    n = next(r);
  n.reviewComparison = {
    base: r.revision.head!,
    head: n.revision.head!,
    sourceId: "delta",
  };
  n.sources.push({
    id: "delta",
    label: "前回差分",
    locator: "git diff",
    excerpt: "-old\n+new",
  });
  const d = page(n, state);
  click(d, "[data-previous]");
  click(d, "[data-reviewed]");
  assert.match(
    d.window.document.querySelector("#review-comparison")!.textContent!,
    /同じです/,
  );
  assert.ok(
    !d.window.document
      .querySelector("#review-comparison")!
      .textContent!.includes("-old"),
  );
  d.window.close();
});

test("確認結果だけが更新された要件と変更を前回比較に残し、コメントを確認待ちにする", () => {
  const r = Object.assign(fixture(), { reviewKey: "sample:evidence-update" });
  const state = review.markReviewed(
    review.save(
      review.empty(),
      r,
      "evidence",
      "確認結果を残してください",
      "comment.1",
    ),
    r,
  );
  const n = next(r);
  n.evidence[0].status = "missing";
  n.evidence[0].result = "確認を実施したが証拠の記録がない";
  n.reviewComparison = {
    base: r.revision.head!,
    head: n.revision.head!,
    sourceId: "diff",
  };
  const d = page(n, state);
  try {
    click(d, "[data-previous]");
    assert.equal(
      d.window.document.querySelector<HTMLElement>('[data-requirement="AC-1"]')!
        .hidden,
      false,
    );
    assert.equal(
      d.window.document.querySelector<HTMLElement>('[data-change="c1"]')!
        .hidden,
      false,
    );
    assert.match(
      d.window.document.querySelector("#pending-count")!.textContent!,
      /1/,
    );
    click(d, "[data-records]");
    assert.match(
      d.window.document.querySelector("#pending-comments")!.textContent!,
      /内容変更/,
    );
  } finally {
    d.window.close();
  }
});
