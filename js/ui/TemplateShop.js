/**
 * TemplateShop.js - 模板商店前端
 * 集成在编辑器左侧面板，提供模板浏览、搜索、预览、应用和提交功能
 */

import { eventBus, Events } from '../core/EventBus.js';
import { store } from '../core/Store.js';
import { apiBase, safeThumb } from '../core/appConfig.js';
import { templateManager } from './TemplateManager.js';

const CACHE_KEY = 'templateShop_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

const CATEGORIES = [
    { value: '', label: 'All' },
    { value: 'running', label: 'Running' },
    { value: 'cycling', label: 'Cycling' },
    { value: 'swimming', label: 'Swimming' },
    { value: 'custom', label: 'Custom' }
];

class TemplateShop {
    constructor() {
        this._templates = [];
        this._currentCategory = '';
        this._currentKeyword = '';
        this._container = null;
        this._previewModal = null;
    }

    /**
     * 初始化商店 UI
     * @param {HTMLElement|string} container - 挂载容器
     */
    init(container) {
        this._container = typeof container === 'string'
            ? document.querySelector(container)
            : container;

        if (!this._container) {
            console.error('[TemplateShop] Container not found');
            return;
        }

        this._render();
        this._bindEvents();
        this._loadFromCacheOrApi();
        this._createPreviewModal();
    }

    /**
     * 渲染商店主界面
     */
    _render() {
        this._container.innerHTML = `
            <div class="shop-root">
                <div class="shop-header">
                    <h4 class="shop-title">Template Shop</h4>
                    <button class="layui-btn layui-btn-xs layui-btn-normal shop-submit-btn" id="shopSubmitBtn">
                        Submit Template
                    </button>
                </div>
                <div class="shop-search">
                    <input type="text" class="shop-search-input" id="shopSearchInput"
                        placeholder="Search template name / author...">
                </div>
                <div class="shop-categories" id="shopCategories">
                    ${CATEGORIES.map(c => `
                        <span class="shop-cat-tag ${c.value === this._currentCategory ? 'active' : ''}"
                            data-category="${c.value}">${c.label}</span>
                    `).join('')}
                </div>
                <div class="shop-list" id="shopList">
                    <div class="shop-loading">Loading...</div>
                </div>
            </div>
        `;
    }

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 分类切换
        this._container.addEventListener('click', (e) => {
            const catTag = e.target.closest('.shop-cat-tag');
            if (catTag) {
                this._currentCategory = catTag.dataset.category;
                this._container.querySelectorAll('.shop-cat-tag').forEach(t => t.classList.remove('active'));
                catTag.classList.add('active');
                this._refreshList();
                return;
            }

            // 模板卡片点击
            const card = e.target.closest('.shop-card');
            if (card) {
                const id = parseInt(card.dataset.id);
                this._previewTemplate(id);
                return;
            }
        });

