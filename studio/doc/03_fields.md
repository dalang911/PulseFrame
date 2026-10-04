# 03 · 数据字段、边界与单位

绑定里的 `field`（以及 `min`/`max` 的字符串引用）都由 `bindingEngine.fieldValue()` 解析。
它按下面的顺序取一个数值：

1. **合成/派生字段**（固定名字，直接现算）：见"派生量"表
2. **当前帧轨迹点字段**（`frameData`，即本秒的 trkpt）：见"实时字段"表
3. **chartData 里的键**（全量极值/基准，多用作 `min`/`max` 边界）：见"极值/边界"表
4. 都没有 → 返回 `0`

> `min`/`max` 规则：**数字**直接当边界；**字符串**则再走一遍 `fieldValue` 当字段引用。
> 所以 `"max": "heartRateMax"` 会把仪表满量程拉到"本次活动的心率峰值"，而不是写死 200。

---

## 实时字段（当前帧 trkpt，`group: value`）

| `field` key | 含义 | 单位 | 有 unitKey |
|---|---|---|---|
| `distance` | 累计距离 | m | ✅ `distance` |
| `speed` | 速度 | km/h | ✅ `speed` |
| `heart_rate` | 心率 | bpm | ✅ `heart_rate` |
| `cadence` | 步频/踏频 | steps/min | ✅ `cadence` |
| `power` | 功率 | watt | ✅ `power` |
| `step_length` | 步幅 | m | ✅ `step_length` |
| `altitude` | 海拔 | m | ✅ `altitude` |
| `slope` | 坡度 | % | — |
| `sec` | 已用时长 | s | — |
| `Gain` | 累计爬升 | m | — |
| `Loss` | 累计下降 | m | — |
| `azimuth` | 方位角 | ° | — |

> `frameData` 实际还含 `timestamp`、`position_lat`、`position_long`、`is_pause` 等，任何存在于当前帧的键都能用 `field` 直接取到（走通用回退分支）。但面板下拉只列出上表这些"可绑定的数值字段"。

---

## 派生量（引擎现算，`group: derived`）

| `field` key | 含义 | 计算 |
|---|---|---|
| `pct` | 时间线进度 0..1 | = 当前帧索引 / (总帧数-1) |
| `km` | 公里 | distance / 1000 |
| `pace` | 配速 | 由 speed 换算 min/km |
| `totalDistance` | 总距离 | 末点 distance |
| `totalKm` | 总公里 | 末点 distance / 1000 |
| `duration` | 总时长 | 末点 sec |
| `elapsedMin` | 已用分钟 | sec / 60 |
| `avgSpeed` | 平均速度 km/h | distance*3.6/sec |
| `avgPace` | 平均配速 | 由 avgSpeed 换算 |
| `remainDistance` | 剩余距离 | 末点 distance − 当前 distance |
| `remainKm` | 剩余公里 | remainDistance / 1000 |
| `relAltitude` | 相对海拔 | altitude − baseAltitude |
| `hrPct` | 心率占上限 0..1 | heart_rate / user_heartRateMax |
| `elapsedTime` | 已用时（文本） | 格式化 h:mm:ss / m:ss |
| `totalTime` | 总时长（文本） | 末点 sec 格式化 |
| `remainTime` | 预计剩余（文本） | 按当前均速推算 |
| `paceBoundMin` | 最慢配速 min/km | 60 / 速度极小… 见下 |
| `paceBoundMax` | 最快配速 min/km | 60 / 速度极大… 见下 |

> **时间文本**（`elapsedTime`/`totalTime`/`remainTime`）返回字符串，只适合 `text` 模式，别拿去 `size`/`angle` 归一。
> **`pace` 与 `paceBound*`**：`paceMin`/`paceMax` 是**速度**极值(km/h)；配速与其互为倒数。`paceBoundMin`=最慢配速，`paceBoundMax`=最快配速。给配速仪表选边界时，用 `paceBoundMin`/`paceBoundMax`，不要用 `paceMin`/`paceMax`。

