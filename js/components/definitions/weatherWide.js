/**
 * definitions/weatherWide.js - 横向天气面板（静态可编辑）
 *
 * 方形 el_weather_pan 的横版：560 × 200，左边圆盘 + 图标，一条竖分隔线，
 * 右侧三行文字（城市 / 大号温度 / 日期），右上角写天气名称。
 * 背景沿用同一套线性渐变（用户要求「背景色参考 Weather 还是需要过渡」）。
 *
 * 新组件，没有「默认观感」包袱，但键名与方形面板尽量一致（city / temp / date /
 * textColor1~3 / iconX / iconScale / bg*…），只有默认几何值不同 —— 各面板的默认值
 * 由自己的 build 常量兜底，互不干扰。
 */

import {
    num,
    str,
    on,
    WEATHER_LABELS,
    BG_DIRECTION_DEFAULT,
    weatherIconChild,
    weatherIconSettings,
    weatherBackground,
    weatherBgSettings,
    weatherText,
    FONT_WEIGHT_OPTIONS
} from './weatherCommon.js';

const WIDE = {
    width: 560,
    height: 200,
    radius: 24,
    bgColor1: '#A09EF5',
    bgColor2: '#112950',
    // 左侧圆盘 + 图标：圆盘中心与图标中心同一个点，图标绕中心缩放不会跑偏
    discX: 100, discY: 100, discSize: 150,
    discColor: 'rgba(255,255,255,0.18)',
    iconX: 100, iconY: 100, iconScale: 0.14, iconColor: '#FFFFFF',
    // 竖分隔线（Line 横着画再旋转 90°，与图表的进度线同一手法）
    dividerX: 196, dividerY: 35, dividerLength: 130, dividerWidth: 2,
    dividerColor: 'rgba(255,255,255,0.35)',
    // 右侧文字三行（左对齐，温度做主角）
    cityX: 228, cityY: 26, cityFontSize: 24, cityColor: '#FFFFFF', city: 'ShangHai',
    tempX: 228, tempY: 56, tempFontSize: 46, tempColor: '#FFFFFF', temp: '18~25℃',
    dateX: 228, dateY: 126, dateFontSize: 20, dateColor: '#FFFFFF', date: '2025-12-12',
    // 天气名称：右上角，textAlign right 时 x 就是右边界
    conditionX: 536, conditionY: 30, conditionFontSize: 20, conditionColor: '#FFFFFF'
};

