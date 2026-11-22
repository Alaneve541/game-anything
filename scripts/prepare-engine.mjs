#!/usr/bin/env node
/**
 * prepare-engine.mjs — 探测并（可选）安装可脚本化的游戏引擎，让"引擎命令"真的能跑。
 *
 * 默认 dry-run：只打印计划（下载地址、安装目录、验证命令）。加 --apply 才下载安装。
 *
 * 用法：
 *   node scripts/prepare-engine.mjs --engine godot --dir C:/engines/godot            # 打印计划
 *   node scripts/prepare-engine.mjs --engine godot --dir C:/engines/godot --apply    # 下载+解压+验证
 *   node scripts/prepare-engine.mjs --engine unity                                   # Unity Hub / 编辑器的安装与授权说明
 *   node scripts/prepare-engine.mjs --engine unreal                                  # 检测 UE 完整性
 *
 * 说明：
 *   - Godot 是唯一真正免安装、可完全脚本化的引擎（zip 解压即用），所以优先自动安装。
 *   - Unity 需要 Unity Hub + 账号授权（许可证），脚本负责下载 Hub、静默安装并给出编辑器安装命令，授权一步必须人工。
 *   - Unreal 安装数十 GB，需 Epic Games Launcher 与账号，脚本只做完整性检测与升级建议。
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const BOOL = new Set(["apply", "help"]);
function parseArgs(argv) {
  const a = { apply: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const k = t.slice(2);
    if (BOOL.has(k)) { a[k] = true; continue; }
    a[k] = argv[++i];
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const apply = !!args.apply;

function usage() {
  console.error(`用法: node scripts/prepare-engine.mjs --engine <godot|unity|unreal> [--dir <安装目录>] [--version 4.3] [--apply]

  godot   : 下载官方 zip → 解压 → --headless --version 自检（完全可脚本化，推荐）
  unity   : 下载 Unity Hub → 静默安装 → 打印编辑器安装命令（许可证需人工授权）
  unreal  : 检测已安装的 UE 是否完整（缺 Binaries/Win64 即不完整）
  --apply : 真正下载/安装（默认 dry-run）`);
}
if (args.help || !args.engine) { usage(); process.exit(args.help ? 0 : 2); }

const run = (cmd, cmdArgs, opts = {}) => spawnSync(cmd, cmdArgs, { encoding: "utf8", stdio: opts.inherit ? "inherit" : "pipe", ...opts });

function which(cmd) {
  const r = run(process.platform === "win32" ? "where" : "which", [cmd]);
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}
function report(ok, msg) { console.log(`${ok ? "OK  " : "FAIL"} ${msg}`); return ok; }

// ---------------- Godot ----------------
function godotPlan() {
  const version = args.version || "4.3";
  const tag = `${version}-stable`;
  const dir = args.dir || join(homedir(), "engines", "godot");
  const exeName = `Godot_v${tag}_win64.exe`;
  const url = `https://github.com/godotengine/godot/releases/download/${tag}/Godot_v${tag}_win64.exe.zip`;
  const zip = join(dir, "godot.zip");
  return { version, tag, dir, exeName, url, zip, exe: join(dir, exeName) };
}

async function installGodot() {
  const p = godotPlan();
  console.log(`== Godot ${p.tag} ==`);
  console.log(`  目录: ${p.dir}`);
  console.log(`  下载: ${p.url}`);
  console.log(`  解压 → ${p.exeName}`);
  console.log(`  自检: "${p.exe}" --headless --version`);
  if (!apply) { console.log("\n未执行（dry-run）。加 --apply 开始下载安装。"); return 0; }

  mkdirSync(p.dir, { recursive: true });
  if (!existsSync(p.zip)) {
    const dl = run("curl", ["-L", "--fail", "--retry", "3", "--connect-timeout", "15", "-o", p.zip, p.url], { inherit: true });
    if (dl.status !== 0) { console.error("下载失败：检查网络或改用 --url 手动下载后放到目录里"); return 1; }
  } else {
    console.log("已有 zip，跳过下载");
  }
  const unzip = process.platform === "win32"
    ? run("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -Path '${p.zip}' -DestinationPath '${p.dir}' -Force`], { inherit: true })
    : run("unzip", ["-o", p.zip, "-d", p.dir], { inherit: true });
  if (unzip.status !== 0) { console.error("解压失败"); return 1; }

  const ver = run(p.exe, ["--headless", "--version"]);
  if (ver.status !== 0) { console.error(`引擎自检失败（exit ${ver.status}）\n${ver.stderr || ""}`); return 1; }
  report(true, `Godot 可用: ${(ver.stdout || "").trim()}`);
  console.log(`\n设置 PATH 或直接使用: ${p.exe}`);
  return 0;
}

// ---------------- Unity ----------------
function unityPaths() {
  const hub = [
    "C:/Program Files/Unity Hub/Unity Hub.exe",
    join(homedir(), "AppData/Local/Programs/Unity Hub/Unity Hub.exe"),
  ].find(existsSync) || null;
  const editorsDir = "C:/Program Files/Unity/Hub/Editor";
  const editors = existsSync(editorsDir) ? [] : [];
  return { hub, editors };
}
function unityPlan() {
  const hubUrl = "https://public-cdn.cloud.unity3d.com/hub/prod/UnityHubSetup.exe";
  const installer = args.dir ? join(resolve(args.dir), "UnityHubSetup.exe") : join(process.env.TEMP || ".", "UnityHubSetup.exe");
  const ver = args.version || "6000.0.30f1";
  return { hubUrl, installer, ver };
}
function installUnity() {
  const { hub } = unityPaths();
  const p = unityPlan();
  console.log("== Unity ==");
  if (hub) console.log(`  Unity Hub 已安装: ${hub}`);
  else {
    console.log(`  下载 Hub: ${p.hubUrl}`);
    console.log(`  静默安装: "${p.installer}" /S`);
  }
  console.log(`  安装编辑器（需先登录 Hub 并激活许可证）:`);
  console.log(`    "${hub || "C:/Program Files/Unity Hub/Unity Hub.exe"}" -- --headless install --version ${p.ver} --changeset <changeset> --module windows-il2cpp`);
  console.log("  许可证：Hub 登录（人工一次），或 CI 用 UNITY_LICENSE 序列号激活。");
  if (!apply) { console.log("\n未执行（dry-run）。加 --apply 仅执行 Hub 下载与静默安装。"); return 0; }
  if (hub) { console.log("Hub 已存在，跳过安装"); return 0; }
  const dl = run("curl", ["-L", "--fail", "--retry", "3", "-o", p.installer, p.hubUrl], { inherit: true });
  if (dl.status !== 0) { console.error("Hub 下载失败"); return 1; }
  const inst = run(p.installer, ["/S"], { inherit: true });
  if (inst.status !== 0) { console.error(`Hub 安装失败（exit ${inst.status}）`); return 1; }
  report(true, "Unity Hub 已安装；编辑器与许可证仍需人工/CI 配置");
  return 0;
}

// ---------------- Unreal ----------------
function checkUnreal() {
  console.log("== Unreal Engine ==");
  const roots = [];
  for (const base of ["C:/Program Files/Epic Games", "D:/Epic Games", "D:/Program Files/Epic Games"]) {
    if (!existsSync(base)) continue;
    const r = run("cmd", ["/c", "dir", "/b", base], { encoding: "utf8" });
    if (r.status === 0) for (const line of r.stdout.split(/\r?\n/)) {
      if (/^UE_/i.test(line.trim())) roots.push(join(base, line.trim()));
    }
  }
  if (!roots.length) { report(false, "未找到 UE 安装（需要 Epic Games Launcher 安装，约 30–80GB）"); return 1; }
  let allOk = true;
  for (const root of roots) {
    const editor = join(root, "Engine/Binaries/Win64/UnrealEditor.exe");
    const cmd = join(root, "Engine/Binaries/Win64/UnrealEditor-Cmd.exe");
    const ok = existsSync(editor) || existsSync(cmd);
    allOk = allOk && ok;
    report(ok, ok ? `${root} 完整（可无头构建）` : `${root} 不完整：缺 Engine/Binaries/Win64/UnrealEditor*.exe`);
  }
  if (!allOk) console.log("  修复：Epic Games Launcher → UE 版本 → 修复/继续安装（不要在缺失时运行构建命令）");
  return allOk ? 0 : 1;
}

// ---------------- main ----------------
let code = 0;
if (args.engine === "godot") code = await installGodot();
else if (args.engine === "unity") code = installUnity();
else if (args.engine === "unreal") code = checkUnreal();
else { console.error(`未知引擎: ${args.engine}`); code = 2; }

console.log("\n下一步：");
console.log("  node scripts/detect-engine.mjs <项目>   # 确认引擎已被识别");
console.log("  然后按 references/<引擎>.md 执行构建/验证命令");
process.exit(code);
