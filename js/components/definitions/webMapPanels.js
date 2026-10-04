/**
 * definitions/webMapPanels.js - 在线地图组件（4 个，从老款 widget.js web 地图 Box 迁移）
 *
 * 老款对应：web_map_pan / web_minimap_pan / web_rotatemap_pan / web_gaodemap_pan
 * 新款改进：每个组件均可在 maptalks（国际瓦片）与 AMap 高德（国内 GCJ-02）之间切换，
 *           地图实例生命周期由 MapBridge 单例管理（懒创建 / diff 重建 / 删除销毁）。
 *
 * 视觉与老款一致：300x300 圆形裁角 + 黄色描边，子元素为单个 Leafer Canvas，
 * 每帧由 MapBridge 把离屏地图 canvas drawImage 进来再 paint()。
 */

import { mapBridge } from '../../map/MapBridge.js';

const W = 1920;

const FRAMEWORK_OPTIONS = [
    { value: 'maptalks', label: 'Maptalks (Overseas)' },
    { value: 'amap', label: 'AMap (Domestic)' }
];

const SOURCE_OPTIONS = [
    { value: 'osmHot', label: 'OSM.HOT' },
    { value: 'carto', label: 'Carto' },
    { value: 'arcgisonline', label: 'Esri Satellite' },
    { value: 'amapNormal', label: 'AMap Vector' },
    { value: 'amapSatellite', label: 'AMap Satellite' }
];

/** 公共设置项（外框 + 地图源 + 三色），extra 为模式专属项 */
function webMapSettings(extra) {
    return [
        { name: 'Web Map', type: 'title' },
        { name: 'Map framework', key: 'framework', type: 'select', options: FRAMEWORK_OPTIONS },
        { name: 'Map source', key: 'mapSource', type: 'select', options: SOURCE_OPTIONS },
        { name: 'Border radius', key: 'cornerRadius', type: 'number', min: 0, max: 400 },
        { name: 'Border color', key: 'stroke', type: 'color' },
        { name: 'Border width', key: 'strokeWidth', type: 'number', min: 0, max: 40 },
        { name: 'Background route color', key: 'backgroundColor', type: 'color' },
        { name: 'Progress route color', key: 'progressColor', type: 'color' },
        { name: 'Current position color', key: 'pointColor', type: 'color' },
        { name: 'Line width', key: 'lineWidth', type: 'number', min: 1, max: 20 },
        { name: 'Progress width', key: 'progressWidth', type: 'number', min: 1, max: 20 },
        { name: 'Point size', key: 'pointSize', type: 'number', min: 4, max: 60 },
        ...extra
    ];
}

/**
 * 生成一个 web 地图组件定义
 * @param {string} id
 * @param {string} name
 * @param {string} icon
 * @param {'full'|'mini'|'rotate'} mode 地图视野模式
 * @param {Object} overrides 覆盖默认配置（地图源/位置/zoom 等）
 * @param {Array} extra 模式专属设置项
 * @param {string[]} dataBindings
 */
function makeWebMap(id, name, icon, mode, overrides, extra, dataBindings) {
    return {
        id,
        name,
        category: 'map',
        icon,
        defaultConfig: {
            x: W - 620, y: 200, width: 300, height: 300,
            cornerRadius: 150, stroke: '#FFC800', strokeWidth: 10, overflow: 'hide',
            framework: 'maptalks', mapSource: 'osmHot',
            backgroundColor: '#FFFF00', progressColor: '#FF8C00', pointColor: '#FF6347',
            lineWidth: 5, progressWidth: 5, pointSize: 15,
            ...overrides
        },
        dataBindings,
        settings: webMapSettings(extra),
        build() {
            // Canvas 子元素：MapBridge 每帧把离屏地图 drawImage 进来
            return [
                { tag: 'Canvas', width: 300, height: 300 }
            ];
        },
        update(box, frameData, progress, ctx) {
            const cfg = box.__leaferConfig || this.defaultConfig;
            const canvasChild = box.children && box.children[0];
            mapBridge.renderFrame(this.id, mode, cfg, canvasChild, frameData, ctx);
        }
    };
}

const zoomSetting = { name: 'Zoom', key: 'zoom', type: 'number', min: 3, max: 26 };
// maptalks 侧换算为 zoom 级别降量，50 ≈ 缩小到 70.7%（恰好让矩形轨迹完整落进内切圆）
const paddingSetting = { name: 'Fit margin %', key: 'fitPadding', type: 'number', min: 0, max: 50 };

// ============================================================
// 1. 全图导航（整条轨迹概览 + 渐进线，老款 web_map_pan）
// ============================================================
const web_map_full_pan = makeWebMap(
    'web_map_full_pan', 'Web Map Full', './images/w3.png', 'full',
    { fitPadding: 30 },
    [paddingSetting],
    ['distance']
);

// ============================================================
// 2. 跟随小图（2D 跟随当前位置，老款 web_minimap_pan）
// ============================================================
const web_map_mini_pan = makeWebMap(
    'web_map_mini_pan', 'Web Map Mini', './images/w4.png', 'mini',
    { x: W - 620, y: 540, zoom: 16 },
    [zoomSetting],
    ['distance']
);

// ============================================================
// 3. 3D 旋转导航（俯仰 60° + 方位角旋转，老款 web_rotatemap_pan）
// ============================================================
const web_map_rotate_pan = makeWebMap(
    'web_map_rotate_pan', 'Web Map 3D Rotate', './images/w6.png', 'rotate',
    { x: W - 940, y: 540, zoom: 16 },
    [zoomSetting],
    ['distance', 'azimuth']
);

// ============================================================
// 4. 高德 3D 导航（老款 web_gaodemap_pan，默认 AMap 框架）
// ============================================================
const web_map_gaode_pan = makeWebMap(
    'web_map_gaode_pan', 'Web Map AMap', './images/w7.png', 'rotate',
    { x: W - 940, y: 200, framework: 'amap', mapSource: 'amapNormal', zoom: 20 },
    [zoomSetting],
    ['distance', 'azimuth']
);

export const webMapPanels = [
    web_map_full_pan,
    web_map_mini_pan,
    web_map_rotate_pan,
    web_map_gaode_pan
];
