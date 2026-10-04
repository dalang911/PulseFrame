/**
 * definitions/distance.js - 距离进度条组件
 * 包含多个变体：appv_distance_pan, l_distance_pan, lite_distance_pan, zs8_distance_pan
 */

import { resizeScale } from '../../utils/math.js';

export default {
    id: 'appv_distance_pan',
    name: 'Distance',
    category: 'distance',
    icon: './images/l2.png',
    defaultConfig: {
        x: 80,
        y: 20,
        width: 260,
        height: 46,
        cornerRadius: 4,
        colors: {
            bg: '#191970',
            progressbg: '#00FA9A',
            progress: '#FFFF00',
            text: '#FFFFFF'
        }
    },
    dataBindings: ['distance'],
    settings: [
        { name: 'Distance Bar', type: 'title' },
        { name: 'Background color', key: 'colors.bg', type: 'color' },
        { name: 'progress Background color', key: 'colors.progressbg', type: 'color' },
        { name: 'Progress color', key: 'colors.progress', type: 'color' },
        { name: 'Text color', key: 'colors.text', type: 'color' }
    ],

    build(config, data) {
        const totalKm = data?.data?.motion?.distance
            ? (data.data.motion.distance / 1000).toFixed(2)
            : '0';

        // 设计基准：defaultConfig 260x46。画布拖拽缩放由外层 Box.resizeChildren 等比放大子元素，
        // Text 必须带 resizeFontSize 字号才会跟随；进度条可用宽度按外框宽度推导，右侧留 10 边距，
        // 避免缩放后固定 140 与外框脱节
        const barX = 110;
        const barW = Math.max(config.width - barX - 10, 1);

        return [
            // 背景
            { tag: 'Rect', width: config.width, height: config.height, fill: config.colors.bg, cornerRadius: config.cornerRadius },
            // 总距离
            { tag: 'Text', x: 100, y: 10, resizeFontSize: true, fontSize: 20, fontWeight: 'black', textAlign: 'right', text: `${totalKm}Km`, fill: config.colors.text },
            // 图标
            { tag: 'Text', x: 105, y: 2, resizeFontSize: true, fontSize: 28, fontWeight: 'black', textAlign: 'center', text: '|', fill: config.colors.text },
            // 距离文本
            { tag: 'Text', x: 250, y: 0, resizeFontSize: true, fontSize: 28, fontWeight: 'black', textAlign: 'right', text: `0Km`, fill: config.colors.text },
            // 进度条背景
            { tag: 'Rect', x: barX, y: 34, width: barW, height: 8, fill: config.colors.progressbg, cornerRadius: 4 },
            // 进度条前景
            { tag: 'Rect', x: barX, y: 34, width: 0, height: 8, fill: config.colors.progress, cornerRadius: 4 }
        ];
    },

    update(box, frameData, progress, ctx) {
        const children = box.children;
        if (!children || children.length < 5) return;

        const totalDistance = ctx.trkptData[ctx.maxFrame - 1]?.distance || 1;
        const currentDistance = frameData.distance || 0;
        const distanceKm = (currentDistance / 1000).toFixed(2);

        // 更新距离文本
        children[3].text = `${distanceKm}Km`;

        // 更新进度条宽度：resizeChildren 只改子元素宽高、不回写 config，
        // 需用「当前宽度 / 设计宽度」换算出变形后的 px 空间，再乘比例写回前景条
        const scale = resizeScale(box, this.defaultConfig.width, this.defaultConfig.height);
        const designBarW = Math.max(this.defaultConfig.width - 110 - 10, 1);
        children[5].width = (currentDistance / totalDistance) * designBarW * scale.x;
    }
};
