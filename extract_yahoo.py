import re
import json

with open('yahoo.html', 'r', encoding='utf-8') as f:
    html = f.read()

m = re.search(r'root\.App\.main = (.*?);\n\}\(this\)\);', html, re.DOTALL)
if m:
    try:
        data = json.loads(m.group(1))
        # Look for major holders data
        stores = data.get('context', {}).get('dispatcher', {}).get('stores', {})
        for store_name, store_data in stores.items():
            if 'majorHolder' in store_name.lower() or 'chip' in store_name.lower() or 'quote' in store_name.lower():
                print(f"--- {store_name} ---")
                print(str(store_data)[:500])
        # Find any keys with "major" or "holder"
        def find_keys(d, target, path=""):
            if isinstance(d, dict):
                for k, v in d.items():
                    if target in str(k).lower():
                        print(f"Found {target} at {path}.{k}")
                    find_keys(v, target, path + "." + str(k))
            elif isinstance(d, list):
                for i, v in enumerate(d):
                    find_keys(v, target, path + f"[{i}]")
        
        find_keys(stores, 'major')
    except Exception as e:
        print("Error parsing JSON:", e)
else:
    print("Not found")
