/**
 * format.js - 格式化工具函数
 * 从原 index.html 提取的时间/距离/速度格式化函数
 */

/**
 * 时间戳格式化：秒级时间戳 → "YYYY-MM-DD HH:MM:SS"
 * @param {number} timestamp - 秒级时间戳
 * @param {number} [type=2] - 0=时分秒, 1=日期, 2=完整
 * @returns {string}
 */
export function timestampToDateString(timestamp, type = 2) {
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    if (type === 0) return `${hours}:${minutes}:${seconds}`;
    if (type === 1) return `${year}-${month}-${day}`;
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 秒数转时分秒：秒 → "HH:MM:SS"
 * @param {number} seconds
 * @returns {string}
 */
export function secondsToHHMMSS(seconds) {
    const sec = Number(seconds);
    const total = Number.isFinite(sec) ? Math.floor(sec) : 0;
    const h = Math.floor(total / 3600).toString().padStart(2, '0');
    const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(total % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * 秒距离转配速（速度 → 每公里用时）
 * @param {number} speed - 速度（km/h 或 m/s 视上下文）
 * @returns {string} 格式 "MM:SS"
 */
export function speedToPace(speed) {
    if (speed <= 0) return "00:00";
    const totalSeconds = 60 / speed * 60;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * 经纬度转换为度分秒格式
 * @param {number} latOrLon
 * @returns {string}
 */
export function convertToDMS(latOrLon) {
    const value = Math.abs(latOrLon);
    const degrees = Math.floor(value);
    const minutes = Math.floor((value - degrees) * 60);
    const seconds = Math.round((value - degrees - minutes / 60) * 3600 * 100) / 100;
    const direction = latOrLon >= 0 ? (latOrLon > 90 ? 'E' : 'N') : (latOrLon < -90 ? 'W' : 'S');
    return `${degrees}°${minutes}'${seconds}"${direction}`;
}

/**
 * 距离格式化（米 → 公里，保留两位小数）
 * @param {number} meters
 * @returns {string}
 */
export function metersToKm(meters) {
    return (Math.round(meters / 1000 * 100) / 100).toString();
}

/**
 * 格式化值（插值后清洗数据）
 * @param {string} key - 字段名
 * @param {*} value - 原始值
 * @returns {*} 格式化后的值
 */
export function formatValue(key, value) {
    if (typeof value !== 'number') return value;

    switch (key) {
        case 'cadence':
        case 'heart_rate':
            return Math.round(value);
        case 'distance':
        case 'speed':
        case 'step_length':
        case 'altitude':
            return parseFloat(value.toFixed(2));
        case 'position_lat':
        case 'position_long':
            return parseFloat(value.toFixed(6));
        default:
            return value;
    }
}

/**
 * 检验值是否合规、存在
 * @param {*} value
 * @returns {number}
 */
export function normalValue(value) {
    if (value === null || value === undefined) return 0;
    if (typeof value !== "number") return 0;
    if (!Number.isFinite(value) || value < 0) return 0;
    return value;
}
