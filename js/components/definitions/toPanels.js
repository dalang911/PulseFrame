/**
 * definitions/toPanels.js - TO_ 文本行面板组件批量定义
 * 从老款程序 widget.js 迁移（图标 + 数值文本行，y 从 290 起每行 50 高）
 *
 * 覆盖：TO_speed_pan, TO_pace_pan, TO_heart_pan, TO_cadence_pan,
 *       TO_step_pan, TO_rpm_pan, TO_power_pan, TO_gps_pan
 */

import {
    speed_icon, run_icon, heart_icon, cadence_icon,
    step_icon, rpm_icon, power_icon, gps_icon
} from '../../utils/icons.js';
import { speedToPace, convertToDMS } from '../../utils/format.js';
import { unitConfig } from '../../core/UnitConfig.js';

const textshadow = { x: 2, y: 2, blur: 0, color: '#333333' };

const W = 1920;
const H = 1080;

/**
 * 通用构建：数值行（Text + 图标 Rect）
 */
function rowChildren(iconPath, initText, opts = {}) {
    return [
        {
            tag: 'Text',
            y: 1,
            x: opts.textX || 55,
            width: opts.textWidth || 300,
            resizeFontSize: true,
            fontSize: opts.fontSize || 32,
            fontWeight: 'black',
            text: initText,
            fill: '#FFFFFF',
            textAlign: 'left',
            verticalAlign: 'top',
            shadow: textshadow
        },
        {
            tag: 'Rect',
            x: opts.iconX || 0,
            y: opts.iconY || 0,
            width: opts.iconBox || 30,
            height: opts.iconBox || 30,
            scale: opts.iconScale || 0.04,
            path: iconPath,
            fill: '#FF7F00'
        }
    ];
}

const rowSettings = [
    { name: 'Value Row', type: 'title' },
    { name: 'Text color', key: 'textColor', type: 'color' },
    { name: 'Icon color', key: 'iconColor', type: 'color' }
];

/** 通用：行面板 update 里的派生值 */
function derive(frameData) {
    const speed = frameData.speed || 0;
    return {
        speed,
        pace: speedToPace(speed),
        heart_rate: frameData.heart_rate || 0,
        cadence: frameData.cadence || 0,
        step_length: frameData.step_length || 0,
        power: frameData.power || 0
    };
}

/** 通用：创建行面板组件定义 */
function makeRowPanel({ id, name, icon, y, initText, iconPath, iconScale, iconX, iconY, dataBindings, update }) {
    return {
        id,
        name,
        category: 'text',
        icon: `./images/${icon}.png`,
        defaultConfig: { x: 330, y, width: 350, height: 50, cornerRadius: 4, textColor: '#FFFFFF', iconColor: '#FF7F00' },
        dataBindings,
        settings: rowSettings,
        build(config) {
            const children = rowChildren(iconPath, initText, { iconScale, iconX, iconY });
            children[0].fill = config.textColor || '#FFFFFF';
            children[1].fill = config.iconColor || '#FF7F00';
            return children;
        },
        update
    };
}

// ============================================================
// 1. 时速
// ============================================================
const TO_speed_pan = makeRowPanel({
    id: 'TO_speed_pan', name: 'Speed', icon: 'z9', y: 290,
    initText: 'Speed: km/h', iconPath: speed_icon, iconScale: 0.045,
    dataBindings: ['speed'],
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = unitConfig.format('speed', derive(frameData).speed);
    }
});

// ============================================================
// 2. 配速
// ============================================================
const TO_pace_pan = makeRowPanel({
    id: 'TO_pace_pan', name: 'Pace', icon: 'z1', y: 340,
    initText: 'Pace: km/h', iconPath: run_icon, iconScale: 0.05,
    dataBindings: ['speed'],
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = unitConfig.format('pace', derive(frameData).pace);
    }
});

