import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { validateReport, buildPrompt } from "./model.ts";
import { renderReport } from "./render.ts";
import { fixture } from "./fixtures.ts";
import { JSDOM } from "jsdom";

test("CLIはcwdに依存せず単一HTMLを生成し、不正入力で既存出力を上書きしない", () => {
  const temp = mkdtempSync(join(tmpdir(), "change-len-cli-"));
  try {
    const input = join(temp, "report.json"),
      output = join(temp, "review.html");
    const cli = fileURLToPath(new URL("./render.ts", import.meta.url));
    writeFileSync(input, JSON.stringify(fixture()));
    execFileSync(process.execPath, [cli, input, output], {
      cwd: temp,
      stdio: "pipe",
    });
    const html = readFileSync(output, "utf8");
    assert.match(html, /<!doctype html>/);
    assert.match(html, /report-data/);
    const invalid = fixture();
    invalid.targets[0].sourceIds = ["missing"];
    writeFileSync(input, JSON.stringify(invalid));
    const result = spawnSync(process.execPath, [cli, input, output], {
      cwd: temp,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /sourceIds.*missing/);
    assert.equal(readFileSync(output, "utf8"), html);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("CLIをシンボリックリンクから実行してもHTMLを生成する", () => {
  const temp = mkdtempSync(join(tmpdir(), "change-len-symlink-"));
  try {
    const alias = join(temp, "render.ts"),
      input = join(temp, "report.json"),
      output = join(temp, "review.html");
    symlinkSync(fileURLToPath(new URL("./render.ts", import.meta.url)), alias);
    writeFileSync(input, JSON.stringify(fixture()));
    execFileSync(process.execPath, [alias, input, output], {
      cwd: temp,
      stdio: "pipe",
    });
    assert.ok(existsSync(output), "リンク経由でも出力が必要");
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("保存した実コミットのコードと元の差分、JSON・依頼文の版が一致する", () => {
  const r = validateReport(
    JSON.parse(
      readFileSync(
        new URL("../references/example.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const diff = git(
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    r.revision.base!,
    r.revision.head!,
    "--",
  );
  assert.equal(r.sources.find((s) => s.id === "raw-diff")!.excerpt, diff);
  for (const t of r.targets.filter((t) => t.code)) {
    const c = t.code!;
    const content = git("show", `${c.revision}:${c.file}`).split("\n");
    c.lines.forEach((line) =>
      assert.equal(line.text, content[line.number - 1]),
    );
  }
  const prompt = buildPrompt(r, [
    { targetId: "code.skill.L3", body: "適用条件を見直す" },
  ]);
  assert.ok(prompt.includes(r.revision.head!));
  assert.ok(prompt.includes("skills/define-completion/SKILL.md"));
  const html = renderReport(r);
  assert.ok(html.includes(r.revision.head!));
});

test("同梱スクリプト・スタイルのCSPハッシュは実際の内容に一致する", () => {
  const html = renderReport(fixture());
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  );
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(
    (m) => m[1],
  );
  for (const content of [...scripts, ...styles])
    assert.ok(
      html.includes(
        "'sha256-" +
          createHash("sha256").update(content).digest("base64") +
          "'",
      ),
    );
});

test("実PR・Issueと資料なし差分は同じ生成コードで異なる内容・版・対応不足を表す", () => {
  const pr = validateReport(
    JSON.parse(
      readFileSync(
        new URL("../references/pr-example.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  const diff = validateReport(
    JSON.parse(
      readFileSync(
        new URL("../references/diff-example.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  assert.equal(pr.revision.kind, "pr");
  assert.equal(pr.revision.base, "da3f388c1485ae03b0bc3dfb3fd79dc37cc91dfd");
  const before = pr.targets.find((t) => t.id === "pr.before")!.code!,
    after = pr.targets.find((t) => t.id === "code.skill")!.code!;
  assert.equal(
    before.lines.find((l) => l.change === "removed")!.text.trim(),
    "bool experimental_strip_types = false;",
  );
  assert.equal(
    after.lines.find((l) => l.change === "added")!.text.trim(),
    "bool experimental_strip_types = true;",
  );
  assert.equal(
    pr.requirements.find((q) => q.id === "TS-02")!.changeIds.length,
    0,
  );
  assert.equal(diff.requirements.length, 0);
  assert.equal(diff.revision.head, null);
  const dom = new JSDOM(renderReport(pr), { runScripts: "dangerously" });
  assert.match(
    dom.window.document.querySelector("main")!.textContent!,
    /型を消して/,
  );
  assert.match(
    dom.window.document.querySelector('[data-screen="requirements"]')!
      .textContent!,
    /対応する変更なし/,
  );
  const prompt = buildPrompt(pr, [
    { targetId: "pr.before.L250", body: "変更前を確認" },
    { targetId: "pr.after.L250", body: "変更後を確認" },
  ]);
  assert.match(prompt, /src\/node_options.h.*変更前.*da3f388/);
  assert.match(prompt, /src\/node_options.h.*変更後.*d847c32/);
  assert.match(prompt, /TS-01/);
  assert.ok(!prompt.includes("SKILL.md"));
  dom.window.close();
  const noDocs = new JSDOM(renderReport(diff), { runScripts: "dangerously" });
  assert.match(
    noDocs.window.document.querySelector('[data-screen="requirements"]')!
      .textContent!,
    /資料は渡されていません/,
  );
  noDocs.window.close();
});

test("標準入力のNodeプログラムからも生成関数を読み込める", () => {
  const url = new URL("./render.ts", import.meta.url).href;
  const result = spawnSync(process.execPath, ["--input-type=module", "-"], {
    input: `import {renderReport} from ${JSON.stringify(url)}; console.log(typeof renderReport);`,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /function/);
});
