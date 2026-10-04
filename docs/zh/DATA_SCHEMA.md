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

### 2. 插值阶段 (data/interpolator.js)

将不等间隔的轨迹点线性插值为 1 秒间隔：

```
输入: trkpt[] (原始不等间隔)
输出: trkpt[] (每秒一个点)
```

插值规则：
- 数值字段（heart_rate, speed, elevation 等）：线性插值
- 位置字段（latitude, longitude）：线性插值
- 缺失字段：标记为 null

### 3. 计算补齐阶段 (data/fieldComputer.js)

基于插值后的轨迹点计算衍生字段：

| 函数 | 输入 | 输出 | 说明 |
|------|------|------|------|
| `computeSlope()` | elevation, distance | slope (%) | 坡度 = Δelevation / Δdistance × 100 |
| `computeGainLoss()` | elevation | gain, loss | 累计爬升/下降（含阈值过滤） |
| `computeAzimuth()` | lat, lng | azimuth (°) | 相邻点方位角 |
| `computeMapPoints()` | lat, lng | mapX, mapY | 地图投影坐标 |
| `computeChartPoints()` | 各字段 | chart coords | 图表坐标映射 |

### 4. 图表坐标映射

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
