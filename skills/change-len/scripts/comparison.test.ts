import test from "node:test";
import assert from "node:assert/strict";
import { validateReport, indexTargets, buildPrompt } from "./model.ts";
import { fixture } from "./fixtures.ts";

test("レビュー識別子と前回比較の版・保存済み出典を検証する", () => {
  assert.throws(
    () => validateReport(Object.assign(fixture(), { reviewKey: "" })),
    /reviewKey/,
  );
  assert.throws(
    () =>
      validateReport(
        Object.assign(fixture(), {
          reviewComparison: {
            base: "b".repeat(40),
            head: "wrong",
            sourceId: "source",
          },
        }),
      ),
    /reviewComparison/,
  );
  assert.throws(
    () =>
      validateReport(
        Object.assign(fixture(), {
          reviewComparison: {
            base: "b".repeat(40),
            head: fixture().revision.head,
            sourceId: "absent",
          },
        }),
      ),
    /reviewComparison/,
  );
});
test("前回差分も選択対象にし、依頼文に初期baseとは別の比較元を記録する", () => {
  const r = Object.assign(fixture(), {
    reviewComparison: {
      base: "c".repeat(40),
      head: fixture().revision.head!,
      sourceId: "delta",
    },
  });
  r.sources.push({
    id: "delta",
    label: "前回からのGit差分",
    locator: "git diff c b",
    excerpt: "-return 2;\n+return 3;",
  });
  validateReport(r);
  assert.equal(
    indexTargets(r).get("review.patch")?.text,
    r.sources.at(-1)!.excerpt,
  );
  const prompt = buildPrompt(r, [
    { targetId: "review.patch", body: "前回からの指摘" },
  ]);
  assert.ok(prompt.includes("前回レビュー済み版：" + "c".repeat(40)));
  assert.ok(prompt.includes("-return 2;\n+return 3;"));
});

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createReviewTools } from "./review-state.ts";
import { prepareComparison } from "./compare.ts";

test("実Gitの前回head→現在headだけを収録し、初期baseの変更を混ぜない", () => {
  const repo = mkdtempSync(join(tmpdir(), "change-len-delta-"));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    git("config", "user.name", "test");
    git("config", "user.email", "test@example.invalid");
    const commit = (text: string) => {
      writeFileSync(join(repo, "file.txt"), text);
      git("add", "file.txt");
      git("commit", "-qm", text.trim());
      return git("rev-parse", "HEAD");
    };
    const base = commit("initial\n"),
      reviewed = commit("last reviewed\n"),
      head = commit("now\n");
    const first = fixture();
    first.reviewKey = "repo:delta";
    first.revision.base = base;
    first.revision.head = reviewed;
    for (const t of first.targets)
      if (t.code) t.code.revision = t.code.side === "before" ? base : reviewed;
    const current = structuredClone(first);
    current.revision.head = head;
    for (const t of current.targets)
      if (t.code?.side === "after") t.code.revision = head;
    const review = createReviewTools(),
      state = review.markReviewed(review.empty(), first);
    const prepared = prepareComparison(current, state, repo);
    assert.equal(prepared.revision.base, base);
    assert.equal(prepared.reviewComparison?.base, reviewed);
    assert.equal(prepared.reviewComparison?.head, head);
    const patch = prepared.sources.find(
      (s) => s.id === prepared.reviewComparison!.sourceId,
    )!.excerpt;
    assert.ok(patch.includes("-last reviewed"));
    assert.ok(patch.includes("+now"));
    assert.ok(!patch.includes("-initial"));
    writeFileSync(join(repo, "report.json"), JSON.stringify(current));
    writeFileSync(join(repo, "state.json"), JSON.stringify(state));
    const cli = fileURLToPath(new URL("./render.ts", import.meta.url)),
      output = join(repo, "review.html");
    const result = spawnSync(
      process.execPath,
      [
        cli,
        join(repo, "report.json"),
        output,
        "--review-state",
        join(repo, "state.json"),
        "--repo",
        repo,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(readFileSync(output, "utf8").includes(reviewed));
    const before = readFileSync(output, "utf8");
    state.reports[0].revision.head = "f".repeat(40);
    for (const t of state.reports[0].targets)
      if (t.code?.side === "after")
        t.code.revision = state.reports[0].revision.head;
    writeFileSync(join(repo, "state.json"), JSON.stringify(state));
    const failure = spawnSync(
      process.execPath,
      [
        cli,
        join(repo, "report.json"),
        output,
        "--review-state",
        join(repo, "state.json"),
        "--repo",
        repo,
      ],
      { encoding: "utf8" },
    );
    assert.equal(failure.status, 1);
    assert.equal(readFileSync(output, "utf8"), before);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("前回差分の予約IDとコード行IDの衝突を拒否する", () => {
  const r = Object.assign(fixture(), {
    reviewComparison: {
      base: "c".repeat(40),
      head: fixture().revision.head!,
      sourceId: "diff",
    },
  });
  r.targets[8].code!.lines[0].id = "review.patch";
  assert.throws(() => validateReport(r), /予約ID/);
});

for (const id of ["title", "diff", "c1", "AC-1", "ev1", "new-line"]) {
  test(`初回レポートでも${id}への予約IDの割当てを拒否する`, () => {
    const r = JSON.parse(JSON.stringify(fixture()), (_key, value) =>
      value === id ? "review.patch" : value,
    );
    assert.throws(() => validateReport(r), /予約ID/);
  });
}
