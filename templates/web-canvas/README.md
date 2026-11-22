# Web Canvas 模板

一个零依赖、单文件、可直接运行的最小 2D 游戏骨架：**Orb Runner**（收集光球、躲开猎手）。用来做 Game Jam 起点或验证「无头截图 + 状态断言」链路。

## 运行

```bash
# 在模板目录
node ../../scripts/serve.mjs --root . --port 8080
# 打开 http://127.0.0.1:8080
```

或复制到自己的工程，用任意静态服务器（`python -m http.server`、Vite、itch.io zip）打开。

注意：`file://` 直接打开也能跑，因为全部资源内联；一旦拆分成多文件或加载 `.json`，就必须用 HTTP。

## 已包含

- 固定步长循环（1/60s，累加器 + 最大补帧 8 次，切后台清零）
- 种子随机（`mulberry32`），`reset(seed)` 可复现
- 输入：WASD / 方向键，`keydown` 用 `event.code`
- 状态：`playing` / `over` / `paused`（Esc）
- 碰撞：玩家/光球/猎手，受伤无敌帧与屏幕震动
- 存档：`localStorage` 记录最高分，读写都有 try/catch
- 音频：WebAudio 合成音效，首次手势解锁
- 自动探针：`window.__game`
- HUD、暂停与结束遮罩、窗口缩放

## 探针契约

```js
window.__game = {
  ready: true,
  state() → { t, score, hp, mode, paused, best, seed, orbs, hunters, player: {x, y} },
  press(code, ms) → 注入按键持续 ms 毫秒,
  reset(seed?) → 重置,
  simulate(seconds) → 立即推进 N 秒（不依赖真实时间，便于逻辑测试）,
};
```

验证：

```bash
node ../../scripts/verify-web.mjs \
  --url "http://127.0.0.1:8080" \
  --out shot.png \
  --wait-for "window.__game && window.__game.ready" \
  --press KeyD --press-ms 800
```

退出码 0 表示：页面加载完成、`wait-for` 成立、无 console/page 错误、截图已写出。终端会打印 `state()` 的 JSON。

常用参数：`--press KeyD:1200`（单键长按）、`--click 640,360`（点开始按钮/菜单）、`--ignore <regex>`（可重复，忽略已知噪音，命中项单独列在 `ignored`）、`--strict`（不做任何默认噪音过滤）、`--json`（机器可读报告）。

## 改成自己的游戏

1. 改 `S` 的状态字段与 `step()` 的规则。
2. 改 `draw()` 里的渲染。
3. 保留固定步长、`__game` 探针、存档与音频解锁这四件事。
4. 把数值（速度、生成间隔、伤害）搬到外置 JSON，便于调平衡。

## 已知取舍

- 没有物理引擎，碰撞是圆形距离检测；复杂形状或斜坡需换 Phaser/Godot。
- 单文件方便复制，内容变多后按 `core/` 与 `adapter/` 拆分，见 `references/architecture.md`。
- 触屏只做了 `touch-action: none`，没有虚拟摇杆；移动端需要补。
