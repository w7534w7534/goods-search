/**
 * 基本面圖表模組
 * 股利政策表格、營收趨勢圖、獲利能力圖
 */

let revenueChartInstance = null;
let financialChartInstance = null;

// ============================================================
// 股利政策表格
// ============================================================

function renderDividendTable(data) {
    const container = document.getElementById('dividendTable');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>暫無股利資料</p></div>`;
        return;
    }

    // 整理資料
    const rows = data.map(d => ({
        year: d.date || d.AnnouncementDate || '',
        cashDividend: parseFloat(d.CashEarningsDistribution || d.cash_dividend || 0),
        stockDividend: parseFloat(d.StockEarningsDistribution || d.stock_dividend || 0),
        totalDividend: (parseFloat(d.CashEarningsDistribution || d.cash_dividend || 0)
            + parseFloat(d.StockEarningsDistribution || d.stock_dividend || 0)),
    })).sort((a, b) => b.year.localeCompare(a.year));

    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>年度</th>
                    <th>現金股利</th>
                    <th>股票股利</th>
                    <th>合計</th>
                </tr>
            </thead>
            <tbody>
    `;

    rows.forEach(r => {
        html += `
            <tr>
                <td>${r.year.substring(0, 10)}</td>
                <td>${r.cashDividend.toFixed(2)}</td>
                <td>${r.stockDividend.toFixed(2)}</td>
                <td style="font-weight:600; color:var(--accent-blue)">${r.totalDividend.toFixed(2)}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ============================================================
// 月營收趨勢圖
// ============================================================

function renderRevenueChart(data) {
    const chartDom = document.getElementById('revenueChart');
    if (!chartDom) return;
    if (revenueChartInstance) revenueChartInstance.dispose();
    revenueChartInstance = echarts.init(chartDom);

    if (!data || data.length === 0) {
        chartDom.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>暫無營收資料</p></div>`;
        return;
    }

    // 按日期排序
    const sorted = [...data].sort((a, b) => (a.date || a.revenue_month || '').localeCompare(b.date || b.revenue_month || ''));
    const dates = sorted.map(d => (d.date || d.revenue_month || '').substring(0, 7));
    const revenues = sorted.map(d => parseFloat(d.revenue || 0));

    // 年增率 (YoY)
    const yoy = sorted.map(d => {
        const val = parseFloat(d.revenue_month_yoy || d.YoY || 0);
        return val;
    });

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
                    const val = p.seriesName === '營收' ?
                        formatNumber(p.value) :
                        (p.value != null ? p.value.toFixed(2) + '%' : '—');
                    html += `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${val}</b><br/>`;
                });
                return html;
            }
        },
        legend: {
            data: ['營收', 'YoY%'],
            textStyle: { color: '#94a3b8', fontSize: 11 },
            top: 0,
        },
        grid: { left: 55, right: 50, top: 30, bottom: 25 },
        xAxis: {
            type: 'category',
            data: dates,
            axisLine: { lineStyle: { color: '#334155' } },
            axisLabel: { color: '#64748b', fontSize: 10, rotate: 30 },
            axisTick: { show: false },
        },
        yAxis: [
            {
                type: 'value',
                name: '營收',
                axisLine: { show: false },
                axisLabel: {
                    color: '#64748b', fontSize: 10,
                    formatter: v => {
                        if (v >= 1e8) return (v / 1e8).toFixed(0) + '億';
                        if (v >= 1e4) return (v / 1e4).toFixed(0) + '萬';
                        return v;
                    }
                },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
            },
            {
                type: 'value',
                name: 'YoY%',
                axisLine: { show: false },
                axisLabel: {
                    color: '#64748b', fontSize: 10,
                    formatter: v => v + '%'
                },
                splitLine: { show: false },
            }
        ],
        series: [
            {
                name: '營收',
                type: 'bar',
                data: revenues,
                itemStyle: { color: '#3b82f6', borderRadius: [3, 3, 0, 0] },
                barWidth: '50%',
            },
            {
                name: 'YoY%',
                type: 'line',
                yAxisIndex: 1,
                data: yoy,
                lineStyle: { color: '#f97316', width: 1.5 },
                symbol: 'circle',
                symbolSize: 4,
                itemStyle: { color: '#f97316' },
            }
        ]
    };

    revenueChartInstance.setOption(option);
    window.addEventListener('resize', () => revenueChartInstance?.resize());
}

