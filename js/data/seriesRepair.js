/**
 * seriesRepair.js - 稀疏序列修补（就近填充）
 *
 * 设备开机时常先记一段空数据：高程还没定位就是 0，传感器没读数则是空。
 * 解析器把这些统一写成 0 存进 trkpt，逐秒插值又会把 0 当成真实样本，于是
 * 高程曲线从 0 爬上来、baseAltitude / eleMin / Gain / slope 全被带偏。
 *
 * 这里在插值之前把异常点换成**同一条序列里最近的真实值**：
 *   - 开头连续异常 → 取第一个真实值（只能往后就近）
 *   - 结尾连续异常 → 取最后一个真实值（只能往前就近）
 *   - 中间空洞     → 取左右真实值里更近的一侧，等距时取前一个
 *
 * 异常判定只认「空 / 非数值 / 非有限数 / 0」；真实的负海拔（隧道、海平面以下）
 * 不算异常。填充取的是原始真实点上的值，不会把已补的点再当作来源，
 * 所以一段空洞只会平摊成左右两个台阶，不会出现链式漂移。
 *
 * 经纬度的同类问题原先只在 FIT 解析器里做过首尾兜底（见 parsers/index.js），
 * 本模块同样能处理，但默认只补高程——要不要带上 position_lat / position_long
 * 由调用方传字段名决定。
 */

/** 默认修补字段：只有高程会出现「开机为 0」，心率/功率/步频的 0 是正常缺测 */
export const DEFAULT_REPAIR_FIELDS = ['altitude'];

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

/**
 * 就一条序列做就近填充（原地修改）
 * @param {Array<Object>} trkpt - 轨迹点数组
 * @param {string} key - 字段名
 * @returns {{ filled: number, allMissing: boolean }} filled=补了几个点；allMissing=全程无真实值，未改动
 */
export function fillNearest(trkpt, key) {
    const n = trkpt.length;

    let firstValid = 0;
    while (firstValid < n && isSparseSample(trkpt[firstValid][key])) firstValid++;
    if (firstValid === n) return { filled: 0, allMissing: true };

    let filled = 0;

    // 开头：只存在「后面的真实值」这一个邻居
    for (let i = 0; i < firstValid; i++) {
        trkpt[i][key] = trkpt[firstValid][key];
        filled++;
    }

    let i = firstValid;
    while (i < n) {
        if (!isSparseSample(trkpt[i][key])) {
            i++;
            continue;
        }

        let end = i;
        while (end < n && isSparseSample(trkpt[end][key])) end++;

        // i-1 一定是原始真实点：首个真实点，或上一段空洞刚结束的位置
        const prevValue = trkpt[i - 1][key];

        // 结尾：只存在「前面的真实值」这一个邻居
        if (end === n) {
            for (let k = i; k < n; k++) {
                trkpt[k][key] = prevValue;
                filled++;
            }
            break;
        }

        const nextValue = trkpt[end][key];
        for (let k = i; k < end; k++) {
            const toPrev = k - (i - 1);
            const toNext = end - k;
            trkpt[k][key] = toPrev <= toNext ? prevValue : nextValue;
            filled++;
        }
        i = end;
    }

    return { filled, allMissing: false };
}

/**
 * 修补 rq 数据结构里的轨迹点（原地修改 rq.data.trkpt）
 * @param {Object} data - rq 数据结构
 * @param {string[]} [keys] - 需要修补的字段名，默认只补高程
 * @returns {{ filled: number, byKey: Object<string, number>, allMissing: string[] }} 修补统计，供管道打日志
 */
export function repairSparseSeries(data, keys = DEFAULT_REPAIR_FIELDS) {
    const trkpt = data?.data?.trkpt;
    const report = { filled: 0, byKey: {}, allMissing: [] };

    if (!Array.isArray(trkpt) || trkpt.length < 2) return report;

    for (const key of keys) {
        const { filled, allMissing } = fillNearest(trkpt, key);
        report.byKey[key] = filled;
        report.filled += filled;
        if (allMissing) {
            report.allMissing.push(key);
            console.warn(`[repair] ${key} 全程没有真实值，保持原样`);
        }
    }

    return report;
}
