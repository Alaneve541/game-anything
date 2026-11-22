#!/usr/bin/env node
/**
 * publish.mjs — 把构建产物推到各平台的统一入口。
 *
 * 默认 dry-run：只打印将要执行的命令与校验步骤；加 --apply 才真的执行。
 *
 * 用法：
 *   node scripts/publish.mjs --target itch --build build/win --user alane --game mygame --channel windows
 *   node scripts/publish.mjs --target steam --script steam/app_build_1234560.vdf --user "$STEAM_USER"
 *   node scripts/publish.mjs --target web --dir dist --out release/mygame-web.zip
 *   node scripts/publish.mjs --target wechat --project minigame/ --version 0.3.1
 *   node scripts/publish.mjs --target android --gradle-dir android --json-key "$PLAY_JSON_KEY"
 *
 * 通用参数：
 *   --target <name>   itch | steam | web | wechat | android | ios
 *   --apply           真正执行（默认只打印）
 *   --version <v>     版本号（默认 git describe --tags --always，失败则用时间戳）
 *   --dry-run         显式 dry-run（默认行为）
 *
 * 安全：命令回显会遮蔽 token/password/api_key 等；密钥请只从环境变量读。
 */

import { spawnSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BOOL = new Set(["apply", "help"]);
function parseArgs(argv) {
  const a = { version: null, apply: false, help: false };
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
const target = args.target;

function usage() {
  console.error(`用法: node scripts/publish.mjs --target <itch|steam|web|wechat|android|ios> [选项] [--apply]
  itch:    --build <dir> --user <u> --game <g> [--channel windows] [--butler <path>]
  steam:   --script <app_build.vdf> [--steamcmd <path>] [--user <u>]
  web:     --dir <dist> [--out release/web.zip] [--deploy cloudflare|netlify|none]
  wechat:  --project <minigame dir> [--cli <微信开发者工具 cli.bat>]
  android: --gradle-dir <android> [--json-key <path>] [--track internal]
  ios:     --project <xcodeproj> --scheme <name> [--export-dir build]
默认 dry-run；加 --apply 执行。`);
}
if (args.help || !target) { usage(); process.exit(args.help ? 0 : 2); }

function getVersion() {
  if (args.version) return String(args.version);
  try {
    return execSync("git describe --tags --always --dirty", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }
}
const VERSION = getVersion();

const redact = (s) => String(s)
  .replace(/(token|password|passwd|api[_-]?key|secret)=\S+/gi, "$1=***")
  .replace(/(gh[opsu]_[A-Za-z0-9]{4})[A-Za-z0-9_]+/g, "$1***");

function which(cmd) {
  try {
    const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
    return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
  } catch { return null; }
}

const plan = []; // { desc, cmd, args, optional }
function step(desc, cmd, cmdArgs, optional = false) { plan.push({ desc, cmd, args: cmdArgs, optional }); }

function needFile(p, what) {
  if (!existsSync(p)) { console.error(`错误：找不到${what}: ${p}`); process.exit(2); }
  return resolve(p);
}
function dirSize(p) {
  try { return statSync(p).isDirectory() ? "[dir]" : `${statSync(p).size} bytes`; } catch { return "?"; }
}

switch (target) {
  case "itch": {
    if (!args.build || !args.user || !args.game) { console.error("itch 需要 --build --user --game"); process.exit(2); }
    needFile(args.build, "构建目录");
    const channel = args.channel || "windows";
    const butler = args.butler || which("butler");
    if (!butler) {
      console.error("未找到 butler。安装：curl -L -o butler.zip https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default && unzip butler.zip");
      console.error("安装后可设置 BUTLER_PATH 或 --butler 指定路径。");
      process.exit(3);
    }
    const ref = `${args.user}/${args.game}:${channel}`;
    step(`上传 ${args.build} → ${ref} (${VERSION})`, butler, ["push", args.build, ref, "--userversion", VERSION]);
    step("校验 channel 状态", butler, ["status", `${args.user}/${args.game}`], true);
    break;
  }
  case "steam": {
    const vdf = needFile(args.script, "app_build VDF");
    const steamcmd = args.steamcmd || which("steamcmd") || which("steamcmd.exe");
    if (!steamcmd) {
      console.error("未找到 steamcmd。下载：https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip 解压后设置 --steamcmd 或 PATH。");
      process.exit(3);
    }
    const user = args.user || process.env.STEAM_USER || "<steam-user>";
    step(`SteamPipe 上传 ${vdf}`, steamcmd, ["+login", user, "+run_app_build", vdf, "+quit"]);
    step("检查输出目录是否有构建日志", "cmd", ["/c", "dir", dirname(vdf)], true);
    break;
  }
  case "web": {
    if (!args.dir) { console.error("web 需要 --dir <dist>"); process.exit(2); }
    needFile(args.dir, "Web 构建目录");
    const out = args.out || `release/web-${VERSION}.zip`;
    mkdirSync(dirname(out), { recursive: true });
    if (process.platform === "win32") {
      step(`打包 ${args.dir} → ${out}`, "powershell.exe", ["-NoProfile", "-Command",
        `Compress-Archive -Path '${args.dir}\\*' -DestinationPath '${out}' -Force`]);
    } else {
      step(`打包 ${args.dir} → ${out}`, "zip", ["-r", out, "."], true);
    }
    if (args.deploy === "cloudflare") step("部署 Cloudflare Pages", "npx", ["wrangler", "pages", "deploy", args.dir, "--project-name", args.project || "mygame"]);
    if (args.deploy === "netlify") step("部署 Netlify", "npx", ["netlify", "deploy", "--prod", "--dir", args.dir]);
    break;
  }
  case "wechat": {
    if (!args.project) { console.error("wechat 需要 --project <小游戏目录>"); process.exit(2); }
    needFile(args.project, "小游戏工程");
    const cli = args.cli || "C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat";
    if (!existsSync(cli)) {
      console.error(`未找到微信开发者工具 CLI: ${cli}（安装开发者工具后可用 --cli 指定）`);
      process.exit(3);
    }
    step(`上传小游戏 ${args.project} v${VERSION}`, cli, ["--project", resolve(args.project), "--upload", "--version", VERSION, "--desc", `ci ${VERSION}`]);
    break;
  }
  case "android": {
    const dir = args["gradle-dir"] || "android";
    needFile(dir, "Android 工程目录");
    const gradlew = process.platform === "win32" ? resolve(dir, "gradlew.bat") : resolve(dir, "gradlew");
    needFile(gradlew, "gradlew");
    step("构建 AAB", gradlew, ["bundleRelease"]);
    if (args["json-key"]) {
      step("上传 Google Play", "fastlane", ["supply", "--aab", resolve(dir, "app/build/outputs/bundle/release/app-release.aab"),
        "--json_key", args["json-key"], "--track", args.track || "internal"]);
    }
    break;
  }
  case "ios": {
    if (!args.project || !args.scheme) { console.error("ios 需要 --project <xcodeproj> --scheme <name>"); process.exit(2); }
    needFile(args.project, "Xcode 工程");
    step("归档", "xcodebuild", ["-project", args.project, "-scheme", args.scheme, "-configuration", "Release",
      "-archivePath", "build/MyGame.xcarchive", "archive"]);
    break;
  }
  default:
    console.error(`未知 target: ${target}`);
    process.exit(2);
}

console.log(`== ${target} 发布计划（version=${VERSION}，${apply ? "APPLY" : "DRY-RUN"}）==`);
for (const s of plan) console.log(`  $ ${redact([s.cmd, ...s.args.map(String)].join(" "))}`);

if (!apply) {
  console.log("\n未执行。确认无误后加 --apply（密钥请用环境变量）。");
  process.exit(0);
}

let failed = 0;
for (const s of plan) {
  const isShellCmd = s.cmd === "cmd" || s.cmd === "cmd.exe";
  const shown = redact([s.cmd, ...s.args.map(String)].join(" "));
  console.log(`\n$ ${shown}`);
  const r = spawnSync(s.cmd, s.args, { stdio: "inherit", shell: isShellCmd || /\.(bat|cmd)$/i.test(s.cmd) });
  if (r.status !== 0) {
    console.error(`失败（exit ${r.status}）: ${s.desc}`);
    if (!s.optional) { failed = 1; break; }
  }
}
process.exit(failed);
