/* TrackTrim FIT 编码器：生成标准活动文件（file_id + timer event + record + lap + session + activity）。
   记录字段按数据存在性动态定义；缺测字段写 FIT 无效值哨兵。 */
window.TT = window.TT || {};
TT.fit = TT.fit || {};

(function () {
    const U = TT.util;
    const crc16 = TT.fit.crc16;

    const INVALID = { 0x00: 0xFF, 0x01: 0x7F, 0x02: 0xFF, 0x83: 0x7FFF, 0x84: 0xFFFF, 0x85: 0x7FFFFFFF, 0x86: 0xFFFFFFFF, 0x0A: 0, 0x0C: 0 };

    function Bytes() { this.a = []; }
    Bytes.prototype.u8 = function (v) { this.a.push(v & 0xFF); };
    Bytes.prototype.u16 = function (v) { this.a.push(v & 0xFF, (v >> 8) & 0xFF); };
    Bytes.prototype.u32 = function (v) { this.a.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); };
    Bytes.prototype.i8 = function (v) { this.u8(v); };
    Bytes.prototype.i32 = function (v) { this.u32(v); };

    function writeVal(b, type, v) {
        if (v == null || !isFinite(v)) v = INVALID[type] != null ? INVALID[type] : 0xFF;
        switch (type) {
            case 0x00: case 0x02: case 0x0A: b.u8(v); break;
            case 0x01: b.i8(v); break;
            case 0x84: b.u16(v); break;
            case 0x85: b.i32(v); break;
            case 0x86: case 0x0C: b.u32(v); break;
            default: b.u8(v);
        }
    }

    const fitTime = ms => U.clamp(U.msToFit(ms), 0, 0xFFFFFFFE);
    const encEle = (v, hi) => v == null ? null : U.clamp(Math.round((v + 500) * 5), 0, hi);
    const encSpeed = (v, hi) => v == null ? null : U.clamp(Math.round(v * 1000), 0, hi);
    const encDist = v => v == null ? null : U.clamp(Math.round(v * 100), 0, 0xFFFFFFFE);
    const encU8 = v => v == null ? null : U.clamp(Math.round(v), 0, 254);
    const encU16 = v => v == null ? null : U.clamp(Math.round(v), 0, 65534);
    const encI8 = v => v == null ? null : U.clamp(Math.round(v), -128, 127);

    // points: 最终导出点（dist 已从 0 重算）；segments: 连续段数组（删片段且保留时间轴时 >1 段）
    function write(points, segments, opts) {
        opts = opts || {};
        if (!points.length) throw new Error('没有可导出的点');
        segments = segments && segments.length ? segments : [points];
        const sport = (U.SPORTS[opts.sport] || U.SPORTS.generic).fit;
        const stats = TT.model.stats(points, segments);
        const tzMin = opts.tzOffsetMin != null ? opts.tzOffsetMin : -new Date().getTimezoneOffset();

        const has = { latlon: false, ele: false, hr: false, cad: false, dist: false, speed: false, power: false, temp: false };
        for (const p of points) {
            if (p.lat != null && p.lon != null) has.latlon = true;
            if (p.ele != null) has.ele = true;
            if (p.hr != null) has.hr = true;
            if (p.cad != null) has.cad = true;
            if (p.dist != null) has.dist = true;
            if (p.speed != null) has.speed = true;
            if (p.power != null) has.power = true;
            if (p.temp != null) has.temp = true;
        }

        const b = new Bytes();
        for (let i = 0; i < 14; i++) b.u8(0); // 头部占位，最后回填
        const defined = {};

        function def(local, globalNum, fields) {
            b.u8(0x40 | local); b.u8(0); b.u8(0); b.u16(globalNum); b.u8(fields.length);
            for (const f of fields) { b.u8(f[0]); b.u8(f[1]); b.u8(f[2]); }
            defined[local] = fields;
        }
        function row(local, values) {
            b.u8(local);
            const fields = defined[local];
            for (let i = 0; i < fields.length; i++) writeVal(b, fields[i][2], values[i]);
        }
        function msg(local, globalNum, fields, values) {
            if (!defined[local]) def(local, globalNum, fields);
            row(local, values);
        }

        const first = points[0], last = points[points.length - 1];

        msg(0, 0, [[0, 1, 0x00], [1, 2, 0x84], [2, 2, 0x84], [3, 4, 0x0C], [4, 4, 0x86]],
            [4, 255, 0, 1, fitTime(first.t)]);

        const EV = [[253, 4, 0x86], [0, 1, 0x00], [1, 1, 0x00]];
        const timerEvent = (t, type) => msg(1, 21, EV, [fitTime(t), 0, type]);

        const rf = [[253, 4, 0x86]];
        if (has.latlon) rf.push([0, 4, 0x85], [1, 4, 0x85]);
        if (has.ele) rf.push([2, 2, 0x84], [78, 4, 0x86]);
        if (has.hr) rf.push([3, 1, 0x02]);
        if (has.cad) rf.push([4, 1, 0x02]);
        if (has.dist) rf.push([5, 4, 0x86]);
        if (has.speed) rf.push([6, 2, 0x84], [73, 4, 0x86]);
        if (has.power) rf.push([7, 2, 0x84]);
        if (has.temp) rf.push([13, 1, 0x01]);
        def(2, 20, rf);

        segments.forEach((seg, si) => {
            timerEvent(seg[0].t, 0);
            for (const p of seg) {
                const vals = [fitTime(p.t)];
                if (has.latlon) vals.push(p.lat == null ? null : U.degToSemi(p.lat), p.lon == null ? null : U.degToSemi(p.lon));
                if (has.ele) vals.push(encEle(p.ele, 65534), encEle(p.ele, 0xFFFFFFFE));
                if (has.hr) vals.push(encU8(p.hr));
                if (has.cad) vals.push(encU8(p.cad));
                if (has.dist) vals.push(encDist(p.dist));
                if (has.speed) vals.push(encSpeed(p.speed, 65534), encSpeed(p.speed, 0xFFFFFFFE));
                if (has.power) vals.push(encU16(p.power));
                if (has.temp) vals.push(encI8(p.temp));
                row(2, vals);
            }
            if (si < segments.length - 1) timerEvent(seg[seg.length - 1].t, 4);
        });
        timerEvent(last.t, 4);

        const elapsed = Math.round((last.t - first.t) / 1000 * 1000);
        const timer = Math.round(stats.moving * 1000);
        const sum = [
            [254, 2, 0x84], [253, 4, 0x86], [2, 4, 0x86], [0, 1, 0x00], [1, 1, 0x00],
            [5, 1, 0x00], [6, 1, 0x00], [7, 4, 0x86], [8, 4, 0x86], [9, 4, 0x86],
            [14, 2, 0x84], [15, 2, 0x84], [16, 1, 0x02], [17, 1, 0x02],
            [18, 1, 0x02], [19, 1, 0x02], [20, 2, 0x84], [21, 2, 0x84], [22, 2, 0x84], [23, 2, 0x84]
        ];
        const sumVals = idx => [
            idx, fitTime(last.t), fitTime(first.t), 0, 0, sport, 0,
            elapsed, timer, encDist(stats.dist),
            encSpeed(stats.avgSpeed, 65534), encSpeed(stats.maxSpeed, 65534),
            encU8(stats.avgHr), encU8(stats.maxHr), encU8(stats.avgCad), encU8(stats.maxCad),
            encU16(stats.avgPower), encU16(stats.maxPower),
            stats.gain == null ? null : U.clamp(Math.round(stats.gain), 0, 65534),
            stats.loss == null ? null : U.clamp(Math.round(stats.loss), 0, 65534)
        ];
        // lap: event=9(lap) event_type=1(stop)
        const lapVals = sumVals(0); lapVals[3] = 9; lapVals[4] = 1;
        msg(3, 19, sum, lapVals);
        // session: event=8(session)，追加 first_lap_index/num_laps
        const sesFields = sum.concat([[25, 2, 0x84], [26, 2, 0x84]]);
        const sesVals = sumVals(0); sesVals[3] = 8; sesVals[4] = 1;
        msg(4, 18, sesFields, sesVals.concat([0, 1]));
        // activity: event=26 event_type=1(stop) type=0(manual)
        msg(5, 34, [[253, 4, 0x86], [0, 4, 0x86], [1, 2, 0x84], [2, 1, 0x00], [3, 1, 0x00], [4, 1, 0x00], [5, 4, 0x86], [6, 1, 0x02]],
            [fitTime(last.t), timer, 1, 0, 26, 1, fitTime(last.t + tzMin * 60000), 0]);

        const dataSize = b.a.length - 14;
        b.a[0] = 14; b.a[1] = 0x20;
        b.a[2] = 2140 & 0xFF; b.a[3] = 2140 >> 8;
        b.a[4] = dataSize & 0xFF; b.a[5] = (dataSize >>> 8) & 0xFF; b.a[6] = (dataSize >>> 16) & 0xFF; b.a[7] = (dataSize >>> 24) & 0xFF;
        b.a[8] = 0x2E; b.a[9] = 0x46; b.a[10] = 0x49; b.a[11] = 0x54; // ".FIT"
        const hdrCrc = crc16(new Uint8Array(b.a.slice(0, 12)), 0, 12);
        b.a[12] = hdrCrc & 0xFF; b.a[13] = hdrCrc >> 8;
        const all = new Uint8Array(b.a.length + 2);
        all.set(b.a);
        const fileCrc = crc16(all, 0, b.a.length);
        all[b.a.length] = fileCrc & 0xFF; all[b.a.length + 1] = fileCrc >> 8;
        return all.buffer;
    }

    TT.fit.write = write;
})();