import type { Report, Target, View } from "../scripts/model.ts";
import type { ReviewState } from "../scripts/review-state.ts";
declare const VIEW_NAMES: Record<View, string>;
declare const indexTargets: typeof import("../scripts/model.ts").indexTargets;
declare const buildPrompt: typeof import("../scripts/model.ts").buildPrompt;
declare const createReviewTools: typeof import("../scripts/review-state.ts").createReviewTools;

(() => {
  const report: Report = JSON.parse(
    document.getElementById("report-data")!.textContent!,
  );
  const targets = indexTargets(report);
  const comments = new Map<string, string>();
  const review = createReviewTools();
  let state: ReviewState = review.validate(
    JSON.parse(document.getElementById("review-state-data")!.textContent!),
  );
  let comparisonMode = false;
  let selected: string | undefined;
  let focusBeforeDialog: HTMLElement | null = null;
  const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
    document.querySelector<T>(selector)!;
  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    cls?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  }
  const status = (message: string) => {
    $("#status").textContent = message;
  };
  function assertScope(s: ReviewState): void {
    if (
      s.reports.some(
        (r) =>
          r.reviewKey && report.reviewKey && r.reviewKey !== report.reviewKey,
      )
    )
      throw new Error("異なるレビューの保存記録です。");
  }
  function loadState(): void {
    try {
      const saved = localStorage.getItem(review.storageKey(report));
      if (saved) {
        const local = review.validate(JSON.parse(saved));
        assertScope(local);
        state = local;
      }
    } catch {
      status(
        "自動保存の読込を利用できません。必要な記録は JSON から復元してください。",
      );
    }
  }
  function persist(message: string): void {
    try {
      localStorage.setItem(review.storageKey(report), JSON.stringify(state));
      status(message + " 自動保存しました。");
    } catch {
      status(
        message +
          " 自動保存を利用できません。ページを閉じる前に JSON を保存してください。",
      );
    }
    refreshAnnotations();
    refreshReview();
  }
  const btn = (label: string, data: string, value: string = "") => {
    const b = el("button", label);
    b.dataset[data] = value;
    return b;
  };
  const certainty = { fact: "事実", inference: "推論", unverified: "未確認" };
  const path = (t: Target) => t.path.join(" > ");
  function annotate(t: Target, node: HTMLElement): HTMLElement {
    node.dataset.target = t.id;
    node.tabIndex = 0;
    node.classList.add("target");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", `${t.label}: コメントする`);
    return node;
  }
  function target(
    id: string,
    tag: "h1" | "h2" | "h3" | "p" = "p",
  ): HTMLElement {
    const t = targets.get(id)!;
    const block = annotate(t, el("div", undefined, "target-block"));
    block.append(
      el(tag, t.text),
      el("small", certainty[t.certainty], "certainty"),
    );
    return block;
  }
  function jump(id: string, label?: string): HTMLButtonElement {
    return btn(label ?? targets.get(id)!.label + " ↗", "jump", id);
  }
  function sources(ids: string[]): HTMLElement {
    const row = el("div", undefined, "source-links");
    for (const id of ids)
      row.append(
        btn(
          report.sources.find((s) => s.id === id)!.label + " ↗",
          "source",
          id,
        ),
      );
    return row;
  }
  function references(t: Target): HTMLElement {
    const row = el("div", undefined, "references");
    row.append(sources(t.sourceIds));
    for (const id of t.linkIds ?? [])
      row.append(jump(id, "コード・関連箇所を見る ↗"));
    return row;
  }
  function evidence(ids: string[], view: View): HTMLElement {
    const list = el("div", undefined, "evidence");
    if (!ids.length) {
      list.append(el("p", "確認根拠は未記録", "muted"));
      return list;
    }
    for (const id of ids) {
      const e = report.evidence.find((e) => e.id === id)!;
      const disclosure = el("details");
      const summary = el(
        "summary",
        "実装者の確認根拠を見る — " + targets.get(e.targetId)!.label,
      );
      const t = targets.get(e.targetId)!;
      disclosure.append(
        summary,
        t.view === view ? target(e.targetId) : el("p", t.text),
        el(
          "p",
          `状態：${{ observed: "観測済み", unverified: "未実施・未確認", missing: "証拠なし" }[e.status]}`,
        ),
        el("p", "確認方法：" + e.method),
        el("p", "条件：" + e.conditions),
        el("p", "観測結果：" + e.result),
        references(t),
      );
      if (t.view !== view)
        disclosure.append(jump(e.targetId, "この確認根拠にコメントする ↗"));
      disclosure.append(
        el(
          "small",
          "確認結果は記録された条件に限ります。試験の成功だけで要件全体の達成とは判定しません。",
          "muted",
        ),
      );
      list.append(disclosure);
    }
    return list;
  }
  function code(id: string): HTMLElement {
    const t = targets.get(id)!,
      c = t.code!;
    const side = c.side === "before" ? "変更前" : "変更後";
    const block = el("section", undefined, "code-panel " + c.side);
    const heading = annotate(t, el("div", undefined, "code-heading"));
    heading.append(
      el("h3", side),
      el("p", c.file),
      el("small", "版 " + c.revision),
    );
    block.append(heading);
    const lines = el("div", undefined, "code-lines");
    for (const line of c.lines) {
      const row = annotate(
        targets.get(line.id)!,
        el("div", undefined, "code-line " + line.change),
      );
      row.append(
        el("span", String(line.number), "line-number"),
        el("code", line.text || " "),
      );
      lines.append(row);
    }
    block.append(lines, references(t));
    return block;
  }
  function change(id: string): HTMLElement {
    const c = report.changes.find((c) => c.id === id)!;
    const t = targets.get(c.targetId)!;
    const section = el("article", undefined, "change");
    section.dataset.change = id;
    section.append(target(c.targetId, "h2"), references(t));
    const comparison = el("div", undefined, "code-comparison");
    comparison.append(
      c.beforeCodeId
        ? code(c.beforeCodeId)
        : el(
            "p",
            "変更前のコードはありません（新規追加、または入力に未収録）。",
            "empty-code",
          ),
    );
    comparison.append(
      c.afterCodeId
        ? code(c.afterCodeId)
        : el(
            "p",
            "変更後のコードはありません（削除、または入力に未収録）。",
            "empty-code",
          ),
    );
    section.append(comparison, el("h3", "関連する要件"));
    if (!c.requirementIds.length)
      section.append(el("p", "要件との対応は未確認", "muted"));
    for (const id of c.requirementIds)
      section.append(
        jump(
          report.requirements.find((q) => q.id === id)!.expectationId,
          id + " ↗",
        ),
      );
    section.append(evidence(c.evidenceIds, "details"));
    return section;
  }
  function render(): void {
    document.title = "Change Len — " + report.revision.label;
    $("#revision").append(
      el("span", report.revision.label),
      el(
        "small",
        `${report.revision.base ?? "元版未確認"} → ${report.revision.head ?? "先版未確認"}`,
      ),
    );
    for (const s of report.sources)
      $("#sources").append(btn(s.label + " ↗", "source", s.id));
    const overview = el("section");
    overview.dataset.screen = "overview";
    const o = report.overview;
    overview.append(
      el("p", "01 / 全体像", "kicker"),
      target(o.titleId, "h1"),
      target(o.purposeId),
      references(targets.get(o.purposeId)!),
    );
    overview.append(el("h2", "何が変わるか"));
    const compare = el("div", undefined, "behavior-comparison");
    for (const [id, label] of [
      [o.beforeId, "変更前"],
      [o.afterId, "変更後"],
    ]) {
      const col = el("section");
      col.append(el("h3", label), target(id), references(targets.get(id)!));
      compare.append(col);
    }
    overview.append(compare, el("h2", "どう実現するか"));
    const flow = el("div", undefined, "flow");
    o.flowIds.forEach((id, i) => {
      const t = targets.get(id)!;
      const node = el("section", undefined, "flow-node");
      const content = annotate(t, el("div"));
      content.append(
        el("span", String(i + 1), "flow-number"),
        el("h3", t.label),
        el("p", t.text),
        el("small", certainty[t.certainty], "certainty"),
      );
      node.append(content, references(t));
      flow.append(node);
    });
    if (!o.flowIds.length) flow.append(el("p", "実現方法は未確認", "muted"));
    overview.append(flow, el("h2", "レビューで確認したい論点"));
    o.questionIds.forEach((id) =>
      overview.append(target(id), references(targets.get(id)!)),
    );
    overview.append(evidence(o.evidenceIds, "overview"));
    const details = el("section");
    details.dataset.screen = "details";
    details.hidden = true;
    details.append(
      el("p", "02 / 変更の詳細", "kicker"),
      el("h1", "変更を、実装へたどる。"),
    );
    const changeNav = el("nav", undefined, "change-nav");
    changeNav.setAttribute("aria-label", "変更単位");
    report.changes.forEach((c) => changeNav.append(jump(c.targetId)));
    details.append(changeNav);
    report.changes.forEach((c) => details.append(change(c.id)));
    if (!report.changes.length)
      details.append(el("p", "変更は収録されていません。"));
    const requirements = el("section");
    requirements.dataset.screen = "requirements";
    requirements.hidden = true;
    requirements.append(
      el("p", "03 / 要件との対応", "kicker"),
      el("h1", "要件と、変更を結ぶ。"),
      el("p", "期待する挙動・対応する変更・確認根拠を、同じ行でたどります。"),
    );
    const headings = el("div", undefined, "matrix-row matrix-heading");
    ["要件・期待結果", "対応する変更", "実装者の確認根拠"].forEach((s) =>
      headings.append(el("h3", s)),
    );
    requirements.append(headings);
    report.requirements.forEach((q) => {
      const row = el("section", undefined, "matrix-row"),
        expected = el("div");
      row.dataset.requirement = q.id;
      expected.append(
        target(q.targetId, "h3"),
        target(q.expectationId),
        references(targets.get(q.targetId)!),
      );
      const changes = el("div");
      q.changeIds.forEach((id) =>
        changes.append(jump(report.changes.find((c) => c.id === id)!.targetId)),
      );
      if (!q.changeIds.length)
        changes.append(el("p", "対応する変更なし", "muted"));
      row.append(expected, changes, evidence(q.evidenceIds, "requirements"));
      requirements.append(row);
    });
    if (!report.requirements.length)
      requirements.append(
        el(
          "p",
          "関連する要件資料は渡されていません。要件との対応は未確認です。",
          "muted",
        ),
      );
    const unlinked = report.changes.filter((c) => !c.requirementIds.length);
    if (unlinked.length) {
      requirements.append(el("h2", "要件との対応が未確認の変更"));
      unlinked.forEach((c) => requirements.append(jump(c.targetId)));
    }
    $("#content").append(overview, details, requirements);
    navigate("overview");
  }
  function closeComposer(): void {
    $("#composer")?.remove();
    if (selected)
      document
        .querySelectorAll<HTMLElement>("[data-target]")
        .forEach((node) => {
          if (node.dataset.target === selected)
            node.classList.remove("selected");
        });
    selected = undefined;
  }
  function navigate(view: View): void {
    closeComposer();
    document.querySelectorAll<HTMLElement>("[data-screen]").forEach((s) => {
      s.hidden = s.dataset.screen !== view;
    });
    document.querySelectorAll<HTMLElement>("[data-view]").forEach((b) => {
      if (b.dataset.view === view) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
  }
  function compose(node: HTMLElement): void {
    const id = node.dataset.target!;
    closeComposer();
    selected = id;
    node.classList.add("selected");
    const t = targets.get(id)!;
    const editor = el("section", undefined, "composer");
    editor.id = "composer";
    editor.setAttribute("aria-label", "対象へのコメント");
    const context = el("p", path(t));
    context.id = "comment-context";
    editor.append(context, el("small", "対象は自動で記録", "muted"));
    const label = el("label", "コメント");
    label.htmlFor = "comment-body";
    const textarea = el("textarea");
    textarea.id = "comment-body";
    textarea.value = comments.get(id) ?? "";
    editor.append(
      label,
      textarea,
      btn("コメントを保存", "save"),
      btn("取消", "cancel"),
    );
    if (comments.has(id)) editor.append(btn("このコメントを削除", "delete"));
    node.after(editor);
    textarea.focus();
  }
  function refreshAnnotations(): void {
    comments.clear();
    for (const c of review.resolve(state, report))
      if (c.status === "current") comments.set(c.current!.id, c.comment.body);
    document.querySelectorAll<HTMLElement>("[data-target]").forEach((node) => {
      node.querySelector(".annotation")?.remove();
      const body = comments.get(node.dataset.target!);
      if (body !== undefined) {
        const pin = el(
          "small",
          "注 " +
            ([...comments.keys()].indexOf(node.dataset.target!) + 1) +
            " · " +
            body,
          "annotation",
        );
        node.append(pin);
      }
    });
    $("#comment-count").textContent = String(state.comments.length);
  }
  function refreshReview(): void {
    const delta = review.difference(state, report);
    const prepared = report.reviewComparison;
    const ready =
      !!delta?.base &&
      !!delta.head &&
      (delta.base === delta.head ||
        (prepared?.base === delta.base && prepared.head === delta.head));
    $<HTMLButtonElement>("[data-previous]").disabled = !ready;
    const pending = review
      .resolve(state, report)
      .filter((c) => c.status !== "current");
    $("#pending-count").textContent = pending.length
      ? `（確認待ち ${pending.length}）`
      : "";
    $("#review-status").textContent = !delta
      ? "レビュー済みの版は未設定です。"
      : `レビュー済み版：${delta.base ?? "版未確認"}。` +
        (ready
          ? "前回からの変更を表示できます。"
          : "前回比較には、保存した JSON を使って HTML を再生成してください。");
    if (comparisonMode) showComparison(ready);
  }
  function showComparison(enabled: boolean): void {
    closeComposer();
    comparisonMode = enabled;
    $("#review-comparison")?.remove();
    $("[data-previous]").setAttribute("aria-pressed", String(enabled));
    $("[data-all-changes]").setAttribute("aria-pressed", String(!enabled));
    const delta = review.difference(state, report);
    const changed = new Set(delta?.changedIds ?? []);
    const changedChanges = new Set(
      report.changes
        .filter((c) =>
          [c.targetId, c.beforeCodeId, c.afterCodeId].some(
            (id) =>
              id &&
              (changed.has(id) ||
                targets.get(id)?.code?.lines.some((l) => changed.has(l.id))),
          ),
        )
        .map((c) => c.id),
    );
    document.querySelectorAll<HTMLElement>("[data-change]").forEach((node) => {
      node.hidden = enabled && !changedChanges.has(node.dataset.change!);
      node.querySelector<HTMLElement>(".code-comparison")!.hidden = enabled;
    });
    document
      .querySelectorAll<HTMLElement>("[data-requirement]")
      .forEach((node) => {
        const q = report.requirements.find(
          (q) => q.id === node.dataset.requirement,
        )!;
        node.hidden =
          enabled &&
          !changed.has(q.targetId) &&
          !changed.has(q.expectationId) &&
          !q.changeIds.some((id) => changedChanges.has(id));
      });
    document
      .querySelectorAll<HTMLElement>('[data-screen="overview"] [data-target]')
      .forEach((node) => {
        node.classList.toggle(
          "unchanged",
          enabled && !changed.has(node.dataset.target!),
        );
      });
    if (enabled && delta) {
      const pane = el("section", undefined, "review-comparison");
      pane.id = "review-comparison";
      pane.append(
        el("h2", "前回レビューからの変更"),
        el("p", `前回レビュー済み版：${delta.base}\n現在版：${delta.head}`),
        el(
          "p",
          "前回からの Git 差分を表示しています。以下の説明・要件は今回のレポートから、内容が変わった対象や関連する変更を抜粋しています。全体像の薄い箇所は前回と同じ説明です。",
        ),
      );
      if (delta.base === delta.head)
        pane.append(
          el(
            "p",
            "前回レビュー済み版と現在版は同じです。Git 差分はありません。",
          ),
        );
      else
        pane.append(
          annotate(
            targets.get("review.patch")!,
            el("pre", targets.get("review.patch")!.text, "review-patch"),
          ),
        );
      if (delta.removed.length) {
        pane.append(el("h3", "今回のレポートから削除・未収録となった対象"));
        delta.removed.forEach((t) =>
          pane.append(el("p", t.path.join(" > ")), el("pre", t.text)),
        );
      }
      $('[data-screen="details"]').prepend(pane);
      navigate("details");
    }
    refreshAnnotations();
  }
  function refreshRecords(): void {
    $<HTMLTextAreaElement>("#review-export").value = JSON.stringify(
      state,
      null,
      2,
    );
    const list = $("#pending-comments");
    list.replaceChildren();
    const pending = review
      .resolve(state, report)
      .filter((c) => c.status !== "current");
    if (!pending.length)
      list.append(el("p", "確認待ちのコメントはありません。"));
    for (const item of pending) {
      const row = el("article", undefined, "pending-comment"),
        c = item.comment;
      const previous = state.reports[c.binding.snapshot];
      row.append(
        el(
          "h3",
          {
            changed: "内容変更",
            moved: "位置変更",
            missing: "対象削除・未収録",
            unverified: "版の一致未確認",
          }[item.status as Exclude<typeof item.status, "current">],
        ),
        el(
          "p",
          `元の対象：${item.previous.path.join(" > ")}\n版：${previous.revision.head ?? previous.revision.contentHash}`,
        ),
        el(
          "pre",
          item.previous.code
            ? item.previous.code.file +
                "\n" +
                item.previous.code.lines
                  .map((l) => `${l.number}: ${l.text}`)
                  .join("\n")
            : item.previous.text,
        ),
        el("p", c.body),
      );
      if (item.current)
        row.append(
          el("p", "今回の対象：" + item.current.path.join(" > ")),
          el(
            "pre",
            item.current.code
              ? item.current.code.file +
                  "\n" +
                  item.current.code.lines
                    .map((l) => `${l.number}: ${l.text}`)
                    .join("\n")
              : item.current.text,
          ),
          btn("この版の対象を確認して引き継ぐ", "confirm", c.id),
        );
      row.append(btn("この記録を削除", "removeRecord", c.id));
      list.append(row);
    }
  }
  function restore(text: string): void {
    try {
      const incoming = review.validate(JSON.parse(text));
      assertScope(incoming);
      const merged = review.merge(state, incoming);
      state = merged;
      persist("JSON を復元しました。");
      refreshRecords();
      $("#record-status").textContent =
        "JSON を復元しました。変更された対象は確認待ちに残しています。";
    } catch (error) {
      $("#record-status").textContent =
        (error instanceof Error ? error.message : String(error)) +
        " 保存済みの記録は変更していません。";
    }
  }
  function openDialog(selector: string): void {
    focusBeforeDialog = document.activeElement as HTMLElement;
    $(selector).hidden = false;
    $(selector).querySelector<HTMLElement>(".dialog-body")!.scrollTop = 0;
    $(selector).querySelector<HTMLElement>("textarea,button")?.focus();
  }
  function closeDialog(selector: string): void {
    $(selector).hidden = true;
    focusBeforeDialog?.focus();
  }
  async function copy(): Promise<void> {
    const prompt = review.buildRequest(state, report);
    if (!prompt) {
      status("保存済みのコメントがありません。");
      return;
    }
    $<HTMLTextAreaElement>("#prompt-output").value = prompt;
    openDialog("#prompt-dialog");
    $("#copy-status").textContent = "依頼文を準備しました。";
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(prompt);
      $("#copy-status").textContent = "依頼文をコピーしました。";
    } catch {
      $("#copy-status").textContent =
        "自動コピーを利用できません。以下の全文を選択し、手動でコピーしてください。";
    }
  }
  document.addEventListener("click", (event) => {
    const clicked = event.target as HTMLElement;
    const button = clicked.closest<HTMLButtonElement>("button");
    if (button) {
      if ("records" in button.dataset) {
        refreshRecords();
        if ($("#records-dialog").hidden) openDialog("#records-dialog");
        return;
      }
      if ("closeRecords" in button.dataset) {
        closeDialog("#records-dialog");
        return;
      }
      if ("restore" in button.dataset) {
        restore($<HTMLTextAreaElement>("#review-import").value);
        return;
      }
      if ("selectRecords" in button.dataset) {
        $<HTMLTextAreaElement>("#review-export").select();
        return;
      }
      if ("download" in button.dataset) {
        const json = JSON.stringify(state, null, 2);
        try {
          const url = URL.createObjectURL(
            new Blob([json], { type: "application/json" }),
          );
          const a = el("a");
          a.href = url;
          a.download = "change-len-review.json";
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          $("#record-status").textContent =
            "JSON のダウンロードを開始しました。保存先にファイルがあることを確認してください。";
        } catch {
          $<HTMLTextAreaElement>("#review-export").select();
          $("#record-status").textContent =
            "JSON 全文を選択しました。コピーして JSON ファイルに保存してください。";
        }
        return;
      }
      if (button.dataset.confirm || button.dataset.removeRecord) {
        try {
          state = button.dataset.confirm
            ? review.confirm(state, button.dataset.confirm, report)
            : review.remove(state, button.dataset.removeRecord!);
          persist("コメントの記録を更新しました。");
          refreshRecords();
          $("#record-status").textContent = "コメントの記録を更新しました。";
        } catch (error) {
          $("#record-status").textContent =
            error instanceof Error ? error.message : String(error);
        }
        return;
      }
      if ("reviewed" in button.dataset) {
        state = review.markReviewed(state, report);
        persist("この版をレビュー済みにしました。");
        return;
      }
      if ("previous" in button.dataset) {
        if (!button.disabled) showComparison(true);
        return;
      }
      if ("allChanges" in button.dataset) {
        showComparison(false);
        return;
      }
      if (button.dataset.view) {
        navigate(button.dataset.view as View);
        return;
      }
      if (button.dataset.jump) {
        const t = targets.get(button.dataset.jump)!;
        if (comparisonMode && t.id !== "review.patch") showComparison(false);
        navigate(t.view);
        const node = document.querySelector<HTMLElement>(
          `[data-screen="${t.view}"] [data-target="${t.id}"]`,
        )!;
        const disclosure = node.closest("details");
        if (disclosure) disclosure.open = true;
        node.scrollIntoView?.({ block: "center" });
        node.focus();
        return;
      }
      if (button.dataset.source) {
        const s = report.sources.find((s) => s.id === button.dataset.source)!;
        $("#source-title").textContent = s.label;
        $("#source-locator").textContent = s.locator;
        $("#source-excerpt").textContent = s.excerpt;
        const link = $<HTMLAnchorElement>("#source-url");
        link.hidden = !s.url;
        if (s.url) link.href = s.url;
        openDialog("#source-dialog");
        return;
      }
      if ("save" in button.dataset) {
        const body = $<HTMLTextAreaElement>("#comment-body").value;
        if (!body.trim()) {
          status("コメント本文を入力してください。");
          return;
        }
        state = review.save(
          state,
          report,
          selected!,
          body,
          "comment." +
            (globalThis.crypto?.randomUUID?.() ??
              Date.now().toString(36) + Math.random().toString(36).slice(2)),
        );
        closeComposer();
        persist("コメントを保存しました。");
        return;
      }
      if ("delete" in button.dataset) {
        const c = review
          .resolve(state, report)
          .find((c) => c.status === "current" && c.current?.id === selected);
        if (c) state = review.remove(state, c.comment.id);
        closeComposer();
        persist("コメントを削除しました。");
        return;
      }
      if ("cancel" in button.dataset) {
        closeComposer();
        status("入力を取り消しました。");
        return;
      }
      if ("copy" in button.dataset) {
        void copy();
        return;
      }
      if ("selectPrompt" in button.dataset) {
        $<HTMLTextAreaElement>("#prompt-output").select();
        return;
      }
      if ("closePrompt" in button.dataset) {
        closeDialog("#prompt-dialog");
        return;
      }
      if ("closeSource" in button.dataset) {
        closeDialog("#source-dialog");
        return;
      }
    }
    if (clicked.closest("a,summary,textarea,input,label,#composer")) return;
    const node = clicked.closest<HTMLElement>("[data-target]");
    if (node) compose(node);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const dialog = document.querySelector<HTMLElement>(
        ".overlay:not([hidden])",
      );
      if (dialog) closeDialog("#" + dialog.id);
      else closeComposer();
      return;
    }
    const modal = document.querySelector<HTMLElement>(".overlay:not([hidden])");
    if (event.key === "Tab" && modal) {
      const fields = [
        ...modal.querySelectorAll<HTMLElement>(
          "button:not([disabled]),textarea,input,a:not([hidden])",
        ),
      ];
      const first = fields[0],
        last = fields.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (
      (event.key === "Enter" || event.key === " ") &&
      (event.target as HTMLElement).matches("[data-target]")
    ) {
      event.preventDefault();
      compose(event.target as HTMLElement);
    }
  });
  $("#review-file").addEventListener("change", () => {
    const file = $<HTMLInputElement>("#review-file").files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => restore(String(reader.result));
    reader.onerror = () => {
      $("#record-status").textContent =
        "JSON ファイルを読み込めませんでした。記録は変更していません。";
    };
    reader.readAsText(file);
  });
  render();
  loadState();
  refreshAnnotations();
  refreshReview();
})();
