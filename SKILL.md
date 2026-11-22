---
name: game-anything
description: 游戏开发技能（Craft Games）：从一句话创意到可运行游戏。先探测目标引擎与本机已安装工具链，再按引擎路由——Unity、Unreal、Godot、GameMaker、Cocos Creator、Construct、RPG Maker、Phaser/Three.js 等 Web 引擎、Bevy/MonoGame/LÖVE/pygame 等代码引擎、Roblox/Minecraft 等托管平台。含脚手架、引擎无关核心架构、无头构建与截图验证、素材/音频、打包发布。当用户要做游戏、加玩法、选引擎、移植、复刻某款游戏或把游戏发到某平台时使用。
metadata:
  version: "2"
---

# Game Anything

把「做个游戏」落成**可运行、可验证、可继续迭代**的交付物。同一套流程适配大多数引擎：先探测环境，锁定可玩切片，选引擎，搭骨架，按引擎写代码，验证，打磨交付。

## 什么时候用 / 不用

用：从零做游戏；给现有工程加玩法或系统；选引擎；把原型移植到另一引擎；复刻某款游戏的机制；把游戏打包发布到某平台。

不用：非交互软件；纯美术或纯剧本（用普通工具）；纯逆向分析（用 REA）。

## 四条硬规则

1. **可运行 > 完整**。每个阶段结束都要有能启动的构建；没有可运行产物的进度不算进度。
2. **资产由脚本生成，不手写二进制字节**。模型用 Blender headless 或程序化网格生成；关卡、预制体、场景用引擎编辑器 API（UE Python / Unity Editor / Godot tool script）或 JSON 数据生成后导入；`.uasset`/`.umap`/`.unity`/`.yy` 永远不让文本编辑器碰。见[资产生成](references/asset-pipeline.md)。
3. **只报告验证过的**。命令输出、日志、测试报告、截图才算证据；引擎缺失或安装不完整要直说，不静默下载几十 GB，也不把「编译通过」当「能玩」。
4. **先手感后画面**。占位方块和程序化图形先行，美术与音频后置；没有核心循环之前不做菜单、存档、设置。

## 第 0 步：探测，再承诺

```bash
node "<skill 目录>/scripts/detect-engine.mjs" "<项目或工作目录>"
```

脚本输出工程识别（Unity、Unreal、Godot、GameMaker、Cocos、RPG Maker、Web、代码引擎等）、本机已装引擎与完整性、可用工具链（node、dotnet、浏览器）。按结果决定：

- 已有工程：跟随它的引擎与版本，不擅自换引擎。
- 引擎已装且完整：走该引擎的无头构建与测试。
- 引擎未装或损坏：**先尝试脚本化补齐**。`node "<skill 目录>/scripts/prepare-engine.mjs" --engine godot --apply` 可下载解压便携引擎并自检；Unity 可静默装 Hub（编辑器安装与许可证需人工/CI 一次）；UE 只做完整性检测。补齐后再走无头构建；确实补不了，用 Web 原型先交付切片，并明确标注哪些引擎命令未验证。
- 用户没指定引擎：按[引擎路由](references/engine-routing.md)选默认，不要用一串问题拦住开工。

## 第 1 步：锁定一个可玩的切片

用[构建流程](references/build-loop.md)把想法压成一页：

- 一句话卖点：谁在什么处境下做什么，为什么好玩
- 核心循环：30 秒内重复的「动作 → 反馈 → 成长」
- 操作方式、失败条件、单局时长
- **砍单**：本期明确不做的 5 件事

第一个里程碑只做灰盒垂直切片：一个场景、一个核心机制、一条胜负路径、能从头玩到结束。规模参考：2D 小游戏 300–800 行核心逻辑；3D 切片 1–2 个房间加 1 个敌人或交互。

## 第 2 步：定引擎

| 场景 | 首选 | 备选 | 备注 |
|---|---|---|---|
| 2D 网页 / 快速原型 | Phaser 3、Canvas 2D | Kaplay、PixiJS | 本机可无头截图验证 |
| 3D 网页 | Three.js、Babylon.js | PlayCanvas | WebGL 需 swiftshader |
| 3D 高保真 / 已装 UE | Unreal 5.x | Unity URP/HDRP | 先确认引擎完整 |
| 移动端 2D/3D | Unity | Godot、Cocos | 需引擎加 SDK |
| 微信/抖音小游戏 | Cocos Creator | LayaAir、Unity WebGL 适配 | 包体与 API 限制 |
| 开源 / 轻量 / 快速迭代 | Godot 4 | Bevy | `.tscn` 文本可直接写 |
| 像素 2D / 上手快 | GameMaker | LÖVE、pygame | 私有 `.yy` 格式需谨慎 |
| 纯代码 / CI 友好 | Bevy、MonoGame、LÖVE、pygame | Raylib、LibGDX | 全部可文本生成 |
| 托管平台 | Roblox（Rojo） | Minecraft 数据包 | 需 Studio 或服务器 |
| 无代码 | Construct 3、GDevelop | — | GUI 为主，CLI 弱 |

