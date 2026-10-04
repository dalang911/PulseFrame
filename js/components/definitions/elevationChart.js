/**
 * definitions/elevationChart.js - 高程图表组件（pt_ele_pan）
 */
import { mountain_icon } from '../../utils/icons.js';
import { resizeScale, plotInsets } from '../../utils/math.js';

// 设计绘图区尺寸与内缩边距（与 heart/paceChart 一致，避免放大后刻度线/圆点越界）
const W = 400, H = 200, PADX = 14, PADY = 18;

export default {
    id: 'pt_ele_pan',
    name: 'Elevation Chart',
    category: 'chart',
    icon: './images/t5.png',
    defaultConfig: {
        x: 80,
        y: 350,
        width: 400,
        height: 200,
        cornerRadius: 8,
        colors: {
            ruler: '#FFFFFF',
            rulerText: '#FFFFFF',
            line: '#8B4513',
            fill: 'rgba(139,69,19,0.3)',
            progress: '#FFFFFF',
            dot: '#ffde7d'
        },
        strokeWidth: { ruler: 5, line: 3, progress: 4 }
    },
    dataBindings: ['altitude'],
    settings: [
        { name: 'Elevation Chart', type: 'title' },
        { name: 'Ruler color', key: 'colors.ruler', type: 'color' },
        { name: 'Ruler text color', key: 'colors.rulerText', type: 'color' },
        { name: 'Elevation line thickness', key: 'strokeWidth.line', type: 'number', min: 1, max: 10 },
        { name: 'Elevation line color', key: 'colors.line', type: 'color' },
        { name: 'Progress line thickness', key: 'strokeWidth.progress', type: 'number', min: 1, max: 10 },
        { name: 'Progress line color', key: 'colors.progress', type: 'color' },
        { name: 'Progress dot color', key: 'colors.dot', type: 'color' }
    ],

    build(config, data) {
        const chartData = data?._chartData || {};
        const eleMin = chartData.eleMin || 0;
        const eleMax = chartData.eleMax || 100;
        const elePoints = chartData.pt_ele_points || [];
        const inset = plotInsets(W, H, PADX, PADY);

        return [
            // 标尺线
            { tag: 'Line', lockRatio: true, x: inset.x(0), y: inset.y(0), width: inset.x(W) - inset.x(0), strokeWidth: config.strokeWidth.ruler, stroke: config.colors.ruler, dashPattern: [10, 10] },
            { tag: 'Line', lockRatio: true, points: [inset.x(0), inset.y(100), inset.x(W), inset.y(100)], width: inset.x(W) - inset.x(0), strokeWidth: config.strokeWidth.ruler, stroke: config.colors.ruler, dashPattern: [10, 10] },
            { tag: 'Line', lockRatio: true, points: [inset.x(0), inset.y(H), inset.x(W), inset.y(H)], width: inset.x(W) - inset.x(0), strokeWidth: config.strokeWidth.ruler, stroke: config.colors.ruler, dashPattern: [10, 10] },
            // Y轴标签
            { tag: 'Text', resizeFontSize: true, x: -6, y: inset.y(0), fontSize: 20, fontWeight: 'black', text: String(Math.round(eleMax)), fill: config.colors.rulerText, textAlign: 'right', verticalAlign: 'middle' },
            { tag: 'Text', resizeFontSize: true, x: -6, y: inset.y(100), fontSize: 20, fontWeight: 'black', text: String(Math.round((eleMax + eleMin) / 2)), fill: config.colors.rulerText, textAlign: 'right', verticalAlign: 'middle' },
            { tag: 'Text', resizeFontSize: true, x: -6, y: inset.y(H), fontSize: 20, fontWeight: 'black', text: String(Math.round(eleMin)), fill: config.colors.rulerText, textAlign: 'right', verticalAlign: 'middle' },
            // 高程曲线
            { tag: 'Line', lockRatio: true, points: inset.points(elePoints), strokeWidth: config.strokeWidth.line, stroke: config.colors.line, strokeCap: 'round' },
            // 竖向进度线
            { name: 'metrics', tag: 'Line', lockRatio: true, x: inset.x(50), y: inset.y(0), width: inset.y(H) - inset.y(0), rotation: 90, fill: 'blue', strokeWidth: config.strokeWidth.progress, stroke: config.colors.progress, strokeCap: 'round' },
            // 右下角图标
            { tag: 'Rect', x: 360, y: 160, scale: 0.04, path: mountain_icon, fill: config.colors.line },
            // 当前高程文本
            { tag: 'Text', resizeFontSize: true, x: 55, y: inset.y(H) - 16, fontSize: 24, fontWeight: 'black', text: '--', fill: config.colors.rulerText, textAlign: 'left', verticalAlign: 'middle' },
            // 进度圆点
            { tag: 'Ellipse', lockRatio: true, around: 'center', x: inset.x(50), y: inset.y(100), width: 13, height: 13, fill: config.colors.dot }
        ];
    },

    update(box, frameData, progress, ctx) {
        const children = box.children;
        if (!children || children.length < 11) return;

        const chartData = ctx.chartData || {};
        const elePoints = chartData.pt_ele_points || [];
        // 曲线由 resizeChildren 整体缩放，进度线/圆点/文本用「渲染像素」位置，需乘缩放比对齐
        const scale = resizeScale(box, W, H);
        const inset = plotInsets(W, H, PADX, PADY);

        // 当前高程文本 (children[9])
        children[9].text = String(Math.round(frameData.altitude || 0));

        const i = ctx.currentFrame;
        if (elePoints.length > i * 2 + 1) {
            // 圆点落在缩放后的曲线上（同 build 用 inset 坐标）
            const dx = inset.x(elePoints[i * 2]) * scale.x;
            const dy = inset.y(elePoints[i * 2 + 1]) * scale.y;
            // 竖向进度线：x 随时间横扫
            children[7].x = dx;
            children[9].x = dx + 5 * scale.x;
            children[10].x = dx;
            children[10].y = dy;
        }
    }
};
