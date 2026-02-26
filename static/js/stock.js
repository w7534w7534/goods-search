/**
 * 儀表板主控制邏輯
 * 優化：名稱從 URL 讀取、分批載入、retry、圖表聯動、
 *       自選股、匯出、資訊卡片
 * 共用功能（Toast / 主題 / 自選股 / formatNumber）由 common.js 提供
 */

// ============================================================
// 狀態管理
// ============================================================

const state = {
    stockId: '',
    stockName: '',
    dateRange: '6m',
    isAdjusted: false, // 判斷是否開啟還原日線
};

// 原始存放區，供還原切換使用
let originalPriceData = null;
let adjustedFactorsData = null;
let currentIndicatorsResp = null;

// ============================================================
// 初始化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    state.stockId = params.get('id') || '';
    state.stockName = params.get('name') || '';

    if (!state.stockId) {
        window.location.href = '/';
        return;
    }

    document.getElementById('stockId').textContent = state.stockId;

    // 如果 URL 有名稱就直接顯示（不用額外 API）
    if (state.stockName) {
        document.getElementById('stockName').textContent = state.stockName;
        document.title = `${state.stockName} (${state.stockId}) — 台股資訊查詢`;
    } else {
        document.title = `${state.stockId} — 台股資訊查詢`;
    }

    // 初始化自選股按鈕
    initWatchlistBtn();

    loadAllData();
    bindEvents();
});

// ============================================================
// 自選股按鈕
// ============================================================

function initWatchlistBtn() {
    const btn = document.getElementById('watchlistBtn');
    if (!btn) return;

    const isIn = isInWatchlist(state.stockId);
    btn.textContent = isIn ? '★' : '☆';
    btn.classList.toggle('active', isIn);

    btn.addEventListener('click', () => {
        const list = getWatchlist();
        const idx = list.findIndex(s => s.id === state.stockId);
        const name = state.stockName || state.stockId;
        if (idx >= 0) {
            list.splice(idx, 1);
            btn.textContent = '☆';
            btn.classList.remove('active');
            showToast(`已從自選股移除 ${name}`, 'info');
        } else {
            list.push({ id: state.stockId, name });
            btn.textContent = '★';
            btn.classList.add('active');
            showToast(`已加入自選股 ${name}`, 'success');
        }
        saveWatchlist(list);
    });
}

// ============================================================
// 事件綁定
// ============================================================

function bindEvents() {
    // 日期區間
    document.querySelectorAll('.date-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.date-range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.dateRange = btn.dataset.range;
            loadAllData();
        });
    });

    // 主圖指標切換
    document.getElementById('indicatorToggles')?.addEventListener('click', (e) => {
        if (e.target.id === 'adjFactorToggle') {
            e.target.classList.toggle('active');
            state.isAdjusted = e.target.classList.contains('active');
            applyAdjustedPrice();
            return;
        }
        if (e.target.classList.contains('indicator-btn')) {
            e.target.classList.toggle('active');
            renderKlineChart();
        }
    });

    // 子指標切換
    document.getElementById('subIndicatorToggles')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('indicator-btn')) {
            e.target.classList.toggle('active');
            renderIndicatorChart();
        }
    });

    // Tab 切換
    document.querySelectorAll('.tab-nav').forEach(nav => {
        nav.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-btn')) {
                const tab = e.target.dataset.tab;
                nav.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const parent = nav.parentElement;
                parent.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                const content = parent.querySelector(`#tab-${tab}`);
                if (content) {
                    content.classList.add('active');
                    setTimeout(() => {
                        const chart = content.querySelector('.chart-container');
                        if (chart && chart.id) {
                            ChartManager.resize(chart.id);
                        }
                    }, 100);
                }
            }
        });
    });

    // 匯出 CSV
    document.getElementById('exportCsv')?.addEventListener('click', () => {
        const { start, end } = getDateRange();
        const url = `/api/stock/export?id=${state.stockId}&start=${start}&end=${end}&type=price`;
        window.open(url, '_blank');
        showToast('正在下載 CSV...', 'info');
    });

    // 匯出圖表 PNG
    document.getElementById('exportPng')?.addEventListener('click', () => {
        const chart = ChartManager.get('klineChart');
        if (chart) {
            const url = chart.getDataURL({
                type: 'png',
                pixelRatio: 2,
                backgroundColor: '#0a0e17',
            });
            const a = document.createElement('a');
            a.href = url;
            a.download = `${state.stockId}_kline.png`;
            a.click();
            showToast('圖表已匯出', 'success');
        }
    });
}

