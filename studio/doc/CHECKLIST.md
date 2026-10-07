# CHECKLIST · AI 生成自检清单

给"离线生成 Component Spec JSON"的 AI 用的**逐条自检**。产出 JSON 前后各跑一遍。

---

## 生成流程（推荐配方）

1. 定 `meta`：起一个 `custom_` 前缀、只含 `[A-Za-z0-9_]` 的 `id`；选好 `category`；定 `width`/`height`（默认 400×200）。
2. 从底层往上排 `layers`：先背景/底槽，再数值/指针，最后文字。
3. 每个图层：写全 `props`（用 [01_spec_schema.md](01_spec_schema.md) 的默认值当模板），给唯一 `uid`。
4. 需要数据驱动的，加 `bindings`：键=目标属性，值=`{mode, field, ...}`（对照 [02_bindings.md](02_bindings.md)）。
5. 归一化的，`min`/`max` 直接抄 [03_fields.md](03_fields.md) 边界表（数字或字段名）。
6. 跑下方"硬校验"，通过后交给用户 Import。

---

## 硬性检查（不满足则导入/注册失败）

- [ ] 顶层是**合法 JSON**，能被 `JSON.parse`（无注释、无尾逗号、字符串用双引号）。
- [ ] 有 `meta` 对象，且 `meta.id` 是**非空字符串**（注册加载要求 `meta.id`）。
- [ ] `meta.id` 只含 `[A-Za-z0-9_]`，建议 `custom_` 前缀，避免与内置组件撞 id。
- [ ] `meta.id` 不与已有组件重号：撞上内置/本地/本会话已注册的 id 时 Studio 会自动加后缀改名；公共库由服务端 `spec_id` 列拦截重号（非 `rejected` 行占着同一 id 则提交返 409 `duplicate_spec_id`）。
- [ ] `layers` 是**数组**。
- [ ] 每个 layer 有 `type`，且取值在 `rect|ellipse|arc|line|text|svg|image|group|path|polygon`。
- [ ] 同一 spec 内所有 `uid` **唯一、非空**。
- [ ] 每个图层有 `props` 对象（可为该类型默认值）。

## 结构检查（不满足会渲染异常/无法编辑）

- [ ] `bindings` 的每个**键**是该 `type` 的**可绑定属性**，且**mode** 在允许集合内（见 [02_bindings.md](02_bindings.md) BINDABLE 表）。
- [ ] `group` 图层才有 `children`；非 group 不要写 `children`。
- [ ] `arc` 显式写了 `closed:false`（否则圆头端帽失效）。
- [ ] `angle` 绑 `rotation` 时写了 `from`/`to`（否则退回 -210/30）。
- [ ] `svg` 图层的 `props.svg` **有代码且≤ 10 KB**（UTF-8 字节，按规范化后的结果算；超限为 error、直接阻断提交/导入）；Studio 里点 **SVG Icon** 先落占位三角形，代码在右侧 **Properties → SVG code** 里换，图标去 https://www.iconfont.cn/collections 找。
- [ ] 手写 `svg` 代码时根标签带 `xmlns="http://www.w3.org/2000/svg"`（进 `<img>` 的独立 SVG 没它什么都不画；Studio 属性框会帮你补，但直接拼 JSON 时容易漏）。
- [ ] `svg` 代码不含 `<script>`、`<foreignObject>`、`on…=` 事件处理器、`javascript:`（含则拒绝插入/落库）。`props.fill` 为空保持原色，非空为重着色。
- [ ] `image.url`（旧版图片图层）只可能是 `https://...` 或 `data:image/...;base64,...`（其它会被安全过滤掉）。
- [ ] 数值字段（`size`/`angle`/`opacity`/`visible` 的 `field`）不是字符串型时间字段（`elapsedTime` 等只配 `text`）。

## 语义检查（保证"动起来"符合预期）

- [ ] 进度/仪表的 `field` 与 `min`/`max` **单位一致**（别把速度 `paceMin/paceMax` 配给 `pace` 字段——用 `paceBoundMin/paceBoundMax`）。
- [ ] `size` 绑定的图层，其 `props` 里被绑的属性写的是**满量程**值（进度条 = 满条宽/高；游标 = 终点坐标）。
- [ ] `color` 绑定提供了 `base`（兜底色）和至少一档 `thresholds`，且 `gte` 覆盖目标数据范围。
- [ ] `text` 绑定：想固定单位用 `suffix`/`prefix`；想跟随用户单位设置用 `unit:true`（可带 `unitKey`）。
- [ ] 坐标都写在 `meta.width×height` 设计盒内，**没有**预先按显示尺寸缩放。

## 落地检查（交付给用户时附带说明）

