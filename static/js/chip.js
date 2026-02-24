/**
 * 籌碼面圖表模組
 * 三大法人買賣超（含連買天數）、大戶持股、融資融券（含券資比）、外資持股趨勢
 */

// ============================================================
// 三大法人買賣超圖表（含連買天數標示）
// ============================================================

let institutionalChartInstance = null;
let holdersChartInstance = null;
let marginChartInstance = null;
let shareholdingChartInstance = null;

function renderInstitutionalChart(data, consecutive) {
    const chartDom = document.getElementById('institutionalChart');
    if (!chartDom) return;
    if (institutionalChartInstance) institutionalChartInstance.dispose();
    institutionalChartInstance = echarts.init(chartDom);

    consecutive = consecutive || {};

    if (!data || data.length === 0) {
        showEmpty(chartDom, '暫無三大法人資料');
        return;
    }

    // 整理數據：按日期分組，合併各法人
    const dateMap = {};
    data.forEach(d => {
        if (!dateMap[d.date]) {
            dateMap[d.date] = { 外資: 0, 投信: 0, 自營商: 0 };
        }
        const buyOrSell = (d.buy || 0) - (d.sell || 0);
        const n = d.name || '';
        if (n.includes('外資') || n.includes('Foreign')) {
            dateMap[d.date]['外資'] += buyOrSell;
        } else if (n.includes('投信') || n.includes('Investment_Trust')) {
            dateMap[d.date]['投信'] += buyOrSell;
        } else if (n.includes('自營商') || n.includes('Dealer')) {
            dateMap[d.date]['自營商'] += buyOrSell;
        }
    });

    const dates = Object.keys(dateMap).sort();
    const foreign = dates.map(d => dateMap[d]['外資']);
    const trust = dates.map(d => dateMap[d]['投信']);
    const dealer = dates.map(d => dateMap[d]['自營商']);

    // 連買天數文字
    const consecText = Object.entries(consecutive).map(([name, val]) => {
        if (val > 0) return `${name} 連買 ${val} 天`;
        if (val < 0) return `${name} 連賣 ${Math.abs(val)} 天`;
        return `${name} 中立`;
    }).join('　');

    const option = {
        backgroundColor: 'transparent',
        title: consecText ? {
            text: `📊 ${consecText}`,
            left: 'center',
            bottom: 0,
            textStyle: { color: '#94a3b8', fontSize: 11, fontWeight: 400 },
        } : undefined,
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: function (params) {
                let html = `<b>${params[0].axisValue}</b><br/>`;
                params.forEach(p => {
                    const val = p.value;
                    const color = val >= 0 ? '#ef4444' : '#10b981';
                    html += `<span style="color:${p.color}">●</span> ${p.seriesName}: <b style="color:${color}">${formatNumber(val)}</b><br/>`;
                });
                return html;
            }
        },
        legend: {
            data: ['外資', '投信', '自營商'],
            textStyle: { color: '#94a3b8', fontSize: 11 },
            top: 0,
        },
        grid: { left: 55, right: 15, top: 30, bottom: consecText ? 35 : 25 },
        xAxis: {
            type: 'category',
            data: dates,
            axisLine: { lineStyle: { color: '#334155' } },
            axisLabel: {
                color: '#64748b', fontSize: 10, rotate: 0,
                formatter: v => v.substring(5)
            },
            axisTick: { show: false },
        },
        yAxis: {
            type: 'value',
            axisLine: { show: false },
            axisLabel: {
                color: '#64748b', fontSize: 10,
                formatter: v => {
                    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(0) + 'M';
                    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'K';
                    return v;
                }
            },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        },
        dataZoom: [{
            type: 'inside',
            start: 70,
            end: 100,
        }],
        series: [
            {
                name: '外資',
                type: 'bar',
                stack: 'total',
                data: foreign,
                itemStyle: { color: '#3b82f6' },
                barWidth: '50%',
            },
            {
                name: '投信',
                type: 'bar',
                stack: 'total',
                data: trust,
                itemStyle: { color: '#8b5cf6' },
            },
            {
                name: '自營商',
                type: 'bar',
                stack: 'total',
                data: dealer,
                itemStyle: { color: '#06b6d4' },
            }
        ]
    };

    institutionalChartInstance.setOption(option);
}

