/* TrackTrim FIT 解码器。只提取轨迹编辑需要的消息（file_id/record/event/lap/session/sport/activity），
   其余消息按定义跳过；支持压缩时间戳头、开发者字段、大小端、链式 FIT、CRC 校验。 */
window.TT = window.TT || {};

TT.fit = TT.fit || {};

(function () {
    const U = TT.util;

    const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
        0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];

    function crc16(u8, start, end, crc) {
        crc = crc || 0;
        for (let i = start; i < end; i++) {
            const b = u8[i];
            let tmp = CRC_TABLE[crc & 0xF];
            crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ CRC_TABLE[b & 0xF];
            tmp = CRC_TABLE[crc & 0xF];
            crc = ((crc >> 4) & 0x0FFF) ^ tmp ^ CRC_TABLE[(b >> 4) & 0xF];
        }
        return crc & 0xFFFF;
    }

    const TYPE_SIZE = {
        0x00: 1, 0x01: 1, 0x02: 1, 0x83: 2, 0x84: 2, 0x85: 4, 0x86: 4, 0x07: 1,
        0x88: 4, 0x89: 8, 0x0A: 1, 0x0B: 2, 0x0C: 4, 0x0D: 1, 0x8E: 8, 0x8F: 8, 0x90: 8
    };

    function isInvalid(raw, baseType, dv, p, le) {
        switch (baseType) {
            case 0x00: case 0x02: case 0x0D: return raw === 0xFF;
            case 0x01: return raw === 0x7F;
            case 0x83: return raw === 0x7FFF;
            case 0x84: return raw === 0xFFFF;
            case 0x85: return raw === 0x7FFFFFFF;
            case 0x86: return raw === 0xFFFFFFFF;
            case 0x0A: case 0x0B: case 0x0C: return raw === 0;
            case 0x88: return dv.getUint32(p, le) === 0xFFFFFFFF;
            case 0x89: return dv.getUint32(p, le) === 0xFFFFFFFF && dv.getUint32(p + 4, le) === 0xFFFFFFFF;
            case 0x8E: return raw === 0x7FFFFFFFFFFFFFFF;
            case 0x8F: case 0x90: return raw === 0xFFFFFFFFFFFFFFFF;
            default: return false;
        }
    }

    function readRaw(dv, p, baseType, le) {
        switch (baseType) {
            case 0x00: case 0x02: case 0x0A: case 0x0D: return dv.getUint8(p);
            case 0x01: return dv.getInt8(p);
            case 0x83: return dv.getInt16(p, le);
            case 0x84: case 0x0B: return dv.getUint16(p, le);
            case 0x85: return dv.getInt32(p, le);
            case 0x86: case 0x0C: return dv.getUint32(p, le);
            case 0x88: return dv.getFloat32(p, le);
            case 0x89: return dv.getFloat64(p, le);
            case 0x8E: return Number(dv.getBigInt64(p, le));
            case 0x8F: case 0x90: return Number(dv.getBigUint64(p, le));
            default: return dv.getUint8(p);
        }
    }

    // 字段映射：kind time=FIT秒→ms，semi=半圆→度；scale/offset 按 FIT profile
    const F = (key, scale, offset, kind) => ({ key, scale: scale || 1, offset: offset || 0, kind });
    const FIELD_MAP = {
        0: { 0: F('type'), 1: F('manufacturer'), 2: F('product'), 3: F('serial'), 4: F('time_created', 1, 0, 'time'), 8: F('productName') },
        20: {
            253: F('t', 1, 0, 'time'), 0: F('lat', 1, 0, 'semi'), 1: F('lon', 1, 0, 'semi'),
            2: F('ele', 5, 500), 78: F('ele', 5, 500), 3: F('hr'), 4: F('cad'), 53: F('fracCad', 128),
            5: F('dist', 100), 6: F('speed', 1000), 73: F('speed', 1000), 7: F('power'), 13: F('temp')
        },
        21: { 253: F('t', 1, 0, 'time'), 0: F('event'), 1: F('event_type'), 3: F('data') },
        19: {
            253: F('t', 1, 0, 'time'), 2: F('start_time', 1, 0, 'time'), 5: F('sport'), 6: F('sub_sport'),
            7: F('elapsed', 1000), 8: F('timer', 1000), 9: F('dist', 100),
            22: F('ascent'), 23: F('descent'), 16: F('avg_hr'), 17: F('max_hr'),
            14: F('avg_speed', 1000), 15: F('max_speed', 1000)
        },
        18: {
            253: F('t', 1, 0, 'time'), 2: F('start_time', 1, 0, 'time'), 5: F('sport'), 6: F('sub_sport'),
            7: F('elapsed', 1000), 8: F('timer', 1000), 9: F('dist', 100),
            22: F('ascent'), 23: F('descent'), 16: F('avg_hr'), 17: F('max_hr'),
            14: F('avg_speed', 1000), 15: F('max_speed', 1000), 25: F('num_laps')
        },
        12: { 0: F('sport'), 1: F('sub_sport') },
        34: { 253: F('t', 1, 0, 'time'), 0: F('timer', 1000), 1: F('num_sessions'), 5: F('local_t', 1, 0, 'time') }
    };
    // enhanced 字段覆盖普通字段：记录里后出现的 78/73 优先于 2/6
    const ENHANCED = { 78: 'ele', 73: 'speed' };

    const FIT_SPORT = { 1: 'running', 2: 'cycling', 5: 'swimming', 11: 'walking', 17: 'hiking' };

    function read(buffer, baseName) {
        const u8 = new Uint8Array(buffer);
        const dv = new DataView(buffer);
        const points = [], events = [], laps = [], sessions = [];
        let fileId = null, sportNum = null, crcOk = true, pos = 0;

        while (pos + 12 <= u8.length) {
            const hdrSize = u8[pos];
            if (hdrSize < 12 || pos + hdrSize > u8.length) break;
            if (String.fromCharCode(u8[pos + 8], u8[pos + 9], u8[pos + 10], u8[pos + 11]) !== '.FIT') {
                if (pos === 0) throw new Error('不是有效的 FIT 文件（缺少 .FIT 签名）');
                break;
            }
            const dataSize = dv.getUint32(pos + 4, true);
            const dataStart = pos + hdrSize, dataEnd = dataStart + dataSize;
            if (dataEnd + 2 > u8.length) throw new Error('FIT 文件被截断（数据长度超出文件）');
            if (hdrSize >= 14) {
                const want = dv.getUint16(dataEnd, true);
                const got = crc16(u8, dataStart, dataEnd, crc16(u8, pos, pos + hdrSize));
                if (want !== 0 && want !== got) crcOk = false;
            }

            const defs = {}, lastTs = {};
            let p = dataStart;
            while (p < dataEnd) {
                const hdr = u8[p++];
                let def, tsOverride = null;
                if (hdr & 0x80) {
                    const local = (hdr >> 5) & 3;
                    def = defs[local];
                    if (!def) throw new Error('FIT 压缩时间戳引用了未定义的本地消息');
                    const offset = hdr & 0x1F, base = lastTs[local];
                    if (base == null) throw new Error('FIT 压缩时间戳缺少基准时间');
                    let ts = (base & ~0x1F) + offset;
                    if (offset < (base & 0x1F)) ts += 0x20;
                    lastTs[local] = ts;
                    tsOverride = ts;
                } else {
                    const local = hdr & 0x0F;
                    if (hdr & 0x40) {
                        p++; // reserved
                        const le = u8[p++] === 0;
                        const globalNum = dv.getUint16(p, le); p += 2;
                        const n = u8[p++];
                        const fields = [];
                        for (let i = 0; i < n; i++) {
                            fields.push({ num: u8[p], size: u8[p + 1], type: u8[p + 2] });
                            p += 3;
                        }
                        let devSize = 0;
                        if (hdr & 0x20) {
                            const dn = u8[p++];
                            for (let i = 0; i < dn; i++) { devSize += u8[p + 1]; p += 3; }
                        }
                        defs[local] = { globalNum, le, fields, devSize };
                        continue;
                    }
                    def = defs[local];
                    if (!def) throw new Error('FIT 数据消息引用了未定义的本地消息');
                }

                const map = FIELD_MAP[def.globalNum];
                const out = {};
                let rawTs = null;
                for (const f of def.fields) {
                    // 压缩时间戳头：timestamp 字段由头部携带，数据流中不含其字节
                    if (tsOverride != null && f.num === 253) continue;
                    const tsz = TYPE_SIZE[f.type] || 1;
                    const count = Math.max(1, Math.floor(f.size / tsz));
                    const fp = p;
                    p += f.size;
                    if (!map || !map[f.num]) continue;
                    if (f.type === 0x07) {
                        let end = fp;
                        while (end < fp + f.size && u8[end] !== 0) end++;
                        out[map[f.num].key] = new TextDecoder('utf-8').decode(u8.subarray(fp, end));
                        continue;
                    }
                    if (isInvalid(readRaw(dv, fp, f.type, def.le), f.type, dv, fp, def.le)) continue;
                    let v = readRaw(dv, fp, f.type, def.le);
                    const fd = map[f.num];
                    v = v / fd.scale - fd.offset;
                    if (fd.kind === 'time') { rawTs = v; v = U.fitToMs(v); }
                    else if (fd.kind === 'semi') v = U.semiToDeg(v);
                    if (count > 1 && fd.kind !== 'time') {
                        // 数组字段取首值（记录级字段极少为数组）
                    }
                    if (ENHANCED[f.num] || out[fd.key] == null) out[fd.key] = v;
                }
                p += def.devSize;

                if (tsOverride != null) { out.t = U.fitToMs(tsOverride); rawTs = tsOverride; }
                if (rawTs != null) lastTs[hdr & 0x80 ? (hdr >> 5) & 3 : hdr & 0x0F] = rawTs;

                switch (def.globalNum) {
                    case 0: fileId = out; break;
                    case 20: {
                        const pt = TT.parsers.emptyPoint();
                        pt.t = out.t != null ? out.t : null;
                        pt.lat = out.lat != null ? out.lat : null;
                        pt.lon = out.lon != null ? out.lon : null;
                        pt.ele = out.ele != null ? out.ele : null;
                        pt.hr = out.hr != null ? out.hr : null;
                        pt.cad = out.cad != null ? out.cad + (out.fracCad || 0) : null;
                        pt.power = out.power != null ? out.power : null;
                        pt.speed = out.speed != null ? out.speed : null;
                        pt.dist = out.dist != null ? out.dist : null;
                        pt.temp = out.temp != null ? out.temp : null;
                        points.push(pt);
                        break;
                    }
                    case 21: events.push(out); break;
                    case 19: laps.push(out); break;
                    case 18: sessions.push(out); if (out.sport != null) sportNum = out.sport; break;
                    case 12: if (out.sport != null) sportNum = out.sport; break;
                }
            }
            pos = dataEnd + 2;
        }

        if (!points.length) throw new Error('FIT 文件中没有轨迹记录（record）');
        const sport = FIT_SPORT[sportNum] || 'generic';
        return {
            name: baseName || 'track', format: 'FIT', sport, points,
            meta: {
                created: fileId && fileId.time_created != null ? fileId.time_created : null,
                manufacturer: fileId ? fileId.manufacturer : null,
                product: fileId ? fileId.product : null,
                productName: fileId && fileId.productName != null ? fileId.productName : null,
                crcOk, sessions: sessions.length, laps: laps.length,
                timerEvents: events.filter(e => e.event === 0).length
            }
        };
    }

    TT.fit.read = read;
    TT.fit.crc16 = crc16;
})();