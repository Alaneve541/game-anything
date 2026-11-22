# Web 与 HTML5 游戏

Web 是本机最容易做到「写完就能跑、跑完能截图」的路径，适合原型、Game Jam、itch.io 发布和玩法验证。

## 1. 技术选型

| 需求 | 选择 | 说明 |
|---|---|---|
| 2D 小游戏、需要成熟生态 | Phaser 3 | 场景、物理、输入、音频、动画齐全 |
| 极小体量、零依赖 | Canvas 2D 手写 | 单文件即可，最好控制 |
| 2D 像素、轻量 | Kaplay（原 Kaboom） | API 简洁，适合 Jam |
| 2D 渲染库、自己写逻辑 | PixiJS | 只负责渲染，自由度高 |
| 3D | Three.js | 生态最大，示例多 |
| 3D 带编辑器/物理 | Babylon.js | 工具链完整 |
| 需要可视化编辑器 | PlayCanvas | 云端协作 |

默认：2D 用 Phaser 或 Canvas；3D 用 Three.js。

## 2. 启动方式

```bash
# Phaser + Vite
npm create vite@latest my-game -- --template vanilla-ts
cd my-game && npm i phaser && npm run dev

# 单文件原型：直接写 index.html，用零依赖静态服务器打开
node "<skill 目录>/scripts/serve.mjs" --root . --port 8080
# 或使用现成工具
npx serve .
# 或 python -m http.server 8080
```

注意：`file://` 下 `fetch` 与 ES module 会被浏览器拦截。要么把资源内联，要么起本地服务器。

模板：[../templates/web-canvas/index.html](../templates/web-canvas/index.html) 是可运行的最小 2D 游戏（固定步长、输入、状态探针、存档、WebAudio），复制后改玩法。

## 3. 循环与缩放

```js
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
const W = 960, H = 540;

function resize() {
  const scale = Math.min(innerWidth / W, innerHeight / H);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${H * scale}px`;
  canvas.width = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  ctx.imageSmoothingEnabled = false;
}
addEventListener("resize", resize);
```

- 逻辑分辨率固定（如 960×540），渲染时缩放。
- 高 DPI 用 `devicePixelRatio`，但像素风可固定 1 倍再放大。
- 触屏与鼠标统一成指针事件。

## 4. 音频

浏览器要求用户手势后才能播放：

```js
let ac;
function unlock() {
  if (!ac) ac = new AudioContext();
  if (ac.state === "suspended") ac.resume();
}
addEventListener("pointerdown", unlock, { once: true });
addEventListener("keydown", unlock, { once: true });
```

- 音效用 `AudioBufferSourceNode` 或 `HTMLAudioElement` 池，避免每次 new。
- 背景音乐循环要处理无缝点（或直接接受接缝）。
- 生成素材：先 `search_audio_library`，没有再 `generate_audio`（mode=`sfx`/`music`），见[素材与音频](assets-and-audio.md)。
- 验证自动化时用 `--autoplay-policy=no-user-gesture-required`，但真机仍要手势解锁。

## 5. 输入

| 输入 | 事件 | 注意 |
|---|---|---|
| 键盘 | `keydown`/`keyup` | 用 `event.code`，别用 `key`（受输入法/布局影响） |
| 鼠标 | `pointerdown/move/up` | 用 `setPointerCapture` 保证拖拽 |
| 触屏 | Pointer Events | 加 `touch-action: none`，阻止滚动缩放 |
| 手柄 | Gamepad API | 轮询 `navigator.getGamepads()`，每帧读 |

输入统一映射为 Intent，见[架构](architecture.md)。移动端加虚拟摇杆与至少 44px 的点击区。

## 6. 存档

```js
const KEY = "game.save.v1";
const save = (data) => localStorage.setItem(KEY, JSON.stringify({ version: 1, ...data }));
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? null; }
  catch { return null; }
};
```

itch.io 的 iframe 里 `localStorage` 可能受限，准备内存回退。

## 7. 无头验证

```bash
node "<skill 目录>/scripts/verify-web.mjs" \
  --url "http://127.0.0.1:8080" \
  --out shot.png \
  --wait-for "window.__game && window.__game.ready"
```

脚本会启动 Edge/Chrome 无头实例，收集控制台错误与未捕获异常，截图，并打印 `window.__game.state()`（如果存在）。常用参数：`--press KeyD:1200`（单键指定时长）、`--click 640,360`（点击一次，测开始按钮/菜单）、`--ignore <regex>`（可重复，压掉已知噪音并单独列在 `ignored`）、`--strict`（关闭默认 favicon 过滤，确认「真零报错」时用）、`--json`（输出含 ignored 的完整报告）。约定：

```js
window.__game = {
  ready: true,
  state: () => ({ t, score, hp, alive, entities: entities.length }),
  press: (code, ms = 100) => { /* 供测试注入输入 */ },
  reset: () => { /* 重置到初始状态 */ },
};
```

没有 `__game` 时，至少检查：页面加载完成、canvas 非空、无 console error。快速截图也可：

```bash
msedge --headless=new --disable-gpu --screenshot=shot.png --window-size=1280,720 "http://127.0.0.1:8080"
```

WebGL 在无头环境需要 `--use-angle=swiftshader --enable-unsafe-swiftshader`；2D canvas 不需要。

## 8. 部署

- **itch.io**：zip 内 `index.html` 放根目录，上传选 HTML；设置画布尺寸与全屏按钮。
- **静态托管**：Vercel/Netlify/Cloudflare Pages，构建产物目录 `dist/`。
- **PWA**：加 manifest 与 service worker，支持离线与安装；注意缓存版本。
- **微信/抖音小游戏**：不是直接运行 Web 包，需要引擎适配层（Cocos Creator、LayaAir、Unity WebGL 转换），见[平台目标](platform-targets.md)。

## 9. 性能

- 每帧避免创建对象与闭包；对象池复用子弹/粒子。
- 大量精灵用一张图集，减少 draw call；Phaser 用 `TexturePacker` 或 `free-tex-packer`。
- 像素风关掉平滑，固定整数缩放。
- 移动端限制 DPR 到 2，粒子数量减半。
- 用 `performance.now()` 统计每帧耗时，超过 16.6ms 就查热点。

## 10. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 黑屏无报错 | canvas 尺寸为 0、渲染循环没启动 | 打印 `canvas.width/height`，检查 `requestAnimationFrame` |
| 资源 404 | 相对路径错、`file://` 打开 | 起服务器，检查 Network |
| 音频不响 | 未解锁 AudioContext | 首次手势里 `resume()` |
| 键盘无效 | 焦点在 iframe/输入框，或用了 `event.key` | 用 `window` 监听 + `event.code` |
| 触屏不能动 | 没设 `touch-action: none` | CSS 与 `preventDefault` |
| 移动端卡 | DPR 过高、粒子太多 | 限 DPR、降粒子、合批 |
| WebGL 报错 | 显卡/驱动/无头环境 | 试 `--use-angle=swiftshader`，或降级 Canvas 2D |
