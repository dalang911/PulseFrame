/* TrackTrim 应用装配：把解析/模型/图表/导出接到 DOM。 */
window.TT = window.TT || {};

TT.app = (function () {
    const U = TT.util, M = TT.model;
    const $ = id => document.getElementById(id);

    const state = {
        raw: null, issues: null, settings: null, repaired: null, result: null,
        sel: { start: 0, end: 0, cuts: [] },
        mode: 'trim', xMode: 'time', series: { ele: true, speed: false, hr: false },
        inspect: -1, baseName: 'track'
    };
    let profile, map, toastTimer;

    /* ---------- 通用 ---------- */
    function toast(msg, err) {
        const t = $('toast');
        t.textContent = msg;
        t.className = 'toast show' + (err ? ' err' : '');
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.className = 'toast'; setTimeout(() => { t.hidden = true; }, 300); }, 2800);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem('tt-theme', theme); } catch (e) {}
        if (profile) profile.draw();
        if (map) map.draw();
    }

    function segBind(id, onPick) {
        const seg = $(id);
        seg.addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
            onPick(btn.dataset.v);
        });
    }

    /* ---------- 文件加载 ---------- */
    function setupRaw(raw, displayName) {
        state.raw = raw;
        state.baseName = raw.name || displayName.replace(/\.[^.]+$/, '');
        state.issues = M.detectIssues(raw);
        state.settings = M.defaultSettings(raw, state.issues);
        state.sel = { start: 0, end: raw.points.length - 1, cuts: [] };
        state.inspect = -1;
        $('fileName').textContent = displayName;
        $('fileName').title = displayName;
        $('fileFormat').textContent = raw.format;
        $('exportName').value = state.baseName;
        $('sportSelect').value = state.settings.sport;
        segSet('timeModeSeg', state.settings.timeMode);
        renderFileMeta();
        renderRepairControls();
        $('dropzone').hidden = true;
        $('workspace').hidden = false;
        $('inspectBar').hidden = true;
        rebuild();
        map.resetView();
    }

    async function loadFile(file) {
        if (!file) return;
        toast('解析中…');
        try {
            const buf = await file.arrayBuffer();
            const raw = TT.parsers.parse(buf, file.name);
            setupRaw(raw, file.name);
            toast('已加载 ' + raw.points.length + ' 个轨迹点（' + raw.format + '）');
        } catch (e) {
            console.error(e);
            toast('加载失败：' + e.message, true);
        }
    }

    function loadDemo() {
        setupRaw(TT.demo.build(), '示例 · 晨跑河畔环线');
        toast('已载入示例轨迹：试试裁剪头尾，或删除中间的红灯暂停');
    }

    function segSet(id, v) {
        $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    }

    function renderFileMeta() {
        const iss = state.issues, raw = state.raw;
        const rows = [
            ['轨迹点', iss.n + ' 个'],
            ['采样间隔', iss.interval ? iss.interval.toFixed(1) + ' s' : '—'],
            ['运动类型', (U.SPORTS[raw.sport] || U.SPORTS.generic).label]
        ];
        if (iss.anyTime) {
            const ts = raw.points.filter(p => p.t != null).map(p => p.t);
            rows.push(['起始', U.fmtDate(Math.min(...ts)) + ' ' + U.fmtClock(Math.min(...ts))]);
        } else rows.push(['起始', '无时间戳']);
        if (raw.format === 'FIT' && raw.meta) {
            rows.push(['CRC 校验', raw.meta.crcOk ? '通过' : '未通过']);
            if (raw.meta.manufacturer != null) rows.push(['厂商编号', raw.meta.manufacturer]);
        }
        $('fileMeta').innerHTML = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + U.escapeXml(r[1]) + '</dd>').join('');
    }

    /* ---------- 修复面板 ---------- */
    function renderRepairControls() {
        const iss = state.issues, s = state.settings;
        const H = [];
        const needTime = iss.noTime || !iss.allTime;
        if (needTime) {
            H.push('<label class="check-row"><input type="checkbox" id="rSynth"' + (s.synthTime ? ' checked' : '') + '>补全时间戳</label>');
            H.push('<div id="synthFields"' + (s.synthTime ? '' : ' style="opacity:.45"') + '>');
            H.push('<div class="field"><span>起始时间（按本机时区）</span><input type="datetime-local" id="rStart" value="' + U.toLocalInput(s.startTime) + '"></div>');
            H.push('<div class="field"><span>采样间隔（秒）</span><input type="number" id="rInterval" min="0.1" step="0.1" value="' + s.interval + '"></div>');
            H.push('</div>');
            if (iss.noTime) H.push('<p class="repair-note">源文件没有时间戳。FIT 导出必须有时间，请按实际活动开始时间设置。</p>');
        }
        if (iss.badCoord > 0) {
            H.push('<label class="check-row"><input type="checkbox" id="rDrop"' + (s.dropBadCoord ? ' checked' : '') + '>剔除无效坐标点（' + iss.badCoord + ' 个）</label>');
        }
        if (iss.unordered > 0 || iss.dup > 0) {
            H.push('<label class="check-row"><input type="checkbox" id="rFix"' + (s.fixTime ? ' checked' : '') + '>修复乱序 / 重复时间</label>');
        }
        H.push('<div class="field"><span>海拔</span><select id="rEle">' +
            '<option value="keep">保留原值</option><option value="none">不导出海拔</option><option value="fixed">缺失填固定值</option>' +
            '</select></div>');
        H.push('<div class="field" id="eleFixedField" hidden><span>固定海拔（米）</span><input type="number" id="rEleFixed" step="1" value="' + s.eleFixed + '"></div>');
        if (iss.noCoord) H.push('<p class="repair-note">⚠ 完全无坐标（室内活动）：GPX 需要经纬度，只能导出 FIT。</p>');
        if (!needTime && iss.badCoord === 0 && iss.unordered === 0 && iss.dup === 0 && iss.ele) {
            H.push('<p class="repair-note">✓ 数据齐全，无需修复。仍可按需调整海拔导出方式。</p>');
        }
        $('repairControls').innerHTML = H.join('');
        $('rEle').value = s.eleMode;
        $('eleFixedField').hidden = s.eleMode !== 'fixed';

        if (needTime) {
            $('rSynth').addEventListener('change', e => {
                s.synthTime = e.target.checked;
                $('synthFields').style.opacity = s.synthTime ? '1' : '.45';
                rebuild();
            });
            $('rStart').addEventListener('change', e => {
                const v = U.fromLocalInput(e.target.value);
                if (v != null) { s.startTime = v; rebuild(); }
            });
            $('rInterval').addEventListener('change', e => {
                const v = Number(e.target.value);
                if (v > 0) { s.interval = v; rebuild(); }
            });
        }
        if ($('rDrop')) $('rDrop').addEventListener('change', e => { s.dropBadCoord = e.target.checked; rebuild(); });
        if ($('rFix')) $('rFix').addEventListener('change', e => { s.fixTime = e.target.checked; rebuild(); });
        $('rEle').addEventListener('change', e => {
            s.eleMode = e.target.value;
            $('eleFixedField').hidden = s.eleMode !== 'fixed';
            rebuild();
        });
        $('rEleFixed').addEventListener('change', e => { s.eleFixed = Number(e.target.value) || 0; rebuild(); });
    }

    /* ---------- 体检列表 ---------- */
    function renderIssues(report) {
        const iss = state.issues;
        const item = (level, text) => '<li><span class="ic ' + level + '">' + (level === 'ok' ? '✓' : level === 'warn' ? '!' : '✕') + '</span><span>' + text + '</span></li>';
        const H = [];
        H.push(iss.allTime ? item('ok', '时间戳齐全') : iss.anyTime ? item('warn', '部分时间戳缺失') : item('bad', '无时间戳'));
        if (iss.noCoord) H.push(item('bad', '无坐标数据（室内活动）'));
        else if (iss.badCoord > 0) H.push(item('warn', iss.badCoord + ' 个坐标无效或缺失'));
        else H.push(item('ok', '坐标齐全'));
        if (iss.noFix > 0) H.push(item('ok', '含 ' + iss.noFix + ' 个暂停/无定位点（设备正常记录，已保留）'));
        H.push(iss.ele ? item('ok', '含海拔') : item('warn', '无海拔'));
        H.push(iss.hr ? item('ok', '含心率') : item('warn', '无心率'));
        H.push(iss.cad ? item('ok', '含步频') : item('warn', '无步频'));
        H.push(iss.power ? item('ok', '含功率') : item('warn', '无功率'));
        H.push(item('ok', iss.dist && iss.speed ? '含距离/速度' : '距离/速度将自动推算'));
        if (iss.unordered > 0) H.push(item('warn', '时间乱序 ' + iss.unordered + ' 处'));
        if (iss.dup > 0) H.push(item('warn', '重复时间戳 ' + iss.dup + ' 个'));
        for (const r of report || []) H.push(item('ok', r));
        $('issueList').innerHTML = H.join('');
    }

    /* ---------- 重建 ---------- */
    function rebuild() {
        state.repaired = M.repair(state.raw, state.settings);
        const n = state.repaired.points.length;
        state.sel.start = U.clamp(state.sel.start, 0, Math.max(0, n - 1));
        state.sel.end = U.clamp(state.sel.end, state.sel.start, Math.max(0, n - 1));
        state.sel.cuts = M.normalizeCuts(state.sel.cuts, state.sel.start, state.sel.end);
        profile.setData(state.repaired.points);
        map.setData(state.repaired.points);
        profile.setSelection(state.sel);
        map.setSelection(state.sel);
        renderIssues(state.repaired.report);
        rebuildResult();
        updateRangeInputs();
        renderCutChips();
    }

    function rebuildResult() {
        state.result = M.applySelection(state.repaired.points, state.sel, state.settings.timeMode);
        const orig = M.stats(state.repaired.points);
        const kept = M.stats(state.result.points, state.result.segments);
        renderStats(orig, kept);
        const n = state.result.points.length;
        $('exportSummary').innerHTML = n
            ? '将导出 <b>' + n + '</b> 点 · <b>' + U.fmtDist(kept.dist) + '</b> · 移动时长 <b>' + U.fmtDuration(kept.moving) + '</b>' + (state.result.segments.length > 1 ? ' · ' + state.result.segments.length + ' 段' : '')
            : '选区为空';
        $('exportGpx').disabled = state.repaired.indoor || n === 0;
        $('exportGpx').title = state.repaired.indoor ? '无坐标数据，GPX 需要经纬度，请导出 FIT' : '导出为 GPX 1.1';
        const noTime = n > 0 && state.result.points[0].t == null;
        $('exportFit').disabled = n === 0 || noTime;
        $('exportFit').title = noTime ? 'FIT 需要时间戳，请在左侧「缺失修复」补全时间' : '导出为 FIT 活动文件';
    }

    function renderStats(o, k) {
        const rows = [
            ['轨迹点', o.n, k.n],
            ['距离', U.fmtDist(o.dist), U.fmtDist(k.dist)],
            ['移动时长', U.fmtDuration(o.moving), U.fmtDuration(k.moving)],
            ['总时长', U.fmtDuration(o.elapsed), U.fmtDuration(k.elapsed)],
            ['爬升 / 下降', (o.gain == null ? '—' : Math.round(o.gain) + ' / ' + Math.round(o.loss) + ' m'), (k.gain == null ? '—' : Math.round(k.gain) + ' / ' + Math.round(k.loss) + ' m')],
            ['平均速度', U.fmtSpeed(o.avgSpeed), U.fmtSpeed(k.avgSpeed)],
            ['最大速度', U.fmtSpeed(o.maxSpeed), U.fmtSpeed(k.maxSpeed)],
            ['平均心率', o.avgHr == null ? '—' : Math.round(o.avgHr) + ' bpm', k.avgHr == null ? '—' : Math.round(k.avgHr) + ' bpm'],
            ['最大心率', o.maxHr == null ? '—' : o.maxHr + ' bpm', k.maxHr == null ? '—' : k.maxHr + ' bpm'],
            ['海拔范围', o.eleMin == null ? '—' : Math.round(o.eleMin) + ' ~ ' + Math.round(o.eleMax) + ' m', k.eleMin == null ? '—' : Math.round(k.eleMin) + ' ~ ' + Math.round(k.eleMax) + ' m']
        ];
        $('statsTable').innerHTML =
            '<thead><tr><th>指标</th><th>原始</th><th class="kept">保留 / 导出</th></tr></thead><tbody>' +
            rows.map(r => '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td class="kept">' + r[2] + '</td></tr>').join('') +
            '</tbody>';
    }

    /* ---------- 选区 UI ---------- */
    function updateRangeInputs() {
        const xs = profile.xs, kind = profile.xKind;
        const fmt = v => kind === 'time' ? U.fmtHMS(v) : v.toFixed(2);
        $('startInput').value = fmt(xs[state.sel.start] || 0);
        $('endInput').value = fmt(xs[state.sel.end] || 0);
        $('startInput').placeholder = kind === 'time' ? '时:分:秒' : '公里';
        $('endInput').placeholder = $('startInput').placeholder;
    }

    function inputToIdx(str) {
        const xs = profile.xs;
        let v;
        if (profile.xKind === 'time') { v = U.parseHMS(str); if (v == null) return null; }
        else { v = Number(str); if (!isFinite(v)) return null; if (profile.xKind === 'dist') v *= 1; }
        return U.lowerBound(xs, v, x => x);
    }

    function renderCutChips() {
        const xs = profile.xs, kind = profile.xKind;
        const fmt = i => kind === 'time' ? U.fmtHMS(xs[i] || 0) : (xs[i] || 0).toFixed(2) + 'km';
        $('cutChips').innerHTML = state.sel.cuts.map((c, i) =>
            '<span class="cut-chip">删除 ' + fmt(c.s) + '–' + fmt(c.e) +
            '<button data-i="' + i + '" title="撤销此删除">×</button></span>').join('');
    }

    function selectionChanged(final) {
        state.sel.cuts = M.normalizeCuts(state.sel.cuts, state.sel.start, state.sel.end);
        profile.setSelection(state.sel);
        map.setSelection(state.sel);
        updateRangeInputs();
        renderCutChips();
        if (final) rebuildResult();
    }

    function setInspect(idx) {
        if (idx < 0 || idx >= state.repaired.points.length) return;
        state.inspect = idx;
        const p = state.repaired.points[idx];
        const parts = ['#' + (idx + 1)];
        if (p.t != null) parts.push(U.fmtClock(p.t));
        if (p.dist != null) parts.push(U.fmtDist(p.dist));
        if (p.ele != null) parts.push('海拔 ' + p.ele.toFixed(1) + 'm');
        if (p.hr != null) parts.push('心率 ' + Math.round(p.hr));
        $('inspectInfo').textContent = parts.join(' · ');
        $('inspectBar').hidden = false;
        map.setInspect(idx);
        profile.hover = idx;
        profile.draw();
    }

    /* ---------- 导出 ---------- */
    function safeName() {
        const n = ($('exportName').value.trim() || state.baseName || 'track').replace(/[\\/:*?"<>|]/g, '_');
        return n;
    }
    function exportGpx() {
        if ($('exportGpx').disabled) return;
        const r = state.result;
        const str = TT.gpx.write(r.points, r.segments, { name: $('exportName').value.trim() || state.baseName, sport: state.settings.sport });
        U.downloadBlob(new Blob([str], { type: 'application/gpx+xml' }), safeName() + '.gpx');
        toast('已导出 GPX：' + r.points.length + ' 点');
    }
    function exportFit() {
        if ($('exportFit').disabled) return;
        const r = state.result;
        try {
            const buf = TT.fit.write(r.points, r.segments, { sport: state.settings.sport, tzOffsetMin: -new Date().getTimezoneOffset() });
            U.downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), safeName() + '.fit');
            toast('已导出 FIT：' + r.points.length + ' 点');
        } catch (e) { toast('导出失败：' + e.message, true); }
    }

    /* ---------- 初始化 ---------- */
    function init() {
        let theme = 'light';
        try { theme = localStorage.getItem('tt-theme') || 'light'; } catch (e) {}
        applyTheme(theme);
        $('themeBtn').addEventListener('click', () =>
            applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));

        $('helpBtn').addEventListener('click', () => { $('helpModal').hidden = false; });
        $('helpClose').addEventListener('click', () => { $('helpModal').hidden = true; });
        $('helpModal').addEventListener('click', e => { if (e.target === $('helpModal')) $('helpModal').hidden = true; });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') $('helpModal').hidden = true; });

        const fi = $('fileInput');
        $('pickBtn').addEventListener('click', () => fi.click());
        $('demoBtn').addEventListener('click', loadDemo);
        $('changeFile').addEventListener('click', () => fi.click());
        fi.addEventListener('change', () => { if (fi.files[0]) loadFile(fi.files[0]); fi.value = ''; });

        const dz = $('dropzone');
        ['dragenter', 'dragover'].forEach(ev => document.body.addEventListener(ev, e => {
            e.preventDefault(); if (!dz.hidden) dz.classList.add('dragover');
        }));
        ['dragleave', 'drop'].forEach(ev => document.body.addEventListener(ev, e => {
            e.preventDefault(); dz.classList.remove('dragover');
        }));
        document.body.addEventListener('drop', e => {
            const f = e.dataTransfer && e.dataTransfer.files[0];
            if (f) loadFile(f);
        });

        profile = new TT.charts.Profile($('profileCanvas'), {
            onSelection: (sel, final) => { state.sel = sel; selectionChanged(final); },
            onInspect: idx => setInspect(idx),
            onAddCut: range => {
                state.sel.cuts.push(range);
                selectionChanged(true);
                toast('已标记删除片段，可在下方撤销');
            }
        });
        map = new TT.charts.TrackMap($('mapCanvas'), {
            onInspect: idx => setInspect(idx),
            onView: z => {
                $('mapZoom').textContent = Math.round(z * 100) + '%';
                $('mapZoomIn').disabled = z >= TT.charts.ZOOM_MAX - 1e-6;
                $('mapZoomOut').disabled = z <= TT.charts.ZOOM_MIN + 1e-6;
            }
        });
        $('mapZoomIn').addEventListener('click', () => map.zoomBy(1.4));
        $('mapZoomOut').addEventListener('click', () => map.zoomBy(1 / 1.4));
        $('mapFit').addEventListener('click', () => map.resetView());
        $('mapZoomSel').addEventListener('click', () => map.zoomToSelection());
        $('fitBrand').textContent = TT.fit.BRAND.name;

        segBind('modeSeg', v => { state.mode = v; profile.setMode(v); });
        segBind('xModeSeg', v => { state.xMode = v; profile.setXMode(v); updateRangeInputs(); renderCutChips(); });
        segBind('timeModeSeg', v => { state.settings && (state.settings.timeMode = v); if (state.raw) rebuildResult(); });

        const seriesBind = (id, key) => $(id).addEventListener('change', e => {
            state.series[key] = e.target.checked; profile.setSeries(state.series);
        });
        seriesBind('sEle', 'ele'); seriesBind('sSpeed', 'speed'); seriesBind('sHr', 'hr');

        $('startInput').addEventListener('change', e => {
            const idx = inputToIdx(e.target.value);
            if (idx != null) { state.sel.start = Math.min(idx, state.sel.end); selectionChanged(true); }
            else updateRangeInputs();
        });
        $('endInput').addEventListener('change', e => {
            const idx = inputToIdx(e.target.value);
            if (idx != null) { state.sel.end = Math.max(idx, state.sel.start); selectionChanged(true); }
            else updateRangeInputs();
        });
        $('resetSel').addEventListener('click', () => {
            state.sel = { start: 0, end: state.repaired.points.length - 1, cuts: [] };
            selectionChanged(true);
        });
        $('cutChips').addEventListener('click', e => {
            const btn = e.target.closest('button');
            if (!btn) return;
            state.sel.cuts.splice(+btn.dataset.i, 1);
            selectionChanged(true);
        });
        $('setStart').addEventListener('click', () => {
            if (state.inspect < 0) return;
            state.sel.start = Math.min(state.inspect, state.sel.end); selectionChanged(true);
        });
        $('setEnd').addEventListener('click', () => {
            if (state.inspect < 0) return;
            state.sel.end = Math.max(state.inspect, state.sel.start); selectionChanged(true);
        });

        $('sportSelect').addEventListener('change', e => { if (state.settings) state.settings.sport = e.target.value; });
        $('exportGpx').addEventListener('click', exportGpx);
        $('exportFit').addEventListener('click', exportFit);
    }

    document.addEventListener('DOMContentLoaded', init);
    return { loadFile, loadDemo, state, toast };
})();