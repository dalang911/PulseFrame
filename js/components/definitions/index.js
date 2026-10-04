/**
 * definitions/index.js - 组件定义汇总注册
 * 导入所有组件定义并批量注册到 registry
 */

import { registry } from '../registry.js';

import background from './background.js';
import dateTime from './dateTime.js';
import distance from './distance.js';
import heartChart from './heartChart.js';
import paceChart from './paceChart.js';
import elevationChart from './elevationChart.js';
import statusPanel from './statusPanel.js';
import { simpleTextPanels } from './simpleTextPanels.js';
import { toPanels } from './toPanels.js';
import { gaugePanels } from './gaugePanels.js';
import { lapPanels } from './lapPanels.js';
import { miscPanels } from './miscPanels.js';
import { advancedPanels } from './advancedPanels.js';
import { rulerPanels } from './rulerPanels.js';
import { weatherPanels } from './weatherPanel.js';
import { webMapPanels } from './webMapPanels.js';

// 批量注册
const allDefinitions = [
    background,
    dateTime,
    distance,
    heartChart,
    paceChart,
    elevationChart,
    statusPanel,
    ...simpleTextPanels,
    ...toPanels,
    ...gaugePanels,
    ...lapPanels,
    ...miscPanels,
    ...advancedPanels,
    ...rulerPanels,
    ...weatherPanels,
    ...webMapPanels
];

registry.registerAll(allDefinitions);

export { allDefinitions };
