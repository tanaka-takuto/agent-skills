export type View = "overview" | "details" | "requirements";
export type Source = {
  id: string;
  label: string;
  locator: string;
  excerpt: string;
  url?: string;
};
export type CodeLine = {
  id: string;
  number: number;
  text: string;
  change: "added" | "removed" | "context";
};
export type Code = {
  file: string;
  side: "before" | "after";
  revision: string;
  lines: CodeLine[];
};
export type Target = {
  id: string;
  view: View;
  path: string[];
  label: string;
  text: string;
  certainty: "fact" | "inference" | "unverified";
  sourceIds: string[];
  requirementIds: string[];
  evidenceIds: string[];
  linkIds?: string[];
  code?: Code;
};
export type Change = {
  id: string;
  targetId: string;
  beforeCodeId?: string;
  afterCodeId?: string;
  requirementIds: string[];
  evidenceIds: string[];
};
export type Requirement = {
  id: string;
  targetId: string;
  expectationId: string;
  changeIds: string[];
  evidenceIds: string[];
};
export type Evidence = {
  id: string;
  targetId: string;
  status: "observed" | "unverified" | "missing";
  method: string;
  conditions: string;
  result: string;
};
export type Report = {
  schemaVersion: 1;
  reviewKey?: string;
  reviewComparison?: { base: string; head: string; sourceId: string };
  revision: {
    kind: "commit" | "range" | "diff" | "pr";
    label: string;
    base: string | null;
    head: string | null;
    contentHash?: string;
    sourceIds: string[];
  };
  sources: Source[];
  targets: Target[];
  overview: {
    titleId: string;
    purposeId: string;
    beforeId: string;
    afterId: string;
    flowIds: string[];
    questionIds: string[];
    evidenceIds: string[];
  };
  changes: Change[];
  requirements: Requirement[];
  evidence: Evidence[];
};
export type Comment = { targetId: string; body: string };
export const VIEW_NAMES: Record<View, string> = {
  overview: "全体像",
  details: "変更の詳細",
  requirements: "要件との対応",
};

