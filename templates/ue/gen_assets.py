"""
gen_assets.py — Unreal 编辑器 Python：导入 FBX、生成关卡、摆放道具、保存。

用法（Windows）:
  "C:/Program Files/Epic Games/UE_5.7/Engine/Binaries/Win64/UnrealEditor-Cmd.exe" \
    "D:/proj/MyGame.uproject" -run=pythonscript -script="D:/proj/Tools/gen_assets.py" \
    -unattended -nosplash -stdout -FullStdOutLogOutput

前置：uproject 启用 PythonScriptPlugin 与 EditorScriptingUtilities（或 5.x 的 EditorScriptingUtilities 内置）。

验证：日志出现 [gen_assets] done；/Game/Maps/Arena 存在；.umap 时间戳更新。
"""

import unreal
import os

MODELS_DIR = os.environ.get("GEN_MODELS_DIR", "D:/build/models")
PROPS_PATH = "/Game/Generated/Props"
MAP_PATH = "/Game/Maps/Arena"
ASSET_TOOLS = unreal.AssetToolsHelpers.get_asset_tools()
EAL = unreal.EditorAssetLibrary
ELL = unreal.EditorLevelLibrary


def import_models():
    files = [f for f in os.listdir(MODELS_DIR) if f.lower().endswith((".fbx", ".glb", ".obj"))] if os.path.isdir(MODELS_DIR) else []
    if not files:
        unreal.log_warning("[gen_assets] no model files in " + MODELS_DIR + "，跳过导入")
        return []
    tasks = []
    for name in files:
        t = unreal.AssetImportTask()
        t.filename = os.path.join(MODELS_DIR, name)
        t.destination_path = PROPS_PATH
        t.automated = True
        t.replace_existing = True
        t.save = True
        tasks.append(t)
    ASSET_TOOLS.import_asset_tasks(tasks)
    imported = [p for p in EAL.list_assets(PROPS_PATH) if p]
    unreal.log(f"[gen_assets] imported {len(imported)} assets from {len(tasks)} files")
    return imported


def build_level(mesh_paths):
    # 新建关卡（会生成 .umap，内容由脚本产生，不是手写二进制）
    level = ELL.new_level(MAP_PATH)
    for i, path in enumerate(mesh_paths[:8]):
        actor = ELL.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(i * 300.0, 0.0, 0.0))
        mesh = unreal.load_asset(path)
        if mesh and actor:
            actor.static_mesh_component.set_static_mesh(mesh)
            actor.set_actor_label(f"Prop_{i}")
    ELL.save_current_level()
    unreal.log("[gen_assets] level saved: " + MAP_PATH)


def main():
    imported = import_models()
    if EAL.does_asset_exist(MAP_PATH):
        unreal.log_warning("[gen_assets] map already exists, overwriting")
    build_level(imported)
    ok = EAL.does_asset_exist(MAP_PATH)
    unreal.log("[gen_assets] done map_exists=" + str(ok))
    if not ok:
        raise RuntimeError("[gen_assets] map was not created")


main()
