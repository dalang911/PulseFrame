/**
 * definitions/heartChart.js - 心率图表组件（pt_heart_pan）
 * 布局与设置项统一走 chartCommon（折线类图表三个组件共用一份实现）
 */
import { heart_icon } from '../../utils/icons.js';
import { chartDefaultConfig, chartSettings, chartChildren, chartUpdate, chartDesignSize, chartApplyRatioChange } from './chartCommon.js';

const OPTS = {
    title: 'Heart Chart',
    lineLabel: 'Heart',
    x: 80,
    y: 850,
    lineColor: '#C71585',
    areaColor: 'rgba(199,21,133,0.25)',
    iconPath: heart_icon,
    iconScale: 0.03,
    // heart_icon 这条 path 的自然包围盒（实测自 Leafer），只用于让图标绕中心缩放
    iconNatural: [1024, 917.72928],
    iconColorKey: 'colors.icon',
    // 老配置里已有 colors.heartIcon，继续认它，老模板换色不会失效
    iconColorFallbacks: ['colors.heartIcon'],
    extraColors: { heartIcon: '#C71585' },
    pointsKey: 'pt_heart_points',
    maxKey: 'heartRateMax',
    minKey: 'heartRateMin',
    maxDefault: 180,
    minDefault: 60,
    // 老款折线带 cornerRadius:1，关掉「平滑」时保持这个观感
    smoothDefault: false,
    flatCornerRadius: 1,
    formatLabel: (v, pos) => (pos === 'mid' ? String(Math.round(v)) : String(v)),
    formatValue: frameData => String(frameData.heart_rate || 0)
};

export default {
    id: 'pt_heart_pan',
    name: 'Heart Chart',
    category: 'chart',
    icon: './images/t3.png',
    defaultConfig: chartDefaultConfig(OPTS),
    dataBindings: ['heart_rate'],
    settings: chartSettings(OPTS),
    // 宽高比可调（1:1 ~ 1:8）：设计尺寸随比例走，改比例时把面板拉宽（高度不动）
    designSize: chartDesignSize,
    onSettingChange: chartApplyRatioChange,

    build(config, data) {
        return chartChildren(OPTS, config, data);
    },

    update(box, frameData, progress, ctx) {
        return chartUpdate(OPTS, box, frameData, progress, ctx);
    }
};
