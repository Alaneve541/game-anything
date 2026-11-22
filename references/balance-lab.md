# 数值与平衡实验室（Balance Lab）

手感与数值不必"靠人反复试"。只要核心逻辑是固定步长 + 种子随机 + 无渲染可跑，就能**批量模拟对局、量化难度曲线、自动扫参**。这一页给出可复现的流程和工具。

工具：`scripts/balance-sweep.mjs`（无头浏览器批量跑 seed，产出 CSV 与统计）。

## 1) 先让核心可批量跑

满足三个条件：

1. **固定步长**：`step(dt)` 只接受固定 `dt=1/60`，与真实帧率解耦。
2. **种子随机**：所有随机来自 `mulberry32(seed)` 之类的纯函数，同一个 seed 结果完全一致。
3. **无渲染可跑**：`step()` 不依赖 canvas/DOM；渲染层只读状态。

浏览器里暴露探针（本仓库 [web-canvas 模板](../templates/web-canvas/index.html) 已实现）：

```js
window.__game = {
  ready: true,
  state(),            // { t, score, hp, mode, seed, orbs, hunters, player:{x,y} }
  reset(seed),        // 重置到给定种子
  simulate(seconds),  // 无渲染推进 N 秒（固定步长循环）
};
```

有了这三个，批量就是循环。

## 2) 跑一批基线

```bash
# 起本地服务
node scripts/serve.mjs --root . --port 8123

# 20 个种子，每个模拟 60 秒
node scripts/balance-sweep.mjs --url http://127.0.0.1:8123 \
  --seeds 1-20 --seconds 60 --out balance/baseline.csv
```

输出（示例字段）：

```
seed,score,hp,mode,survived_s,orbs,hunters,player_x,player_y
1,0,0,over,60,12,3,480,270
...
summary: n=20 win=0% mean_score=0 p50=0 p90=0 mean_survival=60
```

`--seeds 1-20` 支持区间与逗号列表（`1-5,10,20-25`）；`--seconds 60` 是每局模拟时长；`--json` 输出机器可读汇总。

## 3) 指标怎么读

| 指标 | 含义 | 危险信号 |
|---|---|---|
| 胜率 / 存活率 | 玩家能赢的比例 | 0%（太难）或 100%（无挑战） |
| 平均存活时间 | 一局多久结束 | 远小于目标单局时长（挫败）或打满（拖沓） |
| 分数分布 p50/p90 | 技术水平差异 | p90 远高于 p50（运气主导） |
| 死亡原因分布 | 哪种敌人/陷阱致命 | 单一来源 >70%（设计单调） |
| 单位时间收益 | 成长速度 | 前期太慢（无聊）或后期爆炸（失控） |

经验区间（休闲动作）：目标单局 60–180 秒；胜率 30–70%；p90/p50 分数比 < 3。

## 4) 参数扫描（把数值当变量）

把可调参数集中到 `data/balance.json`，模板通过 URL 查询串覆盖：

```js
const params = Object.fromEntries(new URLSearchParams(location.search));
const BAL = { ...DEFAULT, ...pickNumbers(params) };  // 例：?orb=12&hunter=0.9
```

然后批量扫：

```bash
for orb in 8 12 16; do
  node scripts/balance-sweep.mjs --url "http://127.0.0.1:8123/?orb=$orb" \
    --seeds 1-30 --seconds 90 --out "balance/orb-$orb.csv"
done
```

汇总比较后挑 Pareto 最优（胜率与单局时长同时可接受），再固定下来写回 `data/balance.json`。

没有浏览器探针时，也可以直接跑核心模块（更快，推荐）：

```bash
node scripts/balance-sweep.mjs --core dist/core.mjs --seeds 1-1000 --seconds 120
```

`--core` 模式用 `import()` 动态加载，要求导出 `createGame(seed)`、`step(state, dt)`，无 DOM 依赖。

## 5) 机器人策略（测"上限"而不只是"随机"）

- **随机输入**：测最低水平与崩溃边界（是否卡死、NaN、穿墙）。
- **贪心策略**：朝最近目标移动、躲最近威胁——近似新手。
- **脚本策略**：录制玩家输入回放（确定性回放同时用于回归测试）。

同一批种子跑三种策略，得到「难度带」：随机 < 新手 < 熟练。若新手上限 < 目标胜率，说明太难。

## 6) 手感不是玄学，也是可测的

| 项目 | 测法 |
|---|---|
| 输入延迟 | 固定步长下注入按键，测量状态开始变化的帧数 |
| 跳跃宽容 | 扫描起跳窗口（coyote time 帧数），输出可跳过的空隙比例 |
| 无敌帧 | 连续碰撞下 hp 变化次数与间隔 |
| 屏幕震动/停顿 | 不在数值层测，交给人工看截图/录像 |
| 难度曲线 | 每 15 秒统计敌人数/伤害频率，画成表 |

## 7) 回归与防过拟合

- 固定一组"回归种子"（如 1–20），每次改动后必须不倒退（胜率变化 ±10% 内）。
- 扫参用种子 100–200，验证用 1–20，避免对参数过拟合。
- 每次数值改动提交 `balance/*.csv` 与一行结论（"orb 12: 胜率 55%，单局 92s"）。

## 8) 失败排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 所有 seed 状态完全一样 | 随机没接种子 | 检查 `Math.random` 是否仍被调用 |
| `simulate` 后 t 不变 | 循环被 `mode!=="playing"` 提前 return | 在 over 时仍允许推进或先 reset |
| 结果每次不同 | 用了真实时间/帧率 | 固定 dt，去掉 `performance.now()` 依赖 |
| 浏览器卡死 | 单次 simulate 秒数过大 | 分块推进（每块 ≤10s）或降低种子数 |
| NaN 分数 | 除零/未初始化 | 在 `step` 入口断言数值有限 |
