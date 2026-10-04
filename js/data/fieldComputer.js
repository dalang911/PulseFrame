/**
 * fieldComputer.js - 字段计算补齐
 * 从原 index.html 的 processJson() 中提取的计算逻辑：
 *   - 坡度 (slope)
 *   - 累计爬升 (Gain) / 累计下降 (Loss)
 *   - 方位角 (azimuth)
 *   - 图表坐标映射（心率/步频/配速/高程/功率的画布坐标）
 */

import { mapToRange, douglasPeucker } from '../utils/math.js';

/**
 * 计算坡度（slope）
 * 使用前后点的中心差分法，结果限制在 [-1, 1]
 * @param {Array} trkpt
 */
export function computeSlope(trkpt) {
    trkpt.forEach((point, index) => {
        if (index === 0 || index === trkpt.length - 1) {
            point.slope = 0;
            return;
        }

        const prevPt = trkpt[index - 1];
        const nextPt = trkpt[index + 1];
        const totalDistance = nextPt.distance - prevPt.distance;

        if (totalDistance === 0) {
            point.slope = 0;
            return;
        }

        const totalAltitude = nextPt.altitude - prevPt.altitude;
        let nowSlope = Math.round((totalAltitude / totalDistance) * 100) / 100;

        if (nowSlope > 1) nowSlope = 1;
        else if (nowSlope < -1) nowSlope = -1;

        point.slope = nowSlope;
    });
}

/**
 * 计算累计爬升 (Gain) 和累计下降 (Loss)
 * 使用 0.15m 最小高度变化阈值过滤噪声
 * @param {Array} trkpt
 */
export function computeGainLoss(trkpt) {
    const MIN_ALTITUDE_CHANGE = 0.15;

    trkpt.forEach((point, index) => {
        if (index === 0) {
            point.Gain = 0;
            point.Loss = 0;
            return;
        }

        const prevAltitude = trkpt[index - 1].altitude ?? 0;
        const currentAltitude = point.altitude ?? 0;
        const altitudeDiff = currentAltitude - prevAltitude;

        let cumulativeGain = trkpt[index - 1].Gain ?? 0;
        let cumulativeLoss = trkpt[index - 1].Loss ?? 0;

        if (altitudeDiff > MIN_ALTITUDE_CHANGE) {
            cumulativeGain += altitudeDiff;
        } else if (altitudeDiff < -MIN_ALTITUDE_CHANGE) {
            cumulativeLoss += Math.abs(altitudeDiff);
        }

        point.Gain = Math.round(cumulativeGain * 100) / 100;
        point.Loss = Math.round(cumulativeLoss * 100) / 100;
    });
}

/**
 * 计算方位角 (azimuth)
 * 球面三角学公式，结果 0~360 度
 * @param {Array} trkpt
 */
export function computeAzimuth(trkpt) {
    trkpt.forEach((point, index) => {
        if (index === trkpt.length - 1) {
            point.azimuth = trkpt[index - 1].azimuth;
            return;
        }

        const nextPt = trkpt[index + 1];
        const lat1 = point.position_lat * Math.PI / 180;
        const lon1 = point.position_long * Math.PI / 180;
        const lat2 = nextPt.position_lat * Math.PI / 180;
        const lon2 = nextPt.position_long * Math.PI / 180;

        const deltaLambda = lon2 - lon1;
        const y = Math.sin(deltaLambda) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLambda);
        const thetaRad = Math.atan2(y, x);

        point.azimuth = Math.round((thetaRad * 180 / Math.PI + 360) % 360);
    });
}

/**
 * 计算地图投影坐标（扁平数组 [x,y,x,y,...]）
 * @param {Array} trkpt
 * @param {number} [canvasWidth=600]
 * @param {number} [canvasHeight=600]
 * @returns {number[]} 扁平坐标数组
 */
export function computeMapPoints(trkpt, canvasWidth = 600, canvasHeight = 600) {
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    trkpt.forEach(p => {
        minLon = Math.min(minLon, p.position_long);
        maxLon = Math.max(maxLon, p.position_long);
        minLat = Math.min(minLat, p.position_lat);
        maxLat = Math.max(maxLat, p.position_lat);
    });

    const lonSpan = maxLon - minLon || 1;
    const latSpan = maxLat - minLat || 1;
    const geoRatio = lonSpan / latSpan;
    const canvasRatio = canvasWidth / canvasHeight;
    const scale = geoRatio > canvasRatio ? canvasWidth / lonSpan : canvasHeight / latSpan;

    const contentWidth = lonSpan * scale;
    const contentHeight = latSpan * scale;
    const offsetX = (canvasWidth - contentWidth) / 2;
    const offsetY = (canvasHeight - contentHeight) / 2;

    const mapPoints = [];
    trkpt.forEach(p => {
        const rawX = (p.position_long - minLon) * scale;
        const rawY = (maxLat - p.position_lat) * scale;
        mapPoints.push(offsetX + rawX, offsetY + rawY);
    });

    return mapPoints;
}

/**
 * 计算图表数据坐标
 * @param {Array} trkpt - 轨迹点数组
 * @returns {Object} 各类图表坐标数据
 */
