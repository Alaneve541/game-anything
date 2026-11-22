#!/usr/bin/env node
/**
 * serve.mjs — 零依赖静态服务器，用于预览和验证 Web 游戏。
 *
 * 用法：
 *   node serve.mjs [--root .] [--port 8080] [--host 127.0.0.1] [--spa]
 *
 * 为什么不用 npx serve：离线可用、无安装、行为可预测。
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function parseArgs(argv) {
  const a = { root: process.cwd(), port: 8080, host: "127.0.0.1", spa: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--root") a.root = argv[++i];
    else if (k === "--port") a.port = Number(argv[++i]) || 8080;
    else if (k === "--host") a.host = argv[++i];
    else if (k === "--spa") a.spa = true;
    else if (k === "-h" || k === "--help") {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
      process.exit(0);
    }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root);

if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
  console.error(`serve: root not a directory: ${root}`);
  process.exit(2);
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    res.writeHead(400).end("bad request");
    return;
  }

  let filePath = path.join(root, urlPath);
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath) && args.spa) {
    filePath = path.join(root, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end(`404 ${urlPath}`);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  if (req.method === "HEAD") { res.end(); return; }
  fs.createReadStream(filePath).pipe(res);
});

server.listen(args.port, args.host, () => {
  const addr = server.address();
  console.log(`serving ${root}`);
  console.log(`http://${addr.address}:${addr.port}`);
});
