# 程序化资产与关卡生成（Asset Pipeline）

目标：**模型、关卡、动画、贴图不由人手动点编辑器生成，而是由脚本调用引擎/工具 API 生成**，每次可重复、可进 CI、可批量。

二进制资产（`.uasset`/`.umap`、`.unity`/`.prefab`、`.glb`/`.fbx`、游戏内关卡数据）本身**不手写字节**，但它们的内容由工具链生成：Blender 出模型、引擎编辑器脚本建场景、纯数据格式生成关卡。这是"生成"，不是"手改"。

## 决策表：内容类型 → 生成方式

| 内容 | 首选生成方式 | 次选 | 不推荐 |
|---|---|---|---|
| 3D 模型（道具/角色/场景块） | Blender headless（`blender -b --python`）导出 GLB/FBX | 引擎内程序化网格（Unity Mesh API / Godot ArrayMesh / UE ProceduralMesh） | 手改二进制 |
| 关卡布局 | 引擎编辑器脚本（UE Python / Unity Editor / Godot tool script） | 自有 JSON/文本关卡格式 + 加载器 | 手拼 `.umap`/`.unity` |
| 贴图/图标 | Pillow / Sharp 程序化绘制 | AI 出图 + 后处理 | 手绘占位 |
| 动画 | Blender 关键帧脚本导出 | 代码驱动（Tween/程序动画） | 手动 K 帧（可接受但慢） |
| 音频 | `generate_audio`（TTS/音乐/音效）+ `search_audio_library` | 程序化合成（WebAudio/纯代码） | 版权素材 |
| 数据表 | CSV/JSON 生成 → 引擎导入（UE DataTable / Unity ScriptableObject / Godot Resource） | 代码内常量 | 手填编辑器表格 |

## 1) Blender headless：模型与导出（跨引擎通用）

```bash
# 生成道具和关卡块，导出 GLB + FBX
blender -b --python templates/blender/gen_props.py -- --out build/models --format glb,fbx
```

要点：

- `-b` 无界面运行，脚本里用 `bpy.ops` 或 `bmesh` 生成网格，最后 `bpy.ops.export_scene.gltf(filepath=...)`。
- 坐标：Blender 是 Z-up，UE 是 Z-up、Unity 是 Y-up、glTF 导出时用 `export_yup=True`（默认）对齐 Unity/Three.js；UE 导入时勾选 `Convert Scene`。
- 单位：Blender 1 unit = 1 m；Unity 1 unit = 1 m；UE 1 uu = 1 cm，导入时 Scale 1.0 即可（UE 会自动 ×100）。
- 材质：Blender 用 Principled BSDF，导出 glTF 时保留 baseColor/roughness/metallic；复杂节点不会导出，需要烘焙。
- 版本：脚本里读 `bpy.app.version` 做分支，4.x 与 3.x 的 API 有差异。

模板：[templates/blender/gen_props.py](../templates/blender/gen_props.py)（生成 3 个方块/圆柱/平台 + 材质 + 导出，命令行参数控制输出目录与格式）。

## 2) Unreal：Python 编辑器脚本生成资产与关卡

```bash
"C:/Program Files/Epic Games/UE_5.7/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" \
  "D:/proj/MyGame.uproject" -run=pythonscript -script="D:/proj/Tools/gen_assets.py" \
  -unattended -nosplash -stdout -FullStdOutLogOutput
```

`Tools/gen_assets.py` 里可做的事（全部是官方 Python API）：

```python
import unreal

assets = unreal.AssetToolsHelpers.get_asset_tools()
# 1) 导入 FBX/GLB（会生成 .uasset，内容来自文件而非手写）
task = unreal.AssetImportTask()
task.filename = "D:/build/models/crate.fbx"
task.destination_path = "/Game/Props"
task.automated = True
task.replace_existing = True
task.save = True
assets.import_asset_tasks([task])

# 2) 生成关卡并摆放
world = unreal.EditorLevelLibrary.new_level("/Game/Maps/Arena")
for i in range(8):
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(
        unreal.StaticMeshActor, unreal.Vector(i * 300, 0, 0))
    mesh = unreal.load_asset("/Game/Props/crate.crate")
    actor.static_mesh_component.set_static_mesh(mesh)
unreal.EditorLevelLibrary.save_current_level()

# 3) 生成材质实例、数据表、蓝图类
unreal.AssetToolsHelpers.get_asset_tools().create_asset(
    "MI_Crate", "/Game/Materials",
    unreal.MaterialInstanceConstant, unreal.MaterialInstanceConstantFactoryNew())
```

- 导入后的资产验证：`unreal.EditorAssetLibrary.does_asset_exist("/Game/Props/crate")`，打印资产数。
- 关卡保存后检查 `.umap` 存在且时间戳更新；再用 `-game -nullrhi` 启动一次确认不崩。
- 不要手改 `.uasset`/`.umap`；不要 `git` 合并二进制。

## 3) Unity：Editor 脚本 + batchmode 生成场景/预制体/网格

