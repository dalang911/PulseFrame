/**
 * parsers/index.js - 统一解析入口
 * 检测文件格式 → 调用对应解析器 → 转换为统一数据结构 (rq)
 *
 * 原始解析器（GPXParser / TCXParser / FitParser）作为全局脚本加载，
 * 本模块负责调用它们并将输出标准化为 rq 格式。
 */

import { normalValue, calculateDistance, computeLaps, formatDateTime, createEmptyRq } from './utils.js';

/**
 * 检测文件格式
 * @param {File} file - 用户上传的文件对象
 * @returns {string} 'gpx' | 'tcx' | 'fit' | 'json' | 'unknown'
 */
export function detectFormat(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.gpx')) return 'gpx';
    if (name.endsWith('.tcx')) return 'tcx';
    if (name.endsWith('.fit')) return 'fit';
    if (name.endsWith('.json')) return 'json';
    return 'unknown';
}

/**
 * 读取文件为文本/ArrayBuffer
 * @param {File} file
 * @param {string} format - 'gpx'|'tcx'|'json' 用 text，'fit' 用 arrayBuffer
 * @returns {Promise<string|ArrayBuffer>}
 */
function readFile(file, format) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('File read error: ' + e.message));

        if (format === 'fit') {
            reader.readAsArrayBuffer(file);
        } else {
            reader.readAsText(file);
        }
    });
}

/**
 * GPX 内容 → 统一 rq 数据结构
 * @param {string} gpxContent - GPX 文本
 * @returns {Object} rq 数据结构
 */
export function gpxToRq(gpxContent) {
    const rq = createEmptyRq();

    /* global gpxParser */
    const gpx = new gpxParser();
    gpx.parse(gpxContent);

    if (!gpx.tracks || gpx.tracks.length === 0) {
        rq.status = -1;
        return rq;
    }

    const firstPointTime = new Date(gpx.tracks[0].points[0].time).getTime();
    const isCoros = gpx.metadata?.link?.text === 'COROS';
    let cadenceSum = 0;
    let cadenceCount = 0;
    let sec = 0;

    for (let i = 0; i < gpx.tracks[0].points.length; i++) {
        const cp = gpx.tracks[0].points[i];
        sec = Math.floor((new Date(cp.time).getTime() - firstPointTime) / 1000);
        const timeCurrent = Math.floor(new Date(cp.time).getTime() / 1000);
        let distanceCurrent = 0;
        let speed = 0;
        let cadenceCorrected = cp.cad || 0;

        if (i > 0) {
            distanceCurrent = gpx.tracks[0].distance.cumul[i - 1];
        }

        // 速度计算
        if (isCoros) {
            const corosSpeed = cp.speed ?? 0;
            speed = (corosSpeed * 3600) / 1000;
        } else {
            if (i > 0 && i < gpx.tracks[0].points.length - 1) {
                const prevPt = gpx.tracks[0].points[i - 1];
                const nextPt = gpx.tracks[0].points[i + 1];
                const timePrev = new Date(prevPt.time).getTime() / 1000;
                const timeNext = new Date(nextPt.time).getTime() / 1000;
                const distPrev = i > 1 ? gpx.tracks[0].distance.cumul[i - 1] : 0;
                const distNext = gpx.tracks[0].distance.cumul[i + 1];
                const speedPrev = (distanceCurrent - distPrev) / (timeCurrent - timePrev);
                const speedNext = (distNext - distanceCurrent) / (timeNext - timeCurrent);
                speed = (speedPrev + speedNext) / 2;
            }
            speed = speed * 3.6;
        }

        // 步频修正
        cadenceSum += cadenceCorrected;
        cadenceCount++;
        const cadenceAverage = cadenceSum / cadenceCount;
        if (cadenceAverage < 140) {
            cadenceCorrected = cadenceCorrected * 2;
        }

        // 步幅
        let stepLength = 0;
        if (cadenceCorrected > 0) {
            stepLength = (speed * 1000) / (cadenceCorrected * 60);
        }

        rq.data.trkpt.push({
            timestamp: timeCurrent,
            sec: sec,
            position_lat: cp.lat,
            position_long: cp.lon,
            altitude: normalValue(cp.ele),
            is_pause: false,
            speed: parseFloat(speed.toFixed(2)),
            distance: parseFloat(distanceCurrent.toFixed(2)),
            heart_rate: normalValue(cp.hr),
            cadence: normalValue(cadenceCorrected),
            power: normalValue(cp.power),
            step_length: parseFloat(stepLength.toFixed(2))
        });
    }

    // 摘要
    rq.data.summary.name = gpx.tracks[0].name || '';
    rq.data.summary.training_at = formatDateTime(gpx.tracks[0].points[0].time);
    rq.data.summary.total_time = sec;
    rq.data.summary.total_timer_time = sec;
    rq.data.motion.distance = parseFloat(gpx.tracks[0].distance.total.toFixed(2));
    rq.data.motion.total_ascent = parseFloat(gpx.tracks[0].elevation.pos).toFixed(2);
    rq.data.motion.total_descent = parseFloat(gpx.tracks[0].elevation.neg).toFixed(2);

    // 圈速
    rq.data.lap_standard = computeLaps(rq.data.trkpt);

    return rq;
}

