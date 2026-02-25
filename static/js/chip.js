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

function renderInstitutionalTables(instData, consecutive, shareData, priceData) {
    const overviewContainer = document.getElementById('institutionalOverviewTable');
    const dailyContainer = document.getElementById('institutionalDailyTable');
    if (!overviewContainer || !dailyContainer) return;

    if (!instData || instData.length === 0) {
        overviewContainer.innerHTML = `<div class="empty-state"><p>暫無資料</p></div>`;
        dailyContainer.innerHTML = '';
        return;
    }

    // 整理外資持股比例, map by date
    const shareMap = {};
    if (shareData) {
        const sData = Array.isArray(shareData) ? shareData : (shareData.data || []);
        sData.forEach(d => {
            if (d.date) {
                shareMap[d.date] = parseFloat(d.ForeignInvestmentRemainingShares || d.ForeignInvestmentSharesPercent || d.percent || 0);
            }
        });
    }

    // 整理股價與成交量, map by date
    const priceMap = {};
    if (priceData && Array.isArray(priceData)) {
        const sortedPrice = [...priceData].sort((a, b) => a.date.localeCompare(b.date));
        for (let i = 0; i < sortedPrice.length; i++) {
            const current = sortedPrice[i];
            const prev = i > 0 ? sortedPrice[i - 1] : current;
            const close = parseFloat(current.close || 0);
            const prevClose = parseFloat(prev.close || close);
            const changePct = prevClose > 0 ? ((close - prevClose) / prevClose) * 100 : 0;
            const volume = parseFloat(current.Trading_Volume || current.volume || current.TradeVolume || 0);

            priceMap[current.date] = { close, changePct, volume };
        }
    }

    // 整理三大法人買賣資料, map by date
    const dateMap = {};
    instData.forEach(d => {
        if (!dateMap[d.date]) {
            dateMap[d.date] = { '外資': { buy: 0, sell: 0 }, '投信': { buy: 0, sell: 0 }, '自營商': { buy: 0, sell: 0 } };
        }
        const b = d.buy || 0;
        const s = d.sell || 0;
        let n = d.name || '';
        if (n.includes('外資') || n.includes('Foreign')) n = '外資';
        else if (n.includes('投信') || n.includes('Investment_Trust')) n = '投信';
        else if (n.includes('自營商') || n.includes('Dealer')) n = '自營商';

        if (dateMap[d.date][n]) {
            dateMap[d.date][n].buy += b;
            dateMap[d.date][n].sell += s;
        }
    });

    const dates = Object.keys(dateMap).sort((a, b) => b.localeCompare(a)); // 新到舊
    if (dates.length === 0) return;

    const dateStampDom = document.getElementById('overviewDateStamp');
    if (dateStampDom) {
        dateStampDom.textContent = `資料時間：${dates[0].replace(/-/g, '/')}`;
    }

    // 計算連買連賣累計張數
    const consecSum = {};
    if (consecutive) {
        ['外資', '投信', '自營商'].forEach(t => {
            const days = consecutive[t];
            if (!days || days === 0) {
                consecSum[t] = 0;
                return;
            }
            const absDays = Math.abs(days);
            let sum = 0;
            for (let i = 0; i < Math.min(absDays, dates.length); i++) {
                const dNet = (dateMap[dates[i]][t].buy - dateMap[dates[i]][t].sell);
                sum += Math.round(dNet / 1000);
            }
            consecSum[t] = sum;
        });
    }

    // 1. 渲染法人買賣總覽 (取最新一日)
    const latestDate = dates[0];
    const latestData = dateMap[latestDate];
    const types = ['外資', '投信', '自營商'];

    let totalBuy = 0;
    let totalSell = 0;

    const getColor = val => val >= 0 ? 'color:var(--accent-red)' : 'color:var(--accent-green)';

    const getConsecutiveText = (name) => {
        if (!consecutive) return '—';
        const val = consecutive[name];
        const sum = consecSum[name] || 0;
        const sumStr = formatNumber(Math.abs(sum));
        if (val > 0) return `<span style="color:var(--accent-red)">連${val}買 (${sumStr})</span>`;
        if (val < 0) return `<span style="color:var(--accent-green)">連${Math.abs(val)}賣 (${sumStr})</span>`;
        return '—';
    };

    let overviewHtml = `
        <table class="data-table" style="font-feature-settings: 'tnum';">
            <thead>
                <tr>
                    <th style="text-align:left">單位(張)</th>
                    <th style="text-align:right">買進</th>
                    <th style="text-align:right">賣出</th>
                    <th style="text-align:right">買賣超</th>
                    <th style="text-align:right">連買連賣</th>
                </tr>
            </thead>
            <tbody>
    `;

    types.forEach(t => {
        const d = latestData[t];
        const buy = Math.round(d.buy / 1000);
        const sell = Math.round(d.sell / 1000);
        const net = buy - sell;
        totalBuy += buy;
        totalSell += sell;

        overviewHtml += `
            <tr>
                <td style="color:#94a3b8">${t}</td>
                <td style="text-align:right">${formatNumber(buy)}</td>
                <td style="text-align:right">${formatNumber(sell)}</td>
                <td style="text-align:right; ${getColor(net)}">${formatNumber(net)}</td>
                <td style="text-align:right">${getConsecutiveText(t)}</td>
            </tr>
        `;
    });

    const totalNet = totalBuy - totalSell;

    // 計算三大法人的總連買連賣
    let totalNetList = [];
    dates.forEach(date => {
        let dailyNet = 0;
        types.forEach(t => dailyNet += Math.round((dateMap[date][t].buy - dateMap[date][t].sell) / 1000));
        totalNetList.push(dailyNet);
    });

    let totalConsecDays = 0;
    let totalConsecSum = 0;
    const direction = totalNetList[0] > 0 ? 1 : (totalNetList[0] < 0 ? -1 : 0);
    if (direction !== 0) {
        for (let num of totalNetList) {
            if ((direction > 0 && num > 0) || (direction < 0 && num < 0)) {
                totalConsecDays += direction;
                totalConsecSum += num;
            } else {
                break;
            }
        }
    }

    let totalConsecText = '—';
    if (totalConsecDays > 0) totalConsecText = `<span style="color:var(--accent-red)">連${totalConsecDays}買 (${formatNumber(Math.abs(totalConsecSum))})</span>`;
    else if (totalConsecDays < 0) totalConsecText = `<span style="color:var(--accent-green)">連${Math.abs(totalConsecDays)}賣 (${formatNumber(Math.abs(totalConsecSum))})</span>`;

    overviewHtml += `
            <tr style="border-top:1px solid rgba(255,255,255,0.1)">
                <td style="color:#94a3b8; font-weight:600">三大法人</td>
                <td style="text-align:right; font-weight:600">${formatNumber(totalBuy)}</td>
                <td style="text-align:right; font-weight:600">${formatNumber(totalSell)}</td>
                <td style="text-align:right; font-weight:600; ${getColor(totalNet)}">${formatNumber(totalNet)}</td>
                <td style="text-align:right">${totalConsecText}</td>
            </tr>
        </tbody></table>
    `;
    overviewContainer.innerHTML = overviewHtml;

    // 2. 渲染法人逐日買賣超 (取近30日)
    let dailyHtml = `
        <table class="data-table" style="font-feature-settings: 'tnum';">
            <thead>
                <tr>
                    <th style="text-align:left">日期</th>
                    <th style="text-align:right">外資(張)</th>
                    <th style="text-align:right">投信(張)</th>
                    <th style="text-align:right">自營商(張)</th>
                    <th style="text-align:right">合計(張)</th>
                    <th style="text-align:right">外資籌碼</th>
                    <th style="text-align:right">漲跌幅(%)</th>
                    <th style="text-align:right">成交量(張)</th>
                </tr>
            </thead>
            <tbody>
    `;

    dates.slice(0, 30).forEach(date => {
        const data = dateMap[date];
        const fNet = Math.round((data['外資'].buy - data['外資'].sell) / 1000);
        const tNet = Math.round((data['投信'].buy - data['投信'].sell) / 1000);
        const dNet = Math.round((data['自營商'].buy - data['自營商'].sell) / 1000);
        const dailyTotal = fNet + tNet + dNet;

        const priceInfo = priceMap[date] || { changePct: 0, volume: 0 };
        const sharePct = shareMap[date] ? shareMap[date].toFixed(2) + '%' : '—';
        const volStr = priceInfo.volume > 0 ? formatNumber(Math.round(priceInfo.volume / 1000)) : '—';

        let changeColor = '#94a3b8';
        let changeStr = '0.00%';
        if (priceInfo.changePct > 0) {
            changeColor = 'var(--accent-red)';
            changeStr = '▲ ' + priceInfo.changePct.toFixed(2) + '%';
        } else if (priceInfo.changePct < 0) {
            changeColor = 'var(--accent-green)';
            changeStr = '▼ ' + Math.abs(priceInfo.changePct).toFixed(2) + '%';
        }

        dailyHtml += `
            <tr>
                <td style="color:#94a3b8">${date.replace(/-/g, '/')}</td>
                <td style="text-align:right">${formatNumber(fNet)}</td>
                <td style="text-align:right">${formatNumber(tNet)}</td>
                <td style="text-align:right">${formatNumber(dNet)}</td>
                <td style="text-align:right; ${getColor(dailyTotal)}">${formatNumber(dailyTotal)}</td>
                <td style="text-align:right">${sharePct}</td>
                <td style="text-align:right; font-weight:600; color:${changeColor}">${changeStr}</td>
                <td style="text-align:right; color:#64748b">${volStr}</td>
            </tr>
        `;
    });

    dailyHtml += '</tbody></table>';
    dailyContainer.innerHTML = dailyHtml;
}

