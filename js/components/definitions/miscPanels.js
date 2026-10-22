/**
 * definitions/miscPanels.js - 进度条 / 坡度 / 高程 / 地图组件批量定义
 * 从老款程序 widget.js 迁移
 *
 * 覆盖：
 *   lite_distance_pan, l_distance_pan, el_slope_pan, appv_ele18_pan（Distance 分类）
 *   appv_map_pan, appv_map_a_pan（Map 分类）
 */

import { unitConfig } from '../../core/UnitConfig.js';
import { resizeScale } from '../../utils/math.js';
import { AVATAR_PRESETS } from '../../utils/images.js';

const textshadow = { x: 2, y: 2, blur: 0, color: '#333333' };

const W = 1920;

/** 最大公里数（保留两位小数） */
function maxKmOf(trkpt) {
    if (!trkpt || !trkpt.length) return 0;
    const last = trkpt[trkpt.length - 1];
    return Math.round((last.distance || 0) / 1000 * 100) / 100;
}

/** 当前公里数（保留两位小数） */
function kmOf(frameData) {
    return Math.round((frameData.distance || 0) / 1000 * 100) / 100;
}

/** 进度比例（0-1，防除零） */
function ratioOf(frameData, ctx) {
    const total = ctx.trkptData?.[ctx.maxFrame - 1]?.distance || 0;
    if (!total) return 0;
    return Math.min(1, Math.max(0, (frameData.distance || 0) / total));
}

// ============================================================
// 1. 迷你距离进度条（右上角 "x/y" 公里数）
// ============================================================
const lite_distance_pan = {
    id: 'lite_distance_pan',
    name: 'Distance Bar',
    category: 'distance',
    icon: './images/x7.png',
    defaultConfig: {
        x: W - 420, y: 80, width: 400, height: 50,
        cornerRadius: 4, fill: '#191970',
        barBg: '#CCCCCC', barFg: '#FFFFFF', textColor: '#FF7F00'
    },
    dataBindings: ['distance'],
    settings: [
        { name: 'Distance Bar', type: 'title' },
        { name: 'Text color', key: 'textColor', type: 'color' },
        { name: 'Progress Background color', key: 'barBg', type: 'color' },
        { name: 'Progress color', key: 'barFg', type: 'color' }
    ],
    build(config) {
        return [
            { tag: 'Rect', width: 400, height: 50, x: 0, y: 0, fill: config.barBg || '#CCCCCC', cornerRadius: 4 },
            { tag: 'Rect', width: 0, height: 50, x: 0, y: 0, fill: config.barFg || '#FFFFFF', cornerRadius: 4 },
            {
                tag: 'Text', resizeFontSize: true, x: 390, y: 3, fontSize: 32, fontWeight: 'black',
                text: '--Km', fill: config.textColor || '#FF7F00',
                textAlign: 'right', verticalAlign: 'center', shadow: textshadow
            }
        ];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 3) return;
        const ratio = ratioOf(frameData, ctx);
        box.children[1].width = ratio * box.children[0].width;
        box.children[2].text = `${kmOf(frameData).toFixed(2)}/${maxKmOf(ctx.trkptData).toFixed(2)}Km`;
    }
};

