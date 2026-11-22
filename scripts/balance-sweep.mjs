#!/usr/bin/env node
/**
 * balance-sweep.mjs — 批量跑对局，量化难度与数值平衡。
 *
 * 两种模式：
 *   1) 浏览器模式（默认）：用无头 Edge/Chrome 打开页面，循环 __game.reset(seed) → simulate(seconds) → state()
 *      node scripts/balance-sweep.mjs --url http://127.0.0.1:8123 --seeds 1-20 --seconds 60
 *   2) 核心模式（更快）：直接 import 无 DOM 的 core 模块
 *      node scripts/balance-sweep.mjs --core dist/core.mjs --seeds 1-1000 --seconds 120
 *
 * 页面契约（浏览器模式）：window.__game = { ready, state(), reset(seed), simulate(seconds) }
 * 核心契约（核心模式）：export function createGame(seed, params) 与 step(state, dt)；state.t / state.score / state.hp / state.mode
 *
 * 输出：CSV（--out）或 JSON（--json），并打印汇总：n、胜率、平均/中位/90 分位分数、平均存活。
 *
 * 参数：
 *   --url <url>         页面地址（默认 http://127.0.0.1:8123）
 *   --core <file>       core 模块路径（启用核心模式）
 *   --seeds <spec>      种子，如 1-20、1-5,10,20-25（默认 1-20）
 *   --seconds <n>       每局模拟秒数（默认 60）
 *   --out <csv>         写出 CSV（默认 stdout）
 *   --json              输出 JSON 汇总
 *   --param k=v         传给页面查询串 / core createGame 的参数（可重复）
 *   --timeout <ms>      浏览器等待超时（默认 30000）
 *   --browser <path>    指定 Edge/Chrome 可执行文件
 *   --keep-open         结束时不关闭浏览器（调试用）
 */

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// ---------- 参数 ----------
const BOOL = new Set(["json", "keep-open", "help"]);
function parseArgs(argv) {
  const a = { url: "http://127.0.0.1:8123", seeds: "1-20", seconds: 60, timeout: 30000, param: [], out: null, core: null, browser: null, json: false, keepOpen: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const key = t.slice(2);
    if (BOOL.has(key)) { a[camel(key)] = true; continue; }
    const val = argv[++i];
    if (val === undefined) fail(`--${key} 需要值`);
    if (key === "param") { a.param.push(val); continue; }
    a[camel(key)] = val;
  }
  return a;
}
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const fail = (msg) => { console.error("参数错误: " + msg); usage(); process.exit(2); };
function usage() {
  console.error(`用法:
  node scripts/balance-sweep.mjs --url http://127.0.0.1:8123 --seeds 1-20 --seconds 60 [--out balance/x.csv] [--json]
  node scripts/balance-sweep.mjs --core dist/core.mjs --seeds 1-1000 --seconds 120 [--param orb=12]
  --param 可重复；--param 在浏览器模式下拼到 URL 查询串，在核心模式下传给 createGame(seed, params)。`);
}

function parseSeeds(spec) {
  const out = [];
  for (const part of String(spec).split(",")) {
    const m = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let [lo, hi] = [Number(m[1]), Number(m[2])];
      if (lo > hi) [lo, hi] = [hi, lo];
      if (hi - lo > 100000) fail("种子区间过大");
      for (let i = lo; i <= hi; i++) out.push(i);
    } else if (/^\d+$/.test(part.trim())) {
      out.push(Number(part.trim()));
    } else if (part.trim()) {
      fail(`无法解析种子 "${part}"`);
    }
  }
  if (!out.length) fail("没有有效的种子");
  return out;
}