export function computeChartPoints(trkpt) {
    if (!trkpt || trkpt.length === 0) return {};

    const xScale = 400 / (trkpt.length - 1);
    const totalDistance = trkpt[trkpt.length - 1].distance || 0;

    // 统计极值
    let heartRateMin = Infinity, heartRateMax = -Infinity;
    let cadenceMin = Infinity, cadenceMax = -Infinity;
    let paceMin = Infinity, paceMax = -Infinity;
    let eleMin = Infinity, eleMax = -Infinity;
    let powerMin = Infinity, powerMax = -Infinity;

    trkpt.forEach(p => {
        const hr = p.heart_rate ?? 0;
        if (typeof hr === 'number') { heartRateMin = Math.min(heartRateMin, hr); heartRateMax = Math.max(heartRateMax, hr); }
        const cad = p.cadence ?? 0;
        if (typeof cad === 'number') { cadenceMin = Math.min(cadenceMin, cad); cadenceMax = Math.max(cadenceMax, cad); }
        const spd = p.speed ?? 0;
        if (typeof spd === 'number') { paceMin = Math.min(paceMin, spd); paceMax = Math.max(paceMax, spd); }
        const ele = p.altitude ?? 0;
        if (typeof ele === 'number') { eleMin = Math.min(eleMin, ele); eleMax = Math.max(eleMax, ele); }
        const pwr = p.power ?? 0;
        if (typeof pwr === 'number') { powerMin = Math.min(powerMin, pwr); powerMax = Math.max(powerMax, pwr); }
    });

    const user_heartRateMax = Math.ceil((heartRateMax + 10) / 10) * 10;
    const baseAltitude = trkpt[0].altitude || 0;

    // 图表坐标数组
    const heart_points = [];
    const pt_heart_points = [];
    const cadences_points = [];
    const paces_points = [];
    const pt_paces_points = [];
    const ele_points = [];
    const pt_ele_points = [];
    const ele18_points = [];
    const o2o_ele_points = [];

    for (let i = 0; i < trkpt.length; i++) {
        const p = trkpt[i];

        // 心率
        let heartY = mapToRange(p.heart_rate, 40, heartRateMax, 40, 200);
        heart_points.push(i * xScale, 200 - heartY);
        heartY = mapToRange(p.heart_rate, heartRateMin, heartRateMax, 0, 200);
        pt_heart_points.push(i * xScale, 200 - heartY);

        // 步频
        let cadenceY = mapToRange(p.cadence, 120, cadenceMax, 60, 160);
        cadences_points.push(i * xScale, 200 - cadenceY);

        // 配速/速度
        let paceY = mapToRange(p.speed, 0, paceMax, 20, 120);
        paces_points.push(i * xScale, 200 - paceY);
        paceY = mapToRange(p.speed, paceMin, paceMax, 0, 200);
        pt_paces_points.push(i * xScale, 200 - paceY);

        // 高程
        const jdtcd400 = (p.distance / totalDistance) * 400;
        let eleY = mapToRange(p.altitude, eleMin - 5, eleMax + 5, 0, 200);
        ele_points.push(jdtcd400, 200 - eleY);
        eleY = mapToRange(p.altitude, eleMin, eleMax, 0, 200);
        pt_ele_points.push(i * xScale, 200 - eleY);

        // 高程 1:8
        const jdtcd800 = (p.distance / totalDistance) * 800;
        let eleY18 = mapToRange(p.altitude, eleMin - 5, eleMax + 5, 0, 50);
        ele18_points.push(jdtcd800, 50 - eleY18);

        // 等比例高程
        const o2o_x = p.distance * 5;
        const o2o_y = (p.altitude - baseAltitude) * -5;
        o2o_ele_points.push(o2o_x, o2o_y);
    }

    // zh 高程（进度条内嵌高程）
    const maxWidth = (totalDistance / 1000) * 30;
    const eleFromMin = eleMin - 5;
    const eleFromMax = eleMax + 5;
    const bottomOffset = 10;
    const eleToMin = 40 - bottomOffset;
    const eleToMax = 10;

    let rawPoints = [];
    for (let j = 0; j < trkpt.length; j++) {
        const x = totalDistance === 0 ? 0 : (trkpt[j].distance / 1000) * 30;
        const eleY = mapToRange(trkpt[j].altitude, eleFromMin, eleFromMax, eleToMin, eleToMax);
        rawPoints.push([x, eleY]);
    }

    const sparsePoints = douglasPeucker(rawPoints, 2);
    let baseElePoints = [];
    let baseEleYList = [];
    sparsePoints.forEach(([x, y]) => {
        baseElePoints.push(x, y);
        baseEleYList.push(y);
    });

    const zh_ele_points = [...baseElePoints, maxWidth, 0, 0, 0];

    const mirrorBaseline = eleToMin;
    const zh_eled_points = [];
    sparsePoints.forEach(([x], idx) => {
        const eleY = baseEleYList[idx];
        const eledY = mirrorBaseline + (mirrorBaseline - eleY);
        zh_eled_points.push(x, eledY);
    });
    zh_eled_points.push(maxWidth, mirrorBaseline, 0, mirrorBaseline);

    return {
        heart_points, pt_heart_points,
        cadences_points,
        paces_points, pt_paces_points,
        ele_points, pt_ele_points, ele18_points,
        o2o_ele_points,
        zh_ele_points, zh_eled_points,
        // 极值供组件使用
        heartRateMin, heartRateMax, user_heartRateMax,
        cadenceMin, cadenceMax,
        paceMin, paceMax,
        eleMin, eleMax,
        powerMin, powerMax,
        baseAltitude
    };
}

/**
 * 一次性计算所有补齐字段
 * @param {Object} data - rq 数据结构
 * @returns {Object} 图表坐标数据
 */
export function computeAllFields(data) {
    const trkpt = data.data.trkpt;

    computeSlope(trkpt);
    computeGainLoss(trkpt);
    computeAzimuth(trkpt);

    const chartData = computeChartPoints(trkpt);
    const mapPoints = computeMapPoints(trkpt);

    return { ...chartData, mapPoints };
}
