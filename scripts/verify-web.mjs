#!/usr/bin/env node
/**
 * verify-web.mjs — 用无头浏览器验证一个 Web 游戏：截图、收集错误、读取状态、注入按键。
 *
 * 用法：
 *   node verify-web.mjs --url http://127.0.0.1:8080 \
 *     [--out shot.png] [--wait-for "window.__game?.ready"] \
 *     [--press KeyD --press-ms 800] [--press KeyW:1500] \
 *     [--click 640,360] [--ignore "ResizeObserver"] [--strict] \
 *     [--width 1280] [--height 720] [--timeout 20000] [--browser <path>] \
 *     [--webgl] [--json] [--eval "expr"]
 *
 * 约定（可选）：页面暴露
 *   window.__game = { ready, state(), press(code, ms), reset() }
 *
 * 噪音过滤：--ignore 接收正则（可重复，同时匹配错误文本与资源 URL）；--strict 关闭
 * 默认的 favicon 过滤。被忽略的条目会列在输出与 --json 的 ignored 字段里，不计入 errors。
 *
 * 依赖：Node 18+（内置 fetch 与 WebSocket）。浏览器用 Edge/Chrome 的 DevTools 协议。
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";

const KEYMAP = (() => {
  const m = {
    Space: [" ", 32],
    Enter: ["Enter", 13],
    Escape: ["Escape", 27],
    Tab: ["Tab", 9],
    Backspace: ["Backspace", 8],
    ArrowLeft: ["ArrowLeft", 37],
    ArrowUp: ["ArrowUp", 38],
    ArrowRight: ["ArrowRight", 39],
    ArrowDown: ["ArrowDown", 40],
    ShiftLeft: ["Shift", 16],
    ControlLeft: ["Control", 17],
    AltLeft: ["Alt", 18],
  };
  for (let i = 0; i < 26; i++) {
    const ch = String.fromCharCode(65 + i);
    m[`Key${ch}`] = [ch.toLowerCase(), 65 + i];
  }
  for (let i = 0; i <= 9; i++) m[`Digit${i}`] = [String(i), 48 + i];
  return m;
})();

function parseClick(spec) {
  const m = /^(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)$/.exec(String(spec || "").trim());
  if (!m) fail(`--click expects "x,y", got: ${spec}`);
  return { x: Number(m[1]), y: Number(m[2]) };
}

function parseArgs(argv) {
  const a = {
    url: null, out: "shot.png", waitFor: null, press: [], pressMs: 500,
    width: 1280, height: 720, timeout: 20000, browser: null,
    webgl: false, json: false, evalExpr: null, keep: false,
    ignore: [], strict: false, click: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    switch (k) {
      case "--url": a.url = next(); break;
      case "--out": a.out = next(); break;
      case "--wait-for": a.waitFor = next(); break;
      case "--press": a.press.push(next()); break;
      case "--press-ms": a.pressMs = Number(next()) || 500; break;
      case "--ignore": a.ignore.push(next()); break;
      case "--strict": a.strict = true; break;
      case "--click": a.click = parseClick(next()); break;
      case "--width": a.width = Number(next()) || 1280; break;
      case "--height": a.height = Number(next()) || 720; break;
      case "--timeout": a.timeout = Number(next()) || 20000; break;
      case "--browser": a.browser = next(); break;
      case "--webgl": a.webgl = true; break;
      case "--json": a.json = true; break;
      case "--eval": a.evalExpr = next(); break;
      case "--keep": a.keep = true; break;
      case "-h": case "--help":
        console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
        process.exit(0);
      default:
        if (k.startsWith("--")) fail(`unknown arg ${k}`);
    }
  }
  if (!a.url) fail("--url is required");
  a.ignorePatterns = a.ignore.map((src) => {
    try {
      return new RegExp(src);
    } catch (e) {
      fail(`bad --ignore regex "${src}": ${e.message}`);
      return null; // fail() 已退出，仅为类型完整
    }
  });
  return a;
}

function fail(msg) {
  console.error(`verify-web: ${msg}`);
  process.exit(2);
}

function findBrowser(explicit) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  if (process.env.GAME_ANYTHING_BROWSER) candidates.push(process.env.GAME_ANYTHING_BROWSER);
  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    );
  } else {
    candidates.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge");
  }
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch { /* ignore */ }
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json().catch(() => ({}));
    } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error(`timeout waiting for ${url}`);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
      }
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  send(method, params = {}, timeoutMs = 15000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function openTarget(port, url) {
  const endpoint = `http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`;
  for (const method of ["PUT", "POST"]) {
    try {
      const res = await fetch(endpoint, { method });
      if (res.ok) return await res.json();
    } catch { /* try next */ }
  }
  // 回退：复用 about:blank 目标并导航
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  return page;
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const res = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise,
    userGesture: true,
  });
  if (res.exceptionDetails) {
    return { error: res.exceptionDetails.text + (res.exceptionDetails.exception?.description || "") };
  }
  return { value: res.result?.value };
}

