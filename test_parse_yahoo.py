import urllib.request
import urllib.error
from bs4 import BeautifulSoup
import re
import json

def get_yahoo_holders():
    url = "https://tw.stock.yahoo.com/quote/2330/holding-shares"
    headers = {"User-Agent": "Mozilla/5.0"}
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            html = response.read().decode('utf-8')
            soup = BeautifulSoup(html, "html.parser")
            scripts = soup.find_all("script")
            for s in scripts:
                if s.string and "root.App.main" in s.string:
                    # 擷取 root.App.main = {...}; 裡面的 JSON
                    match = re.search(r'root\.App\.main\s*=\s*(\{.*?\});', s.string)
                    if match:
                        data = json.loads(match.group(1))
                        print("Keys in data:", data.keys())
                        
                        # 看看 context 裡面有沒有 state
                        if 'context' in data and 'dispatcher' in data['context']:
                            dispatch = data['context']['dispatcher']
                            if 'stores' in dispatch and 'HoldingSharesStore' in dispatch['stores']:
                                print("Found HoldingSharesStore")
                    break
    except Exception as e:
        print(e)
        
get_yahoo_holders()