// ============================================================
// 3. 心率（含心跳缩放动画）
// ============================================================
const TO_heart_pan = makeRowPanel({
    id: 'TO_heart_pan', name: 'Heart Rate', icon: 'z2', y: 390,
    initText: 'Heart Rate: bpm', iconPath: heart_icon, iconScale: 0.04, iconX: 3, iconY: 2,
    dataBindings: ['heart_rate'],
    update(box, frameData, progress, ctx) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = unitConfig.format('heart_rate', derive(frameData).heart_rate);
        // 心跳动画：偶数帧缩小、奇数帧还原
        if (box.children[1]) {
            box.children[1].scale = (ctx.currentFrame % 2 === 0) ? 0.038 : 0.04;
        }
    }
});

// ============================================================
// 4. 步频
// ============================================================
const TO_cadence_pan = makeRowPanel({
    id: 'TO_cadence_pan', name: 'Cadence', icon: 'z3', y: 440,
    initText: 'Cadence: steps/min', iconPath: cadence_icon, iconScale: 0.04, iconX: 3, iconY: 2,
    dataBindings: ['cadence'],
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = unitConfig.format('cadence', derive(frameData).cadence);
    }
});

// ============================================================
// 5. 步幅
// ============================================================
const TO_step_pan = makeRowPanel({
    id: 'TO_step_pan', name: 'Step', icon: 'z4', y: 490,
    initText: 'Step: m', iconPath: step_icon, iconScale: 0.04, iconX: 3, iconY: 2,
    dataBindings: ['step_length'],
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = unitConfig.format('step_length', derive(frameData).step_length);
    }
});

// ============================================================
// 6. 踏频（Rpm = cadence / 2）
// ============================================================
const TO_rpm_pan = makeRowPanel({
    id: 'TO_rpm_pan', name: 'Rpm', icon: 'z10', y: 540,
    initText: 'Rpm:', iconPath: rpm_icon, iconScale: 0.04, iconX: 3, iconY: 2,
    dataBindings: ['cadence'],
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = unitConfig.format('rpm', (derive(frameData).cadence / 2) | 0);
    }
});

// ============================================================
// 7. 功率（Text 分类 + Cycling 分类重复出现）
// ============================================================
const TO_power_pan = makeRowPanel({
    id: 'TO_power_pan', name: 'Power', icon: 'z12', y: 590,
    initText: 'Power: watt', iconPath: power_icon, iconScale: 0.04, iconX: 3, iconY: 2,
    dataBindings: ['power'],
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        box.children[0].text = unitConfig.format('power', Math.trunc(derive(frameData).power));
    }
});
TO_power_pan.categories = ['cycling'];

// ============================================================
// 8. 经纬度（大字号双行）
// ============================================================
const TO_gps_pan = {
    id: 'TO_gps_pan',
    name: 'GPS',
    category: 'text',
    icon: './images/w2.png',
    defaultConfig: { x: W - 400, y: H - 400, width: 400, height: 100, cornerRadius: 4, textColor: '#FFFFFF', iconColor: '#FF7F00' },
    dataBindings: ['position_lat', 'position_long'],
    settings: rowSettings,
    build(config) {
        const children = rowChildren(gps_icon, '--\n--', {
            textX: 75, textWidth: 350, fontSize: 30, iconScale: 0.06, iconY: 12, iconBox: 30
        });
        children[0].fill = config.textColor || '#FFFFFF';
        children[1].fill = config.iconColor || '#FF7F00';
        return children;
    },
    update(box, frameData) {
        if (!box.children || !box.children[0]) return;
        const lat = frameData.position_lat;
        const lon = frameData.position_long;
        if (lat == null || lon == null) return;
        box.children[0].text = `${convertToDMS(lat)}\n${convertToDMS(lon)}`;
    }
};

export const toPanels = [
    TO_speed_pan,
    TO_pace_pan,
    TO_heart_pan,
    TO_cadence_pan,
    TO_step_pan,
    TO_rpm_pan,
    TO_power_pan,
    TO_gps_pan
];

export default toPanels;
