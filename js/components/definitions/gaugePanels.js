/**
 * definitions/gaugePanels.js - 仪表盘组件批量定义
 * 从老款程序 widget.js 迁移：el_ 系列（24px 环）+ x_ 系列（180° 弧线小环）
 *
 * 覆盖：
 *   el_heart_pan, el_pace_pan, el_cadence_pan, el_speed_pan(cycling)
 *   x_heart_pan, x_pace_pan, x_cadence_pan, x_speed_pan, x_rpm_pan, x_power_pan
 *   （x_speed / x_rpm / x_power 在 Attr + Cycling 两个 Tab 重复出现）
 */

import { speedToPace } from '../../utils/format.js';
import { unitConfig } from '../../core/UnitConfig.js';

// ============================================================
// el_ 系列：大环仪表（startAngle -210 → endAngle 30，strokeWidth 24）
// ============================================================
function makeElGauge({ id, name, icon, x, unit, unitKey, valueFontSize, dataBindings, update }) {
    // 优先取全局单位配置的后缀（未配置则回退到定义时的默认 unit）
    const unitText = () => (unitKey ? (unitConfig.suffixOf(unitKey) || unit) : unit);
    return {
        id,
        name,
        category: id === 'el_speed_pan' ? 'cycling' : 'attr',
        icon: `./images/${icon}.png`,
        defaultConfig: {
            x, y: 800, width: 200, height: 200,
            textColor: '#FFFFFF', unitColor: '#FFFFFF',
            ringBg: '#CCCCCC', ringFg: '#FF7F00'
        },
        dataBindings,
        settings: [
            { name, type: 'title' },
            { name: 'Text color', key: 'textColor', type: 'color' },
            { name: 'Unit color', key: 'unitColor', type: 'color' },
            { name: 'Graphic backgrounds', key: 'ringBg', type: 'color' },
            { name: 'Graphic color', key: 'ringFg', type: 'color' }
        ],
        build(config) {
            return [
                {
                    tag: 'Text', y: 50, x: 100, resizeFontSize: true,
                    fontSize: valueFontSize, fontWeight: 'black', text: '--',
                    fill: config.textColor || '#FFFFFF', textAlign: 'center', verticalAlign: 'top'
                },
                {
                    tag: 'Text', y: 150, x: 100, resizeFontSize: true,
                    fontSize: 32, fontWeight: 'black', text: unitText(),
                    fill: config.unitColor || '#FFFFFF', textAlign: 'center', verticalAlign: 'top'
                },
                {
                    tag: 'Ellipse', width: 200, height: 200,
                    startAngle: -210, endAngle: 30, innerRadius: 1, closed: false,
                    stroke: config.ringBg || '#CCCCCC', strokeWidth: 24,
                    strokeWidthFixed: false, strokeAlign: 'center', strokeCap: 'round'
                },
                {
                    tag: 'Ellipse', width: 200, height: 200,
                    startAngle: -210, endAngle: 30, innerRadius: 1, closed: false,
                    stroke: config.ringFg || '#FF7F00', strokeWidth: 24,
                    strokeWidthFixed: false, strokeAlign: 'center', strokeCap: 'round'
                }
            ];
        },
        update(box, frameData, progress, ctx) {
            update(box, frameData, progress, ctx);
            // 同步单位行（支持用户自定义后缀）
            if (box.children && box.children[1]) box.children[1].text = unitText();
        }
    };
}

// ============================================================
// x_ 系列：180° 弧线仪表（-150 → 30，标题/单位/值三段文本 + 底/进度环）
// ============================================================

/** 线性映射到角度区间（老程序通用逻辑：min→-150, max→30，越界截断） */
function angleFor(value, min, max) {
    const minEnd = -150, maxEnd = 30;
    const span = max - min;
    if (!(span > 0)) return minEnd;
    const a = minEnd + ((value - min) / span) * (maxEnd - minEnd);
    return Math.max(minEnd, Math.min(maxEnd, a));
}

