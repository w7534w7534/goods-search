"""
台灣股票資訊查詢工具 — Flask 後端 API 代理
提供搜尋、K線、技術指標、籌碼面、基本面等 API 端點

優化：
- 統一 API 回傳格式 { status, data, message }
- python-dotenv 管理環境變數
- logging 取代 print
- 股票清單記憶體快取（每日更新一次）
- API 響應 TTL 快取（5 分鐘）
- CSV 匯出端點
"""

import logging
import os
import io
import json
from datetime import datetime, timedelta, time as dtime
from threading import Lock

from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
import requests as req
import pandas as pd
import numpy as np
import ta

# 載入 .env 環境變數
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv 未安裝時略過

# ============================================================
# 日誌設定
# ============================================================

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ============================================================
# Flask 應用
# ============================================================

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# FinMind API 設定
FINMIND_API_URL = "https://api.finmindtrade.com/api/v4/data"
FINMIND_TOKEN = os.environ.get("FINMIND_TOKEN", "")


# ============================================================
# 統一回傳格式
# ============================================================

def api_ok(data, **extra):
    """回傳成功格式"""
    result = {"status": "ok", "data": data}
    result.update(extra)
    return jsonify(result)


def api_error(message, status_code=400):
    """回傳錯誤格式"""
    return jsonify({"status": "error", "data": None, "message": message}), status_code


# ============================================================
# 快取系統
# ============================================================

class SimpleCache:
    """簡易 TTL 快取"""
    def __init__(self, maxsize=200, ttl=300):
        self._cache = {}
        self._maxsize = maxsize
        self._ttl = ttl
        self._lock = Lock()

    def get(self, key):
        with self._lock:
            if key in self._cache:
                value, ts = self._cache[key]
                if (datetime.now() - ts).total_seconds() < self._ttl:
                    return value
                del self._cache[key]
            return None

    def set(self, key, value):
        with self._lock:
            # 超過上限時清除最舊的
            if len(self._cache) >= self._maxsize:
                oldest = min(self._cache, key=lambda k: self._cache[k][1])
                del self._cache[oldest]
            self._cache[key] = (value, datetime.now())

# API 快取（5 分鐘 TTL）
api_cache = SimpleCache(maxsize=200, ttl=300)

# 即時報價快取（10 秒 TTL）
realtime_cache = SimpleCache(maxsize=50, ttl=10)

# 股票清單快取（每日更新）
_stock_list_cache = {"data": None, "timestamp": None, "df": None}
_stock_list_lock = Lock()


def get_stock_list():
    """取得股票清單（快取版，每日更新一次）"""
    with _stock_list_lock:
        now = datetime.now()
        if (_stock_list_cache["data"] and _stock_list_cache["timestamp"]
                and (now - _stock_list_cache["timestamp"]).total_seconds() < 86400):
            return _stock_list_cache["data"], _stock_list_cache["df"]

        data = finmind_request_raw("TaiwanStockInfo")
        if data:
            df = pd.DataFrame(data)
            df = df[df['type'].isin(['twse', 'tpex'])]
            _stock_list_cache["data"] = data
            _stock_list_cache["df"] = df
            _stock_list_cache["timestamp"] = now
            logger.info("股票清單已更新，共 %d 檔", len(df))
            return data, df

        return [], pd.DataFrame()


# ============================================================
# 工具函式
# ============================================================