// ============================================================
// 大戶持股分佈圖
// ============================================================

function renderHoldersChart(data) {
    const chartDom = document.getElementById('holdersChart');
    if (!chartDom) return;
    if (holdersChartInstance) holdersChartInstance.dispose();
    holdersChartInstance = echarts.init(chartDom);

    if (!data || data.length === 0) {
        showEmpty(chartDom, '暫無大戶持股資料');
        return;
    }

    // 取最新一期的資料
    const dates = [...new Set(data.map(d => d.date))].sort();
    const latest = dates[dates.length - 1];
    const latestData = data.filter(d => d.date === latest);

    // 分組：散戶 (<100張), 中實戶 (100~1000張), 大戶 (>1000張)
    let retail = 0, mid = 0, big = 0, total = 0;
    latestData.forEach(d => {
        const shares = parseFloat(d.HoldingSharesLevel || d.percent || 0);
        const pct = parseFloat(d.percent || 0);
        const level = d.HoldingSharesLevel || '';

        // 根據持股分級名稱分類
        if (level.includes('1,000') || level.includes('5,000') || level.includes('10,000') || level.includes('以上')) {
            big += pct;
        } else if (level.includes('200') || level.includes('400') || level.includes('600') || level.includes('800')) {
            mid += pct;
        } else {
            retail += pct;
        }
    });

    // 如果找不到百分比，使用簡單圓餅
    if (big === 0 && mid === 0 && retail === 0) {
        const half = latestData.length / 2;
        latestData.forEach((d, i) => {
            const pct = parseFloat(d.percent || d.unit || 1);
            if (i < latestData.length * 0.3) retail += pct;
            else if (i < latestData.length * 0.7) mid += pct;
            else big += pct;
        });
    }

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9' },
            formatter: '{b}: {d}%'
        },
        legend: {
            orient: 'vertical',
            right: 10,
            top: 'center',
            textStyle: { color: '#94a3b8', fontSize: 12 },
        },
        series: [{
            name: '持股分佈',
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['35%', '50%'],
            avoidLabelOverlap: true,
            itemStyle: {
                borderRadius: 6,
                borderColor: 'rgba(17, 24, 39, 0.8)',
                borderWidth: 2,
            },
            label: {
                show: true,
                position: 'inside',
                formatter: '{d}%',
                fontSize: 11,
                color: '#fff',
            },
            data: [
                { value: retail, name: '散戶', itemStyle: { color: '#3b82f6' } },
                { value: mid, name: '中實戶', itemStyle: { color: '#8b5cf6' } },
                { value: big, name: '大戶', itemStyle: { color: '#ef4444' } },
            ]
        }]
    };

    holdersChartInstance.setOption(option);
}

// ============================================================
// 融資融券圖表（含券資比折線）
// ============================================================

