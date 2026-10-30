/**
 * constants.js - 全局常量定义
 */

// 画布尺寸预设
export const CANVAS_PRESETS = {
    '16:9': { width: 1920, height: 1080 },
    '9:16': { width: 1080, height: 1920 }
};

// 默认画布尺寸
export const DEFAULT_CANVAS = CANVAS_PRESETS['16:9'];

// 预览区域尺寸
export const PREVIEW_SIZE = 960;

// 视频格式
export const VIDEO_FORMATS = {
    MP4: 'mp4',
    WEBM: 'webm',
    MOV: 'mov'
};

// 默认视频配置
export const VIDEO_DEFAULTS = {
    codec: 'avc',
    bitrate: 8_000_000,
    quality: 1,
    format: VIDEO_FORMATS.MP4,
    // 每秒帧数。1 = 一个轨迹点独占 1 秒，就是升级前唯一的口径；默认值必须是 1，
    // 这样「只带老配置」的导出路径与升级前逐项相同（见 frameSampling.js 的抽稀回归）。
    fps: 1
};

// 帧率预设（Video Setup 弹窗下拉里摆的那几档）
export const VIDEO_FPS_PRESETS = [1, 2, 3, 4, 5, 10, 15, 25, 30];

// 帧率上限：再往上是浏览器编码耗时问题，不是画质需求
export const VIDEO_FPS_MAX = 60;

/**
 * 归一化帧率：夹成 [1, VIDEO_FPS_MAX] 的整数，非数字回落到默认 1。
 * 弹窗那个「自定义」输入框什么都能输（0 / -1 / 2.5 / 空 / NaN），钳制只放在这一处，
 * 渲染层与编码层拿到的都是归一化后的值；UI 再把钳制结果写回输入框，用户看得见。
 * @param {*} value
 * @returns {number}
 */
export function normalizeVideoFps(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return VIDEO_DEFAULTS.fps;
    return Math.min(VIDEO_FPS_MAX, Math.max(1, Math.round(n)));
}

// 数据字段名规范（统一各解析器输出）
export const DATA_FIELDS = {
    // 轨迹点字段
    TRKPT: {
        SEC: 'sec',
        TIMESTAMP: 'timestamp',
        POSITION_LAT: 'position_lat',
        POSITION_LNG: 'position_long',
        ALTITUDE: 'altitude',
        DISTANCE: 'distance',
        HEART_RATE: 'heart_rate',
        CADENCE: 'cadence',
        SPEED: 'speed',
        POWER: 'power',
        SLOPE: 'slope',
        GAIN: 'Gain',
        LOSS: 'Loss',
        AZIMUTH: 'azimuth',
        // 以下由 fieldComputer.computeDerivedFields 物化，键名与 Studio fieldCatalog 一致
        ELAPSED_MIN: 'elapsedMin',
        AVG_SPEED: 'avgSpeed',
        AVG_PACE: 'avgPace',
        REMAIN_DISTANCE: 'remainDistance',
        REMAIN_KM: 'remainKm',
        REL_ALTITUDE: 'relAltitude',
        HR_PCT: 'hrPct',
        ELAPSED_TIME: 'elapsedTime',
        REMAIN_TIME: 'remainTime'
    },
    // 摘要字段
    SUMMARY: {
        NAME: 'name',
        TOTAL_TIME: 'total_time',
        TRAINING_AT: 'training_at',
        TOTAL_TIMER_TIME: 'total_timer_time'
    },
    // 运动概况字段
    MOTION: {
        DISTANCE: 'distance',
        TOTAL_ASCENT: 'total_ascent',
        TOTAL_DESCENT: 'total_descent'
    }
};

// 组件分类
export const COMPONENT_CATEGORIES = {
    BACKGROUND: 'background',
    INFO: 'info',           // 日期时间、位置等基础信息
    CHART: 'chart',         // 心率/配速/高程/步频等图表
    GAUGE: 'gauge',         // 仪表盘类
    MAP: 'map',             // 地图/路线
    TABLE: 'table',         // 圈速表格
    PROGRESS: 'progress',   // 进度条
    CUSTOM: 'custom'        // 自定义
};

// 模板商店分类
export const SHOP_CATEGORIES = {
    RUNNING: { value: 'running', label: 'Running' },
    CYCLING: { value: 'cycling', label: 'Cycling' },
    SWIMMING: { value: 'swimming', label: 'Swimming' },
    HIKING: { value: 'hiking', label: 'Trail' },
    CUSTOM: { value: 'custom', label: 'Custom' }
};

// 模板状态
export const TEMPLATE_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected'
};

// localStorage 键前缀
export const STORAGE_PREFIX = 'frameConfig_';

// API 地址：由部署位置推导，可用 window.PULSEFRAME_CONFIG.apiBase 覆盖（见 appConfig.js）
export { API_BASE, apiUrl } from './appConfig.js';

// 地图相关常量
export const MAP = {
    TILE_SIZE: 256,
    EARTH_RADIUS: 6371000,  // 地球半径（米）
    WGS84_A: 6378137.0,     // 地球长半轴
    WGS84_EE: 0.00669342162296594323  // 第一偏心率平方
};

// 高程计算阈值
export const ELEVATION = {
    MIN_ALTITUDE_CHANGE: 0.15,  // 最小高度变化阈值（米），过滤噪音
    SLOPE_CLAMP: 1,             // 坡度限制范围 [-1, 1]
    NOISE_FILTER_EPSILON: 2     // 道格拉斯-普克抽稀阈值
};
