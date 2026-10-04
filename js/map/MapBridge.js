/**
 * MapBridge.js - 在线地图桥接层（移植自老款 setmaptalks.js，重构为 ESM 单例）
 *
 * 职责：
 *   1. 为每个 web 地图组件维护一个离屏隐藏 div + 地图实例（maptalks / AMap 双框架）
 *   2. 逐帧更新地图上的轨迹线/当前位置，并把地图 canvas 合成到 Leafer Canvas 元素
 *   3. WGS84 → GCJ-02 批量转换缓存（WeakMap 按轨迹数组引用缓存，预览/导出逐帧复用）
 *
 * 与老款差异：
 *   - 懒创建：地图实例只在组件首次 update 时创建（老款页面加载即建 4 个）
 *   - 可销毁：框架/图源切换、组件删除时彻底销毁旧实例（老款只建不销）
 *   - 设置走 config 数据流，不再用 new Function 执行 eval 字符串
 */

import { eventBus, Events } from '../core/EventBus.js';
import { store } from '../core/Store.js';

// ============================================================
// 瓦片图源配置（maptalks 侧，均为 WGS84 境外源，老款原样搬入）
// ============================================================
const MAP_SOURCES = {
    osmHot: {
        id: 'osmHot',
        name: 'OSM.FR',
        urlTemplate: 'https://tile-{s}.openstreetmap.fr/hot/{z}/{x}/{y}.png',
        subdomains: ['b', 'c'],
        crossOrigin: 'anonymous',
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="http://hot.openstreetmap.org/">Humanitarian OpenStreetMap Team</a>',
        minZoom: 1,
        maxZoom: 19
    },
    carto: {
        id: 'carto',
        name: 'Carto',
        urlTemplate: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        subdomains: ["a", "b", "c", "d"],
        crossOrigin: 'anonymous',
        attribution: '&copy; <a href="http://osm.org">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
        minZoom: 1,
        maxZoom: 19
    },
    arcgisonline: {
        id: 'arcgisonline',
        name: 'Esri.WorldImagery',
        urlTemplate: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        crossOrigin: 'anonymous',
        attribution: '&copy; Esri',
        minZoom: 1,
        maxZoom: 20
    }
};

// 地图渲染尺寸上限（组件被拖得很大时按此上限渲染再缩放合成，避免超大离屏 div 浪费内存）
const MAX_MAP_SIZE = 768;
const DEFAULT_CENTER = [118.9, 33.8];

// ============================================================
// WGS84 → GCJ-02 坐标转换（老款标准算法原样搬入）
// ============================================================
function transformLat(x, y) {
    const PI = Math.PI;
    let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * PI) + 320.0 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function transformLng(x, y) {
    const PI = Math.PI;
    let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x * PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function isInChina(lng, lat) {
    return lng >= 73.66 && lng <= 135.05 && lat >= 3.86 && lat <= 53.55;
}

function wgs84ToGcj02(lng, lat) {
    const PI = Math.PI;
    const a = 6378137.0;
    const ee = 0.00669342162296594323;

    // 境外不偏移
    if (!isInChina(lng, lat)) return { lng, lat };

    let dLat = transformLat(lng - 105.0, lat - 35.0);
    let dLng = transformLng(lng - 105.0, lat - 35.0);
    const radLat = lat / 180.0 * PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);

    return { lng: lng + dLng, lat: lat + dLat };
}

/**
 * 整条轨迹 [lng,lat] 数组（WGS84，无效点以 null 占位保证与帧号对齐）
 * 按 trkpt 数组引用缓存，数据加载后只构建一次
 */
const wgsPathCache = new WeakMap();
function getWgsPath(trkptData) {
    let path = wgsPathCache.get(trkptData);
    if (path) return path;
    path = [];
    for (let i = 0; i < trkptData.length; i++) {
        const lng = trkptData[i].position_long;
        const lat = trkptData[i].position_lat;
        if (typeof lng === 'number' && !isNaN(lng) && typeof lat === 'number' && !isNaN(lat) &&
            lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90) {
            path.push([lng, lat]);
        } else {
            path.push(null);
        }
    }
    wgsPathCache.set(trkptData, path);
    return path;
}

