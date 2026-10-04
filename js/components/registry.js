/**
 * registry.js - 组件注册表
 * 集中管理所有组件定义，提供注册/获取/列举功能
 */

import { eventBus, Events } from '../core/EventBus.js';

class ComponentRegistry {
    constructor() {
        this._definitions = {};
    }

    /**
     * 注册一个组件定义（含 schema 校验）
     * @param {Object} definition - 组件定义
     */
    register(definition) {
        // 基础校验
        if (!definition || typeof definition !== 'object') {
            throw new Error('[Registry] Definition must be an object');
        }
        if (!definition.id) {
            throw new Error('[Registry] Component definition must have an id');
        }
        if (!definition.name) {
            console.warn(`[Registry] "${definition.id}" missing "name" field`);
        }
        if (!definition.category) {
            console.warn(`[Registry] "${definition.id}" missing "category" field`);
        }
        if (typeof definition.build !== 'function') {
            throw new Error(`[Registry] "${definition.id}" must have a build() function`);
        }
        if (typeof definition.update !== 'function') {
            console.warn(`[Registry] "${definition.id}" missing update() function — will not refresh per frame`);
        }
        if (definition.settings && !Array.isArray(definition.settings)) {
            throw new Error(`[Registry] "${definition.id}" settings must be an array`);
        }

        if (this._definitions[definition.id]) {
            console.warn(`[Registry] Component "${definition.id}" already registered, overwriting`);
        }
        this._definitions[definition.id] = definition;
    }

    /**
     * 批量注册
     * @param {Object[]} definitions
     */
    registerAll(definitions) {
        definitions.forEach(def => this.register(def));
    }

    /**
     * 获取组件定义
     * @param {string} id
     * @returns {Object|undefined}
     */
    get(id) {
        return this._definitions[id];
    }

    /**
     * 检查组件是否已注册
     * @param {string} id
     * @returns {boolean}
     */
    has(id) {
        return id in this._definitions;
    }

    /**
     * 获取所有组件定义
     * @returns {Object}
     */
    getAll() {
        return { ...this._definitions };
    }

    /**
     * 按分类获取组件列表
     * 支持 def.category 单分类 与 def.categories 多分类（老程序跨 Tab 重复组件）
     * @param {string} category
     * @returns {Object[]}
     */
    getByCategory(category) {
        return Object.values(this._definitions).filter(def =>
            def.category === category ||
            (Array.isArray(def.categories) && def.categories.includes(category))
        );
    }

    /**
     * 获取所有分类
     * @returns {string[]}
     */
    getCategories() {
        const cats = new Set();
        Object.values(this._definitions).forEach(def => {
            cats.add(def.category);
            if (Array.isArray(def.categories)) def.categories.forEach(c => cats.add(c));
        });
        return [...cats];
    }

    /**
     * 获取所有注册的组件 ID 列表
     * @returns {string[]}
     */
    getIds() {
        return Object.keys(this._definitions);
    }
}

// 单例导出
export const registry = new ComponentRegistry();