// ============================================================
// 日期計算
// ============================================================

function getDateRange() {
    const end = new Date();
    let start = new Date();
    switch (state.dateRange) {
        case '1m': start.setMonth(start.getMonth() - 1); break;
        case '3m': start.setMonth(start.getMonth() - 3); break;
        case '6m': start.setMonth(start.getMonth() - 6); break;
        case '1y': start.setFullYear(start.getFullYear() - 1); break;
        case '2y': start.setFullYear(start.getFullYear() - 2); break;
        case '5y': start.setFullYear(start.getFullYear() - 5); break;
        default: start.setMonth(start.getMonth() - 6);
    }
    // 使用本地時間而非 UTC，避免 UTC+8 凌晨少一天
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: fmt(start), end: fmt(end) };
}

function getYearAgoDate(years) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// （已將 fetchAPI 移至獨立的 api.js 共用模組）

// ============================================================
// 資料載入（分批 + retry）
// ============================================================

async function loadAllData() {
    const { start, end } = getDateRange();
    const id = state.stockId;

    showLoading('klineChart');
    showLoading('indicatorChart');

    try {
        // 第一批：最重要的資料（K線 + 指標 + PER）
        const [chartResp, perResp] = await Promise.all([
            fetchAPI(`/api/stock/chart-data?id=${id}&start=${start}&end=${end}&realtime=1`),
            fetchAPI(`/api/stock/per?id=${id}`),
        ]);

        if (chartResp && chartResp.price && chartResp.price.length > 0) {
            const priceData = chartResp.price;
            const indResp = chartResp.indicators;
            const latest = priceData[priceData.length - 1];
            const prev = priceData.length > 1 ? priceData[priceData.length - 2] : latest;

            if (chartResp.name && !state.stockName) {
                state.stockName = chartResp.name;
                document.getElementById('stockName').textContent = chartResp.name;
                document.title = `${chartResp.name} (${id}) — 台股資訊查詢`;
            }

            updatePriceDisplay(latest, prev);
            updateInfoCards(latest, perResp);

            // 顯示資料截至日期
            const dataDateEl = document.getElementById('dataDate');
            if (dataDateEl) {
                dataDateEl.textContent = `資料截至 ${latest.date}`;
            }

            if (indResp) {
                initKlineChart(priceData, indResp);
                initIndicatorChart(indResp);
                const k1 = ChartManager.get('klineChart');
                const i1 = ChartManager.get('indicatorChart');
                if (k1 && i1) {
                    echarts.connect([k1, i1]);
                }
            }

            // 啟動即時報價輪詢
            if (typeof startRealtimePolling === 'function') {
                startRealtimePolling(id);
            }
        }

        // 第二批：延遲載入籌碼面 + 基本面（降低 API 壓力）
        setTimeout(async () => {
            try {
                const [instResp, holdResp, marginResp, shareResp, divResp, revResp, finResp, bsResp, longPriceResp, adjResp] = await Promise.all([
                    fetchAPI(`/api/stock/institutional?id=${id}&start=${start}&end=${end}`, { retries: 1, fullResponse: true, throwOnError: false }),
                    fetchAPI(`/api/stock/holders?id=${id}`, { throwOnError: false }),
                    fetchAPI(`/api/stock/margin?id=${id}&start=${start}&end=${end}`, { throwOnError: false }),
                    fetchAPI(`/api/stock/shareholding?id=${id}&start=${start}&end=${end}`, { throwOnError: false }),
                    fetchAPI(`/api/stock/dividend?id=${id}`, { throwOnError: false }),
                    fetchAPI(`/api/stock/revenue?id=${id}`, { throwOnError: false }),
                    fetchAPI(`/api/stock/financial?id=${id}`, { throwOnError: false }),
                    fetchAPI(`/api/stock/balance-sheet?id=${id}`, { throwOnError: false }),
                    fetchAPI(`/api/stock/price?id=${id}&start=${getYearAgoDate(2)}&end=${end}`, { throwOnError: false }),
                    fetchAPI(`/api/stock/adjusted-factors?id=${id}`, { throwOnError: false }) // 新增除權息還原系數
                ]);

                // 儲存原始除權息與股價備用
                originalPriceData = chartResp?.price;
                adjustedFactorsData = adjResp;
                currentIndicatorsResp = chartResp?.indicators;

                // instResp 是完整 JSON { status, data, consecutive }
                if (instResp && instResp.data) {
                    renderInstitutionalTables(instResp.data, instResp.consecutive, shareResp, chartResp?.price);
                    // 由於沒有大戶持股，以法人資料代為計算短線籌碼集中度
                    renderConcentrationChart(instResp.data, chartResp?.price);
                }
                if (marginResp) renderMarginChart(marginResp);

                if (holdResp) {
                    // 若 holdResp 是陣列，代表 fetchAPI 已經幫忙解構出 data
                    // 若它是物件而且有 data 屬性，就取 data
                    const hData = Array.isArray(holdResp) ? holdResp : (holdResp.data || []);
                    if (hData.length > 0) {
                        renderHoldersChart(hData);
                        renderHoldersTable(hData);
                    }
                }

                if (finResp) renderEpsTable(finResp, longPriceResp || priceResp?.data || priceResp, adjResp);
                if (revResp) renderRevenueTable(revResp);
                if (finResp && bsResp) {
                    renderProfitabilityMatrix(finResp, bsResp);
                    renderDupontAnalysis(finResp, bsResp);
                }

                // 統一 resize 處理（籌碼面 + 基本面圖表）
                setupChartResize();
            } catch (err) {
                console.error('籌碼面/基本面資料載入錯誤:', err);
            }
        }, 500);

    } catch (err) {
        console.error('載入資料錯誤:', err);
        showToast('資料載入失敗，請重試', 'error');
    }
}

