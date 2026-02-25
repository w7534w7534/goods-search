/**
 * static/js/watchlist.js
 * 負責操作 LocalStorage 中的自選股清單
 */

const WATCHLIST_KEY = 'user_watchlist';
// 預設名單 (台灣 50 重要權值股範例)
const DEFAULT_WATCHLIST = ['2330', '2317', '2454', '2308', '2881', '2882', '2412'];

const WatchlistDB = {
    /**
     * 讀取使用者的自選股陣列
     */
    get: function () {
        const data = localStorage.getItem(WATCHLIST_KEY);
        if (!data) {
            this.save(DEFAULT_WATCHLIST);
            return DEFAULT_WATCHLIST;
        }
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error('解析自選股失敗', e);
            return DEFAULT_WATCHLIST;
        }
    },

    /**
     * 寫入陣列到 LocalStorage
     */
    save: function (list) {
        // 確保為唯一且字串、無空值
        const uniqueList = [...new Set(list)].filter(Boolean).map(String);
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(uniqueList));
    },

    /**
     * 新增一檔或多檔股票
     */
    add: function (stockId) {
        const list = this.get();
        if (Array.isArray(stockId)) {
            stockId.forEach(id => {
                if (!list.includes(String(id))) list.push(String(id));
            });
        } else {
            if (!list.includes(String(stockId))) list.push(String(stockId));
        }
        this.save(list);
    },

    /**
     * 移除一檔股票
     */
    remove: function (stockId) {
        const list = this.get();
        const newList = list.filter(id => id !== String(stockId));
        this.save(newList);
    },

    /**
     * 檢查是否在自選名單中
     */
    has: function (stockId) {
        const list = this.get();
        return list.includes(String(stockId));
    },

    /**
     * 恢復預設
     */
    reset: function () {
        this.save(DEFAULT_WATCHLIST);
    }
};

window.WatchlistDB = WatchlistDB;
