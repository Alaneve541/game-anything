# 发布自动化（Publishing Automation）

目标：把"发版清单"变成**可重复执行的命令**。凡是平台有 CLI/API 的，用脚本跑；只有登录、2FA、审核这类必须人做的，才留人工步骤，并把它压缩成一条待办。

总入口：`scripts/publish.mjs`（默认 dry-run 打印计划，`--apply` 才执行）。

```bash
node scripts/publish.mjs --target itch --build build/win --user alane --game mygame --apply
node scripts/publish.mjs --target steam --script steam/app_build.vdf --apply
node scripts/publish.mjs --target web --dir dist --out release/mygame-web.zip
node scripts/publish.mjs --target wechat --project minigame/ --apply
```

## 覆盖矩阵

| 平台 | 自动化程度 | 工具 | 需要人工的环节 |
|---|---|---|---|
| itch.io | **全自动** | `butler`（官方 CLI） | 首次登录生成 API key |
| Steam（SteamPipe） | **全自动** | `steamcmd` + app/depot VDF | 首次登录 + Steam Guard；商店页审核 |
| Web 静态托管 | **全自动** | `wrangler pages` / `netlify deploy` / GitHub Pages Action | 首次授权 |
| 微信小游戏 | **半自动** | 微信开发者工具 CLI 或 `miniprogram-ci` | 扫码/登录、后台提审 |
| 抖音/字节小游戏 | 半自动 | 抖音开发者工具 CLI | 登录、提审 |
| Google Play | **半自动**（可 CI） | `fastlane supply` / Gradle `bundleRelease` | 首次创建应用、服务账号授权 |
| App Store | 半自动 | `xcodebuild archive` + `altool`/`notarytool` | 证书、App Store Connect 审核 |
| Roblox | 半自动 | Rojo + Open Cloud API | 创作者凭据 |
| 主机（PS/Xbox/Switch） | 不可自动化 | 厂商 SDK | 资质、审核、NDA |

"不可自动化"仅限**审核与资质**；构建、上传、版本递增、回滚全部可脚本化。

## 1) itch.io：butler（最省事，强烈推荐）

```bash
# 安装（Windows 便携版）
curl -L -o butler.zip https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default
unzip butler.zip -d butler && ./butler/butler.exe -V

# 上传（channel 会出现在页面上，例如 windows / linux / html5）
butler login                      # 交互一次，token 存本机
butler push build/win alane/mygame:windows --userversion 0.3.1
butler status alane/mygame        # 校验：列出所有 channel 的构建与版本
```

CI 中用 `BUTLER_API_KEY` 环境变量，`butler login` 可跳过。`--userversion` 用 git 短 hash 或 `package.json` 版本，保证可追溯。

## 2) Steam：steamcmd + SteamPipe

目录约定：

```
steam/
  app_build_1234560.vdf
  depot_build_1234561.vdf
  content/            # 要上传的文件树
```

`depot_build_<depotid>.vdf`：

```vdf
"DepotBuildConfig"
{
  "DepotID" "1234561"
  "ContentRoot" "D:\\build\\steam\\content"
  "FileMapping"
  {
    "LocalPath" "*"
    "DepotPath" "."
    "recursive" "1"
  }
  "FileExclusion" "*.pdb"
  "FileExclusion" "*.log"
}
```

`app_build_<appid>.vdf`：

```vdf
"AppBuild"
{
  "AppID" "1234560"
  "Desc" "CI build"
  "BuildOutput" "D:\\build\\steam\\output"
  "ContentRoot" "D:\\build\\steam\\content"
  "Depots" { "1234561" "depot_build_1234561.vdf" }
}
```

```bash
steamcmd +login "$STEAM_USER" +run_app_build "D:/build/steam/app_build_1234560.vdf" +quit
```

- 成功判定：日志出现 `Successfully finished AppID 1234560`，否则 grep `FAILED`。
- 首次登录需要 Steam Guard 验证码（人工一次，凭据缓存到 `steamcmd` 目录）。
- 不要提交 VDF 里的密码；用环境变量注入或 `+login` 从 stdin 读。
- 商店页文案/截图/价格走 Steamworks 后台，可用 Steamworks Web API 部分更新，但发布仍需点"发布"。

## 3) Web：静态包 + 托管

```bash
# 打包（带版本号，便于回滚）
node scripts/publish.mjs --target web --dir dist --out release/mygame-0.3.1.zip

# 托管三选一
npx wrangler pages deploy dist --project-name mygame     # Cloudflare Pages
npx netlify deploy --prod --dir dist                     # Netlify
git push origin main                                      # GitHub Pages（Action 自动构建）
```

验证：上传后 `curl -sI https://<域名>/ | head -1` 必须是 200，且首页引用的 JS/资源返回 200。

## 4) 微信小游戏 / 抖音小游戏

微信开发者工具 CLI（Windows）：

```bash
"C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat" \
  --project "D:/proj/minigame" --upload --version 0.3.1 --desc "ci build"
```

或 `miniprogram-ci`（Node，适合 CI，需要上传密钥）：

```js
const ci = require("miniprogram-ci");
const project = new ci.Project({
  appid: process.env.MP_APPID, type: "miniGame",
  projectPath: "minigame/", privateKeyPath: process.env.MP_KEY, ignores: ["node_modules/**"],
});
await ci.upload({ project, version: "0.3.1", desc: "ci", setting: { es6: true } });
```

- 上传成功后仍需在后台提交审核（人工/有限 API）。
- 包体限制严格（主包 4MB 级别），CI 里加体积断言：解压后 > 阈值就失败。
- 抖音：`tt` 开发者工具 CLI 类似，具体参数以安装目录 `cli --help` 为准。

## 5) Android / iOS

```bash
# Android
cd android && ./gradlew bundleRelease          # 产出 AAB
fastlane supply --aab app/build/outputs/bundle/release/app-release.aab \
  --json_key "$PLAY_JSON_KEY" --track internal

# iOS
xcodebuild -project MyGame.xcodeproj -scheme MyGame -configuration Release \
  -archivePath build/MyGame.xcarchive archive
xcrun altool --upload-app -f build/MyGame.ipa -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
```

- Google Play 首次需要手工创建应用 + 服务账号；之后 `fastlane supply` 全自动。
- iOS 证书用 `fastlane match` 或 CI 托管；`altool` 上传后到 App Store Connect 提审。

## 6) 版本与回滚

每次发布必须能回答：**这是什么版本、从哪个 commit 构建、怎么回滚**。

```bash
VERSION="$(git describe --tags --always)"
# itch: --userversion "$VERSION"；Steam: "Desc" 里写 commit；Web: zip 名带版本
```

回滚：
- itch：`butler push` 上一个构建到同一个 channel（保留历史构建）。
- Steam：后台把旧 build 设为 default branch。
- Web：Cloudflare/Netlify 一键回滚到上一个 deploy。
- 小游戏：后台回退版本（有审核延迟）。

## 7) 安全

- 密钥只走环境变量 / CI secrets，禁止写进仓库或 VDF。
- `publish.mjs` 在执行前打印将要运行的命令（dry-run），人工确认后再 `--apply`。
- 上传日志可能含 token，输出前过滤 `token|password|api_key`。

## 验证清单

- [ ] 构建产物存在且能启动（本地先跑一遍）
- [ ] 版本号与 commit 对应
- [ ] 上传命令退出码 0，日志无 FAILED
- [ ] 平台侧可见新版本（`butler status` / Steam 后台 / 页面 URL）
- [ ] 下载/访问回验（200、可启动）
- [ ] 回滚路径已知
