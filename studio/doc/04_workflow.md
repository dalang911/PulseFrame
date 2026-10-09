# 04 · 工作机制：导入 / 导出 / 持久化 / 提交 / 预览

这一篇讲"一份 JSON 从生成到能用"的完整链路，以及所有相关端点与键名。

## 顶栏工具按钮（工作流入口）

元信息输入框：`Name` / `Category` / `Width` / `Height` / `ID`（对应 `spec.meta`，`ID` 只保留 `[A-Za-z0-9_]`，且**不允许与已有组件撞 id**，见下文“组件 ID 撞车防护”）。

| 按钮 | 作用 |
|---|---|
| **Import** | 选择本地 `.json` 文件 → `specStore.importString()` 载入到画布 |
| **Open JSON** | 弹出大文本框**粘贴** Component Spec JSON → 点 `Validate & Import` **先做结构校验，合格才导入**（不合格逐条列出错误，画布不变）；`Ctrl/Cmd+Enter` 同样触发 |
| **Export JSON** | `specStore.exportString()` = `JSON.stringify(spec, null, 2)`，复制出去即标准格式 |
| **Save Local** | 写入浏览器 `localStorage`，键 `studio_comp_{meta.id}`，主编辑器与 Studio 都能立即看到。写之前会过一道 id 防撞（撞上别的本地组件会自动改名，不会静默覆盖） |
| **Open Local** | 列出本机所有 `studio_comp_*` 组件，选一个载入编辑 |
| **Submit to Library** | 提交到公共库（走审核，弹窗里须先勾选授权声明），见下 |
| **AI Handbook**（顶栏右侧） | 弹出简版使用说明（上画布搭 / 直接写 JSON / 术语 / 高频坑）+ `ALL_IN_ONE.md` 下载链接 |
| **Open Library** | 浏览已发布的公共组件 |
| New / Reset / Undo / Redo / Copy / Paste / Delete | 常规编辑操作 |

URL 直达编辑：`?editFrom=local&editId={id}` 或 `?editFrom=shared&editId={dbId}`。
从 `shared` 打开会 **fork** 一份副本，`id` 变成 `{原id}_shared{dbId}`，不污染库里的原件。

---

## 校验规则（生成 JSON 时必须满足）

1. **导入**（`SpecStore.importString`）：
   ```js
   const spec = JSON.parse(text);
   if (!spec.meta || !Array.isArray(spec.layers)) throw new Error('Invalid component JSON');
   ```
   → 必须能 `JSON.parse`、有 `meta` 对象、`layers` 是数组。
2. **注册加载**（`loader.registerSpec` / `visualFactory.registerVisualComponent`）：
   → 必须有 `spec.meta.id`，否则跳过（不报错，但组件不出现）。
3. **与内置组件冲突**：若 `meta.id` 命中一个**非可视化**的内置组件 id，加载会**跳过**（保护内置组件）。→ 用 `custom_` 前缀可规避。
4. **组件 ID 撞车防护**（`lib/idGuard.js`，`_guardId` 在“改 ID”与“保存本地”两处调用）：id 同时是 localStorage 键、registry 注册键和模板/工程引用组件的凭据，撞上就是静默覆盖，因此只要命中以下三源就自动加后缀改名（`my_comp` → `my_comp_2`）并 toast 提示：
   - 内置手写组件 id（启动时由 `loadFrontendDefs()` 灌进来——它们注册在前端自己的 registry 实例上，studio 的 registry 看不见）；
   - 本机 `localStorage` 已存的组件（键后缀 + 内容里的 `meta.id` 都算）；
   - 本会话 registry 里已注册的可视化组件（含从公共库拉下来的）。

   就地编辑自己（`id` 未变）不算冲突；从 `shared` fork 的副本因 id 已带 `_shared{dbId}` 后缀，也不会与原件相撞。别人提交的重号本机看不见，由服务器 409 兜底（见“提交”）。

> 一句话：**能被 `JSON.parse` + 有 `meta`（含 `id`）+ `layers` 是数组** = 合法且能落地。其余都有默认值兜底。

> **结构校验（`lib/validateSpec.js`，规则同 [CHECKLIST.md](CHECKLIST.md)）被两处复用**：Open JSON 弹窗的 `Validate & Import`、以及 Submit to Library 提交前。除了硬性项，还会拦下非法 `type`、缺失/重复 `uid`、缺失 `props`、不可绑定属性、非法 `mode`、`rotation` 的 `angle` 缺 `from/to` 等**结构错误**（有错则不导入 / 不上传）；`meta.id` 为空/含非法字符、`arc` 缺 `closed`、空 `layers` 等只作**警告**，不阻断导入。文件 `Import` 则仅走上面那条硬性规则。

---

## 持久化与加载

### 本地
- 键：`studio_comp_{meta.id}`，值：完整 spec 的 JSON 字符串。
- `loadLocalComponents()` 同步扫描 `localStorage` 全部 `studio_comp_*` 并注册。

