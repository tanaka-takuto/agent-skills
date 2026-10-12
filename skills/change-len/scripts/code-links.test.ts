import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { JSDOM } from "jsdom";
import { fixture } from "./fixtures.ts";
import type { Report } from "./model.ts";
import { createReviewTools } from "./review-state.ts";

const cli = fileURLToPath(new URL("./render.ts", import.meta.url));
const file = "src/result 日本語 #%.js";

function repository(run: (repo: string, report: Report) => void): void {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), "change-len-links-")));
  const repo = join(temp, "repo space # %");
  mkdirSync(join(repo, "src"), { recursive: true });
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args],
      { cwd: repo, encoding: "utf8", stdio: "pipe" },
    ).trim();
  try {
    git("init");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "Test");
    writeFileSync(join(repo, file), "return 1;\n// unchanged\n");
    git("add", "--", file);
    git("commit", "-m", "before");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(repo, file), "return 2;\n// unchanged\n");
    git("add", "--", file);
    git("commit", "-m", "after");
    const head = git("rev-parse", "HEAD");
    const report = fixture();
    report.reviewKey = "links-test";
    report.revision.base = base;
    report.revision.head = head;
    for (const target of report.targets) {
      if (!target.code) continue;
      target.code.file = file;
      target.code.revision = target.code.side === "before" ? base : head;
    }
    run(repo, report);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

