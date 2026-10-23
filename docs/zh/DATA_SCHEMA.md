# 数据格式规范 (DATA_SCHEMA.md)

## 概述

所有运动数据文件（GPX/TCX/FIT/JSON）经过解析后统一转换为相同的数据结构。该结构由 `DataSchema.js` 定义和校验。

## 统一数据结构

```js
{
    data: {
        summary: Summary,
        motion: Motion,
        trkpt: TrackPoint[],
        lap_standard: Lap[],
        lap_user: Lap[]
    }
}
```

### Summary（摘要信息）

```js
{
    name: string,           // 运动名称/标题
    training_at: string,    // 训练时间 "YYYY-MM-DD HH:MM:SS"
    total_time: number,     // 总时长（秒）
    sport: string           // 运动类型: "running" | "cycling" | "swimming" | "other"
}
```

### Motion（运动统计）

```js
{
    distance: number,           // 总距离（米）
    total_ascent: number,       // 累计爬升（米）
    total_descent: number,      // 累计下降（米）
    avg_heart_rate: number,     // 平均心率（bpm）
    max_heart_rate: number,     // 最大心率（bpm）
    avg_pace: number,           // 平均配速（秒/公里）
    avg_speed: number,          // 平均速度（km/h）
    avg_cadence: number,        // 平均踏频/步频（spm）
    max_speed: number,          // 最大速度（km/h）
    calories: number            // 消耗卡路里
}
```

### TrackPoint（逐秒轨迹点）

经过 `interpolator.js` 插值后，每个点代表 1 秒的数据。

```js
{
    time: number,               // 相对时间（秒，从 0 开始）
    heart_rate: number|null,    // 心率（bpm），无传感器时为 null
    speed: number|null,         // 瞬时速度（km/h）
    pace: number|null,          // 瞬时配速（秒/km）
    distance: number,           // 累计距离（米）
    elevation: number|null,     // 高程（米）
    latitude: number,           // 纬度（WGS84）
    longitude: number,          // 经度（WGS84）
    cadence: number|null,       // 踏频/步频（spm）
    slope: number,              // 坡度（%），由 fieldComputer 计算
    azimuth: number,            // 方位角（°），由 fieldComputer 计算
    gain: number,               // 累计爬升（米），由 fieldComputer 计算
    loss: number                // 累计下降（米），由 fieldComputer 计算
}
```

### Lap（圈速数据）

```js
{
    index: number,              // 圈序号（从 1 开始）
    distance: number,           // 本圈距离（米）
    time: number,               // 本圈用时（秒）
    pace: number,               // 本圈配速（秒/km）
    heart_rate: number|null,    // 本圈平均心率
    calories: number,           // 本圈卡路里
    start_distance: number,     // 起始累计距离
    start_time: number          // 起始累计时间
}
```

## 数据处理管道

### 1. 解析阶段 (parsers/)

各解析器将原始文件格式转换为统一结构：

```
GPXParser.js  → gpxToRq()  → { data: { summary, motion, trkpt, lap_standard, lap_user } }
TCXParser.js  → tcxToRq()  → 同上
FitParser.js  → fitToRq()  → 同上
JsonParser.js → jsonToRq() → 直通（已是标准格式）
```

### 2. 空值修补阶段 (data/seriesRepair.js)

设备刚开机时高程常常还没定位，经纬度也一样定不上；`normalValue()` 把这些没读数的
字段统一写成 `0`，于是解析完的开头是一段 `altitude: 0` 和 `position: (0, 0)`。插值
分不出「海平面 0 米」和「没读数」，也分不出「赤道本初子午线」和「没定位」，所以必须
在插值之前把异常样本换成同一组字段里的真实值。修补按**字段组**进行，每组一个策略：

```
判定：null / undefined / 非数值 / NaN / Infinity / 0 都算没有真实值（负海拔是真实值）

altitude —— nearest（就近冻结）
  开头连续 → 取第一个真实值
  结尾连续 → 取最后一个真实值
  中间空洞 → 取左右更近的一侧，等距取前一个
  只用原始真实点当来源，补上的点不再当作来源，所以一段空洞只会摊成两级台阶，不会漂移

position_lat + position_long —— bridge（洞内直线桥接）
  开头 / 结尾连续 → 同样冻结在洞口，帧数不变
  中间空洞 → 在空洞两侧的两个真实位置之间线性插值，并按 formatValue 保留 6 位小数，
             和 interpolatePoints 对两个真实 GPS 点做的事一致
  经纬度必须成对判定、成对取源：只要有一个分量像缺值，整个点就算坏，两个分量一起补，
  绝不会出现 A 点的纬度接 B 点的经度
```

