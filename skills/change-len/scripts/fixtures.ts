import type { Report, Target, View } from "./model.ts";
export function fixture(): Report {
  const base = "a".repeat(40),
    head = "b".repeat(40);
  const target = (
    id: string,
    view: View,
    label: string,
    text: string,
    extra: Partial<Target> = {},
  ): Target => ({
    id,
    view,
    path: [view, label],
    label,
    text,
    certainty: "inference",
    sourceIds: [],
    requirementIds: [],
    evidenceIds: [],
    ...extra,
  });
  return {
    schemaVersion: 1,
    revision: {
      kind: "commit",
      label: "テスト用変更",
      base,
      head,
      sourceIds: ["diff"],
    },
    sources: [
      {
        id: "diff",
        label: "元の差分",
        locator: "git diff a..b",
        excerpt: "+return 2;",
      },
      {
        id: "spec",
        label: "完了条件",
        locator: "spec.md:1",
        excerpt: "結果を2にする",
      },
    ],
    targets: [
      target("title", "overview", "今回の変更", "結果を2にする"),
      target("purpose", "overview", "目的", "利用者が新しい結果を得る"),
      target("before", "overview", "変更前", "結果は1"),
      target("after", "overview", "変更後", "結果は2"),
      target("flow", "overview", "1 画面", "結果の生成", {
        sourceIds: ["diff"],
        certainty: "fact",
      }),
      target("question", "overview", "論点", "他の経路は未確認", {
        certainty: "unverified",
      }),
      target("change", "details", "結果の生成", "戻り値を変更", {
        sourceIds: ["diff"],
        certainty: "fact",
      }),
      target("old-code", "details", "変更前", "return 1;", {
        sourceIds: ["diff"],
        certainty: "fact",
        code: {
          file: "src/result.js",
          side: "before",
          revision: base,
          lines: [
            { id: "old-line", number: 1, text: "return 1;", change: "removed" },
          ],
        },
      }),
      target("new-code", "details", "変更後", "return 2;", {
        sourceIds: ["diff"],
        certainty: "fact",
        code: {
          file: "src/result.js",
          side: "after",
          revision: head,
          lines: [
            { id: "new-line", number: 1, text: "return 2;", change: "added" },
          ],
        },
      }),
      target("requirement", "requirements", "AC-1", "結果を2にする", {
        sourceIds: ["spec"],
        certainty: "fact",
      }),
      target("expectation", "requirements", "期待結果", "呼び出すと2が返る", {
        sourceIds: ["spec"],
        certainty: "fact",
      }),
      target("evidence", "requirements", "確認根拠", "返り値を確認", {
        certainty: "unverified",
      }),
    ],
    overview: {
      titleId: "title",
      purposeId: "purpose",
      beforeId: "before",
      afterId: "after",
      flowIds: ["flow"],
      questionIds: ["question"],
      evidenceIds: ["ev1"],
    },
    changes: [
      {
        id: "c1",
        targetId: "change",
        beforeCodeId: "old-code",
        afterCodeId: "new-code",
        requirementIds: ["AC-1"],
        evidenceIds: ["ev1"],
      },
    ],
    requirements: [
      {
        id: "AC-1",
        targetId: "requirement",
        expectationId: "expectation",
        changeIds: ["c1"],
        evidenceIds: ["ev1"],
      },
    ],
    evidence: [
      {
        id: "ev1",
        targetId: "evidence",
        status: "unverified",
        method: "関数呼び出し",
        conditions: "隔離環境",
        result: "未実施",
      },
    ],
  };
}