async function pollExpression(cdp, expression, timeoutMs) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    const r = await evaluate(cdp, expression);
    last = r;
    if (!r.error && r.value) return true;
    await sleep(100);
  }
  return { ok: false, last };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof WebSocket === "undefined") fail("this Node has no global WebSocket; use Node 20+");

  const browser = findBrowser(args.browser);
  if (!browser) fail("no Edge/Chrome found; pass --browser <path>");

  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ga-verify-"));
  const baseArgs = [
    "--headless=new",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--window-size=${args.width},${args.height}`,
    "about:blank",
  ];
  if (args.webgl) baseArgs.splice(1, 0, "--use-angle=swiftshader", "--enable-unsafe-swiftshader");
  else baseArgs.splice(1, 0, "--disable-gpu");

  let child = spawn(browser, baseArgs, { stdio: "ignore", windowsHide: true });
  let exited = false;
  child.on("exit", () => { exited = true; });

  const cleanup = async () => {
    try {
      if (!exited) {
        child.kill();
        await sleep(200);
        if (process.platform === "win32") {
          try {
            spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
    if (!args.keep) {
      try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  };

  const errors = [];
  const ignored = [];
  const logs = [];
  // 默认只过滤 favicon；--strict 时连它也不过，--ignore 始终生效
  const noiseRes = args.strict ? [] : [/favicon\.ico/i];
  const isIgnored = (text, url) => {
    const hay = `${text || ""} ${url || ""}`;
    return noiseRes.some((re) => re.test(url || "")) || args.ignorePatterns.some((re) => re.test(hay));
  };
  const reportError = (kind, text, url) => {
    if (isIgnored(text, url)) {
      ignored.push({ kind, text: String(text || ""), url: url || null });
      return;
    }
    errors.push(kind === "log" ? `log.error: ${text}${url ? ` (${url})` : ""}` : `${kind}: ${text}`.trim());
  };
  let screenshotPath = null;
  let state = null;
  let waitForOk = null;
  let finalEval = null;

  try {
    let version;
    try {
      version = await waitForHttp(`http://127.0.0.1:${port}/json/version`, 20000);
    } catch {
      // 老浏览器不支持 --headless=new 时回退
      try { child.kill(); } catch { /* ignore */ }
      await sleep(300);
      child = spawn(browser, baseArgs.filter((x) => x !== "--headless=new").concat(["--headless"]), {
        stdio: "ignore", windowsHide: true,
      });
      version = await waitForHttp(`http://127.0.0.1:${port}/json/version`, 20000);
    }

    const target = await openTarget(port, "about:blank");
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("websocket error")), { once: true });
    });
    const cdp = new CDP(ws);

    cdp.on("Runtime.consoleAPICalled", (p) => {
      const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(" ");
      if (p.type === "error") { reportError("console.error", text); return; }
      logs.push({ level: p.type, text });
    });
    cdp.on("Runtime.exceptionThrown", (p) => {
      const d = p.exceptionDetails || {};
      reportError("exception", `${d.text || ""} ${d.exception?.description || ""}`.trim());    });
    cdp.on("Log.entryAdded", (p) => {
      const e = p.entry || {};
      // favicon 等噪音走 isIgnored 统一处理，同时记录到 ignored 供排查
      if (e.level === "error") { reportError("log", e.text, e.url); return; }
      logs.push({ level: e.level, text: e.text });
    });
    cdp.on("Inspector.targetCrashed", () => errors.push("target crashed"));

    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Page.bringToFront").catch(() => {});

    await cdp.send("Page.navigate", { url: args.url });
    // 等 readyState，避免错过 load 事件
    await pollExpression(cdp, "document.readyState === 'complete' || document.readyState === 'interactive'", Math.min(15000, args.timeout));
    await sleep(200);

    if (args.waitFor) {
      const r = await pollExpression(cdp, `Boolean(${args.waitFor})`, args.timeout);
      waitForOk = r === true;
      if (!waitForOk) errors.push(`wait-for not satisfied: ${args.waitFor}`);
    }

    // 让页面获得焦点，按键才能进游戏
    await evaluate(cdp, "window.focus(); document.body && document.body.focus && document.body.focus();");

    const pressPlan = [];
    for (const spec of args.press) {
      const [code, msRaw] = String(spec).split(":");
      const info = KEYMAP[code];
      if (!info) {
        errors.push(`unknown key code: ${code}`);
        continue;
      }
      const duration = msRaw ? (Number(msRaw) || args.pressMs) : args.pressMs;
      pressPlan.push({ code, ms: duration });
      const [key, vk] = info;
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown", code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
      });
      await sleep(duration);
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp", code, key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
      });
      await sleep(150);
    }

    if (args.click) {
      const { x, y } = args.click;
      const base = { x, y, button: "left", clickCount: 1 };
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...base, buttons: 1 });
      await sleep(60);
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...base, buttons: 0 });
      await sleep(120);
    }

    const stateR = await evaluate(cdp, `(() => {
      const g = window.__game;
      if (!g) return null;
      try { return g.state ? g.state() : { ready: !!g.ready }; } catch (e) { return { stateError: String(e) }; }
    })()`);
    state = stateR.error ? { error: stateR.error } : stateR.value;

    if (args.evalExpr) {
      const r = await evaluate(cdp, args.evalExpr, true);
      finalEval = r.error ? { error: r.error } : r.value;
    }

    const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(shot.data, "base64"));
    screenshotPath = outPath;

    const canvasInfo = await evaluate(cdp, `(() => {
      const c = document.querySelector("canvas");
      return c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null;
    })()`);

    const report = {
      url: args.url,
      browser: version?.Browser || path.basename(browser),
      screenshot: screenshotPath,
      waitFor: args.waitFor,
      waitForOk,
      pressed: args.press,
      pressPlan,
      click: args.click,
      ignored,
      ignoredPatterns: args.ignore,
      strict: args.strict,
      state,
      eval: finalEval,
      canvas: canvasInfo.value ?? null,
      logs: logs.slice(-50),
      errors,
    };

    ws.close();
    await cleanup();

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`url        ${report.url}`);
      console.log(`browser    ${report.browser}`);
      console.log(`screenshot ${report.screenshot}`);
      if (args.waitFor) console.log(`wait-for   ${waitForOk ? "ok" : "TIMEOUT"} (${args.waitFor})`);
      if (args.press.length) {
        const plan = pressPlan.map((p) => (p.ms === args.pressMs ? p.code : `${p.code}:${p.ms}`)).join(", ");
        console.log(`pressed    ${plan}`);
      }
      if (args.click) console.log(`clicked    ${args.click.x},${args.click.y}`);
      console.log(`canvas     ${report.canvas ? `${report.canvas.w}x${report.canvas.h} css ${report.canvas.cw}x${report.canvas.ch}` : "none"}`);
      console.log(`state      ${state === null ? "(no window.__game)" : JSON.stringify(state)}`);
      if (args.evalExpr) console.log(`eval       ${JSON.stringify(finalEval)}`);
      console.log(`errors     ${errors.length}`);
      for (const e of errors.slice(0, 10)) console.log(`  - ${e}`);
      if (ignored.length) {
        console.log(`ignored    ${ignored.length}`);
        for (const i of ignored.slice(0, 5)) console.log(`  ~ ${i.text}${i.url ? ` (${i.url})` : ""}`);
      }
    }

    process.exit(errors.length ? 1 : 0);
  } catch (err) {
    await cleanup();
    console.error(`verify-web failed: ${err.message}`);
    process.exit(2);
  }
}

main();
