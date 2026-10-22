/**
 * chartCommon.js - 折线类图表组件的公共实现
 *
 * Elevation Chart / Pace Chart / Heart Chart（pt_ele_pan / pt_pace_pan / pt_heart_pan）
 * 三个组件的画图布局完全同构：三条水平虚线标尺 + Y 轴三个刻度文本 + 数据折线
 * + 竖向进度线 + 右下角图标 + 当前值文本 + 进度圆点。
 * 这里把「设置项 / build / update」抽成一份，三个定义只提供各自的差异点（opts），
 * 这样加配置项时一次加齐、三块面板保持一致，也避免同类代码各自漂移。
 *
 * 约定（改动前务必读）：
 * 1) 默认观感不变。新增键的默认值必须等于原先写死的字面量（标尺 5px、字号 20/24、
 *    圆点 13、虚线 [10,10]、圆角 8 等）。老模板里没有这些键，走同一套回落值，
 *    所以老模板/老导出渲染结果与升级前一致。
 * 2) 图层开关靠「不生成该子元素」实现（同 lapPanels），不用 visible：
 *    开关键不在 LAYOUT_KEYS 里，改它必然走 rebuildBoxChildren 整体重建，天然生效。
 *    因此 update() 一律按 name 取子元素，不能再按下标写死 —— 图层关掉后下标会平移。
 * 3) 面积填充必须排在曲线之前：Leafer 按 children 顺序绘制，后画的盖在上面。
 * 4) 缩放契约见 docs：Box.resizeChildren 会在每次改尺寸时「就地」把子元素的
 *    points/x/y/width/height 乘上 新÷旧，所以 build 只写设计坐标，
 *    update 每帧回写的位置要乘 resizeScale，且绝不能把 store 里的数组直接交给子元素。
 */
import { resizeScale, plotInsets } from '../../utils/math.js';

/** 设计绘图区尺寸与内缩边距（三个图表共用，放大后刻度线/圆点不越界） */
export const CHART_W = 400, CHART_H = 200, CHART_PADX = 14, CHART_PADY = 18;

/**
 * 数字回落：缺省/空串/非数字一律退回老款写死的那个值。
 * 用 Number() 而不是只认 number，是因为模板 JSON 里的数字有可能是字符串形式。
 * 注意量程（maxKey/minKey）不走这里，仍按老款 `chartData.x || 默认` 取值 ——
 * 那里 0 是被当缺省的，别顺手改成 ??。
 */
const num = (v, d) => {
    if (v === undefined || v === null || v === '') return d;
    const n = Number(v);
    return isFinite(n) ? n : d;
};
/** 图层开关：缺键视为「开」，与升级前一直显示这些图层的行为等价 */
const on = (v, d = true) => (v === undefined || v === null ? d : v !== false);
/** 取第一个非空字符串：新键 → 老键 → 兜底色，保证老模板不填新键时观感不变 */
const firstColor = (...vals) => {
    for (const v of vals) if (typeof v === 'string' && v) return v;
    return undefined;
};

/** 按 'a.b' 路径取值（图标颜色这类回落链要用） */
function pick(obj, path) {
    if (!path) return undefined;
    let cur = obj;
    for (const k of String(path).split('.')) {
        if (cur === undefined || cur === null) return undefined;
        cur = cur[k];
    }
    return cur;
}

/**
 * 生成三个图表共用的默认配置
 * @param {Object} o - 组件差异点（见 chartChildren 的 opts 说明）
 */
