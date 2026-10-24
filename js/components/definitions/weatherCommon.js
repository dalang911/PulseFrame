/**
 * definitions/weatherCommon.js - 两个天气面板的共用模块
 *
 * 方形 el_weather_pan 与横向 el_weather_wide_pan 共用：
 *   7 个天气图标路径 / 图标按钮组选项 / 渐变背景生成 / 子元素生成器 / 取值小工具
 * 组织方式照 chartCommon.js：模块只管「配置 → 子元素」，不碰 Leafer 实例。
 *
 * 硬约束（与 chartCommon 同一条纪律）：方形面板的每个新键默认值都必须等于升级前
 * build() 里写死的字面量，只带老配置时输出逐项一致 —— 「默认观感不变」。
 * 校验页 tools/weather-test.html 会把 HEAD 版 build() 的产物逐字比一遍。
 */

import {
    weather_sunny_icon,
    weather_cloudy_icon,
    weather_rain_icon,
    weather_fog_icon,
    weather_windy_icon,
    weather_snow_icon,
    weather_night_icon
} from '../../utils/icons.js';

// ============================================================
// 取值小工具（chartCommon 里同名的三个是模块私有的，这里照抄口径）
// ============================================================

/** 数字兜底：undefined / null / '' / NaN 一律回默认值（输入框清空后传的是 ''） */
export function num(v, d) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
}

/** 文本兜底：只有 undefined / null / 空串才回默认值（空串本身在颜色/文本里没意义） */
export function str(v, d) {
    return v === undefined || v === null || v === '' ? d : String(v);
}

/** 开关兜底：键不存在 = 老配置 = 打开（缺省即保持升级前的观感） */
export function on(v, d = true) {
    return v === undefined || v === null ? d : v !== false;
}

// ============================================================
// 图标
// ============================================================

/** 天气图标名 → SVG path（名称就是设置面板按钮上的文案，也是配置里的取值） */
export const WEATHER_ICONS = {
    sunny: weather_sunny_icon,
    cloudy: weather_cloudy_icon,
    rain: weather_rain_icon,
    fog: weather_fog_icon,
    windy: weather_windy_icon,
    snow: weather_snow_icon,
    night: weather_night_icon
};

export const WEATHER_ICON_KEYS = ['sunny', 'cloudy', 'rain', 'fog', 'windy', 'snow', 'night'];

/** 展示名（按钮文案 + showCondition 打开时面板上那行字） */
export const WEATHER_LABELS = {
    sunny: 'Sunny',
    cloudy: 'Cloudy',
    rain: 'Rain',
    fog: 'Fog',
    windy: 'Windy',
    snow: 'Snow',
    night: 'Night'
};

/**
 * 设置面板「Weather icon」按钮组的选项表。
 * 用 button_group 而不是 select：7 个候选一眼看全，换图标一次点击，不用展开下拉。
 */
export const WEATHER_ICON_OPTIONS = WEATHER_ICON_KEYS.map(key => ({
    label: WEATHER_LABELS[key],
    value: key
}));

/** 取图标路径；名称写错（老模板里的废弃值）退回 sunny，不画空 */
export function weatherIconPath(name) {
    return WEATHER_ICONS[str(name, 'sunny')] || WEATHER_ICONS.sunny;
}

/**
 * 各图标的自然尺寸（按 path 原始包围盒，浏览器实测 Rect 的 width/height）。
 * 只有横向面板要拿它算「圆盘里正好容得下图标」的基准缩放，方形面板用不上（直接给倍率）。
 */
export const WEATHER_ICON_NATURAL = {
    sunny: [782.569, 696.405],
    cloudy: [823.979, 691.008],
    rain: [834.229, 760.470],
    fog: [853.333, 788.480],
    windy: [805.675, 746.603],
    snow: [728.451, 805.931],
    night: [779.236, 789.333]
};

/** 图标自然尺寸，未知名称按 sunny */
export function weatherIconNatural(name) {
    return WEATHER_ICON_NATURAL[str(name, 'sunny')] || WEATHER_ICON_NATURAL.sunny;
}