// ============================================================
// 2. 长距离进度条（顶部居中，带标尺 + 三角定位器）
// ============================================================
const l_distance_pan = {
    id: 'l_distance_pan',
    name: 'Distance Wide',
    category: 'distance',
    icon: './images/l1.png',
    defaultConfig: {
        x: W / 2 - 500, y: 20, width: 1000, height: 200,
        barBg: '#191970', progressColor: '#FFCC00',
        rulerColor1: '#FFFFFF', rulerColor2: '#FFFFFF',
        startColor: '#FFFFFF', endColor: '#FFFFFF',
        locatorColor: '#FF0000', valueColor: '#FFFFFF'
    },
    dataBindings: ['distance'],
    settings: [
        { name: 'Distance Wide', type: 'title' },
        { name: 'Background color', key: 'barBg', type: 'color' },
        { name: 'Progress color', key: 'progressColor', type: 'color' },
        { name: 'Ruler color1', key: 'rulerColor1', type: 'color' },
        { name: 'Ruler color2', key: 'rulerColor2', type: 'color' },
        { name: 'Locator color', key: 'locatorColor', type: 'color' },
        { name: 'Current value color', key: 'valueColor', type: 'color' }
    ],
    build(config, data) {
        const maxKm = maxKmOf(data?.data?.trkpt);
        return [
            { tag: 'Rect', width: 1000, height: 50, x: 0, y: 0, fill: config.barBg || '#191970', cornerRadius: 20 },
            { tag: 'Line', width: 0, x: 90, y: 25, StrokeCap: 'round', strokeWidth: 25, stroke: config.progressColor || '#FFCC00' },
            { tag: 'Line', width: 800, x: 90, y: 25, strokeWidth: 30, stroke: config.rulerColor1 || '#FFFFFF', dashPattern: [2, 8] },
            { tag: 'Line', width: 800, x: 90, y: 25, strokeWidth: 40, stroke: config.rulerColor2 || '#FFFFFF', dashPattern: [3, 97] },
            {
                tag: 'Text', resizeFontSize: true, x: 50, y: 10, fontSize: 20, fontWeight: 'black',
                text: 'Start', fill: config.startColor || '#FFFFFF', textAlign: 'center', verticalAlign: 'top'
            },
            {
                tag: 'Text', resizeFontSize: true, x: 940, y: 10, fontSize: 20, fontWeight: 'black',
                text: maxKm + (unitConfig.suffixOf('distance') || 'Km'), fill: config.endColor || '#FFFFFF', textAlign: 'center', verticalAlign: 'top'
            },
            { tag: 'Polygon', width: 20, height: 20, sides: 3, x: 120, y: 50, fill: config.locatorColor || '#FF0000' },
            {
                tag: 'Text', resizeFontSize: true, x: 120, y: 62, fontSize: 20, fontWeight: 'black',
                text: '--Km', fill: config.valueColor || '#FFFFFF', textAlign: 'center', verticalAlign: 'top'
            }
        ];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 8) return;
        const jdtcd = ratioOf(frameData, ctx) * box.children[2].width;
        box.children[1].width = jdtcd;
        box.children[6].x = jdtcd + box.children[1].x - box.children[6].width / 2;
        box.children[7].x = jdtcd + box.children[1].x;
        box.children[7].text = unitConfig.format('distance', kmOf(frameData));
    }
};

// ============================================================
// 3. 坡度指示器（三角形随坡度倾斜 + 角度文本）
// ============================================================
const el_slope_pan = {
    id: 'el_slope_pan',
    name: 'Slope',
    category: 'distance',
    icon: './images/l5.png',
    defaultConfig: { x: 100, y: 100, width: 100, height: 100, cornerRadius: 4, textColor: '#FFFFFF', graphicColor: '#FF4500' },
    dataBindings: ['slope'],
    settings: [
        { name: 'Slope', type: 'title' },
        { name: 'Text color', key: 'textColor', type: 'color' },
        { name: 'Graphic color', key: 'graphicColor', type: 'color' }
    ],
    build(config) {
        return [
            {
                tag: 'Polygon', resizeFontSize: true,
                points: [0, 60, 0, 70, 100, 70, 100, 60, 100, 60],
                fill: config.graphicColor || '#FF4500'
            },
            {
                tag: 'Text', y: 0, x: 50, resizeFontSize: true, fontSize: 32, fontWeight: 'black',
                text: '0°', fill: config.textColor || '#FFFFFF', textAlign: 'center', verticalAlign: 'top'
            }
        ];
    },
    update(box, frameData) {
        if (!box.children || box.children.length < 2) return;
        const p = box.children[0].points.slice();
        p[1] = p[7];
        p[9] = p[7];
        const slope = parseFloat(frameData.slope) || 0;
        const offset = slope * p[6];
        if (offset > 0) {
            p[9] -= offset;
        } else if (offset < 0) {
            p[1] += offset;
        }
        box.children[1].text = (slope * 100).toFixed(0) + '°';
        box.children[0].points = p;
    }
};