def finmind_request_raw(dataset, data_id=None, start_date=None, end_date=None):
    """直接呼叫 FinMind API（不含快取）"""
    params = {"dataset": dataset}
    if data_id:
        params["data_id"] = data_id
    if start_date:
        params["start_date"] = start_date
    if end_date:
        params["end_date"] = end_date

    headers = {}
    if FINMIND_TOKEN:
        headers["Authorization"] = f"Bearer {FINMIND_TOKEN}"

    try:
        resp = req.get(FINMIND_API_URL, params=params, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        if data.get("msg") == "success" and data.get("data"):
            return data["data"]
        return []
    except Exception as e:
        logger.error("FinMind API 錯誤 [%s]: %s", dataset, e)
        return []


def finmind_request(dataset, data_id=None, start_date=None, end_date=None):
    """帶快取的 FinMind API 請求"""
    cache_key = f"{dataset}:{data_id}:{start_date}:{end_date}"
    cached = api_cache.get(cache_key)
    if cached is not None:
        return cached

    data = finmind_request_raw(dataset, data_id, start_date, end_date)
    if data:
        api_cache.set(cache_key, data)
    return data


def get_default_dates(months=6):
    """取得預設日期區間"""
    end = datetime.now()
    start = end - timedelta(days=months * 30)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def get_stock_name(stock_id):
    """從快取中取得股票名稱"""
    _, df = get_stock_list()
    if df is not None and not df.empty:
        match = df[df['stock_id'] == stock_id]
        if not match.empty:
            return match.iloc[0]['stock_name']
    return ""


def is_trading_hours():
    """判斷目前是否為台股交易時段（週一~週五 9:00~13:30）"""
    now = datetime.now()
    if now.weekday() >= 5:  # 週末
        return False
    return dtime(9, 0) <= now.time() <= dtime(13, 30)


def get_stock_type(stock_id):
    """判斷股票是上市(tse)還是上櫃(otc)"""
    _, df = get_stock_list()
    if df is not None and not df.empty:
        match = df[df['stock_id'] == stock_id]
        if not match.empty:
            t = match.iloc[0].get('type', 'twse')
            return 'otc' if t == 'tpex' else 'tse'
    return 'tse'  # 預設上市


def fetch_twse_realtime(stock_id):
    """從 TWSE/TPEX 取得盤中即時報價"""
    cached = realtime_cache.get(f"realtime:{stock_id}")
    if cached is not None:
        return cached

    ex = get_stock_type(stock_id)
    url = f"https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch={ex}_{stock_id}.tw&json=1&delay=0"
    try:
        # TWSE SSL 憑證在 Python 3.14 下驗證可能失敗，使用 verify=False 繞過
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        resp = req.get(url, timeout=10, verify=False, headers={
            'User-Agent': 'Mozilla/5.0',
            'Referer': 'https://mis.twse.com.tw/stock/fibest.jsp'
        })
        resp.raise_for_status()
        data = resp.json()
        if not data.get('msgArray'):
            return None

        info = data['msgArray'][0]
        # z = 最新成交價, o = 開盤, h = 最高, l = 最低, v = 累計成交量, y = 昨收
        price = _safe_float(info.get('z'))
        if price is None:
            price = _safe_float(info.get('pz'))  # 試用 pz
        if price is None:
            return None

        result = {
            'price': price,
            'open': _safe_float(info.get('o')) or price,
            'high': _safe_float(info.get('h')) or price,
            'low': _safe_float(info.get('l')) or price,
            'volume': int(float(info.get('v', '0').replace(',', ''))) if info.get('v') else 0,
            'yesterday_close': _safe_float(info.get('y')) or price,
            'name': info.get('n', ''),
            'time': info.get('t', ''),
            'is_trading': is_trading_hours(),
        }
        result['change'] = round(result['price'] - result['yesterday_close'], 2)
        yc = result['yesterday_close']
        result['change_pct'] = round(result['change'] / yc * 100, 2) if yc else 0

        realtime_cache.set(f"realtime:{stock_id}", result)
        return result
    except Exception as e:
        logger.error("TWSE 即時 API 錯誤 [%s]: %s", stock_id, e)
        return None


def _safe_float(val):
    """安全轉換浮點數，無效值返回 None"""
    if val is None or val == '-' or val == '':
        return None
    try:
        return float(str(val).replace(',', ''))
    except (ValueError, TypeError):
        return None


# ============================================================
# 靜態頁面路由
# ============================================================

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')


@app.route('/stock')
def stock_page():
    return send_from_directory('static', 'stock.html')


# ============================================================
# API 端點
# ============================================================

@app.route('/api/stock/search')
def stock_search():
    """搜尋股票 — 支援名稱或代號模糊查詢（使用快取）"""
    query = request.args.get('q', '').strip()
    if not query:
        return api_ok([])

    _, df = get_stock_list()
    if df is None or df.empty:
        return api_error("無法取得股票清單", 503)

    mask = (
        df['stock_id'].str.contains(query, case=False, na=False) |
        df['stock_name'].str.contains(query, case=False, na=False)
    )
    results = df[mask].head(20)

    return api_ok(results[['stock_id', 'stock_name', 'industry_category', 'type']].to_dict('records'))


@app.route('/api/stock/realtime')
def stock_realtime():
    """取得盤中即時報價（TWSE/TPEX）"""
    stock_id = request.args.get('id', '')
    if not stock_id:
        return api_error("缺少股票代號")

    data = fetch_twse_realtime(stock_id)
    if not data:
        return api_error("無法取得即時報價（可能非交易時段）", 404)

    return api_ok(data)


@app.route('/api/stock/price')
def stock_price():
    """取得股票 K 線數據"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    if not stock_id:
        return api_error("缺少股票代號")

    if not start_date or not end_date:
        start_date, end_date = get_default_dates(12)

    data = finmind_request("TaiwanStockPrice", data_id=stock_id,
                           start_date=start_date, end_date=end_date)

    # 附加股票名稱
    name = get_stock_name(stock_id)

    return api_ok({"name": name, "data": data})


@app.route('/api/stock/indicators')
def stock_indicators():
    """計算技術指標：RSI, MACD, KD, BB, OBV, MA, VWAP, DMI, W%R"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    if not stock_id:
        return api_error("缺少股票代號")

    if not start_date or not end_date:
        start_date, end_date = get_default_dates(12)

    # 多抓前 120 天用於指標預熱
    warmup_start = (datetime.strptime(start_date, "%Y-%m-%d") - timedelta(days=120)).strftime("%Y-%m-%d")
    data = finmind_request("TaiwanStockPrice", data_id=stock_id,
                           start_date=warmup_start, end_date=end_date)

    if not data:
        return api_error("無法取得股價資料", 404)

    df = pd.DataFrame(data)
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values('date').reset_index(drop=True)

    # realtime=1 時，合併盤中即時數據
    use_realtime = request.args.get('realtime', '0') == '1'
    if use_realtime and is_trading_hours():
        rt = fetch_twse_realtime(stock_id)
        if rt and rt.get('price'):
            today_str = datetime.now().strftime('%Y-%m-%d')
            # 移除可能已存在的今日資料（避免重複）
            df = df[df['date'].dt.strftime('%Y-%m-%d') != today_str]
            today_row = pd.DataFrame([{
                'date': pd.Timestamp(today_str),
                'open': rt['open'],
                'max': rt['high'],
                'min': rt['low'],
                'close': rt['price'],
                'Trading_Volume': rt['volume'],
                'stock_id': stock_id,
            }])
            df = pd.concat([df, today_row], ignore_index=True)
            logger.info("合併盤中數據: %s close=%s vol=%s",
                       stock_id, rt['price'], rt['volume'])

    close = df['close'].astype(float)
    high = df['max'].astype(float)
    low = df['min'].astype(float)
    volume = df['Trading_Volume'].astype(float)

    result = {'date': df['date'].dt.strftime('%Y-%m-%d').tolist()}

    # RSI (14)
    rsi = ta.momentum.RSIIndicator(close, window=14)
    result['rsi'] = rsi.rsi().round(2).tolist()

    # MACD (12, 26, 9)
    macd = ta.trend.MACD(close, window_slow=26, window_fast=12, window_sign=9)
    result['macd'] = macd.macd().round(2).tolist()
    result['macd_signal'] = macd.macd_signal().round(2).tolist()
    result['macd_histogram'] = macd.macd_diff().round(2).tolist()

    # KD (Stochastic, 9, 3)
    stoch = ta.momentum.StochasticOscillator(high, low, close, window=9, smooth_window=3)
    result['k'] = stoch.stoch().round(2).tolist()
    result['d'] = stoch.stoch_signal().round(2).tolist()

    # Bollinger Bands (20, 2)
    bb = ta.volatility.BollingerBands(close, window=20, window_dev=2)
    result['bb_upper'] = bb.bollinger_hband().round(2).tolist()
    result['bb_middle'] = bb.bollinger_mavg().round(2).tolist()
    result['bb_lower'] = bb.bollinger_lband().round(2).tolist()

    # OBV
    obv = ta.volume.OnBalanceVolumeIndicator(close, volume)
    result['obv'] = obv.on_balance_volume().tolist()

    # MA (5, 10, 20, 60, 120)
    for period in [5, 10, 20, 60, 120]:
        ma = ta.trend.SMAIndicator(close, window=period)
        result[f'ma{period}'] = ma.sma_indicator().round(2).tolist()

    # VWAP（20 日滾動）
    typical_price = (high + low + close) / 3
    vwap_window = 20
    vwap = (typical_price * volume).rolling(window=vwap_window, min_periods=1).sum() / \
           volume.rolling(window=vwap_window, min_periods=1).sum()
    result['vwap'] = vwap.round(2).tolist()

    # DMI (14)
    adx_ind = ta.trend.ADXIndicator(high, low, close, window=14)
    result['adx'] = adx_ind.adx().round(2).tolist()
    result['di_plus'] = adx_ind.adx_pos().round(2).tolist()
    result['di_minus'] = adx_ind.adx_neg().round(2).tolist()

    # Williams %R (14)
    wr = ta.momentum.WilliamsRIndicator(high, low, close, lbp=14)
    result['williams_r'] = wr.williams_r().round(2).tolist()

    # BIAS 乖離率 (5, 10, 20)
    for period in [5, 10, 20]:
        ma = ta.trend.SMAIndicator(close, window=period).sma_indicator()
        bias = ((close - ma) / ma * 100).round(2)
        result[f'bias{period}'] = bias.tolist()

    # ATR 真實波幅 (14)
    atr_ind = ta.volatility.AverageTrueRange(high, low, close, window=14)
    result['atr'] = atr_ind.average_true_range().round(2).tolist()

    # 過濾掉預熱期
    dates = result['date']
    start_idx = 0
    for i, d in enumerate(dates):
        if d >= start_date:
            start_idx = i
            break

    filtered_result = {}
    for key, values in result.items():
        filtered_result[key] = values[start_idx:]

    # NaN → null
    for key, values in filtered_result.items():
        if key != 'date':
            filtered_result[key] = [
                None if (isinstance(v, float) and (np.isnan(v) or np.isinf(v))) else v
                for v in values
            ]

    return api_ok(filtered_result)


@app.route('/api/stock/institutional')
def stock_institutional():
    """取得三大法人買賣超資料（含連續買賣超天數）"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    if not stock_id:
        return api_error("缺少股票代號")
    if not start_date or not end_date:
        start_date, end_date = get_default_dates(6)

    data = finmind_request("TaiwanStockInstitutionalInvestorsBuySell",
                           data_id=stock_id, start_date=start_date, end_date=end_date)

    # 計算各法人連續買賣超天數
    consecutive = {}
    if data:
        df = pd.DataFrame(data)
        df['net'] = df['buy'].fillna(0) - df['sell'].fillna(0)
        # FinMind name 可能是中文或英文格式
        name_patterns = {
            '外資': ['外資', 'Foreign'],
            '投信': ['投信', 'Investment_Trust'],
            '自營商': ['自營商', 'Dealer'],
        }
        for display_name, patterns in name_patterns.items():
            pattern = '|'.join(patterns)
            mask = df['name'].str.contains(pattern, na=False)
            sub = df[mask].groupby('date')['net'].sum().sort_index()
            if len(sub) > 0:
                # 從最後一天往回數連續同方向天數
                last_val = sub.iloc[-1]
                direction = 1 if last_val > 0 else (-1 if last_val < 0 else 0)
                count = 0
                for val in reversed(sub.values):
                    if (direction > 0 and val > 0) or (direction < 0 and val < 0):
                        count += 1
                    else:
                        break
                consecutive[display_name] = count * direction  # 正=連買，負=連賣

    return api_ok(data, consecutive=consecutive)


@app.route('/api/stock/shareholding')
def stock_shareholding():
    """取得外資持股比例"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    if not stock_id:
        return api_error("缺少股票代號")
    if not start_date or not end_date:
        start_date, end_date = get_default_dates(6)

    data = finmind_request("TaiwanStockShareholding",
                           data_id=stock_id, start_date=start_date, end_date=end_date)
    return api_ok(data)


@app.route('/api/stock/margin')
def stock_margin():
    """取得融資融券資料（含券資比）"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    if not stock_id:
        return api_error("缺少股票代號")
    if not start_date or not end_date:
        start_date, end_date = get_default_dates(6)

    data = finmind_request("TaiwanStockMarginPurchaseShortSale",
                           data_id=stock_id, start_date=start_date, end_date=end_date)

    # 計算券資比
    if data:
        for row in data:
            margin_bal = row.get('MarginPurchaseTodayBalance') or row.get('MarginPurchaseBalance') or 0
            short_bal = row.get('ShortSaleTodayBalance') or row.get('ShortSaleBalance') or 0
            margin_bal = float(margin_bal) if margin_bal else 0
            short_bal = float(short_bal) if short_bal else 0
            row['short_margin_ratio'] = round(short_bal / margin_bal * 100, 2) if margin_bal > 0 else 0

    return api_ok(data)


@app.route('/api/stock/holders')
def stock_holders():
    """取得股權分散表（大戶持股比例）"""
    stock_id = request.args.get('id', '')
    date = request.args.get('date', '')

    if not stock_id:
        return api_error("缺少股票代號")

    if not date:
        start_date, end_date = get_default_dates(3)
    else:
        start_date = date
        end_date = date

    data = finmind_request("TaiwanStockHoldingSharesPer",
                           data_id=stock_id, start_date=start_date, end_date=end_date)
    return api_ok(data)


@app.route('/api/stock/dividend')
def stock_dividend():
    """取得歷年股利資料"""
    stock_id = request.args.get('id', '')

    if not stock_id:
        return api_error("缺少股票代號")

    # 動態回溯 10 年
    start_10y = (datetime.now() - timedelta(days=3650)).strftime("%Y-%m-%d")
    data = finmind_request("TaiwanStockDividend",
                           data_id=stock_id, start_date=start_10y)
    return api_ok(data)


@app.route('/api/stock/revenue')
def stock_revenue():
    """取得月營收資料"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    if not stock_id:
        return api_error("缺少股票代號")
    if not start_date or not end_date:
        start_date, end_date = get_default_dates(36)

    data = finmind_request("TaiwanStockMonthRevenue",
                           data_id=stock_id, start_date=start_date, end_date=end_date)
    return api_ok(data)


@app.route('/api/stock/financial')
def stock_financial():
    """取得財務報表（EPS, 毛利率等）"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    if not stock_id:
        return api_error("缺少股票代號")
    if not start_date or not end_date:
        start_date, end_date = get_default_dates(36)

    data = finmind_request("TaiwanStockFinancialStatements",
                           data_id=stock_id, start_date=start_date, end_date=end_date)
    return api_ok(data)


@app.route('/api/stock/balance-sheet')
def stock_balance_sheet():
    """取得資產負債表（ROE, ROA, 負債比）"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    if not stock_id:
        return api_error("缺少股票代號")
    if not start_date or not end_date:
        start_date, end_date = get_default_dates(36)

    data = finmind_request("TaiwanStockBalanceSheet",
                           data_id=stock_id, start_date=start_date, end_date=end_date)
    return api_ok(data)


@app.route('/api/stock/per')
def stock_per():
    """取得本益比、本淨比資料"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')

    if not stock_id:
        return api_error("缺少股票代號")
    if not start_date or not end_date:
        start_date, end_date = get_default_dates(3)

    data = finmind_request("TaiwanStockPER",
                           data_id=stock_id, start_date=start_date, end_date=end_date)
    return api_ok(data)


@app.route('/api/stock/export')
def stock_export():
    """匯出股票資料為 CSV"""
    stock_id = request.args.get('id', '')
    start_date = request.args.get('start', '')
    end_date = request.args.get('end', '')
    dataset = request.args.get('type', 'price')

    if not stock_id:
        return api_error("缺少股票代號")
    if not start_date or not end_date:
        start_date, end_date = get_default_dates(6)

    dataset_map = {
        'price': 'TaiwanStockPrice',
        'institutional': 'TaiwanStockInstitutionalInvestorsBuySell',
        'margin': 'TaiwanStockMarginPurchaseShortSale',
    }
    ds = dataset_map.get(dataset, 'TaiwanStockPrice')
    data = finmind_request(ds, data_id=stock_id,
                           start_date=start_date, end_date=end_date)

    if not data:
        return api_error("無資料可匯出", 404)

    df = pd.DataFrame(data)
    output = io.StringIO()
    df.to_csv(output, index=False, encoding='utf-8-sig')
    output.seek(0)

    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename={stock_id}_{dataset}_{start_date}_{end_date}.csv'
        }
    )


# ============================================================
# 啟動伺服器
# ============================================================

if __name__ == '__main__':
    logger.info("🚀 台灣股票資訊查詢工具 — 伺服器啟動中...")
    logger.info("📡 請在瀏覽器開啟 http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)