// ============================================================
// 資訊卡片更新
// ============================================================

function updateInfoCards(latest, perResp) {
    // PER / PBR / 殖利率
    if (perResp && Array.isArray(perResp) && perResp.length > 0) {
        const latestPer = perResp[perResp.length - 1];
        setCardValue('perValue', latestPer.PER, 'x');
        setCardValue('pbrValue', latestPer.PBR, 'x');
        setCardValue('yieldValue', latestPer.dividend_yield, '%');
    }

    // 從 K 線資料取
    if (latest) {
        setCardValue('volumeValue', Math.round(latest.Trading_Volume / 1000).toLocaleString(), '張');
        setCardValue('highValue', latest.max);
        setCardValue('lowValue', latest.min);
    }
}

function setCardValue(id, value, suffix = '') {
    const el = document.getElementById(id);
    if (!el) return;
    if (value != null && value !== '' && value !== 0) {
        el.textContent = typeof value === 'number' ? value.toFixed(2) + suffix : value + suffix;
    } else {
        el.textContent = '—';
    }
}

// ============================================================
// 工具函式
// ============================================================

function updatePriceDisplay(latest, prev) {
    const priceEl = document.getElementById('priceValue');
    const changeEl = document.getElementById('priceChange');

    const close = parseFloat(latest.close);
    const prevClose = parseFloat(prev.close);
    const change = close - prevClose;
    const changePct = ((change / prevClose) * 100).toFixed(2);

    priceEl.textContent = close.toFixed(2);

    if (change > 0) {
        changeEl.textContent = `▲ ${change.toFixed(2)} (${changePct}%)`;
        changeEl.className = 'price-change up';
        priceEl.style.color = 'var(--accent-red)';
    } else if (change < 0) {
        changeEl.textContent = `▼ ${Math.abs(change).toFixed(2)} (${changePct}%)`;
        changeEl.className = 'price-change down';
        priceEl.style.color = 'var(--accent-green)';
    } else {
        changeEl.textContent = `— 0.00 (0.00%)`;
        changeEl.className = 'price-change flat';
        priceEl.style.color = 'var(--text-primary)';
    }
}