export function chartDefaultConfig(o) {
    return {
        x: o.x,
        y: o.y,
        width: CHART_W,
        height: CHART_H,
        // 面板外观：默认透明底 + 无描边，等价升级前 Box 上这些键全部缺省的状态。
        // borderWidth 只在用户选了边框颜色后才看得见，所以默认值不影响观感。
        cornerRadius: 8,
        fill: '#00000000',
        borderWidth: 2,
        // 图层开关（默认全开 = 升级前一直画的那些东西；面积填充是新功能，默认关）
        showRuler: true,
        showLabels: true,
        showProgress: true,
        showDot: true,
        showIcon: true,
        showValue: true,
        showArea: false,
        smooth: o.smoothDefault,
        // 尺寸类：全部等于老款写死的数值
        dashSize: 10,
        labelFontSize: 20,
        valueFontSize: 24,
        dotSize: 13,
        iconSize: 1,
        colors: {
            ruler: '#FFFFFF',
            rulerText: '#FFFFFF',
            line: o.lineColor,
            progress: '#FFFFFF',
            dot: '#ffde7d',
            area: o.areaColor,
            ...(o.extraColors || {})
        },
        strokeWidth: { ruler: 5, line: 3, progress: 4 }
    };
}

/**
 * 生成设置项列表：原有 7 行的键名与文案一字不改，新项按「面板 / 图层 / 曲线 / 标尺 /
 * 进度 / 圆点 / 当前值 / 角标」分组排在后面。
 */
export function chartSettings(o) {
    return [
        { name: o.title, type: 'title' },
        // —— 面板外观（作用于 Box 自身）——
        { name: 'Panel color', key: 'fill', type: 'color' },
        { name: 'Border color', key: 'stroke', type: 'color', defaultValue: '#00000000' },
        { name: 'Border width', key: 'borderWidth', type: 'number', min: 0, max: 20 },
        { name: 'Corner radius', key: 'cornerRadius', type: 'number', min: 0, max: 60 },
        // —— 图层开关 ——
        { name: 'Ruler lines', key: 'showRuler', type: 'boolean' },
        { name: 'Scale labels', key: 'showLabels', type: 'boolean' },
        { name: 'Progress line', key: 'showProgress', type: 'boolean' },
        { name: 'Progress dot', key: 'showDot', type: 'boolean' },
        { name: 'Corner icon', key: 'showIcon', type: 'boolean' },
        { name: 'Current value', key: 'showValue', type: 'boolean' },
        // —— 曲线 ——
        { name: o.lineLabel + ' line color', key: 'colors.line', type: 'color' },
        { name: o.lineLabel + ' line thickness', key: 'strokeWidth.line', type: 'number', min: 1, max: 10 },
        { name: 'Smooth curve', key: 'smooth', type: 'boolean' },
        { name: 'Area fill', key: 'showArea', type: 'boolean' },
        { name: 'Area color', key: 'colors.area', type: 'color' },
        // —— 标尺 ——
        { name: 'Ruler color', key: 'colors.ruler', type: 'color' },
        { name: 'Ruler thickness', key: 'strokeWidth.ruler', type: 'number', min: 1, max: 10 },
        { name: 'Dash size', key: 'dashSize', type: 'number', min: 2, max: 30 },
        { name: 'Ruler text color', key: 'colors.rulerText', type: 'color' },
        { name: 'Ruler text size', key: 'labelFontSize', type: 'number', min: 8, max: 40 },
        // —— 进度线 ——
        { name: 'Progress line color', key: 'colors.progress', type: 'color' },
        { name: 'Progress line thickness', key: 'strokeWidth.progress', type: 'number', min: 1, max: 10 },
        // —— 圆点 ——
        { name: 'Progress dot color', key: 'colors.dot', type: 'color' },
        { name: 'Progress dot size', key: 'dotSize', type: 'number', min: 2, max: 40 },
        // —— 当前值文本（默认与刻度同色，所以面板显示的默认值取 rulerText，做到所见即所得）——
        { name: 'Value color', key: 'colors.valueText', type: 'color', defaultValue: chartDefaultConfig(o).colors.rulerText },
        { name: 'Value size', key: 'valueFontSize', type: 'number', min: 8, max: 60 },
        // —— 角标图标 ——
        { name: 'Icon size', key: 'iconSize', type: 'number', min: 0.2, max: 4, step: 0.1 },
        ...(o.iconColorKey ? [{ name: 'Icon color', key: o.iconColorKey, type: 'color', defaultValue: o.lineColor }] : [])
    ];
}

