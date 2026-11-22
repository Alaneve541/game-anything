# gen_content.gd — Godot 4 tool script：程序化网格 + 生成场景，全部走引擎 API
#
# 调用：
#   godot --headless --path "D:/proj/MyGame" --script res://tools/gen_content.gd
#
# 验证：退出码 0，输出 [GenContent] ok；generated/tri.tres 与 scenes/arena.tscn 存在。
# 说明：.tscn/.tres 是文本，但这里仍通过 ResourceSaver 生成，避免手拼格式错误。

extends SceneTree


func _init() -> void:
	var mesh := _make_tri_mesh()
	DirAccess.make_dir_recursive_absolute("res://generated")
	DirAccess.make_dir_recursive_absolute("res://scenes")
	var err := ResourceSaver.save(mesh, "res://generated/tri.tres")
	if err != OK:
		push_error("[GenContent] save mesh failed: %d" % err)
		quit(1)
		return

	var root := Node3D.new()
	root.name = "Arena"
	for i in range(8):
		var body := MeshInstance3D.new()
		body.name = "Prop_%d" % i
		body.mesh = mesh
		body.position = Vector3(i * 2.0, 0.0, 0.0)
		root.add_child(body)

	var packed := PackedScene.new()
	var pack_err := packed.pack(root)
	if pack_err != OK:
		push_error("[GenContent] pack failed: %d" % pack_err)
		quit(1)
		return
	var save_err := ResourceSaver.save(packed, "res://scenes/arena.tscn")
	if save_err != OK:
		push_error("[GenContent] save scene failed: %d" % save_err)
		quit(1)
		return
	print("[GenContent] ok")
	quit(0)


func _make_tri_mesh() -> ArrayMesh:
	var mesh := ArrayMesh.new()
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array([
		Vector3(0, 0, 0), Vector3(1, 0, 0), Vector3(0, 1, 0)
	])
	arrays[Mesh.ARRAY_NORMAL] = PackedVector3Array([
		Vector3(0, 0, 1), Vector3(0, 0, 1), Vector3(0, 0, 1)
	])
	arrays[Mesh.ARRAY_TEX_UV] = PackedVector2Array([
		Vector2(0, 0), Vector2(1, 0), Vector2(0, 1)
	])
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh
