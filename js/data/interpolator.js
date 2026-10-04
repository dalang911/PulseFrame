/**
 * interpolator.js - 逐秒线性插值
 * 从原 index.html 的 interpolationPoints() + formatValue() 提取
 * 将不等间隔的轨迹点插值为 1 秒间隔
 */

/**
 * 格式化/清洗数值（根据字段类型）
 * @param {string} key - 字段名
 * @param {*} value - 原始值
 * @returns {*} 清洗后的值
 */
export function formatValue(key, value) {
    if (typeof value !== 'number') return value;

    switch (key) {
        case 'cadence':
        case 'heart_rate':
            return Math.round(value);
        case 'distance':
        case 'speed':
        case 'step_length':
        case 'altitude':
            return parseFloat(value.toFixed(2));
        case 'position_lat':
        case 'position_long':
            return parseFloat(value.toFixed(6));
        default:
            return value;
    }
}

/**
 * 对轨迹点进行逐秒线性插值
 * 原地修改 data.data.trkpt，将不等间隔的时间点插值为 1 秒间隔
 * @param {Object} data - rq 数据结构（含 data.trkpt）
 */
export function interpolatePoints(data) {
    if (!data?.data?.trkpt || data.data.trkpt.length < 2) return;

    let trkpt = [...data.data.trkpt];

    // 插值前先清洗原始数据
    trkpt.forEach(point => {
        Object.keys(point).forEach(key => {
            point[key] = formatValue(key, point[key]);
        });
    });

    let i = 0;

    while (i < trkpt.length - 1) {
        const current = trkpt[i];
        const nextPoint = trkpt[i + 1];

        // 处理时间戳相同或逆序
        if (nextPoint.sec <= current.sec) {
            console.warn('跳过无效时间戳的点对', current, nextPoint);
            i++;
            continue;
        }

        const timeDiff = nextPoint.sec - current.sec;
        if (timeDiff === 1) {
            i++;
            continue;
        }

        // 插入中间点
        const steps = timeDiff - 1;

        for (let j = 1; j <= steps; j++) {
            const interpolatedPoint = { sec: current.sec + j };
            Object.keys(current).forEach(key => {
                if (current.hasOwnProperty(key) && nextPoint.hasOwnProperty(key)) {
                    const value = current[key] + (nextPoint[key] - current[key]) * (j / (steps + 1));
                    interpolatedPoint[key] = formatValue(key, value);
                }
            });
            trkpt.splice(i + j, 0, interpolatedPoint);
        }

        i += steps + 1;
    }

    data.data.trkpt = trkpt;
}
