/**
 * configDiff.js - 组件「真实设置」的序列化辅助
 *
 * 背景：模板 JSON 里的 customProps 是按下标记录的子元素属性（child_0_fill…），
 * 而 build() 读的是语义键（config.avatarUrl / config.pointSize…），
 * 所以 customProps 里的键永远不会被 build 消费 —— 用户在右侧面板改的颜色、
 * 尺寸、头像在「保存模板 → 重新载入」后会全部退回默认值。
 *
 * 这里补上真正的通路：把 box.__leaferConfig 与 definition.defaultConfig 做差异，
 * 只把「和默认值不一样的那部分」写进模板的 config 字段（载入时再合并回 overrides）。
 * 只存差异有两个好处：旧模板（没有 config 字段）照旧工作；
 * 新增设置项不会让所有已发布的模板体积变大。
 */

/** 几何键由模板的顶层字段单独记录，不重复写进 config */
export const GEOMETRY_KEYS = ['x', 'y', 'width', 'height', 'rotation', 'scale'];

/** 值是否可安全写进 JSON（ Leafer 元素/函数等运行时对象要跳过） */
function isPlainValue(v) {
    if (v === null || v === undefined) return true;
    const t = typeof v;
    if (t === 'function' || t === 'symbol') return false;
    if (t !== 'object') return true;
    if (Array.isArray(v)) return true;
    // Leafer 元素有 tag/id 等，但更可靠的判断是「不能 JSON 化」——交给下面的 try
    return true;
}

function sameValue(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' && typeof b === 'number') {
        // 面板写入的数字可能是字符串形式（"12"），视为相等
        return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-9;
    }
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
        return false;
    }
}

/**
 * 提取组件相对默认配置的差异
 * @param {Object} config - box.__leaferConfig
 * @param {Object} defaults - definition.defaultConfig
 * @returns {Object} 只包含被改过的键；无差异时为空对象
 */
export function extractConfigDiff(config, defaults) {
    const out = {};
    if (!config || typeof config !== 'object') return out;
    const def = defaults || {};

    Object.keys(config).forEach(key => {
        if (GEOMETRY_KEYS.includes(key)) return;
        const v = config[key];
        if (!isPlainValue(v)) return;
        if (sameValue(v, def[key])) return;
        try {
            // 确认可以序列化（Leafer 实例等会在这里抛错并被跳过）
            JSON.stringify(v);
        } catch (e) {
            return;
        }
        out[key] = v;
    });

    return out;
}

/**
 * 把模板里的 config 差异合并回工厂的 overrides
 * @param {Object} overrides - 已含 x/y/width/height 的覆盖对象
 * @param {Object} savedConfig - template.components[i].config（旧模板没有该字段）
 * @returns {Object} 同一个 overrides（就地合并，便于链式调用）
 */
export function mergeSavedConfig(overrides, savedConfig) {
    if (!savedConfig || typeof savedConfig !== 'object') return overrides;
    Object.keys(savedConfig).forEach(key => {
        if (GEOMETRY_KEYS.includes(key)) return;
        overrides[key] = savedConfig[key];
    });
    return overrides;
}
