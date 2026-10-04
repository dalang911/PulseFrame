/**
 * definitions/advancedPanels.js - 高级面板组件（弧线距离尺 / 高程折线 / 1:1 高程 / 高级心率仪表）
 * 从老款程序 widget.js + updateLeaferData.js 迁移
 *
 * 覆盖：
 *   x_distance_pan  —— 底部大弧线距离进度尺（Distance）
 *   o2o_ele_pan     —— 1:1 等比例高程滚动窗（Chart）
 *   pl_heart_pan    —— 高级心率仪表盘 + 最近 10 点折线（Attr）
 */

import { o2o_bg, mountain_icon, heart_icon } from '../../utils/icons.js';

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
// 1. 底部大弧线距离进度尺
// ============================================================
const x_distance_pan = {
    id: 'x_distance_pan',
    name: 'Distance Arc',
    category: 'distance',
    icon: './images/l6.png',
    defaultConfig: {
        x: W / 2 - 500, y: 20, width: 1000, height: 50, lockRatio: true,
        barBg: '#CCCCCC', progressColor: '#FFFFFF', textColor: '#FFFFFF'
    },
    dataBindings: ['distance'],
    settings: [
        { name: 'Distance Arc', type: 'title' },
        { name: 'Background color', key: 'barBg', type: 'color' },
        { name: 'Progress color', key: 'progressColor', type: 'color' },
        { name: 'Text color', key: 'textColor', type: 'color' }
    ],
    build(config, data) {
        const maxKm = maxKmOf(data?.data?.trkpt);
        const textColor = config.textColor || '#FFFFFF';
        const barBg = config.barBg || '#CCCCCC';
        const progressColor = config.progressColor || '#FFFFFF';
        return [
            { tag: 'Ellipse', width: 20, height: 20, x: 58, y: 10, around: 'center', fill: textColor },
            {
                tag: 'Text', text: 'start', resizeFontSize: true, x: 50, y: 20, fontSize: 20, fontWeight: 'black',
                fill: textColor, origin: 'center', rotation: 10, textAlign: 'center', verticalAlign: 'top', shadow: textshadow
            },
            { tag: 'Ellipse', width: 20, height: 20, x: 500, y: 50, around: 'center', fill: barBg },
            {
                tag: 'Text', text: (maxKm / 2).toFixed(2) + 'Km', resizeFontSize: true, x: 500, y: 60, fontSize: 20, fontWeight: 'black',
                fill: textColor, textAlign: 'center', verticalAlign: 'top', shadow: textshadow
            },
            { tag: 'Ellipse', width: 20, height: 20, x: 942, y: 10, around: 'center', fill: barBg },
            {
                tag: 'Text', text: maxKm + 'Km', resizeFontSize: true, x: 950, y: 20, fontSize: 20, fontWeight: 'black',
                fill: textColor, origin: 'center', rotation: -10, textAlign: 'center', verticalAlign: 'top', shadow: textshadow
            },
            {
                tag: 'Ellipse', width: 5050, height: 5050, x: -2025, y: -5000,
                startAngle: 80, endAngle: 100, innerRadius: 1, closed: false,
                stroke: barBg, strokeWidth: 9, strokeAlign: 'center', strokeCap: 'round'
            },
            {
                tag: 'Ellipse', width: 5050, height: 5050, x: -2025, y: -5000,
                startAngle: 100, endAngle: 100, innerRadius: 1, closed: false,
                stroke: progressColor, strokeWidth: 10, strokeAlign: 'center', strokeCap: 'round'
            },
            {
                tag: 'Box', x: 500, y: -2480, lockRatio: true, rotation: 0, resizeChildren: true,
                children: [
                    {
                        tag: 'Text', x: 0, y: 0, width: 5050, height: 5050, around: 'center', rotation: 0,
                        resizeFontSize: true, resizeChildren: true, fontSize: 20, fontWeight: 'black',
                        text: '--Km', fill: textColor, textAlign: 'center', verticalAlign: 'bottom', shadow: textshadow
                    }
                ]
            }
        ];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 9) return;
        const ratio = ratioOf(frameData, ctx);
        box.children[8].children[0].text = `${kmOf(frameData)}Km`;
        box.children[7].startAngle = 100 - 20 * ratio;
        box.children[8].rotation = 10 - 20 * ratio;
        box.children[2].fill = ratio >= 0.5 ? box.children[7].stroke : box.children[6].stroke;
        box.children[4].fill = ratio >= 1.0 ? box.children[7].stroke : box.children[6].stroke;
    }
};

