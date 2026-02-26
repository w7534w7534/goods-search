/**
 * 基本面圖表模組
 * 股利政策表格（含配息率）、營收趨勢圖、獲利能力圖、ROE/ROA 圖
 */

// 相關圖表實例由 common.js 中的 ChartManager 統一管理

// ============================================================
// 股利政策表格（含配息率）
// ============================================================

function renderEpsTable(finData, priceData, adjData) {
    const container = document.getElementById('epsTable');
    if (!container) return;

    if (!finData || finData.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>暫無 EPS 資料</p></div>`;
        return;
    }

    // 整理除權息資料 (用於還原股價)
    const adjs = Array.isArray(adjData) ? adjData : (adjData?.data || []);
    adjs.sort((a, b) => b.date.localeCompare(a.date)); // 新到舊

    // 取出各季 EPS 數值
    const epsList = [];
    finData.forEach(d => {
        const t = d.type || d.item || '';
        if (t === 'EPS' || t === 'EarningsPerShare' || t.includes('每股盈餘')) {
            const dateStr = d.date || '';
            const year = dateStr.substring(0, 4);
            const month = dateStr.substring(5, 7);

            let quarter = '';
            // FinMind 的 date 通常是季度末：03-31 (Q1), 06-30 (Q2), 09-30 (Q3), 12-31 (Q4)
            if (month === '03') quarter = 'Q1';
            else if (month === '06') quarter = 'Q2';
            else if (month === '09') quarter = 'Q3';
            else if (month === '12') quarter = 'Q4';

            if (year && quarter) {
                // 檢查是否重複 (API 有時會回傳重複資料)
                const label = `${year} ${quarter}`;
                if (!epsList.find(x => x.periodLabel === label)) {
                    epsList.push({
                        date: dateStr,
                        year: year,
                        quarter: quarter,
                        periodLabel: label,
                        value: parseFloat(d.value || 0),
                    });
                }
            }
        }
    });

    if (epsList.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>無法解析 EPS 資料格式</p></div>`;
        return;
    }

    // 依時間排序 (舊到新，方便計算)
    epsList.sort((a, b) => a.date.localeCompare(b.date));

    // 計算季增與年增
    for (let i = 0; i < epsList.length; i++) {
        const current = epsList[i];

        // 尋找上一季
        let prevQ = '';
        let prevY = current.year;
        if (current.quarter === 'Q1') { prevQ = 'Q4'; prevY = String(parseInt(current.year) - 1); }
        else if (current.quarter === 'Q2') prevQ = 'Q1';
        else if (current.quarter === 'Q3') prevQ = 'Q2';
        else if (current.quarter === 'Q4') prevQ = 'Q3';

        const prevPeriodLabel = `${prevY} ${prevQ}`;
        const prevItem = epsList.find(x => x.periodLabel === prevPeriodLabel);

        if (prevItem && prevItem.value !== 0) {
            current.qoq = ((current.value - prevItem.value) / Math.abs(prevItem.value)) * 100;
        } else {
            current.qoq = null;
        }

        // 尋找去年同季
        const lastY = String(parseInt(current.year) - 1);
        const lastYearPeriodLabel = `${lastY} ${current.quarter}`;
        const lastYearItem = epsList.find(x => x.periodLabel === lastYearPeriodLabel);

        if (lastYearItem && lastYearItem.value !== 0) {
            current.yoy = ((current.value - lastYearItem.value) / Math.abs(lastYearItem.value)) * 100;
        } else {
            current.yoy = null;
        }

        // 季均價計算 (若有 priceData)
        current.avgPrice = null;
        if (priceData && (priceData.length > 0 || priceData.data?.length > 0)) {
            // 季均價計算 (正確對應季度月份：Q1:1-3, Q2:4-6, Q3:7-9, Q4:10-12)
            let startM = '', endM = '';
            if (current.quarter === 'Q1') { startM = '01'; endM = '03'; }
            else if (current.quarter === 'Q2') { startM = '04'; endM = '06'; }
            else if (current.quarter === 'Q3') { startM = '07'; endM = '09'; }
            else if (current.quarter === 'Q4') { startM = '10'; endM = '12'; }

            const startPrefix = `${current.year}-${startM}`;
            const endPrefix = `${current.year}-${endM}`;

            let totalValue = 0;  // 總成交金額 (價 * 量)
            let totalVolume = 0; // 總成交量
            const pData = Array.isArray(priceData) ? priceData : (priceData.data || []);

            pData.forEach(p => {
                const pDate = p.date || '';
                const pd = pDate.substring(0, 7);
                if (pd >= startPrefix && pd <= endPrefix) {
                    let close = parseFloat(p.close || 0);
                    // 根據 FinMind API，成交量欄位通常是 Trading_Volume
                    let volume = parseFloat(p.Trading_Volume || 0);

                    if (close > 0 && volume > 0) {
                        totalValue += (close * volume);
                        totalVolume += volume;
                    }
                }
            });

            if (totalVolume > 0) {
                current.avgPrice = totalValue / totalVolume;
            }
        }
    }

    // 依時間排序 (新到舊，用於顯示)
    epsList.sort((a, b) => b.date.localeCompare(a.date));

    let html = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>年度/季別</th>
                    <th>每股盈餘</th>
                    <th>季增率%</th>
                    <th>年增率%</th>
                    <th>季均價</th>
                </tr>
            </thead>
            <tbody>
    `;

    epsList.forEach(r => {
        const qoqStr = r.qoq !== null ? r.qoq.toFixed(1) + '%' : '—';
        const yoyStr = r.yoy !== null ? r.yoy.toFixed(1) + '%' : '—';
        const priceStr = r.avgPrice !== null ? r.avgPrice.toFixed(2) : '—';

        const epsClass = r.value > 0 ? '' : 'style="color:var(--accent-red)"';
        const qoqClass = r.qoq !== null && r.qoq >= 0 ? 'color:var(--accent-red)' : (r.qoq !== null && r.qoq < 0 ? 'color:var(--accent-green)' : '');
        const yoyClass = r.yoy !== null && r.yoy >= 0 ? 'color:var(--accent-red)' : (r.yoy !== null && r.yoy < 0 ? 'color:var(--accent-green)' : '');

        html += `
            <tr>
                <td style="color:#94a3b8">${r.periodLabel}</td>
                <td ${epsClass}>${r.value.toFixed(1)}</td>
                <td style="${qoqClass}">${qoqStr}</td>
                <td style="${yoyClass}">${yoyStr}</td>
                <td style="font-weight:600; color:#64748b">${priceStr}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ============================================================
// 月營收趨勢圖
// ============================================================

function renderRevenueTable(data) {
    const container = document.getElementById('revenueTable');
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>暫無營收資料</p></div>`;
        return;
    }

    // 建立營收字典，方便跨月/跨年計算
    const revMap = {};
    data.forEach(d => {
        let y = d.revenue_year;
        let m = d.revenue_month;

        // 若缺少 revenue_year，嘗試從 date 取得
        if (!y && d.date) {
            y = parseInt(d.date.substring(0, 4));
            m = parseInt(d.date.substring(5, 7));
        }

        if (y && m) {
            revMap[`${y}-${m}`] = parseFloat(d.revenue || 0);
        }
    });

    const rows = [];
    data.forEach(d => {
        let y = d.revenue_year;
        let m = d.revenue_month;
        if (!y && d.date) {
            y = parseInt(d.date.substring(0, 4));
            m = parseInt(d.date.substring(5, 7));
        }

        if (!y || !m) return;
        const key = `${y}-${m}`;
        const rev = revMap[key];

        // 計算上月
        let prevY = y;
        let prevM = m - 1;
        if (prevM === 0) { prevM = 12; prevY = y - 1; }
        const prevRev = revMap[`${prevY}-${prevM}`];

        // 計算去年同月
        const lastYearRev = revMap[`${y - 1}-${m}`];

        // 計算累計營收 (當年 1 月加總至本月)
        let cumulative = 0;
        let hasCumulative = false;
        for (let i = 1; i <= m; i++) {
            if (revMap[`${y}-${i}`] !== undefined) {
                cumulative += revMap[`${y}-${i}`];
                hasCumulative = true;
            }
        }
        if (!hasCumulative) cumulative = null;

        let lastYearCumulative = 0;
        let hasLastYearCumulative = false;
        for (let i = 1; i <= m; i++) {
            if (revMap[`${y - 1}-${i}`] !== undefined) {
                lastYearCumulative += revMap[`${y - 1}-${i}`];
                hasLastYearCumulative = true;
            }
        }
        if (!hasLastYearCumulative) lastYearCumulative = null;

        const mom = prevRev > 0 ? ((rev - prevRev) / prevRev) * 100 : null;
        const yoy = lastYearRev > 0 ? ((rev - lastYearRev) / lastYearRev) * 100 : null;
        const cumYoy = lastYearCumulative > 0 ? ((cumulative - lastYearCumulative) / lastYearCumulative) * 100 : null;

        rows.push({
            year: y,
            month: m,
            periodLabel: `${y}/${String(m).padStart(2, '0')}`,
            rev, prevRev, lastYearRev, mom, yoy, cumulative, lastYearCumulative, cumYoy
        });
    });

    // 依照年度、月份新到舊排序
    rows.sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
    });

    // 格式化工具
    const formatValue = val => {
        if (val === null || val === undefined) return '—';
        return Math.round(val / 1000).toLocaleString('en-US'); // 單位轉為千元
    };

    const formatPct = val => {
        if (val === null || val === undefined) return '—';
        return val.toFixed(2) + '%';
    };

    const getColor = val => {
        if (val === null || val === undefined) return '';
        if (val > 0) return 'color:var(--accent-red)';
        if (val < 0) return 'color:var(--accent-green)';
        return '';
    };

    let html = `
        <table class="data-table" style="font-feature-settings: 'tnum';">
            <thead>
                <tr>
                    <th rowspan="2" style="vertical-align:bottom; border-right:1px solid rgba(255,255,255,0.05)">年度/月份</th>
                    <th colspan="4" style="text-align:center; border-bottom:1px solid rgba(255,255,255,0.1); border-right:1px solid rgba(255,255,255,0.05)">單月合併 (單位：千元)</th>
                    <th colspan="3" style="text-align:center; border-bottom:1px solid rgba(255,255,255,0.1)">累計合併 (單位：千元)</th>
                </tr>
                <tr>
                    <th style="text-align:right">當月營收</th>
                    <th style="text-align:right">月增率%</th>
                    <th style="text-align:right">去年同月營收</th>
                    <th style="text-align:right; border-right:1px solid rgba(255,255,255,0.05)">年增率%</th>
                    <th style="text-align:right">當月累計營收</th>
                    <th style="text-align:right">去年累計營收</th>
                    <th style="text-align:right">年增率%</th>
                </tr>
            </thead>
            <tbody>
    `;

    rows.forEach(r => {
        html += `
            <tr>
                <td style="color:#94a3b8; border-right:1px solid rgba(255,255,255,0.02)">${r.periodLabel}</td>
                <td style="text-align:right">${formatValue(r.rev)}</td>
                <td style="text-align:right; ${getColor(r.mom)}">${formatPct(r.mom)}</td>
                <td style="text-align:right">${formatValue(r.lastYearRev)}</td>
                <td style="text-align:right; ${getColor(r.yoy)}; border-right:1px solid rgba(255,255,255,0.02)">${formatPct(r.yoy)}</td>
                <td style="text-align:right">${formatValue(r.cumulative)}</td>
                <td style="text-align:right">${formatValue(r.lastYearCumulative)}</td>
                <td style="text-align:right; ${getColor(r.cumYoy)}">${formatPct(r.cumYoy)}</td>
            </tr>
        `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

// ============================================================
// 核心獲利能力評估矩陣
// ============================================================

function renderProfitabilityMatrix(finData, bsData) {
    const container = document.getElementById('profitabilityMatrix');
    if (!container) return;

    if (!finData || finData.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="emoji">📭</div><p>暫無財報資料</p></div>`;
        return;
    }

    // 1. 整理時間軸與取得指標
    let dateSet = new Set();
    finData.forEach(d => dateSet.add((d.date || '').substring(0, 7)));
    const allDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a));
    if (allDates.length === 0) return;

    const latestDate = allDates[0];
    const prevDate = allDates.length > 1 ? allDates[1] : null;

    const getValue = (dataList, datePrefix, typeName) => {
        const item = dataList.find(d => (d.date || '').startsWith(datePrefix) && d.type === typeName);
        return item ? parseFloat(item.value || 0) : null;
    };

    const getMetrics = (datePrefix) => {
        const rev = getValue(finData, datePrefix, 'Revenue');
        const gross = getValue(finData, datePrefix, 'GrossProfit');
        const op = getValue(finData, datePrefix, 'OperatingIncome');
        const net = getValue(finData, datePrefix, 'IncomeAfterTaxes');
        const eps = getValue(finData, datePrefix, 'EPS') || getValue(finData, datePrefix, 'EarningsPerShare');
        const equity = getValue(bsData, datePrefix, 'Equity') || getValue(bsData, datePrefix, 'EquityAttributableToOwnersOfParent');

        return {
            date: datePrefix,
            revenue: rev,
            grossMargin: (rev && gross) ? (gross / rev * 100) : null,
            opMargin: (rev && op) ? (op / rev * 100) : null,
            netMargin: (rev && net) ? (net / rev * 100) : null,
            eps: eps,
            roe: (net && equity) ? (net / equity * 100) : null,
            equity: equity
        };
    };

    const latest = getMetrics(latestDate);
    const prev = prevDate ? getMetrics(prevDate) : null;

    // 2. 獲取歷史趨勢數據 (用於判定指標)
    const historyMetrics = allDates.slice(0, 5).map(d => getMetrics(d));
    const latestRev = latest.revenue;
    const lastYearDate = allDates.find(d => {
        const [y, m] = latestDate.split('-');
        return d === `${parseInt(y) - 1}-${m}`;
    });
    const lastYearRev = lastYearDate ? getValue(finData, lastYearDate, 'Revenue') : null;
    const lastYearEps = lastYearDate ? (getValue(finData, lastYearDate, 'EPS') || getValue(finData, lastYearDate, 'EarningsPerShare')) : null;
    const latestDebtRatio = getValue(bsData, latestDate, 'DebtRatio') || getValue(bsData, latestDate, '負債佔資產比率') || 0;

    // 平均指標用於判定 (如平均毛利)
    const validGross = historyMetrics.map(m => m.grossMargin).filter(v => v !== null);
    const avgGross = validGross.length > 0 ? validGross.reduce((a, b) => a + b, 0) / validGross.length : 0;
    const validOp = historyMetrics.map(m => m.opMargin).filter(v => v !== null);
    const avgOp = validOp.length > 0 ? validOp.reduce((a, b) => a + b, 0) / validOp.length : 0;

    // 3. UI 格式化工具
    const formatDiffUI = (val, prevVal, suffix = '%') => {
        if (val === null) return `<span class="matrix-value neutral">—</span>`;
        let colorClass = val > 0 ? "positive" : (val < 0 ? "negative" : "neutral");
        let html = `<div class="matrix-value ${colorClass}">${val.toFixed(2)}${suffix}</div>`;
        if (prevVal !== null && prevVal !== undefined) {
            const diff = val - prevVal;
            const diffSign = diff > 0 ? '▲' : (diff < 0 ? '▼' : '');
            const diffColor = diff > 0 ? 'color:var(--accent-red)' : (diff < 0 ? 'color:var(--accent-green)' : 'color:var(--text-muted)');
            if (diff !== 0) {
                html += `<div style="font-size:0.75rem; margin-top:0.2rem; ${diffColor}">${diffSign} ${Math.abs(diff).toFixed(2)}${suffix}</div>`;
            }
        }
        return html;
    };

    const buildFlagHtml = (isRed, redTitle, redDesc, greenTitle, greenDesc) => {
        if (isRed) {
            return `
                <div class="red-flag">
                    <div class="red-flag-icon">🔴</div>
                    <div class="red-flag-text">
                        <span class="red-flag-title">${redTitle}</span><br>
                        ${redDesc}
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="red-flag">
                    <div class="red-flag-icon" style="color:#10b981;">🟢</div>
                    <div class="red-flag-text" style="color:var(--text-secondary);">
                        <span style="font-weight:600; color:#34d399;">${greenTitle}</span><br>
                        ${greenDesc}
                    </div>
                </div>
            `;
        }
    };

    // 4. 指標警訊判定
    // 1. 毛利率：營收成長但毛利下滑
    const grossFlagRed = latestRev > lastYearRev && prev && latest.grossMargin < prev.grossMargin;
    // 2. 營益率：毛利高但營益率低於平均 (費用控管)
    const opFlagRed = latest.grossMargin >= avgGross && latest.opMargin < (avgOp * 0.9);
    // 3. 淨利率：本業低淨利高 (業外異常)
    const netFlagRed = latest.opMargin < 5 && latest.netMargin > (latest.opMargin + 10);
    // 4. EPS：年衰退且利潤率雙降
    const epsFlagRed = lastYearEps && latest.eps < lastYearEps && prev && (latest.grossMargin < prev.grossMargin) && (latest.opMargin < prev.opMargin);
    // 5. ROE：高 ROE 伴隨高槓桿
    const roeFlagRed = latest.roe > 15 && latestDebtRatio > 65;

    const config = [
        {
            name: "1. 毛利率", enName: "(Gross Margin)", formula: "(營收 - 銷貨成本) / 營收",
            logic: "衡量產品本身的賺錢能力。",
            insight: "護城河與定價權的照妖鏡。<br><br>高毛利代表產品具備技術壁壘、品牌溢價或獨佔性；低毛利代表處於紅海殺價競爭。",
            valHtml: formatDiffUI(latest.grossMargin, prev ? prev.grossMargin : null),
            flagHtml: buildFlagHtml(grossFlagRed, "警訊：營收成長，但毛利率下滑。", "代表公司在「降價搶市佔」或面臨「原物料成本飆漲」無法轉嫁。", "安全：毛利表現穩定", "目前產品毛利率無明顯衰退跡象，定價權穩健。")
        },

        {
            name: "2. 營業利益率", enName: "(Operating Margin)", formula: "(毛利 - 營業費用) / 營收",
            logic: "衡量公司「本業」的實質獲利。",
            insight: "經營管理能力的綜合考驗。<br><br>扣除了推銷、管理、研發等費用。能看出公司是否因為過度行銷或管理浮濫而侵蝕利潤。",
            valHtml: formatDiffUI(latest.opMargin, prev ? prev.opMargin : null),
            flagHtml: buildFlagHtml(opFlagRed, "警訊：高毛利率，但本業獲利衰退。", "俗稱「賺了面子，賠了裡子」，代表公司內部費用控管可能鬆散，侵蝕獲利。", "安全：費用控管良好", "本業營業利益率無明顯衰退跡象，費用控管維持正常區間。")
        },
        {
            name: "3. 稅後淨利率", enName: "(Net Margin)", formula: "(營業利益 ± 業外收支 - 稅) / 營收",
            logic: "公司最終真正放入口袋的錢。",
            insight: "檢視業外損益的純度。<br><br>加入匯兌損益、轉投資收益或變賣資產等非經常性項目。",
            valHtml: formatDiffUI(latest.netMargin, prev ? prev.netMargin : null),
            flagHtml: buildFlagHtml(netFlagRed, "警訊：本業獲利低，卻靠業外衝高淨利。", "代表可能靠「賣土地或一次性收益」衝高獲利，不具備可持續性。", "安全：獲利純度正常", "稅後淨利率無異常的高出本業獲利，收益來源單純。")
        },
        {
            name: "4. 每股盈餘", enName: "(EPS)", formula: "稅後淨利 / 流通在外股數",
            logic: "每一股能替股東賺多少錢。",
            insight: "決定股價與本益比 (P/E) 的基石。<br><br>分析師看重的是 EPS 的「成長趨勢 (YoY)」而非單一年度的絕對數字。",
            valHtml: formatDiffUI(latest.eps, prev ? prev.eps : null, ' 元'),
            flagHtml: buildFlagHtml(epsFlagRed, "警訊：EPS 衰退伴隨利潤率雙降。", "代表本質獲利能力正在迅速流失，基本面亮起顯著紅燈。", "安全：獲利能力未見全面惡化", "EPS 與利潤率未出現同時崩跌現象，保持一定韌性。")
        },
        {
            name: "5. 本季 ROE", enName: "(Return On Equity)", formula: "本季稅後淨利 / 股東權益",
            logic: "公司用股東的錢去賺錢的效率。",
            insight: "巴菲特最看重的終極指標。<br><br>不僅考量獲利，還考量了「資本運用效率」。一般要求穩定大於一定水準。",
            valHtml: formatDiffUI(latest.roe, prev ? prev.roe : null),
            flagHtml: buildFlagHtml(roeFlagRed, "警訊：高 ROE 伴隨極高負債比。", "代表公司的高報酬是靠著「大量財務槓桿」衝出來的，若景氣反轉壓力大。", "安全：資金運用架構穩健", "並非透過極端的負債開槓桿來創造高 ROE。")
        }
    ];

    let html = `
        <div style="margin-bottom: 16px; display:flex; justify-content:space-between; align-items:flex-end;">
            <div style="color:#94a3b8; font-size:0.85rem;">本期財報：<strong style="color:#e2e8f0">${latestDate.replace('-', ' 年 ')} 季度</strong></div>
        </div>
        <table class="matrix-table">
        <thead>
            <tr>
                <th style="width:20%">指標名稱</th>
                <th style="width:25%">涵義與計算邏輯</th>
                <th style="width:25%">專業分析師評估重點 (Insight)</th>
                <th style="width:30%">判斷標準與危險警訊 (Red Flags)</th>
            </tr>
        </thead>
        <tbody>
    `;

    config.forEach(row => {
        html += `
            <tr>
                <td>
                    <div class="matrix-title">${row.name}<span class="en-name">${row.enName}</span></div>
                    ${row.valHtml}
                </td>
                <td>
                    <div class="matrix-formula">${row.formula}</div>
                    <div style="color:var(--text-secondary); font-size:0.85rem">${row.logic}</div>
                </td>
                <td><div style="color:#e2e8f0; font-size:0.85rem">${row.insight}</div></td>
                <td>${row.flagHtml}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}


// ============================================================
// 杜邦分析矩陣 (Dupont Analysis)
// ============================================================
// 杜邦分析圖表使用 ChartManager 處理

function renderDupontAnalysis(finData, bsData) {
    const chartDom = document.getElementById('dupontChart');
    const tableDom = document.getElementById('dupontTable');
    if (!chartDom || !tableDom) return;

    const chart = ChartManager.init('dupontChart', chartDom);

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
        title: {
            subtext: `資料年度/季別: ${ascList[ascList.length - 1]?.periodLabel || '未知'}`,
            right: 15,
            top: 0,
            subtextStyle: { color: '#64748b', fontSize: 11 }
        },
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
    chart.setOption(option);

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