export const el_weather_wide_pan = {
    id: 'el_weather_wide_pan',
    name: 'Weather Wide',
    category: 'time',
    icon: './images/m6.png',
    defaultConfig: {
        x: 100, y: 780, width: WIDE.width, height: WIDE.height,
        city: WIDE.city, temp: WIDE.temp, date: WIDE.date,
        bgColor1: WIDE.bgColor1, bgColor2: WIDE.bgColor2,
        textColor1: WIDE.cityColor, textColor2: WIDE.tempColor, textColor3: WIDE.dateColor,
        weatherIcon: 'sunny', iconColor: WIDE.iconColor,
        bgType: 'linear', bgDirection: BG_DIRECTION_DEFAULT,
        bgCornerRadius: WIDE.radius, bgBorderColor: '', bgBorderWidth: 0,
        discX: WIDE.discX, discY: WIDE.discY, discSize: WIDE.discSize, discColor: WIDE.discColor,
        dividerX: WIDE.dividerX, dividerY: WIDE.dividerY, dividerLength: WIDE.dividerLength,
        dividerWidth: WIDE.dividerWidth, dividerColor: WIDE.dividerColor,
        iconX: WIDE.iconX, iconY: WIDE.iconY, iconScale: WIDE.iconScale,
        cityX: WIDE.cityX, cityY: WIDE.cityY, cityFontSize: WIDE.cityFontSize,
        tempX: WIDE.tempX, tempY: WIDE.tempY, tempFontSize: WIDE.tempFontSize,
        dateX: WIDE.dateX, dateY: WIDE.dateY, dateFontSize: WIDE.dateFontSize,
        conditionText: '', conditionColor: WIDE.conditionColor, conditionFontSize: WIDE.conditionFontSize,
        conditionX: WIDE.conditionX, conditionY: WIDE.conditionY,
        fontWeight: 'black',
        showCity: true, showTemp: true, showDate: true, showIcon: true,
        // 横版默认带天气名称这一行（方形面板默认不带，那是它的老观感），圆盘与分隔线也默认在
        showCondition: true, showDisc: true, showDivider: true
    },
    dataBindings: [],
    settings: [
        { name: 'Weather Wide', type: 'title' },
        { name: 'Background', type: 'title' },
        ...weatherBgSettings({ radiusMax: 120 }),

        { name: 'Icon Disc', type: 'title' },
        { name: 'Show disc', key: 'showDisc', type: 'boolean' },
        { name: 'Disc color', key: 'discColor', type: 'color' },
        { name: 'Disc size', key: 'discSize', type: 'number', min: 20, max: 400, step: 1 },
        { name: 'Disc X', key: 'discX', type: 'number', min: -400, max: 2000, step: 1 },
        { name: 'Disc Y', key: 'discY', type: 'number', min: -400, max: 2000, step: 1 },

        { name: 'Divider', type: 'title' },
        { name: 'Show divider', key: 'showDivider', type: 'boolean' },
        { name: 'Divider color', key: 'dividerColor', type: 'color' },
        { name: 'Divider width', key: 'dividerWidth', type: 'number', min: 0, max: 20, step: 1 },
        { name: 'Divider X', key: 'dividerX', type: 'number', min: -400, max: 2000, step: 1 },
        { name: 'Divider Y', key: 'dividerY', type: 'number', min: -400, max: 2000, step: 1 },
        { name: 'Divider length', key: 'dividerLength', type: 'number', min: 0, max: 900, step: 1 },

        { name: 'City', type: 'title' },
        { name: 'Show', key: 'showCity', type: 'boolean' },
        { name: 'Text', key: 'city', type: 'text' },
        { name: 'Color', key: 'textColor1', type: 'color' },
        { name: 'Font size', key: 'cityFontSize', type: 'number', min: 6, max: 120, step: 1 },
        { name: 'X', key: 'cityX', type: 'number', min: -200, max: 1400, step: 1 },
        { name: 'Y', key: 'cityY', type: 'number', min: -200, max: 900, step: 1 },

        { name: 'Temperature', type: 'title' },
        { name: 'Show', key: 'showTemp', type: 'boolean' },
        { name: 'Text', key: 'temp', type: 'text' },
        { name: 'Color', key: 'textColor2', type: 'color' },
        { name: 'Font size', key: 'tempFontSize', type: 'number', min: 6, max: 200, step: 1 },
        { name: 'X', key: 'tempX', type: 'number', min: -200, max: 1400, step: 1 },
        { name: 'Y', key: 'tempY', type: 'number', min: -200, max: 900, step: 1 },

        { name: 'Date', type: 'title' },
        { name: 'Show', key: 'showDate', type: 'boolean' },
        { name: 'Text', key: 'date', type: 'text' },
        { name: 'Color', key: 'textColor3', type: 'color' },
        { name: 'Font size', key: 'dateFontSize', type: 'number', min: 6, max: 120, step: 1 },
        { name: 'X', key: 'dateX', type: 'number', min: -200, max: 1400, step: 1 },
        { name: 'Y', key: 'dateY', type: 'number', min: -200, max: 900, step: 1 },

        { name: 'Condition', type: 'title' },
        { name: 'Show', key: 'showCondition', type: 'boolean' },
        { name: 'Text', key: 'conditionText', type: 'text' },
        { name: 'Color', key: 'conditionColor', type: 'color' },
        { name: 'Font size', key: 'conditionFontSize', type: 'number', min: 6, max: 120, step: 1 },
        { name: 'X', key: 'conditionX', type: 'number', min: -200, max: 1400, step: 1 },
        { name: 'Y', key: 'conditionY', type: 'number', min: -200, max: 900, step: 1 },

        { name: 'Icon', type: 'title' },
        { name: 'Show', key: 'showIcon', type: 'boolean' },
        ...weatherIconSettings(),

        { name: 'Font weight', key: 'fontWeight', type: 'button_group', options: FONT_WEIGHT_OPTIONS }
    ],
    build(config) {
        const cfg = config || {};
        const conditionLabel = WEATHER_LABELS[str(cfg.weatherIcon, 'sunny')] || WEATHER_LABELS.sunny;
        const children = [
            weatherBackground({
                name: 'bg', width: WIDE.width, height: WIDE.height, config: cfg,
                radiusDefault: WIDE.radius, color1Default: WIDE.bgColor1, color2Default: WIDE.bgColor2
            })
        ];

        // 半透明圆盘（在图标底下）
        if (on(cfg.showDisc)) {
            const size = num(cfg.discSize, WIDE.discSize);
            children.push({
                name: 'disc', tag: 'Ellipse', lockRatio: true, around: 'center',
                x: num(cfg.discX, WIDE.discX), y: num(cfg.discY, WIDE.discY),
                width: size, height: size,
                fill: str(cfg.discColor, WIDE.discColor)
            });
        }

        // 竖分隔线：横线旋转 90°，从 (x, y) 往下长 dividerLength
        if (on(cfg.showDivider)) {
            children.push({
                name: 'divider', tag: 'Line', lockRatio: true,
                x: num(cfg.dividerX, WIDE.dividerX), y: num(cfg.dividerY, WIDE.dividerY),
                width: num(cfg.dividerLength, WIDE.dividerLength), rotation: 90,
                strokeWidth: num(cfg.dividerWidth, WIDE.dividerWidth),
                stroke: str(cfg.dividerColor, WIDE.dividerColor), strokeCap: 'round'
            });
        }

        // 图标压在圆盘正中（around center → 改倍率不会偏离圆盘中心）
        if (on(cfg.showIcon)) {
            children.push(weatherIconChild({
                name: 'icon', config: cfg,
                x: WIDE.iconX, y: WIDE.iconY, scale: WIDE.iconScale, colorDefault: WIDE.iconColor
            }));
        }

        const lines = [
            { name: 'city_text', keys: { text: 'city', x: 'cityX', y: 'cityY', fontSize: 'cityFontSize', color: 'textColor1' }, show: cfg.showCity, d: WIDE, line: 'city' },
            { name: 'temp_text', keys: { text: 'temp', x: 'tempX', y: 'tempY', fontSize: 'tempFontSize', color: 'textColor2' }, show: cfg.showTemp, d: WIDE, line: 'temp' },
            { name: 'date_text', keys: { text: 'date', x: 'dateX', y: 'dateY', fontSize: 'dateFontSize', color: 'textColor3' }, show: cfg.showDate, d: WIDE, line: 'date' }
        ];
        lines.forEach(l => {
            if (!on(l.show)) return;
            children.push(weatherText({
                name: l.name, config: cfg,
                keys: { ...l.keys, fontWeight: 'fontWeight' },
                defaults: {
                    x: WIDE[l.line + 'X'], y: WIDE[l.line + 'Y'],
                    fontSize: WIDE[l.line + 'FontSize'], color: WIDE[l.line + 'Color'], text: WIDE[l.line]
                },
                align: { textAlign: 'left', verticalAlign: 'top' }
            }));
        });

        // 横版默认带天气名称这一行（方形面板默认不带，那是它的老观感）
        if (on(cfg.showCondition, true)) {
            children.push(weatherText({
                name: 'condition_text', config: cfg,
                keys: { text: 'conditionText', x: 'conditionX', y: 'conditionY', fontSize: 'conditionFontSize', color: 'conditionColor', fontWeight: 'fontWeight' },
                defaults: {
                    x: WIDE.conditionX, y: WIDE.conditionY, fontSize: WIDE.conditionFontSize,
                    color: WIDE.conditionColor, text: conditionLabel
                },
                align: { textAlign: 'right', verticalAlign: 'top' }
            }));
        }

        return children;
    },
    update() { }
};

// 单独导出，也方便以后按名字取用（weatherPanel.js 把它并入 weatherPanels 一起注册）
export default el_weather_wide_pan;
