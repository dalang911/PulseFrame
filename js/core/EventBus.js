/**
 * EventBus - 发布-订阅事件总线
 * 用于模块间解耦通信，替代全局变量直接引用
 */
class EventBus {
    constructor() {
        this._listeners = {};
    }

    /**
     * 监听事件
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     * @returns {Function} 取消监听的函数
     */
    on(event, callback) {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(callback);
        return () => this.off(event, callback);
    }

    /**
     * 监听事件（仅执行一次）
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    once(event, callback) {
        const wrapper = (...args) => {
            callback(...args);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }

    /**
     * 取消监听
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    off(event, callback) {
        if (!this._listeners[event]) return;
        if (!callback) {
            this._listeners[event] = [];
            return;
        }
        this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }

    /**
     * 触发事件
     * @param {string} event - 事件名称
     * @param {...*} args - 传递给回调的参数
     */
    emit(event, ...args) {
        if (!this._listeners[event]) return;
        this._listeners[event].forEach(callback => {
            try {
                callback(...args);
            } catch (err) {
                console.error(`EventBus error in "${event}":`, err);
            }
        });
    }
}

// 导出单例
export const eventBus = new EventBus();

// 事件名称常量（避免字符串硬编码）
export const Events = {
    // 数据相关
    DATA_LOADED: 'data:loaded',
    DATA_PARSED: 'data:parsed',
    DATA_INTERPOLATED: 'data:interpolated',
    DATA_COMPUTED: 'data:computed',
    DATA_READY: 'data:ready',
    DATA_PROCESSED: 'data:processed',

    // 帧相关
    FRAME_UPDATE: 'frame:update',
    FRAME_RANGE_CHANGE: 'frame:range:change',

    // 组件相关
    COMPONENT_SELECTED: 'component:selected',
    COMPONENT_ADDED: 'component:added',
    COMPONENT_REMOVED: 'component:removed',
    COMPONENT_UPDATED: 'component:updated',

    // 画布相关
    CANVAS_RESIZE: 'canvas:resize',
    CANVAS_CLEAR: 'canvas:clear',
    CANVAS_READY: 'canvas:ready',

    // 模板相关
    TEMPLATE_LOAD: 'template:load',
    TEMPLATE_SAVE: 'template:save',
    TEMPLATE_SUBMIT: 'template:submit',

    // 视频渲染相关
    RENDER_START: 'render:start',
    RENDER_PROGRESS: 'render:progress',
    RENDER_COMPLETE: 'render:complete',
    RENDER_ABORT: 'render:abort',

    // UI 相关
    SETTINGS_SHOW: 'settings:show',
    SETTINGS_HIDE: 'settings:hide',
    WIDGET_PICK: 'widget:pick',

    // 全局单位（前后缀）配置
    UNIT_CONFIG_CHANGED: 'unit:config:changed',

    // 状态变化
    STATE_CHANGED: 'state:changed'
};