// ============================================================
// 籌碼集中度 / 替代持股顯示
// ============================================================

let concentrationChartInstance = null;

function renderConcentrationChart(instData, priceData) {
    const chartDom = document.getElementById('concentrationChart');
    if (!chartDom) return;
    if (concentrationChartInstance) concentrationChartInstance.dispose();
    concentrationChartInstance = echarts.init(chartDom);

    if (!instData || instData.length === 0 || !priceData || priceData.length === 0) {
        showEmpty(chartDom, '資料不足以計算籌碼集中度');
        return;
    }

    // 建立日期對照表，計算每天的籌碼集中度 (以三大法人買超佔總成交量比例來模擬短線集中度)
    // 真正的籌碼集中度 = (買進前15大分點 - 賣出前15大分點) / 總成交量，這邊用 (三大法人淨買超 / 總成交量) 做平替
    const volumeMap = {};
    priceData.forEach(p => {
        if (p.date) {
            volumeMap[p.date] = p.Trading_Volume || p.volume || 1;
        }
    });

    const dateMap = {};
    instData.forEach(d => {
        if (!dateMap[d.date]) {
            dateMap[d.date] = 0;
        }
        const net = (d.buy || 0) - (d.sell || 0);
        dateMap[d.date] += net;
    });

    const dates = Object.keys(dateMap).sort();
    const concentrationRates = [];
    const avgRates = [];

    // 計算 5 日移動平均集中度
    const windowSize = 5;
    const history = [];

    dates.forEach(d => {
        const netBuy = dateMap[d];
        const vol = volumeMap[d];
        let rate = 0;
        if (vol && vol > 0) {
            // 三大法人買賣超通常是金額或張數，我們假設它與成交量單位相近或轉化計算比例
            // 若單位差異過大導致比例異常，限制在 -100% 到 +100% 之間
            rate = (netBuy / vol) * 100;
            rate = Math.max(-100, Math.min(100, rate));
        }
        concentrationRates.push(rate.toFixed(2));

        history.push(rate);
        if (history.length > windowSize) {
            history.shift();
        }
        const avg = history.reduce((a, b) => a + b, 0) / history.length;
        avgRates.push(avg.toFixed(2));
    });

    const option = {
        backgroundColor: 'transparent',
        title: {
            text: '模擬短線籌碼集中度 (法人淨買超 / 成交量)',
            left: 'center',
            bottom: 0,
            textStyle: { color: '#94a3b8', fontSize: 10, fontWeight: 400 },
        },
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
            formatter: function (params) {
                let html = `<b>${params[0].axisValue}</b><br/>`;
                params.forEach(p => {
                    html += `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${p.value}%</b><br/>`;
                });
                return html;
            }
        },
        legend: {
            data: ['單日集中度', '5日集中度'],
            textStyle: { color: '#94a3b8', fontSize: 11 },
            top: 0,
        },
        grid: { left: 45, right: 15, top: 30, bottom: 25 },
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
            axisLine: { show: false },
            axisLabel: {
                color: '#64748b', fontSize: 10,
                formatter: '{value}%'
            },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        },
        dataZoom: [
            {
                type: 'inside',
                start: 60,
                end: 100,
            },
            {
                type: 'slider',
                start: 60,
                end: 100,
                height: 20,
                bottom: 0,
                borderColor: 'transparent',
                fillerColor: 'rgba(59, 130, 246, 0.15)',
                handleStyle: { color: '#3b82f6' },
                textStyle: { color: '#64748b' },
            }
        ],
        series: [
            {
                name: '單日集中度',
                type: 'bar',
                data: concentrationRates,
                itemStyle: {
                    color: function (params) {
                        return params.value >= 0 ? '#ef4444' : '#10b981';
                    }
                },
                barWidth: '50%',
            },
            {
                name: '5日集中度',
                type: 'line',
                data: avgRates,
                lineStyle: { color: '#f59e0b', width: 2 },
                symbol: 'none',
                smooth: true,
            }
        ]
    };

    concentrationChartInstance.setOption(option);
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
        dataZoom: [
            {
                type: 'inside',
                start: 60,
                end: 100,
            },
            {
                type: 'slider',
                start: 60,
                end: 100,
                height: 20,
                bottom: 0,
                borderColor: 'transparent',
                fillerColor: 'rgba(59, 130, 246, 0.15)',
                handleStyle: { color: '#3b82f6' },
                textStyle: { color: '#64748b' },
            }
        ],
        series: [
            {
                name: '融資餘額',
                type: 'line',
                data: marginBuy,
                lineStyle: { color: '#ef4444', width: 2 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(239, 68, 68, 0.3)' },
                        { offset: 1, color: 'rgba(239, 68, 68, 0.05)' }
                    ])
                },
                symbol: 'none',
                smooth: true,
            },
            {
                name: '融券餘額',
                type: 'line',
                data: shortSell,
                lineStyle: { color: '#10b981', width: 2 },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
                        { offset: 1, color: 'rgba(16, 185, 129, 0.05)' }
                    ])
                },
                symbol: 'none',
                smooth: true,
            },
            {
                name: '券資比',
                type: 'line',
                yAxisIndex: 1,
                data: shortMarginRatio,
                lineStyle: { color: '#f97316', width: 2, type: 'dashed' },
                symbol: 'circle',
                symbolSize: 4,
                smooth: true,
            }
        ]
    };

    marginChartInstance.setOption(option);
}