function makeXGauge({ id, name, icon, x, categories, unit, unitKey, title, dataBindings, update }) {
    const unitText = () => (unitKey ? (unitConfig.suffixOf(unitKey) || unit) : unit);
    return {
        id,
        name,
        category: 'attr',
        ...(categories ? { categories } : {}),
        icon: `./images/${icon}.png`,
        defaultConfig: {
            x, y: 800, width: 200, height: 200, cornerRadius: 4,
            textColor: '#FFFFFF', labelColor: '#CCCCCC',
            ringBg: '#CCCCCC', ringFg: '#FFFFFF'
        },
        dataBindings,
        settings: [
            { name, type: 'title' },
            { name: 'Text color', key: 'textColor', type: 'color' },
            { name: 'Label color', key: 'labelColor', type: 'color' },
            { name: 'Graphic backgrounds', key: 'ringBg', type: 'color' },
            { name: 'Graphic color', key: 'ringFg', type: 'color' }
        ],
        build(config) {
            return [
                {
                    tag: 'Text', y: 55, x: 100, resizeFontSize: true,
                    fontSize: 46, fontWeight: 'black', text: '--:--',
                    fill: config.textColor || '#FFFFFF', textAlign: 'center', verticalAlign: 'center'
                },
                {
                    tag: 'Text', y: 115, x: 100, resizeFontSize: true,
                    fontSize: 28, fontWeight: 'black', text: unitText(),
                    fill: config.labelColor || '#CCCCCC', textAlign: 'center', verticalAlign: 'center'
                },
                {
                    tag: 'Text', y: 25, x: 100, resizeFontSize: true,
                    fontSize: 28, fontWeight: 'black', text: title,
                    fill: config.labelColor || '#CCCCCC', textAlign: 'center', verticalAlign: 'center'
                },
                {
                    tag: 'Ellipse', width: 200, height: 200,
                    startAngle: -150, endAngle: 30, innerRadius: 1, closed: false,
                    stroke: config.ringBg || '#CCCCCC', strokeWidth: 9,
                    strokeAlign: 'center', strokeCap: 'round'
                },
                {
                    tag: 'Ellipse', width: 200, height: 200,
                    startAngle: -150, endAngle: 30, innerRadius: 1, closed: false,
                    stroke: config.ringFg || '#FFFFFF', strokeWidth: 10,
                    strokeAlign: 'center', strokeCap: 'round'
                }
            ];
        },
        update(box, frameData, progress, ctx) {
            update(box, frameData, progress, ctx);
            // 同步单位行（支持用户自定义后缀）
            if (box.children && box.children[1]) box.children[1].text = unitText();
        }
    };
}

/** 派生公共显示值 */
function derive(frameData) {
    const speed = frameData.speed || 0;
    return {
        speed,
        pace: speedToPace(speed),
        heart_rate: frameData.heart_rate || 0,
        cadence: frameData.cadence || 0,
        power: frameData.power || 0
    };
}

// ============================================================
// el_ 系列实例
// ============================================================

// 心率：hr<40 取 40，系数 1.33
const el_heart_pan = makeElGauge({
    id: 'el_heart_pan', name: 'Heart Gauge', icon: 'z5', x: 100,
    unit: 'bpm', unitKey: 'heart_rate', valueFontSize: 64, dataBindings: ['heart_rate'],
    update(box, frameData) {
        if (!box.children || box.children.length < 4) return;
        const d = derive(frameData);
        box.children[0].text = unitConfig.formatPrefixed('heart_rate', d.heart_rate);
        let hr = d.heart_rate < 40 ? 40 : d.heart_rate;
        box.children[3].endAngle = -210 + (hr - 40) * 1.33;
    }
});

// 配速：系数 10.9（用速度驱动角度）
const el_pace_pan = makeElGauge({
    id: 'el_pace_pan', name: 'Pace Gauge', icon: 'z6', x: 400,
    unit: 'min/km', unitKey: 'pace', valueFontSize: 54, dataBindings: ['speed'],
    update(box, frameData) {
        if (!box.children || box.children.length < 4) return;
        const d = derive(frameData);
        box.children[0].text = unitConfig.formatPrefixed('pace', d.pace);
        box.children[3].endAngle = -210 + d.speed * 10.9;
    }
});

// 步频：max 240，系数 1
const el_cadence_pan = makeElGauge({
    id: 'el_cadence_pan', name: 'Cadence Gauge', icon: 'z7', x: 700,
    unit: 'step/min', unitKey: 'cadence', valueFontSize: 64, dataBindings: ['cadence'],
    update(box, frameData) {
        if (!box.children || box.children.length < 4) return;
        const d = derive(frameData);
        box.children[0].text = unitConfig.formatPrefixed('cadence', d.cadence);
        box.children[3].endAngle = -210 + d.cadence * 1;
    }
});