// ============================================================
// 2. 1:1 等比例高程滚动窗
// ============================================================
const o2o_ele_pan = {
    id: 'o2o_ele_pan',
    name: 'Elevation 1:1',
    category: 'chart',
    icon: './images/t6.png',
    defaultConfig: {
        x: 550, y: 850, width: 400, height: 100, cornerRadius: 8,
        rulerColor: '#FFFFFF', bgColor: '#FFFFFF', rulerTextColor: '#FFFFFF',
        eleLineColor: '#FFD700', eleLineWidth: 3, progressColor: '#FFFFFF', progressLineWidth: 4,
        dotColor: '#ffde7d', textColor: '#FFFFFF'
    },
    dataBindings: ['distance', 'altitude'],
    settings: [
        { name: '1:1 Elevation 80m', type: 'title' },
        { name: 'Ruler color', key: 'rulerColor', type: 'color' },
        { name: 'Background line color', key: 'bgColor', type: 'color' },
        { name: 'Ruler text color', key: 'rulerTextColor', type: 'color' },
        { name: 'Ele line thickness', key: 'eleLineWidth', type: 'number', min: 1, max: 10 },
        { name: 'Ele line color', key: 'eleLineColor', type: 'color' },
        { name: 'Progress line thickness', key: 'progressLineWidth', type: 'number', min: 1, max: 10 },
        { name: 'Progress line color', key: 'progressColor', type: 'color' },
        { name: 'Progress dot color', key: 'dotColor', type: 'color' }
    ],
    build(config, data) {
        const o2oPoints = data?._chartData?.o2o_ele_points || [];
        const rulerColor = config.rulerColor || '#FFFFFF';
        const rulerTextColor = config.rulerTextColor || '#FFFFFF';
        return [
            { tag: 'Line', lockRatio: true, width: 400, strokeWidth: 5, stroke: rulerColor, dashPattern: [10, 10] },
            { tag: 'Line', lockRatio: true, points: [0, 100, 400, 100], width: 400, strokeWidth: 5, stroke: rulerColor, dashPattern: [10, 10] },
            { tag: 'Rect', x: 0, y: 0, width: 400, height: 100, path: o2o_bg, fill: config.bgColor || '#FFFFFF' },
            { tag: 'Text', resizeFontSize: true, x: -6, y: 0, fontSize: 20, fontWeight: 'black', text: '+10', fill: rulerTextColor, textAlign: 'right', verticalAlign: 'middle' },
            { tag: 'Text', resizeFontSize: true, x: -6, y: 50, fontSize: 20, fontWeight: 'black', text: '0', fill: rulerTextColor, textAlign: 'right', verticalAlign: 'middle' },
            { tag: 'Text', resizeFontSize: true, x: -6, y: 100, fontSize: 20, fontWeight: 'black', text: '-10', fill: rulerTextColor, textAlign: 'right', verticalAlign: 'middle' },
            {
                tag: 'Box', x: 0, y: 0, width: 400, height: 100, lockRatio: true, hitBox: true,
                cornerRadius: 8, overflow: 'hide', resizeChildren: true,
                children: [
                    {
                        tag: 'Line', lockRatio: true, x: 200, y: 50, points: o2oPoints, curve: true,
                        strokeWidth: config.eleLineWidth || 3, stroke: config.eleLineColor || '#FFD700', strokeCap: 'round'
                    }
                ]
            },
            {
                name: 'metrics', tag: 'Line', lockRatio: true, x: 200, width: 100, rotation: 90,
                fill: 'blue', strokeWidth: config.progressLineWidth || 4, stroke: config.progressColor || '#FFFFFF', strokeCap: 'round'
            },
            { tag: 'Rect', x: 360, y: 60, scale: 0.04, path: mountain_icon, fill: '#FFD700' },
            { tag: 'Text', resizeFontSize: true, x: 210, y: 80, fontSize: 24, fontWeight: 'black', text: '180', fill: config.textColor || '#FFFFFF', textAlign: 'left', verticalAlign: 'middle' },
            { tag: 'Ellipse', lockRatio: true, around: 'center', x: 200, y: 50, width: 13, height: 13, fill: config.dotColor || '#ffde7d' }
        ];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 11) return;
        const cd = ctx.chartData || {};
        const baseAlt = cd.baseAltitude || 0;
        // 高程折线横向滚动：当前距离居中
        box.children[6].children[0].x = box.width / 2 - frameData.distance * box.width / 80;
        const centerY = box.height / 2;
        const currentElevationY = ((frameData.altitude || 0) - baseAlt) * -box.width / 80;
        box.children[6].children[0].y = centerY - currentElevationY;
        box.children[9].text = String(Math.round(frameData.altitude || 0));
    }
};

