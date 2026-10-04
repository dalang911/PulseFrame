# 架构说明 (ARCHITECTURE.md)

> **PulseFrame 脉搏帧帧 — “Your effort, framed.”**
> 上传 FIT / GPX / TCX 运动数据，逐帧（1 秒 1 帧）生成可叠加到视频上的仪表盘画面；无客户端、浏览器内完成、组件开放可共享。
> 产品名含义：**Pulse**（心率/踏频/功率——运动数据的脉搏）+ **Frame**（帧——产品的输出单位就是一帧一帧的画面）；
> 中文名「脉搏帧帧」即与之严格对译：数据有脉搏，画面有帧帧。
>
> 子品牌：**PulseFrame**（主编辑器）· **PulseFrame Studio**（组件工坊，本目录 `studio/`）· **PulseFrame Hub**（共享组件库，前端「共享」面板）。

## 整体架构

PulseFrame v2.0 采用模块化 ES Module 架构，所有模块通过浏览器原生 ES Module 加载，无需 Node.js 构建工具。

```
┌─────────────────────────────────────────────────────────┐
│                    index.html / designer.html            │
│                   (HTML 骨架 + 第三方库引入)               │
└──────────────────────┬──────────────────────────────────┘
                       │ <script type="module">
        ┌──────────────┼──────────────────┐
        ▼              ▼                  ▼
   ┌─────────┐   ┌──────────┐     ┌──────────────┐
   │  app.js │   │designer/ │     │  外部商店    │
   │ 编辑器  │   │DesignerApp│     │  HTTP API    │
   └────┬────┘   └────┬─────┘     └──────────────┘
        │              │
   ┌────┴──────────────┴────┐
   │        core/           │  ← 核心引擎
   │  EventBus / Store /    │
   │  constants             │
   └────────────┬───────────┘
                │
   ┌────────────┼────────────────────────┐
   │            │                        │
   ▼            ▼                        ▼
┌──────┐  ┌──────────┐           ┌────────────┐
│parsers│  │  data/   │           │components/ │
│GPX/TCX│  │Pipeline  │           │registry    │
│TCX/FIT│  │interpol. │           │factory     │
│JSON   │  │fieldComp │           │updater     │
└───────┘  └──────────┘           │definitions │
                                  └─────┬──────┘
                                        │
                    ┌───────────────────┼──────────────┐
                    │                   │              │
                    ▼                   ▼              ▼
              ┌──────────┐     ┌──────────┐   ┌──────────┐
              │renderer/ │     │   ui/    │   │  map/    │
              │LeaferMgr │     │Settings  │   │MapManager│
              │VideoEng. │     │TemplateM │   │coordTrans│
              │frameRend.│     │TemplateSh│   └──────────┘
              └──────────┘     └──────────┘
```

## 核心模块说明

### core/EventBus.js
发布-订阅事件总线，解耦模块间通信。

```js
import { eventBus, Events } from './core/EventBus.js';
eventBus.emit(Events.DATA_LOADED, data);
eventBus.on(Events.DATA_LOADED, handler);
```

**主要事件：**
- `DATA_LOADED` — 文件解析完成
- `DATA_PROCESSED` — 数据插值+计算补齐完成
- `FRAME_UPDATE` — 帧更新（预览/渲染）
- `COMPONENT_SELECTED` — 组件被选中
- `COMPONENT_ADDED/REMOVED/UPDATED` — 组件增删改
- `RENDER_START/PROGRESS/COMPLETE/ABORT` — 视频渲染生命周期
- `TEMPLATE_LOAD/SAVE/SUBMIT` — 模板操作

### core/Store.js
全局状态管理，替代原 50+ 个 window 全局变量。

```js
import { store } from './core/Store.js';
store.set('processedData', data);
const data = store.get('processedData');
```

