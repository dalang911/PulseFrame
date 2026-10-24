/**
 * definitions/weatherPanel.js - 天气面板（静态可编辑）
 * 从老款程序 widget.js el_weather_pan 迁移
 *
 * 新版数据管线无天气数据源，因此天气内容（城市 / 温度 / 日期 / 图标）全部通过
 * 右侧属性面板静态编辑，不做实时天气 API 拉取。
 *
 * 与横向面板 el_weather_wide_pan 共用 weatherCommon.js（图标表、渐变、子元素生成器）。
 * 「默认观感不变」：下面 defaults 里那批字面量就是升级前 build() 写死的值，
 * 一个都不许改；新增的键全部走兜底，只带老配置时输出与升级前逐项相同。
 */

import {
    str,
    on,
    WEATHER_LABELS,
    BG_DIRECTION_DEFAULT,
    weatherIconChild,
    weatherBackground,
    weatherText,
    weatherBgSettings,
    weatherIconSettings,
    FONT_WEIGHT_OPTIONS
} from './weatherCommon.js';
import { el_weather_wide_pan } from './weatherWide.js';

// 升级前写死的那套几何值，集中放这里，build 只从这些常量取值
const SQUARE = {
    width: 200,
    height: 230,
    radius: 20,
    bgColor1: '#A09EF5',
    bgColor2: '#112950',
    cityX: 10, cityY: 10, cityFontSize: 26, cityColor: '#FFFFFF', city: 'ShangHai',
    tempX: 100, tempY: 144, tempFontSize: 30, tempColor: '#FFFFFF', temp: '18~25℃',
    dateX: 100, dateY: 190, dateFontSize: 24, dateColor: '#FFFFFF', date: '2025-12-12',
    iconX: 100, iconY: 100, iconScale: 0.1, iconColor: '#FFFFFF',
    // 新增「天气状况文字」：默认关闭，位置贴在城市名右侧同一行
    conditionX: 190, conditionY: 12, conditionFontSize: 18, conditionColor: '#FFFFFF'
};