// ============================================================
// 渐变背景
// ============================================================

export const BG_TYPE_OPTIONS = [
    { label: 'Linear', value: 'linear' },
    { label: 'Radial', value: 'radial' }
];

/**
 * 渐变方向表：value 是配置里的稳定标识，pair 是 Leafer 认的 from/to 关键字。
 *
 * 关键字不是猜的 —— 浏览器实测 Leafer 2.2.11 的 PaintGradient.linearGradient：
 * 它把 from/to 交给 Direction9（九宫格）查表，认的只有
 *   top-left / top / top-right / left / center / right / bottom-left / bottom / bottom-right
 * （及 0~8 数字、驼峰别名）；传表外字符串（'nw'、'0%'、'diagonal'）直接抛
 * "Cannot read properties of undefined (reading 'x')"。所以这里只列这 9 个的组合。
 */
export const BG_DIRECTIONS = {
    'tl-br': ['top-left', 'bottom-right'],   // ↘ 默认：与升级前写死的那对完全相同
    'bl-tr': ['bottom-left', 'top-right'],   // ↗
    'tr-bl': ['top-right', 'bottom-left'],   // ↙
    'br-tl': ['bottom-right', 'top-left'],   // ↖
    't-b': ['top', 'bottom'],                // ↓
    'b-t': ['bottom', 'top'],                // ↑
    'l-r': ['left', 'right'],                // →
    'r-l': ['right', 'left']                 // ←
};

export const BG_DIRECTION_OPTIONS = [
    { label: '↘', value: 'tl-br' },
    { label: '↗', value: 'bl-tr' },
    { label: '↙', value: 'tr-bl' },
    { label: '↖', value: 'br-tl' },
    { label: '↓', value: 't-b' },
    { label: '↑', value: 'b-t' },
    { label: '→', value: 'l-r' },
    { label: '←', value: 'r-l' }
];

export const BG_DIRECTION_DEFAULT = 'tl-br';

/**
 * 生成面板底的 fill（Leafer 渐变对象）。
 * 默认（不传 bgType/bgDirection）产出
 *   { type: 'linear', from: 'top-left', to: 'bottom-right', stops: [bgColor1, bgColor2] }
 * —— 与升级前 weatherPanel.js 里写死的那个对象逐项相同，不多一个键。
 *
 * @param {Object} config
 * @param {{color1: string, color2: string}} [fallbacks] 两个色的兜底值
 * @returns {Object}
 */
export function weatherGradient(config = {}, fallbacks = {}) {
    const c1 = str(config.bgColor1, str(fallbacks.color1, '#A09EF5'));
    const c2 = str(config.bgColor2, str(fallbacks.color2, '#112950'));
    const stops = [{ offset: 0, color: c1 }, { offset: 1, color: c2 }];

    if (str(config.bgType, 'linear') === 'radial') {
        // 径向没有「方向」，但同样支持九宫格关键字：圆心 → 下边中点，半径 = 半个高
        return { type: 'radial', from: 'center', to: 'bottom', stops };
    }
    const [from, to] = BG_DIRECTIONS[str(config.bgDirection, BG_DIRECTION_DEFAULT)] || BG_DIRECTIONS[BG_DIRECTION_DEFAULT];
    return { type: 'linear', from, to, stops };
}

// ============================================================
// 子元素生成器
// ============================================================

/**
 * 背景矩形（渐变 + 圆角 + 可选描边）。
 * @param {Object} o { width, height, config, radiusDefault, color1Default, color2Default, name }
 */
export function weatherBackground(o) {
    const cfg = o.config || {};
    const rect = {
        name: o.name || 'bg',
        tag: 'Rect',
        width: o.width,
        height: o.height,
        cornerRadius: num(cfg.bgCornerRadius, o.radiusDefault),
        fill: weatherGradient(cfg, { color1: o.color1Default, color2: o.color2Default })
    };
    // 老配置没有这两个键 → 不写这两个属性，输出与升级前一致
    const borderColor = typeof cfg.bgBorderColor === 'string' && cfg.bgBorderColor ? cfg.bgBorderColor : null;
    const borderWidth = Number(cfg.bgBorderWidth);
    if (borderColor && Number.isFinite(borderWidth) && borderWidth > 0) {
        rect.stroke = borderColor;
        rect.strokeWidth = borderWidth;
    }
    return rect;
}

