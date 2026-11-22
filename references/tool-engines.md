# 工具型引擎：GameMaker、Cocos Creator、Construct、RPG Maker、Laya

这些引擎以编辑器为中心，CLI 与自动化能力弱于 Unity/Godot/UE。核心原则：**能用代码/数据表达的就不要手拼私有资产**；必须 GUI 的步骤明确写进交付说明。

## GameMaker

**工程格式**：`*.yyp` 是 JSON 索引，`objects/*.yy`、`rooms/*.yy`、`scripts/*.gml` 也都是文本。文本能读，但字段与内部 ID 相互引用，手改容易让 IDE 报错。

**安全写法**：

- 逻辑全放 `scripts/*.gml` 或对象的 Create/Step/Draw 事件（`.gml` 可安全新增/编辑）。
- 场景只建一个空 room，运行时用 `instance_create_layer`、`room_goto`、`layer_*` 生成内容。
- 资源引用用 `asset_get_index("spr_player")` 这类名字查找，避免硬编码数字 ID。
- 需要新对象时，优先用已有对象加变量/状态，而不是批量生成 `.yy`。

**运行与构建**：

- IDE 里 F5 运行；命令行入口是 runtime 目录下的 `Igor.exe`（如 `%ProgramData%\GameMakerStudio2\Cache\runtimes\<ver>\Igor.exe`）。
- CLI 参数随版本变化，先跑 `Igor.exe --help` 或查对应版本文档，常见形式是 `/project="...yyp" /config=Default /platform=Windows /build`。
- 需要登录的账号与 runtime 许可；无 IDE 的机器通常无法构建。

**验证**：能启动游戏窗口、`show_debug_message` 输出、截图（`screen_save` 或外部截屏）。GML 单测生态弱，把纯逻辑写成无副作用脚本，用 `Igor` 跑一个测试 room 输出结果。

**适用**：2D 像素、快速原型、GameMaker 经验团队。**不适用**：3D、复杂联网、强 CI。

## Cocos Creator

**工程格式**：`assets/` 下每个资源配 `.meta`（uuid），场景/预制体是 JSON；`settings/` 存项目设置。手改 JSON 要同步 uuid，风险高。

**安全写法**：

- 逻辑用 TypeScript 组件（`@ccclass`、`@property`），放 `assets/scripts/`。
- 场景尽量薄：一个启动场景加代码动态 `instantiate` 预制体或 `new Node()`。
- 必须用编辑器做的：场景层级、预制体绑定、动画剪辑、物理材质。把这些步骤写进 README。
- 资源加载用 `resources.load` 或 Asset Bundle，避免硬编码 uuid。

**构建**：

```bat
"C:\ProgramData\cocos\editors\Creator\3.8.3\CocosCreator.exe" ^
  --project "C:\work\MyGame" ^
  --build "platform=web-mobile;debug=true"
```

参数以 `CocosCreator.exe --help` 与版本文档为准；构建结果在 `build/`。

**验证**：构建退出码、`build/web-mobile/index.html` 可被浏览器加载、控制台无错。原生平台需 Android SDK/Xcode。

**适用**：微信/抖音小游戏、H5、2D 手游。**不适用**：重度 3D、主机。

## Construct 3

**工程格式**：`.c3p` 是 zip，内含 JSON（layouts、eventSheets、objectTypes）。可解压检查，但不建议手写事件表。

**能力**：事件表可视化、内置行为与插件、JS 脚本（Scripting API）。导出 HTML5、Windows、Android 等。

**自动化**：几乎没有可靠 CLI；构建与预览靠编辑器/浏览器。适合策划主导、交互不复杂的小游戏。

**验证**：浏览器预览、控制台、导出后本地起服务器打开。

**适用**：无代码、教学、快速 H5。**不适用**：需要版本控制友好 diff、CI、自定义底层。

## RPG Maker MV / MZ

**工程格式**：`data/*.json` 是纯 JSON（地图、事件、数据库），`js/plugins/` 是 JS，`audio/`、`img/` 是素材。**这是少见的可以安全用代码/脚本批量生成的商业引擎数据格式**。

**安全写法**：

- 批量生成地图/敌人/物品：直接读写 `data/*.json`，保持字段结构与 ID 连续。
- 插件写 `js/plugins/<Name>.js`，并在 `js/plugins.js` 注册。
- 事件逻辑复杂时用插件而不是堆事件页。
- 修改前备份 `data/`，JSON 结构错会让游戏启动失败。

**运行**：MV 用 `nw.exe`（`Game.exe` 包装），MZ 同理；Web 部署把 `www/`（MV）或工程根（MZ）当静态站点。

**验证**：Node 读取所有 `data/*.json` 做 JSON 校验、`node --check` 插件语法、启动游戏走到标题与第一张地图。

**适用**：JRPG、剧情向、回合制。**不适用**：动作、3D、联网。

## LayaAir / Egret

- 老牌 H5 引擎，适合 2D 小游戏与广告互动。
- LayaAir 3.x 用 TypeScript，IDE 与 CLI 构建；Egret 已基本停止维护，新项目优先 LayaAir 或 Cocos。
- 迁移建议：Egret 项目评估工作量后转 Cocos/LayaAir，不要在新项目选 Egret。

## 选择速查

| 需求 | 选择 |
|---|---|
| 2D 像素、GameMaker 手感 | GameMaker |
| 微信小游戏、TS 团队 | Cocos Creator |
| 无代码互动 H5 | Construct 3 |
| JRPG、剧情驱动 | RPG Maker MZ |
| 老 H5 项目维护 | LayaAir；Egret 只做维护 |

工具型引擎交付时，README 必须写清「哪些步骤必须在编辑器里点」，以及「已验证到哪一层」。
