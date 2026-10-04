/**
 * definitions/dateTime.js - 日期时间组件
 */
import { timestampToDateString } from '../../utils/format.js';

export default {
    id: 'appv_date_pan',
    name: 'Date',
    category: 'time',
    icon: './images/m1.png',
    defaultConfig: {
        x: 20,
        y: 20,
        width: 420,
        height: 56,
        cornerRadius: 8,
        textColor: '#FFFFFF',
        fontSize: 36
    },
    dataBindings: ['timestamp'],
    settings: [
        { name: 'DateTime', type: 'title' },
        { name: 'Text color', key: 'textColor', type: 'color' }
    ],

    build(config, data) {
        const dateText = data?.data?.summary?.training_at || '--';
        return [
            {
                name: 'daydate',
                tag: 'Text',
                resizeFontSize: true,
                fontSize: config.fontSize || 36,
                fontWeight: 'black',
                text: dateText,
                fill: config.textColor || '#FFFFFF',
                textAlign: 'left',
                verticalAlign: 'top',
                shadow: { x: 2, y: 2, blur: 0, color: '#333333' }
            }
        ];
    },

    update(box, frameData) {
        // 日期时间组件通常显示训练日期，不需要逐帧更新
        // 但如果需要显示当前帧的时间戳，可以取消注释：
        if (box.children[0] && frameData.timestamp) {
            box.children[0].text = timestampToDateString(frameData.timestamp);
        }
    }
};
