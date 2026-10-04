/**
 * UnitConfig.js - 全局单位（前后缀）配置
 *
 * 管理常见变量数值（心率、步频、速度、配速、功率、高度、距离等）的
 * 自定义前缀 / 后缀字符串。默认后缀即当前各仪表盘硬编码的单位文本。
 *
 * 特性：
 *   - 单例，全局共享（组件 update / build 时读取）
 *   - localStorage 持久化（键：newsports_unit_config）
 *   - 变更时通过 eventBus 广播 Events.UNIT_CONFIG_CHANGED，驱动画布刷新
 */

import { eventBus, Events } from './EventBus.js';

const STORAGE_KEY = 'newsports_unit_config';

/**
 * 单位定义表：key → { label, defaultPrefix, defaultSuffix }
 * defaultSuffix 沿用迁移前各组件硬编码的单位文本，作为默认后缀。
 */
export const UNIT_DEFS = [
    { key: 'heart_rate',  label: 'Heart Rate',   defaultPrefix: '', defaultSuffix: 'bpm' },
    { key: 'pace',        label: 'Pace',          defaultPrefix: '', defaultSuffix: 'min/km' },
    { key: 'speed',       label: 'Speed',         defaultPrefix: '', defaultSuffix: 'km/h' },
    { key: 'cadence',     label: 'Cadence',       defaultPrefix: '', defaultSuffix: 'steps/min' },
    { key: 'rpm',         label: 'Rpm',           defaultPrefix: '', defaultSuffix: 'Rpm' },
    { key: 'power',       label: 'Power',         defaultPrefix: '', defaultSuffix: 'watt' },
    { key: 'step_length', label: 'Step Length',   defaultPrefix: '', defaultSuffix: 'm' },
    { key: 'altitude',    label: 'Altitude',      defaultPrefix: '', defaultSuffix: 'm' },
    { key: 'distance',    label: 'Distance',      defaultPrefix: '', defaultSuffix: 'Km' }
];

class UnitConfig {
    constructor() {
        /** @type {Object<string, {prefix:string, suffix:string}>} */
        this._config = {};
        this._load();
    }

    /** 用默认值初始化，再叠加 localStorage 中已保存的覆盖 */
    _buildDefaults() {
        const map = {};
        UNIT_DEFS.forEach(d => {
            map[d.key] = { prefix: d.defaultPrefix, suffix: d.defaultSuffix };
        });
        return map;
    }

    _load() {
        this._config = this._buildDefaults();
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const saved = JSON.parse(raw);
                Object.keys(this._config).forEach(k => {
                    if (saved && saved[k]) {
                        this._config[k] = {
                            prefix: typeof saved[k].prefix === 'string' ? saved[k].prefix : this._config[k].prefix,
                            suffix: typeof saved[k].suffix === 'string' ? saved[k].suffix : this._config[k].suffix
                        };
                    }
                });
            }
        } catch (e) {
            console.warn('[UnitConfig] load failed, using defaults:', e);
        }
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._config));
        } catch (e) {
            console.warn('[UnitConfig] save failed:', e);
        }
    }

    /** 全部单位定义（供浮动窗渲染） */
    getDefs() {
        return UNIT_DEFS;
    }

    /**
     * 读取某单位的当前前后缀配置
     * @param {string} key
     * @returns {{prefix:string, suffix:string}}
     */
    get(key) {
        return this._config[key] || { prefix: '', suffix: '' };
    }

    /** 前缀字符串（原始） */
    prefixOf(key) {
        return (this._config[key] && this._config[key].prefix) || '';
    }

    /** 后缀字符串（原始） */
    suffixOf(key) {
        return (this._config[key] && this._config[key].suffix) || '';
    }

    /**
     * 设置某单位前后缀（内部方法，不广播；批量提交用 applyAll）
     * @param {string} key
     * @param {{prefix?:string, suffix?:string}} parts
     */
    set(key, parts) {
        if (!this._config[key]) return;
        if (typeof parts.prefix === 'string') this._config[key].prefix = parts.prefix;
        if (typeof parts.suffix === 'string') this._config[key].suffix = parts.suffix;
    }

    /**
     * 批量应用并持久化 + 广播变更
     * @param {Object<string, {prefix:string, suffix:string}>} map
     */
    applyAll(map) {
        Object.keys(map).forEach(k => this.set(k, map[k]));
        this._save();
        eventBus.emit(Events.UNIT_CONFIG_CHANGED, this._config);
    }

    /** 恢复全部默认并持久化 + 广播 */
    reset() {
        this._config = this._buildDefaults();
        this._save();
        eventBus.emit(Events.UNIT_CONFIG_CHANGED, this._config);
    }

    /**
     * 智能拼接：在数值前后加前/后缀，自动补空格（除非用户已含空格）
     * @param {string} key - 单位键
     * @param {*} value - 数值（或已格式化的字符串）
     * @returns {string}
     */
    format(key, value) {
        const p = this.prefixOf(key);
        const s = this.suffixOf(key);
        let out = String(value);
        if (p) out = (/^\s/.test(p) ? p : p + ' ') + out;
        if (s) out = out + (/\s$/.test(s) ? s : ' ' + s);
        return out;
    }

    /**
     * 仅组合"前缀 + 数值"（用于仪表盘：数值行 + 独立单位行分离展示）
     * @param {string} key
     * @param {*} value
     * @returns {string}
     */
    formatPrefixed(key, value) {
        const p = this.prefixOf(key);
        let out = String(value);
        if (p) out = (/^\s/.test(p) ? p : p + ' ') + out;
        return out;
    }
}

// 导出单例
export const unitConfig = new UnitConfig();
export default unitConfig;
