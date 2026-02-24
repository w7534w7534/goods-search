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
};

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
                            const instances = {
                                institutionalChart: institutionalChartInstance,
                                holdersChart: holdersChartInstance,
                                marginChart: marginChartInstance,
                                shareholdingChart: shareholdingChartInstance,
                                revenueChart: revenueChartInstance,
                                financialChart: financialChartInstance,
                                profitabilityChart: profitabilityChartInstance,
                            };
                            instances[chart.id]?.resize();
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
        if (klineChartInstance) {
            const url = klineChartInstance.getDataURL({
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
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
}

// ============================================================
// API fetch + retry（支援新格式 { status, data, message }）
// ============================================================

async function fetchAPI(url, retries = 1, fullResponse = false) {
    for (let i = 0; i <= retries; i++) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();

            // 支援新格式：{ status: "ok|error", data: ..., message: "..." }
            if (json.status === 'error') {
                console.warn(`API 錯誤 (${url}): ${json.message}`);
                showToast(json.message || 'API 回傳錯誤', 'error');
                return null;
            }
            // fullResponse: 回傳完整 JSON（含 data 以外的額外欄位）
            if (fullResponse) return json;
            // 新格式回傳 data 欄位；舊格式相容（直接回傳內容）
            return json.data !== undefined ? json.data : json;
        } catch (err) {
            if (i < retries) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            console.error(`API 錯誤 (${url}):`, err);
            return null;
        }
    }
}

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
        const [priceResp, indResp, perResp] = await Promise.all([
            fetchAPI(`/api/stock/price?id=${id}&start=${start}&end=${end}`),
            fetchAPI(`/api/stock/indicators?id=${id}&start=${start}&end=${end}`),
            fetchAPI(`/api/stock/per?id=${id}`),
        ]);

        // priceResp 現在透過 fetchAPI 自動提取 data 欄位
        if (priceResp && priceResp.data && priceResp.data.length > 0) {
            // 新格式：{ name: "...", data: [...] }
            const priceData = priceResp.data;
            const latest = priceData[priceData.length - 1];
            const prev = priceData.length > 1 ? priceData[priceData.length - 2] : latest;

            if (priceResp.name && !state.stockName) {
                state.stockName = priceResp.name;
                document.getElementById('stockName').textContent = priceResp.name;
                document.title = `${priceResp.name} (${id}) — 台股資訊查詢`;
            }

            updatePriceDisplay(latest, prev);
            updateInfoCards(latest, perResp);

            if (indResp) {
                initKlineChart(priceData, indResp);
                initIndicatorChart(indResp);
                if (klineChartInstance && indicatorChartInstance) {
                    echarts.connect([klineChartInstance, indicatorChartInstance]);
                }
            }
        } else if (Array.isArray(priceResp) && priceResp.length > 0) {
            // 舊格式相容：直接是陣列
            const latest = priceResp[priceResp.length - 1];
            const prev = priceResp.length > 1 ? priceResp[priceResp.length - 2] : latest;
            updatePriceDisplay(latest, prev);
            if (indResp) {
                initKlineChart(priceResp, indResp);
                initIndicatorChart(indResp);
                if (klineChartInstance && indicatorChartInstance) {
                    echarts.connect([klineChartInstance, indicatorChartInstance]);
                }
            }
        }

        // 第二批：延遲載入籌碼面 + 基本面（降低 API 壓力）
        setTimeout(async () => {
            try {
                const [instResp, holdResp, marginResp, shareResp, divResp, revResp, finResp, bsResp] = await Promise.all([
                    fetchAPI(`/api/stock/institutional?id=${id}&start=${start}&end=${end}`, 1, true),
                    fetchAPI(`/api/stock/holders?id=${id}`),
                    fetchAPI(`/api/stock/margin?id=${id}&start=${start}&end=${end}`),
                    fetchAPI(`/api/stock/shareholding?id=${id}&start=${start}&end=${end}`),
                    fetchAPI(`/api/stock/dividend?id=${id}`),
                    fetchAPI(`/api/stock/revenue?id=${id}`),
                    fetchAPI(`/api/stock/financial?id=${id}`),
                    fetchAPI(`/api/stock/balance-sheet?id=${id}`),
                ]);

                // instResp 是完整 JSON { status, data, consecutive }
                if (instResp && instResp.data) {
                    renderInstitutionalChart(instResp.data, instResp.consecutive);
                }
                if (holdResp) renderHoldersChart(holdResp);
                if (marginResp) renderMarginChart(marginResp);
                if (shareResp) renderShareholdingChart(shareResp);
                if (divResp) renderDividendTable(divResp);
                if (revResp) renderRevenueChart(revResp);
                if (finResp) renderFinancialChart(finResp);
                if (bsResp) renderProfitabilityChart(bsResp);

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
        setCardValue('volumeValue', formatNumber(latest.Trading_Volume));
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

function showLoading(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <span>載入中...</span>
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
        institutionalChartInstance?.resize();
        holdersChartInstance?.resize();
        marginChartInstance?.resize();
        shareholdingChartInstance?.resize();
        revenueChartInstance?.resize();
        financialChartInstance?.resize();
        profitabilityChartInstance?.resize();
    });
}