---

## 极值 / 边界（chartData，`group: extreme`，常作 min/max）

| key | 含义 |
|---|---|
| `heartRateMin` / `heartRateMax` | 本次活动心率最低 / 最高 |
| `user_heartRateMax` | 用户心率上限（取整，常作心率 `max`） |
| `cadenceMin` / `cadenceMax` | 步频最低 / 最高 |
| `paceMin` / `paceMax` | **速度**最低 / 最高（km/h） |
| `paceBoundMin` / `paceBoundMax` | **配速**最慢 / 最快（min/km，由速度取倒数） |
| `eleMin` / `eleMax` | 海拔最低 / 最高 |
| `baseAltitude` | 基准海拔（算 `relAltitude`） |
| `powerMin` / `powerMax` | 功率最低 / 最高 |

> 这些键来自真实活动的 `chartData`，运行时由数据管道注入；Studio 预览用的是内置演示数据里同名键（如 `heartRateMax`、`user_heartRateMax:170`、`paceMin:10.34`、`paceMax:11.27`、`eleMax:24.6` 等）。
> `chartData` 还含点集数组（`heart_points`、`paces_points`、`ele_points`、`mapPoints` 等），供图表类组件消费；一般组件不需要直接绑它们。

---

## 单位系统（text 模式的 `unit:true`）

`text` 绑定勾选 `unit`（`"unit": true`）时，用 `unitConfig.format(unitKey || field, 值)` 拼接前后缀，**自动补空格**。
默认单位表（`UNIT_DEFS`）：

| `unitKey` | 默认前缀 | 默认后缀 |
|---|---|---|
| `heart_rate` | — | `bpm` |
| `pace` | — | `min/km` |
| `speed` | — | `km/h` |
| `cadence` | — | `steps/min` |
| `rpm` | — | `Rpm` |
| `power` | — | `watt` |
| `step_length` | — | `m` |
| `altitude` | — | `m` |
| `distance` | — | `Km` |

要点：
- 用户可在浏览器里改这些前后缀（存 `localStorage` 键 `newsports_unit_config`），所以**同一份 JSON 在不同用户处显示的单位文本可能不同**——这是预期行为。
- `unitKey` 可与 `field` 不同：例如 `field:"distance"`(m) 但想按公里单位表格式化，可显式 `"unitKey": "distance"`。
- 想要**固定**、不受用户单位设置影响的文本，用 `suffix`/`prefix`，别用 `unit`。

```jsonc
// 两种写法的对比
{ "mode": "text", "field": "heart_rate", "decimal": 0, "unit": true }        // → "148 bpm"（随用户单位设置变）
{ "mode": "text", "field": "heart_rate", "decimal": 0, "suffix": " bpm" }    // → "148 bpm"（固定）
```

---

## 挑选字段/边界的快捷原则

- **进度条/完成度**：`field` 用 `pct`（时间进度）或 `distance`/`km`（配 `max:"totalDistance"`/`"totalKm"`）。
- **心率仪表/色条**：`field:"heart_rate"`，`min:"heartRateMin"`，`max:"user_heartRateMax"`。
- **速度表**：`field:"speed"`，`min:"paceMin"`，`max:"paceMax"`（注意这是速度极值）。
- **配速表**：`field:"pace"`，`min:"paceBoundMin"`，`max:"paceBoundMax"`。
- **指北针/朝向**：`field:"azimuth"` + `angle` 模式绑 `rotation`，`min:0,max:360,from:0,to:360`。
- **海拔**：`field:"altitude"`（`min:"eleMin",max:"eleMax"`）或 `field:"relAltitude"`（`min:"baseAltitude",max:"eleMax"`）。

导入/预览/提交链路见 → [04_workflow.md](04_workflow.md)。
