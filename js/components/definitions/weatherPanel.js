/**
 * definitions/weatherPanel.js - 天气面板（静态可编辑）
 * 从老款程序 widget.js el_weather_pan 迁移
 *
 * 新版数据管线无天气数据源，因此天气内容（城市 / 温度 / 日期 / 图标）全部通过
 * 右侧属性面板静态编辑，不做实时天气 API 拉取。
 */

import { weather_sunny_icon, weather_cloudy_icon, weather_rain_icon } from '../../utils/icons.js';

const WEATHER_ICONS = {
    sunny: weather_sunny_icon,
    cloudy: weather_cloudy_icon,
    rain: weather_rain_icon
};

const el_weather_pan = {
    id: 'el_weather_pan',
    name: 'Weather',
    category: 'time',
    icon: './images/m6.png',
    defaultConfig: {
        x: 1620, y: 430, width: 200, height: 230,
        city: 'ShangHai', temp: '18~25℃', date: '2025-12-12',
        bgColor1: '#A09EF5', bgColor2: '#112950',
        textColor1: '#FFFFFF', textColor2: '#FFFFFF', textColor3: '#FFFFFF',
        weatherIcon: 'sunny', iconColor: '#FFFFFF'
    },
    dataBindings: [],
    settings: [
        { name: 'Weather', type: 'title' },
        { name: 'Background 1', key: 'bgColor1', type: 'color' },
        { name: 'Background 2', key: 'bgColor2', type: 'color' },
        { name: 'City', key: 'city', type: 'text' },
        { name: 'City color', key: 'textColor1', type: 'color' },
        { name: 'Temperature', key: 'temp', type: 'text' },
        { name: 'Temperature color', key: 'textColor2', type: 'color' },
        { name: 'Date', key: 'date', type: 'text' },
        { name: 'Date color', key: 'textColor3', type: 'color' },
        {
            name: 'Weather icon', key: 'weatherIcon', type: 'select',
            options: [
                { label: 'Sunny', value: 'sunny' },
                { label: 'Cloudy', value: 'cloudy' },
                { label: 'Rain', value: 'rain' }
            ]
        },
        { name: 'Icon color', key: 'iconColor', type: 'color' }
    ],
    build(config) {
        const iconPath = WEATHER_ICONS[config.weatherIcon] || weather_sunny_icon;
        return [
            {
                tag: 'Rect', width: 200, height: 230, cornerRadius: 20,
                fill: {
                    type: 'linear', from: 'top-left', to: 'bottom-right',
                    stops: [
                        { offset: 0, color: config.bgColor1 || '#A09EF5' },
                        { offset: 1, color: config.bgColor2 || '#112950' }
                    ]
                }
            },
            { tag: 'Text', y: 10, x: 10, resizeFontSize: true, fontSize: 26, fontWeight: 'black', text: config.city || 'ShangHai', fill: config.textColor1 || '#FFFFFF', textAlign: 'left', verticalAlign: 'top' },
            { tag: 'Text', y: 144, x: 100, resizeFontSize: true, fontSize: 30, fontWeight: 'black', text: config.temp || '18~25℃', fill: config.textColor2 || '#FFFFFF', textAlign: 'center', verticalAlign: 'top' },
            { tag: 'Text', y: 190, x: 100, resizeFontSize: true, fontSize: 24, fontWeight: 'black', text: config.date || '2025-12-12', fill: config.textColor3 || '#FFFFFF', textAlign: 'center', verticalAlign: 'top' },
            { tag: 'Rect', x: 100, y: 100, scale: 0.1, around: 'center', path: iconPath, fill: config.iconColor || '#FFFFFF' }
        ];
    },
    // 静态面板：内容随属性编辑重建即可，无需逐帧刷新
    update() { }
};

export const weatherPanels = [el_weather_pan];

export default weatherPanels;