// ============================================================
// 除權息還原計算邏輯
// ============================================================

function applyAdjustedPrice() {
    if (!originalPriceData || !originalPriceData.length) return;

    if (!state.isAdjusted || !adjustedFactorsData || adjustedFactorsData.length === 0) {
        // 取消還原：用原始資料重繪
        if (currentIndicatorsResp) {
            initKlineChart(originalPriceData, currentIndicatorsResp);
            initIndicatorChart(currentIndicatorsResp);
        }
        return;
    }

    // 將除權息資料按日期降冪排列 (由新到舊)
    // FinMind 的除權息交易日位於 CashExDividendTradingDate 或 StockExDividendTradingDate
    const getExDate = d => d.CashExDividendTradingDate || d.StockExDividendTradingDate || d.date;
    const sortedDividends = [...adjustedFactorsData].sort((a, b) => getExDate(b).localeCompare(getExDate(a)));

    // 深拷貝一份價格與指標資料避免污染原始資料
    const newPriceData = JSON.parse(JSON.stringify(originalPriceData));
    const newIndData = currentIndicatorsResp ? JSON.parse(JSON.stringify(currentIndicatorsResp)) : null;

    // 由新到舊遍歷每個股價，根據日期找出適用的總還原倍數
    let currentMultiplier = 1.0;
    let divIndex = 0; // 對應 sortedDividends 的索引

    // 價格資料是由舊到新，因此我們從最後一天（最新）往前算
    for (let i = newPriceData.length - 1; i >= 0; i--) {
        const pd = newPriceData[i];

        // 檢查是否跨越了某個除權除息日
        // divIndex 若 < 陣列長度，且股價日期 小於 除權息日，代表這天及之前的股價必須還原
        while (divIndex < sortedDividends.length && pd.date < getExDate(sortedDividends[divIndex])) {
            const div = sortedDividends[divIndex];
            // 計算這個除權息事件產生的還原乘數 (簡化計算：(前一天收盤 - 現金股息) / 前一天收盤)
            const cash = div.CashEarningsDistribution || 0;
            const stock = div.StockEarningsDistribution || 0;

            // 找出最靠近除權日前一天的股價當作基準價
            let refPrice = pd.close;
            if (i + 1 < newPriceData.length) refPrice = originalPriceData[i + 1].close; // 基準價應為除權前一日(即最新的一天)收盤

            if (refPrice > 0) {
                // 還原公式：係數 = (P - 現金) / (P * (1 + 股票配發率))
                const stockRate = stock / 10; // 股票股利每張 1000 股配發 X 元
                const factor = (refPrice - cash) / (refPrice * (1 + stockRate));
                currentMultiplier *= factor;
            }
            divIndex++;
        }

        // 乘上還原係數 (若日期大於等於最新的除權日，Multiplier 為 1 不變)
        if (currentMultiplier !== 1.0) {
            pd.open = Number((pd.open * currentMultiplier).toFixed(2));
            pd.close = Number((pd.close * currentMultiplier).toFixed(2));
            pd.max = Number((pd.max * currentMultiplier).toFixed(2));
            pd.min = Number((pd.min * currentMultiplier).toFixed(2));
        }
    }

    // 處理指標資料 (只處理跟價格絕對值有關的指標，不處理 RSI, KD, MACD 柱等波動率)
    if (newIndData) {
        // 重新由新往前乘上 currentMultiplier
        currentMultiplier = 1.0;
        divIndex = 0;
        const indDates = newIndData.date;

        for (let i = indDates.length - 1; i >= 0; i--) {
            const dateStr = indDates[i];

            while (divIndex < sortedDividends.length && dateStr < getExDate(sortedDividends[divIndex])) {
                const div = sortedDividends[divIndex];
                const cash = div.CashEarningsDistribution || 0;
                const stock = div.StockEarningsDistribution || 0;

                // 找出相同日期的原始股價
                let refPrice = null;
                const exDateStr = getExDate(sortedDividends[divIndex]);
                const priceIdx = originalPriceData.findIndex(p => p.date === exDateStr);
                if (priceIdx > 0) refPrice = originalPriceData[priceIdx - 1].close; // 前一天
                if (!refPrice && originalPriceData.length > 0) refPrice = originalPriceData[originalPriceData.length - 1].close;

                if (refPrice > 0) {
                    const factor = (refPrice - cash) / (refPrice * (1 + stock / 10));
                    currentMultiplier *= factor;
                }
                divIndex++;
            }

            if (currentMultiplier !== 1.0) {
                ['ma5', 'ma10', 'ma20', 'ma60', 'ma120', 'bb_upper', 'bb_middle', 'bb_lower', 'vwap'].forEach(key => {
                    if (newIndData[key] && newIndData[key][i]) {
                        newIndData[key][i] = Number((newIndData[key][i] * currentMultiplier).toFixed(2));
                    }
                });
            }
        }
    }

    // 重繪圖表
    initKlineChart(newPriceData, newIndData);
    if (newIndData) initIndicatorChart(newIndData);
}

