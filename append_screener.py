code = """
# ============================================================
# 自訂多空選股掃描 (Screener)
# ============================================================
from concurrent.futures import ThreadPoolExecutor

def analyze_single_stock(stock_id, conditions):
    \"\"\"分析單檔股票是否符合自訂條件\"\"\"
    try:
        # 由於需要MA20跟MACD，至少往前抓120天以上確保均線正確
        start_date = (datetime.now() - timedelta(days=120)).strftime('%Y-%m-%d')
        end_date = datetime.now().strftime('%Y-%m-%d')
        
        # 取得歷史價格 (使用 FinMind)
        hist = finmind_request("TaiwanStockPrice", data_id=stock_id, start_date=start_date, end_date=end_date)
        
        if not hist or len(hist) < 20: 
            return None # 資料不足

        # 將價格資料送去計算指標
        ind_data = calculate_indicators(hist)
        
        if not ind_data or len(ind_data.get('k', [])) < 1:
            return None
        
        # 取最後一天的數據做判斷
        last_idx = -1
        last_price = float(hist[-1]['close'])
        
        # 找出最後一個有值的 MA20
        ma20_list = ind_data.get('ma20', [])
        ma20 = ma20_list[-1] if len(ma20_list) > 0 else 0
        
        # KD 值
        k_list = ind_data.get('k', [])
        d_list = ind_data.get('d', [])
        k = k_list[-1] if len(k_list) > 0 else 0
        d = d_list[-1] if len(d_list) > 0 else 0
        prev_k = k_list[-2] if len(k_list) > 1 else 0
        prev_d = d_list[-2] if len(d_list) > 1 else 0
        
        # MACD
        hist_list = ind_data.get('macd_hist', [])
        macd_hist = hist_list[-1] if len(hist_list) > 0 else 0

        # 套用條件過濾
        match = True
        for cond in conditions:
            if cond == 'price_above_ma20':
                if not (last_price > ma20 and ma20 > 0): match = False
            elif cond == 'price_below_ma20':
                if not (last_price < ma20 and ma20 > 0): match = False
            elif cond == 'kd_golden_cross':
                if not (prev_k < prev_d and k >= d): match = False
            elif cond == 'kd_death_cross':
                if not (prev_k > prev_d and k <= d): match = False
            elif cond == 'macd_histogram_positive':
                if not (macd_hist > 0): match = False
                
        if match:
            return {
                "stock_id": stock_id,
                "stock_name": get_stock_name(stock_id),
                "close": last_price,
                "ma20": ma20,
                "k": k,
                "d": d,
                "macd_hist": macd_hist
            }
        return None
    except Exception as e:
        print(f"分析 {stock_id} 發生錯誤: {e}")
        return None

@app.route('/api/stock/screen', methods=['POST'])
def stock_screen():
    \"\"\"平行掃描多檔股票是否符合技術面條件\"\"\"
    data = request.get_json(silent=True) or {}
    stock_ids = data.get('stock_ids', [])
    conditions = data.get('conditions', [])
    
    if not stock_ids:
        return api_error("未提供待掃描股票代碼")
    if not conditions:
        return api_ok([]) # 無條件直接回傳空陣列

    results = []
    # 使用 ThreadPoolExecutor 平行發送查詢，加速多檔股票的過濾
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(analyze_single_stock, sid, conditions) for sid in stock_ids]
        for f in futures:
            res = f.result()
            if res:
                results.append(res)
                
    return api_ok(results)

if __name__ == '__main__':
    # 確保 app.run 位於真正檔案結尾之前被取代或保留
    pass
"""
import re
with open("f:/STO/goods-search/server.py", "r", encoding="utf-8") as f:
    original = f.read()

# 移除原本的 if __name__ == '__main__': 啟動區塊
original = re.sub(r"if __name__ == '__main__':[\s\S]*?(?=\Z)", "", original)

with open("f:/STO/goods-search/server.py", "w", encoding="utf-8") as f:
    f.write(original.strip() + "\n\n" + code + "\n\nif __name__ == '__main__':\n    print('啟動後端 API 伺服器，運行於 http://127.0.0.1:5001')\n    app.run(host='0.0.0.0', port=5001, debug=True, threaded=True)\n")