function generate(repo: string, report: Report, args: string[] = []) {
  const input = join(repo, "report.json"),
    output = join(repo, "review.html");
  writeFileSync(input, JSON.stringify(report));
  const result = spawnSync(process.execPath, [cli, input, output, ...args], {
    cwd: tmpdir(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return new JSDOM(readFileSync(output, "utf8"), {
    runScripts: "dangerously",
    url: pathToFileURL(output).href,
  });
}

test("指定しないHTMLにはVS Codeリンクもローカルパスも含めない", () => {
  repository((repo, report) => {
    const dom = generate(repo, report);
    try {
      assert.equal(
        dom.window.document.querySelector('a[href^="vscode:"]'),
        null,
      );
      assert.ok(!dom.serialize().includes(repo));
      assert.ok(
        !dom.window.document
          .querySelector("main")!
          .textContent!.includes("VS Code"),
      );
    } finally {
      dom.window.close();
    }
  });
});

test("指定時だけ一致する版のファイル名と行番号をVS Codeの絶対URLにする", () => {
  repository((repo, report) => {
    const dom = generate(repo, report, ["--vscode-local", "--repo", repo]);
    try {
      const d = dom.window.document;
      const expected = `vscode://file${pathToFileURL(join(repo, file)).pathname}:1:1`;
      const heading = d.querySelector<HTMLAnchorElement>(
        ".after .code-heading a",
      )!;
      const line = d.querySelector<HTMLAnchorElement>(
        '[data-target="new-line"] a.line-number',
      )!;
      assert.ok(heading);
      assert.ok(line);
      assert.equal(heading.href, expected);
      assert.equal(line.href, expected);
      assert.equal(new URL(line.href).search, "");
      assert.equal(new URL(line.href).hash, "");
      assert.match(line.getAttribute("aria-label")!, /VS Code.*1/);
      assert.equal(d.querySelector('.before a[href^="vscode:"]'), null);
      assert.match(
        d.querySelector(".before")!.textContent!,
        /ローカル.*一致しません/,
      );
      d.querySelector<HTMLButtonElement>('[data-view="details"]')!.click();
      line.addEventListener("click", (event) => event.preventDefault());
      line.click();
      assert.equal(
        d.querySelector("#composer"),
        null,
        "参照リンクでコメントを開かない",
      );
      d.querySelector<HTMLElement>('[data-target="new-line"]')!.click();
      assert.ok(
        d.querySelector("#composer"),
        "コードへのコメントは引き続き使える",
      );
    } finally {
      dom.window.close();
    }
  });
});

test("行番号が同じでもファイル全体や掲載コードが違えばリンクを作らない", () => {
  repository((repo, report) => {
    writeFileSync(join(repo, file), "return 2;\n// local edits\n");
    let dom = generate(repo, report, ["--repo", repo, "--vscode-local"]);
    assert.equal(dom.window.document.querySelector('a[href^="vscode:"]'), null);
    dom.window.close();
    writeFileSync(join(repo, file), "return 2;\n// unchanged\n");
    report.targets.find(
      (target) => target.id === "new-code",
    )!.code!.lines[0].text = "unverified code";
    dom = generate(repo, report, ["--vscode-local", "--repo", repo]);
    assert.equal(dom.window.document.querySelector('a[href^="vscode:"]'), null);
    assert.match(
      dom.window.document.querySelector(".after")!.textContent!,
      /掲載コード.*一致しません/,
    );
    dom.window.close();
  });
});

test("一致する変更前のファイルにもリンクできるが版が不明なら作らない", () => {
  repository((repo, report) => {
    writeFileSync(join(repo, file), "return 1;\n// unchanged\n");
    let dom = generate(repo, report, ["--vscode-local", "--repo", repo]);
    assert.ok(dom.window.document.querySelector('.before a[href^="vscode:"]'));
    assert.equal(
      dom.window.document.querySelector('.after a[href^="vscode:"]'),
      null,
    );
    dom.window.close();
    report.revision.kind = "diff";
    report.revision.base = null;
    report.revision.head = null;
    report.revision.contentHash = "c".repeat(64);
    for (const target of report.targets)
      if (target.code)
        target.code.revision = `patch:${report.revision.contentHash}:${target.code.side}`;
    dom = generate(repo, report, ["--vscode-local", "--repo", repo]);
    assert.equal(dom.window.document.querySelector('a[href^="vscode:"]'), null);
    assert.match(
      dom.window.document.querySelector(".before")!.textContent!,
      /版.*未確認/,
    );
    dom.window.close();
  });
});

test("存在しないファイル、範囲外のパス、シンボリックリンクにはリンクしない", () => {
  repository((repo, report) => {
    for (const path of [
      "missing.js",
      "../outside.js",
      join(repo, file),
      ".git/config",
    ]) {
      const copy = structuredClone(report);
      for (const target of copy.targets)
        if (target.code) target.code.file = path;
      const dom = generate(repo, copy, ["--vscode-local", "--repo", repo]);
      assert.equal(
        dom.window.document.querySelector('a[href^="vscode:"]'),
        null,
        path,
      );
      dom.window.close();
    }
    const outside = join(repo, "..", "outside");
    mkdirSync(outside);
    writeFileSync(
      join(outside, "result 日本語 #%.js"),
      "return 2;\n// unchanged\n",
    );
    rmSync(join(repo, "src"), { recursive: true });
    symlinkSync(outside, join(repo, "src"), "dir");
    const dom = generate(repo, report, ["--vscode-local", "--repo", repo]);
    assert.equal(dom.window.document.querySelector('a[href^="vscode:"]'), null);
    assert.match(
      dom.window.document.querySelector(".after")!.textContent!,
      /シンボリックリンク/,
    );
    dom.window.close();
  });
});

test("VS Code指定を既存の再レビューと併用し、不完全な引数で出力を上書きしない", () => {
  repository((repo, report) => {
    const review = createReviewTools();
    const saved = join(repo, "state.json");
    writeFileSync(
      saved,
      JSON.stringify(review.markReviewed(review.empty(), report)),
    );
    const dom = generate(repo, report, [
      "--repo",
      repo,
      "--vscode-local",
      "--review-state",
      saved,
    ]);
    assert.ok(dom.window.document.querySelector('a[href^="vscode:"]'));
    assert.equal(
      dom.window.document.querySelector<HTMLButtonElement>("[data-previous]")!
        .disabled,
      false,
    );
    dom.window.close();
    const output = join(repo, "review.html"),
      input = join(repo, "report.json");
    const html = readFileSync(output, "utf8");
    for (const args of [
      ["--vscode-local"],
      ["--vscode-local", "--repo", join(repo, "missing")],
      ["--vscode-local", "--repo", repo, "--unknown"],
    ]) {
      const result = spawnSync(
        process.execPath,
        [cli, input, output, ...args],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 1);
      assert.equal(readFileSync(output, "utf8"), html);
    }
  });
});
