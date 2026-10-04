/**
 * TemplateManager.js - 模板本地管理
 * 负责模板的序列化/反序列化、localStorage 存储、导出/导入、提交共享
 */

import { store } from '../core/Store.js';
import { canvasManager } from '../core/CanvasManager.js';
import { eventBus, Events } from '../core/EventBus.js';
import { apiBase } from '../core/appConfig.js';
import { registry } from '../components/registry.js';
import { addComponentToCanvas, clearAllComponents, resizeBackground } from '../components/factory.js';

const STORAGE_PREFIX = 'frameConfig_';

class TemplateManager {
    /**
     * 将当前画布组件配置序列化为标准 JSON
     * @returns {Object} 模板 JSON
     */
    serialize() {
        const frame = canvasManager.frame;
        if (!frame) return null;

        const components = [];
        frame.children.forEach(child => {
            if (!child.id) return;

            const definition = registry.get(child.id);
            if (!definition) return;
            // 背景/Setup 属画布级设置（锁定、不入视频），不写入模板
            if (definition.isBackground) return;

            components.push({
                id: child.id,
                name: definition.name,
                x: child.x,
                y: child.y,
                width: child.width,
                height: child.height,
                rotation: child.rotation || 0,
                scale: child.scale || 1,
                // 保存子元素的自定义属性（颜色等）
                customProps: this._extractCustomProps(child, definition)
            });
        });

        return {
            version: '2.0',
            canvasSize: store.get('canvasSize') || { width: 1920, height: 1080 },
            components,
            createdAt: new Date().toISOString()
        };
    }

    /**
     * 从 JSON 恢复画布
     * @param {Object} templateJson
     */
    deserialize(templateJson) {
        if (!templateJson || !templateJson.components) return;

        const frame = canvasManager.frame;
        if (!frame) return;

        // 应用模板记录的画布尺寸（横/竖屏），保证组件坐标落在正确比例下
        const size = templateJson.canvasSize || { width: 1920, height: 1080 };
        store.set('canvasSize', { width: size.width, height: size.height });
        canvasManager.setCanvasSize(size.width, size.height);
        ['canv', 'videoCanvas'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) { el.width = size.width; el.height = size.height; }
        });

        // 全量重置：清空用户组件 + activeComponents + 内存实例组件（保留背景层），
        // 否则 addComponentToCanvas 的单例校验会拦截同名组件 → 重复载入时不生效。
        clearAllComponents();
        // 背景铺满新画布尺寸（保留用户当前背景色/图）
        resizeBackground(size.width, size.height);

        // 逐个恢复组件（跳过背景/Setup；同步顺序执行保证层叠一致）
        templateJson.components.forEach(comp => {
            const definition = registry.get(comp.id);
            if (!definition) {
                console.warn(`[TemplateManager] Unknown component: ${comp.id}`);
                return;
            }
            if (definition.isBackground) return;

            // 通过 factory 创建（含 customProps 样式覆盖）
            const configOverrides = {
                x: comp.x,
                y: comp.y,
                width: comp.width,
                height: comp.height
            };
            if (comp.customProps) {
                Object.assign(configOverrides, comp.customProps);
            }
            addComponentToCanvas(comp.id, configOverrides);
        });

        eventBus.emit(Events.TEMPLATE_LOAD, templateJson);
    }

    /**
     * 保存到 localStorage
     * @param {string} name - 模板名称
     * @returns {string} 存储 key
     */
    saveLocal(name) {
        const json = this.serialize();
        if (!json) return null;

        const key = STORAGE_PREFIX + name;
        localStorage.setItem(key, JSON.stringify(json));
        console.log(`[TemplateManager] Saved to localStorage: ${key}`);
        return key;
    }

    /**
     * 从 localStorage 加载
     * @param {string} name - 模板名称
     * @returns {Object|null}
     */
    loadLocal(name) {
        const key = STORAGE_PREFIX + name;
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        try {
            const json = JSON.parse(raw);
            this.deserialize(json);
            return json;
        } catch (err) {
            console.error('[TemplateManager] Load error:', err);
            return null;
        }
    }

    /**
     * 列出 localStorage 中所有模板
     * @returns {Array} [{ key, name, createdAt }]
     */
    listLocal() {
        const templates = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(STORAGE_PREFIX)) {
                const name = key.substring(STORAGE_PREFIX.length);
                try {
                    const json = JSON.parse(localStorage.getItem(key));
                    templates.push({
                        key,
                        name,
                        createdAt: json.createdAt || '',
                        componentCount: json.components?.length || 0
                    });
                } catch (e) {
                    // 跳过无效条目
                }
            }
        }
        return templates;
    }

    /**
     * 删除 localStorage 中的模板
     * @param {string} name
     */
    deleteLocal(name) {
        const key = STORAGE_PREFIX + name;
        localStorage.removeItem(key);
    }

    /**
     * 导出为 JSON 文件下载
     * @param {string} [filename='template.json']
     */
    exportFile(filename = 'template.json') {
        const json = this.serialize();
        if (!json) return;

        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 从 JSON 文件导入
     * @param {File} file
     * @returns {Promise<Object>}
     */
    async importFile(file) {
        const text = await file.text();
        const json = JSON.parse(text);
        this.deserialize(json);
        return json;
    }

    /**
     * 提交模板到共享商店
     * @param {Object} metadata - { title, category, author, description }
     * @returns {Promise<Object>} API 响应
     */
    async submitToShop(metadata) {
        const json = this.serialize();
        if (!json) throw new Error('No template data');

        const response = await fetch(apiBase(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'submit',
                title: metadata.title || 'Untitled',
                category: metadata.category || 'custom',
                author: metadata.author || 'Anonymous',
                description: metadata.description || '',
                json_content: JSON.stringify(json),
                thumbnail: this._generateThumbnail()
            })
        });

        return response.json();
    }

    /**
     * 提取组件的自定义属性（相对于默认配置的差异）
     */
    _extractCustomProps(box, definition) {
        const props = {};
        const defaults = definition.defaultConfig || {};

        // 检查颜色等常见自定义属性
        if (box.children) {
            box.children.forEach((child, idx) => {
                if (child.fill && child.fill !== '#000000') {
                    props[`child_${idx}_fill`] = child.fill;
                }
                if (child.stroke) {
                    props[`child_${idx}_stroke`] = child.stroke;
                }
                if (child.fontSize) {
                    props[`child_${idx}_fontSize`] = child.fontSize;
                }
            });
        }

        return props;
    }

    /**
     * 生成缩略图（截取当前画布）
     * @returns {string} base64 缩略图
     */
    _generateThumbnail() {
        const appv = document.getElementById('appv');
        if (!appv) return '';

        const canvas = appv.querySelector('canvas');
        if (!canvas) return '';

        try {
            return canvas.toDataURL('image/jpeg', 0.5);
        } catch (e) {
            return '';
        }
    }
}

// 单例导出
export const templateManager = new TemplateManager();