/**
 * 整条轨迹 GCJ-02 数组 —— 在 WGS 缓存基础上一次批量转换，同样按引用缓存
 * （老款每帧重复调用 batchWgs84ToGcj02，新版仅数据变化时转换一次，预览/导出逐帧复用）
 */
const gcjPathCache = new WeakMap();
function getGcjPath(trkptData) {
    let path = gcjPathCache.get(trkptData);
    if (path) return path;
    const wgs = getWgsPath(trkptData);
    path = new Array(wgs.length);
    for (let i = 0; i < wgs.length; i++) {
        const p = wgs[i];
        if (!p) continue;
        const gcj = wgs84ToGcj02(p[0], p[1]);
        path[i] = [Number(gcj.lng.toFixed(8)), Number(gcj.lat.toFixed(8))];
    }
    gcjPathCache.set(trkptData, path);
    return path;
}

// ============================================================
// MapBridge 单例
// ============================================================
class MapBridge {
    constructor() {
        /** @type {Map<string, Object>} componentId -> 地图记录 */
        this._components = new Map();

        // 组件删除时销毁对应地图与离屏 div
        eventBus.on(Events.COMPONENT_REMOVED, (id) => this.removeComponent(id));
    }

    /**
     * 逐帧渲染：确保地图存在 → 更新轨迹/视野 → 合成到 Leafer Canvas
     * @param {string} componentId - 组件 id（单实例约束保证唯一）
     * @param {string} mode - 'full' | 'mini' | 'rotate'
     * @param {Object} cfg - 组件实时配置（box.__leaferConfig）
     * @param {Object} canvasChild - Leafer Canvas 子元素（drawImage 目标）
     * @param {Object} frameData - 当前帧数据（position_lat/position_long/azimuth）
     * @param {Object} ctx - { trkptData, currentFrame, maxFrame }
     */
    renderFrame(componentId, mode, cfg, canvasChild, frameData, ctx) {
        if (!canvasChild || !ctx || !ctx.trkptData || !ctx.trkptData.length) return;

        const framework = cfg.framework === 'amap' ? 'amap' : 'maptalks';
        const source = this._normalizeSource(framework, cfg.mapSource);
        const key = `${framework}|${source}|${mode}`;

        let rec = this._components.get(componentId);
        if (rec && rec.key !== key) {
            // 框架/图源/模式变化：销毁重建
            this.removeComponent(componentId);
            rec = null;
        }
        if (!rec) {
            rec = this._create(componentId, mode, framework, source, cfg);
            if (!rec) return;
        }

        rec.canvasChild = canvasChild;
        rec.cfg = cfg;

        // 颜色/线宽/点大小变更（设置项修改）：同步到地图对象，不重建实例
        const styleKey = `${cfg.backgroundColor}|${cfg.progressColor}|${cfg.pointColor}|${cfg.lineWidth}|${cfg.progressWidth}|${cfg.pointSize}`;
        if (rec.styleKey !== styleKey) {
            rec.styleKey = styleKey;
            this._applyStyle(rec);
        }

        // 数据变化（重新上传文件）时刷新整条背景轨迹与视野
        if (rec.trkptRef !== ctx.trkptData) {
            rec.trkptRef = ctx.trkptData;
            this._syncPath(rec);
            rec.viewKey = this._viewKeyOf(mode, cfg);
        } else {
            // zoom / fitPadding 变更（设置项修改）：仅同步视图，不重建地图
            const vk = this._viewKeyOf(mode, cfg);
            if (rec.viewKey !== vk) {
                rec.viewKey = vk;
                this._applyView(rec);
            }
        }

        const path = rec.framework === 'amap' ? getGcjPath(rec.trkptRef) : getWgsPath(rec.trkptRef);
        const index = Math.max(0, Math.min(ctx.currentFrame | 0, path.length - 1));
        const coord = path[index];
        if (!coord) return;

        // 进度线 + 当前位置
        if (rec.framework === 'maptalks') {
            rec.marker.setCoordinates(coord);
            rec.prog.setCoordinates(this._validSlice(path, 0, index + 1));
        } else {
            rec.marker.setCenter(coord);
            rec.prog.setPath(this._validSlice(path, 0, index + 1));
        }

        // 视野跟随
        if (mode === 'mini') {
            if (rec.framework === 'maptalks') rec.map.setCenter(coord);
            else rec.map.setCenter(coord, true);
        } else if (mode === 'rotate') {
            const azimuth = frameData.azimuth || 0;
            if (rec.framework === 'maptalks') {
                rec.map.setCenter(coord);
                rec.map.setBearing(azimuth);
            } else {
                rec.map.setCenter(coord, true);
                rec.map.setRotation(0 - azimuth, true);
            }
        }
        // full：视野固定（_syncPath 已 fit），无需逐帧调整

        // 缩放跟随：Leafer Canvas 尺寸变化时同步离屏地图尺寸（节流）
        this._syncSize(rec, canvasChild);

        // 合成：地图 canvas → Leafer Canvas context → paint
        const mapCanvas = rec.div.querySelector('canvas');
        if (!mapCanvas || !mapCanvas.width) return;
        const ctx2d = canvasChild.context;
        if (!ctx2d) return;
        ctx2d.drawImage(mapCanvas, 0, 0, canvasChild.width, canvasChild.height);
        canvasChild.paint();
    }

