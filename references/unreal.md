# Unreal Engine

## 1. 工程识别与版本

- `*.uproject` 是工程入口。
- `EngineAssociation`：
  - `"5.7"` 这类字符串：Launcher 安装版。
  - `"{GUID}"`：源码编译版，GUID 对应注册表里的引擎。
- 目录：`Config/`、`Content/`、`Source/`、`Plugins/`；`Intermediate/`、`Saved/`、`DerivedDataCache/` 是本机缓存，不提交。

## 2. 本机安装完整性

标准 Launcher 安装：

```text
C:\Program Files\Epic Games\UE_5.7\
  Engine\Binaries\Win64\UnrealEditor.exe
  Engine\Binaries\Win64\UnrealEditor-Cmd.exe
  Engine\Build\BatchFiles\Build.bat
  Engine\Build\BatchFiles\RunUAT.bat
```

如果只有 `Engine\` 而没有 `Binaries\Win64`，说明安装不完整，任何构建命令都会失败。本机当前就是这种情况（2026-11 快照），先用 Epic Games Launcher 校验安装。

## 3. Python 编辑器脚本（首选自动化方式）

在 `.uproject` 里启用：

```json
{ "Name": "PythonScriptPlugin", "Enabled": true },
{ "Name": "EditorScriptingUtilities", "Enabled": true }
```

运行：

```bat
"C:\Program Files\Epic Games\UE_5.7\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" ^
  "C:\work\MyGame\MyGame.uproject" ^
  -run=pythonscript -script="C:\work\tools\setup.py" ^
  -unattended -nosplash -nullrhi -log
```

部分版本也支持 `-ExecutePythonScript="C:\work\tools\setup.py"`；以本机 `UnrealEditor-Cmd.exe -help` 与引擎版本为准。

`setup.py` 示例：

```python
import unreal

actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

level.new_level("/Game/Maps/Main")
for i in range(10):
    actor = actors.spawn_actor_from_class(
        unreal.StaticMeshActor,
        unreal.Vector(i * 200.0, 0.0, 0.0),
    )
    actor.set_actor_label(f"Block_{i}")

unreal.EditorAssetLibrary.save_directory("/Game/Maps", only_if_is_dirty=False)
unreal.log("setup done")
```

注意：

- UE 5.x 用子系统 API；`EditorLevelLibrary`/`EditorAssetLibrary` 的旧接口逐步废弃，跨版本先查本机 Python stub（`Intermediate/PythonStub/unreal.py`）。
- Python 里创建 Blueprint 节点很麻烦；优先 C++ 类、DataTable 或运行时逻辑。
- 脚本失败要看 `Saved/Logs/*.log`，命令本身可能仍返回 0。

## 4. 自动化测试

```bat
UnrealEditor-Cmd.exe "C:\work\MyGame\MyGame.uproject" ^
  -ExecCmds="Automation RunTests Project.Functional; Quit" ^
  -unattended -nullrhi -nosplash ^
  -ReportExportPath="C:\work\reports"
```

- 测试用 `IMPLEMENT_SIMPLE_AUTOMATION_TEST` 写在 `Source/*/Private/Tests/`。
- 过滤串支持 `Project.`、`Project.Functional`、具体测试名。
- `-TestExit="Automation Test Queue Empty"` 可让进程在队列跑完后退出。
- 报告是 JSON/HTML；看 `state: "Success"`，不要只看退出码。

## 5. 构建与打包

编译：

```bat
"<Engine>\Build\BatchFiles\Build.bat" MyGameEditor Win64 Development ^
  -Project="C:\work\MyGame\MyGame.uproject" -WaitMutex
```

打包：

```bat
"<Engine>\Build\BatchFiles\RunUAT.bat" BuildCookRun ^
  -project="C:\work\MyGame\MyGame.uproject" -noP4 ^
  -platform=Win64 -clientconfig=Development ^
  -build -cook -stage -pak -archive ^
  -archivedirectory="C:\work\build"
```

- 首次 cook 很慢，`DerivedDataCache` 会膨胀到几十 GB。
- 打包前确认 `Config/DefaultEngine.ini` 里的 `GameDefaultMap` 与 `GlobalDefaultGameMode`。
- 只被软引用/字符串引用的资产可能不被 cook；用 `DirectoriesToAlwaysCook` 或确保硬引用。

## 6. 资产边界

**不要手改 `.uasset`/`.umap`。** 它们是二进制包，版本、序列化布局、GUID 都由引擎管理，手改基本等于损坏。

安全做法：

- 编辑器里操作，或 Python `unreal` 模块。
- 数据用 CSV/JSON + `DataTable` 导入，逻辑用 C++/Blueprint。
- 批量改资产属性用 Python（`set_editor_property`）。
- 版本控制配 Git LFS 或 Perforce；`.uasset` 无法有效 diff。

## 7. 玩法与输入

- 新工程默认 Enhanced Input：`IA_*`（Input Action）加 `IMC_*`（Input Mapping Context），在 `PlayerController`/`Character` 里绑定。
- Gameplay Ability System（GAS）适合技能、属性、Buff；小项目别硬上。
- Blueprint 适合原型与内容；性能热点、底层系统用 C++。
- 网络：`Replication`、`RPC`、`GameMode/GameState/PlayerState` 分工先分清。

## 8. 性能与验证

- Nanite/Lumen 提升画面上限，也提升目标硬件门槛；先定最低显卡。
- 着色器编译卡顿常见，打包前做一次完整 PSO 缓存。
- 运行验证：

```bat
UnrealEditor-Cmd.exe "C:\work\MyGame\MyGame.uproject" -game -log -windowed -ResX=1280 -ResY=720
```

- 截图：控制台 `HighResShot 1920x1080`，或自动化测试里 `AutomationLibrary` 截图。
- 看 `Saved/Logs/MyGame.log` 的 `Error:`、`Fatal error`、`Ensure condition failed`。

## 9. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| 打不开工程，提示版本不符 | EngineAssociation 与已装版本不一致 | 右键 `.uproject` 切版本，或改 GUID |
| 命令秒退无输出 | 引擎安装不完整、缺 Binaries | 校验安装 |
| Python 导入失败 | 插件未启用或路径错 | 检查 `.uproject` 与 `-script` 绝对路径 |
| 打包后黑屏/闪退 | 默认地图、GameMode、cook 缺失 | 看打包日志与 `Saved/Logs` |
| 编译报模块缺失 | `Source/*.Build.cs` 依赖没加 | 补 `PublicDependencyModuleNames` |
| Live Coding 后行为异常 | 热重载状态不一致 | 重启编辑器 |
| 首次打开极慢 | DDC 为空 | 正常，等一次编译 |

UE 安装不完整时，明确告知用户，不要用「应该能打包」交差。
