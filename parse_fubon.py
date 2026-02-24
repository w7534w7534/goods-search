import urllib.request
import json

def fetch_wantgoo_data(stock_id):
    # 玩股網公開的大戶持股 API (有時候不用 token)
    # url: https://www.wantgoo.com/stock/astock/majorinvestor?stockno=2330
    url = f"https://www.wantgoo.com/stock/astock/majorinvestor?stockno={stock_id}"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as res:
            data = json.loads(res.read().decode('utf-8'))
            print("WantGoo data:", len(data))
            if len(data) > 0:
                print("Sample Data:", data[0])
    except Exception as e:
        print(f"Error: {e}")

fetch_wantgoo_data('2330')
