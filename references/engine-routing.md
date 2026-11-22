# 引擎路由与环境就绪

目标：用最少信息选对引擎，并在承诺之前确认它在本机真的能跑。

## 1. 识别已有工程

命中任一硬信号即可基本确定；多个引擎同时命中时看根目录与文件密度，不要混搭。

| 引擎 | 硬信号 | 辅助信号 |
|---|---|---|
| Unreal | `*.uproject` | `Config/DefaultEngine.ini`、`Content/`、`Source/*.Target.cs`、`Intermediate/` |
| Unity | `ProjectSettings/ProjectVersion.txt` | `Assets/`、`Packages/manifest.json`、`*.unity`、`*.asmdef`、`Library/` |
| Godot | `project.godot` | `*.tscn`、`*.tres`、`.godot/`、`export_presets.cfg` |
| GameMaker | `*.yyp` | `objects/`、`rooms/`、`scripts/*.gml`、`options/`、`datafiles/` |
| Cocos Creator | `assets/` 下大量 `.meta` 加 `settings/` | `package.json`、`tsconfig.json`、`library/`、`temp/` |
| RPG Maker MV | `Game.rpgproject` | `data/System.json`、`js/plugins.js`、`www/` |
| RPG Maker MZ | `game.rmmzproject` | `data/System.json`、`js/plugins/`、`audio/` |
| Construct 3 | `*.c3p`（zip） | `project.c3proj`、`eventSheets/`、`layouts/` |
| Phaser | `package.json` 依赖 `phaser` | `src/scenes/`、`public/assets/` |
| Three.js / Babylon | 依赖 `three` 或 `@babylonjs/core` | `src/`、`public/models/` |
| PixiJS / Kaplay | 依赖 `pixi.js` 或 `kaplay` | — |
| Bevy | `Cargo.toml` 依赖 `bevy` | `assets/`、`src/main.rs` |
| MonoGame / FNA | `*.csproj` 引用 `MonoGame.Framework` | `Content/Content.mgcb` |
| LÖVE | `conf.lua` 加 `main.lua` | `*.lua`、`assets/` |
| pygame | `requirements.txt` 或 `pyproject.toml` 含 `pygame` | `main.py`、`assets/` |
| Roblox | `default.project.json`（Rojo） | `*.rbxlx`、`src/**/*.luau` |
| Defold | `game.project` | `*.collection`、`*.go` |
| HaxeFlixel / OpenFL | `Project.xml` | `*.hxproj`、`source/` |
| LibGDX | `build.gradle` 含 `gdx` | `core/`、`android/`、`lwjgl3/` |
| Ebitengine | `go.mod` 含 `ebiten` | `main.go` |

`scripts/detect-engine.mjs` 已实现这些规则并给出评分与根目录，优先用它，别手写一遍。

## 2. 本机就绪检查（Windows）

