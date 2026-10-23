/**
 * seriesRepair.js - 稀疏序列修补（就近填充 / 洞内桥接）
 *
 * 设备开机时经常先记一段空数据：高程还没定位就是 0，GPS 没定上就是空坐标。
 * 解析器把这些统一写成 0 存进 trkpt，逐秒插值又会把 0 当成真实样本，于是
 * 高程曲线从 0 爬上来、地图线甩到几内亚湾，baseAltitude / eleMin / Gain /
 * slope / azimuth / 地图投影范围全被带偏。
 *
 * 这里在插值之前把异常点换成**同一组序列里的真实值**，按字段组分两种策略：
 *
 *   nearest（高程）—— 就近冻结
 *     - 开头连续异常 → 取第一个真实点
 *     - 结尾连续异常 → 取最后一个真实点
 *     - 中间空洞     → 取左右真实点里更近的一个，等距时取前一个
 *   bridge（经纬度）—— 洞内直线桥接
 *     - 开头 / 结尾  → 同样冻结在洞口的真实点（时间轴不缩短）
 *     - 中间空洞     → 按洞两端真实点线性内插，和 interpolator 对两个真实
 *                      GPS 点的处理一致，所以地图上是一条拉直的线，
 *                      不会先冻住再瞬移；单点空洞正好落在两点正中。
 *
 * 异常判定只认「空 / 非数值 / 非有限数 / 0」；真实的负海拔（隧道、海平面以下）
 * 不算异常。字段按**组**判定与填充：一组里任一个字段异常，整点都算异常，两个
 * 字段一起取自同一个来源点，绝不把 A 的纬度和 B 的经度拼成一个坐标。
 * 填充的来源只用原始真实点，补上的点不再当来源，所以一段空洞只会摊成两级台阶
 * （nearest）或一段直线（bridge），不会链式漂移。
 *
 * 注意 0 坐标的歧义：赤道 / 本初子午线（0 经度）上是真实值，也会被当成异常，
 * 但取整到 6 位小数正好为 0 的概率极低，换来的是开机段和 FIT 首尾兜底残留的
 * (0,0) 点不再破坏地图投影范围。
 */

import { formatValue } from './interpolator.js';

/** 就近冻结：洞内每个点取左右更近的真实点 */
export const STRATEGY_NEAREST = 'nearest';
/** 洞内桥接：中间空洞按洞两端真实点线性内插；开头/结尾仍冻结 */
export const STRATEGY_BRIDGE = 'bridge';

/**
 * 默认修补的字段组：
 *   - 高程：开机段为 0，用就近真实值补
 *   - 经纬度：成对补，绝不拆组
 * 心率 / 步频 / 功率 / 速度的 0 各有正常语义（没戴心率带、停住了、没功率计），
 * 不能动，所以不在名单里。
 */
export const REPAIR_GROUPS = [
    { keys: ['altitude'], strategy: STRATEGY_NEAREST },
    { keys: ['position_lat', 'position_long'], strategy: STRATEGY_BRIDGE }
];

/** 字段组在统计报告里的标签 */
export const groupLabel = keys => keys.join('+');

/**
 * 判断一个样本是否「没有真实值」
 * @param {*} value
 * @returns {boolean}
 */
export function isSparseSample(value) {
    if (typeof value !== 'number') return true;      // null / undefined / 字符串
    if (!Number.isFinite(value)) return true;        // NaN / Infinity
    return value === 0;                              // 解析器把空值统一写成 0
}

/** 一个点的整组字段是否都有真实值 */
function hasSample(point, keys) {
    return keys.every(key => !isSparseSample(point[key]));
}

/** 把来源点整组的值抄到目标点（不做二次取整，原样搬运） */
function copyGroup(trkpt, target, source, keys) {
    keys.forEach(key => { trkpt[target][key] = trkpt[source][key]; });
}

/** 用洞两端真实点按 ratio 线性内插目标点的整组字段 */
function bridgeGroup(trkpt, target, left, right, ratio, keys) {
    keys.forEach(key => {
        const from = trkpt[left][key];
        const to = trkpt[right][key];
        trkpt[target][key] = formatValue(key, from + (to - from) * ratio);
    });
}

/**
 * 就一个字段组做修补（原地修改 trkpt）
 * @param {Array<Object>} trkpt - 轨迹点数组
 * @param {string[]} keys - 同组的字段名，例如 ['position_lat', 'position_long']
 * @param {string} [strategy] - STRATEGY_NEAREST（默认）或 STRATEGY_BRIDGE
 * @returns {{ filled: number, allMissing: boolean }} filled=补了几个点；allMissing=全程无真实值，未改动
 */
export function repairGroup(trkpt, keys, strategy = STRATEGY_NEAREST) {
    const n = trkpt.length;
    const bridge = strategy === STRATEGY_BRIDGE;

    let firstValid = 0;
    while (firstValid < n && !hasSample(trkpt[firstValid], keys)) firstValid++;
    if (firstValid === n) return { filled: 0, allMissing: true };

    let filled = 0;

    // 开头：只存在「后面的真实值」这一个邻居，两种策略都冻结在洞口
    for (let i = 0; i < firstValid; i++) copyGroup(trkpt, i, firstValid, keys);
    filled += firstValid;

    let i = firstValid;
    while (i < n) {
        if (hasSample(trkpt[i], keys)) {
            i++;
            continue;
        }

        let end = i;
        while (end < n && !hasSample(trkpt[end], keys)) end++;

        // i-1 一定是原始真实点：首个真实点，或上一段空洞刚结束的位置
        const left = i - 1;

        // 结尾：只存在「前面的真实值」这一个邻居，同样冻结
        if (end === n) {
            for (let k = i; k < n; k++) copyGroup(trkpt, k, left, keys);
            filled += n - i;
            break;
        }

        const span = end - left;                 // 洞 + 两端真实点之间的总步数
        for (let k = i; k < end; k++) {
            if (bridge) {
                bridgeGroup(trkpt, k, left, end, (k - left) / span, keys);
            } else {
                // 就近：离前一个真实点更近（等距时也算更近）就取前，否则取后
                copyGroup(trkpt, k, (k - left) <= (end - k) ? left : end, keys);
            }
        }
        filled += end - i;
        i = end;
    }

    return { filled, allMissing: false };
}

/**
 * 修补 rq 数据结构里的轨迹点（原地修改 rq.data.trkpt）
 * @param {Object} data - rq 数据结构
 * @param {Array<{keys: string[], strategy?: string}>} [groups] - 字段组，默认高程 + 经纬度
 * @returns {{ filled: number, groups: Object<string, number>, allMissing: string[] }} 修补统计，供管道打日志
 */
export function repairSparseSeries(data, groups = REPAIR_GROUPS) {
    const trkpt = data?.data?.trkpt;
    const report = { filled: 0, groups: {}, allMissing: [] };

    if (!Array.isArray(trkpt) || trkpt.length < 2) return report;

    for (const { keys, strategy = STRATEGY_NEAREST } of groups) {
        const label = groupLabel(keys);
        const { filled, allMissing } = repairGroup(trkpt, keys, strategy);
        report.groups[label] = filled;
        report.filled += filled;
        if (allMissing) {
            report.allMissing.push(label);
            console.warn(`[repair] ${label} 全程没有真实值，保持原样`);
        }
    }

    return report;
}
