import urllib.request
import json
import traceback

def fetch_cnyes_chip(stock_id):
    url = f"https://ws.api.cnyes.com/ws/api/v1/charting/history?symbol=TWS:{stock_id}:STOCK&resolution=W&quote=1"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as res:
            data = json.loads(res.read().decode('utf-8'))
            if 'data' in data:
                print("CNYES Keys:", data['data'].keys())
    except Exception as e:
        traceback.print_exc()

fetch_cnyes_chip('2330')
