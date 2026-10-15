import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import { fixture } from "./fixtures.ts";
import { renderReport } from "./render.ts";
import { createReviewTools } from "./review-state.ts";

test("同梱ランチャーは別cwd・空白付きパスから生成し、既存オプションを渡せる", () => {
  const temp = mkdtempSync(join(tmpdir(), "change-len launcher "));
  try {
    const skill = join(temp, "スキル with spaces");
    symlinkSync(fileURLToPath(new URL("../", import.meta.url)), skill, "dir");
    const cli = join(skill, "scripts/render.sh");
    const report = fixture();
    const input = "入力 report.json",
      output = "出力 review.html";
    writeFileSync(join(temp, input), JSON.stringify(report));
    execFileSync(cli, [input, output], { cwd: temp, stdio: "pipe" });
    assert.equal(
      readFileSync(join(temp, output), "utf8"),
      renderReport(report),
    );

    execFileSync("git", ["init", "-q"], { cwd: temp, stdio: "pipe" });
    const review = createReviewTools();
    const state = review.save(
      review.empty(),
      report,
      "new-line",
      "保存した指摘",
      "comment.1",
    );
    const saved = "保存 state.json";
    writeFileSync(join(temp, saved), JSON.stringify(state));
    execFileSync(
      cli,
      [input, output, "--review-state", saved, "--repo", ".", "--vscode-local"],
      {
        cwd: temp,
        stdio: "pipe",
      },
    );
    assert.equal(
      readFileSync(join(temp, output), "utf8"),
      renderReport(report, state, {
        vscodeLocal: true,
        repo: temp,
      }),
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("同梱ランチャーはエラーと終了コードを伝え、不正入力で出力を上書きしない", () => {
  const temp = mkdtempSync(join(tmpdir(), "change-len-launcher-error-"));
  try {
    const cli = fileURLToPath(new URL("./render.sh", import.meta.url));
    writeFileSync(join(temp, "report.json"), "{}");
    writeFileSync(join(temp, "review.html"), "既存のHTML");
    const invalid = spawnSync(cli, ["report.json", "review.html"], {
      cwd: temp,
      encoding: "utf8",
    });
    assert.equal(invalid.status, 1, invalid.error?.message);
    assert.match(invalid.stderr, /schemaVersion/);
    assert.equal(readFileSync(join(temp, "review.html"), "utf8"), "既存のHTML");

    const missing = spawnSync(cli, [], { cwd: temp, encoding: "utf8" });
    assert.equal(missing.status, 1, missing.error?.message);
    assert.match(missing.stderr, /使い方: .*render\.sh/);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