// ============================================================
// 3. 高级心率仪表盘（区间弧 + 最近 10 点折线）
// ============================================================
const pl_heart_pan = {
    id: 'pl_heart_pan',
    name: 'Heart Pro',
    category: 'attr',
    icon: './images/z8.png',
    defaultConfig: {
        x: 100, y: 800, width: 200, height: 200,
        rulerColor: '#FFFFFF', textColor: '#FFFFFF', valueColor: '#FFFFFF',
        zone1Max: 120, zone1Color: '#7FFFD4',
        zone2Max: 140, zone2Color: '#7CFC00',
        zone3Max: 160, zone3Color: '#FFD700',
        zone4Max: 180, zone4Color: '#FF8800',
        zone5Color: '#FF0000'
    },
    dataBindings: ['heart_rate'],
    settings: [
        { name: 'Heart Rate', type: 'title' },
        { name: 'Ruler color', key: 'rulerColor', type: 'color' },
        { name: 'Ruler text color', key: 'textColor', type: 'color' },
        { name: 'Zone 1 color', key: 'zone1Color', type: 'color' },
        { name: 'Zone 1 upper (bpm)', key: 'zone1Max', type: 'number', min: 40, max: 240 },
        { name: 'Zone 2 color', key: 'zone2Color', type: 'color' },
        { name: 'Zone 2 upper (bpm)', key: 'zone2Max', type: 'number', min: 40, max: 240 },
        { name: 'Zone 3 color', key: 'zone3Color', type: 'color' },
        { name: 'Zone 3 upper (bpm)', key: 'zone3Max', type: 'number', min: 40, max: 250 },
        { name: 'Zone 4 color', key: 'zone4Color', type: 'color' },
        { name: 'Zone 4 upper (bpm)', key: 'zone4Max', type: 'number', min: 40, max: 260 },
        { name: 'Zone 5 color', key: 'zone5Color', type: 'color' }
    ],
    build(config, data) {
        const cd = data?._chartData || {};
        const min = cd.heartRateMin ?? 40;
        const max = config.zone4Max ?? cd.user_heartRateMax ?? 180;
        const interval = (max - min) || 1;
        const textColor = config.textColor || '#FFFFFF';
        const zone1Max = config.zone1Max ?? 120;
        const zone2Max = config.zone2Max ?? 140;
        const zone3Max = config.zone3Max ?? 160;
        // 刻度环：Leafer 2.x Ellipse 的 dashPattern+strokeAlign:'inside' 不再正常渲染，
        // 改为逐个生成径向 Line（等同于 rulerPanels 的做法），保证可见且随容器缩放。
        const cx = 100, cy = 100, innerR = 75, outerR = 88, nTicks = 20;
        const tickColor = config.rulerColor || '#FFFFFF';
        const tickLines = [];
        for (let k = 0; k < nTicks; k++) {
            const deg = -210 + k * 240 / (nTicks - 1);
            const rad = deg * Math.PI / 180;
            tickLines.push({
                tag: 'Line', lockRatio: true,
                points: [cx + outerR * Math.cos(rad), cy + outerR * Math.sin(rad),
                         cx + innerR * Math.cos(rad), cy + innerR * Math.sin(rad)],
                strokeWidth: 2.5, stroke: tickColor
            });
        }
        return [
            { tag: 'Box', lockRatio: true, resizeChildren: true, children: tickLines },
            { tag: 'Text', y: 140, x: 26, resizeFontSize: true, fontSize: 14, fontWeight: 'black', text: String(min), fill: textColor, textAlign: 'center', verticalAlign: 'top', rotation: -120 },
            { tag: 'Text', y: 140, x: 172, resizeFontSize: true, fontSize: 14, fontWeight: 'black', text: String(max), fill: textColor, textAlign: 'center', verticalAlign: 'top', rotation: 120 },
            { tag: 'Text', y: 58, x: 30, resizeFontSize: true, fontSize: 14, fontWeight: 'black', text: String(zone1Max), fill: textColor, textAlign: 'center', verticalAlign: 'top', rotation: -60 },
            { tag: 'Text', y: 22, x: 100, resizeFontSize: true, fontSize: 14, fontWeight: 'black', text: String(zone2Max), fill: textColor, textAlign: 'center', verticalAlign: 'top', rotation: 0 },
            { tag: 'Text', y: 58, x: 170, resizeFontSize: true, fontSize: 14, fontWeight: 'black', text: String(zone3Max), fill: textColor, textAlign: 'center', verticalAlign: 'top', rotation: 60 },
            { tag: 'Text', y: 130, x: 80, resizeFontSize: true, fontSize: 36, fontWeight: 'black', text: '--', fill: config.valueColor || '#FFFFFF', textAlign: 'center', verticalAlign: 'top' },
            { tag: 'Rect', x: 125, y: 130, scale: 0.02, path: heart_icon, fill: '#FF0000' },
            { tag: 'Rect', y: 155, x: 120, resizeFontSize: true, width: 30, height: 3, fill: textColor },
            { tag: 'Text', y: 160, x: 120, resizeFontSize: true, fontSize: 14, fontWeight: 'black', text: 'bpm', fill: textColor },
            {
                tag: 'Ellipse', width: 200, height: 200, startAngle: -210, endAngle: 30, innerRadius: 1, closed: false,
                stroke: '#ff5c58', strokeWidth: 24, strokeWidthFixed: false, strokeAlign: 'center', strokeCap: 'round'
            },
            {
                tag: 'Ellipse', width: 200, height: 200, startAngle: -210, endAngle: -150, innerRadius: 1, closed: false,
                stroke: '#bad1ff', strokeWidth: 24, strokeWidthFixed: false, strokeAlign: 'center', strokeCap: 'round'
            },
            { tag: 'Line', lockRatio: true, x: 19, y: 60, points: [], strokeWidth: 5, stroke: '#FF0000' }
        ];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 13) return;
        const min = parseInt(box.children[1].text, 10);
        const max = parseInt(box.children[2].text, 10);
        const interval = (max - min) || 1;
        const heart_rate = frameData.heart_rate || 0;

        box.children[6].text = `${heart_rate}`;
        box.children[11].endAngle = Math.min(30, -210 + (heart_rate - min) * 240 / interval);

        // 心率区间配色（根据用户设定的阈值/颜色）
        const cfg = box.__leaferConfig || this.defaultConfig;
        const zone1Max = cfg.zone1Max ?? 120;
        const zone2Max = cfg.zone2Max ?? 140;
        const zone3Max = cfg.zone3Max ?? 160;
        const zone4Max = cfg.zone4Max ?? 180;
        if (heart_rate > zone4Max) box.children[11].stroke = cfg.zone5Color || '#FF0000';
        else if (heart_rate > zone3Max) box.children[11].stroke = cfg.zone4Color || '#FF8800';
        else if (heart_rate > zone2Max) box.children[11].stroke = cfg.zone3Color || '#FFD700';
        else if (heart_rate > zone1Max) box.children[11].stroke = cfg.zone2Color || '#7CFC00';
        else box.children[11].stroke = cfg.zone1Color || '#7FFFD4';

        // 最近 10 条心率（含当前帧）
        const trkpt = ctx.trkptData || [];
        const heartRates = [];
        for (let i = 0; i < 10; i++) {
            const idx = ctx.currentFrame - i;
            heartRates.push(idx >= 0 && trkpt[idx] ? (trkpt[idx].heart_rate || 0) : 0);
        }

        const width = box.width * 0.75;
        const y40 = width * 0.2;
        const y80 = width * 0.4;
        const xStep = width / 9;
        const zheart_points = [];
        for (let i = 0; i < 9; i++) {   // 9 个差分值点：去掉最左侧因 heartRates[10] 未定义而多出的尖点
            const x = width - i * xStep;
            const displayValue = (heartRates[i] || 0) - (heartRates[i + 1] || 0);
            let y = y40 - (displayValue * 6);
            if (y < 0) y = 0;
            else if (y > y80) y = y80;
            zheart_points.push(x, y);
        }
        // 折线整条按渲染像素书写（points 已用 box.width），锚点 x/y 也需乘缩放比，
        // 否则容器放大时折线固定在设坐标(19,60)的左上角不跟随。
        const s = this.defaultConfig.width ? box.width / this.defaultConfig.width : 1;
        box.children[12].x = 19 * s;
        box.children[12].y = 60 * s;
        box.children[12].points = zheart_points;
    }
};

export const advancedPanels = [
    x_distance_pan,
    o2o_ele_pan,
    pl_heart_pan
];

export default advancedPanels;
