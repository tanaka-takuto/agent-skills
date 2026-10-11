import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { fixture } from "./fixtures.ts";
import { renderReport } from "./render.ts";

function page() {
  return new JSDOM(renderReport(fixture()), {
    runScripts: "dangerously",
    url: "file:///review.html",
  });
}
function click(dom: JSDOM, selector: string) {
  const el = dom.window.document.querySelector<HTMLElement>(selector);
  assert.ok(el, selector);
  el.click();
}
function save(dom: JSDOM, id: string, body: string) {
  click(dom, `[data-target="${id}"]`);
  const textarea =
    dom.window.document.querySelector<HTMLTextAreaElement>("#comment-body")!;
  assert.ok(textarea);
  textarea.value = body;
  click(dom, "[data-save]");
}
test("3画面の保存コメントをまとめ、未保存・取消・空欄を除外する", async () => {
  const dom = page(),
    d = dom.window.document;
  save(dom, "flow", "今回のスコープに画面を含めないでほしい");
  click(dom, '[data-view="details"]');
  save(dom, "new-line", '別の版を混ぜないで < > "\n2行目');
  click(dom, '[data-view="requirements"]');
  save(dom, "expectation", "期待結果の確認");
  click(dom, '[data-target="requirement"]');
  d.querySelector<HTMLTextAreaElement>("#comment-body")!.value = "取消した依頼";
  click(dom, "[data-cancel]");
  click(dom, "[data-copy]");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const prompt = d.querySelector<HTMLTextAreaElement>("#prompt-output")!.value;
  assert.match(prompt, /全体像 > 1 画面/);
  assert.match(prompt, /対象ID：new-line/);
  assert.match(prompt, /期待結果の確認/);
  assert.ok(prompt.includes('< > "\n2行目'));
  assert.ok(!prompt.includes("取消した依頼"));
  assert.match(d.querySelector("#copy-status")!.textContent!, /手動/);
  click(dom, "[data-close-prompt]");
  click(dom, '[data-view="overview"]');
  click(dom, '[data-target="flow"]');
  assert.equal(
    d.querySelector<HTMLTextAreaElement>("#comment-body")!.value,
    "今回のスコープに画面を含めないでほしい",
  );
  click(dom, "[data-delete]");
  click(dom, '[data-target="before"]');
  click(dom, "[data-save]");
  assert.ok(d.querySelector("#comment-body"));
  assert.match(d.querySelector("#status")!.textContent!, /本文/);
  dom.window.close();
});

test("対象の近くに入力し、リンク・余白は別の対象を選ばない", () => {
  const dom = page(),
    d = dom.window.document;
  click(dom, '[data-target="flow"]');
  assert.equal(
    d
      .querySelector("#composer")!
      .previousElementSibling!.getAttribute("data-target"),
    "flow",
  );
  assert.match(
    d.querySelector("#comment-context")!.textContent!,
    /全体像 > 1 画面/,
  );
  click(dom, "[data-cancel]");
  click(dom, "main");
  assert.equal(d.querySelector("#composer"), null);
  click(dom, '[data-view="requirements"]');
  click(dom, '[data-jump="change"]');
  assert.equal(
    d.querySelector('[data-screen="details"]')!.hasAttribute("hidden"),
    false,
  );
  assert.equal(d.querySelector("#composer"), null);
  dom.window.close();
});

test("通常コピーの成功とコメントなしを区別する", async () => {
  const dom = page(),
    d = dom.window.document;
  let copied = "";
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: {
      writeText: async (s: string) => {
        copied = s;
      },
    },
  });
  click(dom, "[data-copy]");
  assert.equal(copied, "");
  assert.equal(d.querySelector("#prompt-dialog")!.hasAttribute("hidden"), true);
  save(dom, "flow", "保存済み");
  click(dom, "[data-copy]");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(copied.includes("保存済み"));
  assert.match(d.querySelector("#copy-status")!.textContent!, /コピーしました/);
  dom.window.close();
});

test("根拠を開け、未確認と要件不足を表示し、コードを実行しない", () => {
  const r = fixture();
  r.targets[0].text = '<img src=x onerror="globalThis.injected=1">';
  r.changes[0].requirementIds = [];
  r.requirements[0].changeIds = [];
  const dom = new JSDOM(renderReport(r), { runScripts: "dangerously" }),
    d = dom.window.document;
  assert.equal(
    (dom.window as unknown as { injected?: number }).injected,
    undefined,
  );
  assert.equal(d.querySelector("img"), null);
  assert.match(d.querySelector("main")!.textContent!, /推論/);
  click(dom, '[data-view="requirements"]');
  assert.match(
    d.querySelector('[data-screen="requirements"]')!.textContent!,
    /対応する変更なし/,
  );
  click(dom, '[data-view="details"]');
  assert.match(
    d.querySelector('[data-screen="details"]')!.textContent!,
    /要件との対応は未確認/,
  );
  const details = d.querySelector<HTMLDetailsElement>(
    '[data-screen="details"] details',
  )!;
  details.open = true;
  assert.match(details.textContent!, /未実施/);
  dom.window.close();
});

test("根拠の参照先は表示された画面で選べ、IDを重複配置しない", () => {
  const dom = page(),
    d = dom.window.document;
  const ids = [...d.querySelectorAll("[data-target]")].map(
    (n) => (n as HTMLElement).dataset.target,
  );
  assert.equal(new Set(ids).size, ids.length);
  click(dom, '[data-view="details"]');
  click(dom, '[data-jump="evidence"]');
  assert.equal(
    d.querySelector('[data-screen="requirements"]')!.hasAttribute("hidden"),
    false,
  );
  assert.equal(
    d.querySelector<HTMLDetailsElement>('[data-screen="requirements"] details')!
      .open,
    true,
  );
  click(dom, '[data-target="evidence"]');
  assert.match(
    d.querySelector("#comment-context")!.textContent!,
    /要件との対応/,
  );
  dom.window.close();
});
