/**
 * Exporter.js - 导出模块
 * 负责将设计器画布内容导出为 JSON / 保存本地 / 提交商店
 */

import { registry } from '../components/registry.js';
import { apiBase } from '../core/appConfig.js';

const STORAGE_PREFIX = 'designer_';

class Exporter {
    /**
     * 将画布序列化为模板 JSON
     * @param {Object} frame - Leafer Frame
     * @param {Object} canvasSize - { width, height }
     * @returns {Object}
     */
    serialize(frame, canvasSize) {
        if (!frame) return null;

        const components = [];
        frame.children.forEach(child => {
            if (!child.id) return;

            const definition = registry.get(child.id);
            if (!definition) return;

            components.push({
                id: child.id,
                name: definition.name,
                x: child.x,
                y: child.y,
                width: child.width,
                height: child.height,
                rotation: child.rotation || 0,
                scale: child.scale || 1,
                customProps: this._extractCustomProps(child)
            });
        });

        return {
            version: '2.0',
            canvasSize: canvasSize || { width: 1920, height: 1080 },
            components,
            createdAt: new Date().toISOString()
        };
    }

    /**
     * 导出为 JSON 文件下载
     */
    exportJSON(frame, canvasSize, filename = 'dashboard_template.json') {
        const json = this.serialize(frame, canvasSize);
        if (!json) {
            alert('Nothing to export');
            return;
        }

        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 保存到 localStorage
     */
    saveLocal(frame, canvasSize, name) {
        const json = this.serialize(frame, canvasSize);
        if (!json) return;

        const key = STORAGE_PREFIX + name;
        localStorage.setItem(key, JSON.stringify(json));
        console.log('[Exporter] Saved to localStorage:', key);
        return key;
    }

    /**
     * 从 localStorage 加载
     */
    loadLocal(name) {
        const key = STORAGE_PREFIX + name;
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    /**
     * 列出 localStorage 中的模板
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
                } catch {
                    // 跳过无效条目
                }
            }
        }
        return templates;
    }

    /**
     * 提交到模板商店
     */
    async submitToShop(frame, canvasSize, metadata) {
        const json = this.serialize(frame, canvasSize);
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
                thumbnail: ''
            })
        });

        return response.json();
    }

    /**
     * 提取自定义属性（与默认配置的差异）
     */
    _extractCustomProps(box) {
        const props = {};
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
}

export const exporter = new Exporter();
