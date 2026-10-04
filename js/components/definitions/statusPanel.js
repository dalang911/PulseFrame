/**
 * definitions/statusPanel.js - 综合信息面板
 * 显示速度/配速/心率/步频/步幅等实时数据
 */
import { speedToPace, convertToDMS } from '../../utils/format.js';

export default {
    id: 'appv_nowstatus_pan',
    name: 'All',
    category: 'text',
    icon: './images/s1.png',
    defaultConfig: {
        x: 1400,
        y: 20,
        width: 500,
        height: 200,
        cornerRadius: 8,
        textColor: '#FFFFFF',
        fontSize: 24
    },
    dataBindings: ['speed', 'heart_rate', 'cadence', 'step_length', 'altitude'],
    settings: [
        { name: 'Status Panel', type: 'title' },
        { name: 'Text color', key: 'textColor', type: 'color' },
        { name: 'Font size', key: 'fontSize', type: 'number', min: 12, max: 48 }
    ],

    build(config) {
        return [
            {
                tag: 'Text',
                resizeFontSize: true,
                fontSize: config.fontSize || 24,
                fontWeight: 'black',
                text: 'Speed: -- km/h\nPace: -- min/km\nHeart Rate: -- bpm\nCadence: -- steps/min\nStep: -- m',
                fill: config.textColor || '#FFFFFF',
                textAlign: 'left',
                verticalAlign: 'top',
                shadow: { x: 2, y: 2, blur: 0, color: '#333333' }
                // 不写 lineHeight：leafer 里它是「绝对行高 px」而非倍数（写 1.5 = 每行 1.5px，\n 的多行会叠成一条）；
                // 缺省值本就是 1.5 × fontSize，且能随 resizeFontSize 一起缩放
            }
        ];
    },

    update(box, frameData) {
        const children = box.children;
        if (!children || children.length < 1) return;

        const speed = frameData.speed || 0;
        const pace = speed > 0 ? speedToPace(speed) : '00:00';
        const heartRate = frameData.heart_rate || 0;
        const cadence = frameData.cadence || 0;
        const stepLength = frameData.step_length || 0;

        children[0].text = `Speed: ${speed.toFixed(2)} km/h\nPace: ${pace} min/km\nHeart Rate: ${heartRate} bpm\nCadence: ${cadence} steps/min\nStep: ${stepLength} m`;
    }
};