/**
 * 生成子元素
 * @param {Object} o - 组件差异点：
 *   title/lineLabel/iconColorKey/iconColorFallbacks/iconScale/iconPath
 *   pointsKey/maxKey/minKey/maxDefault/minDefault/smoothDefault/flatCornerRadius/areaColor
 *   formatLabel(v,pos) / formatValue(frameData)
 * @param {Object} config - 合并后的组件配置
 * @param {Object} data - processedData（图表预计算点在其 _chartData 上）
 */
export function chartChildren(o, config, data) {
    const W = CHART_W, H = CHART_H;
    const chartData = (data && data._chartData) || {};
    const colors = config.colors || {};
    const sw = config.strokeWidth || {};
    const inset = plotInsets(W, H, CHART_PADX, CHART_PADY);

    // 与老款一致：量程用 `||` 回落（0 视为缺省），别换成 ??
    const maxV = chartData[o.maxKey] || o.maxDefault;
    const minV = chartData[o.minKey] || o.minDefault;
    const pts = chartData[o.pointsKey] || [];

    const showRuler = on(config.showRuler);
    const showLabels = on(config.showLabels);
    const showProgress = on(config.showProgress);
    const showDot = on(config.showDot);
    const showIcon = on(config.showIcon);
    const showValue = on(config.showValue);
    const showArea = on(config.showArea, false);
    const smooth = on(config.smooth, o.smoothDefault);

    const dash = num(config.dashSize, 10);
    const labelFS = num(config.labelFontSize, 20);
    const valueFS = num(config.valueFontSize, 24);
    const dotSize = num(config.dotSize, 13);
    const iconScale = o.iconScale * num(config.iconSize, 1);
    // 图标颜色：新键 colors.icon → 组件老配置里已有的图标键 → 跟随线色
    const iconColor = firstColor(
        pick(config, o.iconColorKey),
        ...(o.iconColorFallbacks || []).map(k => pick(config, k)),
        colors.line, o.lineColor
    );
    const lineColor = firstColor(colors.line, o.lineColor);
    // 面积色回落：colors.area → 老的 colors.fill（高程图早就备着这块颜色却一直没接上）→ 组件默认
    const areaColor = firstColor(colors.area, colors.fill, o.areaColor);
    const rulerColor = firstColor(colors.ruler, '#FFFFFF');
    const labelColor = firstColor(colors.rulerText, '#FFFFFF');
    // 当前值文本默认与刻度同色（老款就是同一个颜色）
    const valueColor = firstColor(colors.valueText, colors.rulerText, '#FFFFFF');

    // 平滑：leafer 的 curve 走贝塞尔插值；关掉后回到各组件老观感
    // （心电原来是 cornerRadius:1 的圆角折线，高程/配速原来是硬折线）
    const curveStyle = smooth ? { curve: true } : (o.flatCornerRadius ? { cornerRadius: o.flatCornerRadius } : {});

    const children = [];

    // 1) 三条水平虚线标尺（顶线只给 x/y/width，中线和底线给 points —— 保持老款写法）
    if (showRuler) {
        const rulerStyle = { tag: 'Line', lockRatio: true, width: inset.x(W) - inset.x(0), strokeWidth: num(sw.ruler, 5), stroke: rulerColor, dashPattern: [dash, dash] };
        children.push({ ...rulerStyle, x: inset.x(0), y: inset.y(0) });
        children.push({ ...rulerStyle, points: [inset.x(0), inset.y(H / 2), inset.x(W), inset.y(H / 2)] });
        children.push({ ...rulerStyle, points: [inset.x(0), inset.y(H), inset.x(W), inset.y(H)] });
    }

    // 2) Y 轴三个刻度文本（x 为负：贴在绘图区左侧外面）
    if (showLabels) {
        const labelStyle = { tag: 'Text', resizeFontSize: true, x: -6, fontSize: labelFS, fontWeight: 'black', fill: labelColor, textAlign: 'right', verticalAlign: 'middle' };
        children.push({ ...labelStyle, y: inset.y(0), text: o.formatLabel(maxV, 'max') });
        children.push({ ...labelStyle, y: inset.y(H / 2), text: o.formatLabel((maxV + minV) / 2, 'mid') });
        children.push({ ...labelStyle, y: inset.y(H), text: o.formatLabel(minV, 'min') });
    }

    // 3) 面积填充：画在曲线之前才不会被曲线盖住。
    //    曲线点 + 右下角 + 左下角再闭合，就是常见的「面积图」填充。
    //    inset.points() 每次返回新数组，这里 concat 出的也是新数组，不会污染 store。
    if (showArea && pts.length >= 2) {
        const flat = inset.points(pts);
        const base = inset.y(H);
        children.push({
            tag: 'Line', lockRatio: true, closed: true,
            points: flat.concat([flat[flat.length - 2], base, flat[0], base]),
            fill: areaColor, ...curveStyle
        });
    }

    // 4) 数据折线
    children.push({
        tag: 'Line', lockRatio: true, points: inset.points(pts),
        strokeWidth: num(sw.line, 3), stroke: lineColor, strokeCap: 'round', ...curveStyle
    });

    // 5) 竖向进度线：rotation 90 的横线竖放，x 由 update() 每帧横扫
    if (showProgress) {
        children.push({
            name: 'metrics', tag: 'Line', lockRatio: true, x: inset.x(50), y: inset.y(0),
            width: inset.y(H) - inset.y(0), rotation: 90, fill: 'blue',
            strokeWidth: num(sw.progress, 4), stroke: firstColor(colors.progress, '#FFFFFF'), strokeCap: 'round'
        });
    }

    // 6) 右下角图标
    if (showIcon) {
        children.push({ tag: 'Rect', x: 360, y: 160, scale: iconScale, path: o.iconPath, fill: iconColor });
    }

    // 7) 当前值文本：贴在进度线右侧，x 由 update() 跟随
    if (showValue) {
        children.push({
            name: 'now_text', tag: 'Text', resizeFontSize: true, x: 55, y: inset.y(H) - 16,
            fontSize: valueFS, fontWeight: 'black', text: '--',
            fill: valueColor,
            textAlign: 'left', verticalAlign: 'middle'
        });
    }

    // 8) 进度圆点：around center，update() 直接写曲线上的点
    if (showDot) {
        children.push({
            name: 'now_dot', tag: 'Ellipse', lockRatio: true, around: 'center',
            x: inset.x(50), y: inset.y(H / 2), width: dotSize, height: dotSize,
            fill: firstColor(colors.dot, '#ffde7d')
        });
    }

    return children;
}