// ============================================================
// 4. 高程剖面（18 倍纵向夸张 + 当前点）
// ============================================================
const appv_ele18_pan = {
    id: 'appv_ele18_pan',
    name: 'Elevation 18x',
    category: 'distance',
    icon: './images/l4.png',
    defaultConfig: {
        x: 320, y: 700, width: 800, height: 100, cornerRadius: 8,
        lineColor: '#FFFFFF', dotColor: '#FFCC00'
    },
    dataBindings: ['altitude'],
    settings: [
        { name: 'Elevation', type: 'title' },
        { name: 'Line thickness', key: 'lineWidth', type: 'number', min: 1, max: 10 },
        { name: 'Elevation color', key: 'lineColor', type: 'color' },
        { name: 'Progress color', key: 'dotColor', type: 'color' }
    ],
    build(config, data) {
        const ele18Points = data?._chartData?.ele18_points || [];
        return [
            {
                // slice()：同 mapChildren，避免 Leafer 就地改写污染 store 里的设计坐标
                tag: 'Line', lockRatio: true, points: ele18Points.slice(), cornerRadius: 1,
                strokeWidth: config.lineWidth || 1, stroke: config.lineColor || '#FFFFFF', strokeCap: 'round'
            },
            { tag: 'Ellipse', lockRatio: true, around: 'center', width: 14, height: 14, fill: config.dotColor || '#FFCC00' }
        ];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 2) return;
        const pts = (ctx.chartData || {}).ele18_points || [];
        const i = ctx.currentFrame * 2;
        // 曲线由 resizeChildren 整体缩放，当前点用设计坐标回写需乘缩放比对齐
        const scale = resizeScale(box, this.defaultConfig.width, this.defaultConfig.height);
        if (pts.length > i + 1) {
            box.children[1].x = pts[i] * scale.x;
            box.children[1].y = pts[i + 1] * scale.y;
        }
    }
};

// ============================================================
// 5. 地图轨迹（全路线 + 已走过路线 + 当前位置点）
// ============================================================

/** 圆点默认直径（Map Route）；Map Heading 的箭头按长边 48 折算成 24 */
const MAP_POINT_SIZE = 16;

/**
 * 读数字设置：区分「这个键不存在（旧模板）」和「用户显式设成 0」
 * 例如圆角设成 0 是有效值，只有缺键时才回落到老款数值
 */
