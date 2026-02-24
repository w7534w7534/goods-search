import urllib.request
import pandas as pd
import io

def fetch_tdcc():
    url = "https://smart.tdcc.com.tw/opendata/getOD.ashx?id=1-5"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    print("Requesting TDCC Opendata...")
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            csv_data = res.read().decode('utf-8', errors='ignore')
            print(f"Downloaded: {len(csv_data)} bytes")
            df = pd.read_csv(io.StringIO(csv_data))
            target = df[df['證券代號'].astype(str) == '2330']
            if not target.empty:
                print(target.head())
    except Exception as e:
        print("Error:", e)

fetch_tdcc()
