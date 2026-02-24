/**
 * 共用模組 — Toast 通知、主題切換、自選股管理
 * 此檔案由 index.html 和 stock.html 共同引入，避免重複程式碼
 */

// ============================================================
// Toast 通知
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

function isInWatchlist(stockId) {
    return getWatchlist().some(s => s.id === stockId);
}

// ============================================================
// 數字格式化
// ============================================================

function formatNumber(num) {
    if (num == null) return '—';
    if (Math.abs(num) >= 1e8) return (num / 1e8).toFixed(2) + ' 億';
    if (Math.abs(num) >= 1e4) return (num / 1e4).toFixed(1) + ' 萬';
    return num.toLocaleString();
}
