import { execFileSync } from "node:child_process";
import { validateReport } from "./model.ts";
import type { Report } from "./model.ts";
import { createReviewTools } from "./review-state.ts";
import type { ReviewState } from "./review-state.ts";

export function prepareComparison(
  input: Report,
  saved: ReviewState,
  repo: string,
): Report {
  const r: Report = JSON.parse(JSON.stringify(validateReport(input)));
  const review = createReviewTools(),
    state = review.validate(saved);
  if (!state.reviewed)
    throw new Error("JSONに明示レビュー済みの版がありません");
  const previous = state.reports[state.reviewed.snapshot];
  if (!r.reviewKey || r.reviewKey !== previous.reviewKey)
    throw new Error("前回と今回で同じ reviewKey が必要です");
  const base = previous.revision.head,
    head = r.revision.head;
  if (!base || !head)
    throw new Error("前回比較には解決済みコミットIDが必要です");
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "core.quotePath=false", ...args], {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    for (const revision of [base, head])
      if (
        git("rev-parse", "--verify", `${revision}^{commit}`).trim() !== revision
      )
        throw new Error("版が一致しません");
    const patch = git(
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--find-renames",
      "--unified=3",
      base,
      head,
      "--",
    );
    let id = "review.delta";
    const ids = new Set(
      [
        ...r.sources,
        ...r.targets,
        ...r.changes,
        ...r.requirements,
        ...r.evidence,
      ].map((x) => x.id),
    );
    for (const t of r.targets)
      for (const l of t.code?.lines ?? []) ids.add(l.id);
    while (ids.has(id)) id += ".1";
    r.sources.push({
      id,
      label: "前回レビューからのGit差分",
      locator: `git diff --no-ext-diff --no-textconv --find-renames --unified=3 ${base} ${head} --`,
      excerpt: patch || "前回レビュー済み版からのGit差分はありません。",
    });
    r.reviewComparison = { base, head, sourceId: id };
    return validateReport(r);
  } catch (error) {
    throw new Error(
      "前回レビュー済み版からのGit比較に失敗しました。対象リポジトリとコミットの取得状態を確認してください。\n" +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
