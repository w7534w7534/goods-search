/**
 * K 線圖 + 技術指標渲染 (ECharts)
 */

// 統一由 common.js 的 ChartManager 管理

// 目前的指標數據
let indicatorData = null;
let priceData = null;

let hoveredChart = null;
let _resizeBound = false;
let _tooltipInteractiveBound = false;

function _bindTooltipInteractiveSync() {
    if (_tooltipInteractiveBound) return;
    _tooltipInteractiveBound = true;

    const kDom = document.getElementById('klineChart');
    const iDom = document.getElementById('indicatorChart');

    if (kDom) {
        kDom.addEventListener('mouseenter', () => hoveredChart = 'kline');
        kDom.addEventListener('mouseleave', () => { if (hoveredChart === 'kline') hoveredChart = null; });
    }

    if (iDom) {
        iDom.addEventListener('mouseenter', () => hoveredChart = 'indicator');
        iDom.addEventListener('mouseleave', () => { if (hoveredChart === 'indicator') hoveredChart = null; });
    }
}

function _bindResizeOnce() {
    if (_resizeBound) return;
    _resizeBound = true;
    window.addEventListener('resize', () => {
        ChartManager.resizeAll();
    });

    _bindTooltipInteractiveSync();
}

// ============================================================
// K 線圖 + 主指標（MA、BB、VWAP）
// ============================================================

function initKlineChart(data, indicators) {
    priceData = data;
    indicatorData = indicators;

    const chartDom = document.getElementById('klineChart');
    ChartManager.init('klineChart', chartDom);

    renderKlineChart();
    _bindResizeOnce();
}

