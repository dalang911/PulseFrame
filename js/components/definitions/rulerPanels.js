/**
 * definitions/rulerPanels.js - 距离标尺面板组件
 * 从老款程序 widget.js + initialize_widget.js + updateLeaferData.js 迁移
 *
 * 覆盖：
 *   zh_distance_pan         —— 每公里高程标尺（含椭圆节点 + 每公里用时 + 头像定位器）
 *   zs8_distance_pan        —— 竖排自适应分段标尺（棋盘刻度 + 六边形定位器）
 *   zs8_distancetext_pan    —— 行进/总距离文本
 *   zs8_distancepercent_pan —— 行进百分比文本
 *
 * 说明：老款在加载时通过 set_zh_distance_pan / updateZs8DistancePan 动态生成子节点，
 *       新版将等价的刻度/节点生成逻辑内联到 build()（数据在构建时已就绪）。
 */

import { go_board_strokes, go_board_black_cells } from '../../utils/icons.js';

const textshadow = { x: 2, y: 2, blur: 0, color: '#333333' };

/** 当前公里数（保留两位小数） */
function kmOf(frameData) {
    return Math.round((frameData.distance || 0) / 1000 * 100) / 100;
}

/** 秒 → HH:MM:SS */
function secToHHMMSS(total) {
    const t = Math.floor(total || 0);
    const h = String(Math.floor(t / 3600)).padStart(2, '0');
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/** 秒 → MM:SS */
function secToMMSS(total) {
    const t = Math.floor(total || 0);
    const m = String(Math.floor(t / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');
    return `${m}:${s}`;
}

// ============================================================
// 1. 每公里高程标尺（zh_distance_pan）
// ============================================================
const zh_distance_pan = {
    id: 'zh_distance_pan',
    name: 'Km Elevation Ruler',
    category: 'distance',
    icon: './images/zt1.png',
    defaultConfig: {
        x: 460, y: 80, width: 600, height: 120, lockRatio: true,
        upperBg: '#7ab6f2', lowerBg: '#FFFF00', scaleColor: '#FFFFFF',
        nodeColor: '#FFFFFF', currentColor: '#FF6347', progressTextColor: '#FFFFFF',
        avatarUrl: './icon/i1.jpg'
    },
    dataBindings: ['distance', 'sec'],
    settings: [
        { name: 'Km Elevation Ruler', type: 'title' },
        { name: 'Upper Bg Color', key: 'upperBg', type: 'color' },
        { name: 'Lower Bg Color', key: 'lowerBg', type: 'color' },
        { name: 'Scale Color', key: 'scaleColor', type: 'color' },
        { name: 'Node/Text Color', key: 'nodeColor', type: 'color' },
        { name: 'Progress Color', key: 'currentColor', type: 'color' },
        { name: 'Progress Text Color', key: 'progressTextColor', type: 'color' },
        { name: 'Avatar URL', key: 'avatarUrl', type: 'text' }
    ],
    build(config, data) {
        const trkpt = data?.data?.trkpt || [];
        const cd = data?._chartData || {};
        const lapStandard = data?.data?.lap_standard || [];
        const total = trkpt.length ? (trkpt[trkpt.length - 1].distance || 0) : 0;
        const totalKm = total / 1000;
        const maxWidth = totalKm * 30; // 老款自然宽度：每公里 30px
        // 关键：build 必须按「基准宽 config.width」铺排几何。rebuild/resize 流程会先把 Box 复位到
        // defW 再 resize 到目标宽（子元素按 targetW/defW 缩放一次）。若这里仍用绝对 30px/km，
        // 背景高程图案会被再缩放一次 → 改颜色（触发 rebuild）时整体变大。
        const baseW = config.width || 600;
        const k = maxWidth > 0 ? baseW / maxWidth : 1;
        const scalePtsX = (arr) => {
            const r = [];
            for (let i = 0; i < arr.length; i += 2) { r.push((arr[i] || 0) * k, arr[i + 1] || 0); }
            return r;
        };

        const nodeColor = config.nodeColor || '#FFFFFF';
        const currentColor = config.currentColor || '#FF6347';
        const pTextColor = config.progressTextColor || '#FFFFFF';

        // 生成节点椭圆 + 里程文字（等价 set_zh_distance_pan）
        const nodes = [];
        const labelNodes = [];
        const nodeKmList = [];
        if (totalKm > 0) {
            nodeKmList.push(0);
            const maxIntKm = Math.floor(totalKm);
            for (let km = 1; km <= maxIntKm; km++) nodeKmList.push(km);
            if (totalKm !== maxIntKm) nodeKmList.push(totalKm);
        }
        nodeKmList.forEach((currentKm) => {
            const isStart = currentKm === 0;
            const isEnd = currentKm === totalKm;
            const is5KmStep = Number.isInteger(currentKm) && currentKm % 5 === 0;
            const nodeSize = isStart || isEnd || is5KmStep ? 15 : 10;
            const nodeX = Math.min(currentKm * 30, maxWidth) * k;

            nodes.push({ tag: 'Ellipse', x: nodeX, y: 0, width: nodeSize, height: nodeSize, around: 'center', fill: nodeColor });

            if (isStart) {
                labelNodes.push({
                    tag: 'Text', text: 'Start', resizeFontSize: true, x: nodeX, y: 10, fontSize: 12, fontWeight: 'black',
                    fill: nodeColor, origin: 'left', rotation: 45, textAlign: 'left', verticalAlign: 'middle'
                });
                return;
            }
            if (isEnd) {
                labelNodes.push({
                    tag: 'Text', text: totalKm.toFixed(2) + 'Km', resizeFontSize: true, x: nodeX + 10 * k, y: 0, fontSize: 14, fontWeight: 'black',
                    fill: nodeColor, origin: 'left', rotation: 45, textAlign: 'left', verticalAlign: 'middle'
                });
                return;
            }
            if (!Number.isInteger(currentKm)) return;
            let timeInSeconds = 0;
            const lapIndex = currentKm - 1;
            if (lapIndex >= 0 && lapIndex < lapStandard.length) timeInSeconds = lapStandard[lapIndex].total_timer_time || 0;
            labelNodes.push({
                tag: 'Text', text: `${currentKm}K ${secToMMSS(timeInSeconds)}`, resizeFontSize: true, x: nodeX, y: 10, fontSize: 14, fontWeight: 'black',
                fill: nodeColor, origin: 'left', rotation: 45, textAlign: 'left', verticalAlign: 'middle'
            });
        });

        return [
            { tag: 'Polygon', height: 30, x: 0, y: 0, points: scalePtsX(cd.zh_ele_points || []), curve: true, fill: config.upperBg || '#7ab6f2' },
            { tag: 'Polygon', height: 30, x: 0, y: 0, points: scalePtsX(cd.zh_eled_points || []), curve: true, fill: config.lowerBg || '#FFFF00' },
            { tag: 'Line', y: 30, width: baseW, strokeWidth: 5, stroke: config.scaleColor || '#FFFFFF' },
            { tag: 'Box', y: 30, lockRatio: true, rotation: 0, resizeChildren: true, children: nodes },
            { tag: 'Box', y: 30, lockRatio: true, rotation: 0, resizeChildren: true, children: labelNodes },
            {
                tag: 'Box', y: 30, lockRatio: true, resizeChildren: true,
                children: [
                    { tag: 'Ellipse', width: 10, height: 10, x: 0, y: 0, around: 'center', fill: currentColor },
                    { tag: 'Line', y: 0, width: 50, rotation: -90, strokeWidth: 5, stroke: currentColor },
                    { tag: 'Ellipse', width: 50, height: 50, x: 0, y: -50, around: 'center', fill: currentColor },
                    { tag: 'Image', width: 40, height: 40, cornerRadius: 2000, x: 0, y: -50, rotation: 12, around: 'center', url: config.avatarUrl || './icon/i1.jpg', draggable: true },
                    { tag: 'Text', text: '', resizeFontSize: true, x: -26, y: -68, fontSize: 14, fontWeight: 'black', fill: pTextColor, textAlign: 'right', verticalAlign: 'top' },
                    { tag: 'Text', text: '', resizeFontSize: true, x: -26, y: -52, fontSize: 14, fontWeight: 'black', fill: pTextColor, textAlign: 'right', verticalAlign: 'top' }
                ]
            }
        ];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 6) return;
        const total = ctx.trkptData?.[ctx.maxFrame - 1]?.distance || 0;
        if (!total) return;
        const jdtcd = ((frameData.distance || 0) / total) * box.children[2].width;
        box.children[5].x = jdtcd;
        // 行进用时 / 行进距离
        box.children[5].children[5].text = secToHHMMSS(frameData.sec);
        box.children[5].children[4].text = `${kmOf(frameData)}Km`;
        // 头像随帧左右摆动（±12°）
        box.children[5].children[3].rotation = (ctx.currentFrame % 2 === 1) ? 12 : -12;
    }
};

// ============================================================
// 2. 竖排自适应分段标尺（zs8_distance_pan）
// ============================================================

/** 移植 updateZs8DistancePan 的自适应分段 + 刻度 X 坐标计算 */
function buildZs8Ticks(totalKm) {
    const targetDistanceKm = Math.max(3, Math.min(totalKm, 1000));

    const getTargetSegmentCount = (distance) => {
        if (distance >= 4 && distance < 9) return 5;
        if (distance >= 10 && distance < 20) return 3;
        if (distance >= 20 && distance < 50) return 4;
        if (distance >= 50 && distance < 200) return 6;
        return 8;
    };
    const getAdaptStep = (distance, targetSeg) => {
        const preferredSteps = [10, 5, 1];
        const avgStep = distance / targetSeg;
        let bestStep = preferredSteps.reduce((prev, curr) =>
            (Math.abs(curr - avgStep) < Math.abs(prev - avgStep) ? curr : prev), preferredSteps[0]);
        const fullCount = Math.floor(distance / bestStep);
        const remain = distance - fullCount * bestStep;
        const actualSegCount = fullCount + (remain > 0.001 ? 1 : 0);
        if (actualSegCount > targetSegCount) {
            const stepIndex = preferredSteps.indexOf(bestStep);
            bestStep = stepIndex > 0 ? preferredSteps[stepIndex - 1] : bestStep * 2;
        } else if (actualSegCount < targetSegCount) {
            const stepIndex = preferredSteps.indexOf(bestStep);
            bestStep = stepIndex < preferredSteps.length - 1 ? preferredSteps[stepIndex + 1] : bestStep / 2;
        }
        return Math.max(0.1, bestStep);
    };

    const targetSegCount = getTargetSegmentCount(targetDistanceKm);
    const adaptStep = getAdaptStep(targetDistanceKm, targetSegCount);

    let remainingLength = targetDistanceKm;
    const segmentLengths = [];
    while (segmentLengths.length < targetSegCount - 1) {
        if (remainingLength >= adaptStep) {
            segmentLengths.push(adaptStep);
            remainingLength -= adaptStep;
        } else break;
    }
    if (segmentLengths.length < targetSegCount) segmentLengths.push(remainingLength);

    const totalPxWidth = 700;
    const segmentPxWidths = segmentLengths.map(len => (len / targetDistanceKm) * totalPxWidth);
    let cumulativePx = 0;
    const ticks = [];
    for (let i = 0; i < segmentPxWidths.length; i++) {
        cumulativePx += segmentPxWidths[i];
        ticks.push({ x: Math.min(cumulativePx, totalPxWidth), isLast: i === segmentLengths.length - 1 });
    }
    return ticks;
}

const zs8_distance_pan = {
    id: 'zs8_distance_pan',
    name: 'Auto Ruler',
    category: 'distance',
    icon: './images/l9.png',
    defaultConfig: {
        x: 30, y: 890, width: 700, height: 80, rotation: -90, lockRatio: true,
        barBgColor: '#404e6d', progressColor: '#FFFFFF', paraColor: '#FF0000',
        tickColor: '#FFFFFF', dotColor: '#FF0000'
    },
    dataBindings: ['distance'],
    settings: [
        { name: 'Auto Ruler', type: 'title' },
        { name: 'Background Color', key: 'barBgColor', type: 'color' },
        { name: 'Progress Color', key: 'progressColor', type: 'color' },
        { name: 'Paragraph Color', key: 'paraColor', type: 'color' },
        { name: 'Dot Color', key: 'dotColor', type: 'color' }
    ],
    build(config, data) {
        const trkpt = data?.data?.trkpt || [];
        const total = trkpt.length ? (trkpt[trkpt.length - 1].distance || 0) : 0;
        const ticks = buildZs8Ticks(total / 1000);
        const paraColor = config.paraColor || '#FF0000';
        const tickColor = config.tickColor || '#FFFFFF';
        const barBgColor = config.barBgColor || '#404e6d';
        return [
            { tag: 'Line', y: 40, width: 700, strokeWidth: 8, stroke: barBgColor, strokeCap: 'round' },
            { tag: 'Line', y: 40, width: 0, strokeWidth: 8, stroke: config.progressColor || '#FFFFFF' },
            { tag: 'Line', y: 40, width: 0, strokeWidth: 8, stroke: paraColor, strokeCap: 'round' },
            {
                tag: 'Box', y: 40, lockRatio: true, rotation: 0, resizeChildren: true,
                children: ticks.map(t => ({
                    tag: 'Line', x: t.x, y: 0, width: 6, strokeWidth: 30, stroke: t.isLast ? paraColor : tickColor
                }))
            },
            {
                tag: 'Box', lockRatio: true, rotation: 0, resizeChildren: true,
                children: [
                    { tag: 'Path', x: 730, y: 19, scale: 0.2, path: go_board_strokes, rotation: 90, flowAlign: 'bottom', fill: '#FFFFFF' },
                    { tag: 'Path', x: 730, y: 19, scale: 0.2, path: go_board_black_cells, rotation: 90, flowAlign: 'bottom', fill: barBgColor }
                ]
            },
            {
                tag: 'Box', y: 40, lockRatio: true, resizeChildren: true,
                children: [
                    { tag: 'Polygon', width: 30, height: 30, x: 0, y: 0, sides: 6, cornerRadius: 3, around: 'center', fill: '#FFFFFF', rotation: 90 },
                    { tag: 'Polygon', width: 20, height: 20, x: 0, y: 0, sides: 6, cornerRadius: 3, around: 'center', fill: config.dotColor || '#FF0000', rotation: 90 }
                ]
            }
        ];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 6) return;
        const total = ctx.trkptData?.[ctx.maxFrame - 1]?.distance || 0;
        if (!total) return;
        const jdtcd = ((frameData.distance || 0) / total) * box.children[0].width;
        box.children[1].width = jdtcd;
        box.children[5].x = jdtcd;
        const tickStepX = box.children[3]?.children?.[0]?.x || 0;
        box.children[2].width = tickStepX !== 0 ? Math.trunc(jdtcd / tickStepX) * tickStepX : 0;
        box.children[5].children[1].opacity = (ctx.currentFrame % 2 === 0) ? 0.7 : 1;
    }
};

// ============================================================
// 3. 行进/总距离文本（zs8_distancetext_pan）
// ============================================================
const zs8_distancetext_pan = {
    id: 'zs8_distancetext_pan',
    name: 'Distance Text',
    category: 'distance',
    icon: './images/l11.png',
    defaultConfig: { x: 30, y: 110, width: 200, height: 50, textColor: '#FFFFFF' },
    dataBindings: ['distance'],
    settings: [
        { name: 'Distance Text', type: 'title' },
        { name: 'Text color', key: 'textColor', type: 'color' }
    ],
    build(config) {
        return [{
            tag: 'Text', width: 200, resizeFontSize: true, fontSize: 26, fontWeight: 'black',
            text: '--', fill: config.textColor || '#FFFFFF', textAlign: 'right', verticalAlign: 'top', shadow: textshadow
        }];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || !box.children[0]) return;
        const total = ctx.trkptData?.[ctx.maxFrame - 1]?.distance || 0;
        const maxKm = Math.round((total || 0) / 1000 * 100) / 100;
        box.children[0].text = `${kmOf(frameData)}/${maxKm}Km`;
    }
};

