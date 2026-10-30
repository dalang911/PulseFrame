/**
 * frameSampling.js - 亚秒帧采样（导出视频的可调帧率）
 *
 * 数据侧只有一份「逐秒网格」：DataPipeline 的 interpolatePoints 把不等间隔的原始点
 * 整成 1 秒 1 条，computeAllFields 再在这份网格上预计算坡度、累计爬升、图表坐标、地图投影。
 * 导出视频选择 N 帧/秒时，**加密的只是帧号空间**（len 帧 → len×N 帧），预计算数组一个字节都不动：
 * 密帧是疏帧的线性细化，不是重新计算。
 *
 * 由此得到一条硬不变量（校验抓手，见 tools 断言口径）：
 *     第 i×N 帧逐字段等于第 i 秒那条轨迹点
 * frac === 0 时直接返回数组里的**原对象引用**，所以 N=1 的整条渲染路径与升级前逐项相同。
 *
 * 为什么不干脆把数组插密：0.15 m 的爬升阈值是「相邻数组项」口径，插密会把 0.3 m 的一秒
 * 涨幅拆成 4×0.075 m 全部判成平路（累计爬升直接少算）；坡度中心差分、Douglas-Peucker
 * 抽稀同样会随密度变味。所以派生量留在秒空间算，这里只做细化。
 *
 * 时间口径：稠密帧号 f → t = 起始秒 + f / N（秒，可含小数）；currentFrame = floor(t)
 * 仍是秒空间整数，因此「回看最近 10 秒」「按整公里倒扫」「currentFrame % 2 闪烁」这些
 * 读取点不必改动，语义自动保持（帧率变密不会把闪烁变成频闪）。
 */

import { formatValue, speedToPace } from '../utils/format.js';
import { fmtClock, round } from './fieldComputer.js';

/**
 * 不做算术插值的字段：整段沿用左端点。
 * is_pause 是布尔（参与算术会被 coerce 成 0/1）；timestamp 是秒级绝对时钟，
 * 小数时间戳没有物理含义，日期文本本来也只显示到秒。
 */
const STEP_FIELDS = new Set(['is_pause', 'timestamp']);

/** 0~360 环绕字段：直线插值会让方位角从 359° 甩到 180° 再回到 1°，必须走最短弧 */
const ANGLE_FIELDS = new Set(['azimuth']);

/**
 * 由插值后的 sec / distance 重算的派生字段（不做线性插值）。
 * 公式与 fieldComputer.computeDerivedFields 逐字一致；bindingEngine 的 switch 分支
 * 本来就会用 frameData 现算这批值，这里重算是为了让直接读 frameData 的组件也算得出同样的数。
 */
const RECOMPUTED_FIELDS = new Set([
    'elapsedMin', 'avgSpeed', 'avgPace',
    'remainDistance', 'remainKm', 'elapsedTime', 'remainTime'
]);

/** 派生量插值后的小数位，跟 fieldComputer 物化时的口径对齐 */
const DERIVED_DIGITS = { Gain: 2, Loss: 2, slope: 2, hrPct: 4, relAltitude: 2 };

/** 数值兜底清洗：formatValue 没管到的派生量按 DERIVED_DIGITS 收位 */
function cleanValue(key, value) {
    const formatted = formatValue(key, value);
    const digits = DERIVED_DIGITS[key];
    return digits === undefined ? formatted : round(formatted, digits);
}

/** 两端点线性插值；frac 为 0 时原样返回 a（保证抽稀回归逐位相同） */
export function lerp(a, b, frac) {
    return frac === 0 ? a : a + (b - a) * frac;
}

/** 角度最短弧插值，结果收在 [0, 360) 并取整（与 computeAzimuth 的取整口径一致） */
export function lerpAngle(a, b, frac) {
    if (frac === 0) return a;
    let delta = ((b - a) % 360 + 540) % 360 - 180;   // 折算到 (-180, 180]
    return (Math.round(a + delta * frac) % 360 + 360) % 360;
}

/** 把 t 夹到 [0, count-1] 并拆成整数位与小数位；越界时小数位归零 */
function splitTime(t, count) {
    const maxIndex = count - 1;
    if (!Number.isFinite(t)) return { index: 0, frac: 0 };
    const clamped = Math.max(0, Math.min(t, maxIndex));
    const index = Math.floor(clamped);
    const frac = index >= maxIndex ? 0 : clamped - index;
    return { index, frac };
}

/**
 * 取 t 秒（可为小数）时刻的轨迹点。
 * @param {Array<Object>} trkpt - 逐秒网格的轨迹点数组（computeAllFields 已跑过的）
 * @param {number} t - 秒，可以是小数；超出范围时夹到首尾
 * @returns {Object|null} frac===0 时返回数组里的原对象；否则返回插值出的新点
 */
export function sampleFrame(trkpt, t) {
    if (!Array.isArray(trkpt) || trkpt.length === 0) return null;

    const { index, frac } = splitTime(t, trkpt.length);
    const a = trkpt[index];
    if (!a) return null;
    if (frac === 0) return a;                     // 整数时刻 = 抽稀回归点，返回引用本身

    const b = trkpt[index + 1] || a;

    const point = { ...a };
    Object.keys(a).forEach(key => {
        // 只插两端都有的键：缺测字段（如没有功率表的活动）不能被凭空造出来，
        // 这条与 interpolatePoints 的逐秒插值规则一致。
        if (!Object.prototype.hasOwnProperty.call(b, key)) return;
        if (RECOMPUTED_FIELDS.has(key)) return;   // 稍后统一重算
        const av = a[key];
        const bv = b[key];
        if (ANGLE_FIELDS.has(key)) {
            point[key] = lerpAngle(av, bv, frac);
            return;
        }
        // 布尔、字符串、非有限值一律整段沿用左端点（0 当作「无读数」的那些也在这里被护住：
        // seriesRepair 已经把空值补掉了，剩下的 0 是真值，可以正常插）
        if (STEP_FIELDS.has(key) || typeof av !== 'number' || typeof bv !== 'number' ||
            !Number.isFinite(av) || !Number.isFinite(bv)) {
            point[key] = av;
            return;
        }
        point[key] = cleanValue(key, lerp(av, bv, frac));
    });

    refreshDerived(point, trkpt[trkpt.length - 1]);
    return point;
}

