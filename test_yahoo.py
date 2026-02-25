import requests
from bs4 import BeautifulSoup

def fetch_yahoo_major_holders(stock_id):
    url = f"https://tw.stock.yahoo.com/quote/{stock_id}/major-holders"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'}
    
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        lis = soup.find_all('li', class_='List(n)')
        
        result = []
        for li in lis:
            row_div = li.find('div', class_=lambda x: x and 'table-row' in x)
            if row_div:
                cols = row_div.find_all('div', recursive=False)
                if len(cols) >= 5:
                    date_str = cols[0].text.strip()
                    # columns: Date, Major(>400/1000?), Director+Major?, Retail(<10), Total Holders
                    # the labels from the page: 日期, <xxx>張以上比例(如1000張以上大戶), 董監持股(外資不一定有? 這個數字 86.34% 其實是 董監及大戶持股?), 總股東數
                    # Let's check what these percentages actually are from the header
                    # actually we just take them
                    col1 = cols[1].text.strip().replace('%', '')
                    col2 = cols[2].text.strip().replace('%', '') # 董監及大戶
                    col3 = cols[3].text.strip().replace('%', '') # 散戶
                    total_holders = cols[4].text.strip().replace(',', '')
                    
                    if date_str == '' or col1 == '-': continue
                    
                    result.append({
                        'date': date_str.replace('/', '-'), # YYYY-MM-DD
                        'foreign_ratio': 0, # later fill with TWSE finmind data
                        'major_ratio': float(col1) if col1 else 0,
                        'director_major_ratio': float(col2) if col2 else 0,
                        'retail_ratio': float(col3) if col3 else 0,
                    })

        return result
    except Exception as e:
        print("Error:", e)
        return []

print(fetch_yahoo_major_holders('2330')[:3])
