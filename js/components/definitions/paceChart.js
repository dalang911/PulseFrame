/**
 * definitions/paceChart.js - 配速图表组件（pt_pace_pan）
 * 布局与设置项统一走 chartCommon（折线类图表三个组件共用一份实现）
 */
import { speedToPace } from '../../utils/format.js';
import { run_icon } from '../../utils/icons.js';
import { chartDefaultConfig, chartSettings, chartChildren, chartUpdate } from './chartCommon.js';

const OPTS = {
    title: 'Pace Chart',
    lineLabel: 'Pace',
    x: 80,
    y: 600,
    lineColor: '#00CED1',
    areaColor: 'rgba(0,206,209,0.25)',
    iconPath: run_icon,
    iconScale: 0.03,
    iconColorKey: 'colors.icon',
    pointsKey: 'pt_paces_points',
    // 配速图的量程其实是速度（km/h），刻度文本再转成 mm'ss"
    maxKey: 'paceMax',
    minKey: 'paceMin',
    maxDefault: 20,
    minDefault: 0,
    // 老款就是 curve: true 的平滑曲线，所以「平滑」默认开
    smoothDefault: true,
    formatLabel: v => speedToPace(v),
    formatValue: frameData => speedToPace(frameData.speed)
};

export default {
    id: 'pt_pace_pan',
    name: 'Pace Chart',
    category: 'chart',
    icon: './images/t4.png',
    defaultConfig: chartDefaultConfig(OPTS),
    dataBindings: ['speed'],
    settings: chartSettings(OPTS),

    build(config, data) {
        return chartChildren(OPTS, config, data);
    },

    update(box, frameData, progress, ctx) {
        return chartUpdate(OPTS, box, frameData, progress, ctx);
    }
};
