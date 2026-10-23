/**
 * DataPipeline.js - 数据处理管道
 * 编排：parse → repair → interpolate → compute
 * 是数据从文件到可用状态的唯一入口
 */

import { parse } from '../parsers/index.js';
import { interpolatePoints } from './interpolator.js';
import { repairSparseSeries } from './seriesRepair.js';
import { computeAllFields } from './fieldComputer.js';
import { validateRq } from './DataSchema.js';
import { eventBus, Events } from '../core/EventBus.js';

/**
 * 抽取轨迹点数组的调试快照（点数 + 首尾样本 + 摘要），避免直接打印超大数组
 * 首尾点做浅拷贝：repair / interpolate 会原地改写同一个对象，直接引用会让
 * 「原始」快照跟着变成修补后的值。
 * @param {Object} rq - 统一数据结构
 */
function debugSnapshot(rq) {
    const trkpt = rq?.data?.trkpt || [];
    return {
        points: trkpt.length,
        first: trkpt[0] ? { ...trkpt[0] } : null,
        last: trkpt[trkpt.length - 1] ? { ...trkpt[trkpt.length - 1] } : null,
        summary: rq?.data?.summary || null,
        motion: rq?.data?.motion || null,
        lapStandard: (rq?.data?.lap_standard || []).length,
        lapUser: (rq?.data?.lap_user || []).length
    };
}

class DataPipeline {
    constructor() {
        this._chartData = null;
        this._mapPoints = null;
    }

    /**
     * 完整处理管道：文件 → 解析 → 就近修补 → 插值 → 计算补齐 → 就绪数据
     * @param {File} file - 用户上传的文件
     * @param {Function} [onProgress] - 进度回调 (stage: 'parse'|'repair'|'interpolate'|'compute')
     * @returns {Promise<Object>} 处理后的 rq 数据结构
     */
    async process(file, onProgress) {
        // 1. 解析
        if (onProgress) onProgress('parse');
        const rq = await parse(file);

        // 校验
        const validation = validateRq(rq);
        if (!validation.valid) {
            console.error('Data validation errors:', validation.errors);
            throw new Error('Invalid data: ' + validation.errors.join('; '));
        }

        eventBus.emit(Events.DATA_PARSED, rq);

        // ===== 调试：原始数据（解析后、逐秒插值前）=====
        // 注意：repair / interpolatePoints 都会原地改写 rq.data.trkpt，故此处先做一次快照
        const rawData = { ...debugSnapshot(rq), _note: 'parse 之后、修补与插值之前的原始点快照' };
        window.__rawData = rawData;
        console.log('[Data][原始 raw] 解析完成（修补与插值前）:', rawData);

        // 2. 空值修补：设备开机头几秒高程记 0、经纬度定不上（解析器统一写成 0），
        //    必须在插值前补掉——否则插值把 0 当真实样本，高程会从海平面爬上来，
        //    地图线会甩到 (0,0) 的几内亚湾。规则见 seriesRepair.js：
        //    高程就近冻结，经纬度成对补且洞内直线桥接。
        if (onProgress) onProgress('repair');
        const repairReport = repairSparseSeries(rq);
        window.__repairReport = repairReport;
        if (repairReport.filled > 0 || repairReport.allMissing.length) {
            console.log('[Data][修补 repair] 空值组修补:', repairReport);
        }

        // 3. 逐秒插值
        if (onProgress) onProgress('interpolate');
        interpolatePoints(rq);
        eventBus.emit(Events.DATA_INTERPOLATED, rq);

        // 4. 字段计算补齐
        if (onProgress) onProgress('compute');
        const computed = computeAllFields(rq);
        this._chartData = computed;
        this._mapPoints = computed.mapPoints;

        // 将图表数据附加到 rq 上，供组件 build() 使用
        rq._chartData = computed;
        rq._mapPoints = computed.mapPoints;

        // ===== 调试：处理后的数据（修补 + 插值 + 字段补齐完成）=====
        const processedData = { ...debugSnapshot(rq), repair: repairReport, chartFields: Object.keys(computed || {}) };
        window.__processedData = processedData; // 处理摘要快照
        window.__rq = rq;                       // 完整处理后 rq（含 _chartData / _mapPoints）
        window.__trkptData = rq.data.trkpt;     // 逐秒插值后的轨迹点数组
        window.__chartData = computed;          // 图表坐标与极值
        console.log('[Data][处理 processed] 修补 + 插值 + 补齐完成:', processedData);
        console.log('[Data] 控制台可用变量: window.__rawData / __repairReport / __processedData / __rq / __trkptData / __chartData');

        eventBus.emit(Events.DATA_COMPUTED, rq);
        eventBus.emit(Events.DATA_READY, { rq, chartData: computed, mapPoints: computed.mapPoints });

        return rq;
    }

    /**
     * 获取图表坐标数据
     * @returns {Object|null}
     */
    get chartData() {
        return this._chartData;
    }

    /**
     * 获取地图投影坐标
     * @returns {number[]|null}
     */
    get mapPoints() {
        return this._mapPoints;
    }
}

// 单例导出
export const dataPipeline = new DataPipeline();
