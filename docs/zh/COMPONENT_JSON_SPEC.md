# 组件 JSON 规范 (COMPONENT_JSON_SPEC.md)

## 概述

模板 JSON 是描述一个仪表盘布局的完整配置，包含画布尺寸和所有组件的位置、样式、数据绑定等信息。该 JSON 可用于：
- 保存到 localStorage
- 导出为 .json 文件
- 提交到模板商店共享
- 在设计器和编辑器之间传递

## 模板 JSON 结构

```json
{
    "version": "2.0",
    "canvasSize": {
        "width": 1920,
        "height": 1080
    },
    "components": [
        {
            "id": "pt_background",
            "name": "Background",
            "x": 0,
            "y": 0,
            "width": 1920,
            "height": 1080,
            "rotation": 0,
            "scale": 1,
            "customProps": {
                "child_0_fill": "#1a1a2e"
            }
        },
        {
            "id": "pt_heart_pan",
            "name": "Heart Chart",
            "x": 80,
            "y": 850,
            "width": 400,
            "height": 200,
            "rotation": 0,
            "scale": 1,
            "customProps": {
                "child_1_stroke": "#C71585"
            }
        }
    ],
    "createdAt": "2024-01-15T08:30:00.000Z"
}
```

## 字段说明

### 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string | ✅ | 模板版本号，当前为 `"2.0"` |
| `canvasSize` | object | ✅ | 画布尺寸 |
| `canvasSize.width` | number | ✅ | 宽度（像素），推荐 1920 |
| `canvasSize.height` | number | ✅ | 高度（像素），推荐 1080 |
| `components` | array | ✅ | 组件列表（按渲染顺序，底层在前） |
| `createdAt` | string | - | ISO 8601 创建时间 |

### 组件对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 组件定义 ID（对应 registry 中的 id） |
| `name` | string | ✅ | 组件显示名称（冗余，便于阅读） |
| `x` | number | ✅ | 左上角 X 坐标（像素） |
| `y` | number | ✅ | 左上角 Y 坐标（像素） |
| `width` | number | ✅ | 组件宽度（像素）。工厂先按「设计尺寸」建子元素——默认取 `defaultConfig.width`，声明了 `designSize(config)` 的组件按配置算（三个图表的设计宽 = 200 × `ratio`）——再缩放到这里的值 |
| `height` | number | ✅ | 组件高度（像素） |
| `rotation` | number | - | 旋转角度（度），默认 0 |
| `scale` | number | - | 缩放比例，默认 1 |
| `customProps` | object | - | 旧版位置式样式快照（只写不读，见下） |
| `config` | object | - | 组件真实设置项（与 `defaultConfig` 的差异），载入时合并回 overrides |

### config 说明

`extractConfigDiff()`（`js/utils/configDiff.js`）比较 `box.__leaferConfig` 和
`definition.defaultConfig`，只把用户改过的键写进模板：

```json
"config": { "avatarUrl": "./icon/i3.png", "pointSize": 40, "showStartEnd": true }
```

- `x`/`y`/`width`/`height`/`rotation`/`scale` 不重复写入，几何信息以顶层字段为准。
- 与默认值相同的键一律省略，所以新增设置项不会撑大既有模板。
- 会改外框大小的设置项是「两处都存、且两处一致」：图表的 `ratio`（1~8，默认 2）进
  `config`，它算出来的宽（默认高度下 = 200 × 比例）进顶层 `width`。老模板没有
  `ratio` 键 → 回落 2 → 恢复出来的外框仍是升级前的 400×200。
- 无法 `JSON.stringify` 的值（Leafer 实例、循环引用）跳过而不抛错。
- 旧模板没有 `config` 字段，载入行为与以前完全一致。
- 上传的头像/图标以 `data:image/png;base64,…` 存在 `config` 里，一张 256×256 PNG
  约 30–60 KB，注意商店 2 MB 上限。

### customProps 说明

`customProps` 保存用户对组件样式的手动调整，仅记录与 `defaultConfig` 不同的值。
**注意：`build()` 读的是语义键（如 `config.avatarUrl`），不会读 `child_0_fill`
这类键，因此这部分内容写入后并不会被消费**——为了兼容商店里已有的模板而保留，
真正生效的是上面的 `config`。

键名格式：`child_{index}_{property}`

| 属性 | 说明 |
|------|------|
| `fill` | 填充颜色 |
| `stroke` | 描边颜色 |
| `fontSize` | 字体大小 |
| `strokeWidth` | 描边宽度 |

示例：
```json
"customProps": {
    "child_0_fill": "#FF5733",
    "child_1_stroke": "#C71585",
    "child_2_fontSize": 18
}
```

## 支持的组件 ID

| ID | 名称 | 分类 |
|----|------|------|
| `pt_background` | Background | background |
| `pt_datetime` | Date Time | info |
| `pt_heart_pan` | Heart Chart | chart |
| `pt_pace_pan` | Pace Chart | chart |
| `pt_elevation_pan` | Elevation Chart | chart |
| `pt_distance_*` | Distance Bar | progress |
| `pt_status_*` | Status Panel | info |

## 画布尺寸推荐

| 名称 | 尺寸 | 用途 |
|------|------|------|
| Full HD | 1920 × 1080 | 标准横屏（默认） |
| HD | 1280 × 720 | 低分辨率 |
| Square | 1080 × 1080 | 方形（社交媒体） |
| Vertical | 1080 × 1920 | 竖屏（手机） |

## 示例：完整跑步模板

```json
{
    "version": "2.0",
    "canvasSize": { "width": 1920, "height": 1080 },
    "components": [
        {
            "id": "pt_background",
            "name": "Background",
            "x": 0, "y": 0,
            "width": 1920, "height": 1080,
            "rotation": 0, "scale": 1,
            "customProps": { "child_0_fill": "#0f0f23" }
        },
        {
            "id": "pt_datetime",
            "name": "Date Time",
            "x": 50, "y": 30,
            "width": 300, "height": 60,
            "rotation": 0, "scale": 1,
            "customProps": {}
        },
        {
            "id": "pt_heart_pan",
            "name": "Heart Chart",
            "x": 80, "y": 850,
            "width": 400, "height": 200,
            "rotation": 0, "scale": 1,
            "customProps": { "child_1_stroke": "#FF1493" }
        },
        {
            "id": "pt_pace_pan",
            "name": "Pace Chart",
            "x": 520, "y": 850,
            "width": 400, "height": 200,
            "rotation": 0, "scale": 1,
            "customProps": {}
        },
        {
            "id": "pt_elevation_pan",
            "name": "Elevation Chart",
            "x": 960, "y": 850,
            "width": 400, "height": 200,
            "rotation": 0, "scale": 1,
            "customProps": {}
        }
    ],
    "createdAt": "2024-01-15T08:30:00.000Z"
}
```

## 版本兼容性

- **v2.0**：当前版本，使用模块化组件注册系统
- **v1.x**：旧版格式（localStorage 中的 `frameConfig_` 前缀条目），通过 TemplateManager 兼容加载

## 大小限制

- 单个模板 JSON 最大 2MB（API 限制）
- 建议保持在 100KB 以内以保证加载性能
