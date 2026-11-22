#!/usr/bin/env node
/**
 * detect-engine.mjs — 识别游戏工程所用引擎，并检查本机引擎与工具链是否就绪。
 *
 * 用法：
 *   node detect-engine.mjs [项目目录...] [--json] [--depth=4]
 *
 * 只依赖 Node 内置模块，Node 18+ 可用（本机 24）。
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".svn", ".hg",
  "library", "temp", "obj", "bin", "intermediate", "saved",
  "deriveddatacache", ".godot", ".vs", ".idea", "dist", "build",
  "__pycache__", ".venv", "venv", "target", "packages",
]);

const MAX_ENTRIES = 40000;

function parseArgs(argv) {
  const out = { roots: [], json: false, depth: 4 };
  for (const a of argv) {
    if (a === "--json") out.json = true;
    else if (a.startsWith("--depth=")) out.depth = Math.max(1, Number(a.slice(8)) || 4);
    else if (!a.startsWith("-")) out.roots.push(a);
  }
  if (out.roots.length === 0) out.roots.push(process.cwd());
  return out;
}

function walk(root, maxDepth) {
  const rels = [];
  const contents = new Map();
  let count = 0;

  const interesting = /^(package\.json|cargo\.toml|go\.mod|build\.gradle|build\.gradle\.kts|requirements\.txt|pyproject\.toml|pom\.xml)$/i;

  function visit(dir, depth) {
    if (depth > maxDepth || count >= MAX_ENTRIES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (count >= MAX_ENTRIES) return;
      const abs = path.join(dir, ent.name);
      const rel = path.relative(root, abs).split(path.sep).join("/");
      const lower = rel.toLowerCase();
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name.toLowerCase())) continue;
        visit(abs, depth + 1);
        continue;
      }
      count++;
      rels.push(lower);
      if (interesting.test(ent.name) || /\.csproj$/i.test(ent.name)) {
        try {
          const st = fs.statSync(abs);
          if (st.size < 2 * 1024 * 1024) {
            contents.set(lower, fs.readFileSync(abs, "utf8").slice(0, 200_000));
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  visit(root, 0);
  return { rels, set: new Set(rels), contents, count };
}

function firstMatch(rels, re) {
  return rels.find((r) => re.test(r)) || null;
}

const RULES = [
  {
    id: "unreal", name: "Unreal Engine", score: 100,
    test: ({ rels }) => firstMatch(rels, /\.uproject$/i),
  },
  {
    id: "unity", name: "Unity", score: 100,
    test: ({ rels }) => firstMatch(rels, /(^|\/)projectsettings\/projectversion\.txt$/i),
  },
  {
    id: "godot", name: "Godot", score: 100,
    test: ({ set }) => set.has("project.godot") ? "project.godot" : null,
  },
  {
    id: "gamemaker", name: "GameMaker", score: 100,
    test: ({ rels }) => firstMatch(rels, /\.yyp$/i),
  },
  {
    id: "rpgmv", name: "RPG Maker MV", score: 95,
    test: ({ rels, set }) =>
      firstMatch(rels, /(^|\/)game\.rpgproject$/i) ||
      (set.has("js/rpg_core.js") && firstMatch(rels, /(^|\/)data\/system\.json$/i) ? "js/rpg_core.js" : null),
  },
  {
    id: "rpgmz", name: "RPG Maker MZ", score: 95,
    test: ({ rels, set }) =>
      firstMatch(rels, /(^|\/)game\.rmmzproject$/i) ||
      (set.has("js/rmmz_core.js") ? "js/rmmz_core.js" : null),
  },
  {
    id: "construct", name: "Construct 3", score: 90,
    test: ({ rels }) => firstMatch(rels, /\.(c3p|c3proj)$/i),
  },
  {
    id: "cocos", name: "Cocos Creator", score: 90,
    test: ({ rels }) => {
      const hasAssets = rels.some((r) => r.startsWith("assets/") && r.endsWith(".meta"));
      const hasSettings = rels.some((r) => r.startsWith("settings/"));
      const pkg = rels.find((r) => r.endsWith("package.json"));
      return hasAssets && hasSettings ? (pkg || "assets/**/*.meta + settings/") : null;
    },
  },
  {
    id: "roblox", name: "Roblox (Rojo)", score: 85,
    test: ({ rels, set }) =>
      (set.has("default.project.json") ? "default.project.json" : null) ||
      firstMatch(rels, /\.(rbxlx|rbxl)$/i),
  },
  {
    id: "defold", name: "Defold", score: 85,
    test: ({ set }) => set.has("game.project") ? "game.project" : null,
  },
  {
    id: "haxeflixel", name: "HaxeFlixel / OpenFL", score: 80,
    test: ({ set }) => set.has("project.xml") ? "project.xml" : null,
  },
  {
    id: "bevy", name: "Bevy (Rust)", score: 80,
    test: ({ contents }) => {
      for (const [rel, txt] of contents) {
        if (rel.endsWith("cargo.toml") && /^\s*bevy\s*=/m.test(txt)) return rel;
      }
      return null;
    },
  },
  {
    id: "monogame", name: "MonoGame / FNA", score: 80,
    test: ({ contents }) => {
      for (const [rel, txt] of contents) {
        if (rel.endsWith(".csproj") && /MonoGame\.Framework|FNA/i.test(txt)) return rel;
      }
      return null;
    },
  },
  {
    id: "libgdx", name: "LibGDX", score: 80,
    test: ({ contents }) => {
      for (const [rel, txt] of contents) {
        if (/build\.gradle(\.kts)?$/.test(rel) && /com\.badlogicgames\.gdx|libgdx/i.test(txt)) return rel;
      }
      return null;
    },
  },
  {
    id: "ebiten", name: "Ebitengine (Go)", score: 80,
    test: ({ contents }) => {
      for (const [rel, txt] of contents) {
        if (rel.endsWith("go.mod") && /ebiten/i.test(txt)) return rel;
      }
      return null;
    },
  },
  {
    id: "love", name: "LÖVE (Lua)", score: 75,
    test: ({ set }) => set.has("conf.lua") && set.has("main.lua") ? "conf.lua + main.lua" : null,
  },
  {
    id: "pygame", name: "pygame", score: 70,
    test: ({ contents }) => {
      for (const [rel, txt] of contents) {
        if (/requirements\.txt|pyproject\.toml|setup\.py$/i.test(rel) && /pygame/i.test(txt)) return rel;
      }
      return null;
    },
  },
  {
    id: "phaser", name: "Phaser (Web)", score: 70,
    test: ({ contents }) => depMatch(contents, /"phaser"\s*:/i),
  },
  {
    id: "three", name: "Three.js (Web)", score: 70,
    test: ({ contents }) => depMatch(contents, /"three"\s*:/i),
  },
  {
    id: "babylon", name: "Babylon.js (Web)", score: 70,
    test: ({ contents }) => depMatch(contents, /@babylonjs\/core/i),
  },
  {
    id: "pixi", name: "PixiJS (Web)", score: 65,
    test: ({ contents }) => depMatch(contents, /"pixi\.js"\s*:/i),
  },
  {
    id: "kaplay", name: "Kaplay (Web)", score: 65,
    test: ({ contents }) => depMatch(contents, /"(kaplay|kaboom)"\s*:/i),
  },
  {
    id: "web", name: "Web / HTML5 (无框架)", score: 20,
    test: ({ set }) => set.has("index.html") ? "index.html" : null,
  },
];