        // 搜索
        const searchInput = this._container.querySelector('#shopSearchInput');
        let searchTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                this._currentKeyword = searchInput.value.trim();
                this._refreshList();
            }, 300);
        });

        // 提交按钮
        this._container.querySelector('#shopSubmitBtn').addEventListener('click', () => {
            this._showSubmitDialog();
        });
    }

    /**
     * 从缓存或 API 加载模板列表
     */
    async _loadFromCacheOrApi() {
        // 检查缓存
        const cached = this._getCache();
        if (cached) {
            this._templates = cached;
            this._refreshList();
            return;
        }

        await this._fetchTemplates();
    }

    /**
     * 从 API 获取模板列表
     */
    async _fetchTemplates() {
        try {
            let url = `${apiBase()}?action=list`;
            if (this._currentCategory) {
                url += `&category=${encodeURIComponent(this._currentCategory)}`;
            }
            if (this._currentKeyword) {
                url += `&keyword=${encodeURIComponent(this._currentKeyword)}`;
            }

            const response = await fetch(url);

            // 检查响应是否为 JSON（未部署商店时可能返回 HTML 首页）
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('application/json')) {
                console.warn('[TemplateShop] API 不可用（非 JSON 响应），商店功能暂不可用');
                this._templates = [];
                this._refreshList();
                return;
            }

            const result = await response.json();

            if (result.success) {
                this._templates = result.data || [];
                this._setCache(this._templates);
                this._refreshList();
            } else {
                console.warn('[TemplateShop] API 返回错误:', result.error);
                this._templates = [];
                this._refreshList();
            }
        } catch (err) {
            // API 不可用时静默处理，不显示错误
            console.warn('[TemplateShop] API 请求失败（商店功能暂不可用）:', err.message);
            this._templates = [];
            this._refreshList();
        }
    }

    /**
     * 刷新模板列表渲染
     */
    _refreshList() {
        const list = this._container.querySelector('#shopList');
        if (!list) return;

        // 客户端过滤（如果 API 不支持某些过滤）
        let filtered = this._templates;
        if (this._currentCategory) {
            filtered = filtered.filter(t => t.category === this._currentCategory);
        }
        if (this._currentKeyword) {
            const kw = this._currentKeyword.toLowerCase();
            filtered = filtered.filter(t =>
                (t.title || '').toLowerCase().includes(kw) ||
                (t.author || '').toLowerCase().includes(kw)
            );
        }

        if (filtered.length === 0) {
            list.innerHTML = '<div class="shop-empty">No templates yet</div>';
            return;
        }

        list.innerHTML = filtered.map(t => `
            <div class="shop-card" data-id="${t.id}">
                <div class="shop-card-thumb">
                    ${safeThumb(t.thumbnail)
                        ? `<img src="${safeThumb(t.thumbnail)}" alt="${this._escapeHtml(t.title)}">`
                        : '<span class="shop-no-thumb">No preview</span>'}
                </div>
                <div class="shop-card-info">
                    <div class="shop-card-title">${this._escapeHtml(t.title)}</div>
                    <div class="shop-card-meta">
                        <span class="shop-card-author">${this._escapeHtml(t.author)}</span>
                        <span class="shop-card-cat">${this._getCategoryLabel(t.category)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    /**
     * 创建预览弹窗
     */
    _createPreviewModal() {
        const modal = document.createElement('div');
        modal.className = 'shop-modal';
        modal.innerHTML = `
            <div class="shop-modal-content">
                <div class="shop-modal-header">
                    <h3 class="shop-modal-title" id="shopModalTitle">Template Preview</h3>
                    <button class="shop-modal-close" id="shopModalClose">&times;</button>
                </div>
                <div class="shop-modal-body">
                    <div class="shop-preview-area" id="shopPreviewArea"></div>
                    <div class="shop-detail-info" id="shopDetailInfo"></div>
                </div>
                <div class="shop-modal-footer">
                    <button class="layui-btn layui-btn-xs layui-btn-primary" id="shopModalCancel">Close</button>
                    <button class="layui-btn layui-btn-xs layui-btn-normal" id="shopModalApply">Apply Template</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        this._previewModal = modal;

        // 绑定弹窗事件
        modal.querySelector('#shopModalClose').addEventListener('click', () => this._closePreview());
        modal.querySelector('#shopModalCancel').addEventListener('click', () => this._closePreview());
        modal.querySelector('#shopModalApply').addEventListener('click', () => this._applyTemplate());

        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this._closePreview();
        });
    }

    /**
     * 预览模板
     */
    async _previewTemplate(id) {
        try {
            const response = await fetch(`${apiBase()}?action=detail&id=${id}`);
            const result = await response.json();

            if (!result.success || !result.data) {
                alert('Failed to load template details');
                return;
            }

            const template = result.data;
            this._currentPreviewTemplate = template;

            // 显示弹窗
            this._previewModal.querySelector('#shopModalTitle').textContent = template.title;

            // 渲染预览区
            const previewArea = this._previewModal.querySelector('#shopPreviewArea');
            const thumb = safeThumb(template.thumbnail);
            if (thumb) {
                previewArea.innerHTML = `<img src="${thumb}" style="max-width:100%;max-height:300px;">`;
            } else {
                previewArea.innerHTML = '<div class="shop-no-thumb" style="height:200px;line-height:200px;">No preview</div>';
            }

            // 显示详情
            const detailInfo = this._previewModal.querySelector('#shopDetailInfo');
            detailInfo.innerHTML = `
                <p><strong>Author: </strong>${this._escapeHtml(template.author)}</p>
                <p><strong>Category: </strong>${this._getCategoryLabel(template.category)}</p>
                <p><strong>Description: </strong>${this._escapeHtml(template.description) || 'None'}</p>
                <p><strong>Created: </strong>${template.created_at || 'Unknown'}</p>
            `;

            this._previewModal.classList.add('show');
        } catch (err) {
            console.error('[TemplateShop] Preview error:', err);
            alert('Preview failed');
        }
    }

    /**
     * 关闭预览弹窗
     */
    _closePreview() {
        if (this._previewModal) {
            this._previewModal.classList.remove('show');
        }
        this._currentPreviewTemplate = null;
    }

    /**
     * 应用模板到当前画布
     */
    _applyTemplate() {
        if (!this._currentPreviewTemplate) return;

        try {
            const jsonContent = JSON.parse(this._currentPreviewTemplate.json_content);
            templateManager.deserialize(jsonContent);
            this._closePreview();
            eventBus.emit(Events.TEMPLATE_LOAD, jsonContent);
        } catch (err) {
            console.error('[TemplateShop] Apply error:', err);
            alert('Failed to apply template: ' + err.message);
        }
    }

    /**
     * 显示提交模板对话框
     */
    _showSubmitDialog() {
        const title = prompt('Enter template name:');
        if (!title) return;

        const category = prompt('Enter category (running/cycling/swimming/custom):', 'custom');
        if (!category) return;

        const author = prompt('Enter your nickname:', '');
        if (!author) return;

        const description = prompt('Enter template description (optional):', '');

        templateManager.submitToShop({ title, category, author, description })
            .then(result => {
                if (result.success) {
                    alert('Template submitted, pending admin review!');
                    // 刷新列表
                    this._clearCache();
                    this._fetchTemplates();
                } else {
                    alert('Submit failed: ' + (result.error || 'Unknown error'));
                }
            })
            .catch(err => {
                alert('Submit failed: ' + err.message);
            });
    }

    /**
     * 显示错误信息
     */
    _showError(msg) {
        const list = this._container.querySelector('#shopList');
        if (list) {
            list.innerHTML = `<div class="shop-empty">${msg}</div>`;
        }
    }

    // ===== 缓存管理 =====

    _getCache() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const { data, timestamp } = JSON.parse(raw);
            if (Date.now() - timestamp > CACHE_TTL) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }
            return data;
        } catch {
            return null;
        }
    }

    _setCache(data) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                data,
                timestamp: Date.now()
            }));
        } catch {
            // localStorage 满则忽略
        }
    }

    _clearCache() {
        localStorage.removeItem(CACHE_KEY);
    }

    // ===== 工具方法 =====

    _getCategoryLabel(value) {
        const cat = CATEGORIES.find(c => c.value === value);
        return cat ? cat.label : value;
    }

    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 单例导出
export const templateShop = new TemplateShop();