// ============================================================
// 大戶籌碼表格
// ============================================================

function renderHoldersChart(data) {
    const chartDom = document.getElementById('holdersChart');
    if (!chartDom) return;
    if (holdersChartInstance) holdersChartInstance.dispose();
    holdersChartInstance = echarts.init(chartDom);

    if (!data || data.length === 0) {
        showEmpty(chartDom, '暫無大戶籌碼歷史資料');
        return;
    }

    // 資料由近到遠，需反轉為由遠到近繪製
    const reversedData = [...data].reverse();
    const dates = reversedData.map(d => d.date.substring(5)); // M-D
    const majorRatios = reversedData.map(d => d.major_ratio || 0);
    const retailRatios = reversedData.map(d => d.retail_ratio || 0);
    const prices = reversedData.map(d => d.price || 0);

    const option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            borderColor: 'rgba(255,255,255,0.08)',
            textStyle: { color: '#f1f5f9', fontSize: 12 },
        },
        legend: {
            data: ['千張大戶持股', '散戶持股', '股價'],
            textStyle: { color: '#94a3b8', fontSize: 11 },
            top: 0
        },
        grid: { left: 45, right: 45, top: 30, bottom: 25 },
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
                name: '持股比例(%)',
                position: 'left',
                axisLine: { show: false },
                axisLabel: { color: '#64748b', fontSize: 10, formatter: '{value}%' },
                splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
                scale: true
            },
            {
                type: 'value',
                name: '股價',
                position: 'right',
                axisLine: { show: false },
                axisLabel: { color: '#64748b', fontSize: 10 },
                splitLine: { show: false },
                scale: true
            }
        ],
        dataZoom: [
            {
                type: 'inside',
                start: 60,
                end: 100,
            },
            {
                type: 'slider',
                start: 60,
                end: 100,
                height: 20,
                bottom: 0,
                borderColor: 'transparent',
                fillerColor: 'rgba(59, 130, 246, 0.15)',
                handleStyle: { color: '#3b82f6' },
                textStyle: { color: '#64748b' },
            }
        ],
        series: [
            {
                name: '千張大戶持股',
                type: 'bar',
                data: majorRatios,
                itemStyle: { color: '#3b82f6', borderRadius: [2, 2, 0, 0] },
                barWidth: '35%'
            },
            {
                name: '散戶持股',
                type: 'bar',
                data: retailRatios,
                itemStyle: { color: '#f59e0b', borderRadius: [2, 2, 0, 0] },
                barWidth: '35%'
            },
            {
                name: '股價',
                type: 'line',
                yAxisIndex: 1,
                data: prices,
                lineStyle: { color: '#ef4444', width: 2 },
                symbol: 'circle',
                symbolSize: 4,
                smooth: true
            }
        ]
    };

    holdersChartInstance.setOption(option);
}

