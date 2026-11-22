# 平台目标与发布

先定平台再定引擎，平台限制会直接砍掉技术选项。

## 1. 平台速查

| 平台 | 引擎可行度 | 主要限制 |
|---|---|---|
| Windows 桌面 | 全引擎 | 运行库、签名、安装包 |
| macOS | Unity/Godot/UE | 公证、arm64、Metal |
| Linux | Unity/Godot/UE/Bevy | 发行版差异、Steam Runtime |
| Web | Phaser/Three/Godot Web/Unity WebGL | 包体、内存、音频手势、跨域 |
| Android | Unity/Godot/Cocos/UE | SDK/NDK、签名、权限、机型碎片 |
| iOS | Unity/Godot/UE | Xcode、签名、审核、Metal |
| 微信小游戏 | Cocos/Laya/Unity 适配 | 4MB 主包、API 子集、无 DOM |
| 抖音小游戏 | 同上 | 类似限制，需各自适配层 |
| Steam | Unity/Godot/UE/自研 | Steamworks、成就、云存档 |
| 主机 | Unity/UE（需资质） | 开发者账号、SDK 保密、认证 |
| Roblox | Roblox Studio + Rojo | 平台规则、分成、性能沙箱 |
| Minecraft | 数据包/模组 | Java 版与基岩版差异大 |

## 2. Windows

- 打包成目录或单文件安装器（Inno Setup、NSIS、MSIX）。
- 依赖 VC++ 运行库时随包安装或静态链接。
- 代码签名减少 SmartScreen 警告；无证书时说明「未知发布者」。
- 存档放 `%APPDATA%\<Studio>\<Game>\`，不要放安装目录（可能只读）。
- 验证：复制到另一台/干净用户目录启动。

## 3. macOS

- Apple Silicon 与 Intel：优先 arm64，或 universal。
- 分发需 Developer ID 签名 + notarization，否则 Gatekeeper 拦截。
- 用 `codesign`、`notarytool`、`stapler`；Godot/Unity 有导出选项。
- 沙盒（App Store）限制文件访问与网络。

## 4. Linux

- 提供 AppImage 或 tar.gz；或走 Steam Runtime。
- 依赖 glibc 版本、显卡驱动（Mesa/NVIDIA）。
- Unity/UE 的 Linux 导出需对应模块；Godot 原生支持。

## 5. Web

- 静态托管即可；itch.io 上传 zip（`index.html` 在根）。
- 包体控制：首屏 < 5MB，总包 < 50MB 较稳；大资源按需加载。
- 音频需手势解锁；移动端禁用双击缩放与滚动。
- 跨域隔离（COOP/COEP）只在多线程 wasm 时需要。
- PWA：manifest + service worker，注意缓存更新策略。

## 6. Android

```bash
# Unity
Unity.exe -batchmode -projectPath . -executeMethod BuildScript.BuildAndroid -quit
# Godot
godot --headless --path . --export-release "Android" build/game.apk
```

- 需要 Android SDK/NDK、JDK；签名 keystore 妥善保存。
- 权限最小化；`targetSdkVersion` 跟随商店要求。
- 机型碎片：低端机降分辨率/关后处理；测试至少一台低端机。
- 发布：Google Play（AAB）、国内各商店（APK + 资质）。

## 7. iOS

- 需要 Mac + Xcode；Unity/UE 导出 Xcode 工程，Godot 导出 iOS 工程。
- 签名证书与 Provisioning Profile；TestFlight 内测。
- 审核关注：隐私清单、ATT、内购规则、崩溃率。

## 8. 微信 / 抖音小游戏

- 不是普通 Web 包：需引擎的小游戏平台适配层（Cocos Creator 原生支持，Unity 需转换工具）。
- 主包限制严格（微信约 4MB，分包可达 20MB+），资源走 CDN + 分包。
- 无 DOM/BOM 全量 API，音频/网络/存储用平台 API。
- 审核需要资质、类目、内容合规。
- 验证：开发者工具真机预览，不只看浏览器。

## 9. Steam

- 接入 Steamworks SDK：成就、云存档、排行榜、 workshop。
- 商店页需要 capsule 图、截图、预告片、文案；审核周期留足。
- 构建用 SteamPipe 上传 depot；分支管理测试版。
- 离线模式与云存档冲突要处理。

## 10. 主机

- 需要平台方开发者资质与保密 SDK，通常不能公开讨论细节。
- 认证项多（TRC/TCR/Lotcheck），手柄、挂起恢复、用户切换、网络断开都要测。
- 预留 1–3 个月认证周期。

## 11. Roblox / Minecraft

**Roblox**：

- 用 Roblox Studio 或 Rojo（`default.project.json` + `src/`）做文本化开发。
- Luau 脚本，`ReplicatedStorage`/`ServerScriptService` 分离客户端与服务端。
- 发布走平台审核；变现用 Robux，分成按平台规则。
- 性能沙箱严格：限制部件数、网络调用、每帧工作量。

**Minecraft**：

- Java 版数据包（`data/<ns>/function/*.mcfunction`）与资源包可文本生成。
- 模组需 Forge/Fabric/NeoForge，版本绑定强。
- 基岩版行为包/资源包格式不同，不能混用。

## 12. 发布清单

- [ ] 版本号与构建号
- [ ] 图标、启动图、商店素材
- [ ] 崩溃与日志收集（可选）
- [ ] 首次启动引导、设置、暂停、退出
- [ ] 存档路径与迁移
- [ ] 许可证与 `CREDITS.md`
- [ ] 目标平台真机验证
- [ ] 回滚方案（旧版本包保留）