| 引擎 | 检查位置 | 完整标志 |
|---|---|---|
| Unity | `C:\Program Files\Unity\Hub\Editor\<ver>\Editor\Unity.exe`；或 Unity Hub 安装目录 | `Unity.exe` 存在；许可证由 Hub 登录或 `Unity_lic.ulf` 提供 |
| Unreal | `C:\Program Files\Epic Games\UE_5.x\` | `Engine\Binaries\Win64\UnrealEditor.exe` 存在。只有 `Engine\` 没有 `Binaries\Win64` 说明安装不完整 |
| Godot | `godot --version`；或解压目录 | 4.x 支持 `--headless`；导出还需 `export_templates` |
| GameMaker | IDE 在 `C:\Program Files\GameMaker Studio 2` 或 `%LOCALAPPDATA%\GameMaker Studio 2`；runtime 在 `%ProgramData%\GameMakerStudio2\Cache\runtimes\<ver>` | `Igor.exe` 存在且账号已登录 |
| Cocos Creator | `C:\ProgramData\cocos\editors\Creator\3.x\CocosCreator.exe`；或 Cocos Dashboard | 编辑器可启动，Dashboard 已登录 |
| Construct 3 | 浏览器版或桌面版 | 无 CLI，基本靠 GUI |
| RPG Maker | 安装目录下 `nw.exe`（MV/MZ） | 工程能被编辑器打开 |
| .NET（MonoGame/Unity C#） | `dotnet --list-sdks` | 至少一个 8.x SDK |
| Node（Web/工具链） | `node -v` | 20 以上；本机 24 可用 |
| 浏览器（Web 验证） | `msedge.exe` 或 `chrome.exe` | 支持 `--headless=new` |

`detect-engine.mjs` 会打印 `toolchain` 与 `installedEngines`，并标出「已安装但缺关键二进制」的引擎。

**本机环境快照（2026-11，可能过时，以脚本为准）**：Node 24 可用；Edge 存在；`dotnet` 宿主存在但未列出 SDK；Unreal 5.7 只有部分目录，`Engine/Binaries/Win64` 缺失；未发现 Unity、Godot、GameMaker、Cocos。也就是说当前可立即无头验证的默认路径是 Web，Unreal 必须先修安装。

## 3. 决策矩阵

| 维度 | 更合适的选择 |
|---|---|
| 2D、小体量、当天要能玩 | Phaser/Canvas > Godot > GameMaker |
| 3D、写实、已装 UE | Unreal > Unity HDRP |
| 3D、移动端、团队会 C# | Unity > Godot |
| 开源、无授权费、快速迭代 | Godot 4 > Bevy |
| 像素风、GameMaker 经验 | GameMaker > LÖVE |
| 纯逻辑、CI、无 GUI | Bevy/MonoGame/LÖVE/pygame > Godot headless |
| 微信/抖音小游戏 | Cocos Creator > LayaAir > Unity WebGL 适配 |
| 无代码、策划主导 | Construct 3 / GDevelop |
| 平台内创作（Roblox/Minecraft） | Roblox + Rojo / 数据包 |
| 主机 | Unity/Unreal（需开发者资质）；Godot 主机支持有限 |

判断顺序：

1. 用户点名引擎：直接用，先读对应参考。
2. 项目已存在：跟随现有引擎与版本，不迁移。
3. 目标平台硬约束：小游戏、主机、Roblox 等先定平台。
4. 本机可验证性：装不上的引擎不要作为唯一方案。
5. 迭代速度与团队语言：C# 团队偏 Unity，C++ 偏 UE，GDScript 偏 Godot。
6. 美术与性能需求：写实 3D 才值得上 UE。

## 4. 缺引擎时的降级路线

按成本从低到高：

1. **Web 可验证切片**：用 Phaser/Canvas 在 1–2 小时内做出同一核心循环，拿到截图与状态断言，证明玩法成立。
2. **目标引擎骨架**：生成可导入的工程结构与脚本，标注「未在本机构建验证」，并给出用户本机的打开与构建步骤。
3. **安装引擎**：先说明体积、账号、许可证与耗时，得到同意再装。Godot 是唯一轻量免登录选项（zip 解压即用）。
4. **换引擎**：如果目标引擎长期不可用，和用户确认是否接受等价引擎（如 Unity ↔ Godot，UE ↔ Unity HDRP）。

绝不要把第 1 步的 Web 原型描述成「Unreal/Unity 版本已完成」。

## 5. 常见误选

- 为 2D 小游戏上 UE：构建、着色器、包体全部过重。
- 为网页小 demo 上 Unity WebGL：首次构建慢、包体大、移动端兼容差。
- 用 GameMaker 做 3D 或复杂联网。
- 用 Construct 做需要版本控制与 CI 的长期项目。
- 在 Roblox 上做需要 Steam/主机发行的游戏。
- 没有明确需求就自研引擎或通用 ECS 框架。
