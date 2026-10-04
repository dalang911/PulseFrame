/**
 * studio/FieldDemo.js - 数据演示
 *
 * 一键把 fieldCatalog 里所有可选值（实时/派生/极值）生成为文本图层，
 * 网格排开、带「名称+单位」前缀、按分组着色，并自动跳到演示数据中间帧，
 * 便于一眼预览每个字段的真实取值效果（省去手动加图层逐个绑定比较）。
 *
 * 样式案例的取舍标准：面板能搭出来才留（所有效果 = PropsPanel 可编辑属性 +
 * BindingPanel 可选绑定，非代码可复现）；依赖 points/dashPattern/origin 等
 * 面板不暴露的能力的一律不做。
 *
 * 生成的都是普通图层（含绑定），可继续编辑/删除（Ctrl+Z 一步撤销）。
 */

import { specStore } from './SpecStore.js';
import { studioCanvas } from './StudioCanvas.js';
import { makeLayer } from './runtime/spec.js';
import { FIELDS } from './fieldCatalog.js';

// 分组配色（与画布深色底 #23232e 对比清晰）
const GROUP_COLOR = { value: '#6fd3ff', derived: '#ffd166', extreme: '#ff9fb2' };
const GROUP_ORDER = ['value', 'derived', 'extreme'];
const GROUP_LABEL = { value: 'Live data', derived: 'Derived', extreme: 'Extremes/Bounds' };

// 文本类字段（fieldValue 返回字符串，不设小数位）
const STRING_FIELDS = new Set(['pace', 'avgPace', 'elapsedTime', 'totalTime', 'remainTime']);
// 比例字段（0..1，多给小数位）
const PCT_FIELDS = new Set(['pct', 'hrPct']);
// 整数字段（小数位设 0）：心率/步频/功率/坡度/方位角/秒数/时长 及各极值基准
const INT_FIELDS = new Set(['heart_rate', 'cadence', 'power', 'slope', 'azimuth', 'sec', 'duration',
    'heartRateMin', 'heartRateMax', 'user_heartRateMax', 'cadenceMin', 'cadenceMax', 'powerMin', 'powerMax']);

function decimalFor(key) {
    if (STRING_FIELDS.has(key)) return null;
    if (INT_FIELDS.has(key)) return 0;
    if (PCT_FIELDS.has(key)) return 2;
    return 2;
}

// ===== 样式案例调色板 =====
const C = { green: '#32cd79', red: '#ff6b6b', amber: '#ffd166', cyan: '#6fd3ff', orange: '#ff7f00', track: '#333344', panel: '#191970', dark: '#22222e', white: '#ffffff', gray: '#cccccc' };