export function validateReport(input: unknown): Report {
  const fail = (path: string, reason: string): never => {
    throw new Error(`${path}: ${reason}`);
  };
  const object = (v: unknown, p: string) => {
    if (!v || typeof v !== "object" || Array.isArray(v))
      fail(p, "オブジェクトが必要");
  };
  const text = (v: unknown, p: string) => {
    if (typeof v !== "string" || !v.trim()) fail(p, "空でない文字列が必要");
  };
  const array = (v: unknown, p: string): void => {
    if (!Array.isArray(v)) fail(p, "配列が必要");
  };
  const choice = (v: unknown, values: string[], p: string) => {
    if (!values.includes(v as string))
      fail(p, values.join(" / ") + " のいずれかが必要");
  };
  object(input, "report");
  const r = input as Report;
  if (r.schemaVersion !== 1) fail("schemaVersion", "対応する版は1");
  if (r.reviewKey !== undefined) text(r.reviewKey, "reviewKey");
  object(r.revision, "revision");
  choice(r.revision.kind, ["commit", "range", "diff", "pr"], "revision.kind");
  text(r.revision.label, "revision.label");
  if (r.revision.kind === "diff") {
    if (!/^[a-f0-9]{64}$/.test(r.revision.contentHash ?? ""))
      fail("revision.contentHash", "差分のSHA-256が必要");
    for (const key of ["base", "head"] as const)
      if (
        r.revision[key] !== null &&
        !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(r.revision[key] ?? "")
      )
        fail(`revision.${key}`, "解決済みコミットIDまたはnullが必要");
  } else {
    for (const key of ["base", "head"] as const)
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(r.revision[key] ?? ""))
        fail(`revision.${key}`, "解決済みコミットIDが必要");
  }
  for (const key of [
    "sources",
    "targets",
    "changes",
    "requirements",
    "evidence",
  ] as const)
    array(r[key], key);
  const allIds = new Set<string>();
  const id = (v: unknown, p: string) => {
    text(v, p);
    if (!/^[a-zA-Z0-9_.:-]+$/.test(v as string))
      fail(p, "IDは英数字と _ . : -");
    if (allIds.has(v as string)) fail(p, `重複ID ${v}`);
    allIds.add(v as string);
  };
  for (const key of [
    "sources",
    "targets",
    "changes",
    "requirements",
    "evidence",
  ] as const)
    r[key].forEach((v, i) => {
      object(v, `${key}[${i}]`);
      id(v.id, `${key}[${i}].id`);
    });
  const sets = {
    source: new Set(r.sources.map((s) => s.id)),
    target: new Set(r.targets.map((t) => t.id)),
    change: new Set(r.changes.map((c) => c.id)),
    requirement: new Set(r.requirements.map((q) => q.id)),
    evidence: new Set(r.evidence.map((e) => e.id)),
  };
  const ref = (v: unknown, set: Set<string>, p: string) => {
    text(v, p);
    if (!set.has(v as string)) fail(p, `存在しない参照 ${v}`);
  };
  const refs = (v: unknown, set: Set<string>, p: string) => {
    array(v, p);
    (v as unknown[]).forEach((x, i) => ref(x, set, `${p}[${i}]`));
    if (new Set(v as unknown[]).size !== (v as unknown[]).length)
      fail(p, "参照の重複");
  };
  refs(r.revision.sourceIds, sets.source, "revision.sourceIds");
  if (r.reviewComparison !== undefined) {
    object(r.reviewComparison, "reviewComparison");
    for (const k of ["base", "head"] as const)
      if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(r.reviewComparison[k] ?? ""))
        fail(`reviewComparison.${k}`, "解決済みコミットIDが必要");
    if (r.reviewComparison.head !== r.revision.head)
      fail("reviewComparison.head", "今回の比較先と異なる");
    ref(r.reviewComparison.sourceId, sets.source, "reviewComparison.sourceId");
  }
  if (!r.revision.sourceIds.length)
    fail("revision.sourceIds", "比較範囲の根拠が必要");
  r.sources.forEach((s, i) => {
    const p = `sources[${i}]`;
    for (const k of ["label", "locator", "excerpt"] as const)
      text(s[k], `${p}.${k}`);
    if (s.url !== undefined) {
      try {
        if (!["https:", "http:"].includes(new URL(s.url).protocol))
          fail(`${p}.url`, "http(s)だけ使用可能");
      } catch {
        fail(`${p}.url`, "http(s) URLが必要");
      }
    }
  });
  r.targets.forEach((t, i) => {
    const p = `targets[${i}]`;
    choice(t.view, Object.keys(VIEW_NAMES), `${p}.view`);
    array(t.path, `${p}.path`);
    if (t.path.length < 2) fail(`${p}.path`, "画面と対象の階層が必要");
    t.path.forEach((x, j) => text(x, `${p}.path[${j}]`));
    if (![t.view, VIEW_NAMES[t.view]].includes(t.path[0]))
      fail(`${p}.path`, "画面と階層が一致しない");
    text(t.label, `${p}.label`);
    text(t.text, `${p}.text`);
    choice(t.certainty, ["fact", "inference", "unverified"], `${p}.certainty`);
    refs(t.sourceIds, sets.source, `${p}.sourceIds`);
    refs(t.requirementIds, sets.requirement, `${p}.requirementIds`);
    refs(t.evidenceIds, sets.evidence, `${p}.evidenceIds`);
    if (t.certainty === "fact" && !t.sourceIds.length)
      fail(`${p}.sourceIds`, "事実には根拠が必要");
    if (t.linkIds !== undefined) refs(t.linkIds, sets.target, `${p}.linkIds`);
    if (t.code) {
      object(t.code, `${p}.code`);
      text(t.code.file, `${p}.code.file`);
      choice(t.code.side, ["before", "after"], `${p}.code.side`);
      text(t.code.revision, `${p}.code.revision`);
      const expected =
        t.code.side === "before" ? r.revision.base : r.revision.head;
      if (expected && t.code.revision !== expected)
        fail(`${p}.code.revision`, "比較対象の版と異なる");
      if (
        !expected &&
        t.code.revision !== `patch:${r.revision.contentHash}:${t.code.side}`
      )
        fail(
          `${p}.code.revision`,
          "版が未確認のコードは入力差分のSHA-256と前後を指定",
        );
      array(t.code.lines, `${p}.code.lines`);
      if (!t.code.lines.length) fail(`${p}.code.lines`, "行が必要");
      let previous = 0;
      t.code.lines.forEach((line, j) => {
        const lp = `${p}.code.lines[${j}]`;
        object(line, lp);
        id(line.id, `${lp}.id`);
        if (!Number.isInteger(line.number) || line.number <= previous)
          fail(`${lp}.number`, "正の行番号を昇順に指定");
        previous = line.number;
        if (typeof line.text !== "string" || /[\r\n]/.test(line.text))
          fail(`${lp}.text`, "1行の文字列が必要");
        choice(line.change, ["added", "removed", "context"], `${lp}.change`);
        if (
          (t.code!.side === "before" && line.change === "added") ||
          (t.code!.side === "after" && line.change === "removed")
        )
          fail(`${lp}.change`, "コードの前後と追加・削除が異なる");
      });
    }
  });
  object(r.overview, "overview");
  const viewRef = (v: unknown, view: View, p: string) => {
    ref(v, sets.target, p);
    if (r.targets.find((t) => t.id === v)?.view !== view)
      fail(p, "参照先の画面が異なる");
  };
  for (const k of ["titleId", "purposeId", "beforeId", "afterId"] as const)
    viewRef(r.overview[k], "overview", `overview.${k}`);
  for (const k of ["flowIds", "questionIds"] as const) {
    array(r.overview[k], `overview.${k}`);
    r.overview[k].forEach((v, i) =>
      viewRef(v, "overview", `overview.${k}[${i}]`),
    );
  }
  refs(r.overview.evidenceIds, sets.evidence, "overview.evidenceIds");
  r.changes.forEach((c, i) => {
    const p = `changes[${i}]`;
    viewRef(c.targetId, "details", `${p}.targetId`);
    for (const k of ["beforeCodeId", "afterCodeId"] as const)
      if (c[k] !== undefined) {
        viewRef(c[k], "details", `${p}.${k}`);
        const t = r.targets.find((t) => t.id === c[k])!;
        if (t.code?.side !== (k === "beforeCodeId" ? "before" : "after"))
          fail(`${p}.${k}`, "変更前後のコードが異なる");
      }
    refs(c.requirementIds, sets.requirement, `${p}.requirementIds`);
    refs(c.evidenceIds, sets.evidence, `${p}.evidenceIds`);
  });
  r.requirements.forEach((q, i) => {
    const p = `requirements[${i}]`;
    viewRef(q.targetId, "requirements", `${p}.targetId`);
    viewRef(q.expectationId, "requirements", `${p}.expectationId`);
    refs(q.changeIds, sets.change, `${p}.changeIds`);
    refs(q.evidenceIds, sets.evidence, `${p}.evidenceIds`);
  });
  r.evidence.forEach((e, i) => {
    const p = `evidence[${i}]`;
    ref(e.targetId, sets.target, `${p}.targetId`);
    choice(e.status, ["observed", "unverified", "missing"], `${p}.status`);
    for (const k of ["method", "conditions", "result"] as const)
      text(e[k], `${p}.${k}`);
    const target = r.targets.find((t) => t.id === e.targetId)!;
    if (e.status === "observed" && !target.sourceIds.length)
      fail(`${p}.targetId`, "観測済みには保存済みの証拠が必要");
    const placed =
      target.view === "overview"
        ? r.overview.evidenceIds.includes(e.id)
        : target.view === "details"
          ? r.changes.some((c) => c.evidenceIds.includes(e.id))
          : r.requirements.some((q) => q.evidenceIds.includes(e.id));
    if (!placed) fail(`${p}.targetId`, "根拠の画面に配置がない");
  });
  r.changes.forEach((c) =>
    c.requirementIds.forEach((qid) => {
      if (!r.requirements.find((q) => q.id === qid)!.changeIds.includes(c.id))
        fail(`changes.${c.id}.requirementIds`, "要件との逆向き対応がない");
    }),
  );
  r.requirements.forEach((q) =>
    q.changeIds.forEach((cid) => {
      if (!r.changes.find((c) => c.id === cid)!.requirementIds.includes(q.id))
        fail(`requirements.${q.id}.changeIds`, "変更との逆向き対応がない");
    }),
  );
  const shown = new Set([
    r.overview.titleId,
    r.overview.purposeId,
    r.overview.beforeId,
    r.overview.afterId,
    ...r.overview.flowIds,
    ...r.overview.questionIds,
    ...r.changes.flatMap((c) => [c.targetId, c.beforeCodeId, c.afterCodeId]),
    ...r.requirements.flatMap((q) => [q.targetId, q.expectationId]),
    ...r.evidence.map((e) => e.targetId),
  ]);
  r.targets.forEach((t) => {
    if (!shown.has(t.id))
      fail(`targets.${t.id}`, "画面の配置から参照されていない");
  });
  if (r.reviewComparison && allIds.has("review.patch"))
    fail("reviewComparison", "review.patch は前回差分の予約ID");
  return r;
}