// ============================================================
// 獲利能力圖（EPS / 毛利率）
// ============================================================

function renderFinancialChart(data) {
    const chartDom = document.getElementById('financialChart');
    if (!chartDom) return;
    if (financialChartInstance) financialChartInstance.dispose();
    financialChartInstance = echarts.init(chartDom);

    if (!data || data.length === 0) {
        chartDom.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>暫無財務報表資料</p></div>`;
        return;
    }

    // FinMind 財報資料格式：每筆有 type + value
    // 嘗試分群：EPS, 毛利率, 營業利益率
    const epsData = {};
    const grossMarginData = {};
    const operatingMarginData = {};

    data.forEach(d => {
        const date = (d.date || '').substring(0, 7);
        const type = d.type || '';
        const value = parseFloat(d.value || 0);

        if (type.includes('EPS') || type.includes('每股盈餘') || type === 'EarningsPerShare') {
            epsData[date] = (epsData[date] || 0) + value;
        } else if (type.includes('毛利率') || type === 'GrossProfit' || type.includes('GrossProfitMargin')) {
            grossMarginData[date] = value;
        } else if (type.includes('營業利益率') || type === 'OperatingIncome' || type.includes('OperatingProfitMargin')) {
            operatingMarginData[date] = value;
        }
    });

    const allDates = [...new Set([
        ...Object.keys(epsData),
        ...Object.keys(grossMarginData),
        ...Object.keys(operatingMarginData)
    ])].sort();

    if (allDates.length === 0) {
        chartDom.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>暫無可顯示的財報資料</p></div>`;
        return;
    }

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
        },
        legend: {
            data: ['EPS', '毛利率', '營業利益率'],
            textStyle: { color: '#94a3b8', fontSize: 11 },
            top: 0,
        },
        grid: { left: 50, right: 50, top: 30, bottom: 25 },
        xAxis: {
            type: 'category',
            data: allDates,
            axisLine: { lineStyle: { color: '#334155' } },
            axisLabel: { color: '#64748b', fontSize: 10, rotate: 30 },
            axisTick: { show: false },
        },
        yAxis: [
            {
                type: 'value',
                name: 'EPS',
                axisLine: { show: false },
                axisLabel: { color: '#64748b', fontSize: 10 },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
            },
            {
                type: 'value',
                name: '%',
                axisLine: { show: false },
                axisLabel: { color: '#64748b', fontSize: 10, formatter: v => v + '%' },
                splitLine: { show: false },
            }
        ],
        series: [
            {
                name: 'EPS',
                type: 'bar',
                data: allDates.map(d => epsData[d] || null),
                itemStyle: {
                    color: function (params) {
                        return params.value >= 0 ? '#3b82f6' : '#ef4444';
                    },
                    borderRadius: [3, 3, 0, 0],
                },
                barWidth: '40%',
            },
            {
                name: '毛利率',
                type: 'line',
                yAxisIndex: 1,
                data: allDates.map(d => grossMarginData[d] || null),
                lineStyle: { color: '#10b981', width: 1.5 },
                symbol: 'circle',
                symbolSize: 4,
                itemStyle: { color: '#10b981' },
            },
            {
                name: '營業利益率',
                type: 'line',
                yAxisIndex: 1,
                data: allDates.map(d => operatingMarginData[d] || null),
                lineStyle: { color: '#f97316', width: 1.5 },
                symbol: 'circle',
                symbolSize: 4,
                itemStyle: { color: '#f97316' },
            }
        ]
    };

    financialChartInstance.setOption(option);
    window.addEventListener('resize', () => financialChartInstance?.resize());
}