**状态键：**
- `rawData` — 原始解析数据
- `processedData` — 插值+计算后的完整数据
- `trkptData` — 逐秒轨迹点数组
- `currentFrame` — 当前帧号
- `startFrame / endFrame / maxFrame` — 帧范围
- `canvasSize` — 画布尺寸 { width, height }
- `activeComponents` — 当前画布组件列表
- `frame / appview / memoryApp / memoryFrame` — Leafer 实例引用

### core/constants.js
集中定义常量（画布尺寸、预览尺寸、支持的运动类型等）。

## 数据流

```
文件上传 (GPX/TCX/FIT/JSON)
  │
  ▼
parsers/index.js → detectFormat() → parse()
  │
  ▼
统一数据结构 rq.data { summary, motion, trkpt[], lap_standard[], lap_user[] }
  │
  ▼
data/interpolator.js → interpolationPoints() 逐秒线性插值
  │
  ▼
data/fieldComputer.js → computeAllFields()
  │  ├─ computeSlope()       坡度
  │  ├─ computeGainLoss()    累计爬升/下降
  │  ├─ computeAzimuth()     方位角
  │  ├─ computeMapPoints()   地图投影点
  │  └─ computeChartPoints() 图表坐标映射
  │
  ▼
完整数据 → Store → EventBus(DATA_PROCESSED)
  │
  ▼
components/factory.js → 根据模板 JSON 创建 Leafer 组件
  │
  ▼
前端预览 / 视频渲染
  │
  ├─ renderer/frameRenderer.js → 逐帧调用 updater.js
  ├─ renderer/VideoEngine.js → MediaBunny 编码输出
  └─ renderer/LeaferManager.js → 管理前端/内存双实例
```

## 组件系统

### 注册表模式
每个组件定义为一个独立文件，导出标准接口对象：

```js
// components/definitions/heartChart.js
export default {
    id: 'pt_heart_pan',
    name: 'Heart Chart',
    category: 'chart',
    defaultConfig: { x, y, width, height, colors: {...} },
    dataBindings: ['heart_rate'],
    settings: [...],    // 自动生成设置面板
    build(config, data) { ... },   // 创建 Leafer children
    update(config, frameData, progress) { ... }  // 逐帧更新
};
```

### 组件生命周期
1. **注册** → `registry.register(definition)`
2. **创建** → `factory.createComponent(id, configOverrides)` → 调用 `definition.build()`
3. **更新** → `updater.updateAllComponents(frame)` → 调用 `definition.update()`
4. **销毁** → 从 Frame 中 remove

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Leafer Editor | 2.2.11 | 前端 Canvas 交互引擎 |
| MediaBunny | - | 浏览器端视频编码（WebCodecs） |
| layui | 2.9.7 | UI 组件（颜色选择器等） |
| maptalks | - | 地图渲染 |
| ES Module | 原生 | 模块化加载（无构建工具） |

（模板商店的实现不在本仓库内，也不在此文档范围。浏览器只会向 `apiBase` 发 JSON 请求。）

## 目录结构

```
pulseframe/
├── index.html              # 主编辑器页面
├── designer.html           # 可视化设计器页面
├── css/
│   ├── app.css             # 主样式
│   └── designer.css        # 设计器样式
├── js/
│   ├── app.js              # 编辑器入口
│   ├── core/               # 核心引擎
│   ├── parsers/            # 文件解析
│   ├── data/               # 数据处理管道
│   ├── components/         # 组件系统
│   │   ├── registry.js     # 注册表
│   │   ├── factory.js      # 工厂
│   │   ├── updater.js      # 更新器
│   │   └── definitions/    # 各组件定义
│   ├── renderer/           # 视频渲染
│   ├── ui/                 # UI 交互
│   ├── map/                # 地图模块
│   ├── designer/          # 可视化设计器
│   └── utils/              # 工具函数
├── docs/                   # 开发文档
├── lib/                    # 第三方库
└── mediabunny.min.mjs      # 视频编码库
```

（模板商店部署在本目录之外，不属于本仓库；本项目不公开它的实现与配置。）
