import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { fixture } from "./fixtures.ts";
import { renderReport } from "./render.ts";

function page(reduced = false) {
  const plays: {
    node: Element;
    duration: number;
    cancelled: boolean;
    finish: () => void;
  }[] = [];
  const dom = new JSDOM(renderReport(fixture()), {
    runScripts: "dangerously",
    url: "file:///review.html",
    beforeParse(window) {
      Object.defineProperty(window, "matchMedia", {
        value: (query: string) => ({
          matches: reduced && query === "(prefers-reduced-motion: reduce)",
        }),
      });
      Object.defineProperty(window.Element.prototype, "animate", {
        value(
          this: Element,
          _frames: Keyframe[],
          options: KeyframeAnimationOptions,
        ) {
          let finish!: () => void, cancel!: () => void;
          const finished = new Promise<Animation>((resolve, reject) => {
            finish = () => resolve(animation);
            cancel = () =>
              reject(new window.DOMException("Cancelled", "AbortError"));
          });
          const play = {
            node: this,
            duration: Number(options.duration),
            cancelled: false,
            finish,
          };
          const animation = {
            finished,
            cancel() {
              play.cancelled = true;
              cancel();
            },
          } as Animation;
          plays.push(play);
          return animation;
        },
      });
    },
  });
  const d = dom.window.document;
  const click = (selector: string) => {
    const node = d.querySelector<HTMLElement>(selector);
    assert.ok(node, selector);
    node.click();
  };
  return { dom, d, plays, click };
}

test("画面切替・コメント入力・ダイアログ開閉に短い動きを付け、連続操作で古い終了処理を残さない", async () => {
  const { dom, d, plays, click } = page();
  click('[data-view="details"]');
  const detailsMotion = plays.find(
    (p) => (p.node as HTMLElement).dataset.screen === "details",
  );
  assert.ok(detailsMotion, "読む順序を選ぶと表示する画面に動きがある");
  click('[data-view="requirements"]');
  assert.ok(detailsMotion.cancelled, "隠した画面の動きを中止する");
  click('[data-view="details"]');
  const count = plays.length;
  click('[data-view="details"]');
  assert.equal(plays.length, count, "同じ画面では動きを繰り返さない");
  assert.equal(
    d.querySelector<HTMLElement>('[data-screen="details"]')!.hidden,
    false,
  );
  click('[data-view="overview"]');
  click('[data-target="flow"]');
  assert.ok(plays.some((p) => p.node.id === "composer"));
  d.querySelector<HTMLTextAreaElement>("#comment-body")!.value =
    "保存したコメント";
  click("[data-save]");
  for (const [name, selector] of [
    ["source", '[data-source="diff"]'],
    ["records", "[data-records]"],
    ["prompt", "[data-copy]"],
  ]) {
    const opener = d.querySelector<HTMLButtonElement>(selector)!;
    opener.focus();
    opener.click();
    const dialog = d.querySelector<HTMLElement>(`#${name}-dialog`)!;
    assert.ok(plays.some((p) => p.node === dialog));
    assert.ok(plays.some((p) => p.node === dialog.querySelector(".sheet")));
    click(`#${name}-dialog .dialog-header [data-close-${name}]`);
    assert.equal(dialog.hidden, false, "閉じる動きが完了するまで描画を保つ");
    assert.ok(
      dialog.hasAttribute("inert"),
      "閉じる途中のダイアログに入力しない",
    );
    assert.equal(d.activeElement, opener);
    const tab = new dom.window.KeyboardEvent("keydown", {
      key: "Tab",
      cancelable: true,
    });
    opener.dispatchEvent(tab);
    assert.equal(
      tab.defaultPrevented,
      false,
      "閉じる途中の画面にフォーカスを戻さない",
    );
    const closing = plays.filter((p) => p.node === dialog).at(-1)!;
    closing.finish();
    opener.click();
    await Promise.resolve();
    assert.equal(
      dialog.hidden,
      false,
      "再度開いたダイアログを古い終了処理で隠さない",
    );
    assert.ok(!dialog.hasAttribute("inert"));
    click(`#${name}-dialog .dialog-header [data-close-${name}]`);
    plays
      .filter((p) => p.node === dialog)
      .at(-1)!
      .finish();
    await Promise.resolve();
    assert.equal(dialog.hidden, true);
  }
  assert.ok(plays.every((p) => p.duration > 0 && p.duration <= 300));
  dom.window.close();
});

test("動きを減らす設定では画面と入力をすぐ表示し、ダイアログもすぐ閉じる", () => {
  const { dom, d, plays, click } = page(true);
  click('[data-view="details"]');
  assert.equal(
    d.querySelector<HTMLElement>('[data-screen="details"]')!.hidden,
    false,
  );
  click('[data-target="change"]');
  assert.ok(d.querySelector("#composer"));
  click('[data-source="diff"]');
  const dialog = d.querySelector<HTMLElement>("#source-dialog")!;
  assert.equal(dialog.hidden, false);
  click("#source-dialog .dialog-header [data-close-source]");
  assert.equal(dialog.hidden, true);
  assert.equal(plays.length, 0);
  dom.window.close();
});
