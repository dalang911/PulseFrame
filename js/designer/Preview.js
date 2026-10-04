/**
 * Preview.js - 数据预览模块
 * 在设计器中使用模拟数据预览组件效果
 */

import { registry } from '../components/registry.js';
import { updateAllComponents } from '../components/updater.js';

/**
 * 生成模拟运动数据（用于预览）
 */
function generateMockData(totalFrames = 300) {
    const trkpt = [];
    const heartPoints = [];
    const pacePoints = [];
    const elePoints = [];

    for (let i = 0; i < totalFrames; i++) {
        const t = i / totalFrames;

        // 模拟心率：逐渐升高后平稳
        const hr = Math.round(100 + 60 * Math.sin(t * Math.PI) + Math.random() * 5);
        // 模拟配速：5:00 ~ 4:00 min/km
        const pace = 300 - 60 * Math.sin(t * Math.PI) + Math.random() * 10;
        // 模拟高程
        const ele = 50 + 100 * Math.sin(t * Math.PI * 2) + Math.random() * 5;
        // 模拟速度
        const speed = 1000 / pace * 60;
        // 模拟距离
        const distance = i * 5; // 5m per frame
        // 模拟踏频
        const cadence = Math.round(160 + 20 * Math.sin(t * Math.PI) + Math.random() * 5);

        trkpt.push({
            time: i,
            heart_rate: hr,
            pace: pace,
            elevation: ele,
            speed: speed,
            distance: distance,
            cadence: cadence,
            latitude: 30.0 + t * 0.01,
            longitude: 120.0 + t * 0.01
        });

        heartPoints.push({ x: i * 2, y: 200 - hr });
        pacePoints.push({ x: i * 2, y: 200 - (pace - 200) * 2 });
        elePoints.push({ x: i * 2, y: 200 - ele });
    }

    return {
        summary: {
            name: 'Mock Activity',
            training_at: '2024-01-15 08:30:00',
            total_time: totalFrames,
            sport: 'running'
        },
        motion: {
            distance: totalFrames * 5,
            total_ascent: 150,
            total_descent: 140,
            avg_heart_rate: 145,
            max_heart_rate: 178,
            avg_pace: 270,
            avg_speed: 12.5,
            avg_cadence: 170
        },
        trkpt: trkpt,
        lap_standard: [],
        lap_user: [],
        chartData: {
            heart_points: heartPoints,
            pace_points: pacePoints,
            ele_points: elePoints,
            heart_max: 178,
            heart_min: 95,
            pace_max: 310,
            pace_min: 230
        }
    };
}

class Preview {
    constructor() {
        this._mockData = null;
        this._isPlaying = false;
        this._currentFrame = 0;
        this._totalFrames = 300;
        this._animTimer = null;
        this._frame = null;
    }

    /**
     * 初始化预览
     * @param {Object} frame - Leafer Frame
     */
    init(frame) {
        this._frame = frame;
        this._mockData = generateMockData(this._totalFrames);
        this._bindControls();
    }

    /**
     * 绑定预览控制按钮
     */
    _bindControls() {
        const playBtn = document.getElementById('btnPlayPreview');
        const stopBtn = document.getElementById('btnStopPreview');
        const slider = document.getElementById('previewSlider');
        const toggleBtn = document.getElementById('btnTogglePreview');
        const dataPreview = document.getElementById('dataPreview');
        const previewContent = document.getElementById('previewContent');

        if (playBtn) {
            playBtn.addEventListener('click', () => this.play());
        }
        if (stopBtn) {
            stopBtn.addEventListener('click', () => this.stop());
        }
        if (slider) {
            slider.max = this._totalFrames - 1;
            slider.addEventListener('input', (e) => {
                this._currentFrame = parseInt(e.target.value);
                this.renderFrame(this._currentFrame);
            });
        }
        if (toggleBtn && dataPreview && previewContent) {
            toggleBtn.addEventListener('click', () => {
                const hidden = previewContent.style.display === 'none';
                previewContent.style.display = hidden ? '' : 'none';
                toggleBtn.textContent = hidden ? 'Collapse' : 'Expand';
            });
        }
    }

    /**
     * 播放预览
     */
    play() {
        if (this._isPlaying) return;
        this._isPlaying = true;

        this._animTimer = setInterval(() => {
            this._currentFrame++;
            if (this._currentFrame >= this._totalFrames) {
                this._currentFrame = 0;
            }

            this.renderFrame(this._currentFrame);

            // 更新 UI
            const slider = document.getElementById('previewSlider');
            const frameLabel = document.getElementById('previewFrame');
            if (slider) slider.value = this._currentFrame;
            if (frameLabel) frameLabel.textContent = `Frame: ${this._currentFrame}`;
        }, 100); // 10 FPS
    }

    /**
     * 停止预览
     */
    stop() {
        this._isPlaying = false;
        if (this._animTimer) {
            clearInterval(this._animTimer);
            this._animTimer = null;
        }
    }

    /**
     * 渲染指定帧
     * @param {number} frameIndex
     */
    renderFrame(frameIndex) {
        if (!this._frame || !this._mockData) return;

        // 使用 updater 更新所有组件
        try {
            updateAllComponents(frameIndex, this._mockData);
        } catch (err) {
            // 预览模式下某些组件可能无法更新，忽略错误
            console.debug('[Preview] Frame update error:', err.message);
        }
    }

    /**
     * 获取模拟数据
     */
    getMockData() {
        return this._mockData;
    }

    /**
     * 设置总帧数
     */
    setTotalFrames(count) {
        this._totalFrames = count;
        this._mockData = generateMockData(count);

        const slider = document.getElementById('previewSlider');
        if (slider) slider.max = count - 1;
    }
}

export const preview = new Preview();
