# Unity

## 1. 版本与安装

- 版本锁在 `ProjectSettings/ProjectVersion.txt`：

```yaml
m_EditorVersion: 2022.3.45f1
m_EditorVersionWithRevision: 2022.3.45f1 (a1b2c3d4e5f6)
```

- 打开工程时必须用同版本或允许升级；跨大版本先备份。
- 安装路径：`C:\Program Files\Unity\Hub\Editor\<version>\Editor\Unity.exe`。
- 许可证：Hub 登录个人版，或企业 `Unity_lic.ulf`。无许可证时 batchmode 会直接失败。

## 2. 工程结构

```text
Assets/            场景、脚本、素材、Prefab
Packages/manifest.json   包依赖
ProjectSettings/   工程设置（输入、图形、构建场景列表）
Library/           本机缓存，不提交
Logs/              编辑器日志
```

- 构建场景列表在 `ProjectSettings/EditorBuildSettings.asset`，新场景不加进去就不会被打包。
- 包管理用 `Packages/manifest.json`；URP/HDRP、Input System、TextMeshPro、Test Framework 都从这里来。

## 3. 批量构建

```bat
"C:\Program Files\Unity\Hub\Editor\2022.3.45f1\Editor\Unity.exe" ^
  -batchmode -quit -nographics ^
  -projectPath "C:\work\MyGame" ^
  -executeMethod BuildScript.BuildWin64 ^
  -logFile "C:\work\build.log"
```

`BuildScript.cs` 放 `Assets/Editor/`：

```csharp
using UnityEditor;
using UnityEditor.Build.Reporting;

public static class BuildScript
{
    public static void BuildWin64()
    {
        var opts = new BuildPlayerOptions
        {
            scenes = new[] { "Assets/Scenes/Main.unity" },
            locationPathName = "Builds/Win64/Game.exe",
            target = BuildTarget.StandaloneWindows64,
            options = BuildOptions.None,
        };
        var report = BuildPipeline.BuildPlayer(opts);
        if (report.summary.result != BuildResult.Succeeded)
            EditorApplication.Exit(1);
    }
}
```

- 退出码 0 才算成功；同时 grep 日志里的 `error CS`、`Build completed with a result of 'Failed'`。
- `-nographics` 不渲染，适合编译与逻辑测试；要截图就别加。
- 切换平台：`-buildTarget Win64`，或先在 `BuildPipeline` 里 `SwitchActiveBuildTarget`。

## 4. 自动化测试

```bat
Unity.exe -batchmode -nographics -projectPath "C:\work\MyGame" ^
  -runTests -testPlatform PlayMode ^
  -testResults "C:\work\results.xml" -logFile "C:\work\test.log"
```

- 需要 `com.unity.test-framework`（新工程默认带）。
- EditMode 测纯逻辑，PlayMode 测场景、物理、协程、UI。
- 结果 XML 里 `<test-run result="Passed">` 才算通过；只看退出码不够稳。
- 截图可在 PlayMode 测试里做：

```csharp
var tex = ScreenCapture.CaptureScreenshotAsTexture();
System.IO.File.WriteAllBytes("C:/work/shot.png", tex.EncodeToPNG());
```

## 5. 编辑器脚本生成场景（推荐）

不要手改 `.unity`/`.prefab` 的 YAML。它们用 `fileID` + GUID 互相引用，手改极易丢引用。用编辑器 API：

```csharp
[MenuItem("Game/Setup Main Scene")]
static void Setup()
{
    var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
    var cam = new GameObject("Main Camera").AddComponent<Camera>();
    cam.tag = "MainCamera";

    var player = new GameObject("Player");
    player.AddComponent<CharacterController>();
    player.AddComponent<PlayerController>();

    EditorSceneManager.SaveScene(scene, "Assets/Scenes/Main.unity");
    EditorBuildSettings.scenes = new[] {
        new EditorBuildSettingsScene("Assets/Scenes/Main.unity", true)
    };
}
```

常用 API：`EditorSceneManager`、`PrefabUtility`、`AssetDatabase`、`SerializedObject`、`EditorBuildSettings`。

更稳的 Agent 写法：只保留一个空场景加一个 Bootstrap 脚本，运行时用代码生成世界。场景文件几乎不用变，逻辑全在可测试的 C# 里。

## 6. 资产与引用

- 每个资产有 `.meta`（GUID）。不要删除或手改 `.meta`，否则引用全断。
- 移动/重命名用 `AssetDatabase.MoveAsset`，不要用文件管理器。
- 运行时加载优先 `Addressables` 或 `Resources`；`Resources` 简单但难拆分。
- 输入：新工程用 Input System（`InputActionAsset`），老工程可能用 legacy Input。先看 `ProjectSettings/ProjectSettings.asset` 的 `activeInputHandler`。
- UI：UGUI + TextMeshPro；TMP 首次使用要导入 Essentials。

## 7. 验证清单

- [ ] `Unity.exe -batchmode -quit` 退出码 0
- [ ] 日志无 `error CS`、无 `NullReferenceException`
- [ ] 测试 XML `result="Passed"`
- [ ] 构建产物 `Builds/Win64/Game.exe` 存在且能启动
- [ ] PlayMode 截图不是黑屏
- [ ] 新增场景在 Build Settings 里

## 8. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| batchmode 秒退 | 许可证缺失、工程被锁、版本不符 | 看 `Editor.log`；关掉已打开的编辑器 |
| 编译错误卡住构建 | 脚本报错 | 先修 `error CS`，别反复重跑 |
| 场景打开是空的 | 场景未保存或路径错 | 检查 `EditorBuildSettings` 与 `.meta` |
| 运行时引用丢失 | 手改/删了 `.meta` | 恢复 `.meta`，或用 `AssetDatabase` 重建引用 |
| 按键无反应 | Input System 与 legacy 设置不匹配 | 检查 `activeInputHandler` 与 EventSystem |
| 打包缺资源 | 只被代码字符串引用，未进构建 | 用 Addressables 或放进 `Resources` |
| 移动端崩溃 | IL2CPP/架构/权限 | 看 `adb logcat`，确认 ARM64 与权限 |

Unity 未安装时不要伪造构建结果；给出工程骨架与用户本机的打开步骤，并标注未验证部分。
