import { validateReport, indexTargets, buildPrompt } from "./model.ts";
import type { Report, Target } from "./model.ts";
export type Anchor = { snapshot: number; targetId: string };
export type SavedComment = {
  id: string;
  body: string;
  origin: Anchor;
  binding: Anchor;
};
export type ReviewState = {
  version: 1;
  reports: Report[];
  comments: SavedComment[];
  reviewed?: { snapshot: number };
};
export type ResolvedComment = {
  comment: SavedComment;
  status: "current" | "changed" | "moved" | "missing" | "unverified";
  original: Target;
  previous: Target;
  current?: Target;
};

// This factory is embedded verbatim in the offline HTML; use only the shared model functions.
export function createReviewTools() {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
  const canonical = (value: unknown): string =>
    JSON.stringify(value, (_key, v) =>
      v && typeof v === "object" && !Array.isArray(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, v[k]]),
          )
        : v,
    );
  const key = (r: Report) => (r as Report & { reviewKey?: string }).reviewKey;
  const semantic = (t: Target) =>
    canonical({
      ...t,
      code: t.code ? { ...t.code, revision: undefined } : undefined,
    });
  const location = (t: Target) =>
    canonical([
      t.view,
      t.path,
      t.code?.file,
      t.code?.side,
      t.code?.lines.map((l) => l.number),
    ]);
  const empty = (): ReviewState => ({ version: 1, reports: [], comments: [] });
  const validate = (input: unknown): ReviewState => {
    const s = input as ReviewState;
    if (!s || s.version !== 1)
      throw new Error("レビュー記録の version は1が必要");
    if (!Array.isArray(s.reports) || !Array.isArray(s.comments))
      throw new Error("レビュー記録の配列が必要");
    const maps = s.reports.map((r) => indexTargets(validateReport(r)));
    const keys = new Set(s.reports.map(key).filter(Boolean));
    if (keys.size > 1)
      throw new Error("異なるレビューの記録を混在させられません");
    const anchor = (a: Anchor | undefined, name: string) => {
      if (
        !a ||
        !Number.isInteger(a.snapshot) ||
        a.snapshot < 0 ||
        !maps[a.snapshot]?.has(a.targetId)
      )
        throw new Error(`${name}: 版と対象が存在しません`);
    };
    const ids = new Set<string>();
    for (const c of s.comments) {
      if (
        !c ||
        typeof c.id !== "string" ||
        !/^[a-zA-Z0-9_.:-]+$/.test(c.id) ||
        ids.has(c.id)
      )
        throw new Error("コメントIDの衝突または不正なID");
      ids.add(c.id);
      if (typeof c.body !== "string" || !c.body.trim())
        throw new Error("コメント本文が必要");
      anchor(c.origin, "origin");
      anchor(c.binding, "binding");
    }
    if (
      s.reviewed &&
      (!Number.isInteger(s.reviewed.snapshot) ||
        !s.reports[s.reviewed.snapshot])
    )
      throw new Error("レビュー済み版が存在しません");
    return clone(s);
  };
  const snapshot = (s: ReviewState, r: Report) => {
    validateReport(r);
    if (s.reports.some((p) => key(p) && key(r) && key(p) !== key(r)))
      throw new Error("異なるレビューの記録です");
    const found = s.reports.findIndex((p) => canonical(p) === canonical(r));
    if (found >= 0) return found;
    s.reports.push(clone(r));
    return s.reports.length - 1;
  };
  const resolve = (s: ReviewState, r: Report): ResolvedComment[] => {
    const current = indexTargets(r);
    return s.comments.map((comment) => {
      const bound = s.reports[comment.binding.snapshot];
      const previous = indexTargets(bound).get(comment.binding.targetId)!;
      const original = indexTargets(s.reports[comment.origin.snapshot]).get(
        comment.origin.targetId,
      )!;
      const candidate = current.get(comment.binding.targetId);
      let status: ResolvedComment["status"] = "current";
      if (!candidate) status = "missing";
      else if (location(previous) !== location(candidate)) status = "moved";
      else if (semantic(previous) !== semantic(candidate)) status = "changed";
      else if (
        canonical(bound) !== canonical(r) &&
        (!key(bound) || key(bound) !== key(r))
      )
        status = "unverified";
      return { comment, status, original, previous, current: candidate };
    });
  };
  const save = (
    input: ReviewState,
    r: Report,
    targetId: string,
    body: string,
    id: string,
  ) => {
    const s = validate(input);
    if (!indexTargets(r).has(targetId))
      throw new Error("存在しないコメント対象");
    if (!body.trim()) throw new Error("コメント本文が必要");
    const existing = resolve(s, r).find(
      (c) => c.status === "current" && c.current?.id === targetId,
    )?.comment;
    const at = snapshot(s, r);
    if (existing) {
      existing.body = body;
      existing.binding = { snapshot: at, targetId };
    } else {
      if (s.comments.some((c) => c.id === id))
        throw new Error("コメントIDの衝突");
      s.comments.push({
        id,
        body,
        origin: { snapshot: at, targetId },
        binding: { snapshot: at, targetId },
      });
    }
    return validate(s);
  };
  const markReviewed = (input: ReviewState, r: Report) => {
    const s = validate(input);
    s.reviewed = { snapshot: snapshot(s, r) };
    return s;
  };
  const confirm = (input: ReviewState, id: string, r: Report) => {
    const s = validate(input),
      c = s.comments.find((c) => c.id === id);
    if (!c || !indexTargets(r).has(c.binding.targetId))
      throw new Error("引継ぎ先の対象がありません");
    if (
      resolve(s, r).some(
        (x) =>
          x.comment.id !== id &&
          x.status === "current" &&
          x.current?.id === c.binding.targetId,
      )
    )
      throw new Error("引継ぎ先コメントの競合");
    c.binding = { snapshot: snapshot(s, r), targetId: c.binding.targetId };
    return s;
  };
  const remove = (input: ReviewState, id: string) => {
    const s = validate(input);
    s.comments = s.comments.filter((c) => c.id !== id);
    return s;
  };
  const buildRequest = (s: ReviewState, r: Report) => {
    const resolved = resolve(s, r);
    const active = resolved.filter((c) => c.status === "current");
    const chunks = [
      buildPrompt(
        r,
        active.map((c) => ({ targetId: c.current!.id, body: c.comment.body })),
      ),
    ].filter(Boolean);
    for (const item of resolved) {
      const c = item.comment,
        origin = s.reports[c.origin.snapshot];
      if (item.status !== "current") {
        chunks.push(
          `引継ぎ確認待ち（${{ changed: "内容変更", moved: "位置変更", missing: "対象削除・未収録", unverified: "対象版の一致未確認" }[item.status]}）。現在版の対象へ自動で付け替えず、元の版と対象を照合してください。\n` +
            buildPrompt(s.reports[c.binding.snapshot], [
              { targetId: c.binding.targetId, body: c.body },
            ]),
        );
      }
      if (
        canonical(origin) !== canonical(r) &&
        (item.status === "current" || c.origin.snapshot !== c.binding.snapshot)
      )
        chunks.push(
          "最初にコメントした版・対象（保存記録）：\n" +
            buildPrompt(origin, [
              { targetId: c.origin.targetId, body: c.body },
            ]),
        );
    }
    return chunks.join("\n\n");
  };
  const merge = (left: ReviewState, right: unknown) => {
    const s = validate(left),
      incoming = validate(right);
    const remap = incoming.reports.map((r) => snapshot(s, r));
    for (const c of incoming.comments) {
      const mapped = {
        ...c,
        origin: { ...c.origin, snapshot: remap[c.origin.snapshot] },
        binding: { ...c.binding, snapshot: remap[c.binding.snapshot] },
      };
      const existing = s.comments.find((x) => x.id === c.id);
      if (existing && canonical(existing) !== canonical(mapped))
        throw new Error(`コメント ${c.id} の衝突。既存記録は変更していません`);
      if (!existing) s.comments.push(mapped);
    }
    if (incoming.reviewed) {
      const at = remap[incoming.reviewed.snapshot];
      if (s.reviewed && s.reviewed.snapshot !== at)
        throw new Error("レビュー済み版の競合。既存記録は変更していません");
      s.reviewed = { snapshot: at };
    }
    return s;
  };
  const storageKey = (r: Report) =>
    "change-len:review:v1:" + (key(r) ?? canonical(r.revision));
  const difference = (s: ReviewState, r: Report) => {
    if (!s.reviewed) return null;
    const previous = s.reports[s.reviewed.snapshot],
      old = indexTargets(previous),
      current = indexTargets(r);
    return {
      base: previous.revision.head,
      head: r.revision.head,
      changedIds: [...current.values()]
        .filter(
          (t) => !old.has(t.id) || semantic(t) !== semantic(old.get(t.id)!),
        )
        .map((t) => t.id),
      removed: [...old.values()].filter((t) => !current.has(t.id)),
    };
  };
  return {
    empty,
    validate,
    save,
    resolve,
    markReviewed,
    confirm,
    remove,
    buildRequest,
    merge,
    storageKey,
    difference,
  };
}
