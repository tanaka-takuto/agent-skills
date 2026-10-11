import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM, ResourceLoader, VirtualConsole } from "jsdom";
import {
  validateReport,
  buildPrompt,
  indexTargets,
  VIEW_NAMES,
} from "./model.ts";
import { renderReport } from "./render.ts";
import type { Comment, Report, View } from "./model.ts";

function report(relativePath: string): Report {
  return validateReport(
    JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8")),
  );
}

function offlineDOM(html: string) {
  const requests: string[] = [];
  const errors: Error[] = [];
  class NoNetwork extends ResourceLoader {
    override fetch(url: string) {
      requests.push(url);
      return null;
    }
  }
  const console = new VirtualConsole();
  console.on("jsdomError", (error: Error) => errors.push(error));
  const dom = new JSDOM(html, {
    url: "file:///isolated/review.html",
    runScripts: "dangerously",
    resources: new NoNetwork(),
    virtualConsole: console,
    beforeParse(window) {
      const blocked = (name: string, url: unknown): never => {
        requests.push(`${name}:${String(url)}`);
        throw new Error("DOM検証中の通信は使用できません");
      };
      Object.defineProperty(window, "fetch", {
        value: (url: unknown) => blocked("fetch", url),
      });
      Object.defineProperty(window.XMLHttpRequest.prototype, "open", {
        value: (_method: unknown, url: unknown) => blocked("xhr", url),
      });
      Object.defineProperty(window, "WebSocket", {
        value: class {
          constructor(url: unknown) {
            blocked("websocket", url);
          }
        },
      });
      Object.defineProperty(window.navigator, "sendBeacon", {
        value: (url: unknown) => blocked("beacon", url),
      });
    },
  });
  return { dom, requests, errors };
}

function click(dom: JSDOM, selector: string) {
  const node = dom.window.document.querySelector<HTMLElement>(selector);
  assert.ok(node, selector);
  assert.equal(
    node.closest<HTMLElement>("[data-screen]")?.hidden ?? false,
    false,
  );
  node.click();
}

function select(dom: JSDOM, r: Report, id: string) {
  const target = indexTargets(r).get(id)!;
  click(dom, `[data-view="${target.view}"]`);
  const disclosure = dom.window.document
    .querySelector(`[data-target="${id}"]`)!
    .closest<HTMLDetailsElement>("details");
  if (disclosure && !disclosure.open)
    disclosure.querySelector<HTMLElement>("summary")!.click();
  if (disclosure) assert.equal(disclosure.open, true);
  click(dom, `[data-target="${id}"]`);
  const document = dom.window.document;
  assert.equal(
    document
      .querySelector("#composer")!
      .previousElementSibling!.getAttribute("data-target"),
    id,
  );
  assert.equal(
    document.querySelector("#comment-context")!.textContent,
    target.path.join(" > "),
  );
  assert.ok(
    document
      .querySelector(`[data-target="${id}"]`)!
      .classList.contains("selected"),
  );
}

function save(dom: JSDOM, r: Report, comment: Comment) {
  select(dom, r, comment.targetId);
  dom.window.document.querySelector<HTMLTextAreaElement>(
    "#comment-body",
  )!.value = comment.body;
  click(dom, "[data-save]");
}

async function copy(dom: JSDOM): Promise<string> {
  click(dom, "[data-copy]");
  await new Promise((resolve) => setTimeout(resolve, 0));
  return dom.window.document.querySelector<HTMLTextAreaElement>(
    "#prompt-output",
  )!.value;
}

