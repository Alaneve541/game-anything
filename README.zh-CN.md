# game-anything

[English](README.md) | **简体中文**

一个用于**跨引擎制作可玩**游戏的 agent skill——覆盖 Unity、Unreal、Godot、GameMaker、
Cocos Creator、Construct、RPG Maker，Web 引擎（Canvas / Phaser / Three.js），代码优先技术栈
（Bevy、MonoGame、LÖVE、pygame、Raylib、LibGDX、HaxeFlixel、Ebitengine），以及托管平台
（Roblox、Minecraft 数据包）。

它不是游戏库，也不是代码生成器。它是一套**工作流 + 工具链**，让 AI agent 在接到
"做个游戏" 时，交付的是**能启动、能渲染、能响应输入、能发布**的东西，而不是一堆没人跑过的代码。

```
探测工程与工具链 → 切出垂直切片 → 实现 → 验证 → 交付
```

## 为什么需要它

大多数 "AI 做了个游戏" 的失败方式都一样：成千上万行看起来合理、但从未执行过的代码。
这个 skill 把**"能跑"设为最低标准**，并提供确定性的验证工具，让这个标准**可检查**而不是口号。

四条硬规则：

1. **能跑 > 完整**：先交 5 分钟可玩的垂直切片，功能往后放。
2. **绝不手写二进制引擎资产**（`.uasset`、`.umap`、`.unity`、`.meta`、`.prefab`）：
   要么走引擎 API 生成，要么只改文本格式。
3. **只报告验证过的结果**：最终报告里不出现 "应该能跑"。
4. **先手感后画面**：操作延迟、反馈、节奏优先于美术打磨。

## 安装

```bash
git clone https://github.com/Alaneve541/game-anything.git "$HOME/.dsh/skills/game-anything"
```

Windows 路径：`%USERPROFILE%\.dsh\skills\game-anything`。

DeepSeek Harness 会监听 skills 目录，克隆后 `game-anything` 立刻出现在技能目录里，无需重启，
任何会话都可以按名字加载。

**依赖**

- Node.js 18+（内置工具使用原生 `fetch` 与 `WebSocket`）。
- Microsoft Edge 或 Google Chrome（用于无头 Web 验证）。
- 游戏引擎可选，只装你要做的那个。

## 快速开始

直接对 agent 说：

> "用 game-anything 做一个能跑的平台跳跃小游戏。"

或英文：

> "Use game-anything to build a 2D tower-defense prototype that runs in the browser."

skill 会：

1. 运行 `scripts/detect-engine.mjs`，识别工程、本机已装引擎与工具链；
2. 把需求收敛成一页 `DESIGN.md` 与垂直切片；
3. 用引擎无关的 core 实现目标引擎的适配层；
4. 用真实运行验证（无头截图 + 状态探针 + 注入输入）；
5. 交付可运行产物，并附上"验证过 / 未验证"的诚实清单。

### 跑一下自带模板

`templates/web-canvas` 是一个完整可运行的 2D 小游戏（"Orb Runner"，Canvas 单文件）：

```bash
# 终端 1
node scripts/serve.mjs --root templates/web-canvas --port 8123

# 终端 2 —— 无头 Edge/Chrome，截图 + 状态 + 按键
node scripts/verify-web.mjs \
  --url "http://127.0.0.1:8123" \
  --out shot.png \
  --wait-for "window.__game && window.__game.ready" \
  --press KeyD:1000
```

预期：退出码 `0`、`errors 0`、`state` JSON 显示角色确实移动、并生成 `shot.png`。

![Orb Runner 无头运行截图](docs/assets/orb-runner.png)

## 工具

| 脚本 | 作用 |
|---|---|
| `scripts/detect-engine.mjs` | 扫描工程目录与本机：引擎评分、安装完整性（如 Unreal 缺 `Engine/Binaries/Win64`）、工具链（Node、.NET、浏览器）与下一步建议。 |
| `scripts/verify-web.mjs` | 基于 DevTools 协议的无头 Edge/Chrome：等探针、收集 console/page 错误、注入按键/点击、执行 JS、截图，出错时返回非 0。 |
| `scripts/serve.mjs` | 零依赖静态服务器（MIME 表、防目录穿越、SPA 回退）。 |

`verify-web.mjs` 常用参数：

- `--press KeyD:1200` —— 给单个按键指定时长；可重复、按顺序执行。
- `--click 640,360` —— 在页面坐标点一次（开始按钮、菜单、点击类玩法）。
- `--ignore <regex>` —— 可重复，同时匹配错误文本与资源 URL；命中项列入 `ignored`，**不计入失败**。
- `--strict` —— 关闭默认噪音过滤（favicon 404），需要"零容忍"时用。
- `--json` —— 输出完整机器可读报告（`ignored`、`pressPlan`、`click`、canvas 尺寸、state）。

Web 游戏的探针契约：

```js
window.__game = {
  ready: true,
  state: () => ({ t, score, hp, mode, entities: 3, player: { x, y } }),
  press: (code, ms) => {},
  reset: (seed) => {},
};
```

## 引擎支持（诚实状态）

| 层级 | 引擎 | 状态 |
|---|---|---|
| 端到端验证过 | Web / HTML5（Canvas、Phaser、Three.js） | 在 Windows + Edge 158 上真实跑通并验证 |
| 有指导文档（需自行安装引擎） | Unity、Unreal Engine、Godot、GameMaker、Cocos Creator、RPG Maker MV/MZ | 完整构建/测试/验证命令参考；引擎装好后才能实测脚本 |
| 代码优先配方 | Bevy、MonoGame、LÖVE、pygame、Raylib、LibGDX、HaxeFlixel、Ebitengine | 每个引擎都有最小可运行代码，无需编辑器 |
| 无自动化 | Construct 3 | 只能手动导出 `.c3p`，无脚本化 CLI |

如果目标引擎缺失，skill 会**主动降级**：先用 Web 原型验证手感、把核心逻辑写成纯函数并做确定性
测试、给出移植清单——而不是假装构建成功了。

## 仓库结构

```
SKILL.md                # agent 加载的技能正文（中文，权威版本）
references/             # 12 篇深水区文档：引擎、架构、验证、素材、发布
scripts/                # detect-engine.mjs、verify-web.mjs、serve.mjs
templates/web-canvas/   # 可运行 Canvas 游戏，含探针、存档、音效
docs/en/quickstart.md   # 英文快速上手
docs/assets/            # 截图
```

## 局限

- 不手写二进制引擎资产；模型、关卡等内容仍需引擎编辑器或 API 生成。
- 引擎相关命令是"验证过的参考"，不能替代已安装的引擎。
- 商店发布是清单而非自动化（Steam/itch/微信小游戏后台仍需手动操作）。
- 手感与数值平衡需要迭代；skill 保证的是"可运行、可验证"的基线。

## 许可

暂未添加 LICENSE 文件。对外分发或接受贡献前，请先选定许可证（MIT 是常见默认选项）。
