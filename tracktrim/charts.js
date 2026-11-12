/* TrackTrim 交互图表：剖面图（选区拖拽/手柄/悬停）+ 轨迹形状图（点击定位）。
   纯 Canvas，DPR 自适应，ResizeObserver 重绘；拿不到像素的环境下仍可用几何断言验证。 */
window.TT = window.TT || {};

TT.charts = (function () {
    const U = TT.util;

    function theme() {
        const dark = document.documentElement.getAttribute('data-theme') === 'dark';
        return dark ? {
            paper: '#12262c', grid: '#24424a', ink: '#cfe3e6', faint: '#7fa3ab',
            ele: '#37b3a8', eleFill: 'rgba(55,179,168,0.22)', speed: '#f5a623', hr: '#ff6b6b',
            keep: '#37b3a8', dim: 'rgba(10,22,26,0.72)', cut: '#ff5d5d', cutFill: 'rgba(255,93,93,0.16)',
            handle: '#eafffb', track: '#3a5a62', hover: '#ffd166', accent: '#4cc9c0'
        } : {
            paper: '#ffffff', grid: '#e7e2d8', ink: '#243b42', faint: '#8a9aa0',
            ele: '#0e7c7b', eleFill: 'rgba(14,124,123,0.16)', speed: '#e08a00', hr: '#d94848',
            keep: '#0e7c7b', dim: 'rgba(246,244,239,0.74)', cut: '#d94848', cutFill: 'rgba(217,72,72,0.12)',
            handle: '#ffffff', track: '#c9c2b4', hover: '#b8860b', accent: '#0e7c7b'
        };
    }

    function setupCanvas(canvas) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const r = canvas.getBoundingClientRect();
        const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
        if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
            canvas.width = w * dpr; canvas.height = h * dpr;
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx, w, h };
    }

    function niceTicks(min, max, count) {
        if (!(isFinite(min) && isFinite(max)) || min === max) { min = min || 0; max = min + 1; }
        const span = max - min, raw = span / count;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const norm = raw / mag;
        const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
        const ticks = [];
        for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
        return ticks;
    }

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    /* ---------------- 剖面图 ---------------- */
    function Profile(canvas, cb) {
        this.cv = canvas; this.cb = cb || {};
        this.points = []; this.xs = []; this.xMode = 'time';
        this.series = { ele: true, speed: false, hr: false };
        this.sel = { start: 0, end: 0, cuts: [] };
        this.mode = 'trim'; this.hover = -1; this.drag = null;
        this.pad = { l: 46, r: 46, t: 14, b: 26 };
        this._bind();
        new ResizeObserver(() => this.draw()).observe(canvas);
    }

    Profile.prototype.setData = function (points) {
        this.points = points;
        this._calcX();
        this.draw();
    };
    Profile.prototype.setXMode = function (m) { this.xMode = m; this._calcX(); this.draw(); };
    Profile.prototype.setSeries = function (s) { this.series = s; this.draw(); };
    Profile.prototype.setSelection = function (sel) { this.sel = sel; this.draw(); };
    Profile.prototype.setMode = function (m) { this.mode = m; this.cv.style.cursor = m === 'cut' ? 'crosshair' : 'ew-resize'; this.draw(); };

    Profile.prototype._calcX = function () {
        const pts = this.points;
        const t0 = pts.length && pts[0].t != null ? pts[0].t : null;
        const hasT = t0 != null, hasD = pts.some(p => p.dist != null);
        this.xKind = this.xMode === 'time' && hasT ? 'time' : (hasD ? 'dist' : 'idx');
        this.xs = pts.map((p, i) =>
            this.xKind === 'time' ? (p.t - t0) / 1000 :
            this.xKind === 'dist' ? (p.dist || 0) / 1000 : i);
        this.xUnit = this.xKind === 'time' ? '时间' : this.xKind === 'dist' ? '距离 (km)' : '点序号';
    };

    Profile.prototype.xMax = function () { return this.xs.length ? this.xs[this.xs.length - 1] : 1; };
    Profile.prototype.px = function (x) {
        const { w } = this._dim(); const p = this.pad;
        return p.l + (x / (this.xMax() || 1)) * (w - p.l - p.r);
    };
    Profile.prototype.idxAt = function (px) {
        const { w } = this._dim(); const p = this.pad;
        const x = U.clamp((px - p.l) / (w - p.l - p.r), 0, 1) * this.xMax();
        return U.lowerBound(this.xs, x, v => v);
    };
    Profile.prototype._dim = function () {
        const r = this.cv.getBoundingClientRect();
        return { w: Math.max(10, r.width), h: Math.max(10, r.height) };
    };

    Profile.prototype._bind = function () {
        const cv = this.cv;
        const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
        cv.addEventListener('pointerdown', e => {
            if (!this.points.length) return;
            const { x } = pos(e);
            const idx = this.idxAt(x);
            const xs = this.px(this.xs[this.sel.start]), xe = this.px(this.xs[this.sel.end]);
            let kind = 'new';
            if (Math.abs(x - xs) < 9) kind = 'start';
            else if (Math.abs(x - xe) < 9) kind = 'end';
            this.drag = { kind, anchor: idx, moved: false };
            try { cv.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        });
        cv.addEventListener('pointermove', e => {
            if (!this.points.length) return;
            const { x, y } = pos(e);
            const idx = this.idxAt(x);
            if (this.drag) {
                this.drag.moved = this.drag.moved || Math.abs(idx - this.drag.anchor) > 0;
                const d = this.drag;
                if (d.kind === 'start') this.sel.start = Math.min(idx, this.sel.end);
                else if (d.kind === 'end') this.sel.end = Math.max(idx, this.sel.start);
                else if (d.kind === 'new' && d.moved) {
                    const a = Math.min(d.anchor, idx), b = Math.max(d.anchor, idx);
                    if (this.mode === 'trim') { this.sel.start = a; this.sel.end = b; }
                    else this._previewCut = { s: a, e: b };
                }
                this.draw();
                if (this.cb.onSelection) this.cb.onSelection(this.sel, false);
            } else {
                this.hover = idx; this._hoverY = y;
                this.draw();
                if (this.cb.onHover) this.cb.onHover(idx);
            }
        });
        const up = e => {
            if (!this.drag) return;
            const d = this.drag; this.drag = null;
            const { x } = pos(e);
            const idx = this.idxAt(x);
            if (d.kind === 'new' && !d.moved) {
                this.hover = idx;
                if (this.cb.onInspect) this.cb.onInspect(idx);
            } else if (d.kind === 'new' && this.mode === 'cut' && this._previewCut) {
                if (this.cb.onAddCut) this.cb.onAddCut(this._previewCut);
            }
            this._previewCut = null;
            this.draw();
            if (this.cb.onSelection) this.cb.onSelection(this.sel, true);
        };
        cv.addEventListener('pointerup', up);
        cv.addEventListener('pointercancel', () => { this.drag = null; this._previewCut = null; this.draw(); });
        cv.addEventListener('pointerleave', () => { if (!this.drag) { this.hover = -1; this.draw(); if (this.cb.onHover) this.cb.onHover(-1); } });
    };

    Profile.prototype.draw = function () {
        const { ctx, w, h } = setupCanvas(this.cv);
        const T = theme(), p = this.pad, pts = this.points;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = T.paper; ctx.fillRect(0, 0, w, h);
        if (!pts.length) {
            ctx.fillStyle = T.faint; ctx.font = '13px system-ui'; ctx.textAlign = 'center';
            ctx.fillText('加载文件后显示剖面', w / 2, h / 2); return;
        }
        const iw = w - p.l - p.r, ih = h - p.t - p.b;
        const xm = this.xMax() || 1;
        const X = i => p.l + (this.xs[i] / xm) * iw;

        // 海拔范围
        let eMin = Infinity, eMax = -Infinity, hasEle = false;
        let sMax = 0, hMin = Infinity, hMax = -Infinity, hasHr = false, hasSpd = false;
        for (const pt of pts) {
            if (pt.ele != null) { hasEle = true; eMin = Math.min(eMin, pt.ele); eMax = Math.max(eMax, pt.ele); }
            if (pt.speed != null) { hasSpd = true; sMax = Math.max(sMax, pt.speed); }
            if (pt.hr != null) { hasHr = true; hMin = Math.min(hMin, pt.hr); hMax = Math.max(hMax, pt.hr); }
        }
        if (hasEle) { const padE = Math.max(2, (eMax - eMin) * 0.12); eMin -= padE; eMax += padE; }
        else { eMin = 0; eMax = 1; }
        if (hasHr) { hMin = Math.max(0, hMin - 10); hMax += 10; } else { hMin = 0; hMax = 1; }
        sMax = sMax > 0 ? sMax * 1.1 : 1;
        const YE = v => p.t + (1 - (v - eMin) / (eMax - eMin)) * ih;
        const YH = v => p.t + (1 - (v - hMin) / (hMax - hMin)) * ih;
        const YS = v => p.t + (1 - v / sMax) * ih;

        // 网格 + 轴
        ctx.font = '10px system-ui'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = T.grid; ctx.fillStyle = T.faint; ctx.lineWidth = 1;
        const eTicks = niceTicks(eMin, eMax, 4);
        ctx.textAlign = 'right';
        for (const v of eTicks) {
            const y = YE(v);
            ctx.beginPath(); ctx.moveTo(p.l, y); ctx.lineTo(w - p.r, y); ctx.stroke();
            if (this.series.ele && hasEle) ctx.fillText(Math.round(v) + '', p.l - 6, y);
        }
        const xTicks = niceTicks(0, xm, Math.max(3, Math.floor(iw / 90)));
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (const v of xTicks) {
            const x = p.l + (v / xm) * iw;
            ctx.beginPath(); ctx.moveTo(x, p.t); ctx.lineTo(x, p.t + ih); ctx.stroke();
            ctx.fillText(this.xKind === 'time' ? U.fmtHMS(v) : v.toFixed(this.xKind === 'dist' ? 1 : 0), x, h - p.b + 6);
        }
        // 右轴（心率优先，其次速度）
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        if (this.series.hr && hasHr) {
            ctx.fillStyle = T.hr;
            for (const v of niceTicks(hMin, hMax, 4)) ctx.fillText(Math.round(v) + '', w - p.r + 6, YH(v));
        } else if (this.series.speed && hasSpd) {
            ctx.fillStyle = T.speed;
            for (const v of niceTicks(0, sMax, 4)) ctx.fillText((v * 3.6).toFixed(0) + '', w - p.r + 6, YS(v));
        }

        // 数据抽取：每像素列取 min/max
        const buckets = Math.max(1, Math.floor(iw));
        const drawLine = (getY, color, width, valOf) => {
            ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
            let started = false;
            for (let b = 0; b < buckets; b++) {
                const i0 = Math.floor(b / buckets * pts.length), i1 = Math.max(i0 + 1, Math.floor((b + 1) / buckets * pts.length));
                let v = null;
                for (let i = i0; i < i1 && i < pts.length; i++) { const q = valOf(pts[i]); if (q != null) { v = v == null ? q : (b % 2 ? Math.max(v, q) : Math.min(v, q)); } }
                if (v == null) { started = false; continue; }
                const x = p.l + (b + 0.5) / buckets * iw, y = getY(v);
                if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            }
            ctx.stroke();
        };

        // 海拔面积
        if (this.series.ele && hasEle) {
            ctx.beginPath();
            let started = false, firstX = 0, lastX = 0;
            for (let b = 0; b < buckets; b++) {
                const i0 = Math.floor(b / buckets * pts.length), i1 = Math.max(i0 + 1, Math.floor((b + 1) / buckets * pts.length));
                let v = null;
                for (let i = i0; i < i1 && i < pts.length; i++) if (pts[i].ele != null) v = v == null ? pts[i].ele : Math.max(v, pts[i].ele);
                if (v == null) continue;
                const x = p.l + (b + 0.5) / buckets * iw, y = YE(v);
                if (!started) { ctx.moveTo(x, y); firstX = x; started = true; } else ctx.lineTo(x, y);
                lastX = x;
            }
            if (started) {
                ctx.lineTo(lastX, p.t + ih); ctx.lineTo(firstX, p.t + ih); ctx.closePath();
                const g = ctx.createLinearGradient(0, p.t, 0, p.t + ih);
                g.addColorStop(0, T.eleFill); g.addColorStop(1, 'rgba(14,124,123,0.02)');
                ctx.fillStyle = g; ctx.fill();
                drawLine(YE, T.ele, 1.6, q => q.ele);
            }
        }
        if (this.series.speed && hasSpd) drawLine(YS, T.speed, 1.3, q => q.speed);
        if (this.series.hr && hasHr) drawLine(YH, T.hr, 1.3, q => q.hr);

        // 裁剪掉的头尾：遮罩变暗
        const xs = X(this.sel.start), xe = X(this.sel.end);
        ctx.fillStyle = T.dim;
        if (xs > p.l) ctx.fillRect(p.l, p.t, xs - p.l, ih);
        if (xe < w - p.r) ctx.fillRect(xe, p.t, (w - p.r) - xe, ih);

        // 删除片段：红色斜纹
        const hatch = (x0, x1) => {
            ctx.fillStyle = T.cutFill; ctx.fillRect(x0, p.t, x1 - x0, ih);
            ctx.save(); ctx.beginPath(); ctx.rect(x0, p.t, x1 - x0, ih); ctx.clip();
            ctx.strokeStyle = T.cut; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
            for (let x = x0 - ih; x < x1; x += 7) { ctx.beginPath(); ctx.moveTo(x, p.t + ih); ctx.lineTo(x + ih, p.t); ctx.stroke(); }
            ctx.restore();
            ctx.strokeStyle = T.cut; ctx.lineWidth = 1;
            ctx.strokeRect(x0 + 0.5, p.t + 0.5, x1 - x0 - 1, ih - 1);
        };
        for (const c of this.sel.cuts) hatch(X(c.s), X(c.e));
        if (this._previewCut) hatch(X(this._previewCut.s), X(this._previewCut.e));

        // 保留边界手柄
        const handle = (x, label) => {
            ctx.strokeStyle = T.keep; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x, p.t); ctx.lineTo(x, p.t + ih); ctx.stroke();
            ctx.fillStyle = T.keep;
            roundRect(ctx, x - 5, p.t + ih / 2 - 13, 10, 26, 4); ctx.fill();
            ctx.fillStyle = T.handle;
            ctx.fillRect(x - 1.5, p.t + ih / 2 - 7, 1.2, 14);
            ctx.fillRect(x + 1, p.t + ih / 2 - 7, 1.2, 14);
            ctx.fillStyle = T.keep; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(label, x, p.t - 1);
        };
        handle(xs, '起'); handle(xe, '止');

        // 悬停十字线 + 提示
        if (this.hover >= 0 && this.hover < pts.length && !this.drag) {
            const pt = pts[this.hover], x = X(this.hover);
            ctx.strokeStyle = T.hover; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(x, p.t); ctx.lineTo(x, p.t + ih); ctx.stroke();
            ctx.setLineDash([]);
            if (this.series.ele && pt.ele != null) { ctx.fillStyle = T.ele; ctx.beginPath(); ctx.arc(x, YE(pt.ele), 3, 0, 7); ctx.fill(); }
            const lines = [
                this.xKind === 'time' ? U.fmtHMS(this.xs[this.hover]) : this.xs[this.hover].toFixed(2) + ' km',
                pt.ele != null ? '海拔 ' + pt.ele.toFixed(1) + ' m' : null,
                pt.speed != null ? '速度 ' + (pt.speed * 3.6).toFixed(1) + ' km/h' : null,
                pt.hr != null ? '心率 ' + Math.round(pt.hr) + ' bpm' : null
            ].filter(Boolean);
            ctx.font = '11px system-ui';
            const bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + 16;
            const bh = lines.length * 15 + 10;
            let bx = x + 10; if (bx + bw > w - p.r) bx = x - bw - 10;
            const by = U.clamp((this._hoverY || p.t + 20) - bh / 2, p.t, p.t + ih - bh);
            ctx.fillStyle = 'rgba(20,40,46,0.92)'; roundRect(ctx, bx, by, bw, bh, 5); ctx.fill();
            ctx.fillStyle = '#eafffb'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            lines.forEach((l, i) => ctx.fillText(l, bx + 8, by + 6 + i * 15));
        }
    };

    /* ---------------- 轨迹形状图 ---------------- */
    function TrackMap(canvas, cb) {
        this.cv = canvas; this.cb = cb || {};
        this.points = []; this.sel = { start: 0, end: 0, cuts: [] }; this.inspect = -1;
        new ResizeObserver(() => this.draw()).observe(canvas);
        canvas.addEventListener('click', e => {
            if (!this.pts || !this.pts.length) return;
            const r = canvas.getBoundingClientRect();
            const x = e.clientX - r.left, y = e.clientY - r.top;
            let best = -1, bd = 1e9;
            for (let i = 0; i < this.pts.length; i++) {
                const q = this.pts[i]; if (!q) continue;
                const d = (q.x - x) ** 2 + (q.y - y) ** 2;
                if (d < bd) { bd = d; best = i; }
            }
            if (best >= 0 && bd < 40 * 40 && this.cb.onInspect) this.cb.onInspect(best);
        });
    }
    TrackMap.prototype.setData = function (points) { this.points = points; this.draw(); };
    TrackMap.prototype.setSelection = function (sel) { this.sel = sel; this.draw(); };
    TrackMap.prototype.setInspect = function (i) { this.inspect = i; this.draw(); };

    TrackMap.prototype.draw = function () {
        const { ctx, w, h } = setupCanvas(this.cv);
        const T = theme();
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = T.paper; ctx.fillRect(0, 0, w, h);
        // 点状背景
        ctx.fillStyle = T.grid;
        for (let x = 12; x < w; x += 22) for (let y = 12; y < h; y += 22) { ctx.fillRect(x, y, 1, 1); }

        const valid = [];
        this.points.forEach((p, i) => { if (TT.model.validCoord(p)) valid.push(i); });
        this.pts = new Array(this.points.length).fill(null);
        if (!valid.length) {
            ctx.fillStyle = T.faint; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('无坐标数据（室内活动），仅可导出 FIT', w / 2, h / 2);
            return;
        }
        let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
        for (const i of valid) {
            const p = this.points[i];
            minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat);
            minLon = Math.min(minLon, p.lon); maxLon = Math.max(maxLon, p.lon);
        }
        const pad = 26;
        const cosLat = Math.cos((minLat + maxLat) / 2 * Math.PI / 180) || 1;
        const sx = (w - pad * 2) / Math.max(1e-9, (maxLon - minLon) * cosLat);
        const sy = (h - pad * 2) / Math.max(1e-9, (maxLat - minLat));
        const s = Math.min(sx, sy);
        const ox = (w - (maxLon - minLon) * cosLat * s) / 2;
        const oy = (h - (maxLat - minLat) * s) / 2;
        const PX = p => ox + (p.lon - minLon) * cosLat * s;
        const PY = p => h - oy - (p.lat - minLat) * s;
        for (const i of valid) this.pts[i] = { x: PX(this.points[i]), y: PY(this.points[i]) };

        const stride = Math.max(1, Math.floor(valid.length / 6000));
        const path = (idxs, color, width) => {
            ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.beginPath(); let started = false;
            for (const i of idxs) {
                const q = this.pts[i]; if (!q) { started = false; continue; }
                if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y);
            }
            ctx.stroke();
        };
        const sampled = valid.filter((_, k) => k % stride === 0);
        path(sampled, T.track, 2);

        const inCut = i => this.sel.cuts.some(c => i >= c.s && i <= c.e);
        const kept = sampled.filter(i => i >= this.sel.start && i <= this.sel.end && !inCut(i));
        path(kept, T.keep, 2.6);
        const cutIdx = sampled.filter(i => i >= this.sel.start && i <= this.sel.end && inCut(i));
        path(cutIdx, T.cut, 3);

        const mark = (i, color, label) => {
            const q = this.pts[i]; if (!q) return;
            ctx.fillStyle = color; ctx.beginPath(); ctx.arc(q.x, q.y, 5, 0, 7); ctx.fill();
            ctx.strokeStyle = T.paper; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = color; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(label, q.x, q.y - 8);
        };
        mark(this.sel.start, '#10b981', '起');
        mark(this.sel.end, T.cut, '止');
        if (this.inspect >= 0 && this.pts[this.inspect]) {
            const q = this.pts[this.inspect];
            ctx.strokeStyle = T.hover; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(q.x, q.y, 8, 0, 7); ctx.stroke();
            ctx.fillStyle = T.hover; ctx.beginPath(); ctx.arc(q.x, q.y, 3, 0, 7); ctx.fill();
        }
        // 比例尺
        const metersPerPx = 1 / s * 111320;
        let bar = 100; const target = metersPerPx * 80;
        const pow = Math.pow(10, Math.floor(Math.log10(target)));
        bar = (target / pow >= 5 ? 5 : target / pow >= 2 ? 2 : 1) * pow;
        const barPx = bar / metersPerPx;
        ctx.strokeStyle = T.faint; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(w - pad - barPx, h - 14); ctx.lineTo(w - pad, h - 14); ctx.stroke();
        ctx.fillStyle = T.faint; ctx.font = '10px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(bar >= 1000 ? (bar / 1000) + ' km' : bar + ' m', w - pad, h - 17);
    };

    return { Profile, TrackMap, theme };
})();