/**
 * TCX 内容 → 统一 rq 数据结构
 * @param {string} tcxContent - TCX 文本
 * @returns {Object} rq 数据结构
 */
export function tcxToRq(tcxContent) {
    const rq = createEmptyRq();

    /* global tcxParser */
    const tcx = new tcxParser();
    tcx.parse(tcxContent);

    if (!tcx.tracks || tcx.tracks.length === 0) {
        rq.status = -1;
        return rq;
    }

    const firstPointTime = new Date(tcx.tracks[0].points[0].time).getTime();
    let cadenceSum = 0;
    let cadenceCount = 0;
    let sec = 0;

    for (let i = 0; i < tcx.tracks[0].points.length; i++) {
        const cp = tcx.tracks[0].points[i];
        sec = Math.floor((new Date(cp.time).getTime() - firstPointTime) / 1000);
        const timeCurrent = Math.floor(new Date(cp.time).getTime() / 1000);
        let distanceCurrent = 0;
        let speed = 0;
        let cadenceCorrected = cp.cad || 0;

        if (i > 0) {
            distanceCurrent = tcx.tracks[0].distance.cumul[i - 1];
        }

        // 速度计算（中心差分）
        if (i > 0 && i < tcx.tracks[0].points.length - 1) {
            const prevPt = tcx.tracks[0].points[i - 1];
            const nextPt = tcx.tracks[0].points[i + 1];
            const timePrev = new Date(prevPt.time).getTime() / 1000;
            const timeNext = new Date(nextPt.time).getTime() / 1000;
            const distPrev = i > 1 ? tcx.tracks[0].distance.cumul[i - 1] : 0;
            const distNext = tcx.tracks[0].distance.cumul[i + 1];
            const speedPrev = (distanceCurrent - distPrev) / (timeCurrent - timePrev);
            const speedNext = (distNext - distanceCurrent) / (timeNext - timeCurrent);
            speed = (speedPrev + speedNext) / 2;
        }
        speed = speed * 3.6;

        // 步频修正
        cadenceSum += cadenceCorrected;
        cadenceCount++;
        const cadenceAverage = cadenceSum / cadenceCount;
        if (cadenceAverage < 140) {
            cadenceCorrected = cadenceCorrected * 2;
        }

        // 步幅
        let stepLength = 0;
        if (cadenceCorrected > 0) {
            stepLength = (speed * 1000) / (cadenceCorrected * 60);
        }

        rq.data.trkpt.push({
            timestamp: timeCurrent,
            sec: sec,
            position_lat: cp.lat,
            position_long: cp.lon,
            altitude: normalValue(cp.ele),
            is_pause: false,
            speed: parseFloat(speed.toFixed(2)),
            distance: parseFloat(distanceCurrent.toFixed(2)),
            heart_rate: normalValue(cp.hr),
            cadence: normalValue(cadenceCorrected),
            step_length: parseFloat(stepLength.toFixed(2))
        });
    }

    rq.data.summary.name = tcx.tracks[0].name || 'tcx file';
    rq.data.summary.training_at = formatDateTime(tcx.tracks[0].points[0].time);
    rq.data.summary.total_time = sec;
    rq.data.summary.total_timer_time = sec;
    rq.data.motion.distance = parseFloat(tcx.tracks[0].distance.total.toFixed(2));
    rq.data.motion.total_ascent = parseFloat(tcx.tracks[0].elevation.pos).toFixed(2);
    rq.data.motion.total_descent = parseFloat(tcx.tracks[0].elevation.neg).toFixed(2);
    rq.data.lap_standard = computeLaps(rq.data.trkpt);

    return rq;
}

/**
 * FIT ArrayBuffer → 统一 rq 数据结构
 * @param {ArrayBuffer} fitBuffer
 * @returns {Object} rq 数据结构
 */
