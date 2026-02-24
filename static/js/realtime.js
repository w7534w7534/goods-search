/**
 * 即時報價模組 — 盤中自動輪詢 TWSE/TPEX 即時報價
 *
 * 功能：
 * - 每 15 秒更新股價顯示
 * - 每 60 秒重算技術指標（含盤中數據）
 * - 交易時段自動啟停
 */

// 輪詢控制
let _realtimeTimer = null;
let _indicatorTimer = null;
let _realtimeStockId = null;
let _isPolling = false;

/**
 * 啟動即時報價輪詢
 */
function startRealtimePolling(stockId) {
    if (_isPolling && _realtimeStockId === stockId) return;
    stopRealtimePolling();

    _realtimeStockId = stockId;
    _isPolling = true;

    // 立即執行一次
    _fetchRealtimeQuote();

    // 價格輪詢：每 15 秒
    _realtimeTimer = setInterval(_fetchRealtimeQuote, 15000);

    // 指標輪詢：每 60 秒
    _indicatorTimer = setInterval(_fetchRealtimeIndicators, 60000);

    _updateRealtimeStatus(true);
    console.log(`[即時] 啟動輪詢: ${stockId}`);
}

/**
 * 停止即時報價輪詢
 */
function stopRealtimePolling() {
    if (_realtimeTimer) {
        clearInterval(_realtimeTimer);
        _realtimeTimer = null;
    }
    if (_indicatorTimer) {
        clearInterval(_indicatorTimer);
        _indicatorTimer = null;
    }
    _isPolling = false;
    _updateRealtimeStatus(false);
}

/**
 * 取得即時報價並更新 UI
 */
async function _fetchRealtimeQuote() {
    if (!_realtimeStockId) return;

    try {
        const resp = await fetch(`/api/stock/realtime?id=${_realtimeStockId}`);
        const json = await resp.json();

        if (json.status !== 'ok' || !json.data) {
            // 非交易時段或無數據 → 停止輪詢
            if (!json.data?.is_trading) {
                stopRealtimePolling();
                _updateRealtimeStatus(false, '非交易時段');
            }
            return;
        }

        const data = json.data;

        // 更新標題區股價
        const priceEl = document.getElementById('priceValue');
        const changeEl = document.getElementById('priceChange');
        const dataDateEl = document.getElementById('dataDate');

        if (priceEl) {
            priceEl.textContent = data.price.toFixed(2);
        }

        if (changeEl) {
            const sign = data.change >= 0 ? '+' : '';
            changeEl.textContent = `${sign}${data.change.toFixed(2)} (${sign}${data.change_pct.toFixed(2)}%)`;
            changeEl.className = 'price-change ' + (data.change >= 0 ? 'up' : 'down');

            // 閃爍效果
            changeEl.style.transition = 'none';
            changeEl.style.opacity = '0.5';
            setTimeout(() => {
                changeEl.style.transition = 'opacity 0.3s';
                changeEl.style.opacity = '1';
            }, 50);
        }

        if (dataDateEl) {
            dataDateEl.textContent = `即時 ${data.time || ''}`;
        }

        // 如果不在交易時段，自動停止
        if (!data.is_trading) {
            stopRealtimePolling();
            if (dataDateEl) {
                dataDateEl.textContent = `收盤 ${data.time || ''}`;
            }
        }

    } catch (err) {
        console.error('[即時] 報價錯誤:', err);
    }
}

/**
 * 重新取得含即時數據的指標並更新圖表
 */
async function _fetchRealtimeIndicators() {
    if (!_realtimeStockId || !_isPolling) return;

    try {
        // 取得當前日期區間
        const { start, end } = typeof getDateRange === 'function'
            ? getDateRange()
            : { start: '', end: '' };

        const url = `/api/stock/indicators?id=${_realtimeStockId}&start=${start}&end=${end}&realtime=1`;
        const resp = await fetch(url);
        const json = await resp.json();

        if (json.status !== 'ok' || !json.data) return;

        const indData = json.data;

        // 同時取得即時報價來更新 K 線
        const rtResp = await fetch(`/api/stock/realtime?id=${_realtimeStockId}`);
        const rtJson = await rtResp.json();

        // 取得價格數據來更新 K 線最後一根蠟燭
        const priceUrl = `/api/stock/price?id=${_realtimeStockId}&start=${start}&end=${end}`;
        const priceResp = await fetch(priceUrl);
        const priceJson = await priceResp.json();

        if (priceJson.status === 'ok' && priceJson.data?.data) {
            let priceData = priceJson.data.data;

            // 如果有即時數據，附加或替換今天的蠟燭
            if (rtJson.status === 'ok' && rtJson.data?.is_trading) {
                const rt = rtJson.data;
                const today = new Date().toISOString().split('T')[0];
                // 用本地時間格式化今日日期
                const now = new Date();
                const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                // 移除已存在的今日數據
                priceData = priceData.filter(d => d.date !== todayLocal && d.date !== today);

                // 附加即時蠟燭
                priceData.push({
                    date: todayLocal,
                    open: rt.open,
                    max: rt.high,
                    min: rt.low,
                    close: rt.price,
                    Trading_Volume: rt.volume,
                    stock_id: _realtimeStockId,
                });
            }

            // 重新渲染圖表
            if (typeof initKlineChart === 'function') {
                initKlineChart(priceData, indData);
            }
            if (typeof initIndicatorChart === 'function') {
                initIndicatorChart(indData);
            }
        }

        console.log('[即時] 指標已更新');

    } catch (err) {
        console.error('[即時] 指標更新錯誤:', err);
    }
}

/**
 * 更新即時狀態指示器
 */
function _updateRealtimeStatus(isLive, message) {
    const indicator = document.getElementById('realtimeIndicator');
    if (!indicator) return;

    if (isLive) {
        indicator.innerHTML = '<span class="realtime-dot"></span> 即時';
        indicator.classList.add('live');
        indicator.classList.remove('offline');
    } else {
        indicator.innerHTML = message || '離線';
        indicator.classList.remove('live');
        indicator.classList.add('offline');
    }
}