```bash
"C:/Program Files/Unity/Hub/Editor/6000.0.30f1/Editor/Unity.exe" \
  -batchmode -quit -projectPath "D:/proj/MyGame" -executeMethod BuildTools.GenContent \
  -logFile "D:/proj/Logs/gen.log"
```

```csharp
// Assets/Editor/BuildTools.cs
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class BuildTools {
    public static void GenContent() {
        // 程序化网格 -> 资产
        var mesh = new Mesh();
        mesh.vertices = new[]{ Vector3.zero, Vector3.right, Vector3.forward };
        mesh.triangles = new[]{ 0, 1, 2 };
        mesh.RecalculateNormals();
        AssetDatabase.CreateAsset(mesh, "Assets/Generated/Tri.asset");

        // 生成预制体
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = "Crate";
        PrefabUtility.SaveAsPrefabAsset(go, "Assets/Generated/Crate.prefab");
        Object.DestroyImmediate(go);

        // 生成并保存场景
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        for (int i = 0; i < 8; i++) {
            var inst = (GameObject)PrefabUtility.InstantiatePrefab(
                AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Generated/Crate.prefab"));
            inst.transform.position = new Vector3(i * 2, 0, 0);
        }
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Arena.unity");
        AssetDatabase.SaveAssets();
        Debug.Log("[GenContent] ok");
    }
}
```

- 成功判定：`-executeMethod` 退出码 0 且日志含 `[GenContent] ok`；`.unity`/`.prefab` 文件存在。
- 导入 FBX：`AssetPostprocessor` 或 `ModelImporter` 设置（scale、animation、材质）。
- `.meta` GUID 由 Unity 生成，不要手写 GUID；场景/预制体用 API 保存后由 Unity 分配。

## 4) Godot：tool script 生成 `.tscn`/`.tres`/程序化网格

```bash
godot --headless --path "D:/proj/MyGame" --script res://tools/gen_content.gd
```

```gdscript
# tools/gen_content.gd
extends SceneTree

func _init() -> void:
    # 程序化网格资源
    var mesh := ArrayMesh.new()
    var arr := []
    arr.resize(Mesh.ARRAY_MAX)
    arr[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3(0,0,0), Vector3(1,0,0), Vector3(0,1,0)])
    arr[Mesh.ARRAY_NORMAL] = PackedVector3Array([Vector3.BACK, Vector3.BACK, Vector3.BACK])
    mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
    ResourceSaver.save(mesh, "res://generated/tri.tres")

    # 生成场景并保存为文本 .tscn
    var root := Node3D.new()
    root.name = "Arena"
    for i in range(8):
        var body := MeshInstance3D.new()
        body.mesh = mesh
        body.position = Vector3(i * 2, 0, 0)
        root.add_child(body)
    var packed := PackedScene.new()
    packed.pack(root)
    ResourceSaver.save(packed, "res://scenes/arena.tscn")
    print("[GenContent] ok")
    quit(0)
```

- `.tscn` 是文本，可被生成、可 diff；`.glb` 导入由 Godot 自动完成（`.import` 文件自动生成）。
- 验证：`godot --headless --quit-after 2 res://scenes/arena.tscn` 退出码 0，且无 `ERROR:` 行。

## 5) 纯数据关卡（最稳、最适合 CI 与大关卡）

关卡=JSON/CSV，加载器在运行时构建场景。好处：可程序生成（随机地牢、波次、程序化地形）、可单测、可 diff。

```json
{ "rooms": [ {"x":0,"y":0,"w":12,"h":8,"tags":["start"]},
             {"x":14,"y":0,"w":10,"h":10,"tags":["combat"]} ],
  "spawns": [ {"room":1,"enemy":"grunt","n":3,"hp":20} ] }
```

生成器：Node/Python 脚本按种子产出 JSON；引擎侧只写一次加载器。适合 roguelike、塔防、刷子游戏。

## 6) 2D 贴图/图标程序化

```bash
# 需要 Pillow 的 Python
python -c "from PIL import Image, ImageDraw; im=Image.new('RGBA',(64,64),(0,0,0,0)); d=ImageDraw.Draw(im); d.ellipse((8,8,56,56),fill=(90,200,255,255)); im.save('build/orb.png')"
```

- 图标、UI 九宫格、粒子贴图、占位 tileset 都适合程序生成。
- 生成后加一次 alpha 边距检查，避免采样出现黑边。

## 7) 验证（每类内容都要有断言）

| 内容 | 断言 |
|---|---|
| 导入的模型 | 资产存在 + 三角形数 > 0 + 尺寸接近预期 |
| 生成的关卡 | 文件存在 + 加载不报错 + 出生点/敌人数量正确 |
| 生成的贴图 | 尺寸正确 + 非全透明 + 文件大小 > 1KB |
| 生成的数据表 | 行数 = 配置数 + 主键唯一 |

引擎侧统一用「启动 → 截图/状态断言」收口，见[验证手册](verification.md)。

## 反模式

- 让 Agent 直接编辑二进制资产字节。
- 依赖 GUI 点击生成内容（不可重复、CI 无法跑）。
- 把手工摆的关卡当唯一内容来源；至少留一个脚本化生成路径。
- 忽略坐标系与单位差异，导致导入后模型小 100 倍或躺倒。
