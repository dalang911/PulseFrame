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
| `title` | 分组标题，无输入框 | - |
| `color` | 颜色选择器 | - |
| `number` | 数字输入 | `min`, `max`, `step` |
| `text` | 文本输入 | - |
| `select` | 下拉选择 | `options: [{ value, label }]` |
| `boolean` | 开关 | - |
| `bg_image` | 预设背景图缩略图 + 本地文件输入 | - |
| `image_picker` | 预设图片点选（点哪张用哪张）+ 可选「无」格 + 上传按钮（本地图片自动重采样成 1:1 PNG dataURL） | `presets: [{ url, name }]`, `allowNone`, `uploadText`, `uploadSize`（默认 256） |
| `font_selector` | 字体名输入 + 预设字体按钮 | - |
| `unit_button` | 打开全局单位设置弹窗，不读写组件 config | `buttonText` |

面板回显取 `config[key] ?? item.defaultValue ?? ''`：模板是在新增某个键之前保存的
时，`defaultValue` 要和 `build()` 里的兜底值保持一致。

**键名要避开布局键**：`applyPropertyChange()` 把 `x`/`y`/`width`/`height`/`rotation`/
`opacity`/`cornerRadius`/`fill`/`stroke`/`strokeWidth` 视为布局键，直接写到底层 `Box`
且不会重跑 `build()`。想改子元素属性的设置项必须另起键名（如 `routeCornerRadius`、
`pointStrokeWidth`），否则改的是外层容器。

反过来也有一坑：`strokeWidth` 是布局键，可图表类组件早就把它用作「内部线宽对象」
（`{ruler, line, progress}`），所以面板边框宽度另起 `borderWidth`。它不属于布局键，
改它会走 `rebuildBoxChildren()`，而重建只换子元素、不碰 Box 属性，因此
`factory.js` 的 `syncPanelBorderWidth()` 会在重建后补一次同步（`createComponent()`
创建 Box 时同样用它取宽度）。

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
| `chart` | 图表 | 心率图、配速图、高程图（三者的布局与设置项共用 `definitions/chartCommon.js`） |
| `gauge` | 仪表盘 | 速度表、心率表 |
| `map` | 地图 | 路线图、GPS 轨迹 |
| `table` | 表格 | 圈速表、数据表 |
| `progress` | 进度条 | 距离进度、时间进度 |

## 注意事项

1. **Leafer API**：使用 `window.LeaferUI` 命名空间，版本 2.2.11
2. **子元素标识**：需要在 `update()` 中动态修改的元素应设置 `name`（如 `metrics`、`now_dot`），用 `children.find(c => c.name === 'now_dot')` 取，比下标稳；图层开关会让下标整体平移
3. **性能**：`update()` 每帧调用（10-30 FPS），避免复杂计算
4. **缺失数据**：数据字段可能为 `null`（如运动无踏频），需做防御性处理
5. **颜色格式**：优先 `#RRGGBB`；需要透明度时直接写 `rgba(r,g,b,a)` 或 `#RRGGBBAA`（Leafer 与颜色选择器都支持 alpha，所以组件不再单列「透明度」设置项）
6. **缩放契约**：外层 Box 带 `resizeChildren`，改尺寸的那一刻 Leafer 会**就地**把每个子元素的 `points` / `x` / `y` / `width` / `height` 乘上 新尺寸÷旧尺寸。累计效果 = 当前尺寸÷设计尺寸，所以 `update()` 回写坐标要乘 `resizeScale(box, defW, defH)`，而 `build()` 里必须把 `data._chartData` 的数组复制一份再交给子元素（`points: mapPoints.slice()`）——否则 store 里的设计坐标会被改写，下一帧再乘一次就成了二次缩放，各层随之错位
7. **子元素顺序**：`build()` 返回的顺序就是绘制顺序（后面的盖在前面的上面，所以高程图的面积填充排在曲线之前），顺序不能随意重排。图层开关靠「不生成这个子元素」实现（`lapPanels.js`、`chartCommon.js` 都是这样），默认全部开启时生成的列表要和加开关之前完全一致，老模板才像素不变；一旦有元素可能缺席，`update()` 就按 `name` 取，别按下标
8. **面积填充别交给 `curve`**：闭合多边形一旦被 Leafer 平滑，底边那条横跨绘图区的长线段会被两端切线拽出波浪、鼓到标尺以外（用户反馈过的「Area 背景色跑到外面」）。`chartCommon.js` 里面积一律用直线段，并且顶点先夹进 `[x0,x1]×[y0,y1]`；数据点密到每段不到 0.2px，直线段和曲线在视觉上重合，关掉平滑没有代价
9. **`scale` 类图标要绕中心缩放得自己补位**：Leafer 的 `scale` 以元素左上角为原点，直接调倍率图标会往右下角长。`chartCommon.js` 的做法是 `build()` 按 `(倍率-1)` 反向挪左上角、`update()` 再按当前缩放比重算一次（`resizeChildren` 只乘 `x/y` 不乘 `scale`），偏移量在 `iconSize=1` 时精确为 0，所以默认位置和升级前逐位相同。代价是各组件要在 `iconNatural` 里存自己 path 的自然包围盒（实测自 Leafer），换图标记得同步改
