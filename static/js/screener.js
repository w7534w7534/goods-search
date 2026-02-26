document.addEventListener('DOMContentLoaded', () => {
    const listContainer = document.getElementById('watchlistContainer');
    const input = document.getElementById('addWatchlistInput');
    const addBtn = document.getElementById('addWatchlistBtn');
    const scanBtn = document.getElementById('startScanBtn');
    const sectorSelect = document.getElementById('sectorSelect');
    const scanSectorBtn = document.getElementById('scanSectorBtn');
    const resultContainer = document.getElementById('resultContainer');
    const resultBody = document.getElementById('resultBody');
    const resultCount = document.getElementById('resultCount');
    const themeBtn = document.getElementById('themeToggleBtn');

    // ==========================================
    // 0. 佈景主題管理 (Theme Settings)
    // ==========================================

    // 初始化主題
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    updateThemeBtnText(currentTheme);

    // 切換按鈕事件
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            let theme = document.body.getAttribute('data-theme');
            let newTheme = theme === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeBtnText(newTheme);
        });
    }

    function updateThemeBtnText(theme) {
        if (!themeBtn) return;
        if (theme === 'light') {
            themeBtn.innerHTML = '<span class="icon">🌙</span> 深色模式';
        } else {
            themeBtn.innerHTML = '<span class="icon">☀️</span> 淺色模式';
        }
    }

    // ==========================================
    // 1. 自選股名單管理 (Watchlist UI)
    // ==========================================

    function renderWatchlist() {
        const list = WatchlistDB.get();
        if (list.length === 0) {
            listContainer.innerHTML = '<div class="empty-state-list">目前沒有自選股</div>';
            scanBtn.disabled = true;
            return;
        }

        scanBtn.disabled = false;
        let html = '';
        list.forEach(id => {
            html += `
                <div class="watchlist-item">
                    <div class="item-info">
                        <span class="item-id">${id}</span>
                        <!-- 未來可從 API 補充名稱 -->
                    </div>
                    <button class="btn-remove" data-id="${id}">移除</button>
                </div>
            `;
        });
        listContainer.innerHTML = html;
        bindRemoveButtons();
    }

    function bindRemoveButtons() {
        document.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                WatchlistDB.remove(id);
                renderWatchlist();
            });
        });
    }

    addBtn.addEventListener('click', () => {
        const val = input.value.trim();
        if (val) {
            // 支援以空白、換行、全半形逗號或頓號作為分隔符號
            const stocks = val.split(/[\s,，、]+/);
            WatchlistDB.add(stocks);
            input.value = '';
            renderWatchlist();
        }
    });

    input.addEventListener('keydown', (e) => {
        // 考量為多行輸入，改為 Ctrl+Enter 或 Cmd+Enter 送出
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            addBtn.click();
        }
    });

    // 初始渲染
    renderWatchlist();

    // ==========================================
    // 2. 條件過濾與掃描 (Screener Logic)
    // ==========================================

    scanBtn.addEventListener('click', async () => {
        const stocks = WatchlistDB.get();
        if (stocks.length === 0) return;

        // 收集勾選的條件
        const checkedBoxes = Array.from(document.querySelectorAll('input[name="condition"]:checked'));
        const conditions = checkedBoxes.map(cb => cb.value);

        if (conditions.length === 0) {
            alert('請至少勾選一個過濾條件！');
            return;
        }

        // UI 狀態：掃描中
        const originalText = scanBtn.innerHTML;
        scanBtn.innerHTML = '掃描運算中... <span class="pulse-icon">⏳</span>';
        scanBtn.disabled = true;
        resultContainer.style.display = 'none';

        try {
            // 發送請求給後端平行過濾引擎
            const resData = await fetchAPI('/api/stock/screen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stock_ids: stocks,
                    conditions: conditions
                })
            });

            // 渲染結果
            renderResults(resData.data);

        } catch (error) {
            console.error('掃描失敗:', error);
            // 錯誤已由 fetchAPI 的 Toast 處理
        } finally {
            scanBtn.innerHTML = originalText;
            scanBtn.disabled = false;
        }
    });

    // ==========================================
    // 3. 類股批次掃描邏輯 (Sector Scan)
    // ==========================================

    async function loadSectors() {
        if (!sectorSelect) return;
        try {
            const data = await fetchAPI('/api/stock/sectors');
            let html = '<option value="">請選擇類股</option>';
            data.data.forEach(s => {
                html += `<option value="${s}">${s}</option>`;
            });
            sectorSelect.innerHTML = html;
        } catch (e) {
            console.error('載入類股清單失敗', e);
            sectorSelect.innerHTML = '<option value="">載入失敗</option>';
        }
    }

    if (scanSectorBtn) {
        scanSectorBtn.addEventListener('click', async () => {
            const sector = sectorSelect.value;
            if (!sector) {
                alert('請先選擇一個類股！');
                return;
            }

            const checkedBoxes = Array.from(document.querySelectorAll('input[name="condition"]:checked'));
            const conditions = checkedBoxes.map(cb => cb.value);
            if (conditions.length === 0) {
                alert('請至少勾選一個過濾條件！');
                return;
            }

            const originalText = scanSectorBtn.innerHTML;
            scanSectorBtn.innerHTML = '掃描運算中... <span class="pulse-icon">⏳</span>';
            scanSectorBtn.disabled = true;
            resultContainer.style.display = 'none';

            try {
                const resData = await fetchAPI('/api/stock/screen', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        stock_ids: [],
                        sector: sector,
                        conditions: conditions
                    })
                });
                renderResults(resData.data);
            } catch (error) {
                console.error('類股掃描失敗:', error);
                // 錯誤已由 fetchAPI 處理
            } finally {
                scanSectorBtn.innerHTML = originalText;
                scanSectorBtn.disabled = false;
            }
        });
    }

    loadSectors();

    function renderResults(results) {
        resultContainer.style.display = 'block';
        resultCount.textContent = results.length;

        if (results.length === 0) {
            resultBody.innerHTML = `<tr><td colspan="6" class="empty-state-row">沒有符合條件的股票</td></tr>`;
            return;
        }

        let html = '';
        results.forEach(r => {
            const priceColor = r.close > r.ma20 ? '#ef4444' : '#10b981'; // 假設大於MA為紅

            // 處理判斷邏輯顯示文字與樣式
            const ma20Class = r.close > r.ma20 ? 'color:var(--accent-red)' : 'color:var(--accent-green)';
            const ma20Text = r.close > r.ma20 ? '站上月線' : '跌破月線';

            let kdState = '整理中';
            let kdClass = 'status-badge neutral';
            if (r.k > r.d && r.k < 80) {
                kdState = '多頭發散';
                kdClass = 'status-badge bullish';
            } else if (r.k < r.d && r.k > 20) {
                kdState = '空頭發散';
                kdClass = 'status-badge bearish';
            } else if (r.k >= 80) {
                kdState = '高檔超買';
                kdClass = 'status-badge bearish';
            } else if (r.k <= 20) {
                kdState = '低檔超賣';
                kdClass = 'status-badge bullish';
            }

            // 籌碼情境處理
            let chipHtml = '<span style="color:#64748b">—</span>';
            if (r.chip_scenario) {
                let badgeClass = 'neutral';
                let icon = '🧊';
                if (r.chip_scenario === '黃金交叉') { badgeClass = 'bullish'; icon = '🔥'; }
                else if (r.chip_scenario === '死亡交叉') { badgeClass = 'bearish'; icon = '💀'; }
                else if (r.chip_scenario === '高檔強軋') { badgeClass = 'warning'; icon = '🚀'; }

                let detailHtml = '';
                if (r.major_diff) {
                    const mColor = parseFloat(r.major_diff) > 0 ? 'var(--accent-red)' : 'var(--accent-green)';
                    const rColor = parseFloat(r.retail_diff) > 0 ? 'var(--accent-red)' : 'var(--accent-green)';
                    detailHtml = `<div style="font-size:11px; margin-top:4px; font-feature-settings: 'tnum';">
                        大戶 <span style="color:${mColor}">${r.major_diff}</span> | 散戶 <span style="color:${rColor}">${r.retail_diff}</span>
                    </div>`;
                }

                chipHtml = `<div class="status-badge ${badgeClass}">${icon} ${r.chip_scenario}</div>${detailHtml}`;
            }

            html += `
                <tr>
                    <td class="result-row-id">${r.stock_id}</td>
                    <td class="result-row-name">${r.stock_name || 'N/A'}</td>
                    <td class="text-right result-row-val" style="color:${priceColor}">${r.close.toFixed(2)}</td>
                    <td class="text-right" style="${ma20Class}">${r.ma20.toFixed(2)}<br><small>${ma20Text}</small></td>
                    <td class="text-center"><span class="${kdClass}">${kdState}</span><br><small style="color:#64748b;font-size:10px;">K:${r.k.toFixed(1)} D:${r.d.toFixed(1)}</small></td>
                    <td class="text-center">${chipHtml}</td>
                    <td class="text-center">
                        <a href="/stock?id=${r.stock_id}&name=${encodeURIComponent(r.stock_name || '')}" target="_blank" class="result-link">詳情 ↗</a>
                    </td>
                </tr>
            `;
        });
        resultBody.innerHTML = html;

        // 滾動到結果區
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});