/**
 * 每帧刷新：进度线横扫、圆点落到曲线上、当前值文本跟随并改写
 * 只按 name 找子元素，图层被关掉时找不到就跳过（下标会随开关平移，不能写死）。
 */
export function chartUpdate(o, box, frameData, progress, ctx) {
    const children = box.children;
    if (!children || !children.length) return;

    // 曲线由 resizeChildren 整体缩放，进度线/圆点/文本写的是「渲染像素」位置，需乘缩放比对齐
    const scale = resizeScale(box, CHART_W, CHART_H);
    const inset = plotInsets(CHART_W, CHART_H, CHART_PADX, CHART_PADY);
    const chartData = ctx.chartData || {};
    const pts = chartData[o.pointsKey] || [];
    const byName = n => children.find(c => c && c.name === n);

    const valueText = byName('now_text');
    if (valueText) valueText.text = o.formatValue(frameData);

    const i = ctx.currentFrame;
    if (pts.length > i * 2 + 1) {
        const dx = inset.x(pts[i * 2]) * scale.x;
        const dy = inset.y(pts[i * 2 + 1]) * scale.y;
        const line = byName('metrics');
        if (line) line.x = dx;
        if (valueText) valueText.x = dx + 5 * scale.x;
        const dot = byName('now_dot');
        if (dot) { dot.x = dx; dot.y = dy; }
    }
}