function renderHoldersTable(data) {
    const container = document.getElementById('majorHoldersTable');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>暫無大戶籌碼資料</p></div>`;
        return;
    }

    let html = `
        <table class="data-table" style="font-feature-settings: 'tnum';">
            <thead>
                <tr>
                    <th style="border-right:1px solid rgba(255,255,255,0.05)">日期</th>
                    <th style="text-align:right">外資持股</th>
                    <th style="text-align:right">千張大戶持股</th>
                    <th style="text-align:right">董監及大戶</th>
                    <th style="text-align:right">散戶持股</th>
                    <th style="text-align:right; border-left:1px solid rgba(255,255,255,0.05)">收盤價</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(r => {
        const dateStr = r.date ? r.date.replace(/-/g, '/') : '—';
        const foreignStr = r.foreign_ratio ? r.foreign_ratio.toFixed(2) + '%' : '—';
        const majorStr = r.major_ratio ? r.major_ratio.toFixed(2) + '%' : '—';
        const dirStr = r.director_ratio ? r.director_ratio.toFixed(2) + '%' : '—';
        const retailStr = r.retail_ratio ? r.retail_ratio.toFixed(2) + '%' : '—';
        const priceStr = r.price ? r.price.toFixed(1) : '—';

        html += `
            <tr>
                <td style="color:#94a3b8; border-right:1px solid rgba(255,255,255,0.02)">${dateStr}</td>
                <td style="text-align:right; font-weight:500; color:#32c5ff">${foreignStr}</td>
                <td style="text-align:right; color:#3b82f6">${majorStr}</td>
                <td style="text-align:right">${dirStr}</td>
                <td style="text-align:right; color:#f59e0b">${retailStr}</td>
                <td style="text-align:right; font-weight:600; color:#64748b; border-left:1px solid rgba(255,255,255,0.02)">${priceStr}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ============================================================
// 工具
// ============================================================

function showEmpty(dom, msg) {
    dom.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>${msg}</p></div>`;
}
