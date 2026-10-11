import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./fixtures.ts";
import { createReviewTools } from "./review-state.ts";
import type { Report } from "./model.ts";
const review = createReviewTools();
const next = (r: Report) => {
  const changed = structuredClone(r);
  changed.revision.head = "c".repeat(40);
  changed.targets
    .filter((t) => t.code?.side === "after")
    .forEach((t) => (t.code!.revision = changed.revision.head!));
  return changed;
};

test("保存・復元は元の版と対象を保持し、レビュー済み版は明示操作だけで変わる", () => {
  const r = fixture();
  let state = review.save(
    review.empty(),
    r,
    "new-line",
    '改行\n< > "',
    "comment.1",
  );
  assert.equal(state.reviewed, undefined);
  state = review.markReviewed(state, r);
  const restored = review.validate(JSON.parse(JSON.stringify(state)));
  assert.equal(
    restored.reports[restored.comments[0].origin.snapshot].revision.head,
    r.revision.head,
  );
  assert.equal(restored.comments[0].origin.targetId, "new-line");
  assert.equal(restored.comments[0].body, '改行\n< > "');
  const changed = next(r);
  const saved = review.save(restored, changed, "flow", "次の版", "comment.2");
  assert.ok(saved.reviewed);
  assert.ok(restored.reviewed);
  assert.equal(saved.reviewed.snapshot, restored.reviewed.snapshot);
});

test("同じ対象の変更・移動・削除を確認待ちにし、同名の別IDへ付け替えない", () => {
  const r = fixture();
  const state = review.save(
    review.empty(),
    r,
    "new-line",
    "元の指摘",
    "comment.1",
  );
  const changed = next(r);
  changed.targets[8].code!.lines[0].text = "return 3;";
  assert.equal(review.resolve(state, changed)[0].status, "changed");
  const moved = next(r);
  moved.targets[8].code!.file = "src/moved.js";
  assert.equal(review.resolve(state, moved)[0].status, "moved");
  const removed = next(r);
  removed.targets[8].code!.lines[0].id = "different-line";
  assert.equal(review.resolve(state, removed)[0].status, "missing");
  const request = review.buildRequest(state, removed);
  assert.ok(request.includes("new-line"));
  assert.ok(request.includes(r.revision.head!));
  assert.ok(request.includes("return 2;"));
  assert.ok(request.includes("引継ぎ確認待ち"));
  assert.ok(!request.includes("対象ID：different-line"));
});

test("変更を明示確認して引き継いでも最初の版・内容を失わない", () => {
  const r = fixture();
  const state = review.save(
    review.empty(),
    r,
    "new-line",
    "元の指摘",
    "comment.1",
  );
  const changed = next(r);
  changed.targets[8].code!.lines[0].text = "return 3;";
  const confirmed = review.confirm(state, "comment.1", changed);
  assert.equal(review.resolve(confirmed, changed)[0].status, "current");
  assert.equal(
    confirmed.comments[0].origin.snapshot,
    state.comments[0].origin.snapshot,
  );
  assert.ok(review.buildRequest(confirmed, changed).includes("return 2;"));
  assert.ok(review.buildRequest(confirmed, changed).includes("return 3;"));
});

test("不正な復元データと既存本文の上書きを拒否し、元の状態を変えない", () => {
  const r = fixture();
  const state = review.save(review.empty(), r, "flow", "保存済み", "comment.1");
  const baseline = JSON.stringify(state);
  const broken = structuredClone(state);
  broken.comments[0].origin.targetId = "absent";
  assert.throws(() => review.validate(broken), /origin|対象/);
  const collision = review.save(
    review.empty(),
    r,
    "flow",
    "別の本文",
    "comment.1",
  );
  assert.throws(() => review.merge(state, collision), /衝突|競合/);
  assert.equal(JSON.stringify(state), baseline);
  assert.throws(() => review.validate({ version: 99 }), /version|版/);
});

test("前回の比較は初期baseではなく明示レビュー済みのsnapshotを使う", () => {
  const r = fixture();
  const state = review.markReviewed(review.empty(), r);
  const changed = next(r);
  changed.targets[8].code!.lines[0].text = "return 3;";
  const difference = review.difference(state, changed);
  assert.ok(difference);
  assert.equal(difference.base, r.revision.head);
  assert.equal(difference.head, changed.revision.head);
  assert.ok(difference.changedIds.includes("new-line"));
  assert.ok(!difference.changedIds.includes("flow"));
  assert.equal(review.difference(review.empty(), changed), null);
});

test("レビュー識別子が一致する再生成版だけで同じID・内容のコメントを自動引継ぎする", () => {
  const r = Object.assign(fixture(), { reviewKey: "repo:/sample/review:42" });
  const state = review.save(review.empty(), r, "flow", "引継ぎ", "comment.1");
  assert.equal(review.resolve(state, next(r))[0].status, "current");
  const unknown = fixture();
  const unscoped = review.save(
    review.empty(),
    unknown,
    "flow",
    "保留",
    "comment.2",
  );
  assert.equal(review.resolve(unscoped, next(unknown))[0].status, "unverified");
  const other = Object.assign(next(r), { reviewKey: "repo:/other/review:42" });
  assert.throws(
    () => review.save(state, other, "flow", "別リポジトリ", "comment.3"),
    /異なる/,
  );
});

test("異なるIDで同じ保存対象へ復元したコメントも黙って重ねない", () => {
  const r = fixture();
  const a = review.save(review.empty(), r, "flow", "最初", "comment.1"),
    b = review.save(review.empty(), r, "flow", "別の記録", "comment.2");
  assert.throws(() => review.merge(a, b), /衝突|競合/);
});

test("別版で同じ対象へ追加された記録の復元も競合として扱う", () => {
  const r = Object.assign(fixture(), { reviewKey: "sample:cross-version" }),
    n = next(r);
  const a = review.save(review.empty(), r, "flow", "前の版の指摘", "comment.1"),
    b = review.save(review.empty(), n, "flow", "別の版の指摘", "comment.2");
  assert.throws(() => review.merge(a, b), /衝突|競合/);
});