function renderKlineChart() {
    const chart = ChartManager.get('klineChart');
    if (!priceData || !indicatorData || !chart) return;

    const dates = priceData.map(d => d.date);
    const ohlc = priceData.map(d => [d.open, d.close, d.min, d.max]);
    const volumes = priceData.map(d => Object.hasOwn(d, 'Trading_Volume') ? Math.round(d.Trading_Volume / 1000) : 0);
    const colors = priceData.map(d => d.close >= d.open ? '#ef4444' : '#10b981');

    const series = [
        {
            name: 'K線',
            type: 'candlestick',
            data: ohlc,
            itemStyle: {
                color: '#ef4444',       // 上漲（紅）
                color0: '#10b981',      // 下跌（綠）
                borderColor: '#ef4444',
                borderColor0: '#10b981',
            },
            barWidth: '60%',
        },
        {
            name: '成交量',
            type: 'bar',
            xAxisIndex: 1,
            yAxisIndex: 1,
            data: volumes.map((v, i) => ({
                value: v,
                itemStyle: { color: colors[i] + '55' }
            })),
            barWidth: '60%',
        }
    ];

    // 主圖指標
    const activeIndicators = getActiveMainIndicators();

    if (activeIndicators.includes('ma') && indicatorData.ma5) {
        const maColors = {
            ma5: '#eab308', ma10: '#f97316', ma20: '#3b82f6',
            ma60: '#8b5cf6', ma120: '#ec4899'
        };
        const maNames = {
            ma5: 'MA5', ma10: 'MA10', ma20: 'MA20',
            ma60: 'MA60', ma120: 'MA120'
        };
        for (const [key, color] of Object.entries(maColors)) {
            if (indicatorData[key]) {
                series.push({
                    name: maNames[key],
                    type: 'line',
                    data: indicatorData[key],
                    smooth: true,
                    lineStyle: { width: 1.2, color },
                    symbol: 'none',
                    z: 2,
                });
            }
        }
    }

    if (activeIndicators.includes('bb') && indicatorData.bb_upper) {
        series.push(
            {
                name: '布林上軌',
                type: 'line',
                data: indicatorData.bb_upper,
                lineStyle: { width: 1, color: '#06b6d4', type: 'dashed' },
                symbol: 'none',
            },
            {
                name: '布林中軌',
                type: 'line',
                data: indicatorData.bb_middle,
                lineStyle: { width: 1, color: '#06b6d4' },
                symbol: 'none',
            },
            {
                name: '布林下軌',
                type: 'line',
                data: indicatorData.bb_lower,
                lineStyle: { width: 1, color: '#06b6d4', type: 'dashed' },
                symbol: 'none',
            }
        );
    }

    if (activeIndicators.includes('vwap') && indicatorData.vwap) {
        series.push({
            name: 'VWAP',
            type: 'line',
            data: indicatorData.vwap,
            lineStyle: { width: 1.5, color: '#ec4899', type: 'dotted' },
            symbol: 'none',
        });
    }

    // 買賣訊號標記
    if (activeIndicators.includes('signal') && typeof detectSignals === 'function') {
        const signals = detectSignals(indicatorData, ohlc);
        const markData = signalsToMarkPoints(signals, ohlc);
        if (markData.length > 0) {
            // 在 K 線 series 上加 markPoint
            series[0].markPoint = {
                data: markData,
                animation: true,
            };
        }
    } else {
        // 確保關閉時清除 markPoint
        series[0].markPoint = { data: [] };
    }

    const option = {
        title: {
            subtext: `資料擷取日期: ${dates[dates.length - 1] || '未知'}`,
            right: 15,
            top: 0,
            subtextStyle: { color: '#64748b', fontSize: 11 }
        },
        backgroundColor: 'transparent',
        animation: true,
        tooltip: {
            trigger: 'axis',
            axisPointer: {
                type: 'cross',
                crossStyle: { color: '#64748b' },
            },
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: function (params) {
                if (hoveredChart === 'indicator') return '';
                if (!params || !params.length) return '';
                const date = params[0].axisValue;
                let html = `<div style="font-weight:600;margin-bottom:6px;">${date}</div>`;
                const kline = params.find(p => p.seriesName === 'K線');
                if (kline) {
                    // ECharts candlestick: kline.value = [index, open, close, low, high]
                    // 跳過第一個 category index
                    const [, open, close, low, high] = kline.value;
                    const change = ((close - open) / open * 100).toFixed(2);
                    const color = close >= open ? '#ef4444' : '#10b981';
                    html += `<div>開盤: <b>${open}</b> 收盤: <b style="color:${color}">${close}</b></div>`;
                    html += `<div>最高: <b>${high}</b> 最低: <b>${low}</b></div>`;
                    html += `<div>漲跌: <b style="color:${color}">${change}%</b></div>`;
                }
                const vol = params.find(p => p.seriesName === '成交量');
                if (vol) {
                    html += `<div>成交量: <b>${Math.round(vol.data.value).toLocaleString()} 張</b></div>`;
                }
                // 其他指標
                params.filter(p => !['K線', '成交量'].includes(p.seriesName)).forEach(p => {
                    if (p.data != null) {
                        html += `<div style="color:${p.color}">${p.seriesName}: <b>${p.data}</b></div>`;
                    }
                });
                return html;
            }
        },
        axisPointer: {
            link: [{ xAxisIndex: 'all' }],
        },
        grid: [
            { left: 60, right: 30, top: 20, height: '60%' },
            { left: 60, right: 30, top: '78%', height: '15%' },
        ],
        xAxis: [
            {
                type: 'category',
                data: dates,
                axisLine: { lineStyle: { color: '#334155' } },
                axisLabel: { color: '#64748b', fontSize: 11 },
                splitLine: { show: false },
                axisTick: { show: false },
            },
            {
                type: 'category',
                data: dates,
                gridIndex: 1,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { show: false },
                splitLine: { show: false },
            }
        ],
        yAxis: [
            {
                type: 'value',
                scale: true,
                axisLine: { show: false },
                axisLabel: { color: '#64748b', fontSize: 11 },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
            },
            {
                type: 'value',
                gridIndex: 1,
                axisLine: { show: false },
                axisLabel: { show: false },
                splitLine: { show: false },
                axisPointer: {
                    label: {
                        formatter: function (params) {
                            return Math.round(params.value).toLocaleString() + ' 張';
                        }
                    }
                }
            }
        ],
        dataZoom: [
            {
                type: 'inside',
                xAxisIndex: [0, 1],
                start: 60,
                end: 100,
            },
            {
                type: 'slider',
                xAxisIndex: [0, 1],
                start: 60,
                end: 100,
                height: 20,
                bottom: 5,
                borderColor: 'transparent',
                fillerColor: 'rgba(59, 130, 246, 0.15)',
                handleStyle: { color: '#3b82f6' },
                textStyle: { color: '#64748b' },
            }
        ],
        series
    };

    chart.setOption(option, true);
}