- [ ] 告知：Import 到 `https://pulseframe.data4u.vip/studio/index.html` 即可预览；Save Local 存 `studio_comp_{id}`；Submit 走审核，弹窗里需先勾选授权声明（管理员可善意改稿、可能不发布；公开后任何人可用可二创），不想公开的引导到 Save Local / Export JSON。
- [ ] 若声明了 `editable` / 依赖 `styleOverrides`，确认 `uid`/`prop` 拼写与实际图层一致。

---

## 一键本地校验（可选，Node/浏览器控制台）

```js
function validateSpec(spec) {
  const errs = [];
  const TYPES = ['rect','ellipse','arc','line','text','svg','image','group','path','polygon'];
  const MODES = ['text','size','angle','color','opacity','visible'];
  const BINDABLE = {
    rect:['x','y','width','height','strokeWidth','cornerRadius','fill','stroke','rotation','opacity','visible'],
    ellipse:['x','y','width','height','strokeWidth','fill','stroke','rotation','opacity','visible'],
    arc:['endAngle','startAngle','stroke','strokeWidth','innerRadius','opacity'],
    line:['x','y','width','stroke','strokeWidth','rotation','opacity','visible'],
    text:['text','fill','x','y','fontSize','opacity','visible'],
    svg:['x','y','opacity','visible'],
    image:['x','y','opacity','visible'],
    group:['opacity'],
    path:[], polygon:[]
  };
  if (!spec || typeof spec !== 'object') return ['顶层必须是对象'];
  if (!spec.meta) errs.push('缺 meta');
  else {
    if (!spec.meta.id || !/^[A-Za-z0-9_]+$/.test(String(spec.meta.id))) errs.push('meta.id 非法（只允许 A-Za-z0-9_）');
  }
  if (!Array.isArray(spec.layers)) errs.push('layers 必须是数组');
  else {
    const uids = new Set();
    const walk = (arr) => arr.forEach(l => {
      if (!l || !l.uid) errs.push('图层缺 uid');
      else if (uids.has(l.uid)) errs.push('uid 重复: ' + l.uid); else uids.add(l.uid);
      if (!TYPES.includes(l.type)) errs.push('非法 type: ' + l.type);
      if (!l.props || typeof l.props !== 'object') errs.push(l.uid + ' 缺 props');
      if (l.type === 'arc' && l.props && l.props.closed === undefined) errs.push(l.uid + ' arc 建议 closed:false');
      const bd = BINDABLE[l.type] || [];
      Object.keys(l.bindings || {}).forEach(key => {
        const b = l.bindings[key];
        if (!bd.includes(key)) errs.push(`${l.uid}: 属性 ${key} 对 ${l.type} 不可绑定`);
        if (!MODES.includes(b && b.mode)) errs.push(`${l.uid}.${key}: 非法 mode ${b && b.mode}`);
        if (l.type === 'arc' && key === 'rotation') errs.push('arc 不支持 rotation 绑定');
        if (b && b.mode === 'angle' && key === 'rotation' && (b.from == null || b.to == null)) errs.push(`${l.uid}.rotation: angle 需 from/to`);
      });
      if (l.type === 'group' && Array.isArray(l.children)) walk(l.children);
    });
    walk(spec.layers);
  }
  return errs;
}
// 用法：console.log(validateSpec(JSON.parse(yourJsonText)));  // [] 即通过
```

> 这份校验器只是"更严格版"的自检，覆盖上面所有对勾项；Studio 本身对多数问题会容错或跳过，但**过了它 = 高质量、可维护、面板里可编辑**的组件。

---

## 速查表

| 我想做 | 怎么写 |
|---|---|
| 数字随数据变 | `text` 模式绑 `text`，选 `field`+`decimal`+`suffix`/`unit` |
| 进度条 | `rect` 的 `props.width`=满宽，`size` 绑 `width`+`field`+`min`/`max` |
| 环形仪表 | `arc` 的 `endAngle`，`angle` 绑 `field`+`min`/`max`+`from`/`to` |
| 指针/罗盘 | 图层 `rotation`，`angle` 绑 `azimuth`+`from:0,to:360` |
| 区间变色 | `fill`/`stroke`，`color` 绑 `field`+`thresholds`+`base` |
| 渐显/点亮 | `visible` 绑 `field`+`threshold` |
| 淡入淡出 | `opacity` 绑 `field`+`min`/`max` |
| 横扫游标 | `x`（或 `y`）用 `size` 绑 `pct`，`props.x`=终点；要设起点加 `from`/`to`（行程起止坐标） |
| 自适应满量程 | `min`/`max` 填**字段名**字符串（如 `"totalKm"`、`"heartRateMax"`） |
