/**
 * 共用 API Wrapper
 * 負責處理所有的 fetch 請求，並在發生錯誤時透過 Toast 顯示錯誤訊息
 */

async function fetchAPI(url, options = {}) {
    // 支援直接傳遞 options 或相容原本可能的傳入結構
    const fetchOptions = {
        method: options.method || 'GET',
        headers: options.headers || {}
    };
    if (options.body) fetchOptions.body = options.body;

    const retries = options.retries || 0;
    const fullResponse = options.fullResponse || false;
    const throwOnError = options.throwOnError !== false; // 預設會 throw

    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url, fetchOptions);
            if (!res.ok) {
                throw new Error(`伺服器連線異常 (${res.status})`);
            }

            let data;
            try {
                data = await res.json();
            } catch (e) {
                throw new Error('無效的回應格式');
            }

            // 判斷業務邏輯的狀態碼
            if (data && data.status && data.status === 'error') {
                throw new Error(data.message || 'API 錯誤');
            }

            if (fullResponse) return data;
            return data.data !== undefined ? data.data : data;

        } catch (error) {
            if (i < retries) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            console.error(`[API Error] ${url}:`, error);

            if (typeof showToast === 'function') {
                showToast(error.message || '發生未知錯誤，請稍後再試', 'error');
            }

            if (throwOnError) {
                throw error;
            } else {
                return null;
            }
        }
    }
}
