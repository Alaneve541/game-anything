# 素材与音频

原则：**先占位，后替换**。灰盒阶段只要求能区分角色、地形、危险物；美术与音频在核心循环成立后再投入。

## 1. 占位美术

| 需求 | 做法 |
|---|---|
| 角色/敌人 | 纯色矩形或圆，不同颜色区分类型 |
| 地形 | 两种灰度的方块 |
| 危险 | 红/橙，加闪烁或描边 |
| 可拾取 | 小圆 + 呼吸缩放 |
| UI | 系统字体，白字深底 |
| 粒子 | 同色小方块，生命周期 0.3–0.6 秒 |

程序化生成（运行时画）比找素材快，也能直接进版本控制。需要真图时用 SVG 生成再导 PNG，或 AI 生图后统一尺寸与风格。

## 2. 素材来源与授权

- 自绘、程序化、AI 生成：确认工具条款允许商用。
- CC0（Kenney、OpenGameArt 的 CC0 区、Poly Haven）：最省心，仍保留来源记录。
- CC-BY：必须署名，写进 `CREDITS.md`。
- 商用素材包：保留购买凭证与授权范围（是否可 redistribuite）。
- 字体：确认嵌入与商用许可；中文优先思源黑体/霞鹜文楷等开源字体。

交付时附 `CREDITS.md`，列出名称、作者、链接、许可证。

## 3. 图片导入设置

| 类型 | 设置 |
|---|---|
| 像素风精灵 | Point 过滤、无压缩或无损、尺寸为 2 的幂或图集打包 |
| 高清 2D | Bilinear、压缩、按屏幕尺寸生成 mipmap |
| UI | 九宫格切片，避免拉伸变形 |
| 3D 贴图 | sRGB 颜色贴图、线性法线/粗糙度、合适 mipmap |
| 图集 | 同类小图合并，减少 draw call |

引擎差异：Unity 在 `.meta` 中设 `filterMode`/`compression`；Godot 靠 `.import`；UE 在 Texture 资产里设；Web 用 CSS `image-rendering: pixelated`。

## 4. 音频

三类用途不同：

| 类型 | 时长 | 格式 | 注意 |
|---|---|---|---|
| 音效 SFX | 0.05–2 s | OGG/WAV | 多实例、随机音高、避免削波 |
| 背景音乐 BGM | 30 s–3 min | OGG/MP3 | 循环点、淡入淡出 |
| 环境音 | 10 s–循环 | OGG | 音量低，可分层 |

基础混音：BGM -12 dB 左右，SFX -6 dB 左右，总输出留 headroom，避免多个音效叠加爆音。用压缩器/限幅器兜底。

### 用 DSH AI 音频生成

本机有 `dsh-audiogen` 插件（需先在「设置 → 插件 → AI 音频」配置渠道与密钥）。先查库复用：

```text
search_audio_library(keyword="jump", type="sfx")
```

没有再生成：

```text
generate_audio(mode="sfx", prompt="8-bit retro jump sound, short, bright", duration=0.4)
generate_audio(mode="music", prompt="calm chiptune loop, 90 bpm, seamless", is_instrumental=true)
generate_audio(mode="tts", prompt="Welcome to the arena.", voice="<voice_id>")
```

返回同源 URL，下载到 `content/audio/` 再交给引擎导入。生成的是占位或正式素材均可，别在未确认许可证的情况下分发。

### 程序化音效（零素材）

Web 可用 WebAudio 直接合成：

```js
function blip(freq = 440, dur = 0.08, type = "square") {
  const t = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t); o.stop(t + dur);
}
```

Godot 可用 `AudioStreamGenerator`，Unity 可生成 `AudioClip`。适合 Jam 与原型。

## 5. 3D 资产

- 格式首选 glTF/GLB（Unity 需导入器，UE 用 Datasmith/Interchange，Godot 原生支持）。
- 面数与贴图尺寸按目标平台定；移动端单模型几千面、贴图 1024 以内。
- 动画：骨骼动画导出 glTF；简单位移/旋转用代码。
- 碰撞体单独简化，别直接用渲染网格。
- 材质数量控制，合批优先；避免每帧改材质实例。

## 6. 字体与本地化

- 中文用开源字体子集化，减小包体。
- 文本外置为 JSON/CSV，键值对；不要硬编码在场景里。
- 预留 30% 文本膨胀空间（英文→德文/俄文）。
- 数字与日期用本地化格式。

## 7. 目录约定

```text
content/
  sprites/     角色、道具、UI
  tiles/       地形
  audio/sfx/   音效
  audio/bgm/   音乐
  fonts/
  data/        关卡、数值、文案
CREDITS.md
```

命名用 `snake_case` 加用途前缀（`enemy_grunt_idle.png`），避免空格与中文文件名（跨平台工具链常出错）。

## 8. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 像素图糊 | 过滤模式是 Bilinear | 改 Point/Nearest |
| 音效爆音 | 多实例叠加/增益过高 | 限幅 + 降增益 + 限制并发 |
| 音乐循环有缝 | 编码器填充 | 用 OGG 精确循环，或交叉淡化 |
| 字体缺字 | 子集化漏字 | 全字符集或按语言分包 |
| 贴图发灰 | sRGB 设置错 | 颜色贴图开 sRGB，数据贴图关 |
| 包体过大 | 未压缩音频/超大贴图 | 转 OGG、降分辨率、按需加载 |