选择顺序：用户指定 > 已装且可验证 > 目标平台硬约束 > 迭代速度 > 团队技能。详细矩阵与检测特征见[引擎路由](references/engine-routing.md)。

## 第 3 步：搭骨架（引擎无关）

按[架构](references/architecture.md)分层，让同一套玩法能换皮到别的引擎：

- `core/`：纯逻辑（固定步长、种子随机、状态机、数值表），不 import 引擎，可在 Node 或测试里跑。
- `adapter/`：引擎绑定（渲染、输入、音频、物理、存档 IO）。
- `data/`：JSON 或 CSV 调参表（速度、血量、刷怪波次）。
- `content/`：美术、音频、关卡。

先写「无渲染可跑」的核心加一个最小适配层，再接画面。无头测试、回归、移植都会便宜很多。

## 第 4 步：按引擎写代码

每个引擎都有「安全写法」和「碰了就炸」的边界，读对应参考再动手：

- [Unity](references/unity.md)｜[Unreal](references/unreal.md)｜[Godot](references/godot.md)
- [GameMaker / Cocos / Construct / RPG Maker](references/tool-engines.md)
- [Bevy / MonoGame / LÖVE / pygame 等](references/code-first.md)
- [Web / HTML5 / 小游戏](references/web-and-html5.md)
- [Roblox / Minecraft / 平台目标](references/platform-targets.md)

通用规则：优先用引擎的脚本或编辑器 API 生成场景与资产；能用文本格式就用文本格式；每个引擎都先跑一次「空场景能启动」再堆内容。

## 第 5 步：验证（Playable Proof）

「能玩」必须由证据支撑，按[验证手册](references/verification.md)执行：

1. **启动**：构建或运行命令退出码 0，日志无致命错误。
2. **画面**：截图或录制，确认不是黑屏或空场景（Web 用 `scripts/verify-web.mjs`）。
3. **状态**：通过 `window.__game.state()` 或引擎测试断言检查分数、血量、实体数、胜负流转。
4. **输入**：模拟按键或点击，状态必须变化。
5. **回归**：核心逻辑单元测试或确定性回放。
6. **打包**：目标平台产物存在且能启动（至少做到本机可运行）。

报告时写清验证到哪一层：静态检查 / 逻辑测试 / 无头运行 / 有画面运行 / 真机。没验证的部分明确标注。

## 第 6 步：打磨、定平衡、交付

- 手感：输入缓冲、coyote time、屏幕震动、命中停顿、粒子、音效反馈。
- 平衡：不靠感觉反复试。用[平衡实验室](references/balance-lab.md)跑批量对局：`node scripts/balance-sweep.mjs --url ... --seeds 1-100 --seconds 90 --out balance/base.csv`，看胜率、存活、分数分位与死亡分布，再扫参数。
- 可用性：重开、暂停、音量、窗口缩放、键位说明、存档。
- 素材与音频：[素材与音频](references/assets-and-audio.md)。可用 `generate_audio` 生成 TTS、音乐、音效，先 `search_audio_library` 复用。
- 发布：按[发布自动化](references/publishing-automation.md)，用 `node scripts/publish.mjs --target itch|steam|web|wechat|android|ios`（默认 dry-run，确认后 `--apply`）；版本号绑定 commit，记录回滚路径。
- 交付：可运行构建加源码加 `README`（怎么跑、怎么改、已验证什么）加后续路线。

## 反模式

- 为「跨引擎」先写通用引擎或大而全 ECS，再选引擎。
- 手改 `.uasset`、`.umap` 或 GUID 资产；用文本编辑器拼场景。
- 依赖 GUI 点击生成资产/关卡（不可重复、CI 跑不了）。
- 引擎没装就直接说"做不了"，而不先跑 `prepare-engine.mjs` 补齐。
- 数值平衡靠手动反复试，不跑批量统计。
- 把发布当纯清单，明明有 butler/steamcmd/CLI 还在手工点上传。
- 先做菜单、设置、存档、成就，核心循环却不好玩。
- 用 20GB 素材包代替灰盒验证。
- 以「代码写完了」代替「跑起来截到图了」。
- 静默安装引擎或改动用户工程配置。

