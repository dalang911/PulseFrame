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
                tag: 'Line', lockRatio: true, points: ele18Points, cornerRadius: 1,
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
function mapChildren(config, data) {
    return [
        {
            tag: 'Line', lockRatio: true, points: data?._chartData?.mapPoints || [],
            cornerRadius: 4, strokeWidth: config.routeWidth || 4,
            stroke: config.routeColor || '#FFFF00', strokeCap: 'round'
        },
        {
            name: 'now_map', tag: 'Line', lockRatio: true, points: [],
            cornerRadius: 6, strokeWidth: config.progressWidth || 6,
            stroke: config.progressColor || '#FF7F00', strokeCap: 'round'
        },
        {
            name: 'now_point', tag: 'Ellipse', lockRatio: true, around: 'center',
            width: 16, height: 16, fill: config.pointColor || '#FF6347'
        }
    ];
}

const mapSettings = [
    { name: 'Route', type: 'title' },
    { name: 'Background route thickness', key: 'routeWidth', type: 'number', min: 1, max: 20 },
    { name: 'Background route color', key: 'routeColor', type: 'color' },
    { name: 'Progress route thickness', key: 'progressWidth', type: 'number', min: 1, max: 20 },
    { name: 'Progress route color', key: 'progressColor', type: 'color' },
    { name: 'Current position color', key: 'pointColor', type: 'color' }
];

/** 地图组件公共 update：截断进度线 + 移动当前点
 * scale 由调用方（持有 definition）传入，把设计坐标的 nowPoints/当前点换算到缩放后空间 */
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
        pointColor: '#FF6347'
    },
    dataBindings: ['distance'],
    settings: mapSettings,
    build(config, data) {
        return mapChildren(config, data);
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
        progressColor: '#FF7F00', progressWidth: 6,
        pointColor: '#FF6347'
    },
    dataBindings: ['distance', 'azimuth'],
    settings: mapSettings,
    build(config, data) {
        return [
            {
                tag: 'Line', lockRatio: true, points: data?._chartData?.mapPoints || [],
                cornerRadius: 4, strokeWidth: config.routeWidth || 4,
                stroke: config.routeColor || '#FFFF00', strokeCap: 'round'
            },
            {
                name: 'now_map', tag: 'Line', lockRatio: true, points: [],
                cornerRadius: 6, strokeWidth: config.progressWidth || 6,
                stroke: config.progressColor || '#FF7F00', strokeCap: 'round', opacity: 0.7
            },
            {
                name: 'now_point', tag: 'Polygon',
                points: [24, 0, 0, 48, 24, 36, 48, 48, 24, 0],
                around: 'center', fill: config.pointColor || '#FF6347'
            }
        ];
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
