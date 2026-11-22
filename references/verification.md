# 验证：Playable Proof

「做完了」必须能被证据推翻。按能力从低到高分层，报告时写清卡在哪一层。

## 1. 验证层级

| 层 | 手段 | 能证明 | 不能证明 |
|---|---|---|---|
| L0 静态 | 语法检查、类型检查、资源引用扫描 | 代码没写错 | 能跑 |
| L1 逻辑 | 单元测试、确定性回放、模拟 600 步 | 规则正确 | 画面、输入、音频 |
| L2 无头运行 | `--headless`/`-batchmode` 启动并加载场景 | 引擎能初始化，资源能加载 | 渲染、手感 |
| L3 有画面 | 窗口/无头截图、录制 | 画面不是黑屏，UI 正常 | 好玩 |
| L4 交互 | 注入输入后检查状态变化 | 操作链路通 | 全流程无死锁 |
| L5 全流程 | 脚本走完一局、重开、存档往返 | 主路径稳定 | 长时稳定性 |
| L6 真机 | 目标设备安装启动 | 平台兼容 | 性能上限 |

多数交付做到 L4–L5 即可；移动端/主机要求 L6。

## 2. 启动检查

```bash
# Web（Vite）
npm run build && npx vite preview --port 8080

# Godot
godot --headless --path . --quit-after 120

# Unity
Unity.exe -batchmode -quit -projectPath . -logFile build.log

# Unreal
UnrealEditor-Cmd.exe Game.uproject -run=pythonscript -script=tools/smoke.py -unattended -nullrhi

# LÖVE / pygame / 自定义
love . ; python main.py
```

判定：退出码 0 **且** 日志无致命错误。常见必查字符串：`error CS`、`SCRIPT ERROR`、`Fatal error`、`NullReferenceException`、`Uncaught`、`failed to load`。

## 3. 截图

**Web（推荐脚本）**

```bash
node "<skill 目录>/scripts/verify-web.mjs" \
  --url "http://127.0.0.1:8080" \
  --out shot.png \
  --wait-for "window.__game?.ready" \
  --press "KeyD" --press-ms 800
```

脚本行为：启动无头浏览器 → 打开页面 → 等 `wait-for` → 收集 console/pageerror → （可选）注入按键/点击 → 截图 → 打印 `state()` JSON → 以错误数决定退出码。

- `--press KeyD:1200`：给单个按键指定时长，可重复、按顺序执行（测试长按加速、连按）。
- `--click 640,360`：在页面坐标点击一次（开始按钮、菜单、canvas 内点击类玩法）。
- `--ignore <regex>`：可重复，同时匹配错误文本与资源 URL；命中项进 `ignored`，不计入退出码。
- `--strict`：关闭默认噪音过滤（目前仅 favicon 404）；怀疑「真的没报错吗」时用。
- `--json`：输出完整报告（含 `ignored`、`pressPlan`、`click`），便于 CI 解析。

**手工 Edge/Chrome**

```bash
msedge --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,720 --screenshot=shot.png "http://127.0.0.1:8080"
```

WebGL 加 `--use-angle=swiftshader --enable-unsafe-swiftshader`。

**Unity**：PlayMode 测试里 `ScreenCapture.CaptureScreenshotAsTexture()` 存 PNG，或编辑器 `-executeMethod` 截图。

**Unreal**：控制台 `HighResShot 1920x1080`；或 `AutomationLibrary` 在测试里截图。`-nullrhi` 下无渲染，不能截图。

**Godot**：`await RenderingServer.frame_post_draw` 后 `get_viewport().get_texture().get_image().save_png(...)`；必须真渲染窗口。

**判读**：至少检查非纯色（采样若干像素方差 > 阈值）、预期 UI 元素可见、尺寸正确。黑屏常见原因：canvas 尺寸 0、相机没对准、场景没加载、渲染后端不支持。

## 4. 状态探针

每个项目都暴露一个只读状态函数，供自动化使用：

```js
window.__game = {
  ready: true,
  state: () => ({ t, score, hp, player: { x, y }, enemies: enemies.length, mode }),
  press: (code, ms) => { /* 注入输入 */ },
  reset: () => {},
};
```

其他引擎等价物：Unity 静态类 `GameProbe.Snapshot()` 写 JSON 到文件；Godot autoload 单例；UE `UGameInstanceSubsystem` 或 Python 读 `unreal` 对象。原则是**只读、稳定、可序列化**。

## 5. 输入链路测试

1. 初始状态断言（hp=3、score=0、mode=PLAYING）。
2. 注入「右移 0.8 秒」，断言 `player.x` 增加。
3. 注入「开火」，断言子弹数增加、冷却生效。
4. 让玩家受伤/死亡，断言进 GAME_OVER。
5. 注入重开，断言状态回到初始。

任何一步无变化，先查焦点/输入映射/事件监听，而不是继续堆功能。

## 6. 回归与确定性

```js
const run = (seed) => {
  const s = new Sim(seed);
  for (let i = 0; i < 3600; i++) s.step(1 / 60, scriptedIntent(i));
  return hash(s.state);
};
assert(run(42) === run(42));
```

- 同种子同输入必须同结果；不一致说明用了未注入的随机、时间或遍历顺序不稳定。
- 把「一局 60 秒」的回放纳入 CI，改数值后立刻发现破坏。

## 7. 打包验证

- 产物存在、体积合理、能在干净目录启动（不依赖开发机路径）。
- 解压到临时目录运行一次；删掉 `node_modules`/`Library`/`Intermediate` 后再跑。
- Windows 检查是否缺 VC++ 运行库；Web 检查 MIME 与 COOP/COEP；移动端检查签名与权限。

## 8. 故障排查顺序

1. 读**第一条**错误，不要看最后一条。
2. 区分：环境（引擎/依赖缺失）、编译（类型/语法）、运行时（空引用/资源）、逻辑（数值不对）。
3. 环境问题先跑[引擎路由](engine-routing.md)的就绪检查，别改代码。
4. 同一命令失败两次就换诊断：加日志、最小复现、二分注释。
5. 修完重跑同一验证命令，保留输出作为证据。

## 9. 诚实协议

- 没跑过的命令不写「已验证」。
- 引擎缺失时写「未在本机构建，需在你的 Unity/UE 中打开验证」，并给步骤。
- 截图存在不等于通过：要说明截图里应看到什么。
- 自动化通过不等于好玩：试玩结论单独标注为主观判断。

## 10. 交付时的验证摘要模板

```markdown
## 验证
- 启动：`npm run dev` 退出码 0，console 0 error
- 画面：shot.png（1280×720，玩家/敌人/HP 可见）
- 状态：初始 hp=3 score=0；按 D 0.8s 后 x: 100→308；开火后 bullets=1
- 全流程：脚本走完一局，GAME_OVER → R 重开回 PLAYING
- 未验证：移动端真机、音频实际听感
```
