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
 *    并且面积多边形只走直线段、顶点先夹进绘图区 —— 见 chartChildren 第 3 步的注释，
 *    闭合折线一旦交给 curve 平滑，底边会在两个角之间鼓出绘图框。
 * 4) 缩放契约见 docs：Box.resizeChildren 会在每次改尺寸时「就地」把子元素的
 *    points/x/y/width/height 乘上 新÷旧，所以 build 只写设计坐标，
 *    update 每帧回写的位置要乘 resizeScale，且绝不能把 store 里的数组直接交给子元素。
 * 5) 右下角图标围绕「默认尺寸下的中心」放大缩小（iconNatural 是各图标 path 的
 *    自然包围盒，实测自 Leafer）。build 写设计坐标、update 每帧按当前缩放比重算，
 *    iconSize=1 时两处都精确回到升级前写死的 360/160（及其缩放值），默认观感不变；
 *    换图标记得同步改 iconNatural，写错只会让中心略偏，不会崩。
 */
import { resizeScale, plotInsets } from '../../utils/math.js';

/** 设计绘图区尺寸与内缩边距（三个图表共用，放大后刻度线/圆点不越界） */
export const CHART_W = 400, CHART_H = 200, CHART_PADX = 14, CHART_PADY = 18;

/** 右下角图标左上角的设计锚点：升级前三个图表都是写死的这一对值，别动 */
const ICON_X = 360, ICON_Y = 160;

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
    const iconFactor = num(config.iconSize, 1);
    const iconScale = o.iconScale * iconFactor;
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
    //
    //    两个刻意的保守处理（都是为了让填充绝不越出绘图区）：
    //    a) 顶点先夹进 [x0,x1]×[y0,y1]。正常数据本来就在区间内，夹了等于没夹；
    //       万一某条轨迹的预计算点超出量程，也只是贴边，不会画到面板外面。
    //    b) 面积一律用直线段，不跟 curveStyle。实测：把闭合多边形交给 Leafer 的
    //       curve 平滑，底边那条 372px 的长线段会被两端切线拽出波浪，鼓到下面
    //       标尺线以外（用户反馈的「Area 背景色跑到外面」）。数据点密到每段不到
    //       0.2px，直线段和曲线在视觉上重合，所以关掉平滑没有代价。
    if (showArea && pts.length >= 2) {
        const flat = inset.points(pts);
        const x0 = inset.x(0), x1 = inset.x(W), y0 = inset.y(0), y1 = inset.y(H);
        for (let i = 0; i < flat.length; i += 2) {
            flat[i] = Math.min(x1, Math.max(x0, flat[i]));
            flat[i + 1] = Math.min(y1, Math.max(y0, flat[i + 1]));
        }
        const xFirst = flat[0], xLast = flat[flat.length - 2];
        children.push({
            tag: 'Line', lockRatio: true, closed: true,
            points: flat.concat([xLast, y1, xFirst, y1]),
            fill: areaColor
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

    // 6) 右下角图标：围绕「默认尺寸下的中心」放大缩小
    //    Leafer 的 scale 以元素左上角为原点，所以直接调 scale 会让图标往右下角长
    //    （用户反馈：应该绕中心）。这里按倍率差把左上角反向挪半个身位补回来：
    //    挪动量 = 自然尺寸 × 默认缩放 × (倍率 - 1) ÷ 2，iconSize=1 时为 0，
    //    x/y 精确回到老款写死的 360/160 —— 默认观感逐位不变。
    if (showIcon) {
        const [nw, nh] = o.iconNatural || [0, 0];
        const drift = (iconFactor - 1) * o.iconScale / 2;
        children.push({
            name: 'now_icon',
            tag: 'Rect', x: ICON_X - nw * drift, y: ICON_Y - nh * drift,
            scale: iconScale, path: o.iconPath, fill: iconColor
        });
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

    // 角标图标钉位：Leafer 的 scale 以元素左上角为原点，而 resizeChildren 只乘 x/y 不乘 scale，
    // 所以偏移量不能交给缩放去乘，每帧按当前缩放比重算一次。
    // iconSize=1 时偏移为 0，x/y 恰好等于 resizeChildren 已经写好的 360×scale —— 默认观感逐位不变。
    const icon = byName('now_icon');
    if (icon && o.iconNatural) {
        const [nw, nh] = o.iconNatural;
        const drift = (num(box.__leaferConfig && box.__leaferConfig.iconSize, 1) - 1) * o.iconScale / 2;
        icon.x = ICON_X * scale.x - nw * drift;
        icon.y = ICON_Y * scale.y - nh * drift;
    }

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
