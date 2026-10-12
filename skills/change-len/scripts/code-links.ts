import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Code, Report } from "./model.ts";

export type CodeLink = { url: string } | { reason: string };

export function localCodeLinks(
  report: Report,
  repository: string,
): Record<string, CodeLink> {
  const root = realpathSync(resolve(repository));
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  if (
    realpathSync(git("rev-parse", "--show-toplevel").toString().trim()) !== root
  )
    throw new Error("--repo にはローカルリポジトリのルートを指定してください");

  function reference(code: Code): CodeLink {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(code.revision))
      return { reason: "コードの版が未確認です" };
    const parts = code.file.split("/");
    if (
      /^[A-Za-z]:/.test(code.file) ||
      /[\\\0]/.test(code.file) ||
      parts.some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      )
    )
      return { reason: "リポジトリ内の相対ファイルパスではありません" };
    let path = root;
    try {
      for (const part of parts) {
        path = join(path, part);
        if (lstatSync(path).isSymbolicLink())
          return { reason: "シンボリックリンクの参照先は確認しません" };
      }
      if (!lstatSync(path).isFile())
        return { reason: "ローカルファイルがありません" };
    } catch {
      return { reason: "ローカルファイルがありません" };
    }
    try {
      if (
        git("rev-parse", "--verify", `${code.revision}^{commit}`)
          .toString()
          .trim() !== code.revision
      )
        return { reason: "対象コミットの版を確認できません" };
      const entry = git("ls-tree", "-z", code.revision, "--", code.file)
        .toString()
        .split("\0")
        .find((row) => row.slice(row.indexOf("\t") + 1) === code.file);
      const metadata = entry?.slice(0, entry.indexOf("\t"));
      const match = metadata?.match(/^100(?:644|755) blob ([a-f0-9]+)$/);
      if (!match) return { reason: "対象版の通常ファイルを確認できません" };
      const blob = git("cat-file", "blob", match[1]);
      if (!readFileSync(path).equals(blob))
        return { reason: "ローカルファイルが対象版の内容と一致しません" };
      const lines = blob.toString("utf8").split("\n");
      if (
        code.lines.some(
          (line) => lines[line.number - 1]?.replace(/\r$/, "") !== line.text,
        )
      )
        return { reason: "掲載コードと対象版の行が一致しません" };
      return { url: `vscode://file${pathToFileURL(path).pathname}` };
    } catch {
      return { reason: "対象版またはローカルファイルを確認できません" };
    }
  }

  const links: [string, CodeLink][] = [];
  for (const target of report.targets) {
    if (!target.code) continue;
    const code = target.code,
      link = reference(code);
    if ("url" in link) {
      links.push([target.id, { url: `${link.url}:${code.lines[0].number}:1` }]);
      for (const line of code.lines)
        links.push([line.id, { url: `${link.url}:${line.number}:1` }]);
    } else links.push([target.id, link]);
  }
  return Object.fromEntries(links);
}