// ============================================================
// 4. 行进百分比文本（zs8_distancepercent_pan）
// ============================================================
const zs8_distancepercent_pan = {
    id: 'zs8_distancepercent_pan',
    name: 'Distance Percent',
    category: 'distance',
    icon: './images/l10.png',
    defaultConfig: { x: 30, y: 150, width: 200, height: 50, textColor: '#FFFFFF' },
    dataBindings: ['distance'],
    settings: [
        { name: 'Distance Percent', type: 'title' },
        { name: 'Text color', key: 'textColor', type: 'color' }
    ],
    build(config) {
        return [{
            tag: 'Text', width: 200, resizeFontSize: true, fontSize: 26, fontWeight: 'black',
            text: '--', fill: config.textColor || '#FFFFFF', textAlign: 'right', verticalAlign: 'top', shadow: textshadow
        }];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || !box.children[0]) return;
        const total = ctx.trkptData?.[ctx.maxFrame - 1]?.distance || 0;
        let percentValue = 0;
        if (total && !isNaN(total)) percentValue = ((frameData.distance || 0) / total) * 100;
        box.children[0].text = percentValue.toFixed(2) + '%';
    }
};

export const rulerPanels = [
    zh_distance_pan,
    zs8_distance_pan,
    zs8_distancetext_pan,
    zs8_distancepercent_pan
];

export default rulerPanels;