/** ① 距离进度条：当前距离居中、总长度在条右边 */
function exProgressBar(ox, oy) {
    return [
        makeLayer('text', { name: 'ex-bar-title', props: { x: ox, y: oy, text: '① Distance Progress Bar (current centered · total on right)', fontSize: 26, fontWeight: 'bold', fill: C.white, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('rect', { name: 'ex-bar-track', props: { x: ox, y: oy + 50, width: 520, height: 34, fill: C.track, cornerRadius: 17 } }),
        makeLayer('rect', { name: 'ex-bar-fill', props: { x: ox, y: oy + 50, width: 520, height: 34, fill: C.green, cornerRadius: 17 }, bindings: { width: { mode: 'size', field: 'distance', prop: 'width', min: 0, max: 'totalDistance' } } }),
        makeLayer('text', { name: 'ex-bar-cur', props: { x: ox, y: oy + 55, width: 520, text: '0.00 km', fontSize: 22, fontWeight: 'bold', fill: '#06341a', textAlign: 'center', verticalAlign: 'top' }, bindings: { text: { mode: 'text', field: 'km', decimal: 2, suffix: ' km' } } }),
        makeLayer('text', { name: 'ex-bar-total', props: { x: ox + 534, y: oy + 55, text: 'Total — km', fontSize: 22, fill: C.gray, textAlign: 'left', verticalAlign: 'top' }, bindings: { text: { mode: 'text', field: 'totalKm', decimal: 2, prefix: 'Total ', suffix: ' km' } } })
    ];
}

/** ② 速度·配速圆弧仪表：弧度=速度（映射 paceMin..paceMax），中心显配速
 * 端点圆角：innerRadius:1 + strokeCap:'round' + closed:false。
 * 根因：带 innerRadius 的角度 Ellipse 默认按闭合扇环渲染（1.9.4/2.2.11 同理），封闭路径无 line cap，
 * round 端点不显示；加 closed:false 成开放弧后圆头生效（arc 默认属性已在 spec.js defaultProps 里带上）。
 * innerRadius 保持 1 还能避免速度最小时(start==end)零长度弧退化成圆点。
 */
function exArcGauge(ox, oy) {
    return [
        makeLayer('text', { name: 'ex-arc-title', props: { x: ox, y: oy, text: '② Speed / Pace Gauge (arc = speed)', fontSize: 26, fontWeight: 'bold', fill: C.white, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('arc', { name: 'ex-arc-bg', props: { x: ox, y: oy + 40, width: 220, height: 220, innerRadius: 1, startAngle: -210, endAngle: 30, fill: null, stroke: C.track, strokeWidth: 22, strokeCap: 'round', strokeAlign: 'center' } }),
        makeLayer('arc', { name: 'ex-arc-fg', props: { x: ox, y: oy + 40, width: 220, height: 220, innerRadius: 1, startAngle: -210, endAngle: 30, fill: null, stroke: C.red, strokeWidth: 22, strokeCap: 'round', strokeAlign: 'center' }, bindings: { endAngle: { mode: 'angle', field: 'speed', prop: 'endAngle', min: 'paceMin', max: 'paceMax', from: -210, to: 30 } } }),
        makeLayer('text', { name: 'ex-pace', props: { x: ox, y: oy + 120, width: 220, text: '--:--', fontSize: 34, fontWeight: 'black', fill: C.white, textAlign: 'center', verticalAlign: 'top' }, bindings: { text: { mode: 'text', field: 'pace' } } }),
        makeLayer('text', { name: 'ex-pace-cap', props: { x: ox, y: oy + 164, width: 220, text: 'Pace min/km', fontSize: 16, fill: C.gray, textAlign: 'center', verticalAlign: 'top' } }),
        makeLayer('text', { name: 'ex-speed', props: { x: ox + 250, y: oy + 110, text: '0.0 km/h', fontSize: 30, fontWeight: 'bold', fill: C.red, textAlign: 'left', verticalAlign: 'top' }, bindings: { text: { mode: 'text', field: 'speed', decimal: 1, suffix: ' km/h' } } }),
        makeLayer('text', { name: 'ex-speed-cap', props: { x: ox + 250, y: oy + 150, text: 'Current speed', fontSize: 16, fill: C.gray, textAlign: 'left', verticalAlign: 'top' } })
    ];
}

/** ③ 大数值卡片 */
function exBigCard(ox, oy) {
    return [
        makeLayer('text', { name: 'ex-card-title', props: { x: ox, y: oy, text: '③ Big Value Card', fontSize: 24, fontWeight: 'bold', fill: C.white, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('rect', { name: 'ex-card-bg', props: { x: ox, y: oy + 36, width: 300, height: 150, fill: C.panel, cornerRadius: 14 } }),
        makeLayer('text', { name: 'ex-card-label', props: { x: ox + 22, y: oy + 56, text: 'Distance', fontSize: 24, fill: C.gray, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('text', { name: 'ex-card-value', props: { x: ox + 22, y: oy + 92, text: '0.00', fontSize: 56, fontWeight: 'black', fill: C.orange, textAlign: 'left', verticalAlign: 'top' }, bindings: { text: { mode: 'text', field: 'km', decimal: 2, suffix: ' km' } } })
    ];
}

/** ④ 完成度环（pct 映射整圈，中心显当前公里） */
function exRing(ox, oy) {
    return [
        makeLayer('text', { name: 'ex-ring-title', props: { x: ox, y: oy, text: '④ Completion Ring', fontSize: 24, fontWeight: 'bold', fill: C.white, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('arc', { name: 'ex-ring-bg', props: { x: ox + 75, y: oy + 36, width: 150, height: 150, innerRadius: 1, startAngle: -90, endAngle: 270, fill: null, stroke: C.track, strokeWidth: 16, strokeAlign: 'center' } }),
        makeLayer('arc', { name: 'ex-ring-fg', props: { x: ox + 75, y: oy + 36, width: 150, height: 150, innerRadius: 1, startAngle: -90, endAngle: 270, fill: null, stroke: C.cyan, strokeWidth: 16, strokeAlign: 'center' }, bindings: { endAngle: { mode: 'angle', field: 'pct', prop: 'endAngle', min: 0, max: 1, from: -90, to: 270 } } }),
        makeLayer('text', { name: 'ex-ring-text', props: { x: ox + 75, y: oy + 96, width: 150, text: '0.0', fontSize: 26, fontWeight: 'bold', fill: C.white, textAlign: 'center', verticalAlign: 'top' }, bindings: { text: { mode: 'text', field: 'km', decimal: 1 } } })
    ];
}

/** ⑤ 心率区间色条：同一元素 size(进度)+color(阈值分区) 双绑定 */
function exHRZone(ox, oy) {
    return [
        makeLayer('text', { name: 'ex-hr-title', props: { x: ox, y: oy, text: '⑤ Heart Rate Zone Bar (size+color dual binding)', fontSize: 24, fontWeight: 'bold', fill: C.white, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('rect', { name: 'ex-hr-bg', props: { x: ox, y: oy + 36, width: 300, height: 150, fill: C.dark, cornerRadius: 14 } }),
        makeLayer('text', { name: 'ex-hr-label', props: { x: ox + 20, y: oy + 52, text: 'Heart rate', fontSize: 22, fill: C.gray, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('text', { name: 'ex-hr-value', props: { x: ox + 78, y: oy + 48, text: '0 bpm', fontSize: 26, fontWeight: 'bold', fill: C.white, textAlign: 'left', verticalAlign: 'top' }, bindings: { text: { mode: 'text', field: 'heart_rate', decimal: 0, suffix: ' bpm' } } }),
        makeLayer('rect', { name: 'ex-hr-track', props: { x: ox + 20, y: oy + 110, width: 260, height: 22, fill: C.track, cornerRadius: 11 } }),
        makeLayer('rect', { name: 'ex-hr-fill', props: { x: ox + 20, y: oy + 110, width: 260, height: 22, fill: C.green, cornerRadius: 11 }, bindings: { width: { mode: 'size', field: 'heart_rate', prop: 'width', min: 0, max: 'user_heartRateMax' }, fill: { mode: 'color', field: 'heart_rate', prop: 'fill', thresholds: [{ gte: 0, color: C.green }, { gte: 120, color: C.amber }, { gte: 150, color: C.red }] } } })
    ];
}

/** ⑥ 方位角罗盘（angle 模式绑 prop:'rotation'）
 * leafer 元素默认绕「左上角」旋转，直接用 rect 会让轴心落在角上（0° 时像右下角）。
 * 给针加 origin:{x:宽/2,y:0}（顶部中心）把旋转轴心移到圆心：针 rect x=cx-宽/2, y=cy（从圆心向下），
 * 不旋转时针尖指南（南）；rotation = 180° + azimuth 即针尖指向方位角（0°北/90°东）。origin 已加入属性面板「轴心」控件，面板可复现。
 */
function exCompass(ox, oy) {
    const d = 150, cx = ox + d / 2, cy = oy + 36 + d / 2;
    // textAlign:'center' 且不给 width 时，leafer 把字形中心对齐到 x → 方位字直接取轴线坐标即可居中
    const lbl = (t, x, y) => makeLayer('text', { name: 'ex-cmp-' + t, props: { x, y, text: t, fontSize: 18, fontWeight: 'bold', fill: C.gray, textAlign: 'center', verticalAlign: 'top' } });
    return [
        makeLayer('text', { name: 'ex-cmp-title', props: { x: ox, y: oy, text: '⑥ Compass (rotation)', fontSize: 22, fontWeight: 'bold', fill: C.white, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('ellipse', { name: 'ex-cmp-bg', props: { x: ox, y: oy + 36, width: d, height: d, fill: C.dark, stroke: '#4a4a5a', strokeWidth: 2 } }),
        lbl('N', cx, oy + 42), lbl('S', cx, oy + 36 + d - 26), lbl('E', ox + d - 16, cy - 13), lbl('W', ox + 16, cy - 13),
        // 针：origin 把旋转轴心移到顶部中心=圆心(cx,cy)，默认向下(南)，rotation=180+azimuth → 针尖指方位角
        makeLayer('rect', { name: 'ex-cmp-needle', props: { x: cx - 3, y: cy, width: 6, height: 56, fill: C.red, cornerRadius: 3, rotation: 0, origin: { x: 3, y: 0 } }, bindings: { rotation: { mode: 'angle', field: 'azimuth', prop: 'rotation', min: 0, max: 360, from: 180, to: 540 } } }),
        makeLayer('ellipse', { name: 'ex-cmp-hub', props: { x: cx - 6, y: cy - 6, width: 12, height: 12, fill: C.white } }),
        makeLayer('text', { name: 'ex-cmp-az', props: { x: ox, y: oy + 36 + d + 8, width: d, text: '—°', fontSize: 22, fontWeight: 'bold', fill: C.white, textAlign: 'center', verticalAlign: 'top' }, bindings: { text: { mode: 'text', field: 'azimuth', decimal: 0, suffix: '°' } } })
    ];
}

/** ⑦ 里程碑点阵：visible 模式按 pct 阈值逐格点亮 */
function exDots(ox, oy) {
    const arr = [makeLayer('text', { name: 'ex-dot-title', props: { x: ox, y: oy, text: '⑦ Milestones (visible)', fontSize: 22, fontWeight: 'bold', fill: C.white, textAlign: 'left', verticalAlign: 'top' } })];
    for (let i = 1; i <= 5; i++) {
        arr.push(makeLayer('ellipse', { name: 'ex-dot' + i, props: { x: ox + (i - 1) * 44, y: oy + 70, width: 32, height: 32, fill: C.cyan }, bindings: { visible: { mode: 'visible', field: 'pct', threshold: i * 0.2 - 0.001 } } }));
    }
    arr.push(makeLayer('text', { name: 'ex-dot-cap', props: { x: ox, y: oy + 116, text: 'One dot lit per 20% progress', fontSize: 15, fill: C.gray, textAlign: 'left', verticalAlign: 'top' } }));
    return arr;
}

/** ⑧ 水平扫描游标（size→x 位置绑定）：圆点在轨道上随距离横扫
 *
 * 要点：size 模式是「设计值×比例」，会丢掉图层自身偏移 → 把游标放进一个
 * 起手于轨道起点的 group 里，组内设计 x=轨道满宽即可从 0 扫到满宽。
 * （同理可绑 y 做升降；想要“高→顶”反向就用 值最大-字段 类字段或接受自上而下）
 */
function exScan(ox, oy) {
    return [
        makeLayer('text', { name: 'ex-yc-title', props: { x: ox, y: oy + 8, text: '⑧ Scan Cursor (size→x)', fontSize: 22, fontWeight: 'bold', fill: C.white, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('rect', { name: 'ex-yc-track', props: { x: ox, y: oy + 88, width: 420, height: 6, fill: C.track, cornerRadius: 3 } }),
        makeLayer('text', { name: 'ex-yc-start', props: { x: ox - 4, y: oy + 104, text: '0', fontSize: 15, fill: C.gray, textAlign: 'left', verticalAlign: 'top' } }),
        makeLayer('text', { name: 'ex-yc-end', props: { x: ox + 372, y: oy + 104, width: 48, text: 'Finish', fontSize: 15, fill: C.gray, textAlign: 'right', verticalAlign: 'top' } }),
        makeLayer('text', { name: 'ex-yc-cur', props: { x: ox, y: oy + 44, text: '0.00 km', fontSize: 22, fontWeight: 'bold', fill: C.orange, textAlign: 'left', verticalAlign: 'top' }, bindings: { text: { mode: 'text', field: 'km', decimal: 2, suffix: ' km' } } }),
        // 游标入组：组原点 = 轨道起点；size 模式读的就是图层自己的设计 x（el.x = 设计x×比例），
        // 故设计 x=420(满轨宽) → 比例 1 时圆心正好落在轨道尾端（左端同理停在 0，半出头像可接受）
        makeLayer('group', {
            name: 'ex-yc-g', props: { x: ox, y: oy }, children: [
                makeLayer('ellipse', { name: 'ex-yc-dot', props: { x: 420, y: 78, width: 22, height: 22, fill: C.orange, stroke: C.white, strokeWidth: 2 }, bindings: { x: { mode: 'size', field: 'distance', prop: 'x', min: 0, max: 'totalDistance' } } })
            ]
        })
    ];
}

class FieldDemo {
    /**
     * 生成字段样例网格并预览。
     * @returns {number} 生成的图层数量
     */
    generate() {
        const trk = window.__trkptData;
        if (!Array.isArray(trk) || trk.length < 2) {
            console.warn('[FieldDemo] 无演示轨迹数据');
        }

        // 排版目标：整体约束在约 4:3 的横向范围内（字段网格 5 列 + 样式案例 3 列）
        const cols = 5;
        const cellW = 340, cellH = 44;
        const left = 40, top = 90;

        // 按分组排序（值→派生→极值），同组内保持目录顺序
        const items = [];
        GROUP_ORDER.forEach(g => FIELDS.forEach(f => { if (f.group === g) items.push(f); }));

        const rows = Math.ceil(items.length / cols);
        const W = left * 2 + cols * cellW;
        const H = top + rows * cellH + 30;

        const layers = [];

        // 顶部图例：分组配色说明
        GROUP_ORDER.forEach((g, i) => {
            layers.push(makeLayer('text', {
                name: 'demo-legend:' + g,
                props: {
                    x: left + i * cellW, y: 30,
                    text: '● ' + GROUP_LABEL[g],
                    fontSize: 26, fontWeight: 'bold', fill: GROUP_COLOR[g],
                    textAlign: 'left', verticalAlign: 'top', rotation: 0, opacity: 1
                }
            }));
        });

        // 每个可选值一个文本图层：绑定 text 模式，前缀=「名称+单位」
        items.forEach((f, idx) => {
            const col = idx % cols, row = Math.floor(idx / cols);
            const x = left + col * cellW, y = top + row * cellH;
            const dec = decimalFor(f.key);
            const prefix = f.label + ': ';
            const binding = { mode: 'text', field: f.key, prefix };
            if (dec != null) binding.decimal = dec;
            layers.push(makeLayer('text', {
                name: 'demo:' + f.key,
                props: {
                    x, y, text: prefix + '—',
                    fontSize: 24, fontWeight: 'normal',
                    fill: GROUP_COLOR[f.group] || '#ffffff',
                    textAlign: 'left', verticalAlign: 'top', rotation: 0, opacity: 1
                },
                bindings: { text: binding }
            }));
        });

        // ===== 样式案例（网格下方，三列紧凑排布，控制整体不致纵向拉长）=====
        const exTop = H + 40;
        layers.push(makeLayer('text', { name: 'ex-header', props: { x: left, y: exTop, text: 'Style Examples (all reproducible via panels)', fontSize: 34, fontWeight: 'black', fill: '#ffffff', textAlign: 'left', verticalAlign: 'top' } }));
        // 三列列心（列宽约 600，落在网格宽内）
        const CX0 = left, CX1 = 720, CX2 = 1400;
        const r0 = exTop + 70;   // 行1：进度条 / 圆弧仪表 / 大数值卡片
        layers.push(...exProgressBar(CX0, r0));
        layers.push(...exArcGauge(CX1, r0));
        layers.push(...exBigCard(CX2, r0));
        const r1 = r0 + 320;     // 行2：完成度环 / 心率区间 / 罗盘
        layers.push(...exRing(CX0, r1));
        layers.push(...exHRZone(CX1, r1));
        layers.push(...exCompass(CX2, r1));
        const r2 = r1 + 260;     // 行3：里程碑 / 扫描游标
        layers.push(...exDots(CX0, r2));
        layers.push(...exScan(CX1, r2));
        const exBottom = r2 + 170;

        const finalW = Math.max(W, CX2 + 340);
        const finalH = Math.max(H, exBottom);

        // 扩容组件盒以容纳全部内容（fit 缩放会自动把全部元素显示到可视区内）
        specStore.setMeta({ width: finalW, height: finalH }, false);
        // 一次性入栈（单次提交进历史，Ctrl+Z 一步撤销）
        specStore.addLayers(layers);

        // 跳到中间帧，让所有字段同时显示真实数值
        const mid = (Array.isArray(trk) && trk.length) ? Math.floor(trk.length / 2) : 0;
        studioCanvas.previewFrame(mid);

        return layers.length;
    }
}

export const fieldDemo = new FieldDemo();
