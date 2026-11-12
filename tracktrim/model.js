/* TrackTrim 轨迹模型：体检 → 修复 → 选区（头尾裁剪 + 中间删除）→ 统计。
   纯函数为主，UI 与导出共用同一套结果，保证「看到的统计 = 导出的内容」。 */
window.TT = window.TT || {};

TT.model = (function () {
    const U = TT.util;

    const validCoord = p => p.lat != null && p.lon != null &&
        Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180 && !(p.lat === 0 && p.lon === 0);

    function medianInterval(points) {
        const ds = [];
        for (let i = 1; i < points.length; i++) {
            if (points[i].t != null && points[i - 1].t != null) {
                const d = (points[i].t - points[i - 1].t) / 1000;
                if (d > 0 && d < 3600) ds.push(d);
            }
        }
        if (!ds.length) return 1;
        ds.sort((a, b) => a - b);
        return ds[ds.length >> 1];
    }

    function detectIssues(raw) {
        const pts = raw.points;
        let anyTime = false, allTime = true, anyCoord = false, badCoord = 0;
        let ele = false, hr = false, cad = false, power = false, temp = false, speed = false, dist = false;
        for (const p of pts) {
            if (p.t != null) anyTime = true; else allTime = false;
            if (validCoord(p)) anyCoord = true;
            else if (p.lat != null || p.lon != null || anyCoord) badCoord++;
            if (p.ele != null) ele = true;
            if (p.hr != null) hr = true;
            if (p.cad != null) cad = true;
            if (p.power != null) power = true;
            if (p.temp != null) temp = true;
            if (p.speed != null) speed = true;
            if (p.dist != null) dist = true;
        }
        // 重新精确统计无效坐标（有坐标的轨迹里，缺失/越界/ Null Island 的点）
        badCoord = 0;
        if (anyCoord) for (const p of pts) if (!validCoord(p)) badCoord++;
        let dup = 0, unordered = 0, prev = null;
        const seen = new Set();
        for (const p of pts) {
            if (p.t == null) continue;
            if (seen.has(p.t)) dup++; else seen.add(p.t);
            if (prev != null && p.t < prev) unordered++;
            prev = p.t;
        }
        return {
            n: pts.length, anyTime, allTime, noTime: !anyTime,
            anyCoord, noCoord: !anyCoord, badCoord,
            ele, hr, cad, power, temp, speed, dist,
            dup, unordered, interval: medianInterval(pts),
            created: raw.meta && raw.meta.created != null ? raw.meta.created : null
        };
    }

    function defaultSettings(raw, issues) {
        return {
            synthTime: issues.noTime || !issues.allTime,
            startTime: issues.created != null ? issues.created : Date.now() - issues.n * 1000,
            interval: issues.interval >= 0.5 ? Math.round(issues.interval) : 1,
            fixTime: true,
            dropBadCoord: true,
            eleMode: 'keep',
            eleFixed: 0,
            timeMode: 'keep',
            sport: raw.sport || 'generic'
        };
    }

    function deriveSpeeds(points) {
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (p.speed != null && !p._spd) continue;
            if (i === 0 || p.dist == null || points[i - 1].dist == null || p.t == null || points[i - 1].t == null) {
                if (p._spd) p.speed = null;
                continue;
            }
            const dt = (p.t - points[i - 1].t) / 1000;
            const dd = p.dist - points[i - 1].dist;
            p.speed = dt > 0 && dd >= 0 ? dd / dt : null;
            p._spd = true;
        }
    }

    function cumDist(points) {
        let d = 0;
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i > 0 && validCoord(p) && validCoord(points[i - 1])) {
                d += U.hav(points[i - 1].lat, points[i - 1].lon, p.lat, p.lon);
            }
            p.dist = d;
        }
    }

    // 修复：返回 { points, report, indoor }
    function repair(raw, s) {
        const issues = detectIssues(raw);
        const report = [];
        let pts = raw.points.map(p => Object.assign({}, p));
        const indoor = issues.noCoord;

        if (!indoor && s.dropBadCoord && issues.badCoord > 0) {
            pts = pts.filter(validCoord);
            report.push('剔除 ' + issues.badCoord + ' 个无效/缺失坐标点');
        }

        if (issues.noTime) {
            if (s.synthTime) {
                const iv = Math.max(0.1, s.interval) * 1000;
                pts.forEach((p, i) => { p.t = Math.round(s.startTime + i * iv); });
                report.push('按起始时间 + ' + s.interval + 's 间隔补全 ' + pts.length + ' 个时间戳');
            }
        } else if (!issues.allTime && s.synthTime) {
            const iv = medianInterval(pts) * 1000;
            let filled = 0;
            for (let i = 0; i < pts.length; i++) {
                if (pts[i].t != null) continue;
                let a = i - 1, b = i + 1;
                while (a >= 0 && pts[a].t == null) a--;
                while (b < pts.length && pts[b].t == null) b++;
                if (a >= 0 && b < pts.length) {
                    pts[i].t = Math.round(pts[a].t + (pts[b].t - pts[a].t) * (i - a) / (b - a));
                } else if (a >= 0) pts[i].t = Math.round(pts[a].t + (i - a) * iv);
                else if (b < pts.length) pts[i].t = Math.round(pts[b].t - (b - i) * iv);
                else pts[i].t = Math.round(s.startTime + i * iv);
                filled++;
            }
            if (filled) report.push('插值补全 ' + filled + ' 个缺失时间戳');
        }

        const timed = pts.length && pts[0].t != null;
        if (timed && s.fixTime) {
            if (issues.unordered > 0) {
                pts.sort((a, b) => a.t - b.t);
                report.push('按时间重新排序（原文件有乱序）');
            }
            if (issues.dup > 0) {
                const out = [];
                let last = null;
                for (const p of pts) {
                    if (p.t === last) continue;
                    out.push(p); last = p.t;
                }
                report.push('去除 ' + (pts.length - out.length) + ' 个重复时间戳点');
                pts = out;
            }
        }

        if (!indoor) {
            cumDist(pts);
        } else if (issues.dist) {
            const base = pts.find(p => p.dist != null);
            const d0 = base ? base.dist : 0;
            pts.forEach(p => { if (p.dist != null) p.dist = Math.max(0, p.dist - d0); });
        } else {
            pts.forEach(p => { p.dist = null; });
        }

        if (s.eleMode === 'none') pts.forEach(p => { p.ele = null; });
        else if (s.eleMode === 'fixed') pts.forEach(p => { if (p.ele == null) p.ele = s.eleFixed; });

        deriveSpeeds(pts);
        return { points: pts, report, indoor, issues };
    }

    function normalizeCuts(cuts, start, end) {
        const cs = cuts
            .map(c => ({ s: Math.max(start, Math.min(c.s, c.e)), e: Math.min(end, Math.max(c.s, c.e)) }))
            .filter(c => c.s <= c.e)
            .sort((a, b) => a.s - b.s);
        const merged = [];
        for (const c of cs) {
            const last = merged[merged.length - 1];
            if (last && c.s <= last.e + 1) last.e = Math.max(last.e, c.e);
            else merged.push({ s: c.s, e: c.e });
        }
        return merged;
    }

    // 选区应用：头尾保留 [start,end]，cuts 为中间删除段。timeMode close=时间轴前移补齐
    function applySelection(points, sel, timeMode) {
        const start = U.clamp(sel.start, 0, points.length - 1);
        const end = U.clamp(sel.end, start, points.length - 1);
        const cuts = normalizeCuts(sel.cuts || [], start, end);
        const iv = medianInterval(points) * 1000;

        const segments = [];
        let cur = [];
        let shift = 0;
        let cutIdx = 0;
        for (let i = start; i <= end; i++) {
            if (cutIdx < cuts.length && i > cuts[cutIdx].e) cutIdx++;
            const c = cuts[cutIdx];
            if (c && i >= c.s && i <= c.e) {
                if (cur.length) { segments.push(cur); cur = []; }
                if (timeMode === 'close' && i === c.s) {
                    const tA = c.s > 0 ? points[c.s - 1].t : points[c.s].t - iv;
                    const tB = c.e < points.length - 1 ? points[c.e + 1].t : points[c.e].t + iv;
                    if (tA != null && tB != null) shift += Math.max(0, (tB - tA) - iv);
                }
                continue;
            }
            const p = Object.assign({}, points[i]);
            if (shift && p.t != null) p.t = Math.round(p.t - shift);
            if (p._spd) { p.speed = null; }
            cur.push(p);
        }
        if (cur.length) segments.push(cur);

        // 距离按段累计：删除段两侧的空间跳变不计入里程；无坐标轨迹保留源距离并归零起点
        const hasCoords = points.some(validCoord);
        const flat = [];
        if (hasCoords) {
            let d = 0;
            for (const seg of segments) {
                let prev = null;
                for (const p of seg) {
                    if (prev && validCoord(p) && validCoord(prev)) d += U.hav(prev.lat, prev.lon, p.lat, p.lon);
                    p.dist = d;
                    prev = p;
                    flat.push(p);
                }
            }
        } else {
            for (const seg of segments) for (const p of seg) flat.push(p);
            const d0 = flat.length && flat[0].dist != null ? flat[0].dist : 0;
            for (const p of flat) if (p.dist != null) p.dist = Math.max(0, p.dist - d0);
        }
        // 段内重新推算速度（源速度保留）
        for (const seg of segments) {
            for (let i = 0; i < seg.length; i++) {
                const p = seg[i];
                if (p.speed != null) continue;
                if (i === 0 || p.dist == null || seg[i - 1].dist == null || p.t == null || seg[i - 1].t == null) continue;
                const dt = (p.t - seg[i - 1].t) / 1000, dd = p.dist - seg[i - 1].dist;
                if (dt > 0 && dd >= 0) { p.speed = dd / dt; p._spd = true; }
            }
        }
        // 前移补齐：时间轴已连续，合并为单段（无暂停事件、移动时长=总时长）；距离仍按段跳过空间跳变
        let outSegments = segments;
        if (timeMode === 'close' && segments.length > 1) {
            outSegments = [flat];
            for (let i = 1; i < flat.length; i++) {
                const p = flat[i], prev = flat[i - 1];
                if (p.speed != null || p.dist == null || prev.dist == null || p.t == null || prev.t == null) continue;
                const dt = (p.t - prev.t) / 1000, dd = p.dist - prev.dist;
                if (dt > 0 && dd >= 0) { p.speed = dd / dt; p._spd = true; }
            }
        }
        return { points: flat, segments: outSegments, cuts };
    }

    function stats(points, segments) {
        const n = points.length;
        if (!n) return { n: 0, dist: null, elapsed: null, moving: null, gain: null, loss: null, avgSpeed: null, maxSpeed: null, avgHr: null, maxHr: null, avgCad: null, maxCad: null, avgPower: null, maxPower: null, eleMin: null, eleMax: null, start: null, end: null };
        segments = segments && segments.length ? segments : [points];
        const first = points[0], last = points[n - 1];
        const timed = first.t != null && last.t != null;
        let moving = 0;
        if (timed) for (const seg of segments) {
            if (seg.length && seg[0].t != null && seg[seg.length - 1].t != null) {
                moving += (seg[seg.length - 1].t - seg[0].t) / 1000;
            }
        }
        let gain = 0, loss = 0, eleMin = null, eleMax = null, hasEle = false;
        let maxSpeed = null, hrSum = 0, hrN = 0, maxHr = null, cadSum = 0, cadN = 0, maxCad = null, pwSum = 0, pwN = 0, maxPower = null;
        for (let i = 0; i < n; i++) {
            const p = points[i];
            if (p.ele != null) {
                hasEle = true;
                eleMin = eleMin == null ? p.ele : Math.min(eleMin, p.ele);
                eleMax = eleMax == null ? p.ele : Math.max(eleMax, p.ele);
                if (i > 0 && points[i - 1].ele != null) {
                    const d = p.ele - points[i - 1].ele;
                    if (d > 0.2) gain += d; else if (d < -0.2) loss -= d;
                }
            }
            if (p.speed != null) maxSpeed = maxSpeed == null ? p.speed : Math.max(maxSpeed, p.speed);
            if (p.hr != null) { hrSum += p.hr; hrN++; maxHr = maxHr == null ? p.hr : Math.max(maxHr, p.hr); }
            if (p.cad != null) { cadSum += p.cad; cadN++; maxCad = maxCad == null ? p.cad : Math.max(maxCad, p.cad); }
            if (p.power != null) { pwSum += p.power; pwN++; maxPower = maxPower == null ? p.power : Math.max(maxPower, p.power); }
        }
        const dist = last.dist != null ? last.dist : null;
        return {
            n, dist,
            elapsed: timed ? (last.t - first.t) / 1000 : null,
            moving: timed ? moving : null,
            gain: hasEle ? gain : null, loss: hasEle ? loss : null,
            avgSpeed: dist != null && moving > 0 ? dist / moving : null,
            maxSpeed,
            avgHr: hrN ? hrSum / hrN : null, maxHr,
            avgCad: cadN ? cadSum / cadN : null, maxCad,
            avgPower: pwN ? pwSum / pwN : null, maxPower,
            eleMin, eleMax,
            start: first.t, end: last.t
        };
    }

    return { validCoord, medianInterval, detectIssues, defaultSettings, repair, applySelection, normalizeCuts, stats };
})();