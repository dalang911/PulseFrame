# 组件开发指南 (COMPONENT_GUIDE.md)

## 概述

每个仪表盘组件是一个独立的 JS 模块文件，放置在 `js/components/definitions/` 目录下。组件通过注册表系统集中管理，新增组件只需遵循统一接口规范即可自动集成到编辑器、设计器和渲染引擎中。

## 新增组件步骤

### 1. 创建组件定义文件

在 `js/components/definitions/` 下新建文件，例如 `speedGauge.js`：

```js
/**
 * speedGauge.js - 速度仪表盘组件
 */
export default {
    // === 元数据 ===
    id: 'pt_speed_gauge',       // 唯一标识（必须全局唯一）
    name: 'Speed Gauge',        // 显示名称
    category: 'gauge',          // 分类：background | info | chart | gauge | map | table | progress
    icon: 'speed_icon',         // 图标标识（可选）

    // === 默认配置 ===
    defaultConfig: {
        x: 100,
        y: 200,
        width: 300,
        height: 300,
        colors: {
            background: '#1a1a2e',
            needle: '#ff6b6b',
            ruler: '#ffffff',
            text: '#ffffff'
        },
        strokeWidth: 2,
        minValue: 0,
        maxValue: 30
    },

    // === 数据绑定 ===
    // 声明该组件需要哪些数据字段
    dataBindings: ['speed'],

    // === 设置项定义 ===
    // 用于自动生成设置面板（SettingsPanel.js / PropertyEditor.js）
    settings: [
        { name: 'Background', key: 'colors.background', type: 'color' },
        { name: 'Needle', key: 'colors.needle', type: 'color' },
        { name: 'Ruler', key: 'colors.ruler', type: 'color' },
        { name: 'Stroke Width', key: 'strokeWidth', type: 'number', min: 1, max: 10 },
        { name: 'Min Speed', key: 'minValue', type: 'number', min: 0, max: 100 },
        { name: 'Max Speed', key: 'maxValue', type: 'number', min: 10, max: 200 }
    ],

    // === 构建函数 ===
    // 创建 Leafer 子元素树
    build(config, data) {
        const { Box, Text, Rect, Ellipse, Line } = window.LeaferUI;

        const children = [];

        // 背景圆
        children.push(new Ellipse({
            width: config.width,
            height: config.height,
            fill: config.colors.background,
            stroke: config.colors.ruler,
            strokeWidth: config.strokeWidth
        }));

        // 刻度线（根据 minValue/maxValue 生成）
        // ...

        // 指针
        children.push(new Line({
            id: 'needle',
            x: config.width / 2,
            y: config.height / 2,
            stroke: config.colors.needle,
            strokeWidth: 3
        }));

        // 数值文本
        children.push(new Text({
            id: 'valueText',
            x: config.width / 2,
            y: config.height * 0.7,
            text: '0',
            fill: config.colors.text,
            fontSize: 24,
            textAlign: 'center'
        }));

        return children;
    },

    // === 更新函数 ===
    // 每帧调用，根据当前帧数据更新视觉元素
    update(config, frameData, progress) {
        const speed = frameData.speed || 0;
        const ratio = (speed - config.minValue) / (config.maxValue - config.minValue);

        // 更新指针角度
        const needle = this.getChild('needle');
        if (needle) {
            needle.rotation = ratio * 270 - 135; // -135° ~ +135°
        }

        // 更新数值文本
        const valueText = this.getChild('valueText');
        if (valueText) {
            valueText.text = speed.toFixed(1);
        }
    }
};
```

### 2. 注册组件

在 `js/components/definitions/index.js` 中导入并注册：

```js
import speedGauge from './speedGauge.js';

const allDefinitions = [
    // ... 现有组件
    speedGauge,
];
```

### 3. 完成！

组件会自动：
- 出现在编辑器左侧组件选择面板中
- 出现在设计器组件面板中
- 支持拖拽到画布
- 自动生成设置面板
- 参与视频渲染逐帧更新

## 接口规范

### 组件定义对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 全局唯一标识，建议 `pt_` 前缀 |
| `name` | string | ✅ | 显示名称 |
| `category` | string | ✅ | 分类，用于面板分组 |
| `icon` | string | - | 图标标识 |
| `defaultConfig` | object | ✅ | 默认配置（含 x/y/width/height） |
| `dataBindings` | string[] | ✅ | 需要的数据字段列表 |
| `settings` | array | - | 设置项定义（自动生成面板） |
| `build(config, data)` | function | ✅ | 创建 Leafer 子元素 |
| `update(config, frameData, progress)` | function | ✅ | 逐帧更新 |

### settings 项类型

| type | 说明 | 额外属性 |
|------|------|----------|
| `color` | 颜色选择器 | - |
| `number` | 数字输入 | `min`, `max`, `step` |
| `text` | 文本输入 | - |
| `select` | 下拉选择 | `options: [{ value, label }]` |
| `boolean` | 开关 | - |

### dataBindings 可用字段

| 字段 | 说明 |
|------|------|
| `heart_rate` | 心率 (bpm) |
| `speed` | 速度 (km/h) |
| `pace` | 配速 (秒/km) |
| `distance` | 累计距离 (m) |
| `elevation` | 高程 (m) |
| `cadence` | 踏频/步频 (spm) |
| `slope` | 坡度 (%) |
| `azimuth` | 方位角 (°) |
| `latitude` | 纬度 |
| `longitude` | 经度 |
| `time` | 时间 (秒) |

## 分类规范

| category | 说明 | 示例 |
|----------|------|------|
| `background` | 背景画布 | 纯色/渐变/图片背景 |
| `info` | 信息显示 | 日期时间、标题、综合信息 |
| `chart` | 图表 | 心率图、配速图、高程图 |
| `gauge` | 仪表盘 | 速度表、心率表 |
| `map` | 地图 | 路线图、GPS 轨迹 |
| `table` | 表格 | 圈速表、数据表 |
| `progress` | 进度条 | 距离进度、时间进度 |

## 注意事项

1. **Leafer API**：使用 `window.LeaferUI` 命名空间，版本 2.2.11
2. **子元素 ID**：需要在 `update()` 中动态修改的元素应设置 `id`
3. **性能**：`update()` 每帧调用（10-30 FPS），避免复杂计算
4. **缺失数据**：数据字段可能为 `null`（如运动无踏频），需做防御性处理
5. **颜色格式**：统一使用 `#RRGGBB` 格式
