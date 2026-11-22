# 架构：一套玩法，多个引擎

## 1. 分层

```text
core/            纯逻辑，无引擎 import
  sim.ts         固定步长推进、状态机、规则
  entities.ts    玩家/敌人/子弹数据
  spawn.ts       波次与难度曲线
  rng.ts         种子随机
  save.ts        存档序列化（纯数据）
adapter/         引擎相关，尽量薄
  render.*       把 core 状态画出来
  input.*        键盘/触屏/手柄 → 意图
  audio.*        事件 → 音效
  platform.*     存档 IO、窗口、暂停、生命周期
data/            JSON 调参表
content/         贴图、音频、关卡
```

依赖方向只能是 `adapter → core`，`core` 不反向依赖。这样 core 能在 Node 里跑测试、能移植、能做确定性回放。

## 2. 固定步长

渲染帧率不可信，规则必须用固定步长：

```ts
const STEP = 1 / 60;
let acc = 0, last = now();
function frame(t) {
  let dt = Math.min((t - last) / 1000, 0.25); // 防止切后台后爆炸
  last = t;
  acc += dt;
  while (acc >= STEP) { sim.step(STEP); acc -= STEP; }
  render(sim.state, acc / STEP); // 可选插值
  requestAnimationFrame(frame);
}
```

规则：

- 只用 `STEP` 推进物理与计时，不用帧间隔。
- 输入在帧边界采样，记录 `pressed`（本步按下）与 `held`（持续按住）。
- 切后台、断点、加载时清空累加器，避免「时间债」。
- 确定性要求高时，随机数全部来自种子 RNG，遍历顺序固定。

## 3. 状态机

游戏流程用显式状态，不要靠散落的布尔：

```text
BOOT → TITLE → PLAYING ⇄ PAUSED
                  ↓
              GAME_OVER → TITLE / PLAYING
```

每个状态定义：进入时做什么、每步更新什么、退出时清理什么、允许哪些转移。UI 只读状态，不发散地改状态。

## 4. 实体与数据

小项目用「对象数组 + 类型标签」就够，不必上完整 ECS：

```ts
type Entity = {
  id: number; kind: "player" | "enemy" | "bullet" | "pickup";
  x: number; y: number; vx: number; vy: number;
  hp: number; r: number; ttl?: number;
};
```

需要扩展时再按系统拆分（移动、碰撞、生命周期、渲染）。ECS 的收益在大量同类实体与组合行为；几十个实体时是过度设计。

## 5. 输入抽象

core 只接受「意图」，不读键盘：

```ts
type Intent = { moveX: number; moveY: number; fire: boolean; dash: boolean; pause: boolean };
```

适配层负责：键位映射、触屏虚拟摇杆、手柄死区、输入缓冲（120ms 内提前按键仍生效）、coyote time（离开平台后短时间仍可跳）。这些手感参数放 `data/`，方便调。

## 6. 存档

只用纯数据，带版本号与迁移：

```json
{ "version": 2, "best": 1200, "unlocks": ["dash"], "settings": { "volume": 0.8 } }
```

- 写入用「临时文件 + 原子替换」，避免断电损坏。
- 读取失败要回退默认值，不让坏存档卡死启动。
- 不序列化引擎对象、函数、场景引用。
- Web 用 `localStorage`，桌面用用户目录，主机用平台存档 API。

## 7. 确定性测试

core 可无渲染运行，才有便宜可靠的测试：

```ts
const a = new Sim(seed);
for (let i = 0; i < 600; i++) a.step(1 / 60, scriptedIntent(i));
const b = new Sim(seed);
for (let i = 0; i < 600; i++) b.step(1 / 60, scriptedIntent(i));
assert(hash(a.state) === hash(b.state));
```

测试金字塔：

- 单元：伤害公式、波次生成、碰撞边界。
- 回放：固定输入 60 秒，状态哈希稳定。
- 冒烟：启动、暂停、重开、存档往返。
- 画面：截图对比或像素采样（只做粗检，避免脆弱）。

## 8. 数据驱动

数值、波次、掉落、文案放 `data/*.json`，代码只解释数据：

```json
{
  "player": { "speed": 260, "hp": 3, "fireCooldown": 0.18 },
  "waves": [
    { "t": 0, "enemies": [["grunt", 3]] },
    { "t": 20, "enemies": [["grunt", 5], ["fast", 2]] }
  ]
}
```

好处：调平衡不用改代码；可以做难度表、A/B、关卡编辑器导出。

## 9. 移植清单

换引擎时保留 core，重写 adapter：

- [ ] core 无引擎类型、无全局单例、无 DOM/窗口调用
- [ ] 时间来自参数，不读系统时钟
- [ ] 随机来自注入的 RNG
- [ ] 资源通过 id 引用，不硬编码路径
- [ ] 存档是纯 JSON
- [ ] 输入是 Intent
- [ ] 渲染只读状态，不改状态

## 10. 何时不要抽象

- 一次性 Game Jam 原型：直接写，别分层。
- 引擎强绑定功能（UE GAS、Unity DOTS、Roblox 物理）：跟随引擎惯例。
- 只有 200 行、不会移植的小游戏：单文件更省事。

抽象是为了「改得快、测得动、能移植」，不是为了好看。出现第二个引擎需求时再抽。
