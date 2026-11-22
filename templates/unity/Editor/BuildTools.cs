// BuildTools.cs — Unity Editor 批量生成资产与场景
//
// 放置：Assets/Editor/BuildTools.cs
// 调用：
//   "C:/Program Files/Unity/Hub/Editor/<ver>/Editor/Unity.exe" -batchmode -quit \
//     -projectPath "D:/proj/MyGame" -executeMethod BuildTools.GenContent \
//     -logFile "D:/proj/Logs/gen.log"
//
// 验证：退出码 0，日志含 [GenContent] ok，Assets/Generated/* 与 Assets/Scenes/Arena.unity 存在。
// 说明：.unity/.prefab 由 Unity API 保存（GUID 由 Unity 分配），不手写二进制/文本资产。

using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class BuildTools
{
    private const string GenDir = "Assets/Generated";

    [MenuItem("Tools/GameAnything/Generate Content")]
    public static void GenContent()
    {
        Directory.CreateDirectory(GenDir);

        // 1) 程序化网格 → .asset
        var mesh = new Mesh { name = "Tri" };
        mesh.vertices = new[] { Vector3.zero, Vector3.right, Vector3.forward };
        mesh.triangles = new[] { 0, 1, 2 };
        mesh.RecalculateNormals();
        AssetDatabase.CreateAsset(mesh, $"{GenDir}/Tri.asset");

        // 2) 生成预制体（立方体道具）
        var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
        go.name = "Crate";
        PrefabUtility.SaveAsPrefabAsset(go, $"{GenDir}/Crate.prefab");
        Object.DestroyImmediate(go);

        // 3) 导入外部模型（如果存在）：复制到 Assets 后设置导入参数
        var src = System.Environment.GetEnvironmentVariable("GEN_MODELS_DIR");
        if (!string.IsNullOrEmpty(src) && Directory.Exists(src))
        {
            foreach (var f in Directory.GetFiles(src, "*.fbx"))
            {
                var dst = $"{GenDir}/{Path.GetFileName(f)}";
                File.Copy(f, dst, true);
                AssetDatabase.ImportAsset(dst);
                if (AssetImporter.GetAtPath(dst) is ModelImporter importer)
                {
                    importer.globalScale = 1.0f;
                    importer.importAnimation = false;
                    importer.SaveAndReimport();
                }
            }
        }

        // 4) 生成并保存场景
        var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var prefab = AssetDatabase.LoadAssetAtPath<GameObject>($"{GenDir}/Crate.prefab");
        for (int i = 0; i < 8; i++)
        {
            var inst = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            inst.transform.position = new Vector3(i * 2f, 0f, 0f);
        }
        Directory.CreateDirectory("Assets/Scenes");
        EditorSceneManager.SaveScene(scene, "Assets/Scenes/Arena.unity");

        AssetDatabase.SaveAssets();
        AssetDatabase.Refresh();
        Debug.Log("[GenContent] ok");
    }
}
