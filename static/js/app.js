/**
 * 搜尋首頁邏輯
 * 搜尋、自動完成、自選股、主題切換
 */

const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const dropdown = document.getElementById('autocompleteDropdown');

let debounceTimer = null;
let activeIndex = -1;
let currentResults = [];

// ============================================================
// 通用工具：Toast 通知
// ============================================================

function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

// ============================================================
// 主題切換
// ============================================================

function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
}

function updateThemeIcon(theme) {
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
initTheme();

// ============================================================
// 自選股 (Watchlist)
// ============================================================

function getWatchlist() {
    try {
        return JSON.parse(localStorage.getItem('watchlist') || '[]');
    } catch { return []; }
}

function saveWatchlist(list) {
    localStorage.setItem('watchlist', JSON.stringify(list));
}

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

function isInWatchlist(stockId) {
    return getWatchlist().some(s => s.id === stockId);
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
        const data = await resp.json();
        currentResults = data;
        activeIndex = -1;
        renderDropdown(data);
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
