"""
gen_props.py — Blender headless 生成占位道具与关卡块，并导出 GLB/FBX。

用法:
  blender -b --python gen_props.py -- --out build/models --format glb,fbx

验证 (Blender 3.x/4.x):
  blender -b --python gen_props.py -- --out /tmp/models
  ls /tmp/models   # 应看到 crate.glb / crate.fbx / pillar.glb ...

说明:
  - 只依赖 bpy/bmesh，无需第三方插件。
  - 默认导出 Y-up（glTF 标准），Unity/Three.js 直接用；UE 导入时勾选 Convert Scene。
"""

import argparse
import os
import sys

import bpy
import bmesh
from mathutils import Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", default="build/models")
    p.add_argument("--format", default="glb,fbx")
    return p.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def make_material(name, color, rough=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = rough
    return mat


def add_box(name, size, loc, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = Vector(size) / 2.0
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def add_cylinder(name, radius, depth, loc, mat):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=16, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def export_one(obj, out_dir, formats):
    os.makedirs(out_dir, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    base = os.path.join(out_dir, obj.name)
    if "glb" in formats:
        bpy.ops.export_scene.gltf(filepath=base + ".glb", export_format="GLB", export_yup=True)
    if "fbx" in formats:
        bpy.ops.export_scene.fbx(filepath=base + ".fbx", use_selection=True, apply_scale_options="FBX_SCALE_ALL")
    print(f"[gen_props] exported {base}")


def main():
    args = parse_args()
    formats = [f.strip().lower() for f in args.format.split(",") if f.strip()]
    clear_scene()

    wood = make_material("Mat_Crate", (0.55, 0.36, 0.18), 0.8)
    stone = make_material("Mat_Pillar", (0.45, 0.45, 0.5), 0.9)
    metal = make_material("Mat_Platform", (0.25, 0.35, 0.45), 0.4)

    props = [
        add_box("crate", (1.0, 1.0, 1.0), (0, 0, 0.5), wood),
        add_box("platform", (4.0, 4.0, 0.4), (0, 0, 0.2), metal),
        add_cylinder("pillar", 0.4, 3.0, (0, 0, 1.5), stone),
    ]

    for obj in props:
        export_one(obj, args.out, formats)
    print(f"[gen_props] done: {len(props)} props → {os.path.abspath(args.out)}")


if __name__ == "__main__":
    main()