// ============================================================
// 子指標圖表（MACD、RSI、KD、OBV、DMI、W%R）
// ============================================================

function initIndicatorChart(indicators) {
    indicatorData = indicators;

    const chartDom = document.getElementById('indicatorChart');
    ChartManager.init('indicatorChart', chartDom);

    renderIndicatorChart();
    _bindResizeOnce();
}

function renderIndicatorChart() {
    const chart = ChartManager.get('indicatorChart');
    if (!indicatorData || !chart) return;

    const dates = indicatorData.date;
    const active = getActiveSubIndicators();

    const gridCount = active.length;
    if (gridCount === 0) {
        chart.setOption({ series: [], grid: [], xAxis: [], yAxis: [] }, true);
        return;
    }

    const grids = [];
    const xAxes = [];
    const yAxes = [];
    const series = [];
    const gridHeight = Math.max(60, Math.floor(280 / gridCount));

    active.forEach((ind, idx) => {
        const top = idx * (gridHeight + 30) + 20;
        grids.push({
            left: 60, right: 30, top, height: gridHeight
        });
        xAxes.push({
            type: 'category',
            data: dates,
            gridIndex: idx,
            axisLine: { lineStyle: { color: '#334155' } },
            axisLabel: { show: idx === active.length - 1, color: '#64748b', fontSize: 10 },
            axisTick: { show: false },
            splitLine: { show: false },
        });
        yAxes.push({
            type: 'value',
            gridIndex: idx,
            scale: true,
            axisLine: { show: false },
            axisLabel: { color: '#64748b', fontSize: 10 },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
            nameTextStyle: { color: '#94a3b8', fontSize: 11 },
            name: ind.toUpperCase(),
        });

        const addLine = (name, data, color, dash) => {
            series.push({
                name, type: 'line', data, xAxisIndex: idx, yAxisIndex: idx,
                lineStyle: { width: 1.3, color, type: dash || 'solid' },
                symbol: 'none', smooth: false,
            });
        };
        const addBar = (name, data, colors) => {
            series.push({
                name, type: 'bar', data: data.map((v, i) => ({
                    value: v,
                    itemStyle: { color: v >= 0 ? (colors?.[0] || '#ef4444') : (colors?.[1] || '#10b981') }
                })),
                xAxisIndex: idx, yAxisIndex: idx, barWidth: '60%',
            });
        };

        switch (ind) {
            case 'macd':
                addLine('MACD', indicatorData.macd, '#3b82f6');
                addLine('Signal', indicatorData.macd_signal, '#f97316');
                addBar('Histogram', indicatorData.macd_histogram);
                break;
            case 'rsi':
                addLine('RSI', indicatorData.rsi, '#10b981');
                // 超買超賣線
                series.push({
                    name: '超買', type: 'line',
                    data: new Array(dates.length).fill(70),
                    xAxisIndex: idx, yAxisIndex: idx,
                    lineStyle: { width: 1, color: '#ef444455', type: 'dashed' },
                    symbol: 'none',
                });
                series.push({
                    name: '超賣', type: 'line',
                    data: new Array(dates.length).fill(30),
                    xAxisIndex: idx, yAxisIndex: idx,
                    lineStyle: { width: 1, color: '#10b98155', type: 'dashed' },
                    symbol: 'none',
                });
                break;
            case 'kd':
                addLine('K', indicatorData.k, '#8b5cf6');
                addLine('D', indicatorData.d, '#ec4899');
                // 超買超賣線
                series.push({
                    name: 'KD超買', type: 'line',
                    data: new Array(dates.length).fill(80),
                    xAxisIndex: idx, yAxisIndex: idx,
                    lineStyle: { width: 1, color: '#ef444433', type: 'dashed' },
                    symbol: 'none',
                });
                series.push({
                    name: 'KD超賣', type: 'line',
                    data: new Array(dates.length).fill(20),
                    xAxisIndex: idx, yAxisIndex: idx,
                    lineStyle: { width: 1, color: '#10b98133', type: 'dashed' },
                    symbol: 'none',
                });
                break;
            case 'obv':
                addLine('OBV', indicatorData.obv, '#f97316');
                break;
            case 'dmi':
                addLine('ADX', indicatorData.adx, '#eab308');
                addLine('+DI', indicatorData.di_plus, '#10b981');
                addLine('-DI', indicatorData.di_minus, '#ef4444');
                break;
            case 'wr':
                addLine('W%R', indicatorData.williams_r, '#06b6d4');
                series.push({
                    name: 'WR超買', type: 'line',
                    data: new Array(dates.length).fill(-20),
                    xAxisIndex: idx, yAxisIndex: idx,
                    lineStyle: { width: 1, color: '#ef444433', type: 'dashed' },
                    symbol: 'none',
                });
                series.push({
                    name: 'WR超賣', type: 'line',
                    data: new Array(dates.length).fill(-80),
                    xAxisIndex: idx, yAxisIndex: idx,
                    lineStyle: { width: 1, color: '#10b98133', type: 'dashed' },
                    symbol: 'none',
                });
                break;
            case 'bias':
                addLine('BIAS5', indicatorData.bias5, '#eab308');
                addLine('BIAS10', indicatorData.bias10, '#f97316');
                addLine('BIAS20', indicatorData.bias20, '#3b82f6');
                // 零軸
                series.push({
                    name: '零軸', type: 'line',
                    data: new Array(dates.length).fill(0),
                    xAxisIndex: idx, yAxisIndex: idx,
                    lineStyle: { width: 1, color: '#64748b55', type: 'solid' },
                    symbol: 'none',
                });
                break;
            case 'atr':
                addLine('ATR', indicatorData.atr, '#ec4899');
                break;
        }
    });

    // 調整圖表容器高度
    const totalHeight = gridCount * (gridHeight + 30) + 60;
    document.getElementById('indicatorChart').style.height = totalHeight + 'px';
    chart.resize();

    const option = {
        title: {
            subtext: `資料擷取日期: ${dates[dates.length - 1] || '未知'}`,
            right: 15,
            top: 0,
            subtextStyle: { color: '#64748b', fontSize: 11 }
        },
        backgroundColor: 'transparent',
        animation: true,
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: function (params) {
                if (hoveredChart === 'kline') return '';
                if (!params || !params.length) return '';
                const date = params[0].axisValue;
                let html = `<div style="font-weight:600;margin-bottom:6px;">${date}</div>`;
                let hasData = false;
                params.forEach(p => {
                    const name = p.seriesName;
                    if (!name || name === '零軸' || name.includes('超買') || name.includes('超賣')) return;
                    if (p.data != null) {
                        let val = p.data;
                        if (typeof val === 'object' && val.value != null) val = val.value;
                        if (typeof val === 'number') {
                            html += `<div style="color:${p.color}"><span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${p.color};"></span>${name}: <b style="margin-left:8px;color:#f1f5f9">${val.toFixed(2)}</b></div>`;
                            hasData = true;
                        }
                    }
                });
                return hasData ? html : '';
            }
        },
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        grid: grids,
        xAxis: xAxes,
        yAxis: yAxes,
        dataZoom: [{
            type: 'inside',
            xAxisIndex: active.map((_, i) => i),
            start: 60,
            end: 100,
        }],
        series,
    };

    chart.setOption(option, true);
}

// ============================================================
// 工具函式
// ============================================================

function getActiveMainIndicators() {
    const toggles = document.getElementById('indicatorToggles');
    if (!toggles) return ['ma'];
    return Array.from(toggles.querySelectorAll('.indicator-btn.active'))
        .map(btn => btn.dataset.indicator);
}

function getActiveSubIndicators() {
    const toggles = document.getElementById('subIndicatorToggles');
    if (!toggles) return ['macd', 'rsi', 'kd'];
    return Array.from(toggles.querySelectorAll('.indicator-btn.active'))
        .map(btn => btn.dataset.indicator);
}