export function fitToRq(fitBuffer) {
    const rq = createEmptyRq();
    rq.data.lap_user = [];

    /* global FitParser */
    const fitParser = new FitParser({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'km',
        temperatureUnit: 'celcius',
        elapsedRecordField: true,
        mode: 'list'
    });

    let fit;
    fitParser.parse(fitBuffer, function (error, data) {
        if (error) {
            console.error('FIT parse error:', error);
            rq.status = -1;
            return;
        }
        fit = data;
    });

    if (!fit || !fit.records || fit.records.length === 0) {
        rq.status = -1;
        return rq;
    }

    let cadenceSum = 0;
    let cadenceCount = 0;
    let total_ascent = 0;
    let total_descent = 0;
    let sec = 0;
    let distanceCurrent = 0;

    for (let i = 0; i < fit.records.length; i++) {
        const cp = fit.records[i];

        // 跳过无经纬度的点
        if (cp.position_lat == null && cp.position_long == null) continue;

        // FIT 经纬度修正（防止首尾 GPS 打点为空）
        let position_lat, position_long;
        if (i === fit.records.length - 1) {
            position_lat = cp.position_lat ?? fit.records[i - 1]?.position_lat ?? 0;
            position_long = cp.position_long ?? fit.records[i - 1]?.position_long ?? 0;
        } else {
            position_lat = cp.position_lat ?? fit.records[i + 1]?.position_lat ?? 0;
            position_long = cp.position_long ?? fit.records[i + 1]?.position_long ?? 0;
        }

        // distance 字段补全
        if (i === 0) {
            cp.distance = cp.distance ?? 0;
        } else {
            const prevPt = fit.records[i - 1];
            if (prevPt.distance == null || prevPt.position_lat == null || prevPt.position_long == null) {
                cp.distance = cp.distance ?? 0;
            } else if (cp.distance == null) {
                const pointDistance = calculateDistance(
                    prevPt.position_lat, prevPt.position_long,
                    position_lat, position_long
                );
                cp.distance = prevPt.distance + (pointDistance / 1000);
            }
        }

        sec = cp.elapsed_time;
        const timeCurrent = new Date(cp.timestamp).getTime() / 1000;
        distanceCurrent = cp.distance * 1000;

        let speed = cp.enhanced_speed ?? cp.speed ?? 0;
        const power = cp.power ?? 0;
        let cadenceCorrected = cp.cadence ?? 0;

        // 步频修正
        cadenceSum += cp.cadence ?? 0;
        cadenceCount++;
        const cadenceAverage = cadenceSum / cadenceCount;
        if (cadenceAverage < 140) {
            cadenceCorrected = cadenceCorrected * 2;
        }

        // 步幅
        let stepLength = 0;
        if (cp.step_length != null && !isNaN(cp.step_length) && cp.step_length > 0) {
            stepLength = cp.step_length / 1000;
        } else if (cadenceCorrected > 0 && speed > 0) {
            stepLength = (speed * 1000) / (cadenceCorrected * 60);
        }

        // 升降
        const curAlt = cp.enhanced_altitude !== undefined ? cp.enhanced_altitude : (cp.altitude ?? 0);
        const prevAlt = i === 0
            ? curAlt
            : (fit.records[i - 1].enhanced_altitude !== undefined ? fit.records[i - 1].enhanced_altitude : (fit.records[i - 1].altitude ?? 0));

        if (curAlt > prevAlt) total_ascent += curAlt - prevAlt;
        else if (curAlt < prevAlt) total_descent += prevAlt - curAlt;

        rq.data.trkpt.push({
            timestamp: timeCurrent,
            sec: sec,
            position_lat: position_lat,
            position_long: position_long,
            altitude: parseFloat(((cp.enhanced_altitude !== undefined
                ? cp.enhanced_altitude
                : (cp.altitude !== undefined ? cp.altitude : 0)) * 1000).toFixed(2)),
            is_pause: false,
            speed: parseFloat(speed.toFixed(2)),
            distance: parseFloat(distanceCurrent.toFixed(2)),
            heart_rate: cp.heart_rate ?? 0,
            cadence: cadenceCorrected,
            step_length: parseFloat(stepLength.toFixed(2)),
            power: power
        });
    }

    rq.data.summary.name = 'fit';
    rq.data.summary.training_at = formatDateTime(fit.records[0].timestamp);
    rq.data.summary.total_time = sec;
    rq.data.summary.total_timer_time = sec;
    rq.data.motion.distance = parseFloat(distanceCurrent.toFixed(2));
    rq.data.motion.total_ascent = parseFloat((total_ascent * 1000).toFixed(2));
    rq.data.motion.total_descent = parseFloat((total_descent * 1000).toFixed(2));
    rq.data.lap_standard = computeLaps(rq.data.trkpt);

    // 用户计圈（FIT laps）
    if (fit.laps) {
        rq.data.lap_user = fit.laps.map(lap => ({
            ...lap,
            timestamp: Math.floor(new Date(lap.timestamp).getTime() / 1000),
            start_time: Math.floor(new Date(lap.start_time).getTime() / 1000)
        }));
    }

    return rq;
}

/**
 * JSON 内容 → 直接使用（兼容已有格式）
 * @param {string} jsonContent
 * @returns {Object}
 */
export function jsonToRq(jsonContent) {
    const data = JSON.parse(jsonContent);
    // 如果已经是标准 rq 格式（有 status 和 data）
    if (data.status !== undefined && data.data) {
        return data;
    }
    // 否则包装一层
    return { status: 0, data: data };
}

/**
 * 统一解析入口：文件 → 统一 rq 数据结构
 * @param {File} file - 用户上传的文件
 * @returns {Promise<Object>} rq 数据结构
 */
export async function parse(file) {
    const format = detectFormat(file);

    if (format === 'unknown') {
        throw new Error('Unsupported file format: ' + file.name);
    }

    const content = await readFile(file, format);

    switch (format) {
        case 'gpx': return gpxToRq(content);
        case 'tcx': return tcxToRq(content);
        case 'fit': return fitToRq(content);
        case 'json': return jsonToRq(content);
        default:
            throw new Error('Unsupported format: ' + format);
    }
}
