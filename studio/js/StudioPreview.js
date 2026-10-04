/**
 * studio/StudioPreview.js - 真实数据逐帧预览
 *
 * 数据源 window.__trkptData（未载入真实轨迹时由 StudioApp 注入内置体育场演示数据）。
 * 播放/拖动逐帧调用 studioCanvas.previewFrame() 观察绑定效果；
 * 播放到最后一帧自动停止；点 ⟲ 或退出预览时 studioCanvas.exitPreview() 恢复设计值。
 */

import { studioCanvas } from './StudioCanvas.js';

const PLAY_INTERVAL = 60; // ms/帧

class StudioPreview {
    constructor() {
        this._root = null;
        this._playing = false;
        this._timer = null;
        this._index = 0;
    }

    init(container) {
        this._root = typeof container === 'string' ? document.querySelector(container) : container;
        if (!this._root) { console.error('[StudioPreview] container not found'); return; }
        this._render();
    }

    hasData() {
        const trk = window.__trkptData;
        return Array.isArray(trk) && trk.length > 1;
    }

    _total() { return this.hasData() ? window.__trkptData.length : 0; }

    _render() {
        if (!this.hasData()) {
            this._root.innerHTML = `<div class="sp-preview-box sp-preview-disabled">
                <span class="sp-preview-hint">Load track data to preview the binding effect</span>
            </div>`;
            return;
        }
        this._root.innerHTML = `
            <div class="sp-preview-box">
                <button class="sp-pv-btn" id="pvPlay" title="Play demo data (auto-stops at the end)">▶</button>
                <input type="range" class="sp-pv-range" id="pvRange" min="0" max="${this._total() - 1}" value="0">
                <span class="sp-pv-time" id="pvTime">0 / ${this._total()}</span>
                <button class="sp-pv-btn" id="pvStop" title="Exit preview and restore design values">⟲</button>
            </div>`;
        this._bind();
    }

    _bind() {
        const range = this._root.querySelector('#pvRange');
        const play = this._root.querySelector('#pvPlay');
        const stop = this._root.querySelector('#pvStop');
        const time = this._root.querySelector('#pvTime');
        this._timeLabel = time; this._range = range; this._playBtn = play;

        range.addEventListener('input', () => { this._index = parseInt(range.value, 10); this._apply(); });
        play.addEventListener('click', () => this._toggle());
        stop.addEventListener('click', () => this._stop(true));
    }

    _apply() {
        studioCanvas.previewFrame(this._index);
        if (this._timeLabel) this._timeLabel.textContent = `${this._index} / ${this._total()}`;
        if (this._range) this._range.value = this._index;
    }

    _toggle() { this._playing ? this._stop(false) : this._start(); }

    _start() {
        if (!this.hasData()) return;
        if (this._index >= this._total() - 1) { this._index = 0; } // 播完后再点：从头播
        this._playing = true;
        if (this._playBtn) this._playBtn.textContent = '⏸';
        this._timer = setInterval(() => {
            if (this._index >= this._total() - 1) { this._finish(); return; } // 播完自动停止
            this._index += 1;
            this._apply();
        }, PLAY_INTERVAL);
    }

    /** 播放结束：停在最后一帧（不重置），恢复 ▶ 图标 */
    _finish() { this._stop(false); }

    _stop(reset) {
        this._playing = false;
        if (this._timer) { clearInterval(this._timer); this._timer = null; }
        if (this._playBtn) this._playBtn.textContent = '▶';
        if (reset) { this._index = 0; studioCanvas.exitPreview(); if (this._timeLabel) this._timeLabel.textContent = `0 / ${this._total()}`; if (this._range) this._range.value = 0; }
    }

    /** 数据可能晚于面板初始化才载入：主程序可调用 refresh() 重建控件 */
    refresh() { this._stop(true); this._render(); }
}

export const studioPreview = new StudioPreview();

// 混版自检，说明见 SpecStore.js 末尾同一段。
(window.__spSingles = window.__spSingles || {});
if (window.__spSingles.StudioPreview) window.__spDup = true;
window.__spSingles.StudioPreview = studioPreview;