// 速度（Cycling）：max 60，系数 3.5
const el_speed_pan = makeElGauge({
    id: 'el_speed_pan', name: 'Speed Gauge', icon: 'z11', x: 400,
    unit: 'km/h', unitKey: 'speed', valueFontSize: 54, dataBindings: ['speed'],
    update(box, frameData) {
        if (!box.children || box.children.length < 4) return;
        const d = derive(frameData);
        box.children[0].text = unitConfig.formatPrefixed('speed', d.speed);
        box.children[3].endAngle = -210 + d.speed * 3.5;
    }
});

// ============================================================
// x_ 系列实例（角度按全量数据 min/max 线性映射）
// ============================================================

// 心率
const x_heart_pan = makeXGauge({
    id: 'x_heart_pan', name: 'Heart', icon: 'x1', x: 800,
    unit: 'BPM', unitKey: 'heart_rate', title: 'HEART R', dataBindings: ['heart_rate'],
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 5) return;
        const d = derive(frameData);
        const cd = ctx.chartData || {};
        box.children[0].text = unitConfig.formatPrefixed('heart_rate', d.heart_rate);
        box.children[4].endAngle = angleFor(d.heart_rate, cd.heartRateMin || 0, cd.heartRateMax || 0);
    }
});

// 速度（Attr + Cycling）
const x_speed_pan = makeXGauge({
    id: 'x_speed_pan', name: 'Speed', icon: 'x6', x: 400,
    categories: ['cycling'],
    unit: 'KM/H', unitKey: 'speed', title: 'SPEED', dataBindings: ['speed'],
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 5) return;
        const d = derive(frameData);
        const cd = ctx.chartData || {};
        box.children[0].text = unitConfig.formatPrefixed('speed', d.speed);
        box.children[4].endAngle = angleFor(d.speed, cd.paceMin || 0, cd.paceMax || 0);
    }
});

// 配速（文本显示配速，角度用速度映射）
const x_pace_pan = makeXGauge({
    id: 'x_pace_pan', name: 'Pace', icon: 'x5', x: 400,
    unit: 'MIN/KM', unitKey: 'pace', title: 'PACE', dataBindings: ['speed'],
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 5) return;
        const d = derive(frameData);
        const cd = ctx.chartData || {};
        box.children[0].text = unitConfig.formatPrefixed('pace', d.pace);
        box.children[4].endAngle = angleFor(d.speed, cd.paceMin || 0, cd.paceMax || 0);
    }
});

// 步频
const x_cadence_pan = makeXGauge({
    id: 'x_cadence_pan', name: 'Cadence', icon: 'x4', x: 600,
    unit: 'STEPS', unitKey: 'cadence', title: 'CADENCE', dataBindings: ['cadence'],
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 5) return;
        const d = derive(frameData);
        const cd = ctx.chartData || {};
        box.children[0].text = unitConfig.formatPrefixed('cadence', d.cadence);
        box.children[4].endAngle = angleFor(d.cadence, cd.cadenceMin || 0, cd.cadenceMax || 0);
    }
});

// 踏频（Attr + Cycling，文本 = cadence/2，角度仍用 cadence）
const x_rpm_pan = makeXGauge({
    id: 'x_rpm_pan', name: 'Rpm', icon: 'x3', x: 600,
    categories: ['cycling'],
    unit: 'RPM', unitKey: 'rpm', title: 'CADENCE', dataBindings: ['cadence'],
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 5) return;
        const d = derive(frameData);
        const cd = ctx.chartData || {};
        box.children[0].text = unitConfig.formatPrefixed('rpm', (d.cadence / 2) | 0);
        box.children[4].endAngle = angleFor(d.cadence, cd.cadenceMin || 0, cd.cadenceMax || 0);
    }
});

// 功率（Attr + Cycling）
const x_power_pan = makeXGauge({
    id: 'x_power_pan', name: 'Power', icon: 'x2', x: 1000,
    categories: ['cycling'],
    unit: 'WATT', unitKey: 'power', title: 'POWER', dataBindings: ['power'],
    update(box, frameData, progress, ctx) {
        if (!box.children || box.children.length < 5) return;
        const d = derive(frameData);
        const cd = ctx.chartData || {};
        box.children[0].text = unitConfig.formatPrefixed('power', Math.trunc(d.power));
        box.children[4].endAngle = angleFor(d.power, cd.powerMin || 0, cd.powerMax || 0);
    }
});

export const gaugePanels = [
    el_heart_pan,
    el_pace_pan,
    el_cadence_pan,
    el_speed_pan,
    x_heart_pan,
    x_speed_pan,
    x_pace_pan,
    x_cadence_pan,
    x_rpm_pan,
    x_power_pan
];

export default gaugePanels;
