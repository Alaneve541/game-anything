#!/usr/bin/env node
/**
 * sync-github.mjs — 当 github.com:443（git 协议）被阻断、只剩 api.github.com 可用时，
 * 用 GitHub Git Data API 把本地仓库当前提交的内容同步到远端，产生一个普通 commit。
 *
 * 用法：
 *   node sync-github.mjs                      # dry-run：只报告差异
 *   node sync-github.mjs --apply              # 真正写入（生成 commit 并更新分支）
 *   node sync-github.mjs --apply --message "docs: ..."   # 自定义 commit message
 *   node sync-github.mjs --dir <repo> --repo owner/name --branch main
 *
 * 认证：优先 `gh auth token`；其次环境变量 GITHUB_TOKEN / GH_TOKEN。
 * 前提：本地工作区干净且已 commit（否则报错退出）。只同步 git 跟踪的文件。
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const USAGE = `sync-github.mjs — 通过 GitHub Git Data API 同步本地提交（git 协议被阻断时可用）

  node sync-github.mjs                        dry-run：只报告差异
  node sync-github.mjs --apply               写入远端（一个 commit）
  node sync-github.mjs --apply --message "…" 自定义 commit message
  node sync-github.mjs --dir <repo> --repo owner/name --branch main

认证：GH_BIN 指向 gh，或 PATH 里的 gh，或 GITHUB_TOKEN/GH_TOKEN。
只同步 git 跟踪的文件；要求工作区干净。`;

const args = { dir: ".", branch: "main", apply: false, repo: "", message: "" };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  const next = () => process.argv[++i];
  switch (a) {
    case "--dir": args.dir = next(); break;
    case "--branch": args.branch = next(); break;
    case "--repo": args.repo = next(); break;
    case "--message": args.message = next(); break;
    case "--apply": args.apply = true; break;
    case "-h": case "--help":
      console.log(USAGE);
      process.exit(0);
    default: console.error(`unknown arg: ${a}`); process.exit(2);
  }
}

const DIR = resolve(args.dir);
const git = (...a) => execFileSync("git", ["-C", DIR, ...a], { encoding: "utf8" });

// --- 仓库与认证 ---
let repo = args.repo;
if (!repo) {
  const url = git("remote", "get-url", "origin").trim();
  const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/);
  if (!m) { console.error(`无法从 origin 解析 owner/name：${url}`); process.exit(2); }
  repo = `${m[1]}/${m[2]}`;
}
let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
if (!token) {
  const ghBin = process.env.GH_BIN
    || (existsSync("C:/Users/alane/Apps/gh/bin/gh.exe") ? "C:/Users/alane/Apps/gh/bin/gh.exe" : "gh");
  try {
    token = execFileSync(ghBin, ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    console.error("没有 token：先 `gh auth login`，或设置 GITHUB_TOKEN 环境变量。");
    process.exit(2);
  }
}

const api = async (method, path, body) => {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "game-anything-sync",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
};

// --- 本地状态 ---
if (git("status", "--porcelain").trim()) {
  console.error("工作区有未提交改动，先 commit 再同步（同步的是提交内容，不是工作区）。");
  process.exit(2);
}
const localHead = git("rev-parse", "HEAD").trim();
const localFiles = git("ls-files", "-s").trim().split("\n").filter(Boolean).map((line) => {
  const [meta, path] = line.split("\t");
  const [mode, sha] = meta.split(" "); // "<mode> <sha> <stage>"
  return { mode, sha, path };
});

// --- 远端树 ---
const ref = await api("GET", `/repos/${repo}/git/ref/heads/${args.branch}`);
const remoteHead = ref.object.sha;
const remoteCommit = await api("GET", `/repos/${repo}/git/commits/${remoteHead}`);
const remoteTree = await api("GET", `/repos/${repo}/git/trees/${remoteCommit.tree.sha}?recursive=1`);
const remoteMap = new Map(remoteTree.tree.filter((e) => e.type === "blob").map((e) => [e.path, e.sha]));
const localMap = new Map(localFiles.map((f) => [f.path, f.sha]));

const updated = localFiles.filter((f) => remoteMap.get(f.path) !== f.sha);
const deleted = [...remoteMap.keys()].filter((p) => !localMap.has(p));

console.log(`repo    ${repo}@${args.branch}`);
console.log(`remote  ${remoteHead.slice(0, 10)} (${remoteMap.size} files)`);
console.log(`local   ${localHead.slice(0, 10)} (${localMap.size} files)`);
console.log(`diff    ${updated.length} changed/added, ${deleted.length} deleted`);

if (!updated.length && !deleted.length) {
  console.log("远端内容已与本地一致，无需同步。");
  process.exit(0);
}
for (const f of updated.slice(0, 20)) {
  const size = existsSync(join(DIR, f.path)) ? readFileSync(join(DIR, f.path)).length : 0;
  console.log(`  ${remoteMap.has(f.path) ? "M" : "A"} ${f.path} (${size}B)`);
}
if (updated.length > 20) console.log(`  ... 另有 ${updated.length - 20} 个改动`);
for (const p of deleted.slice(0, 20)) console.log(`  D ${p}`);

if (!args.apply) {
  console.log("\n[dry-run] 加 --apply 才会创建 commit 并更新分支。");
  process.exit(0);
}

// --- 上传 blob 并建树 ---
const tree = [];
for (const f of updated) {
  // 用 index 里的 blob 内容（而不是工作区字节），避免 CRLF/过滤器导致远端与本地 blob 不一致
  const buf = execFileSync("git", ["-C", DIR, "cat-file", "blob", f.sha], { maxBuffer: 64 * 1024 * 1024 });
  const blob = await api("POST", `/repos/${repo}/git/blobs`, {
    content: buf.toString("base64"),
    encoding: "base64",
  });
  tree.push({ path: f.path, mode: f.mode, type: "blob", sha: blob.sha });
}
for (const p of deleted) tree.push({ path: p, mode: "100644", type: "blob", sha: null });

const newTree = await api("POST", `/repos/${repo}/git/trees`, { base_tree: remoteCommit.tree.sha, tree });
const message = args.message || git("log", "-1", "--pretty=%B", "HEAD").trim();
const commit = await api("POST", `/repos/${repo}/git/commits`, {
  message,
  tree: newTree.sha,
  parents: [remoteHead],
});
const updatedRef = await api("PATCH", `/repos/${repo}/git/refs/heads/${args.branch}`, { sha: commit.sha, force: false });
console.log(`\ncommit  ${commit.sha}`);
console.log(`ref     ${updatedRef.object.sha} -> https://github.com/${repo}/commit/${commit.sha}`);