export function indexTargets(r: Report): Map<string, Target> {
  const map = new Map(
    r.targets.map((t) => [
      t.id,
      { ...t, path: [VIEW_NAMES[t.view], ...t.path.slice(1)] },
    ]),
  );
  for (const c of r.changes)
    for (const id of [c.targetId, c.beforeCodeId, c.afterCodeId]) {
      if (!id) continue;
      const t = map.get(id)!;
      t.requirementIds = [
        ...new Set([...t.requirementIds, ...c.requirementIds]),
      ];
      t.evidenceIds = [...new Set([...t.evidenceIds, ...c.evidenceIds])];
    }
  for (const q of r.requirements)
    for (const id of [q.targetId, q.expectationId]) {
      const t = map.get(id)!;
      t.requirementIds = [...new Set([...t.requirementIds, q.id])];
      t.evidenceIds = [...new Set([...t.evidenceIds, ...q.evidenceIds])];
    }
  for (const t of [...map.values()])
    if (t.code)
      for (const line of t.code.lines)
        map.set(line.id, {
          ...t,
          id: line.id,
          label: `${t.code.side === "before" ? "変更前" : "変更後"} L${line.number}`,
          text: line.text,
          path: [...t.path, `L${line.number}`],
          code: { ...t.code, lines: [line] },
        });
  if (r.reviewComparison) {
    const s = r.sources.find((s) => s.id === r.reviewComparison!.sourceId)!;
    map.set("review.patch", {
      id: "review.patch",
      view: "details",
      path: [VIEW_NAMES.details, "前回レビューから", "Git差分"],
      label: "前回レビューからのGit差分",
      text: s.excerpt,
      certainty: "fact",
      sourceIds: [s.id],
      requirementIds: [],
      evidenceIds: [],
    });
  }
  return map;
}

