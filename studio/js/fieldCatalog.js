/**
 * studio/fieldCatalog.js - 可绑定的系统数据字段目录
 *
 * 供 BindingPanel 选择字段与 min/max 边界引用；这些 key 与 bindingEngine.fieldValue 一致。
 *   - value   : 逐帧轨迹点字段（frameData）
 *   - derived : 派生量（pct / km / pace / total* / duration）
 *   - extreme : chartData 里的全量极值/基准（用作 min/max 归一化边界）
 */

export const FIELDS = [
    // ===== 轨迹点数值字段 =====
    { key: 'distance',    label: 'Distance (m)',           group: 'value', unitKey: 'distance' },
    { key: 'speed',       label: 'Speed (km/h)',           group: 'value', unitKey: 'speed' },
    { key: 'heart_rate',  label: 'Heart rate (bpm)',       group: 'value', unitKey: 'heart_rate' },
    { key: 'cadence',     label: 'Cadence',                group: 'value', unitKey: 'cadence' },
    { key: 'power',       label: 'Power (watt)',           group: 'value', unitKey: 'power' },
    { key: 'step_length', label: 'Step length (m)',        group: 'value', unitKey: 'step_length' },
    { key: 'altitude',    label: 'Altitude (m)',           group: 'value', unitKey: 'altitude' },
    { key: 'slope',       label: 'Slope (%)',              group: 'value' },
    { key: 'sec',         label: 'Elapsed (s)',            group: 'value' },
    { key: 'Gain',        label: 'Gain (m)',               group: 'value' },
    { key: 'Loss',        label: 'Loss (m)',               group: 'value' },
    { key: 'azimuth',     label: 'Azimuth (°)',            group: 'value' },

    // ===== 派生量 =====
    { key: 'km',    label: 'Kilometers (km)',        group: 'derived' },
    { key: 'pace',  label: 'Pace (min/km)',          group: 'derived' },
    { key: 'pct',   label: 'Progress (0..1)',        group: 'derived' },
    { key: 'totalDistance', label: 'Total distance (m)',   group: 'derived' },
    { key: 'totalKm',       label: 'Total km',             group: 'derived' },
    { key: 'duration',      label: 'Total duration (s)',   group: 'derived' },
    { key: 'elapsedMin',    label: 'Elapsed (min)',        group: 'derived' },
    { key: 'avgSpeed',      label: 'Avg speed (km/h)',     group: 'derived' },
    { key: 'avgPace',       label: 'Avg pace (min/km)',    group: 'derived' },
    { key: 'remainDistance',label: 'Remaining distance (m)', group: 'derived' },
    { key: 'remainKm',      label: 'Remaining km',         group: 'derived' },
    { key: 'relAltitude',   label: 'Relative altitude (m)', group: 'derived' },
    { key: 'hrPct',         label: 'HR %max (0..1)',       group: 'derived' },
    { key: 'elapsedTime',   label: 'Elapsed (h:m:s)',      group: 'derived' },
    { key: 'totalTime',     label: 'Total time (h:m:s)',   group: 'derived' },
    { key: 'remainTime',    label: 'Est. remaining (h:m:s)', group: 'derived' },

    // ===== 极值/基准（多用于 min/max 边界） =====
    { key: 'heartRateMin', label: 'HR min', group: 'extreme' },
    { key: 'heartRateMax', label: 'HR max', group: 'extreme' },
    { key: 'user_heartRateMax', label: 'HR cap (rounded)', group: 'extreme' },
    { key: 'cadenceMin', label: 'Cadence min', group: 'extreme' },
    { key: 'cadenceMax', label: 'Cadence max', group: 'extreme' },
    { key: 'paceMin', label: 'Speed min', group: 'extreme' },
    { key: 'paceMax', label: 'Speed max', group: 'extreme' },
    { key: 'paceBoundMin', label: 'Pace min (slowest, min/km)', group: 'extreme' },
    { key: 'paceBoundMax', label: 'Pace max (fastest, min/km)', group: 'extreme' },
    { key: 'eleMin', label: 'Altitude min', group: 'extreme' },
    { key: 'eleMax', label: 'Altitude max', group: 'extreme' },
    { key: 'baseAltitude', label: 'Base altitude', group: 'extreme' },
    { key: 'powerMin', label: 'Power min', group: 'extreme' },
    { key: 'powerMax', label: 'Power max', group: 'extreme' }
];

const GROUP_LABELS = { value: 'Live data', derived: 'Derived', extreme: 'Extremes/Bounds' };

/** 按分组返回字段（用于绑定面板下拉） */
export function fieldsByGroup() {
    const groups = {};
    FIELDS.forEach(f => {
        (groups[f.group] = groups[f.group] || []).push(f);
    });
    return { groups, labels: GROUP_LABELS };
}

/** 供 min/max 选择：所有字段 + 允许手填数字（UI 层处理数字） */
export function boundOptions() {
    return FIELDS;
}

export function fieldLabel(key) {
    const f = FIELDS.find(x => x.key === key);
    return f ? f.label : key;
}
