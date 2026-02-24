/**
 * 買賣訊號偵測模組
 * 偵測 MA 黃金/死亡交叉、MACD 翻多/翻空、RSI 超買/超賣
 * 回傳訊號陣列供 chart.js 標記在 K 線圖上
 */

// ============================================================
// 訊號偵測主函式
// ============================================================

/**
 * 從指標數據偵測買賣訊號
 * @param {Object} indicators - 包含 date, ma5, ma20, macd_histogram, rsi 的物件
 * @param {Array} priceData - K線價格陣列 [open, close, low, high]
 * @returns {Array} 訊號陣列 [{ dateIdx, date, type, label, color }]
 */
function detectSignals(indicators, priceData) {
    if (!indicators || !indicators.date) return [];

    const signals = [];
    const dates = indicators.date;

    // MA 黃金交叉 / 死亡交叉
    if (indicators.ma5 && indicators.ma20) {
        const ma5 = indicators.ma5;
        const ma20 = indicators.ma20;

        for (let i = 1; i < dates.length; i++) {
            if (ma5[i] == null || ma20[i] == null || ma5[i - 1] == null || ma20[i - 1] == null) continue;

            const prevDiff = ma5[i - 1] - ma20[i - 1];
            const currDiff = ma5[i] - ma20[i];

            // 黃金交叉：MA5 由下往上穿越 MA20
            if (prevDiff <= 0 && currDiff > 0) {
                signals.push({
                    dateIdx: i,
                    date: dates[i],
                    type: 'buy',
                    label: 'MA金叉',
                    color: '#ef4444',
                });
            }
            // 死亡交叉：MA5 由上往下穿越 MA20
            if (prevDiff >= 0 && currDiff < 0) {
                signals.push({
                    dateIdx: i,
                    date: dates[i],
                    type: 'sell',
                    label: 'MA死叉',
                    color: '#10b981',
                });
            }
        }
    }

    // MACD 翻多 / 翻空
    if (indicators.macd_histogram) {
        const hist = indicators.macd_histogram;

        for (let i = 1; i < dates.length; i++) {
            if (hist[i] == null || hist[i - 1] == null) continue;

            // 翻多：柱狀圖由負轉正
            if (hist[i - 1] < 0 && hist[i] >= 0) {
                signals.push({
                    dateIdx: i,
                    date: dates[i],
                    type: 'buy',
                    label: 'MACD多',
                    color: '#ef4444',
                });
            }
            // 翻空：柱狀圖由正轉負
            if (hist[i - 1] > 0 && hist[i] <= 0) {
                signals.push({
                    dateIdx: i,
                    date: dates[i],
                    type: 'sell',
                    label: 'MACD空',
                    color: '#10b981',
                });
            }
        }
    }

    // RSI 超買 / 超賣
    if (indicators.rsi) {
        const rsi = indicators.rsi;

        for (let i = 1; i < dates.length; i++) {
            if (rsi[i] == null || rsi[i - 1] == null) continue;

            // 超買回落：RSI 由 >70 回落到 <70
            if (rsi[i - 1] > 70 && rsi[i] <= 70) {
                signals.push({
                    dateIdx: i,
                    date: dates[i],
                    type: 'sell',
                    label: 'RSI超買',
                    color: '#10b981',
                });
            }
            // 超賣回升：RSI 由 <30 回升到 >30
            if (rsi[i - 1] < 30 && rsi[i] >= 30) {
                signals.push({
                    dateIdx: i,
                    date: dates[i],
                    type: 'buy',
                    label: 'RSI超賣',
                    color: '#ef4444',
                });
            }
        }
    }

    return signals;
}

// ============================================================
// 訊號轉 ECharts markPoint
// ============================================================

/**
 * 將訊號轉換為 ECharts markPoint data 格式
 * @param {Array} signals - detectSignals() 回傳的陣列
 * @param {Array} priceData - K線價格陣列
 * @returns {Array} ECharts markPoint data
 */
function signalsToMarkPoints(signals, priceData) {
    if (!signals || signals.length === 0) return [];

    return signals.map(s => {
        const price = priceData?.[s.dateIdx];
        const isBuy = s.type === 'buy';
        const yValue = isBuy
            ? (price ? price[2] : 0)   // low
            : (price ? price[3] : 0);  // high

        return {
            name: s.label,
            coord: [s.dateIdx, yValue],
            value: s.label,
            symbol: isBuy ? 'triangle' : 'path://M0,0 L10,0 L5,8 Z',
            symbolSize: isBuy ? [12, 10] : [12, 10],
            symbolRotate: 0,
            symbolOffset: isBuy ? [0, 6] : [0, -6],
            itemStyle: {
                color: s.color,
                shadowBlur: 3,
                shadowColor: s.color + '55',
            },
            label: {
                show: true,
                formatter: s.label,
                position: isBuy ? 'bottom' : 'top',
                fontSize: 9,
                color: s.color,
                distance: 4,
            },
        };
    });
}