function showLoading(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (elementId.includes('Chart')) {
        // 圖表骨架
        el.innerHTML = `
            <div style="width: 100%; height: 100%; padding: 10px;">
                <div class="skeleton skeleton-chart"></div>
            </div>
        `;
    } else if (elementId.includes('Table') || elementId.includes('Matrix')) {
        // 表格骨架
        el.innerHTML = `
            <div style="width: 100%; padding: 10px;">
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row" style="width: 70%;"></div>
            </div>
        `;
    } else {
        // 預設純文字骨架
        el.innerHTML = `
            <div style="width: 100%; padding: 10px;">
                <div class="skeleton skeleton-text long"></div>
                <div class="skeleton skeleton-text short"></div>
            </div>
        `;
    }
}

// ============================================================
// 統一 resize 處理（籌碼面 + 基本面圖表）
// ============================================================

let _chipResizeBound = false;
function setupChartResize() {
    if (_chipResizeBound) return;
    _chipResizeBound = true;
    window.addEventListener('resize', () => {
        ChartManager.resizeAll();
    });
}

// ============================================================
// 股票相關新聞
// ============================================================

function renderStockNews(newsList) {
    const container = document.getElementById('newsContainer');
    if (!container) return;

    if (!newsList || newsList.length === 0) {
        container.innerHTML = '<div class="loading-news">暫無相關新聞</div>';
        return;
    }

    let html = '';
    newsList.forEach(item => {
        // 格式化日期 (如果是 RSS 格式，嘗試解析)
        let dateStr = item.pubDate || '';
        if (dateStr) {
            try {
                const d = new Date(dateStr);
                if (!isNaN(d.getTime())) {
                    dateStr = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                }
            } catch (e) {
                console.warn('新聞日期解析失敗:', dateStr);
            }
        }

        html += `
            <a href="${item.link}" target="_blank" class="news-item">
                <div class="news-content">
                    <div class="news-title">${item.title}</div>
                    <div class="news-meta">
                        <span class="news-source">${item.source}</span>
                        <span class="news-date">${dateStr}</span>
                    </div>
                </div>
                <div class="news-arrow">→</div>
            </a>
        `;
    });

    container.innerHTML = html;
}

