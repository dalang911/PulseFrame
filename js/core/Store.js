/**
 * Store - 全局 UI 与配置状态管理
 *
 * 分层说明：
 *   Store        → 本文件：UI 配置 + 帧控制 + 渲染状态
 *   CanvasManager → core/CanvasManager.js：Leafer 画布实例引用
 *   DataPipeline  → data/DataPipeline.js：业务数据 + 图表计算中间量
 *
 * 注意：Leafer 实例（appview/frame/memoryApp/memoryFrame）
 *       不再存于此，请使用 canvasManager 访问。
 */
import { eventBus, Events } from './EventBus.js';

class Store {
    constructor() {
        this._state = {
            // ===== 数据引用（由 DataPipeline / app.js 写入） =====
            processedData: null,     // 插值 + 计算补齐后的完整 rq 对象
            trkptData: [],           // 轨迹点数组（逐秒插值后）
            chartData: null,         // 图表坐标数据（含极值）

            // ===== 帧控制 =====
            currentFrame: 0,         // 当前帧索引
            startFrame: 0,           // 视频起始帧
            endFrame: 0,             // 视频结束帧
            maxFrame: 0,             // 最大帧数 = trkptData.length

            // ===== 画布配置 =====
            canvasSize: { width: 1920, height: 1080 },

            // ===== 组件 =====
            activeComponents: [],    // 当前画布上的组件实例列表 [{id, config}]

            // ===== 视频渲染 =====
            isRendering: false,
            videoFormat: 'mp4',

            // ===== 模板 =====
            currentTemplate: null
        };
    }

    /**
     * 获取状态值
     * @param {string} key - 状态键名
     * @returns {*} 状态值
     */
    get(key) {
        return this._state[key];
    }

    /**
     * 设置状态值
     * @param {string} key - 状态键名
     * @param {*} value - 新值
     * @param {boolean} [silent=false] - 是否静默（不触发事件）
     */
    set(key, value, silent = false) {
        const oldValue = this._state[key];
        this._state[key] = value;
        if (!silent) {
            eventBus.emit(Events.STATE_CHANGED, { key, value, oldValue });
        }
    }

    /**
     * 批量设置状态
     * @param {Object} updates - 键值对
     * @param {boolean} [silent=false]
     */
    batchSet(updates, silent = false) {
        const changes = {};
        for (const [key, value] of Object.entries(updates)) {
            const oldValue = this._state[key];
            this._state[key] = value;
            changes[key] = { value, oldValue };
        }
        if (!silent) {
            eventBus.emit(Events.STATE_CHANGED, { changes });
        }
    }

    /**
     * 获取完整状态快照（只读）
     * @returns {Object}
     */
    snapshot() {
        return { ...this._state };
    }

    /**
     * 重置数据相关状态（新数据加载时调用，不清画布实例）
     */
    resetData() {
        this._state.processedData = null;
        this._state.trkptData = [];
        this._state.chartData = null;
        this._state.currentFrame = 0;
        this._state.startFrame = 0;
        this._state.endFrame = 0;
        this._state.maxFrame = 0;
        eventBus.emit(Events.STATE_CHANGED, { resetData: true });
    }

    /**
     * 获取键的默认值（仅用于 resetData 内部）
     */
    _getDefault(key) {
        const defaults = {
            processedData: null,
            trkptData: [],
            chartData: null,
            currentFrame: 0,
            startFrame: 0,
            endFrame: 0,
            maxFrame: 0,
            canvasSize: { width: 1920, height: 1080 },
            activeComponents: [],
            isRendering: false,
            videoFormat: 'mp4',
            currentTemplate: null
        };
        return defaults[key] ?? null;
    }
}

// 导出单例
export const store = new Store();
