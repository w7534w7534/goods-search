/**
 * 搜尋首頁邏輯
 * 搜尋、自動完成、自選股渲染
 * 共用功能（Toast / 主題 / 自選股）由 common.js 提供
 */

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const dropdown = document.getElementById('autocompleteDropdown');

let debounceTimer = null;
let activeIndex = -1;
let currentResults = [];

// ============================================================
// 自選股 (首頁渲染)
// ============================================================

function toggleWatchlist(stockId, stockName) {
    const list = getWatchlist();
    const idx = list.findIndex(s => s.id === stockId);
    if (idx >= 0) {
        list.splice(idx, 1);
        showToast(`已從自選股移除 ${stockName}`, 'info');
    } else {
        list.push({ id: stockId, name: stockName });
        showToast(`已加入自選股 ${stockName}`, 'success');
    }
    saveWatchlist(list);
    renderWatchlist();
    return list.some(s => s.id === stockId);
}

function renderWatchlist() {
    const section = document.getElementById('watchlistSection');
    const grid = document.getElementById('watchlistGrid');
    if (!section || !grid) return;

    const list = getWatchlist();
    if (list.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    grid.innerHTML = list.map(s => `
        <a class="hot-stock-chip" href="/stock?id=${s.id}&name=${encodeURIComponent(s.name)}">
            <span class="chip-id">${s.id}</span> ${s.name}
        </a>
    `).join('');
}

renderWatchlist();

// ============================================================
// 搜尋功能
// ============================================================

async function searchStocks(query) {
    if (!query || query.length < 1) {
        hideDropdown();
        return;
    }

    try {
        const resp = await fetch(`/api/stock/search?q=${encodeURIComponent(query)}`);
        const json = await resp.json();
        // 支援新格式 { status, data } 和舊格式（直接陣列）
        const data = json.data ?? json;
        if (json.status === 'error') {
            showToast(json.message || '搜尋失敗', 'error');
            return;
        }
        currentResults = Array.isArray(data) ? data : [];
        activeIndex = -1;
        renderDropdown(currentResults);
    } catch (err) {
        console.error('搜尋錯誤:', err);
        showToast('搜尋連線失敗，請檢查伺服器', 'error');
    }
}

function renderDropdown(items) {
    if (!items || items.length === 0) {
        dropdown.innerHTML = `
            <div class="autocomplete-item" style="justify-content:center; color:var(--text-muted); cursor:default;">
                找不到符合的股票
            </div>
        `;
        dropdown.classList.add('active');
        return;
    }

    dropdown.innerHTML = items.map((item, i) => `
        <div class="autocomplete-item" data-index="${i}" data-id="${item.stock_id}" data-name="${item.stock_name}">
            <span class="autocomplete-id">${item.stock_id}</span>
            <span class="autocomplete-name">${item.stock_name}</span>
            <span class="autocomplete-category">${item.industry_category || ''}</span>
        </div>
    `).join('');

    dropdown.classList.add('active');

    dropdown.querySelectorAll('.autocomplete-item[data-id]').forEach(el => {
        el.addEventListener('click', () => {
            navigateToStock(el.dataset.id, el.dataset.name);
        });
    });
}

function hideDropdown() {
    dropdown.classList.remove('active');
    activeIndex = -1;
}

function navigateToStock(stockId, stockName) {
    const nameParam = stockName ? `&name=${encodeURIComponent(stockName)}` : '';
    window.location.href = `/stock?id=${stockId}${nameParam}`;
}

// ============================================================
// 事件監聽
// ============================================================

searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        searchStocks(e.target.value.trim());
    }, 300);
});

searchInput.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.autocomplete-item[data-id]');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, items.length - 1);
        updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActiveItem(items);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (activeIndex >= 0 && currentResults[activeIndex]) {
            navigateToStock(currentResults[activeIndex].stock_id, currentResults[activeIndex].stock_name);
        } else if (currentResults.length > 0) {
            navigateToStock(currentResults[0].stock_id, currentResults[0].stock_name);
        }
    } else if (e.key === 'Escape') {
        hideDropdown();
    }
});

function updateActiveItem(items) {
    items.forEach((el, i) => {
        el.classList.toggle('active', i === activeIndex);
    });
    if (items[activeIndex]) {
        items[activeIndex].scrollIntoView({ block: 'nearest' });
    }
}

searchBtn.addEventListener('click', () => {
    const query = searchInput.value.trim();
    if (query) {
        if (/^\d{4,6}$/.test(query)) {
            navigateToStock(query, '');
        } else if (currentResults.length > 0) {
            navigateToStock(currentResults[0].stock_id, currentResults[0].stock_name);
        } else {
            searchStocks(query);
        }
    }
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) hideDropdown();
});

searchInput.addEventListener('focus', () => {
    if (currentResults.length > 0) dropdown.classList.add('active');
});
