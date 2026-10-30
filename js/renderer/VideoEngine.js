/**
 * VideoEngine.js - 视频编码引擎
 * 封装 MediaBunny 调用，支持 MP4/WebM/MOV 格式
 */

import { eventBus, Events } from '../core/EventBus.js';
import { VIDEO_DEFAULTS, VIDEO_FORMATS, normalizeVideoFps } from '../core/constants.js';

class VideoEngine {
    constructor() {
        this._output = null;
        this._videoSource = null;
        this._isInitialized = false;
        this._mbModules = null;
        this._config = {};
    }

    /**
     * 加载 MediaBunny 模块（动态 import）
     * @returns {Promise<Object>} MediaBunny 模块
     */
    async loadModules() {
        if (this._mbModules) return this._mbModules;

        const mod = await import('../mediabunny.min.js');
        this._mbModules = {
            Output: mod.Output,
            BufferTarget: mod.BufferTarget,
            Mp4OutputFormat: mod.Mp4OutputFormat,
            WebMOutputFormat: mod.WebMOutputFormat,
            MovOutputFormat: mod.MovOutputFormat,
            CanvasSource: mod.CanvasSource,
            QUALITY_HIGH: mod.QUALITY_HIGH
        };
        return this._mbModules;
    }

    /**
     * 初始化视频编码器
     * @param {HTMLCanvasElement} canvas - 视频帧输出 Canvas
     * @param {Object} options - 编码配置
     * @returns {Promise<void>}
     */
    async initEncoder(canvas, options = {}) {
        if (this._isInitialized) return;

        const mb = await this.loadModules();

        const fps = normalizeVideoFps(options.fps);

        this._config = {
            width: options.width || 1920,
            height: options.height || 1080,
            codec: options.codec || VIDEO_DEFAULTS.codec,
            bitrate: options.bitrate || VIDEO_DEFAULTS.bitrate,
            videoFormat: options.videoFormat || VIDEO_DEFAULTS.format,
            ...options,
            // 归一化后的帧率要盖掉 ...options 里的原始值：0 / 负数 / 2.5 / undefined
            // 都不该进到编码参数里（钳制规则见 constants.normalizeVideoFps）
            fps
        };

        // 根据格式创建输出格式
        let outputFormat;
        if (this._config.videoFormat === VIDEO_FORMATS.WEBM) {
            outputFormat = new mb.WebMOutputFormat({
                codec: 'vp9',
                bitrate: mb.QUALITY_HIGH
            });
        } else if (this._config.videoFormat === VIDEO_FORMATS.MOV) {
            outputFormat = new mb.MovOutputFormat({
                codec: 'prores',
                bitrate: 330_000_000
            });
        } else {
            outputFormat = new mb.Mp4OutputFormat({
                codec: this._config.codec,
                bitrate: this._config.bitrate
            });
        }

        // 创建输出器
        this._output = new mb.Output({
            format: outputFormat,
            target: new mb.BufferTarget()
        });

        // 配置 CanvasSource
        const canvasOpts = {
            width: this._config.width,
            height: this._config.height
        };

        if (this._config.videoFormat === VIDEO_FORMATS.WEBM) {
            canvasOpts.codec = 'vp9';
            canvasOpts.bitrate = mb.QUALITY_HIGH;
            canvasOpts.alpha = 'keep';
        } else if (this._config.videoFormat === VIDEO_FORMATS.MOV) {
            canvasOpts.codec = 'prores';
            canvasOpts.bitrate = 330_000_000;
            canvasOpts.alpha = 'keep';
        } else {
            canvasOpts.codec = this._config.codec;
            canvasOpts.bitrate = this._config.bitrate;
        }

        this._videoSource = new mb.CanvasSource(canvas, canvasOpts);
        // 帧率 ≠ 1 才把恒定帧率栅格交给 MediaBunny：它把每个样本吸附成 round(t×fps)/fps、
        // 时长强制 1/fps，避免我们手写小数时间戳攒出来的累积漂移。
        // fps === 1 时一个轨道选项都不加，走的还是升级前那条 add(timestamp, duration) 原路，
        // 容器里的 timescale / frameRateIsConstant 写法也保持原样（默认观感不变）。
        if (this._config.fps !== 1) {
            this._output.addVideoTrack(this._videoSource, { frameRate: this._config.fps });
        } else {
            this._output.addVideoTrack(this._videoSource);
        }
        await this._output.start();

        this._isInitialized = true;
        console.log(`[VideoEngine] Initialized (${this._config.videoFormat}, ${this._config.fps} fps)`);
    }

    /**
     * 添加一帧到视频
     * @param {number} timestamp - 时间戳（秒，帧率>1 时是小数，由调用方按 f/fps 给绝对值）
     * @param {number} duration - 帧持续时间（秒，= 1/fps）
     */
    async addFrame(timestamp, duration) {
        if (!this._isInitialized) {
            throw new Error('Encoder not initialized');
        }
        await this._videoSource.add(timestamp, duration);
    }

    /**
     * 完成编码，返回视频 Blob
     * @returns {Promise<Blob>}
     */
    async finalize() {
        if (!this._isInitialized) {
            throw new Error('Encoder not initialized');
        }

        await this._output.finalize();

        const videoBuffer = this._output.target.buffer;
        let mimeType;

        switch (this._config.videoFormat) {
            case VIDEO_FORMATS.WEBM: mimeType = 'video/webm'; break;
            case VIDEO_FORMATS.MOV: mimeType = 'video/quicktime'; break;
            default: mimeType = 'video/mp4'; break;
        }

        const blob = new Blob([videoBuffer], { type: mimeType });
        this._cleanup();

        eventBus.emit(Events.RENDER_COMPLETE, blob);
        return blob;
    }

    /**
     * 中止渲染
     */
    abort() {
        this._cleanup();
        eventBus.emit(Events.RENDER_ABORT);
        console.log('[VideoEngine] Aborted');
    }

    _cleanup() {
        this._output = null;
        this._videoSource = null;
        this._isInitialized = false;
    }

    get isInitialized() { return this._isInitialized; }
    /** 本次编码用的帧率（1 = 1 秒 1 帧，升级前口径） */
    get fps() { return this._config.fps || VIDEO_DEFAULTS.fps; }
    /** 单帧持续秒数，调用方按 f × 这个值给时间戳 */
    get frameDuration() { return 1 / this.fps; }
}

// 单例导出
export const videoEngine = new VideoEngine();
