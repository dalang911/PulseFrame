/* TrackTrim 输入解析：GPX / TCX / KML / CSV → 统一轨迹模型。FIT 见 fitread.js。
   点结构：{ t(ms|null), lat, lon, ele, hr, cad, power, speed(m/s), dist(m), temp }，缺失一律 null。 */
window.TT = window.TT || {};

TT.parsers = (function () {
    const U = TT.util;

    function emptyPoint() {
        return { t: null, lat: null, lon: null, ele: null, hr: null, cad: null, power: null, speed: null, dist: null, temp: null };
    }

    const num = v => {
        if (v == null || v === '') return null;
        const n = Number(v);
        return isFinite(n) ? n : null;
    };
    const text = (parent, local) => {
        const el = parent.getElementsByTagNameNS('*', local)[0];
        return el ? el.textContent.trim() : null;
    };

    function parseTime(s) {
        if (s == null || s === '') return null;
        s = String(s).trim();
        if (/^\d+(\.\d+)?$/.test(s)) {
            const n = Number(s);
            if (n > 1e12) return Math.round(n);        // epoch 毫秒
            if (n > 1e9) return Math.round(n * 1000);  // epoch 秒
            return null;
        }
        const ms = Date.parse(s.replace(/\//g, '-').replace(' ', 'T'));
        return isFinite(ms) ? ms : null;
    }

    function xmlOf(str) {
        const doc = new DOMParser().parseFromString(str, 'text/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('XML 解析失败（文件可能损坏）');
        return doc;
    }

    function extPoint(pt, p) {
        for (const el of pt.getElementsByTagNameNS('*', '*')) {
            const v = num(el.textContent);
            if (v == null) continue;
            switch (el.localName) {
                case 'hr': if (p.hr == null) p.hr = v; break;
                case 'cad': if (p.cad == null) p.cad = v; break;
                case 'power': case 'watts': if (p.power == null) p.power = v; break;
                case 'atemp': case 'temp': if (p.temp == null) p.temp = v; break;
                case 'speed': if (p.speed == null) p.speed = v; break;
            }
        }
    }

    function gpx(str, name) {
        const doc = xmlOf(str);
        const pts = [];
        let trkpts = Array.from(doc.getElementsByTagNameNS('*', 'trkpt'));
        if (!trkpts.length) trkpts = Array.from(doc.getElementsByTagNameNS('*', 'rtept'));
        for (const el of trkpts) {
            const p = emptyPoint();
            p.lat = num(el.getAttribute('lat'));
            p.lon = num(el.getAttribute('lon'));
            p.ele = num(text(el, 'ele'));
            p.t = parseTime(text(el, 'time'));
            extPoint(el, p);
            pts.push(p);
        }
        const trackName = text(doc, 'name') || name;
        const sport = U.sportFromText(text(doc, 'type'));
        return { name: trackName, format: 'GPX', sport, points: pts, meta: {} };
    }

    function tcx(str, name) {
        const doc = xmlOf(str);
        const pts = [];
        const acts = Array.from(doc.getElementsByTagNameNS('*', 'Activity'));
        for (const tp of doc.getElementsByTagNameNS('*', 'Trackpoint')) {
            const p = emptyPoint();
            p.t = parseTime(text(tp, 'Time'));
            const pos = tp.getElementsByTagNameNS('*', 'Position')[0];
            if (pos) {
                p.lat = num(text(pos, 'LatitudeDegrees'));
                p.lon = num(text(pos, 'LongitudeDegrees'));
            }
            p.ele = num(text(tp, 'AltitudeMeters'));
            p.dist = num(text(tp, 'DistanceMeters'));
            const hr = tp.getElementsByTagNameNS('*', 'HeartRateBpm')[0];
            if (hr) p.hr = num(text(hr, 'Value'));
            p.cad = num(text(tp, 'Cadence'));
            extPoint(tp, p);
            const rc = tp.getElementsByTagNameNS('*', 'RunCadence')[0];
            if (rc && p.cad == null) p.cad = num(rc.textContent);
            pts.push(p);
        }
        const sport = acts.length ? U.sportFromText(acts[0].getAttribute('Sport')) : 'generic';
        return { name, format: 'TCX', sport, points: pts, meta: {} };
    }

    function kml(str, name) {
        const doc = xmlOf(str);
        const pts = [];
        const tracks = Array.from(doc.getElementsByTagNameNS('*', 'Track'));
        for (const tr of tracks) {
            const whens = Array.from(tr.getElementsByTagNameNS('*', 'when')).map(e => parseTime(e.textContent));
            const coords = Array.from(tr.getElementsByTagNameNS('*', 'coord'));
            coords.forEach((c, i) => {
                const parts = c.textContent.trim().split(/\s+/).map(Number);
                const p = emptyPoint();
                p.lon = isFinite(parts[0]) ? parts[0] : null;
                p.lat = isFinite(parts[1]) ? parts[1] : null;
                p.ele = isFinite(parts[2]) ? parts[2] : null;
                p.t = whens[i] != null ? whens[i] : null;
                pts.push(p);
            });
        }
        if (!pts.length) {
            for (const ls of doc.getElementsByTagNameNS('*', 'LineString')) {
                const coordEl = ls.getElementsByTagNameNS('*', 'coordinates')[0];
                if (!coordEl) continue;
                for (const tuple of coordEl.textContent.trim().split(/\s+/)) {
                    const parts = tuple.split(',').map(Number);
                    if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1])) continue;
                    const p = emptyPoint();
                    p.lon = parts[0]; p.lat = parts[1];
                    p.ele = isFinite(parts[2]) ? parts[2] : null;
                    pts.push(p);
                }
            }
        }
        const trackName = text(doc, 'name') || name;
        return { name: trackName, format: 'KML', sport: 'generic', points: pts, meta: {} };
    }

    const CSV_COLS = {
        t: ['time', 'timestamp', 'datetime', 'date', '时间', '日期时间', '日期'],
        lat: ['lat', 'latitude', '纬度'],
        lon: ['lon', 'lng', 'long', 'longitude', '经度'],
        ele: ['ele', 'elevation', 'altitude', 'alt', '海拔', '高程', '高度'],
        hr: ['hr', 'heartrate', '心率'],
        cad: ['cad', 'cadence', '步频'],
        power: ['power', 'watts', '功率'],
        speed: ['speed', '速度'],
        dist: ['distance', 'dist', '距离'],
        temp: ['temp', 'temperature', 'atemp', '温度', '气温']
    };

    function csv(str, name) {
        const lines = str.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
        if (lines.length < 2) throw new Error('CSV 内容为空');
        const delim = [',', ';', '\t', '|'].map(d => [d, lines[0].split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
        const header = lines[0].split(delim).map(h => h.trim().toLowerCase().replace(/[\s_()（）]/g, ''));
        const col = {};
        for (const key in CSV_COLS) {
            const idx = header.findIndex(h => CSV_COLS[key].some(c => h === c.replace(/[\s_]/g, '')));
            if (idx >= 0) col[key] = idx;
        }
        if (col.lat == null || col.lon == null) {
            if (col.t == null) throw new Error('CSV 未识别到经纬度或时间列，请检查表头（支持 lat/lon/time 等常见命名）');
        }
        const pts = [];
        for (let i = 1; i < lines.length; i++) {
            const cells = lines[i].split(delim);
            const p = emptyPoint();
            for (const key in col) {
                const raw = (cells[col[key]] || '').trim();
                p[key] = key === 't' ? parseTime(raw) : num(raw);
            }
            if (p.t == null && p.lat == null && p.hr == null) continue;
            pts.push(p);
        }
        return { name, format: 'CSV', sport: 'generic', points: pts, meta: { columns: Object.keys(col) } };
    }

    function sniff(buffer, filename) {
        const ext = (filename.split('.').pop() || '').toLowerCase();
        if (['gpx', 'tcx', 'kml', 'csv', 'fit', 'txt'].includes(ext)) return ext === 'txt' ? 'csv' : ext;
        const u8 = new Uint8Array(buffer.slice(0, 64));
        if (u8.length > 12 && String.fromCharCode(u8[8], u8[9], u8[10], u8[11]) === '.FIT') return 'fit';
        const head = new TextDecoder('utf-8').decode(u8).trimStart();
        if (/^<\?xml|^<gpx/i.test(head)) return /TrainingCenterDatabase/i.test(head) ? 'tcx' : 'gpx';
        if (/^<kml/i.test(head)) return 'kml';
        return 'csv';
    }

    // buffer: ArrayBuffer；返回统一模型，FIT 由 TT.fit.read 提供
    function parse(buffer, filename) {
        const kind = sniff(buffer, filename);
        const base = filename.replace(/\.[^.]+$/, '');
        if (kind === 'fit') return TT.fit.read(buffer, base);
        const str = new TextDecoder('utf-8').decode(buffer);
        const out = { gpx, tcx, kml, csv }[kind](str, base);
        if (!out.points.length) throw new Error('文件中没有轨迹点');
        return out;
    }

    return { parse, emptyPoint, parseTime, sniff };
})();