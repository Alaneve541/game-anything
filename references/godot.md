# Godot 4

## 1. 工程与版本

- 入口 `project.godot`，`config_version=5` 对应 Godot 4.x；3.x 是 `config_version=4`，两者语法差异大，不要混用。
- 版本写在 `[application] config/features=PackedStringArray("4.3", "GL Compatibility")`。
- 目录：`scenes/`、`scripts/`、`assets/`、`addons/`；`.godot/` 是本机导入缓存，不提交。
- Godot 是单文件可执行程序，解压即用；headless 无需显卡。

## 2. 文本场景

`.tscn`/`.tres` 是文本格式，可以安全手写（注意格式版本与 `uid`）：

```ini
[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://scripts/player.gd" id="1_abc"]

[node name="Player" type="CharacterBody2D"]
script = ExtResource("1_abc")
```

Godot 4.4 起资源还带 `uid://...`；保留已有 uid，新增资源用路径也能工作。改完后用编辑器打开一次让 Godot 重算导入与 uid。

## 3. 运行与无头

```bash
godot --path .                      # 运行主场景
godot --path . --headless --quit-after 120   # 无渲染跑 120 帧
godot --headless --path . --editor --quit    # 只做导入/编译检查
godot --headless --path . --script res://tests/run.gd  # 自定义测试入口
```

- `--headless` 用 dummy 渲染/音频，只适合逻辑、场景树、资源加载测试；截图必须真渲染。
- `--quit-after N` 的单位是帧。
- 首次导入资源需要跑一次 `--editor --quit`，否则 headless 可能找不到 `.import`。

## 4. 脚本要点（GDScript 4）

```gdscript
extends CharacterBody2D

@export var speed: float = 260.0
@onready var sprite: Sprite2D = $Sprite2D

signal died

func _physics_process(delta: float) -> void:
    var dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    velocity = dir * speed
    move_and_slide()

func take_damage(amount: int) -> void:
    hp -= amount
    if hp <= 0:
        died.emit()
        queue_free()
```

- 输入动作在 `project.godot` 的 `[input]` 里定义，或编辑器 Project Settings → Input Map。
- 单例用 `[autoload] Game="*res://scripts/game.gd"`。
- `await get_tree().create_timer(0.5).timeout` 做延时。
- 类型标注能提前发现错误；`@export` 暴露到检查器。

## 5. 测试

- [GUT](https://github.com/bitwes/Gut)：`godot --headless -s addons/gut/gut_cmdln.gd -gdir=res://test -gexit`。
- [GdUnit4](https://github.com/MikeSchulze/gdUnit4)：有 CLI 与 VSCode 集成。
- 无框架时自写 `SceneTree` 脚本，断言失败 `quit(1)`：

```gdscript
extends SceneTree

func _init() -> void:
    var sim := preload("res://scripts/sim.gd").new(1234)
    for i in 600:
        sim.step(1.0 / 60.0)
    if sim.score != 42:
        push_error("expected 42, got %d" % sim.score)
        quit(1)
    quit(0)
```

## 6. 导出

```bash
godot --headless --path . --export-release "Windows Desktop" build/game.exe
```

- 需要先安装导出模板（Editor → Manage Export Templates），版本必须匹配。
- 导出配置在 `export_presets.cfg`，可提交。
- Web 导出得到 `index.html` + `wasm`，需要 HTTP 服务器与正确的 COOP/COEP（线程版）。
- Android/iOS 需要 SDK/Xcode 与签名配置。

## 7. 验证清单

- [ ] `godot --headless --path . --quit-after 60` 退出码 0
- [ ] 日志无 `SCRIPT ERROR`、`Parse Error`
- [ ] 测试脚本 `quit(0)`
- [ ] 导出产物存在
- [ ] 有渲染运行时截图（headless 只能证明逻辑）
- [ ] `project.godot` 主场景路径正确

截图（窗口模式）：

```gdscript
await RenderingServer.frame_post_draw
var img := get_viewport().get_texture().get_image()
img.save_png("user://shot.png")
```

`user://` 在 Windows 是 `%APPDATA%\Godot\app_userdata\<项目名>\`。

## 8. 常见故障

| 现象 | 原因 | 处理 |
|---|---|---|
| `Parse Error` | GDScript 4 与 3 语法混用 | 检查 `config_version` 与 `await`/`@export` |
| 场景打不开 | `.tscn` 引用 uid/path 错 | 用编辑器重存，或修正 `ext_resource` |
| headless 找不到资源 | 未导入 | 先 `--editor --quit` 生成 `.import` |
| 导出失败 | 缺导出模板 | 安装匹配版本模板 |
| C# 脚本不编译 | 用了非 .NET 版 Godot 或缺 SDK | 换 .NET 版并装 .NET SDK |
| Web 导出黑屏 | 跨域隔离/服务器 MIME | 用官方模板服务器，检查 COOP/COEP |
| 手机上闪退 | 渲染后端/权限 | 看 logcat，切 GL Compatibility |