    /**
     * 销毁组件对应的地图实例与离屏 div
     * @param {string} componentId
     */
    removeComponent(componentId) {
        const rec = this._components.get(componentId);
        if (!rec) return;
        try {
            if (rec.framework === 'maptalks') rec.map.remove();
            else rec.map.destroy();
        } catch (err) {
            console.warn(`[MapBridge] Destroy ${componentId} failed:`, err);
        }
        if (rec.sizeTimer) clearTimeout(rec.sizeTimer);
        if (rec.div && rec.div.parentNode) rec.div.parentNode.removeChild(rec.div);
        this._components.delete(componentId);
    }

    /** 销毁全部地图（画布清空等场景） */
    removeAll() {
        [...this._components.keys()].forEach(id => this.removeComponent(id));
    }

    /**
     * 地图预载 pass（视频导出前调用）：把渲染范围快速播放一遍（约 5 秒，
     * 50ms/步、每步 1% 进度），让离屏地图逐帧渲染并预热瓦片缓存，
     * 避免导出前几帧地图背景滞后。无活动地图组件时直接跳过不增加等待。
     * @param {number} startFrame - 渲染范围起帧
     * @param {number} endFrame - 渲染范围止帧
     * @param {Function} [onProgress] - (percent 0-100) => void
     * @returns {Promise<boolean>} 是否实际执行了预载
     */
    async preloadMaps(startFrame, endFrame, onProgress) {
        if (!this._components.size) return false;
        const trkptData = store.get('trkptData');
        if (!trkptData || !trkptData.length) return false;

        const from = Math.max(0, startFrame | 0);
        const to = Math.min(trkptData.length - 1, Number.isFinite(endFrame) ? endFrame | 0 : trkptData.length - 1);
        const savedFrame = store.get('currentFrame');
        const STEP_MS = 50;                                   // 1 秒 20 帧
        const step = Math.max(1, Math.round((to - from) / 100)); // 每帧约 1% 进度 → 100 步 ≈ 5s

        for (let f = from; f <= to; f += step) {
            store.set('currentFrame', f);
            eventBus.emit(Events.FRAME_UPDATE, f);
            if (onProgress) onProgress(Math.min(100, Math.round(((f - from) / Math.max(1, to - from)) * 100)));
            await new Promise(r => setTimeout(r, STEP_MS));
        }
        // 补跑止帧后恢复预览位置
        store.set('currentFrame', to);
        eventBus.emit(Events.FRAME_UPDATE, to);
        if (onProgress) onProgress(100);

        const restore = Number.isFinite(savedFrame) ? savedFrame : from;
        store.set('currentFrame', restore);
        eventBus.emit(Events.FRAME_UPDATE, restore);
        return true;
    }