function depMatch(contents, re) {
  for (const [rel, txt] of contents) {
    if (/(^|\/)package\.json$/i.test(rel) && re.test(txt)) return rel;
  }
  return null;
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => path.join(dir, e.name));
  } catch {
    return [];
  }
}

function existsAny(paths) {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function tryExec(cmd, args, timeout = 8000) {
  try {
    const out = execFileSync(cmd, args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"] });
    return out.trim();
  } catch {
    return null;
  }
}

function checkEngines() {
  const isWin = process.platform === "win32";
  const report = {};

  // Unity
  const unityRoots = isWin
    ? ["C:\\Program Files\\Unity\\Hub\\Editor", "C:\\Program Files\\Unity\\Editor"]
    : ["/Applications/Unity/Hub/Editor", path.join(os.homedir(), "Unity/Hub/Editor")];
  const unityVersions = [];
  for (const root of unityRoots) {
    for (const dir of listDirs(root)) {
      const exe = isWin ? path.join(dir, "Editor", "Unity.exe") : path.join(dir, "Unity.app", "Contents", "MacOS", "Unity");
      if (fs.existsSync(exe)) unityVersions.push({ version: path.basename(dir), path: exe });
    }
  }
  report.unity = unityVersions.length
    ? { status: "ok", versions: unityVersions }
    : { status: "missing" };

  // Unreal
  const ueRoots = isWin ? ["C:\\Program Files\\Epic Games", "D:\\Epic Games", "E:\\Epic Games"] : ["/Users/Shared/Epic Games"];
  const unreal = [];
  for (const root of ueRoots) {
    for (const dir of listDirs(root)) {
      if (!/UE_\d/i.test(path.basename(dir))) continue;
      const bin = isWin
        ? path.join(dir, "Engine", "Binaries", "Win64", "UnrealEditor.exe")
        : path.join(dir, "Engine", "Binaries", "Mac", "UnrealEditor.app");
      unreal.push({
        path: dir,
        complete: fs.existsSync(bin),
        missing: fs.existsSync(bin) ? null : (isWin ? "Engine/Binaries/Win64/UnrealEditor.exe" : "Engine/Binaries/Mac/UnrealEditor.app"),
      });
    }
  }
  report.unreal = unreal.length
    ? { status: unreal.some((u) => u.complete) ? "ok" : "incomplete", installs: unreal }
    : { status: "missing" };

  // Godot
  const godotCmd = tryExec(isWin ? "godot.exe" : "godot", ["--version"]) || tryExec("godot", ["--version"]);
  const godotPaths = isWin
    ? ["C:\\Program Files\\Godot", path.join(os.homedir(), "AppData", "Local", "Programs", "Godot")]
    : ["/Applications/Godot.app", "/usr/bin/godot", "/usr/local/bin/godot"];
  const godotFound = existsAny(godotPaths);
  report.godot = godotCmd
    ? { status: "ok", version: godotCmd, path: godotFound }
    : { status: godotFound ? "found-no-cli" : "missing", path: godotFound };

  // GameMaker
  const gmRuntimes = isWin ? "C:\\ProgramData\\GameMakerStudio2\\Cache\\runtimes" : null;
  const gmRuntimeDirs = gmRuntimes ? listDirs(gmRuntimes) : [];
  const gmIde = isWin
    ? existsAny(["C:\\Program Files\\GameMaker Studio 2", path.join(os.homedir(), "AppData", "Local", "GameMaker Studio 2")])
    : existsAny(["/Applications/GameMaker.app"]);
  report.gamemaker = gmRuntimeDirs.length
    ? { status: "ok", ide: gmIde, runtimes: gmRuntimeDirs.map((d) => path.basename(d)) }
    : { status: gmIde ? "ide-no-runtime" : "missing", ide: gmIde };

  // Cocos Creator
  const cocosDirs = isWin ? listDirs("C:\\ProgramData\\cocos\\editors") : listDirs(path.join(os.homedir(), "Library", "Application Support", "Cocos", "editors"));
  const cocosDash = isWin
    ? existsAny(["C:\\ProgramData\\cocos\\editors", path.join(os.homedir(), "AppData", "Local", "CocosDashboard")])
    : existsAny([path.join(os.homedir(), "Library", "Application Support", "Cocos")]);
  report.cocos = cocosDirs.length
    ? { status: "ok", editors: cocosDirs.map((d) => path.basename(d)) }
    : { status: cocosDash ? "dashboard-only" : "missing", dashboard: cocosDash };

  // RPG Maker
  const rpg = isWin
    ? existsAny(["C:\\Program Files\\RPG Maker MV", "C:\\Program Files\\RPG Maker MZ", "C:\\Program Files (x86)\\Steam\\steamapps\\common\\RPG Maker MV"])
    : null;
  report.rpgmaker = rpg ? { status: "ok", path: rpg } : { status: "missing" };

  // dotnet SDK
  const dotnetSdks = tryExec("dotnet", ["--list-sdks"], 10000);
  report.dotnet = dotnetSdks
    ? { status: "ok", sdks: dotnetSdks.split(/\r?\n/).filter(Boolean) }
    : { status: tryExec("dotnet", ["--version"]) ? "runtime-only" : "missing" };

  // Node
  report.node = { status: "ok", version: process.version };

  // Browsers
  const browsers = {};
  if (isWin) {
    const edge = existsAny([
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ]);
    const chrome = existsAny([
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
    ]);
    if (edge) browsers.edge = edge;
    if (chrome) browsers.chrome = chrome;
  } else if (process.platform === "darwin") {
    const edge = existsAny(["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]);
    const chrome = existsAny(["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]);
    if (edge) browsers.edge = edge;
    if (chrome) browsers.chrome = chrome;
  } else {
    const chrome = existsAny(["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]);
    if (chrome) browsers.chrome = chrome;
  }
  report.browsers = Object.keys(browsers).length ? { status: "ok", ...browsers } : { status: "missing" };

  return report;
}

function suggest(matches, engines) {
  const tips = [];
  const best = matches[0];
  if (best) {
    const st = engines[best.id]?.status;
    if (best.id === "unreal") {
      if (st === "ok") tips.push("工程是 Unreal：用 UnrealEditor-Cmd 做 Python 自动化、Automation 测试与 BuildCookRun 打包。");
      else tips.push("工程是 Unreal，但本机引擎安装不完整或缺失：先修安装，否则任何构建命令都会失败；可先用 Web 原型验证玩法。");
    } else if (best.id === "unity") {
      if (st === "ok") tips.push("工程是 Unity：用 batchmode + -executeMethod 构建，-runTests 跑测试。");
      else tips.push("工程是 Unity，但本机没有可用的 Unity 编辑器：给出可导入的脚本与场景生成方法，并请用户在本机打开验证。");
    } else if (best.id === "godot") {
      tips.push(st === "ok" ? "工程是 Godot：用 --headless 跑逻辑测试，--export-release 打包。" : "工程是 Godot，但缺少 CLI/编辑器：安装 4.x 后用 --headless 验证。");
    } else if (["phaser", "three", "babylon", "pixi", "kaplay", "web"].includes(best.id)) {
      tips.push("工程是 Web：用 npm run dev 起服务，再用 scripts/verify-web.mjs 做无头截图与状态断言。");
    } else if (["bevy", "monogame", "love", "pygame", "libgdx", "ebiten"].includes(best.id)) {
      tips.push("代码引擎：保证 core 逻辑与渲染分离，用宿主测试框架做无头验证。");
    } else {
      tips.push(`工程是 ${best.name}：先读 references 中对应章节，确认哪些步骤必须走 GUI。`);
    }
  } else {
    tips.push("未识别出既有游戏工程。按目标平台选引擎；若只需当天可玩，用 templates/web-canvas 起步。");
  }

  if (engines.browsers.status === "ok" && engines.node.status === "ok") {
    tips.push("Web 路径可做无头验证（Node + 浏览器均可用）。");
  } else if (engines.browsers.status !== "ok") {
    tips.push("未找到 Edge/Chrome，Web 截图验证不可用；先安装浏览器或改用引擎自带截图。");
  }
  return tips;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const projects = [];

  for (const root of args.roots) {
    const abs = path.resolve(root);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      projects.push({ root: abs, error: "path not found" });
      continue;
    }
    if (!stat.isDirectory()) {
      projects.push({ root: abs, error: "not a directory" });
      continue;
    }
    const scan = walk(abs, args.depth);
    const matches = [];
    for (const rule of RULES) {
      let evidence = null;
      try {
        evidence = rule.test(scan);
      } catch {
        evidence = null;
      }
      if (evidence) matches.push({ id: rule.id, name: rule.name, score: rule.score, evidence });
    }
    matches.sort((a, b) => b.score - a.score);
    projects.push({
      root: abs,
      scannedFiles: scan.count,
      truncated: scan.count >= MAX_ENTRIES,
      matches,
      best: matches[0] || null,
    });
  }

  const engines = checkEngines();
  const out = { projects, engines, generatedAt: new Date().toISOString() };

  if (args.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  for (const p of projects) {
    console.log(`\n== 项目识别: ${p.root} ==`);
    if (p.error) {
      console.log(`  ! ${p.error}`);
      continue;
    }
    console.log(`  扫描文件: ${p.scannedFiles}${p.truncated ? " (已截断)" : ""}`);
    if (!p.matches.length) {
      console.log("  未识别出游戏工程");
    }
    for (const m of p.matches) {
      console.log(`  [${m.score}] ${m.name}  <- ${m.evidence}`);
    }
    console.log("  建议:");
    for (const t of suggest(p.matches, engines)) console.log(`   - ${t}`);
  }

  console.log("\n== 本机引擎 ==");
  for (const [k, v] of Object.entries(engines)) {
    if (k === "browsers" || k === "node" || k === "dotnet") continue;
    const detail = v.status === "ok"
      ? JSON.stringify(v.versions || v.installs || v.runtimes || v.editors || v.path || v.version || "")
      : JSON.stringify(v);
    console.log(`  ${k.padEnd(10)} ${v.status.padEnd(14)} ${detail}`);
  }

  console.log("\n== 工具链 ==");
  console.log(`  node       ${engines.node.version}`);
  console.log(`  dotnet     ${engines.dotnet.status}${engines.dotnet.sdks ? " " + engines.dotnet.sdks.join(", ") : ""}`);
  console.log(`  browsers   ${engines.browsers.status}${engines.browsers.edge ? " edge=" + engines.browsers.edge : ""}${engines.browsers.chrome ? " chrome=" + engines.browsers.chrome : ""}`);
  console.log("");
}

main();