// ---------- 统计 ----------
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}_${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}
function summarize(rows) {
  const n = rows.length;
  const scores = rows.map((r) => Number(r.score) || 0).sort((a, b) => a - b);
  const survived = rows.map((r) => Number(r.t) || 0);
  const wins = rows.filter((r) => r.mode === "over" && Number(r.hp) > 0).length;
  const ended = rows.filter((r) => r.mode === "over").length;
  return {
    n,
    win_rate: n ? +(wins / n * 100).toFixed(1) : 0,
    ended_rate: n ? +(ended / n * 100).toFixed(1) : 0,
    mean_score: +(scores.reduce((a, b) => a + b, 0) / (n || 1)).toFixed(2),
    p50_score: quantile(scores, 0.5),
    p90_score: quantile(scores, 0.9),
    max_score: scores[n - 1] || 0,
    mean_survival_s: +(survived.reduce((a, b) => a + b, 0) / (n || 1)).toFixed(2),
  };
}
function toCsv(rows) {
  if (!rows.length) return "";
  const flat = rows.map((r) => flatten(r));
  const cols = [...new Set(flat.flatMap((r) => Object.keys(r)))];
  const esc = (v) => {
    const s = v === undefined || v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...flat.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

// ---------- 核心模式 ----------
async function runCore(args, seeds) {
  const file = resolve(args.core);
  if (!existsSync(file)) fail(`找不到 core 文件: ${file}`);
  const mod = await import(pathToFileURL(file).href);
  const create = mod.createGame || mod.default;
  const step = mod.step;
  if (typeof create !== "function" || typeof step !== "function") {
    fail("core 模块必须导出 createGame(seed, params) 和 step(state, dt)");
  }
  const params = Object.fromEntries(args.param.map((p) => {
    const i = p.indexOf("=");
    if (i < 0) fail(`--param 需要 k=v 形式: ${p}`);
    const k = p.slice(0, i); const raw = p.slice(i + 1);
    return [k, raw === "true" ? true : raw === "false" ? false : !isNaN(Number(raw)) && raw.trim() !== "" ? Number(raw) : raw];
  }));
  const rows = [];
  const dt = 1 / 60;
  for (const seed of seeds) {
    const state = await create(seed, params);
    const steps = Math.round(Number(args.seconds) / dt);
    for (let i = 0; i < steps; i++) step(state, dt);
    const s = typeof mod.state === "function" ? mod.state(state) : state;
    rows.push({ seed, ...s });
  }
  return rows;
}

// ---------- 浏览器模式 ----------
function findBrowser(explicit) {
  const cands = explicit ? [explicit] : [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    join(homedir(), "AppData/Local/Google/Chrome/Application/chrome.exe"),
  ];
  for (const p of cands) if (existsSync(p)) return p;
  fail("找不到 Edge/Chrome，请用 --browser 指定");
}

async function runBrowser(args, seeds) {
  const browser = findBrowser(args.browser);
  const profile = mkdtempSync(join(tmpdir(), "bsweep-"));
  const portFile = join(profile, "DevToolsActivePort");
  const child = spawn(browser, [
    "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--window-size=1280,720", "about:blank",
  ], { stdio: "ignore" });

  try {
    const port = await waitPort(portFile, args.timeout);
    // 端口文件出现时 HTTP 端点可能还没监听，先等 /json/version 可访问，再连 WS
    const version = await waitDevtools(port, args.timeout);
    const wsUrl = `ws://127.0.0.1:${port}/devtools/browser/${readFileSync(portFile, "utf8").trim().split("\n")[1]}`;
    const cdp = await connect(version.webSocketDebuggerUrl);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Page.enable", {}, sessionId);

    const url = appendParams(args.url, args.param);
    await cdp.send("Page.navigate", { url }, sessionId);
    await cdp.send("Runtime.evaluate", { expression: "1", returnByValue: true }, sessionId);
    await waitFor(() => cdp.eval("document.readyState === 'complete'", sessionId), args.timeout);
    await waitFor(() => cdp.eval("!!(window.__game && window.__game.ready)", sessionId), args.timeout);

    const seconds = Number(args.seconds);
    const expr = `(() => {
      const g = window.__game, seeds = ${JSON.stringify(seeds)}, seconds = ${JSON.stringify(seconds)}, out = [];
      for (const seed of seeds) {
        g.reset(seed);
        // 分块推进，避免一次性卡死页面
        for (let left = seconds; left > 0; left -= 10) g.simulate(Math.min(10, left));
        const s = g.state();
        out.push({ seed, ...s });
      }
      return out;
    })()`;
    const rows = await cdp.eval(expr, sessionId, 180000);
    if (!Array.isArray(rows)) fail("页面 eval 没有返回数组，检查 __game 契约");
    if (!args.keepOpen) { try { await cdp.send("Browser.close", {}); } catch { /* ignore */ } }
    return rows;
  } finally {
    if (!args.keepOpen) { try { child.kill(); } catch { /* ignore */ } }
    setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ } }, 500);
  }
}

function appendParams(url, params) {
  if (!params.length) return url;
  const u = new URL(url);
  for (const p of params) {
    const i = p.indexOf("=");
    if (i < 0) fail(`--param 需要 k=v 形式: ${p}`);
    u.searchParams.set(p.slice(0, i), p.slice(i + 1));
  }
  return u.href;
}
function waitPort(file, timeoutMs) {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => {
      if (existsSync(file)) {
        const txt = readFileSync(file, "utf8").trim();
        if (txt.split("\n").length >= 2) return res(Number(txt.split("\n")[0]));
      }
      if (Date.now() - t0 > timeoutMs) return rej(new Error("浏览器启动超时（DevToolsActivePort 未出现）"));
      setTimeout(tick, 100);
    };
    tick();
  });
}
async function waitFor(fn, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (await fn()) return true; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("等待页面就绪超时");
}
async function waitDevtools(port, timeoutMs) {
  const t0 = Date.now();
  let lastErr = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return await r.json();
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`DevTools 端点未就绪: ${lastErr?.message || "timeout"}`);
}
function connect(wsUrl) {
  return new Promise((resolveConn, rejectConn) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    });
    ws.addEventListener("error", (e) => rejectConn(new Error("WS 连接失败: " + (e.message || "unknown"))));
    ws.addEventListener("open", () => {
      resolveConn({
        send(method, params = {}, sessionId) {
          return new Promise((res, rej) => {
            const mid = ++id;
            pending.set(mid, { resolve: res, reject: rej });
            ws.send(JSON.stringify(sessionId ? { id: mid, method, params, sessionId } : { id: mid, method, params }));
          });
        },
        async eval(expression, sessionId, timeout = 60000) {
          const r = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
          if (r.exceptionDetails) throw new Error("页面异常: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
          return r.result?.value;
        },
      });
    });
  });
}

// ---------- main ----------
const args = parseArgs(process.argv.slice(2));
if (args.help) { usage(); process.exit(0); }
const seeds = parseSeeds(args.seeds);

if (args.core) {
  const rows = await runCore(args, seeds);
  emit(rows);
} else {
  const rows = await runBrowser(args, seeds);
  emit(rows);
}

function emit(rows) {
  const summary = summarize(rows);
  const csv = toCsv(rows);
  if (args.out) {
    writeFileSync(args.out, csv);
    console.log(`wrote ${args.out} (${rows.length} rows)`);
  } else if (!args.json) {
    writeSync(1, csv);
  }
  if (args.json) console.log(JSON.stringify({ summary, rows }, null, 2));
  else console.log("summary: " + JSON.stringify(summary));
  if (summary.n && summary.ended_rate === 0) {
    console.log("提示：所有对局都没有结束（mode 一直不是 over），检查 simulate 是否被暂停/提前 return");
  }
}