    // ============================================================
    // 内部实现
    // ============================================================

    /** 图源与框架不匹配时回退到该框架默认源 */
    _normalizeSource(framework, source) {
        if (framework === 'amap') {
            return (source === 'amapSatellite') ? source : 'amapNormal';
        }
        return MAP_SOURCES[source] ? source : 'osmHot';
    }

    /**
     * fitPadding 设置（0-50）归一化为 0-0.5 比例。
     * 注意两框架语义不同：maptalks fitExtent 第二参会直接加到 zoom 级别上（源码 getFitZoom(...)+(e||0)），
     * 传负值才是向内缩；AMap setBounds 的 avoid 是像素内缩，需按容器尺寸换算。
     */
    _fitRatio(cfg) {
        const p = Number(cfg.fitPadding);
        return Number.isFinite(p) ? Math.min(Math.max(p, 0), 50) / 100 : 0.13;
    }

    /** 创建离屏容器 + 地图实例 + 矢量对象 */
    _create(componentId, mode, framework, source, cfg) {
        const div = document.createElement('div');
        div.style.cssText = 'width:300px;height:300px;position:fixed;left:-3000px;top:0;visibility:hidden;';
        document.body.appendChild(div);

        const rec = {
            id: componentId,
            key: `${framework}|${source}|${mode}`,
            mode, framework, source,
            div, cfg,
            canvasChild: null,
            map: null, bg: null, prog: null, marker: null,
            trkptRef: null, viewKey: null, styleKey: null,
            divW: 300, divH: 300,
            sizeTimer: null
        };

        try {
            if (framework === 'maptalks') this._createMaptalks(rec, div, mode, source, cfg);
            else this._createAmap(rec, div, mode, source, cfg);
        } catch (err) {
            console.error(`[MapBridge] Create map for ${componentId} failed:`, err);
            if (div.parentNode) div.parentNode.removeChild(div);
            return null;
        }

        this._components.set(componentId, rec);
        return rec;
    }

    _createMaptalks(rec, div, mode, source, cfg) {
        const renderer = mode === 'rotate' ? 'gl' : 'canvas';
        const zoom = this._zoomOf(mode, cfg, 16);
        const options = {
            center: DEFAULT_CENTER,
            zoom,
            baseLayer: new maptalks.TileLayer('base', { renderer, ...MAP_SOURCES[source] })
        };
        if (mode === 'rotate') options.pitch = 60;

        rec.map = new maptalks.Map(div, options);

        rec.bg = new maptalks.LineString([], {
            symbol: { 'lineColor': cfg.backgroundColor || '#FFFF00', 'lineWidth': 5, 'lineOpacity': 0.9 }
        });
        rec.prog = new maptalks.LineString([], {
            symbol: { 'lineColor': cfg.progressColor || '#FF8C00', 'lineWidth': 5, 'lineOpacity': 0.9 }
        });
        rec.marker = new maptalks.Marker(DEFAULT_CENTER, {
            symbol: {
                'markerType': 'ellipse',
                'markerFill': cfg.pointColor || '#FF6347',
                'markerFillOpacity': 0.9,
                'markerLineWidth': 0,
                'markerWidth': 15,
                'markerHeight': 15
            }
        });

        new maptalks.VectorLayer('vector').addGeometry([rec.bg, rec.prog, rec.marker]).addTo(rec.map);
    }

