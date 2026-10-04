/**
 * definitions/simpleTextPanels.js - 简单文本类组件批量定义
 * 从老款程序 widget.js 迁移，含正确图标映射与逐帧 update 逻辑
 *
 * 覆盖：
 *   Time 分类：text_day_pan, text_time_pan, text_nowtime_pan,
 *              appv_nowtime_pan, text_countdown_pan
 *   Dist. 分类：text_gain_pan, text_loss_pan
 */

import { timestampToDateString, secondsToHHMMSS } from '../../utils/format.js';

// 老款程序统一文字阴影
const textshadow = { x: 2, y: 2, blur: 0, color: '#333333' };

// 画布尺寸（1920x1080），用于计算默认位置
const W = 1920;
const H = 1080;

/** 通用：生成一个居左大号文本子元素配置 */
function bigText(text, fontSize, color) {
    return {
        tag: 'Text',
        resizeFontSize: true,
        fontSize: fontSize,
        fontWeight: 'black',
        text: text,
        fill: color || '#FFFFFF',
        textAlign: 'left',
        verticalAlign: 'top',
        shadow: textshadow
    };
}

/** 通用：文本颜色设置项 */
const colorSettings = (title) => [
    { name: title, type: 'title' },
    { name: 'Text color', key: 'textColor', type: 'color' }
];

// ============================================================
// 1. 日期（年-月-日）
// ============================================================
const text_day_pan = {
    id: 'text_day_pan',
    name: 'Date',
    category: 'time',
    icon: './images/m2.png',
    defaultConfig: { x: W - 400, y: H - 100, width: 350, height: 100, textColor: '#FFFFFF', fontSize: 52.5 },
    dataBindings: ['timestamp'],
    settings: colorSettings('Date'),
    build(config) {
        return [bigText('--', config.fontSize || 52.5, config.textColor)];
    },
    update(box, frameData) {
        if (!box.children || !box.children[0] || !frameData.timestamp) return;
        box.children[0].text = timestampToDateString(frameData.timestamp, 1);
    }
};

// ============================================================
// 2. 时刻（时:分:秒）
// ============================================================
const text_time_pan = {
    id: 'text_time_pan',
    name: 'Time',
    category: 'time',
    icon: './images/m3.png',
    defaultConfig: { x: W - 400, y: H - 200, width: 350, height: 100, textColor: '#FFFFFF', fontSize: 72 },
    dataBindings: ['timestamp'],
    settings: colorSettings('NowTime'),
    build(config) {
        return [bigText('--', config.fontSize || 72, config.textColor)];
    },
    update(box, frameData) {
        if (!box.children || !box.children[0] || !frameData.timestamp) return;
        box.children[0].text = timestampToDateString(frameData.timestamp, 0);
    }
};

// ============================================================
// 3. 运动已用时长（Elapsed Time，大号）
// ============================================================
const text_nowtime_pan = {
    id: 'text_nowtime_pan',
    name: 'Sport ET',
    category: 'time',
    icon: './images/m4.png',
    defaultConfig: { x: W - 400, y: H - 300, width: 350, height: 100, textColor: '#FFFFFF', fontSize: 72 },
    dataBindings: ['sec'],
    settings: colorSettings('Elapsedtime'),
    build(config) {
        return [bigText('--', config.fontSize || 72, config.textColor)];
    },
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = secondsToHHMMSS(frameData.sec || 0);
    }
};

// ============================================================
// 4. 运动已用时长（右上角小面板，带底色）
// ============================================================
const appv_nowtime_pan = {
    id: 'appv_nowtime_pan',
    name: 'Sport ET',
    category: 'time',
    icon: './images/m5.png',
    defaultConfig: {
        x: W - 150, y: 15, width: 140, height: 46,
        cornerRadius: 8, fill: '#CCEEFF', textColor: '#191970', fontSize: 28
    },
    dataBindings: ['sec'],
    settings: [
        { name: 'Sport ET', type: 'title' },
        { name: 'Background color', key: 'fill', type: 'color' },
        { name: 'Text color', key: 'textColor', type: 'color' }
    ],
    build(config) {
        return [{
            name: 'now_time',
            tag: 'Text',
            resizeFontSize: true,
            width: 130,
            x: 0,
            y: 4,
            fontSize: config.fontSize || 28,
            fontWeight: 'black',
            text: '00:00:00',
            fill: config.textColor || '#191970',
            textAlign: 'right',
            verticalAlign: 'top'
        }];
    },
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = secondsToHHMMSS(frameData.sec || 0);
    }
};

// ============================================================
// 5. 运动倒计时（剩余时长）
// ============================================================
const text_countdown_pan = {
    id: 'text_countdown_pan',
    name: 'Countdown',
    category: 'time',
    icon: './images/m4.png',
    defaultConfig: { x: W - 400, y: H - 400, width: 350, height: 100, textColor: '#FFFFFF', fontSize: 72 },
    dataBindings: ['sec'],
    settings: colorSettings('Countdown'),
    build(config) {
        return [bigText('--', config.fontSize || 72, config.textColor)];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || !box.children[0]) return;
        const trkpt = ctx.trkptData;
        const totalSec = trkpt && trkpt[ctx.maxFrame - 1] ? trkpt[ctx.maxFrame - 1].sec : 0;
        const remain = Math.max(0, (totalSec || 0) - (frameData.sec || 0));
        box.children[0].text = secondsToHHMMSS(remain);
    }
};

// ============================================================
// 6. 累计爬升
// ============================================================
const text_gain_pan = {
    id: 'text_gain_pan',
    name: 'Gain',
    category: 'distance',
    icon: './images/l7.png',
    defaultConfig: { x: W - 400, y: H - 200, width: 350, height: 100, textColor: '#FFFFFF', fontSize: 52.5 },
    dataBindings: ['Gain'],
    settings: colorSettings('Gain'),
    build(config) {
        return [bigText('Gain: 0 m', config.fontSize || 52.5, config.textColor)];
    },
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = `Gain: ${parseInt(frameData.Gain || 0)} m`;
    }
};

// ============================================================
// 7. 累计下降
// ============================================================
const text_loss_pan = {
    id: 'text_loss_pan',
    name: 'Loss',
    category: 'distance',
    icon: './images/l8.png',
    defaultConfig: { x: W - 400, y: H - 150, width: 350, height: 100, textColor: '#FFFFFF', fontSize: 52.5 },
    dataBindings: ['Loss'],
    settings: colorSettings('Loss'),
    build(config) {
        return [bigText('Loss: 0 m', config.fontSize || 52.5, config.textColor)];
    },
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = `Loss: ${parseInt(frameData.Loss || 0)} m`;
    }
};

export const simpleTextPanels = [
    text_day_pan,
    text_time_pan,
    text_nowtime_pan,
    appv_nowtime_pan,
    text_countdown_pan,
    text_gain_pan,
    text_loss_pan
];

export default simpleTextPanels;