/**
 * 用插值出来的 sec / distance 重算派生字段（只重算左端点上已存在的键，不发明字段）。
 * 公式与 fieldComputer.computeDerivedFields 保持一致，含「无法计算时 avgPace 是数字 0」这条。
 */
function refreshDerived(point, lastPt) {
    const sec = point.sec || 0;
    const dist = point.distance || 0;
    const totalDistance = (lastPt && lastPt.distance) || 0;
    const remain = Math.max(0, totalDistance - dist);
    const avgSpeed = sec > 0 ? dist * 3.6 / sec : 0;   // m, s → km/h

    if ('elapsedMin' in point) point.elapsedMin = round(sec / 60, 2);
    if ('avgSpeed' in point) point.avgSpeed = round(avgSpeed, 2);
    if ('avgPace' in point) point.avgPace = avgSpeed > 0 ? speedToPace(avgSpeed) : 0;
    if ('remainDistance' in point) point.remainDistance = round(remain, 2);
    if ('remainKm' in point) point.remainKm = round(remain / 1000, 3);
    if ('elapsedTime' in point) point.elapsedTime = fmtClock(sec);
    // 预估剩余：按当前平均速度外推，距离或时间不足时给 0:00
    if ('remainTime' in point) {
        point.remainTime = (dist > 0 && remain > 0) ? fmtClock(remain * sec / dist) : fmtClock(0);
    }
}

/**
 * 在扁平的 [x,y,x,y,...] 设计坐标序列上取 t（秒，可含小数）处的点。
 * 序列与 trkpt 1:1 对齐（computeChartPoints 就是逐点 push 的），所以秒数直接当下标用。
 * @returns {{x: number, y: number}|null} 越界取不到点时返回 null，调用方按老逻辑跳过本帧
 */
export function sampleSeriesAt(points, t) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const { index, frac } = splitTime(t, Math.floor(points.length / 2));
    const x = points[index * 2];
    const y = points[index * 2 + 1];
    if (x === undefined || y === undefined) return null;
    if (frac === 0) return { x, y };
    const nx = points[index * 2 + 2];
    const ny = points[index * 2 + 3];
    if (nx === undefined || ny === undefined) return { x, y };
    return { x: lerp(x, nx, frac), y: lerp(y, ny, frac) };
}

/**
 * 「已走过」的折线：整段取到 floor(t)，再补一个亚秒头部点。
 * frac===0 时输出与升级前那句 `for (i = 0; i <= currentFrame; i++)` 逐项相同
 * （含 `|| 0` 的空值兜底与缩放乘法顺序）。
 * @param {number[]} points - 扁平设计坐标序列
 * @param {number} t - 秒（可含小数）
 * @param {number} [sx=1] - 横向缩放比
 * @param {number} [sy=1] - 纵向缩放比
 * @returns {number[]} 缩放后的扁平序列
 */
export function sliceSeriesTo(points, t, sx = 1, sy = 1) {
    if (!Array.isArray(points) || points.length < 2) return [];
    const { index, frac } = splitTime(t, Math.floor(points.length / 2));
    const out = [];
    for (let i = 0; i <= index; i++) {
        out.push((points[i * 2] || 0) * sx, (points[i * 2 + 1] || 0) * sy);
    }
    if (frac > 0) {
        const head = sampleSeriesAt(points, t);
        if (head) out.push((head.x || 0) * sx, (head.y || 0) * sy);
    }
    return out;
}

/**
 * 经纬度路径（[[lng,lat] 或 null 占位，与帧号对齐）上取 t 秒处的点。
 * @returns {number[]|null} 两端点都有效才做亚秒插值，否则回落到整数帧坐标
 */
export function samplePathPoint(path, t) {
    if (!Array.isArray(path) || path.length === 0) return null;
    const { index, frac } = splitTime(t, path.length);
    const a = path[index];
    if (!a) return null;
    if (frac === 0) return a;
    const b = path[index + 1];
    if (!b) return a;
    return [lerp(a[0], b[0], frac), lerp(a[1], b[1], frac)];
}

/**
 * 把稠密帧号换算成秒：t = 起始秒 + f / fps，夹到止秒。
 * 末尾 (fps-1) 帧会夹在止秒上重复显示 —— 那正是升级前「最后一帧独占 1 秒」的那一段，
 * 这样总时长 = 帧数 / fps = 秒数，与升级前逐秒口径一致（选 60 秒就是 60 秒，不缩水）。
 * @param {number} startFrame - 秒空间起始帧
 * @param {number} f - 稠密帧号（0 起）
 * @param {number} fps - 每秒帧数
 * @param {number} endFrame - 秒空间结束帧（夹住上界）
 * @returns {number} 秒（可含小数）
 */
export function timeOfFrame(startFrame, f, fps, endFrame) {
    const t = startFrame + f / (Number(fps) || 1);
    return Number.isFinite(endFrame) ? Math.min(t, endFrame) : t;
}
