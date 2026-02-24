import urllib.request
from bs4 import BeautifulSoup
import json
import traceback

def fetch_cnyes_holders(stock_id):
    # 鉅亨網大戶持股 API
    url = f"https://ws.api.cnyes.com/ws/api/v1/charting/history?symbol=TWS:{stock_id}:STOCK&resolution=1D&quote=1"
    url2 = f"https://ws.api.cnyes.com/ws/api/v1/charting/history?symbol=TWS:{stock_id}:STOCK&resolution=W&quote=1&indicators=ChipConcentration"
    
    # 鉅亨網的 API 通常可以直接打
    try:
        req = urllib.request.Request(url2, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as res:
            data = json.loads(res.read().decode('utf-8'))
            print("CNYES Keys:", data.keys())
            if 'data' in data:
                print("CNYES Data keys:", data['data'].keys())
    except Exception as e:
        traceback.print_exc()

fetch_cnyes_holders('2330')