test("実コミットから単一HTMLを生成し、通信なしのDOMで3画面の保存コメントを依頼文として取得する", async () => {
  const directory = mkdtempSync(join(tmpdir(), "change-len-workflow-"));
  const r = report("../references/example.json");
  let page: ReturnType<typeof offlineDOM> | undefined;
  try {
    const output = join(directory, "review.html");
    execFileSync(
      process.execPath,
      [
        fileURLToPath(new URL("./render.ts", import.meta.url)),
        fileURLToPath(new URL("../references/example.json", import.meta.url)),
        output,
      ],
      { cwd: directory, stdio: "pipe" },
    );
    assert.deepEqual(readdirSync(directory), ["review.html"]);
    const html = readFileSync(output, "utf8");
    assert.equal(html, renderReport(r));
    page = offlineDOM(html);
    const { dom } = page;
    const document = dom.window.document;
    const navigation = [
      ...document.querySelectorAll<HTMLElement>("[data-view]"),
    ];
    assert.deepEqual(
      navigation.map((node) => node.dataset.view),
      Object.keys(VIEW_NAMES),
    );
    for (const node of navigation)
      assert.ok(
        node.textContent!.includes(VIEW_NAMES[node.dataset.view as View]),
      );
    assert.equal(document.querySelector('[data-view="comments"]'), null);
    const ids = [
      ...document.querySelectorAll<HTMLElement>("[data-target]"),
    ].map((node) => node.dataset.target);
    assert.equal(new Set(ids).size, ids.length);
    for (const id of [
      r.overview.titleId,
      r.overview.purposeId,
      r.overview.beforeId,
      r.overview.afterId,
      ...r.overview.flowIds,
      ...r.overview.questionIds,
    ]) {
      const target = r.targets.find((target) => target.id === id)!;
      assert.ok(
        document
          .querySelector(`[data-target="${id}"]`)!
          .textContent!.includes(target.text),
      );
    }
    for (const target of r.targets.filter((target) => target.code)) {
      for (const line of target.code!.lines)
        assert.equal(
          document.querySelector(`[data-target="${line.id}"] code`)!
            .textContent,
          line.text || " ",
        );
    }
    for (const target of r.targets) {
      select(dom, r, target.id);
      assert.equal(
        document.querySelector<HTMLTextAreaElement>("#comment-body")!.value,
        "",
      );
      click(dom, "[data-cancel]");
    }
    for (const evidence of r.evidence) {
      select(dom, r, evidence.targetId);
      const disclosure = document
        .querySelector(`[data-target="${evidence.targetId}"]`)!
        .closest("details")!;
      for (const text of [
        evidence.method,
        evidence.conditions,
        evidence.result,
      ])
        assert.ok(disclosure.textContent!.includes(text));
      assert.ok(
        disclosure.textContent!.includes(
          evidence.status === "observed" ? "観測済み" : "未実施・未確認",
        ),
      );
      click(dom, "[data-cancel]");
    }
    for (const source of r.sources) {
      click(dom, `aside [data-source="${source.id}"]`);
      assert.equal(
        document.querySelector<HTMLElement>("#source-dialog")!.hidden,
        false,
      );
      assert.equal(
        document.querySelector("#source-excerpt")!.textContent,
        source.excerpt,
      );
      assert.equal(
        document.querySelector("#source-locator")!.textContent,
        source.locator,
      );
      click(dom, "[data-close-source]");
    }
    assert.equal(await copy(dom), "");
    assert.equal(
      document.querySelector<HTMLElement>("#prompt-dialog")!.hidden,
      true,
    );
    assert.match(
      document.querySelector("#status")!.textContent!,
      /コメントがありません/,
    );
    const comments: Comment[] = JSON.parse(
      readFileSync(
        new URL("./testdata/comments.json", import.meta.url),
        "utf8",
      ),
    );
    comments[0].body = '  改行と < > " の確認\n保存した本文  ';
    for (const comment of comments) save(dom, r, comment);
    assert.equal(document.querySelector("#comment-count")!.textContent, "3");
    for (const comment of comments) {
      select(dom, r, comment.targetId);
      assert.equal(
        document.querySelector<HTMLTextAreaElement>("#comment-body")!.value,
        comment.body,
      );
      document.querySelector<HTMLTextAreaElement>("#comment-body")!.value =
        "取消した編集";
      click(dom, "[data-cancel]");
    }
    select(dom, r, r.overview.beforeId);
    document.querySelector<HTMLTextAreaElement>("#comment-body")!.value =
      " \n ";
    click(dom, "[data-save]");
    assert.match(document.querySelector("#status")!.textContent!, /本文を入力/);
    click(dom, "[data-cancel]");
    select(dom, r, r.overview.afterId);
    document.querySelector<HTMLTextAreaElement>("#comment-body")!.value =
      "未保存の依頼";
    const prompt = await copy(dom);
    assert.equal(prompt, buildPrompt(r, comments));
    for (const comment of comments) {
      assert.ok(prompt.includes(comment.targetId));
      assert.ok(prompt.includes(comment.body));
    }
    assert.ok(prompt.includes(r.revision.base!));
    assert.ok(prompt.includes(r.revision.head!));
    assert.ok(prompt.includes("skills/define-completion/SKILL.md"));
    assert.ok(prompt.includes("LENGTH-01"));
    assert.ok(!prompt.includes("未保存の依頼"));
    assert.ok(!prompt.includes("取消した編集"));
    assert.match(
      document.querySelector("#copy-status")!.textContent!,
      /手動でコピー/,
    );
    click(dom, "[data-select-prompt]");
    const field =
      document.querySelector<HTMLTextAreaElement>("#prompt-output")!;
    assert.equal(field.selectionStart, 0);
    assert.equal(field.selectionEnd, prompt.length);
    click(dom, "[data-close-prompt]");
    click(dom, '[data-view="requirements"]');
    assert.equal(await copy(dom), prompt);
    assert.deepEqual(page.requests, []);
    assert.deepEqual(page.errors, []);
  } finally {
    page?.dom.window.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("実PRの同じ行の前後と同名の期待結果を選び分け、対応不足とコピー拒否を区別する", async () => {
  const r = report("../references/pr-example.json");
  const page = offlineDOM(renderReport(r));
  const { dom } = page;
  try {
    const comments: Comment[] = [
      { targetId: "pr.before.L250", body: "変更前の false を確認" },
      { targetId: "pr.after.L250", body: "変更後の true を確認" },
      ...r.requirements.map((requirement) => ({
        targetId: requirement.expectationId,
        body: `${requirement.id} の期待結果を確認`,
      })),
    ];
    for (const comment of comments) save(dom, r, comment);
    let denied = 0;
    Object.defineProperty(dom.window.navigator, "clipboard", {
      value: {
        writeText: async () => {
          denied++;
          throw new Error("clipboard denied");
        },
      },
    });
    const prompt = await copy(dom);
    assert.equal(denied, 1);
    assert.equal(prompt, buildPrompt(r, comments));
    assert.match(prompt, /変更前.*da3f388c1485ae03b0bc3dfb3fd79dc37cc91dfd/);
    assert.match(prompt, /変更後.*d847c3201db550830f1b90fdc4e0e060e1ce88da/);
    assert.ok(prompt.includes("experimental_strip_types = false"));
    assert.ok(prompt.includes("experimental_strip_types = true"));
    assert.match(
      dom.window.document.querySelector("#copy-status")!.textContent!,
      /手動でコピー/,
    );
    click(dom, "[data-close-prompt]");
    click(dom, '[data-view="requirements"]');
    const unlinked = dom.window.document
      .querySelector('[data-target="requirement.distribution"]')!
      .closest(".matrix-row")!;
    assert.match(unlinked.textContent!, /対応する変更なし/);
    assert.match(unlinked.textContent!, /確認根拠は未記録/);
    const linked = dom.window.document
      .querySelector('[data-target="requirement.length"]')!
      .closest(".matrix-row")!;
    const jump = linked.querySelector<HTMLElement>("[data-jump]")!;
    jump.click();
    assert.equal(
      dom.window.document.querySelector<HTMLElement>('[data-screen="details"]')!
        .hidden,
      false,
    );
    click(dom, '[data-jump="expectation.length"]');
    assert.equal(
      dom.window.document.querySelector<HTMLElement>(
        '[data-screen="requirements"]',
      )!.hidden,
      false,
    );
    assert.deepEqual(page.requests, []);
    assert.deepEqual(page.errors, []);
  } finally {
    dom.window.close();
  }
});

test("資料なし差分の3画面は架空の要件を作らず、未知の版と未確認の対応を表示する", () => {
  const r = report("../references/diff-example.json");
  const page = offlineDOM(renderReport(r));
  try {
    for (const view of Object.keys(VIEW_NAMES) as View[]) {
      click(page.dom, `[data-view="${view}"]`);
      assert.equal(
        page.dom.window.document.querySelector<HTMLElement>(
          `[data-screen="${view}"]`,
        )!.hidden,
        false,
      );
    }
    const document = page.dom.window.document;
    assert.match(
      document.querySelector("#revision")!.textContent!,
      /元版未確認.*先版未確認/,
    );
    assert.match(
      document.querySelector('[data-screen="requirements"]')!.textContent!,
      /資料は渡されていません/,
    );
    assert.equal(
      document.querySelector(".matrix-row:not(.matrix-heading)"),
      null,
    );
    assert.match(
      document.querySelector('[data-screen="details"]')!.textContent!,
      /要件との対応は未確認/,
    );
    assert.deepEqual(page.requests, []);
    assert.deepEqual(page.errors, []);
  } finally {
    page.dom.window.close();
  }
});
