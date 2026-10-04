/**
 * definitions/lapPanels.js - 圈速面板组件
 * 从老款程序迁移：
 *   appv_lap_pan       —— 标准公里计圈（含每 5km 合并 + 未完成公里实时用时）
 *   appv_lap_user_pan  —— 用户计圈表格（老 index.html formatLapTable 移植）+ 当前圈高亮标记
 */

import { store } from '../../core/Store.js';

const textshadow = { x: 2, y: 2, blur: 0, color: '#333333' };

/** 秒 → MM:SS */
function secToMMSS(total) {
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/** 秒 → HH:MM:SS */
function secToHHMMSS(total) {
    const t = Math.floor(total);
    const h = String(Math.floor(t / 3600)).padStart(2, '0');
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const s = String(t % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
}

/**
 * 用户计圈表格的列定义：key 决定设置项键名（col_xxx，可勾选是否显示）；
 * 表头与数据统一左对齐到列起点（x 相同），整列上下成线
 */
const LAP_COLUMNS = [
    { key: 'lap', title: 'lap', field: 'message_index', w: 55 },
    { key: 'time', title: 'time', field: 'total_elapsed_time', w: 100 },
    { key: 'distance', title: 'distance', field: 'total_distance', w: 95 },
    { key: 'pace', title: 'pace', field: 'avg_speed', w: 90 },
    { key: 'cad', title: 'cad', field: 'avg_cadence', w: 60 },
    { key: 'heart', title: 'heart', field: 'avg_heart_rate', w: 60 }
];

/** 设计基准：build 内几何全按此书写；容器被拖拽缩放时由 resizeChildren / resizeFontSize 等比放大 */
const LAP_DESIGN = { w: 540, h: 400, pad: 8, fontSize: 20 };

/**
 * Leafer 的 lineHeight 是「绝对 px」，缺省行高即 1.5 × 字号（写 1.5 会变成每行 1.5px）。
 * 这里按缺省推算行高，保证高亮色条与文字行对齐，并且能跟着字号一起缩放。
 */
const lapRowH = (fontSize) => (fontSize || LAP_DESIGN.fontSize) * 1.5;

/**
 * 计算列的横向排布（build 与 update 共用，保证两边口径一致）
 * fitColumns：把可见列按设计列宽比例拉伸铺满（time/distance 内容宽、lap/cad 窄，等分会挤爆，按内容比例更稳）；
 * 否则按设计列宽从左往右排（隐藏列不占位，其余列自动前移）
 * 列间留一个随字号缩进的间隙（fs×0.4，设计基准 20px → 8px），否则等分模式下内容宽几乎占满列宽，相邻列肉眼贴着
 * @param {Object} config @param {number} W 当前宽度 @param {number} [fontSize] 当前字号（缺省按设计基准）
 */
function layoutLapColumns(config, W, fontSize) {
    const shown = LAP_COLUMNS.filter(c => config['col_' + c.key] !== false);
    const pad = LAP_DESIGN.pad;
    const gap = (fontSize || LAP_DESIGN.fontSize) * 0.4;
    const usable = Math.max(0, (W || LAP_DESIGN.w) - pad * 2 - gap * Math.max(0, shown.length - 1));
    let cursor = pad;
    const sumW = shown.reduce((s, c) => s + c.w, 0);
    return shown.map(c => {
        const w = config.fitColumns === false ? c.w : usable * c.w / (sumW || 1);
        const item = { key: c.key, title: c.title, x: cursor, w };
        cursor += w + gap;
        return item;
    });
}

/** 配速 min/km（由 avg_speed km/h 推算，与 pace 列格式化口径一致）；速度无效时视为 Infinity（慢于任何阈值） */
function lapPaceMinPerKm(lap) {
    const speed = Number(lap && lap.avg_speed);
    return speed > 0 ? 60 / speed : Infinity;
}

/**
 * 圈数据过滤：只看加速段、隐藏热身/休息圈。阈值均按「表格展示口径」（km / min每km / spm / bpm），0 = 不过滤
 * 注意：过滤后的下标就是表格行号，build 与 update 必须共用同一份结果，高亮条才不会跑行
 */
function filterLapUser(lapData, config) {
    if (!Array.isArray(lapData)) return [];
    const minDist = Number(config.minDistance) || 0;
    const maxPace = Number(config.maxPace) || 0;
    const minCad = Number(config.minCadence) || 0;
    const minHR = Number(config.minHeart) || 0;
    if (!minDist && !maxPace && !minCad && !minHR) return lapData.slice();
    return lapData.filter(lap =>
        Number(lap.total_distance) >= minDist &&
        (!maxPace || lapPaceMinPerKm(lap) <= maxPace) &&
        Number(lap.avg_cadence) * 2 >= minCad &&
        Number(lap.avg_heart_rate) >= minHR
    );
}

/**
 * 移植老程序 index.html formatLapTable：把 lap_user 格式化为按列 key 索引的字符串数组（不含表头）
 * @param {Array} lapData
 * @returns {Object} { lap: ['1', ...], time: ['00:01:00', ...], ... }
 */
function formatLapColumns(lapData) {
    const columns = {};
    LAP_COLUMNS.forEach(c => { columns[c.key] = []; });

    // message_index 兼容 {value} 嵌套对象（老 FIT 输出）与纯数字
    const msgIndex = v => (v && typeof v === 'object') ? v.value : v;
    const isFirstLapZero = Number(msgIndex(lapData[0].message_index)) === 0;

    lapData.forEach(lap => {
        LAP_COLUMNS.forEach(({ key, field }) => {
            const value = lap[field];
            let formattedValue;
            if (field === 'message_index') {
                let index = msgIndex(value);
                if (isFirstLapZero && Number(index) >= 0) index = Number(index) + 1;
                formattedValue = String(index);
            } else if (field === 'total_elapsed_time') {
                formattedValue = secToHHMMSS(Number(value));
            } else if (field === 'avg_cadence') {
                formattedValue = String(Math.round(Number(value) * 2));
            } else if (field === 'total_distance') {
                formattedValue = Number(value).toFixed(2) + 'Km';
            } else if (field === 'avg_speed') {
                const speed = Number(value);
                if (isNaN(speed) || speed <= 0) {
                    formattedValue = '00\'00"';
                } else {
                    const totalSeconds = (60 / speed) * 60;
                    const minutes = Math.floor(totalSeconds / 60);
                    const seconds = Math.round(totalSeconds % 60);
                    formattedValue = `${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}"`;
                }
            } else {
                formattedValue = String(value);
            }
            columns[key].push(formattedValue);
        });
    });

    return columns;
}

/** start_time / timestamp → 秒级时间戳（兼容 Date / 毫秒 / 秒） */
function toEpochSec(v) {
    if (v == null) return NaN;
    if (typeof v === 'number') return v > 1e11 ? v / 1000 : v;
    const t = new Date(v).getTime();
    return isNaN(t) ? NaN : t / 1000;
}

// ============================================================
// 1. 标准公里计圈面板
// ============================================================
const appv_lap_pan = {
    id: 'appv_lap_pan',
    name: 'Lap Km',
    category: 'text',
    icon: './images/s2.png',
    defaultConfig: { x: 30, y: 560, width: 400, height: 400, cornerRadius: 4, textColor: '#FFFFFF' },
    dataBindings: ['distance', 'sec'],
    settings: [
        { name: 'Lap', type: 'title' },
        { name: 'Text color', key: 'textColor', type: 'color' }
    ],
    build(config) {
        return [{
            name: 'lap_status',
            tag: 'Text',
            resizeFontSize: true,
            width: 400,
            fontSize: 20,
            fontWeight: 'black',
            text: `1Km time: 00:00\n2Km time: 03:00`,
            fill: config.textColor || '#FFFFFF',
            textAlign: 'right',
            verticalAlign: 'top',
            shadow: textshadow
        }];
    },
    update(box, frameData, progress, ctx) {
        if (!box.children || !box.children[0]) return;
        const lapStandard = store.get('processedData')?.data?.lap_standard || [];
        const trkpt = ctx.trkptData;

        let segment_info = '';
        let lap = '';
        const completed_km = Math.floor((frameData.distance || 0) / 1000);
        const currentTotalDistance = frameData.distance || 0;
        const currentTotalSec = frameData.sec || 0;

        // 已完成整公里逐圈显示；每 5km 合并为一行
        for (let km = 1; km <= completed_km; km++) {
            if (km % 5 === 0 && km > 0) {
                const startKm = km - 4;
                let totalTime = 0;
                for (let i = startKm - 1; i < km; i++) {
                    if (i < lapStandard.length) totalTime += lapStandard[i].total_timer_time;
                }
                lap += `${startKm}-${km}km: ${secToMMSS(totalTime)}\n`;
                segment_info = lap;
            } else {
                const t = (km - 1) < lapStandard.length ? lapStandard[km - 1].total_timer_time : 0;
                segment_info += `${km}km: ${secToMMSS(t)}\n`;
            }
        }

        // 未完成公里实时用时
        const distanceInCurrentKm = currentTotalDistance % 1000;
        if (distanceInCurrentKm > 0) {
            let lastKmSec = 0;
            const lastKmDistance = completed_km * 1000;
            for (let i = ctx.currentFrame; i >= 0; i--) {
                if (trkpt[i] && trkpt[i].distance <= lastKmDistance) {
                    lastKmSec = trkpt[i].sec;
                    break;
                }
            }
            const timeInCurrentKm = Math.max(0, currentTotalSec - (lastKmSec || 0));
            segment_info += `+${Math.round(distanceInCurrentKm)}m: ${secToMMSS(timeInCurrentKm)}\n`;
        }

        box.children[0].text = segment_info;
    }
};

// ============================================================
// 2. 用户计圈表格面板（FIT laps 数据）
//    高亮行用 Rect 定位（不再靠 '▉' 字符铺，宽度可控），列可勾选是否显示
// ============================================================
const appv_lap_user_pan = {
    id: 'appv_lap_user_pan',
    name: 'Lap User',
    category: 'text',
    icon: './images/s3.png',
    defaultConfig: {
        x: 30, y: 560, width: LAP_DESIGN.w, height: LAP_DESIGN.h, cornerRadius: 4,
        textColor: '#FFFFFF',
        headerColor: '#FFD166',
        markerColor: '#FF3B30',
        markerOpacity: 28,               // 百分比（number 输入框里 0..1 小数不好调，改成 5..100）
        fontSize: LAP_DESIGN.fontSize,
        headerFontSize: 16,              // 表头独立字号：列窄时能调小，避免表头文字压到相邻列
        showHeader: true,
        fitColumns: true,
        zebra: false,
        col_lap: true, col_time: true, col_distance: true,
        col_pace: true, col_cad: true, col_heart: true,
        minDistance: 0,   // 长度列 < 此值(km) 的圈不显示；0=关
        maxPace: 0,       // 配速慢于此值(min/km) 的圈不显示（休息/慢跑段）；0=关
        minCadence: 0,    // 步频列(spm) < 此值不显示；0=关
        minHeart: 0       // 心率 < 此值不显示；0=关
    },
    dataBindings: ['timestamp'],
    settings: [
        { name: 'Lap User', type: 'title' },
        { name: 'Font size', key: 'fontSize', type: 'number', min: 10, max: 60 },
        { name: 'Header size', key: 'headerFontSize', type: 'number', min: 8, max: 40 },
        { name: 'Text color', key: 'textColor', type: 'color' },
        { name: 'Header color', key: 'headerColor', type: 'color' },
        { name: 'Row color', key: 'markerColor', type: 'color' },
        { name: 'Row opacity', key: 'markerOpacity', type: 'number', min: 5, max: 100, step: 5 },
        { name: 'Header row', key: 'showHeader', type: 'boolean' },
        { name: 'Zebra', key: 'zebra', type: 'boolean' },
        { name: 'Columns', type: 'title' },
        { name: 'Fit width', key: 'fitColumns', type: 'boolean' },
        { name: 'lap', key: 'col_lap', type: 'boolean' },
        { name: 'time', key: 'col_time', type: 'boolean' },
        { name: 'distance', key: 'col_distance', type: 'boolean' },
        { name: 'pace', key: 'col_pace', type: 'boolean' },
        { name: 'cad', key: 'col_cad', type: 'boolean' },
        { name: 'heart', key: 'col_heart', type: 'boolean' },
        { name: 'Filter (0 = off)', type: 'title' },
        { name: 'Dist ≥ km', key: 'minDistance', type: 'number', min: 0, max: 100, step: 0.1 },
        { name: 'Pace ≤ min/km', key: 'maxPace', type: 'number', min: 0, max: 30, step: 0.1 },
        { name: 'Cad ≥ spm', key: 'minCadence', type: 'number', min: 0, max: 300, step: 1 },
        { name: 'HR ≥ bpm', key: 'minHeart', type: 'number', min: 0, max: 240, step: 1 }
    ],
    build(config, data) {
        const lapUser = data?.data?.lap_user;
        let columns = {};
        if (Array.isArray(lapUser) && lapUser.length > 0) {
            try {
                columns = formatLapColumns(filterLapUser(lapUser, config));
            } catch (e) {
                console.warn('[lapPanels] formatLapColumns failed:', e);
            }
        }

        // 只渲染勾选的列；列宽/列位交给 layoutLapColumns
        const shown = LAP_COLUMNS.filter(c => config['col_' + c.key] !== false);
        const W = config.width || LAP_DESIGN.w;
        const pad = LAP_DESIGN.pad;
        const fs = config.fontSize || LAP_DESIGN.fontSize;
        const hfs = Number(config.headerFontSize) > 0 ? Number(config.headerFontSize) : Math.round(fs * 0.8);
        const rowH = lapRowH(fs);
        const showHeader = config.showHeader !== false;
        const bodyY = showHeader ? rowH : 0;
        const rowCount = shown.reduce((n, c) => Math.max(n, (columns[c.key] || []).length), 0);
        const textFill = config.textColor || '#FFFFFF';
        const headFill = config.headerColor || '#FFD166';
        const markFill = config.markerColor || '#FF3B30';
        const markAlpha = Math.max(0, Math.min(1, Number(config.markerOpacity == null ? 28 : config.markerOpacity) / 100));
        const layout = layoutLapColumns(config, W, fs);
        // 色条/斑马纹/分隔线的宽度 = 可见列排完的实际内容宽（固定列宽模式下精简列会缩短，fit 模式仍铺满）
        const contentW = layout.length ? Math.min(W, layout[layout.length - 1].x + layout[layout.length - 1].w + pad) : W;

        const rect = (o) => Object.assign({ tag: 'Rect' }, o);
        const text = (o) => Object.assign({
            tag: 'Text',
            resizeFontSize: true,
            fontSize: fs,
            fontWeight: 'black',
            verticalAlign: 'top',
            shadow: textshadow
        }, o);

        const children = [];

        // 1) 斑马纹：奇数行铺极淡底色，长表格便于横向跟踪（Rect 定位，宽度跟可见列）
        if (config.zebra) {
            for (let i = 1; i < rowCount; i += 2) {
                children.push(rect({
                    name: 'lap_zebra', x: pad, y: bodyY + i * rowH,
                    width: contentW - pad, height: rowH, fill: textFill, opacity: 0.07
                }));
            }
        }

        // 2) 当前圈高亮条 + 左侧强调条：先放在可视区外，由 update() 逐帧定位
        children.push(rect({
            name: 'lap_marker', x: 0, y: -rowH * 2, width: contentW, height: rowH,
            fill: markFill, opacity: markAlpha, cornerRadius: 3
        }));
        children.push(rect({
            name: 'lap_accent', x: 0, y: -rowH * 2, width: 4, height: rowH, fill: markFill
        }));

        // 3) 表头分隔线
        if (showHeader) {
            children.push(rect({
                name: 'lap_divider', x: pad, y: rowH - 1.5, width: contentW - pad, height: 1.5,
                fill: headFill, opacity: 0.7
            }));
        }

        // 4) 表头与数据分两个 Text：表头可独立配色/独立隐藏，数据整列一个多行 Text；
        //    两者 x 相同（统一左对齐到列起点），整列上下成线。
        //    注意：不给 Text 设 width —— leafer 一旦给定 width 就会按宽自动折行，
        //    折行后行数变化会让高亮条与文字错行
        layout.forEach(c => {
            if (showHeader) {
                children.push(text({
                    name: 'lap_head_' + c.key, x: c.x, y: 0, fontSize: hfs,
                    text: c.title, fill: headFill
                }));
            }
            children.push(text({
                name: 'lap_col_' + c.key, x: c.x, y: bodyY,
                text: (columns[c.key] || []).join('\n'), fill: textFill
            }));
        });

        return children;
    },
    update(box, frameData) {
        if (!box.children || !box.children.length) return;
        const byName = (n) => box.children.find(c => c && c.name === n);
        const marker = byName('lap_marker');
        if (!marker) return;
        const accent = byName('lap_accent');
        const cfg = box.__leaferConfig || {};

        // 行高按「当前字号」推算：容器被拖大时 resizeFontSize 已缩放字号，行高随之跟随。
        // 只能从数据列取样本：表头有独立字号（比数据小），误拿表头会把行高/高亮条算矮
        const defFS = cfg.fontSize || LAP_DESIGN.fontSize;
        const sizes = box.children
            .filter(c => c && c.name && String(c.name).indexOf('lap_col_') === 0 && Number(c.fontSize) > 0)
            .map(c => Number(c.fontSize));
        const fs = sizes.length ? Math.min.apply(null, sizes) : defFS;
        const rowH = lapRowH(fs);
        const bodyY = cfg.showHeader === false ? 0 : rowH;
        const W = box.width || LAP_DESIGN.w;
        const pad = LAP_DESIGN.pad;

        // 列位：按当前宽度重算（Text 无 width 则不会折行）；表头与数据都左对齐到列起点
        const layout = layoutLapColumns(cfg, W, fs);
        layout.forEach(c => {
            const head = byName('lap_head_' + c.key);
            if (head) head.x = c.x;
            const col = byName('lap_col_' + c.key);
            if (col) col.x = c.x;
        });
        // 高亮条宽度跟着可见列走：固定列宽模式下精简列后不再整行铺满
        const contentW = layout.length ? Math.min(W, layout[layout.length - 1].x + layout[layout.length - 1].w + pad) : W;

        // 当前圈定位：在「过滤后」的列表里找，行号才和表格一致；被过滤掉的圈不高亮
        const lapUser = filterLapUser(store.get('processedData')?.data?.lap_user, cfg);
        const currentTimestamp = frameData.timestamp;
        let lapIndex = -1;

        for (let i = 0; i < lapUser.length; i++) {
            const lapStart = toEpochSec(lapUser[i].start_time ?? lapUser[i].timestamp);
            const nextStart = i < lapUser.length - 1
                ? toEpochSec(lapUser[i + 1].start_time ?? lapUser[i + 1].timestamp)
                : Infinity;
            if (currentTimestamp >= lapStart && currentTimestamp < nextStart) {
                lapIndex = i;
                break;
            }
        }

        const on = lapIndex >= 0;
        marker.visible = on;
        if (accent) accent.visible = on;
        if (!on) return;

        const y = bodyY + lapIndex * rowH;
        marker.x = 0;
        marker.y = y;
        marker.width = contentW;
        marker.height = rowH;
        if (accent) {
            accent.x = 0;
            accent.y = y;
            accent.width = 4 * (W / LAP_DESIGN.w);
            accent.height = rowH;
        }
    }
};

export const lapPanels = [
    appv_lap_pan,
    appv_lap_user_pan
];

export default lapPanels;
