document.addEventListener('DOMContentLoaded', () => {
    const listContainer = document.getElementById('watchlistContainer');
    const input = document.getElementById('addWatchlistInput');
    const addBtn = document.getElementById('addWatchlistBtn');
    const scanBtn = document.getElementById('startScanBtn');
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
            listContainer.innerHTML = '<div style="color:#94a3b8; padding: 12px; text-align:center;">目前沒有自選股</div>';
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
        scanBtn.innerHTML = '掃描運算中... <span style="animation: pulse 1s infinite alternate; display: inline-block;">⏳</span>';
        scanBtn.disabled = true;
        resultContainer.style.display = 'none';

        try {
            // 發送請求給後端平行過濾引擎
            const response = await fetch('/api/stock/screen', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stock_ids: stocks,
                    conditions: conditions
                })
            });

            if (!response.ok) {
                throw new Error('掃描 API 回應錯誤');
            }

            const resData = await response.json();

            if (resData.status !== 'ok') {
                throw new Error(resData.message || '無法取得結果');
            }

            // 渲染結果
            renderResults(resData.data);

        } catch (error) {
            console.error('掃描失敗:', error);
            alert('選股掃描失敗，請檢查後端是否啟動與連線狀態。');
        } finally {
            scanBtn.innerHTML = originalText;
            scanBtn.disabled = false;
        }
    });

    function renderResults(results) {
        resultContainer.style.display = 'block';
        resultCount.textContent = results.length;

        if (results.length === 0) {
            resultBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 24px; color:#94a3b8;">沒有符合條件的股票</td></tr>`;
            return;
        }

        let html = '';
        results.forEach(r => {
            const priceColor = r.close > r.ma20 ? '#ef4444' : '#10b981'; // 假設大於MA為紅
            html += `
                <tr>
                    <td style="font-weight:600; font-size:1.1rem; color:#f1f5f9;">${r.stock_id}</td>
                    <td style="color:#cbd5e1;">${r.stock_name || 'N/A'}</td>
                    <td style="text-align:right; font-weight:600; color:${priceColor}">${r.close.toFixed(2)}</td>
                    <td style="text-align:right; color:#94a3b8;">${r.ma20.toFixed(2)}</td>
                    <td style="text-align:center;">
                        <span style="font-size:0.85rem; padding: 2px 6px; border-radius: 4px; background: rgba(59, 130, 246, 0.1); color: #3b82f6;">
                            K: ${r.k.toFixed(1)} / D: ${r.d.toFixed(1)}
                        </span>
                    </td>
                    <td style="text-align:center;">
                        <a href="/?id=${r.stock_id}" target="_blank" class="result-link">詳情 ↗</a>
                    </td>
                </tr>
            `;
        });
        resultBody.innerHTML = html;

        // 滾動到結果區
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
});
