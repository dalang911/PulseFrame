/**
 * definitions/elevationChart.js - 高程图表组件（pt_ele_pan）
 * 布局与设置项统一走 chartCommon（折线类图表三个组件共用一份实现）
 */
import { mountain_icon } from '../../utils/icons.js';
import { chartDefaultConfig, chartSettings, chartChildren, chartUpdate } from './chartCommon.js';

const OPTS = {
    title: 'Elevation Chart',
    lineLabel: 'Elevation',
    x: 80,
    y: 350,
    lineColor: '#8B4513',
    // 老配置里那块一直没接上的 colors.fill，现在作为面积色默认值生效（默认关着，观感不变）
    areaColor: 'rgba(139,69,19,0.3)',
    iconPath: mountain_icon,
    iconScale: 0.04,
    // mountain_icon 这条 path 的自然包围盒（实测自 Leafer），只用于让图标绕中心缩放
    iconNatural: [896, 640],
    iconColorKey: 'colors.icon',
    pointsKey: 'pt_ele_points',
    maxKey: 'eleMax',
    minKey: 'eleMin',
    maxDefault: 100,
    minDefault: 0,
    // 老款是硬折线（无 curve 也无 cornerRadius）
    smoothDefault: false,
    formatLabel: v => String(Math.round(v)),
    formatValue: frameData => String(Math.round(frameData.altitude || 0))
};

export default {
    id: 'pt_ele_pan',
    name: 'Elevation Chart',
    category: 'chart',
    icon: './images/t5.png',
    defaultConfig: chartDefaultConfig(OPTS),
    dataBindings: ['altitude'],
    settings: chartSettings(OPTS),

    build(config, data) {
        return chartChildren(OPTS, config, data);
    },

    update(box, frameData, progress, ctx) {
        return chartUpdate(OPTS, box, frameData, progress, ctx);
    }
};