function numOr(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * 生成地图组件子元素
 * 下标顺序固定：0=背景路线 1=已走过路线 2=当前位置点 3=起点 4=终点，
 * mapUpdate 按 1/2 回写位置，将来新增元素只能往后追加。
 *
 * 缩放契约（改动前务必读）：
 *   外层 Box 带 resizeChildren，Leafer 在每次改尺寸的那一刻「就地」把每个子元素的
 *   points / x / y / width / height 乘上 新尺寸÷旧尺寸，累计效果 = 当前尺寸÷设计尺寸。
 *   所以 update() 每帧回写坐标要乘 resizeScale（见 mapUpdate），
 *   而 build() 绝不能把 store 里的数组直接交给子元素——那份设计坐标会被就地改写污染，
 *   下一帧再乘一次缩放就成了二次缩放，背景线与行进线随之错位（本次修掉的即是此坑）。
 *
 * @param {Object} config
 * @param {Object} data - rq（含 _chartData.mapPoints）
 * @param {Object} [opts]
 * @param {boolean} [opts.arrow] - 当前位置用方向箭头多边形（Map Heading）
 * @param {boolean} [opts.icon] - 允许把当前位置换成自定义图标（Map Route）
 */
function mapChildren(config, data, opts = {}) {
    const mapPoints = data?._chartData?.mapPoints || [];
    const routeColor = config.routeColor || '#FFFF00';
    const progressColor = config.progressColor || '#FF7F00';
    const pointColor = config.pointColor || '#FF6347';
    // 老款：背景线圆角 4、进度线 6（固定比背景多 2），两种地图组件都一样
    const corner = Math.max(0, numOr(config.routeCornerRadius, 4));
    // 老款箭头多边形长边就是 48 设计像素，默认值必须与它一致，否则缩放比为 1 时尺寸会缩水
    const pointSize = Math.max(2, numOr(config.pointSize, opts.arrow ? 48 : MAP_POINT_SIZE));
    const pointStroke = config.pointStroke || '#FFFFFF';
    const pointStrokeWidth = Math.max(0, numOr(config.pointStrokeWidth, 0));
    const useIcon = !!(opts.icon && config.pointUseIcon && config.pointIconUrl);

    const children = [
        {
            // slice()：别把 store 的 mapPoints 交给 Leafer 就地改写（见函数头「缩放契约」）
            tag: 'Line', lockRatio: true, points: mapPoints.slice(),
            cornerRadius: corner, strokeWidth: config.routeWidth || 4,
            stroke: routeColor, strokeCap: 'round'
        },
        {
            name: 'now_map', tag: 'Line', lockRatio: true, points: [],
            cornerRadius: corner + 2, strokeWidth: config.progressWidth || 6,
            stroke: progressColor, strokeCap: 'round'
        }
    ];

    // 当前位置：自定义图标（只有 Map Route 打开开关才生效）> 方向箭头 > 圆点
    // 无边框时干脆不写 strokeWidth，保持与老款完全一致的属性集合
    const border = pointStrokeWidth > 0
        ? { stroke: pointStroke, strokeWidth: pointStrokeWidth }
        : {};
    if (useIcon) {
        children.push({
            name: 'now_point', tag: 'Image', lockRatio: true, around: 'center',
            url: config.pointIconUrl, width: pointSize, height: pointSize,
            // 旧模板没有这个键 → 保持圆形裁切（与 Km 标尺头像同款写法）
            cornerRadius: config.pointIconRound === false ? 2 : 2000,
            ...border
        });
    } else if (opts.arrow) {
        // 原箭头多边形长边 48，按 pointSize 等比缩放；不加 lockRatio，与老款一致
        const k = pointSize / 48;
        children.push({
            name: 'now_point', tag: 'Polygon',
            points: [24, 0, 0, 48, 24, 36, 48, 48, 24, 0].map(v => +(v * k).toFixed(4)),
            around: 'center', fill: pointColor, ...border
        });
    } else {
        children.push({
            name: 'now_point', tag: 'Ellipse', lockRatio: true, around: 'center',
            width: pointSize, height: pointSize, fill: pointColor, ...border
        });
    }

    // 起点 / 终点标记：默认关闭，开着也不跟随帧移动
    if (config.showStartEnd && mapPoints.length >= 4) {
        const markerSize = Math.max(4, pointSize * 0.7);
        const mk = (x, y, fill) => ({
            tag: 'Ellipse', lockRatio: true, around: 'center', x, y,
            width: markerSize, height: markerSize, fill,
            ...(pointStrokeWidth > 0 ? { stroke: pointStroke, strokeWidth: pointStrokeWidth } : {})
        });
        children.push(mk(mapPoints[0], mapPoints[1], config.markerColor || '#00E676'));
        children.push(mk(mapPoints[mapPoints.length - 2], mapPoints[mapPoints.length - 1],
            config.markerEndColor || '#FF1744'));
    }

    return children;
}

/**
 * 地图组件设置项
 * 线路透明度不单列设置项：颜色选择器自带 alpha（rgba 描边），再放一个滑块只会重复
 * @param {Object} opts - 面板回显默认值（build 侧另有兜底，两处需保持一致）
 * @param {Array} extra - 组件专属设置项
 */
function mapSettings(opts = {}, extra = []) {
    return [
        { name: 'Route', type: 'title' },
        { name: 'Background route thickness', key: 'routeWidth', type: 'number', min: 1, max: 20 },
        { name: 'Background route color', key: 'routeColor', type: 'color' },
        { name: 'Progress route thickness', key: 'progressWidth', type: 'number', min: 1, max: 20 },
        { name: 'Progress route color', key: 'progressColor', type: 'color' },
        { name: 'Route corner radius', key: 'routeCornerRadius', type: 'number', min: 0, max: 20, defaultValue: 4 },
        { name: 'Current point', type: 'title' },
        { name: 'Current position color', key: 'pointColor', type: 'color' },
        { name: 'Point size', key: 'pointSize', type: 'number', min: 4, max: 120, defaultValue: opts.pointSizeDefault ?? MAP_POINT_SIZE },
        { name: 'Point border color', key: 'pointStroke', type: 'color', defaultValue: '#FFFFFF' },
        { name: 'Point border width', key: 'pointStrokeWidth', type: 'number', min: 0, max: 12, defaultValue: 0 },
        { name: 'Start / End', type: 'title' },
        { name: 'Show start & end', key: 'showStartEnd', type: 'boolean', defaultValue: false },
        { name: 'Start color', key: 'markerColor', type: 'color', defaultValue: '#00E676' },
        { name: 'End color', key: 'markerEndColor', type: 'color', defaultValue: '#FF1744' },
        ...extra
    ];
}

/** 圆点自定义图标：与 Km 标尺头像同一套「预设点选 + 本地上传」控件，默认不启用 */
const mapIconSettings = [
    { name: 'Dot icon', type: 'title' },
    { name: 'Use custom icon', key: 'pointUseIcon', type: 'boolean', defaultValue: false },
    { name: 'Icon', key: 'pointIconUrl', type: 'image_picker', presets: AVATAR_PRESETS, allowNone: true },
    { name: 'Round icon', key: 'pointIconRound', type: 'boolean', defaultValue: true }
];

/** 地图组件公共 update：截断进度线 + 移动当前点
 * scale 由调用方（持有 definition）传入，把设计坐标的 nowPoints/当前点换算到缩放后空间
 * （为什么这里要乘、build 里为什么要 slice：见 mapChildren 函数头的「缩放契约」） */
function mapUpdate(box, frameData, progress, ctx, withRotation, scale) {
    if (!box.children || box.children.length < 3) return;
    const sx = scale ? scale.x : 1;
    const sy = scale ? scale.y : 1;
    const mapPoints = (ctx.chartData || {}).mapPoints || [];
    const nowPoints = [];
    for (let i = 0; i <= ctx.currentFrame; i++) {
        nowPoints.push((mapPoints[i * 2] || 0) * sx, (mapPoints[i * 2 + 1] || 0) * sy);
    }
    box.children[1].points = nowPoints;
    const cx = mapPoints[ctx.currentFrame * 2];
    const cy = mapPoints[ctx.currentFrame * 2 + 1];
    if (cx != null && cy != null) {
        box.children[2].x = cx * sx;
        box.children[2].y = cy * sy;
    }
    if (withRotation && frameData.azimuth != null) {
        box.children[2].rotation = frameData.azimuth;
    }
}

const appv_map_pan = {
    id: 'appv_map_pan',
    name: 'Map Route',
    category: 'map',
    icon: './images/w1.png',
    defaultConfig: {
        x: W - 620, y: 200, width: 600, height: 600, cornerRadius: 4,
        routeColor: '#FFFF00', routeWidth: 4,
        progressColor: '#FF7F00', progressWidth: 6,
        pointColor: '#FF6347',
        routeCornerRadius: 4,
        pointSize: MAP_POINT_SIZE, pointStroke: '#FFFFFF', pointStrokeWidth: 0,
        showStartEnd: false, markerColor: '#00E676', markerEndColor: '#FF1744',
        pointUseIcon: false, pointIconUrl: '', pointIconRound: true
    },
    dataBindings: ['distance'],
    settings: mapSettings({ pointSizeDefault: MAP_POINT_SIZE }, mapIconSettings),
    build(config, data) {
        return mapChildren(config, data, { icon: true });
    },
    update(box, frameData, progress, ctx) {
        mapUpdate(box, frameData, progress, ctx, false, resizeScale(box, this.defaultConfig.width, this.defaultConfig.height));
    }
};

// ============================================================
// 6. 地图轨迹 + 方向角（箭头指示行进方向）
// ============================================================
const appv_map_a_pan = {
    id: 'appv_map_a_pan',
    name: 'Map Heading',
    category: 'map',
    icon: './images/w5.png',
    defaultConfig: {
        x: W - 620, y: 200, width: 600, height: 600, cornerRadius: 4,
        routeColor: '#FFFF00', routeWidth: 4,
        // 老款把这条进度线写死 opacity 0.7（箭头地图要让底图路线透出来）。
        // 透明度不再单列设置项，就把 0.7 折进颜色的 alpha，观感与老款保持一致
        progressColor: 'rgba(255,127,0,0.7)', progressWidth: 6,
        pointColor: '#FF6347',
        routeCornerRadius: 4,
        pointSize: 48, pointStroke: '#FFFFFF', pointStrokeWidth: 0,
        showStartEnd: false, markerColor: '#00E676', markerEndColor: '#FF1744'
    },
    dataBindings: ['distance', 'azimuth'],
    settings: mapSettings({ pointSizeDefault: 48 }),
    build(config, data) {
        return mapChildren(config, data, { arrow: true });
    },
    update(box, frameData, progress, ctx) {
        mapUpdate(box, frameData, progress, ctx, true, resizeScale(box, this.defaultConfig.width, this.defaultConfig.height));
    }
};

export const miscPanels = [
    lite_distance_pan,
    l_distance_pan,
    el_slope_pan,
    appv_ele18_pan,
    appv_map_pan,
    appv_map_a_pan
];

export default miscPanels;