## 能力边界（v2）

| 领域 | 现在怎么自动化 | 仍需人工的部分 |
|---|---|---|
| 模型 / 关卡 / Prefab | Blender headless；UE Python、Unity Editor、Godot 工具脚本；JSON 关卡数据 | 美术方向决策 |
| 引擎准备 | `prepare-engine.mjs`：Godot 全自动；Unity Hub 静默安装；Unreal 完整性检查 | Unity 许可证激活；Unreal 30–80 GB 安装包 |
| 发布 | `publish.mjs`：butler、steamcmd、Web 打包/部署、微信 CLI、Gradle/Fastlane、Xcode archive | 首次登录、2FA、商店审核提交 |
| 平衡与手感 | `balance-sweep.mjs`：种子批量跑、CSV、胜率/存活/分位数 | 最终主观打磨 |

遇到「仍需人工」的四类事，不要假装自动化、也不要跳过：把具体待办、要跑的命令、预期产物写清楚交给用户，等用户完成后继续。典型交接话术：

- 「请在 Unity Hub 登录并激活许可证（个人版即可），完成后我继续跑 BuildScript。」
- 「Unreal 安装包 30–80 GB，需要你确认磁盘与网络；装好后我跑完整性检查。」
- 「itch/Steam 首次登录与 2FA 需要你本人操作，登录态存好后我再 `publish.mjs --apply`。」
- 「数值已到基线，最后的手感/美术取舍需要你试玩拍板。」

证据：`templates/{blender,ue,unity,godot}`；`balance-sweep` 对模板 20 种子出 CSV 基线；`prepare-engine` / `publish` 默认 dry-run，先打印可复现命令。

## 参考文件

| 文件 | 内容 |
|---|---|
| [engine-routing.md](references/engine-routing.md) | 引擎检测特征、决策矩阵、本机就绪检查、缺引擎的降级路线 |
| [build-loop.md](references/build-loop.md) | 需求收敛、范围阶梯、里程碑与验收、砍单 |
| [architecture.md](references/architecture.md) | core/adapter 分层、固定步长、状态机、存档、确定性测试 |
| [web-and-html5.md](references/web-and-html5.md) | Phaser/Canvas/Three.js、无头截图、音频解锁、部署与小游戏 |
| [unity.md](references/unity.md) | 版本、批量构建、测试、编辑器脚本、资产写入边界 |
| [unreal.md](references/unreal.md) | Python 编辑器脚本、Automation、BuildCookRun、资产边界 |
| [godot.md](references/godot.md) | `.tscn`/`.tres`、headless、导出模板、测试 |
| [tool-engines.md](references/tool-engines.md) | GameMaker、Cocos Creator、Construct、RPG Maker、Laya |
| [code-first.md](references/code-first.md) | Bevy、MonoGame、LÖVE、pygame、Raylib、LibGDX、HaxeFlixel |
| [verification.md](references/verification.md) | 无头矩阵、截图配方、状态探针、故障排查、诚实协议 |
| [assets-and-audio.md](references/assets-and-audio.md) | 占位美术、授权、音频生成与混音、导入设置 |
| [asset-pipeline.md](references/asset-pipeline.md) | Blender headless、UE Python、Unity Editor、Godot tool script 生成模型/关卡/预制体；纯数据关卡；导入验证 |
| [publishing-automation.md](references/publishing-automation.md) | butler、steamcmd/SteamPipe、Web 托管、微信/抖音 CLI、Android/iOS CI、回滚与密钥管理 |
| [balance-lab.md](references/balance-lab.md) | 批量种子对局、指标解读、参数扫描、机器人策略、手感测试、防过拟合 |
| [platform-targets.md](references/platform-targets.md) | Windows/macOS/Web/移动/Steam/小游戏/Roblox 打包与限制 |

模板：[web-canvas](templates/web-canvas/) 是可运行的最小 2D 游戏骨架（固定步长、输入、状态探针、存档、音效），复制后替换玩法即可。资产生成模板：[blender/gen_props.py](templates/blender/gen_props.py)、[ue/gen_assets.py](templates/ue/gen_assets.py)、[unity/Editor/BuildTools.cs](templates/unity/Editor/BuildTools.cs)、[godot/tools/gen_content.gd](templates/godot/tools/gen_content.gd)。