export function buildPrompt(r: Report, comments: Comment[]): string {
  const saved = comments.filter(
    (c) => typeof c.body === "string" && c.body.trim(),
  );
  if (!saved.length) return "";
  const targets = indexTargets(r);
  const revision = `${r.revision.label}\n比較元：${r.revision.base ?? "差分入力・元版未確認"}\n比較先：${r.revision.head ?? "差分入力・先版未確認"}${r.revision.contentHash ? "\n差分SHA-256：" + r.revision.contentHash : ""}${r.reviewComparison ? "\n前回レビュー済み版：" + r.reviewComparison.base + "\n前回からの比較先：" + r.reviewComparison.head : ""}`;
  return (
    `次のレビューコメントに沿って変更を見直してください。対象版と根拠を照合し、不明な意図は確認してください。\n対象版：${revision}\n\n` +
    saved
      .map((c, i) => {
        const t = targets.get(c.targetId);
        if (!t) throw new Error(`存在しないコメント対象 ${c.targetId}`);
        const code = t.code
          ? `\nコード：${t.code.file} / ${t.code.side === "before" ? "変更前" : "変更後"} / 版 ${t.code.revision} / L${t.code.lines[0].number}–L${t.code.lines.at(-1)!.number}\n${t.code.lines.map((l) => `${l.number}: ${l.text}`).join("\n")}`
          : "";
        const requirements = t.requirementIds.map((id) => {
          const q = r.requirements.find((q) => q.id === id)!;
          return `${id}: ${targets.get(q.expectationId)!.text}`;
        });
        const sources = t.sourceIds.map((id) => {
          const s = r.sources.find((s) => s.id === id)!;
          return `${s.label}: ${s.locator}${s.url ? " / " + s.url : ""}`;
        });
        const evidence = t.evidenceIds.map((id) => {
          const e = r.evidence.find((e) => e.id === id)!;
          return `${id} / ${e.status}: ${e.method} / ${e.conditions} / ${e.result}`;
        });
        return `${i + 1}. 対象：${t.path.join(" > ")}\n対象ID：${t.id}\n対象の説明：${t.text}\n確かさ：${t.certainty}${code}${requirements.length ? "\n要件：" + requirements.join("\n") : ""}${sources.length ? "\n出典：" + sources.join("\n") : ""}${evidence.length ? "\n確認根拠：" + evidence.join("\n") : ""}\nコメント：${c.body}`;
      })
      .join("\n\n")
  );
}
