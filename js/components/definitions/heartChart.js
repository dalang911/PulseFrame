/**
 * definitions/heartChart.js - 心率图表组件（pt_heart_pan）
 */
import { heart_icon } from '../../utils/icons.js';
import { mapToRange, resizeScale, plotInsets } from '../../utils/math.js';

// 设计绘图区尺寸与内缩边距：刻度线/曲线/圆点不铺满到边界，放大后留白随缩放同比放大不越界
const W = 400, H = 200, PADX = 14, PADY = 18;

export default {
    id: 'pt_heart_pan',
    name: 'Heart Chart',
    category: 'chart',
    icon: './images/t3.png',
    defaultConfig: {
        x: 80,
        y: 850,
        width: 400,
        height: 200,
        cornerRadius: 8,
        colors: {
            ruler: '#FFFFFF',
            rulerText: '#FFFFFF',
            line: '#C71585',
            progress: '#FFFFFF',
            dot: '#ffde7d',
            heartIcon: '#C71585'
        },
        strokeWidth: { ruler: 5, line: 3, progress: 4 }
    },
    dataBindings: ['heart_rate'],
    settings: [
        { name: 'Heart Chart', type: 'title' },
        { name: 'Ruler color', key: 'colors.ruler', type: 'color' },
        { name: 'Ruler text color', key: 'colors.rulerText', type: 'color' },
        { name: 'Heart line thickness', key: 'strokeWidth.line', type: 'number', min: 1, max: 10 },
        { name: 'Heart line color', key: 'colors.line', type: 'color' },
        { name: 'Progress line thickness', key: 'strokeWidth.progress', type: 'number', min: 1, max: 10 },
        { name: 'Progress line color', key: 'colors.progress', type: 'color' },
        { name: 'Progress dot color', key: 'colors.dot', type: 'color' }
    ],

    build(config, data) {
        const chartData = data?._chartData || {};
        const hrMax = chartData.heartRateMax || 180;
        const hrMin = chartData.heartRateMin || 60;
        const heartPoints = chartData.pt_heart_points || [];
        const inset = plotInsets(W, H, PADX, PADY);

        return [
            // 3条水平虚线标尺
            { tag: 'Line', lockRatio: true, x: inset.x(0), y: inset.y(0), width: inset.x(W) - inset.x(0), strokeWidth: config.strokeWidth.ruler, stroke: config.colors.ruler, dashPattern: [10, 10] },
            { tag: 'Line', lockRatio: true, points: [inset.x(0), inset.y(100), inset.x(W), inset.y(100)], width: inset.x(W) - inset.x(0), strokeWidth: config.strokeWidth.ruler, stroke: config.colors.ruler, dashPattern: [10, 10] },
            { tag: 'Line', lockRatio: true, points: [inset.x(0), inset.y(H), inset.x(W), inset.y(H)], width: inset.x(W) - inset.x(0), strokeWidth: config.strokeWidth.ruler, stroke: config.colors.ruler, dashPattern: [10, 10] },
            // Y轴标签
            { tag: 'Text', resizeFontSize: true, x: -6, y: inset.y(0), fontSize: 20, fontWeight: 'black', text: String(hrMax), fill: config.colors.rulerText, textAlign: 'right', verticalAlign: 'middle' },
            { tag: 'Text', resizeFontSize: true, x: -6, y: inset.y(100), fontSize: 20, fontWeight: 'black', text: String(Math.round((hrMax + hrMin) / 2)), fill: config.colors.rulerText, textAlign: 'right', verticalAlign: 'middle' },
            { tag: 'Text', resizeFontSize: true, x: -6, y: inset.y(H), fontSize: 20, fontWeight: 'black', text: String(hrMin), fill: config.colors.rulerText, textAlign: 'right', verticalAlign: 'middle' },
            // 心率曲线
            { tag: 'Line', lockRatio: true, points: inset.points(heartPoints), cornerRadius: 1, strokeWidth: config.strokeWidth.line, stroke: config.colors.line, strokeCap: 'round' },
            // 竖向进度线（x 随帧横扫，长度=绘图区高）
            { name: 'metrics', tag: 'Line', lockRatio: true, x: inset.x(50), y: inset.y(0), width: inset.y(H) - inset.y(0), rotation: 90, fill: 'blue', strokeWidth: config.strokeWidth.progress, stroke: config.colors.progress, strokeCap: 'round' },
            // 心率图标
            { tag: 'Rect', x: 360, y: 160, scale: 0.03, path: heart_icon, fill: config.colors.heartIcon },
            // 当前心率文本
            { tag: 'Text', resizeFontSize: true, x: 55, y: inset.y(H) - 16, fontSize: 24, fontWeight: 'black', text: '--', fill: config.colors.rulerText, textAlign: 'left', verticalAlign: 'middle' },
            // 进度点
            { tag: 'Ellipse', lockRatio: true, around: 'center', x: inset.x(50), y: inset.y(100), width: 13, height: 13, fill: config.colors.dot }
        ];
    },

    update(box, frameData, progress, ctx) {
        const children = box.children;
        if (!children || children.length < 11) return;

        // 曲线(children[6])由 resizeChildren 整体缩放；进度线/圆点/文本用的是「渲染像素」位置，
        // 需乘缩放比才能落在缩放后的曲线上。
        const scale = resizeScale(box, W, H);
        const inset = plotInsets(W, H, PADX, PADY);
        const chartData = ctx.chartData || {};
        const heartPoints = chartData.pt_heart_points || [];

        // 更新当前心率文本 (children[9])
        children[9].text = String(frameData.heart_rate || 0);

        const i = ctx.currentFrame;
        if (heartPoints.length > i * 2 + 1) {
            // 圆点落在缩放后的曲线上（同 build 用 inset 坐标）：around:center 已居中
            const dx = inset.x(heartPoints[i * 2]) * scale.x;
            const dy = inset.y(heartPoints[i * 2 + 1]) * scale.y;
            // 竖向进度线：x 随时间横扫，长度交给 resizeChildren 铺满高度
            children[7].x = dx;
            children[9].x = dx + 5 * scale.x;
            children[10].x = dx;
            children[10].y = dy;
        }
    }
};
