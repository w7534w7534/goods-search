code = """
// ============================================================
// 杜邦分析矩陣 (Dupont Analysis)
// ============================================================
let dupontChartInstance = null;

function renderDupontAnalysis(finData, bsData) {
    const chartDom = document.getElementById('dupontChart');
    const tableDom = document.getElementById('dupontTable');
    if (!chartDom || !tableDom) return;

    if (dupontChartInstance) dupontChartInstance.dispose();
    dupontChartInstance = echarts.init(chartDom);

    if (!finData || finData.length === 0 || !bsData || bsData.length === 0) {
        chartDom.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>資料不足以進行杜邦分析</p></div>`;
        tableDom.innerHTML = '';
        return;
    }

    const dateSet = new Set();
    finData.forEach(d => dateSet.add((d.date || '').substring(0, 7)));
    bsData.forEach(d => dateSet.add((d.date || '').substring(0, 7)));
    
    const allDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
    
    if (allDates.length === 0) {
        chartDom.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>資料不足以進行杜邦分析</p></div>`;
        tableDom.innerHTML = '';
        return;
    }

    const getValue = (dataList, datePrefix, typeName) => {
        const item = dataList.find(d => (d.date || '').startsWith(datePrefix) && d.type === typeName);
        return item ? parseFloat(item.value || 0) : null;
    };

    const dupontList = [];

    allDates.forEach(dPrefix => {
        const rev = getValue(finData, dPrefix, 'Revenue');
        const net = getValue(finData, dPrefix, 'IncomeAfterTaxes');
        const objAssets = getValue(bsData, dPrefix, 'TotalAssets');
        const eq = getValue(bsData, dPrefix, 'Equity') || getValue(bsData, dPrefix, 'EquityAttributableToOwnersOfParent');

        let netMargin = null;
        let assetTurnover = null;
        let equityMultiplier = null;
        let roe = null;

        if (rev && net) netMargin = (net / rev) * 100;
        if (rev && objAssets) assetTurnover = rev / objAssets;
        if (objAssets && eq) equityMultiplier = objAssets / eq;
        if (net && eq) roe = (net / eq) * 100;

        if (roe !== null) {
            const [y, m] = dPrefix.split('-');
            let q = '';
            if (m === '03') q = 'Q1';
            else if (m === '06') q = 'Q2';
            else if (m === '09') q = 'Q3';
            else if (m === '12') q = 'Q4';

            dupontList.push({
                datePrefix: dPrefix,
                periodLabel: q ? `${y} ${q}` : dPrefix,
                netMargin,
                assetTurnover,
                equityMultiplier,
                roe
            });
        }
    });

    const ascList = [...dupontList].reverse();
    const dates = ascList.map(item => item.periodLabel);
    const roeData = ascList.map(item => (item.roe !== null ? item.roe.toFixed(2) : '-'));
    const netMarginData = ascList.map(item => (item.netMargin !== null ? item.netMargin.toFixed(2) : '-'));
    const assetTurnoverData = ascList.map(item => (item.assetTurnover !== null ? item.assetTurnover.toFixed(2) : '-'));
    const equityMultiplierData = ascList.map(item => (item.equityMultiplier !== null ? item.equityMultiplier.toFixed(2) : '-'));

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            axisPointer: { type: 'cross' }
        },
        legend: {
            data: ['ROE(%)', '淨利率(%)', '總資產周轉率(次)', '權益乘數(倍)'],
            textStyle: { color: '#94a3b8', fontSize: 11 },
            top: 0
        },
        grid: { left: 45, right: 45, top: 35, bottom: 25 },
        xAxis: {
            type: 'category',
            data: dates,
            axisLine: { lineStyle: { color: '#334155' } },
            axisLabel: { color: '#64748b', fontSize: 10 },
            axisTick: { show: false }
        },
        yAxis: [
            {
                type: 'value',
                name: '百分比(%)',
                position: 'left',
                axisLine: { show: false },
                axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}%' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
            },
            {
                type: 'value',
                name: '倍/次',
                position: 'right',
                axisLine: { show: false },
                axisLabel: { color: '#64748b', fontSize: 10 },
                splitLine: { show: false },
            }
        ],
        dataZoom: [
            { type: 'inside', start: 30, end: 100 },
            { 
                type: 'slider', 
                start: 30, end: 100, 
                height: 20, bottom: 0, 
                borderColor: 'transparent', 
                fillerColor: 'rgba(59, 130, 246, 0.15)',
                handleStyle: { color: '#3b82f6' },
                textStyle: { color: '#64748b' }
            }
        ],
        series: [
            {
                name: 'ROE(%)',
                type: 'line',
                data: roeData,
                lineStyle: { color: '#3b82f6', width: 3 },
                symbol: 'circle',
                symbolSize: 6,
                yAxisIndex: 0
            },
            {
                name: '淨利率(%)',
                type: 'bar',
                data: netMarginData,
                itemStyle: { color: '#10b981', borderRadius: [2, 2, 0, 0] },
                barWidth: '25%',
                yAxisIndex: 0
            },
            {
                name: '總資產周轉率(次)',
                type: 'line',
                data: assetTurnoverData,
                lineStyle: { color: '#f59e0b', width: 2, type: 'dashed' },
                symbol: 'rect',
                symbolSize: 6,
                yAxisIndex: 1
            },
            {
                name: '權益乘數(倍)',
                type: 'line',
                data: equityMultiplierData,
                lineStyle: { color: '#ec4899', width: 2, type: 'dotted' },
                symbol: 'triangle',
                symbolSize: 6,
                yAxisIndex: 1
            }
        ]
    };
    dupontChartInstance.setOption(option);

    let tableHtml = `
        <table class="data-table" style="font-feature-settings: 'tnum';">
            <thead>
                <tr>
                    <th style="border-right:1px solid rgba(255,255,255,0.05)">年度/季別</th>
                    <th style="text-align:right">ROE(%)</th>
                    <th style="text-align:right">稅後淨利率(%)</th>
                    <th style="text-align:right">總資產周轉率(次)</th>
                    <th style="text-align:right">權益乘數(倍)</th>
                </tr>
            </thead>
            <tbody>
    `;

    dupontList.forEach(r => {
        const roeStr = r.roe !== null ? r.roe.toFixed(2) + '%' : '—';
        const marginStr = r.netMargin !== null ? r.netMargin.toFixed(2) + '%' : '—';
        const turnStr = r.assetTurnover !== null ? r.assetTurnover.toFixed(2) : '—';
        const multStr = r.equityMultiplier !== null ? r.equityMultiplier.toFixed(2) : '—';

        tableHtml += `
            <tr>
                <td style="color:#94a3b8; border-right:1px solid rgba(255,255,255,0.02)">${r.periodLabel}</td>
                <td style="text-align:right; font-weight:600; color:#3b82f6">${roeStr}</td>
                <td style="text-align:right; color:#10b981">${marginStr}</td>
                <td style="text-align:right; color:#f59e0b">${turnStr}</td>
                <td style="text-align:right; color:#ec4899">${multStr}</td>
            </tr>
        `;
    });

    tableHtml += '</tbody></table>';
    tableDom.innerHTML = tableHtml;
}
"""
with open("f:/STO/goods-search/static/js/fundamental.js", "a", encoding="utf-8") as f:
    f.write("\n" + code)
