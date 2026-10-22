/**
 * DataSchema.js - 统一数据 Schema 定义 + 校验
 * 定义各解析器输出的标准数据结构
 */

/**
 * 轨迹点 (trkpt) 字段定义
 */
export const TRKPT_FIELDS = {
    timestamp:     { type: 'number', desc: '秒级时间戳' },
    sec:           { type: 'number', desc: '从起始点经过的秒数' },
    position_lat:  { type: 'number', desc: '纬度' },
    position_long: { type: 'number', desc: '经度' },
    altitude:      { type: 'number', desc: '海拔（米）' },
    is_pause:      { type: 'boolean', desc: '是否暂停' },
    speed:         { type: 'number', desc: '速度（km/h）' },
    distance:      { type: 'number', desc: '累积距离（米）' },
    heart_rate:    { type: 'number', desc: '心率（bpm）' },
    cadence:       { type: 'number', desc: '步频（steps/min）' },
    power:         { type: 'number', desc: '功率（W）', optional: true },
    step_length:   { type: 'number', desc: '步幅（m）' },
    // 以下字段在 processJson 阶段计算补齐
    slope:         { type: 'number', desc: '坡度', computed: true },
    Gain:          { type: 'number', desc: '累计爬升（米）', computed: true },
    Loss:          { type: 'number', desc: '累计下降（米）', computed: true },
    azimuth:       { type: 'number', desc: '方位角（度）', computed: true },
    // 以下派生量由 fieldComputer.computeDerivedFields 物化，与 Studio 可绑定字段同名；
    // 绑定渲染走 bindingEngine 现算，这里物化是为了 rq 自身可读、可导出。
    elapsedMin:    { type: 'number', desc: '已用分钟', computed: true },
    avgSpeed:      { type: 'number', desc: '平均速度（km/h，自起始算）', computed: true },
    avgPace:       { type: 'string', desc: '平均配速（mm:ss/km）；无法计算时为数字 0', computed: true },
    remainDistance:{ type: 'number', desc: '剩余距离（米）', computed: true },
    remainKm:      { type: 'number', desc: '剩余距离（公里）', computed: true },
    relAltitude:   { type: 'number', desc: '相对起点海拔（米）', computed: true },
    hrPct:         { type: 'number', desc: '心率占上限比例（0..1）', computed: true },
    elapsedTime:   { type: 'string', desc: '已用时（m:ss / h:mm:ss）', computed: true },
    remainTime:    { type: 'string', desc: '按平均速度预估的剩余时间', computed: true }
};

/**
 * 全程量（不落进轨迹点，挂在 chartData / rq._chartData 上）
 * 与 bindingEngine 的派生分支同源，供直接读取 rq 的组件使用。
 */
export const GLOBAL_DERIVED_FIELDS = {
    totalDistance: { type: 'number', desc: '总距离（米）', computed: true },
    totalKm:       { type: 'number', desc: '总距离（公里）', computed: true },
    duration:      { type: 'number', desc: '总时长（秒）', computed: true },
    totalTime:     { type: 'string', desc: '总时长（时钟文本）', computed: true },
    paceBoundMin:  { type: 'number', desc: '最慢配速（min/km）= 60 / 最小速度', computed: true },
    paceBoundMax:  { type: 'number', desc: '最快配速（min/km）= 60 / 最大速度', computed: true }
};

/**
 * 摘要信息 Schema
 */
export const SUMMARY_SCHEMA = {
    name:             { type: 'string', desc: '运动标题' },
    total_time:       { type: 'number', desc: '总时长（秒）' },
    training_at:      { type: 'string', desc: '训练日期时间' },
    total_timer_time: { type: 'number', desc: '总计时时间（秒）' }
};

/**
 * 运动概况 Schema
 */
export const MOTION_SCHEMA = {
    distance:      { type: 'number', desc: '训练距离（米）' },
    total_ascent:  { type: 'number', desc: '总爬升（米）' },
    total_descent: { type: 'number', desc: '总下降（米）' }
};

/**
 * 校验 rq 数据结构是否合法
 * @param {Object} rq
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRq(rq) {
    const errors = [];

    if (!rq || typeof rq !== 'object') {
        errors.push('rq is not an object');
        return { valid: false, errors };
    }

    if (rq.status === undefined) {
        errors.push('Missing rq.status');
    }

    if (!rq.data || typeof rq.data !== 'object') {
        errors.push('Missing rq.data');
        return { valid: false, errors };
    }

    const { summary, motion, trkpt } = rq.data;

    if (!summary || typeof summary !== 'object') {
        errors.push('Missing rq.data.summary');
    }

    if (!motion || typeof motion !== 'object') {
        errors.push('Missing rq.data.motion');
    }

    if (!Array.isArray(trkpt) || trkpt.length === 0) {
        errors.push('rq.data.trkpt is empty or not an array');
    } else {
        // 抽查第一个和最后一个轨迹点的关键字段
        const first = trkpt[0];
        const last = trkpt[trkpt.length - 1];
        if (typeof first.timestamp !== 'number') errors.push('trkpt[0].timestamp is not a number');
        if (typeof first.sec !== 'number') errors.push('trkpt[0].sec is not a number');
        if (typeof last.distance !== 'number') errors.push('trkpt[last].distance is not a number');
    }

    return { valid: errors.length === 0, errors };
}