function renderMarginChart(data) {
    const chartDom = document.getElementById('marginChart');
    if (!chartDom) return;
    if (marginChartInstance) marginChartInstance.dispose();
    marginChartInstance = echarts.init(chartDom);

    if (!data || data.length === 0) {
        showEmpty(chartDom, '暫無融資融券資料');
        return;
    }

    const dates = data.map(d => d.date);
    const marginBuy = data.map(d => d.MarginPurchaseTodayBalance || d.MarginPurchaseBalance || 0);
    const shortSell = data.map(d => d.ShortSaleTodayBalance || d.ShortSaleBalance || 0);
    const shortMarginRatio = data.map(d => d.short_margin_ratio || 0);

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: function (params) {
                let html = `<b>${params[0].axisValue}</b><br/>`;
                params.forEach(p => {
                    const val = p.seriesName === '券資比' ?
                        (p.value != null ? p.value.toFixed(2) + '%' : '—') :
                        formatNumber(p.value);
                    html += `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${val}</b><br/>`;
                });
                return html;
            }
        },
        legend: {
            data: ['融資餘額', '融券餘額', '券資比'],
            textStyle: { color: '#94a3b8', fontSize: 11 },
            top: 0,
        },
        grid: { left: 55, right: 50, top: 30, bottom: 25 },
        xAxis: {
            type: 'category',
            data: dates,
            axisLine: { lineStyle: { color: '#334155' } },
            axisLabel: {
                color: '#64748b', fontSize: 10,
                formatter: v => v.substring(5)
            },
            axisTick: { show: false },
        },
        yAxis: [
            {
                type: 'value',
                name: '融資',
                axisLine: { show: false },
                axisLabel: {
                    color: '#64748b', fontSize: 10,
                    formatter: v => (v / 1e3).toFixed(0) + 'K'
                },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
            },
            {
                type: 'value',
                name: '券資比%',
                axisLine: { show: false },
                axisLabel: {
                    color: '#64748b', fontSize: 10,
                    formatter: v => v + '%'
                },
                splitLine: { show: false },
            }
        ],
        dataZoom: [{
            type: 'inside',
            start: 60,
            end: 100,
        }],
        series: [
            {
                name: '融資餘額',
                type: 'line',
                data: marginBuy,
                lineStyle: { color: '#ef4444', width: 1.5 },
                areaStyle: { color: 'rgba(239, 68, 68, 0.08)' },
                symbol: 'none',
                smooth: true,
            },
            {
                name: '融券餘額',
                type: 'line',
                data: shortSell,
                lineStyle: { color: '#10b981', width: 1.5 },
                areaStyle: { color: 'rgba(16, 185, 129, 0.08)' },
                symbol: 'none',
                smooth: true,
            },
            {
                name: '券資比',
                type: 'line',
                yAxisIndex: 1,
                data: shortMarginRatio,
                lineStyle: { color: '#f97316', width: 1.5, type: 'dashed' },
                symbol: 'none',
                smooth: true,
            }
        ]
    };

    marginChartInstance.setOption(option);
}

// ============================================================
// 外資持股趨勢圖
// ============================================================

function renderShareholdingChart(data) {
    const chartDom = document.getElementById('shareholdingChart');
    if (!chartDom) return;
    if (shareholdingChartInstance) shareholdingChartInstance.dispose();
    shareholdingChartInstance = echarts.init(chartDom);

    if (!data || data.length === 0) {
        showEmpty(chartDom, '暫無外資持股資料');
        return;
    }

    const sorted = [...data].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const dates = sorted.map(d => d.date);
    const shares = sorted.map(d => parseFloat(d.ForeignInvestmentShares || d.foreign_investment_shares || 0));
    const pct = sorted.map(d => parseFloat(d.ForeignInvestmentRemainingShares || d.ForeignInvestmentSharesPercent || d.percent || 0));

    // 判斷使用哪個數據（有比例用比例，沒有用持股張數）
    const hasPercent = pct.some(v => v > 0);

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
        },
        legend: {
            data: hasPercent ? ['外資持股比例'] : ['外資持股張數'],
            textStyle: { color: '#94a3b8', fontSize: 11 },
            top: 0,
        },
        grid: { left: 55, right: 15, top: 30, bottom: 25 },
        xAxis: {
            type: 'category',
            data: dates,
            axisLine: { lineStyle: { color: '#334155' } },
            axisLabel: {
                color: '#64748b', fontSize: 10,
                formatter: v => v.substring(5)
            },
            axisTick: { show: false },
        },
        yAxis: {
            type: 'value',
            name: hasPercent ? '%' : '張',
            axisLine: { show: false },
            axisLabel: {
                color: '#64748b', fontSize: 10,
                formatter: v => hasPercent ? v.toFixed(1) + '%' : formatNumber(v)
            },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        },
        dataZoom: [{
            type: 'inside',
            start: 60,
            end: 100,
        }],
        series: [{
            name: hasPercent ? '外資持股比例' : '外資持股張數',
            type: 'line',
            data: hasPercent ? pct : shares,
            lineStyle: { color: '#3b82f6', width: 2 },
            areaStyle: {
                color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
                        { offset: 1, color: 'rgba(59, 130, 246, 0.02)' },
                    ],
                },
            },
            symbol: 'none',
            smooth: true,
        }]
    };

    shareholdingChartInstance.setOption(option);
}

// ============================================================
// 工具
// ============================================================

function showEmpty(dom, msg) {
    dom.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>${msg}</p></div>`;
}