    _createAmap(rec, div, mode, source, cfg) {
        // 高德脚本由 index.html 按 site.config.js 里的 amapKey 按需加载；未配置时给出明确报错
        if (typeof AMap === 'undefined') {
            throw new Error('[PulseFrame] AMap JS API 未加载：请在 site.config.js 中设置 PULSEFRAME_CONFIG.amapKey，或把该图层换成 maptalks 源');
        }
        const zoom = this._zoomOf(mode, cfg, 16);
        rec.map = new AMap.Map(div, {
            center: DEFAULT_CENTER,
            zoom,
            zooms: [2, 26],
            viewMode: '3D',           // 3D 模式整图渲染到 WebGL canvas，保证 drawImage 能提到底图
            pitch: mode === 'rotate' ? 60 : 0,
            rotation: 0,
            WebGLParams: { preserveDrawingBuffer: true } // 允许逐帧截图（老款已验证必要）
        });

        rec.bg = new AMap.Polyline({
            strokeColor: cfg.backgroundColor || '#FFFF00',
            strokeOpacity: 0.9, strokeWeight: 5,
            strokeStyle: 'solid', lineJoin: 'round', lineCap: 'round'
        });
        rec.prog = new AMap.Polyline({
            strokeColor: cfg.progressColor || '#FF8C00',
            strokeOpacity: 0.9, strokeWeight: 5,
            strokeStyle: 'solid', lineJoin: 'round', lineCap: 'round'
        });
        rec.marker = new AMap.CircleMarker({
            center: DEFAULT_CENTER,
            radius: 15, strokeWeight: 0,
            fillColor: cfg.pointColor || '#FF6347', fillOpacity: 0.9
        });
        rec.map.add([rec.bg, rec.prog, rec.marker]);

        if (source === 'amapSatellite') {
            rec.map.setLayers([new AMap.TileLayer.Satellite()]);
        }
    }

    _zoomOf(mode, cfg, fallback) {
        const z = Number(cfg.zoom);
        if (mode !== 'full' && Number.isFinite(z) && z > 0) return z;
        return fallback;
    }

    /** 视图参数指纹：zoom / fitPadding 任一变化即需重新应用视野 */
    _viewKeyOf(mode, cfg) {
        return `${this._zoomOf(mode, cfg, mode === 'full' ? 0 : (cfg.framework === 'amap' ? 20 : 16))}|${this._fitPadding(cfg)}`;
    }

    /** 把颜色/线宽/点大小配置同步到地图矢量对象（两框架 API 不同） */
    _applyStyle(rec) {
        const cfg = rec.cfg;
        const lineW = Number(cfg.lineWidth) || 5;
        const progW = Number(cfg.progressWidth) || lineW;
        const ptSize = Number(cfg.pointSize) || 15;
        if (rec.framework === 'maptalks') {
            rec.bg.updateSymbol({ 'lineColor': cfg.backgroundColor || '#FFFF00', 'lineWidth': lineW });
            rec.prog.updateSymbol({ 'lineColor': cfg.progressColor || '#FF8C00', 'lineWidth': progW });
            rec.marker.updateSymbol({ 'markerFill': cfg.pointColor || '#FF6347', 'markerWidth': ptSize, 'markerHeight': ptSize });
        } else {
            rec.bg.setOptions({ strokeColor: cfg.backgroundColor || '#FFFF00', strokeWeight: lineW });
            rec.prog.setOptions({ strokeColor: cfg.progressColor || '#FF8C00', strokeWeight: progW });
            rec.marker.setOptions({ fillColor: cfg.pointColor || '#FF6347', radius: ptSize / 2 }); // pointSize 统一按直径语义
        }
    }

    /** 仅调整视野（zoom 变更或 full 重新 fit），不重设路径 */
    _applyView(rec) {
        if (!rec.trkptRef) return;
        const path = rec.framework === 'amap' ? getGcjPath(rec.trkptRef) : getWgsPath(rec.trkptRef);
        const valid = this._validSlice(path, 0, path.length);
        if (!valid.length) return;
        const zoom = this._zoomOf(rec.mode, rec.cfg, rec.framework === 'amap' ? 20 : 16);

        if (rec.framework === 'maptalks') {
            if (rec.mode === 'full') {
                // 负值：fitZoom 基础上降低级别，轨迹整体缩小向圆内收拢
                rec.map.fitExtent(rec.bg.getExtent(), -this._fitPadding(rec.cfg));
            } else {
                rec.map.setZoom(zoom, false);
            }
        } else {
            if (rec.mode === 'full') {
                rec.map.setBounds(this._boundsOf(valid), true, this._amapAvoid(rec));
            } else {
                rec.map.setZoom(zoom, true);
            }
        }
    }

