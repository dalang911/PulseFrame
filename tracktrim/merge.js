/* TrackTrim 多轨迹合并：把 N 条已解析轨迹按序拼接成一条普通轨迹，
   之后走与单文件完全相同的 体检→修复→裁剪→导出 管线（不改现有业务逻辑）。
   两种时间轴：
     keep  保留原始时间——轨迹间空档视为暂停；时间重叠时自动最小平移并报告；
           每条后续轨迹的首点打 _join 标记（model 据此跳过段间空间跳变、并另起一段）。
     shift 首尾相接——后一条整体平移到前一条结束之后，时间连续、视为一条连续记录（不打 _join）。
   合并层只负责拼接与时间轴，距离/速度/统计仍由 model 统一计算。 */
window.TT = window.TT || {};

TT.merge = (function () {
    const U = TT.util, M = TT.model;

    function range(points) {
        let t0 = null, t1 = null;
        for (const p of points) {
            if (p.t == null) continue;
            if (t0 == null || p.t < t0) t0 = p.t;
            if (t1 == null || p.t > t1) t1 = p.t;
        }
        return { t0, t1 };
    }

    // tracks: 已解析轨迹数组（按期望顺序）；opts: { mode:'keep'|'shift', sport, name }
    function join(tracks, opts) {
        opts = opts || {};
        const list = (tracks || []).filter(t => t && t.points && t.points.length);
        if (list.length < 2) throw new Error('至少需要两条轨迹才能合并');
        const report = [];
        const info = list.map(t => {
            const r = range(t.points);
            return { t0: r.t0, t1: r.t1, iv: M.medianInterval(t.points) || 1 };
        });

        // 任一轨迹缺时间戳则无法「保留原始时间」，统一按首尾相接拼接
        let mode = opts.mode === 'shift' ? 'shift' : 'keep';
        if (info.some(i => i.t0 == null)) {
            if (mode === 'keep') report.push('有轨迹缺少时间戳，已改用「首尾相接」拼接');
            mode = 'shift';
        }

        const out = [];
        let prevEnd = null, prevIv = 1;

        list.forEach((t, k) => {
            const pts = t.points.map(p => Object.assign({}, p));
            const i = info[k];
            const gap = Math.round((prevIv || 1) * 1000);
            const label = t.name || ('轨迹 ' + (k + 1));

            if (mode === 'shift') {
                if (k === 0) {
                    if (i.t0 == null) {
                        // 首条无时间：按 起始 + 间隔 补全，保证整条合并结果有时间
                        const base = (t.meta && t.meta.created != null) ? t.meta.created : Date.now() - pts.length * gap;
                        pts.forEach((p, j) => { p.t = Math.round(base + j * gap); });
                    }
                } else if (i.t0 != null && prevEnd != null) {
                    const shift = (prevEnd + gap) - i.t0;
                    pts.forEach(p => { if (p.t != null) p.t = Math.round(p.t + shift); });
                } else {
                    pts.forEach((p, j) => { p.t = Math.round((prevEnd || Date.now()) + gap * (j + 1)); });
                }
                const lastT = pts[pts.length - 1].t;
                prevEnd = lastT != null ? lastT : prevEnd;
                prevIv = i.iv || prevIv;
                if (k > 0) pts[0]._join = true; // 跳过段间空间跳变；时间已连续，不打 _pause（视为单段）
                out.push(...pts);
                return;
            }

            // keep：保留原始时间
            if (k === 0) {
                prevEnd = i.t1; prevIv = i.iv || prevIv;
                out.push(...pts);
                return;
            }
            let shift = 0;
            if (i.t0 != null && prevEnd != null && i.t0 <= prevEnd) {
                shift = (prevEnd + gap) - i.t0;
                report.push('「' + label + '」与上一条时间重叠，自动后移 ' + Math.round(shift / 1000) + ' 秒');
            }
            pts.forEach((p, j) => {
                if (p.t != null) p.t = Math.round(p.t + shift);
                if (j === 0) { p._join = true; p._pause = true; } // 跳变不计里程 + 空档计为暂停（另起一段）
            });
            prevEnd = i.t1 != null ? i.t1 + shift : prevEnd;
            prevIv = i.iv || prevIv;
            out.push(...pts);
        });

        const sport = opts.sport || list[0].sport || 'generic';
        const name = (opts.name && opts.name.trim()) || ('合并 · ' + list.length + ' 条轨迹');
        if (mode === 'keep') report.push('保留原始时间：轨迹之间的空档将计为暂停');
        else report.push('首尾相接：' + list.length + ' 条轨迹时间轴已连续拼接');
        return {
            name, format: 'MERGED', sport, points: out,
            meta: { merged: true, mode, sources: list.map(t => t.name || ''), created: info[0].t0 },
            report
        };
    }

    return { join };
})();