/**
 * 一行文字。
 * @param {Object} o { name, text, x, y, fontSize, config, defaults: {x,y,fontSize,color,fontWeight}, align }
 *   defaults.x/y/fontSize/color/fontWeight 必须是升级前 build() 里写死的那几个字面量
 */
export function weatherText(o) {
    const cfg = o.config || {};
    const d = o.defaults || {};
    const align = o.align || {};
    return {
        name: o.name,
        tag: 'Text',
        resizeFontSize: true,
        x: num(cfg[o.keys.x], d.x),
        y: num(cfg[o.keys.y], d.y),
        fontSize: num(cfg[o.keys.fontSize], d.fontSize),
        fontWeight: str(cfg[o.keys.fontWeight], str(d.fontWeight, 'black')),
        text: str(cfg[o.keys.text], d.text),
        fill: str(cfg[o.keys.color], d.color),
        textAlign: align.textAlign || 'left',
        verticalAlign: align.verticalAlign || 'top'
    };
}

/**
 * 图标（Rect + path）。
 * around:'center' 是实测过的：带 path 的 Rect 在该设置下，世界包围盒中心恒等于 (x, y)，
 * 所以改 scale 天然绕中心，不需要像 chartCommon 那样按倍率差回补左上角。
 * @param {Object} o { config, name, colorDefault }
 */
export function weatherIconChild(o) {
    const cfg = o.config || {};
    return {
        name: o.name || 'icon',
        tag: 'Rect',
        x: num(cfg.iconX, o.x),
        y: num(cfg.iconY, o.y),
        scale: num(cfg.iconScale, o.scale),
        around: 'center',
        path: weatherIconPath(cfg.weatherIcon),
        fill: str(cfg.iconColor, o.colorDefault)
    };
}

// ============================================================
// 设置项（两个面板共用的那几条，顺序一致，键名一致）
// ============================================================

/**
 * 背景相关的设置项。
 * @param {{radiusMax?: number}} [opts]
 */
export function weatherBgSettings(opts = {}) {
    return [
        { name: 'Background 1', key: 'bgColor1', type: 'color' },
        { name: 'Background 2', key: 'bgColor2', type: 'color' },
        { name: 'Gradient', key: 'bgType', type: 'button_group', options: BG_TYPE_OPTIONS },
        { name: 'Direction', key: 'bgDirection', type: 'button_group', options: BG_DIRECTION_OPTIONS },
        {
            name: 'Corner radius', key: 'bgCornerRadius', type: 'number',
            min: 0, max: opts.radiusMax || 120, step: 1
        },
        { name: 'Border color', key: 'bgBorderColor', type: 'color' },
        { name: 'Border width', key: 'bgBorderWidth', type: 'number', min: 0, max: 20, step: 1 }
    ];
}

/**
 * 图标相关的设置项（按钮组 + 尺寸/位置/颜色）。
 */
export function weatherIconSettings() {
    return [
        { name: 'Weather icon', key: 'weatherIcon', type: 'button_group', options: WEATHER_ICON_OPTIONS },
        { name: 'Icon color', key: 'iconColor', type: 'color' },
        { name: 'Icon size', key: 'iconScale', type: 'number', min: 0.02, max: 1.5, step: 0.01 },
        { name: 'Icon X', key: 'iconX', type: 'number', min: -400, max: 2000, step: 1 },
        { name: 'Icon Y', key: 'iconY', type: 'number', min: -400, max: 2000, step: 1 }
    ];
}

/** 字重选项：black 是 Leafer 的 900 别名，也是本仓库所有面板原来的写法 */
export const FONT_WEIGHT_OPTIONS = [
    { label: 'Normal', value: 'normal' },
    { label: 'Bold', value: 'bold' },
    { label: 'Black', value: 'black' }
];