    /**
     * AMap setBounds 的像素内缩 avoid [上,下,左,右]。
     * 与 maptalks 对齐：fitExtent 降 r 个级别 → 内容线性占比 2^-r；AMap 每边内缩 x 占比 → 内容占比 1-2x，
     * 令两者相等得 x = (1 - 2^-r) / 2。
     */
    _amapAvoid(rec) {
        const r = this._fitPadding(rec.cfg);
        const px = Math.round((1 - Math.pow(2, -r)) / 2 * Math.min(rec.divW, rec.divH));
        return [px, px, px, px];
    }

    /** 数据（重新）加载后：刷新背景线、进度复位、fit 视野到合适范围 */
    _syncPath(rec) {
        const path = rec.framework === 'amap' ? getGcjPath(rec.trkptRef) : getWgsPath(rec.trkptRef);
        const valid = this._validSlice(path, 0, path.length);
        if (!valid.length) return;

        if (rec.framework === 'maptalks') {
            rec.bg.setCoordinates(valid);
            rec.prog.setCoordinates([]);
            rec.marker.setCoordinates(valid[0]);
            if (rec.mode === 'full') {
                rec.map.fitExtent(rec.bg.getExtent(), -this._fitPadding(rec.cfg));
            } else {
                rec.map.setCenterAndZoom(valid[0], this._zoomOf(rec.mode, rec.cfg, 16));
            }
        } else {
            rec.bg.setPath(valid);
            rec.prog.setPath([]);
            rec.marker.setCenter(valid[0]);
            if (rec.mode === 'full') {
                rec.map.setBounds(this._boundsOf(valid), true, this._amapAvoid(rec));
            } else {
                rec.map.setZoomAndCenter(this._zoomOf(rec.mode, rec.cfg, 20), valid[0], true);
            }
        }
    }

    _fitPadding(cfg) {
        return this._fitRatio(cfg);
    }

    _boundsOf(path) {
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        for (const [lng, lat] of path) {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        }
        return new AMap.Bounds(new AMap.LngLat(minLng, minLat), new AMap.LngLat(maxLng, maxLat));
    }

    /** 过滤 null 占位点（无效坐标帧），保持折线连续 */
    _validSlice(path, from, to) {
        const out = [];
        for (let i = from; i < to && i < path.length; i++) {
            if (path[i]) out.push(path[i]);
        }
        return out;
    }

    /** 离屏 div 尺寸跟随 Leafer Canvas 实际大小（200ms 节流，上限 MAX_MAP_SIZE） */
    _syncSize(rec, canvasChild) {
        const w = Math.min(Math.round(canvasChild.width || 300), MAX_MAP_SIZE);
        const h = Math.min(Math.round(canvasChild.height || 300), MAX_MAP_SIZE);
        if (w === rec.divW && h === rec.divH) return;

        if (rec.sizeTimer) clearTimeout(rec.sizeTimer);
        rec.sizeTimer = setTimeout(() => {
            rec.sizeTimer = null;
            if (!rec.div.parentNode) return; // 已销毁
            rec.divW = w; rec.divH = h;
            rec.div.style.width = w + 'px';
            rec.div.style.height = h + 'px';
            if (rec.framework === 'maptalks') {
                rec.map.setSize({ width: w, height: h });
            } else {
                rec.map.resize();
            }
            // full 模式的 fit 基于旧容器尺寸计算，resize 后需重新内缩一次
            if (rec.mode === 'full' && rec.trkptRef) this._applyView(rec);
        }, 200);
    }
}

// 单例导出
export const mapBridge = new MapBridge();