长时间没定位之所以要桥接而不是冻结，是因为冻结会让地图线"停在原地再瞬移"，桥接只让
它变成一段直线，看起来就是常见的 GPS 掉点。

默认只列了这两组：心率、步频、功率、速度的 `0` 各自是正常语义（没戴心率带、停下了、
没功率计），不能动；要扩展就往 `REPAIR_GROUPS` 里加一组，或者直接传参
`repairSparseSeries(data, [{ keys: ['altitude'], strategy: STRATEGY_NEAREST }])`。
一整组都没有真实值时不编造数据，保持原样并打一条 `[repair] …` 警告（跑步机、室内
骑行每次加载都会命中这条，属预期）。已知取舍：赤道/本初子午线上正好为 `0` 的经纬度
（6 位小数取整后）会被当成缺值。补齐后下游全部受益——`baseAltitude`、`eleMin/eleMax`、
`slope`、`Gain/Loss` 不再被开机段的 0 带偏，`computeMapPoints` 与 `computeAzimuth`
也不再看到 `(0, 0)` 这个幻影顶点。控制台 `window.__repairReport` 会按组给出补了多少
个点，`window.__rawData` 仍是解析后未被改动的原始值。

上面这套规则由 [`tools/series-repair-test.html`](../../tools/series-repair-test.html)
钉住，改完模块或管道顺序后用静态服务器打开重跑一遍。

### 3. 插值阶段 (data/interpolator.js)

将不等间隔的轨迹点线性插值为 1 秒间隔：

```
输入: trkpt[] (原始不等间隔，已完成空值修补)
输出: trkpt[] (每秒一个点)
```

插值规则：
- 数值字段（heart_rate, speed, elevation 等）：线性插值
- 位置字段（latitude, longitude）：线性插值
- 缺失字段：标记为 null

### 4. 计算补齐阶段 (data/fieldComputer.js)

基于插值后的轨迹点计算衍生字段：

| 函数 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `computeSlope()` | elevation, distance | slope (%) | 坡度 = Δelevation / Δdistance × 100 |
| `computeGainLoss()` | elevation | gain, loss | 累计爬升/下降（含阈值过滤） |
| `computeAzimuth()` | lat, lng | azimuth (°) | 相邻点方位角 |
| `computeMapPoints()` | lat, lng | mapX, mapY | 地图投影坐标 |
| `computeChartPoints()` | 各字段 | chart coords | 图表坐标映射 |

### 5. 图表坐标映射

图表组件需要 2D 坐标点来绘制曲线：

```js
chartData: {
    heart_points: [{ x: number, y: number }],  // 心率图表坐标
    pace_points: [{ x: number, y: number }],   // 配速图表坐标
    ele_points: [{ x: number, y: number }],    // 高程图表坐标
    cad_points: [{ x: number, y: number }],    // 踏频图表坐标
    heart_max: number,
    heart_min: number,
    pace_max: number,
    pace_min: number
}
```

坐标映射规则：
- X 轴：时间（秒）→ 图表宽度像素
- Y 轴：数据值 → 图表高度像素（反向，因为 Canvas Y 轴向下）

烘焙出来的幅面固定是 **400×200**，跟图表显示成什么样无关：折线图表（`chartCommon.js`）
用 `plotInsets(W, H, padX, padY, 400, 200)` 把它映射进当前的绘图区，所以新增的
`ratio`（设计宽 = 200 × 比例，1~8）只改目标外框，不改这批数字 —— 同一个数组、
同一个帧下标，任何比例下都对得上。

## 数据校验

`DataSchema.js` 提供数据校验功能：

```js
import { validateData } from './data/DataSchema.js';

const errors = validateData(rq.data);
if (errors.length > 0) {
    console.warn('Data validation warnings:', errors);
}
```

校验规则：
- `trkpt` 数组不能为空
- 每个轨迹点必须包含 `time`, `distance`, `latitude`, `longitude`
- 数值字段范围检查（如 heart_rate: 0-300）
- 时间单调递增检查

## 缺失数据处理

组件在 `update()` 中应处理缺失数据：

```js
update(config, frameData, progress) {
    const hr = frameData.heart_rate;
    if (hr === null || hr === undefined) {
        // 隐藏心率相关元素或显示 "--"
        return;
    }
    // 正常更新...
}
```