const el_weather_pan = {
    id: 'el_weather_pan',
    name: 'Weather',
    category: 'time',
    icon: './images/m6.png',
    defaultConfig: {
        x: 1620, y: 430, width: SQUARE.width, height: SQUARE.height,
        city: SQUARE.city, temp: SQUARE.temp, date: SQUARE.date,
        bgColor1: SQUARE.bgColor1, bgColor2: SQUARE.bgColor2,
        textColor1: SQUARE.cityColor, textColor2: SQUARE.tempColor, textColor3: SQUARE.dateColor,
        weatherIcon: 'sunny', iconColor: SQUARE.iconColor,
        // ↓ 新增键全部列出来，值就等于升级前 build() 里写死的那几个字面量。
        //   这样「老配置载入」和「新默认值」两条路算出来的子元素完全一样，
        //   面板上的按钮组也能靠这些值把当前选中项点亮（键不在 defaultConfig 里时，
        //   面板只能显示未选中，用户看不出 ↘ / Linear / Black 其实是生效中的那档）。
        bgType: 'linear', bgDirection: BG_DIRECTION_DEFAULT,
        bgCornerRadius: SQUARE.radius, bgBorderColor: '', bgBorderWidth: 0,
        cityX: SQUARE.cityX, cityY: SQUARE.cityY, cityFontSize: SQUARE.cityFontSize,
        tempX: SQUARE.tempX, tempY: SQUARE.tempY, tempFontSize: SQUARE.tempFontSize,
        dateX: SQUARE.dateX, dateY: SQUARE.dateY, dateFontSize: SQUARE.dateFontSize,
        iconX: SQUARE.iconX, iconY: SQUARE.iconY, iconScale: SQUARE.iconScale,
        fontWeight: 'black',
        showCity: true, showTemp: true, showDate: true, showIcon: true, showCondition: false,
        conditionText: '', conditionColor: SQUARE.conditionColor,
        conditionFontSize: SQUARE.conditionFontSize, conditionX: SQUARE.conditionX, conditionY: SQUARE.conditionY
    },
    dataBindings: [],
    settings: [
        { name: 'Weather', type: 'title' },
        { name: 'Background', type: 'title' },
        ...weatherBgSettings({ radiusMax: 120 }),

        { name: 'City', type: 'title' },
        { name: 'Show', key: 'showCity', type: 'boolean' },
        { name: 'Text', key: 'city', type: 'text' },
        { name: 'Color', key: 'textColor1', type: 'color' },
        { name: 'Font size', key: 'cityFontSize', type: 'number', min: 6, max: 120, step: 1 },
        { name: 'X', key: 'cityX', type: 'number', min: -200, max: 900, step: 1 },
        { name: 'Y', key: 'cityY', type: 'number', min: -200, max: 900, step: 1 },

        { name: 'Temperature', type: 'title' },
        { name: 'Show', key: 'showTemp', type: 'boolean' },
        { name: 'Text', key: 'temp', type: 'text' },
        { name: 'Color', key: 'textColor2', type: 'color' },
        { name: 'Font size', key: 'tempFontSize', type: 'number', min: 6, max: 160, step: 1 },
        { name: 'X', key: 'tempX', type: 'number', min: -200, max: 900, step: 1 },
        { name: 'Y', key: 'tempY', type: 'number', min: -200, max: 900, step: 1 },

        { name: 'Date', type: 'title' },
        { name: 'Show', key: 'showDate', type: 'boolean' },
        { name: 'Text', key: 'date', type: 'text' },
        { name: 'Color', key: 'textColor3', type: 'color' },
        { name: 'Font size', key: 'dateFontSize', type: 'number', min: 6, max: 120, step: 1 },
        { name: 'X', key: 'dateX', type: 'number', min: -200, max: 900, step: 1 },
        { name: 'Y', key: 'dateY', type: 'number', min: -200, max: 900, step: 1 },

        { name: 'Condition', type: 'title' },
        { name: 'Show', key: 'showCondition', type: 'boolean' },
        { name: 'Text', key: 'conditionText', type: 'text' },
        { name: 'Color', key: 'conditionColor', type: 'color' },
        { name: 'Font size', key: 'conditionFontSize', type: 'number', min: 6, max: 120, step: 1 },
        { name: 'X', key: 'conditionX', type: 'number', min: -200, max: 900, step: 1 },
        { name: 'Y', key: 'conditionY', type: 'number', min: -200, max: 900, step: 1 },

        { name: 'Icon', type: 'title' },
        { name: 'Show', key: 'showIcon', type: 'boolean' },
        ...weatherIconSettings(),

        { name: 'Font weight', key: 'fontWeight', type: 'button_group', options: FONT_WEIGHT_OPTIONS }
    ],
    build(config) {
        const cfg = config || {};
        // 天气状况默认文案跟着图标名称走（conditionText 填了就用填的）
        const conditionLabel = WEATHER_LABELS[str(cfg.weatherIcon, 'sunny')] || WEATHER_LABELS.sunny;
        const children = [
            weatherBackground({
                name: 'bg', width: SQUARE.width, height: SQUARE.height, config: cfg,
                radiusDefault: SQUARE.radius, color1Default: SQUARE.bgColor1, color2Default: SQUARE.bgColor2
            })
        ];

        // 顺序与升级前一致：城市 → 温度 → 日期 →（状况）→ 图标
        if (on(cfg.showCity)) {
            children.push(weatherText({
                name: 'city_text', config: cfg,
                keys: { text: 'city', x: 'cityX', y: 'cityY', fontSize: 'cityFontSize', color: 'textColor1', fontWeight: 'fontWeight' },
                defaults: { x: SQUARE.cityX, y: SQUARE.cityY, fontSize: SQUARE.cityFontSize, color: SQUARE.cityColor, text: SQUARE.city },
                align: { textAlign: 'left', verticalAlign: 'top' }
            }));
        }
        if (on(cfg.showTemp)) {
            children.push(weatherText({
                name: 'temp_text', config: cfg,
                keys: { text: 'temp', x: 'tempX', y: 'tempY', fontSize: 'tempFontSize', color: 'textColor2', fontWeight: 'fontWeight' },
                defaults: { x: SQUARE.tempX, y: SQUARE.tempY, fontSize: SQUARE.tempFontSize, color: SQUARE.tempColor, text: SQUARE.temp },
                align: { textAlign: 'center', verticalAlign: 'top' }
            }));
        }
        if (on(cfg.showDate)) {
            children.push(weatherText({
                name: 'date_text', config: cfg,
                keys: { text: 'date', x: 'dateX', y: 'dateY', fontSize: 'dateFontSize', color: 'textColor3', fontWeight: 'fontWeight' },
                defaults: { x: SQUARE.dateX, y: SQUARE.dateY, fontSize: SQUARE.dateFontSize, color: SQUARE.dateColor, text: SQUARE.date },
                align: { textAlign: 'center', verticalAlign: 'top' }
            }));
        }
        // 老配置没有 showCondition（undefined → 默认关）→ 不产出这一行，输出保持 5 个子元素
        if (on(cfg.showCondition, false)) {
            children.push(weatherText({
                name: 'condition_text', config: cfg,
                keys: { text: 'conditionText', x: 'conditionX', y: 'conditionY', fontSize: 'conditionFontSize', color: 'conditionColor', fontWeight: 'fontWeight' },
                defaults: { x: SQUARE.conditionX, y: SQUARE.conditionY, fontSize: SQUARE.conditionFontSize, color: SQUARE.conditionColor, text: conditionLabel },
                align: { textAlign: 'right', verticalAlign: 'top' }
            }));
        }
        if (on(cfg.showIcon)) {
            children.push(weatherIconChild({
                name: 'icon', config: cfg,
                x: SQUARE.iconX, y: SQUARE.iconY, scale: SQUARE.iconScale, colorDefault: SQUARE.iconColor
            }));
        }
        return children;
    },
    // 静态面板：内容随属性编辑重建即可，无需逐帧刷新
    update() { }
};

// 两个天气组件一起导出，definitions/index.js 那边不用改
export const weatherPanels = [el_weather_pan, el_weather_wide_pan];

export default weatherPanels;
