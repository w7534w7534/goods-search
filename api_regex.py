import re
html = open('yahoo.html', encoding='utf-8').read()
matches = re.findall(r'/api/resource/[a-zA-Z0-9_.;=]+', html)
for m in set(matches):
    print(m)