### 公共库（远端）
- 列表：`GET {apiBase()}?action=list&kind=component`（返回审核通过的行）。
- 详情：`GET {apiBase()}?action=detail&id={rowId}` → 取 `data.json_content`（就是你提交的 spec JSON）。
- 加载完成后广播事件 `custom:components-loaded`，调色板刷新。
- 本地已有同 `id` 的可视化组件时，**保留本地、不被远端覆盖**。
- 单份 spec 坏掉只会被 `console.warn` 跳过，不影响其它组件。

### 提交（Publish）
- 弹窗采集 `Name / Category / Author / Description` → 更新 `spec.meta`。
- 先跑一遍 `validateSpec()`（与 Open JSON 同一套规则）；结构有错直接拦下，不占用审核队列。额外还有三条**只拦上传、不拦导入**的硬要求：`meta.id` 非空、`meta.id` 只含 `[A-Za-z0-9_]`（非法字符会被服务端剔除后再查重，容易看不出为何撞号）、`layers` 非空（零图层组件装上去就是个透明盒子）。
- `POST {apiBase()}?action=submit`，`kind=component`，`json_content={你的spec JSON}`。
- 提交后 `status=pending`，**管理员审核通过 (`approved`)** 后才进入 `list&kind=component` 发布给所有人。
- 分类取值：`time` `distance` `attr` `chart` `text` `cycling` `theme`。
- **组件 id 重号会被拒**：服务端把 `meta.id` 镜像到 `templates.spec_id`，已有“存活行”（非 `rejected`）占着同一 id 时返回 `409` + `code:"duplicate_spec_id"`，弹窗询问是否换个后缀重提；被驳回的行会释放 id，改内容/重新通过审核时同样重查。模板（`kind=template`）不参与这条规则。每次拦截都会在 `server/logs/server.log.php` 记一条 `WARN duplicate component id rejected`（带撞的行号与来源 IP），方便管理员判断是谁在抢号。
- **提交前必须阅并同意授权声明**（弹窗里的 `.sp-terms` 块 + `#sdAgree` 勾选）：说清三件事——① 管理员会审阅，可能善意改动（布局/配色/绑定），也可能因质量不发布；② 一旦公开就交出独占权，任何人可取用并二次编辑；③ 不想公开就别上传，用 Save Local 或 Export JSON。未勾选时 **Submit for review** 置灰（`_syncSubmit()`），`_submit()` 开头再兜一道；同意**不做记忆**，每次 `open()` 重置。

---

## 预览环境（Studio 里"逐帧"是怎么跑起来的）

- Studio 启动时 `_ensureDemoData()` 会准备内置演示轨迹：`window.__trkptData`（逐帧数组）与 `window.__chartData`（极值/点集）。
- 画布每帧构造上下文：
  ```js
  ctx = { trkptData, currentFrame, maxFrame, chartData };
  progress = currentFrame / (maxFrame - 1);   // 0..1，供 field "pct"
  ```
  然后对每个有绑定的图层调用 `applyLayerBindings(el, layer, { frameData, ctx, progress })`。
- 因此 `pct` = 时间线进度，`totalDistance`/`duration` 等来自末帧，`heartRateMax` 等来自 `chartData`。
- 主编辑器 / 视频导出运行时用**真实活动数据**喂同样的字段——这就是"同一份 JSON，设计即所见、运行即所得"的原因。

---

## 运行时如何把 spec 变成组件（了解即可，无需你写）

`visualFactory.specToDefinition(spec)` 自动生成 registry 需要的定义：
- `defaultConfig = { x:0, y:0, width: meta.width, height: meta.height }`
- `build()`：把每个图层 `layerToElement` 转成 Leafer 元素配置（含 group 递归、`arc` 补 `closed:false`）。
- `update()`：`scale = 容器尺寸 / 设计尺寸`，按 `uid` 命中元素逐条应用绑定。
- `dataBindings`：自动收集用到的 `field`/`min`/`max`。

你只提供声明式 spec，**不提交任何 JavaScript**——这正是共享组件能被安全自动加载的前提。

---

## 可选：作者声明"可编辑样式项"（`spec.editable`）

除核心三段外，spec 支持一个可选数组 `editable`，让使用者在主编辑器属性面板里改某些样式（不改数据绑定）（下为片段示意，需嵌在顶层 spec 中）：

```jsonc
"editable": [
  { "key": "titleColor", "label": "Title color", "type": "color", "uid": "Ltitle", "prop": "fill" }
]
```

- 运行时使用者通过 `config.styleOverrides[uid][prop] = 值` 覆盖对应图层属性（`applyStyleOverride` 合入，不动原 spec）。
- 这是进阶项；**基础组件不需要它也能正常工作**。若不确定，省略 `editable` 即可。

---

完整示例 JSON 见 → [05_examples.md](05_examples.md)；逐条自检见 → [CHECKLIST.md](CHECKLIST.md)。
