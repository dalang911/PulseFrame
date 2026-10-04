/**
 * parsers/utils.js - 解析器共享工具函数
 * 从原 index.html 提取的数据清洗、距离计算、圈速计算等通用函数
 */

/**
 * 校验值是否合规（非空、非负、有限数值）
 * @param {*} value
 * @returns {number}
 */
export function normalValue(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value !== 'number') return 0;
    if (!Number.isFinite(value) || value < 0) return 0;
    return value;
}

/**
 * Haversine 公式：计算两点经纬度之间的距离（单位：米）
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} 距离（米）
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * 根据轨迹点数组计算每公里圈速
 * @param {Array} trkpt - 轨迹点数组，每个点包含 distance（米）和 timestamp（秒级时间戳）
 * @returns {Array} lap_standard 数组 [{ id, total_timer_time }]
 */
export function computeLaps(trkpt) {
    const laps = [];
    let previousDistance = 0;
    let previousTimestamp = trkpt.length > 0 ? trkpt[0].timestamp : 0;
    let lapId = 0;

    for (let i = 0; i < trkpt.length; i++) {
        const currentDistance = trkpt[i].distance;
        const currentTimestamp = trkpt[i].timestamp;
        let distanceDiff = currentDistance - previousDistance;

        while (distanceDiff >= 1000) {
            const totalTimerTime = currentTimestamp - previousTimestamp;
            laps.push({ id: lapId, total_timer_time: totalTimerTime });
            previousDistance += 1000;
            previousTimestamp = currentTimestamp;
            lapId++;
            distanceDiff = currentDistance - previousDistance;
        }
    }

    return laps;
}

/**
 * 格式化日期为 "YYYY-MM-DD HH:MM:SS"
 * @param {string|Date} timeStr - ISO 时间字符串或 Date 对象
 * @returns {string}
 */
export function formatDateTime(timeStr) {
    const date = new Date(timeStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 创建空的 rq 数据结构
 * @returns {Object}
 */
export function createEmptyRq() {
    return {
        status: 0,
        data: {
            summary: {
                name: '',
                total_time: 0,
                training_at: '',
                total_timer_time: 0
            },
            motion: {
                distance: 0,
                total_ascent: 0,
                total_descent: 0
            },
            trkpt: [],
            lap_standard: []
        }
    };
}
