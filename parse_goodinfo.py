import urllib.request
import traceback
from bs4 import BeautifulSoup
import re

def fetch_goodinfo_holders(stock_id):
    url = f"https://goodinfo.tw/tw/StockPosPart.asp?STOCK_ID={stock_id}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    }
    
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as res:
            html = res.read().decode('utf-8')
            soup = BeautifulSoup(html, 'html.parser')
            
            # 尋找 table id="tblDetail"
            table = soup.find('table', id='tblDetail')
            if not table:
                print("Table 'tblDetail' not found")
                return None
            
            trs = table.find_all('tr', class_=re.compile(r'bg_w|bg_h1'))
            results = []
            
            for tr in trs:
                tds = tr.find_all('td')
                if len(tds) < 15:
                    continue
                
                # Goodinfo 股權分散表欄位 (根據經驗)：
                # 0: 週別, 1: 統計日期, 2: 收盤價, 3: 漲跌, 4: 漲跌幅
                # 5-8: 人數相關, 9-10: 400張以上比例, 11-12: 800張以上比例, 13-14: 1000張以上比例
                # => 我們要確認真正的欄位對應
                
                week = tds[0].get_text(strip=True)
                date_str = tds[1].get_text(strip=True)
                close_price = tds[2].get_text(strip=True)
                
                # 直接印出前幾行的內容來確認 index
                row_data = [td.get_text(strip=True) for td in tds]
                print(f"Row: {row_data}")
                break
                
    except Exception as e:
        traceback.print_exc()

fetch_goodinfo_holders('2330')
