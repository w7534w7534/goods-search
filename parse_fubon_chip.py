import urllib.request
import json
import traceback

def fetch_tdcc_fallback(stock_id):
    # 最後測試一個來源 - 台灣股市資訊網 (如果用 selenium 太慢，我們用 proxy 或偽裝?)
    # 但沒有真實 API。
    # 決定：改寫 server.py 讓 `/api/stock/holders` 回傳空資料並加上 `"message": "目前大戶持股 API 暫停服務 (FinMind 限制)"`
    # 同時在前端實作「籌碼集中度」的替代圖表（利用現有三大法人或主力買賣超計算簡單集中度）
    pass

